(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 540, TILE = 30, WORLD_W = 160, WORLD_H = 40;
  const blocks = { air:0, grass:1, dirt:2, stone:3, wood:4, leaves:5, plank:6 };
  const names = {1:'Grass',2:'Dirt',3:'Stone',4:'Oak wood',5:'Leaves',6:'Planks'};
  const colors = {1:'#61b75b',2:'#9a6848',3:'#727e83',4:'#98623b',5:'#4c9e53',6:'#c18a51'};
  let world = Array.from({length:WORLD_H},()=>Array(WORLD_W).fill(0));
  let heights = [], treeAt = [];
  let inventory = [Infinity,18,8,7,0,0];
  let selected = 1, started = false, keys = {}, mouse = {x:480,y:260,down:false,place:false,known:false};
  let camera = {x:0,y:0};
  let time = 0, day = 1, last = performance.now(), mineTimer = 0, toastTimer = 0;
  let player = {x:7*TILE,y:0,w:20,h:39,vx:0,vy:0,ground:false,face:1,walk:0};
  let terrainSeed = 12842;
  const rand = (x,y=0) => { let n = Math.sin(x*127.1+y*311.7+terrainSeed)*43758.5453; return n-Math.floor(n); };
  const hash2 = (x,y) => rand(x,y);

  function generateWorld(){
    let h=12;
    for(let x=0;x<WORLD_W;x++){
      h += (rand(x,3)-.48)*.8;
      if(x%17===0) h += (rand(x,8)-.5)*2;
      h=Math.max(9,Math.min(15,h)); heights[x]=Math.round(h);
      for(let y=heights[x];y<WORLD_H;y++){
        if(y===heights[x]) world[y][x]=blocks.grass;
        else if(y<heights[x]+4) world[y][x]=blocks.dirt;
        else world[y][x]=rand(x,y)>.17?blocks.stone:blocks.dirt;
      }
      if(x>4 && x<WORLD_W-4 && rand(x,20)>.91 && Math.abs(heights[x]-heights[x-1])<2) treeAt.push(x);
    }
    treeAt=treeAt.filter(x=>x>14);
    for(const x of treeAt){
      const ground=heights[x];
      for(let i=1;i<=4;i++) world[ground-i][x]=blocks.wood;
      for(let dy=-6;dy<=-3;dy++) for(let dx=-2;dx<=2;dx++){
        if(Math.abs(dx)+Math.max(0,Math.abs(dy+4)-1)<4 && world[ground+dy]?.[x+dx]===0) world[ground+dy][x+dx]=blocks.leaves;
      }
      if(world[ground-5]?.[x]) world[ground-5][x]=blocks.leaves;
    }
  }
  generateWorld();
  player.y=(heights[7]-1)*TILE-player.h;
  const SAVE_KEY='pocket-worlds-greenhollow-v1';
  try {
    const saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
    if(saved&&saved.grid&&saved.grid.length===WORLD_W*WORLD_H){
      for(let y=0;y<WORLD_H;y++)for(let x=0;x<WORLD_W;x++)world[y][x]=Number(saved.grid[y*WORLD_W+x])||0;
      if(Array.isArray(saved.inventory)&&saved.inventory.length===6)inventory=saved.inventory.map((n,i)=>n===null&&i===0?Infinity:(Number(n)||0));
      if(Number.isFinite(saved.x))player.x=Math.max(0,Math.min(WORLD_W*TILE-player.w,saved.x));
      if(Number.isFinite(saved.y))player.y=saved.y;
      if(Number.isFinite(saved.day))day=Math.max(1,saved.day);
      document.getElementById('dayNum').textContent=String(day).padStart(2,'0');
    }
  } catch (_) { /* A damaged save should never prevent a new world from loading. */ }
  function saveGame(){
    try{localStorage.setItem(SAVE_KEY,JSON.stringify({grid:world.flat().join(''),inventory:inventory.map(n=>n===Infinity?null:n),x:player.x,y:player.y,day}));}catch(_){/* Storage can be unavailable in private browsing. */}
  }
  window.addEventListener('beforeunload',saveGame);
  setInterval(saveGame,4000);

  function makeHotbar(){
    const bar=document.getElementById('hotbar'); bar.innerHTML='';
    const labels=['⛏','▰','▦','◆','♣','▤'];
    for(let i=0;i<6;i++){
      const slot=document.createElement('button'); slot.className='slot'+(i===selected?' selected':'');slot.setAttribute('aria-label',i===0?'Pickaxe':names[i]||'Block');
      slot.innerHTML=`<span class="key">${i+1}</span><canvas width="24" height="24"></canvas><span class="count" id="count${i}">${inventory[i]===Infinity?'':inventory[i]}</span>`;
      slot.addEventListener('click',()=>selectSlot(i));bar.appendChild(slot);
      drawIcon(slot.querySelector('canvas'),i);
    }
  }
  function drawIcon(el,i){
    const c=el.getContext('2d'); c.clearRect(0,0,24,24);
    if(i===0){c.strokeStyle='#c9d8e0';c.lineWidth=3;c.beginPath();c.moveTo(9,8);c.lineTo(17,19);c.stroke();c.fillStyle='#8499a8';c.fillRect(4,4,13,5);c.fillStyle='#e7f2f5';c.fillRect(4,4,9,2);return;}
    let col=colors[i]||'#fff'; c.fillStyle=col;c.fillRect(3,4,18,17);c.fillStyle='#ffffff33';c.fillRect(3,4,18,4);c.fillStyle='#00000020';c.fillRect(15,8,6,13);
    for(let n=0;n<6;n++){c.fillStyle=hash2(n,i)>.5?'#ffffff22':'#00000018';c.fillRect(4+Math.floor(hash2(n,i+2)*16),8+Math.floor(hash2(n+9,i)*12),2,2);}
  }
  function selectSlot(i){selected=Math.max(0,Math.min(5,i));document.querySelectorAll('.slot').forEach((e,n)=>e.classList.toggle('selected',n===selected));}
  function setCount(i,n){inventory[i]=n;let e=document.getElementById('count'+i);if(e)e.textContent=n===Infinity?'':n;}
  makeHotbar();

  function blockAt(tx,ty){if(tx<0||tx>=WORLD_W||ty<0||ty>=WORLD_H)return blocks.stone;return world[ty][tx];}
  function setBlock(tx,ty,id){if(tx>=0&&tx<WORLD_W&&ty>=0&&ty<WORLD_H)world[ty][tx]=id;}
  function notice(text){const e=document.getElementById('toast');e.textContent=text;e.classList.add('show');toastTimer=1.65;}
  function pointerWorld(){return {x:Math.floor((mouse.x+camera.x)/TILE),y:Math.floor((mouse.y+camera.y)/TILE)};}
  function withinReach(tx,ty){const px=player.x+player.w/2,py=player.y+player.h/2;return Math.hypot((tx+.5)*TILE-px,(ty+.5)*TILE-py)<TILE*5.2;}
  function actMine(){
    if(!mouse.down||!started)return;
    const p=pointerWorld(), id=blockAt(p.x,p.y);
    if(!id||!withinReach(p.x,p.y))return;
    mineTimer-=1/60;
    if(mineTimer<=0){
      setBlock(p.x,p.y,0);
      let slot=id===blocks.grass?1:id===blocks.dirt?1:id===blocks.stone?2:id===blocks.wood?3:id===blocks.leaves?4:5;
      setCount(slot,inventory[slot]+1);
      document.getElementById('xp').textContent=Number(document.getElementById('xp').textContent)+1;
      notice(`${names[id]} collected`);mineTimer=.3;
    }
  }
  function placeBlock(){
    if(!started)return;
    const p=pointerWorld(), id=selected===0?0:selected+1;
    if(selected===0){notice('Select a block to build');return;}
    if(inventory[selected]<=0){notice('Out of '+(names[id]||'blocks'));return;}
    if(blockAt(p.x,p.y)!==0||!withinReach(p.x,p.y))return;
    const r={x:p.x*TILE,y:p.y*TILE,w:TILE,h:TILE};
    if(player.x<r.x+r.w&&player.x+player.w>r.x&&player.y<r.y+r.h&&player.y+player.h>r.y){notice('There is no room there');return;}
    setBlock(p.x,p.y,id);setCount(selected,inventory[selected]-1);notice((names[id]||'Block')+' placed');
  }
  function screenPoint(e){const r=canvas.getBoundingClientRect();mouse.x=(e.clientX-r.left)*W/r.width;mouse.y=(e.clientY-r.top)*H/r.height;mouse.known=true;}
  canvas.addEventListener('pointermove',screenPoint);
  canvas.addEventListener('pointerdown',e=>{screenPoint(e);canvas.setPointerCapture(e.pointerId);if(e.button===2){e.preventDefault();placeBlock();}else{mouse.down=true;mineTimer=0;actMine();}});
  canvas.addEventListener('pointerup',e=>{if(e.button===0)mouse.down=false;});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{selectSlot((selected+(e.deltaY>0?1:5))%6);e.preventDefault();},{passive:false});
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if([' ','arrowleft','arrowright','arrowup'].includes(k))e.preventDefault();if(k>='1'&&k<='6')selectSlot(Number(k)-1);if(k==='f'){if(!document.fullscreenElement)document.querySelector('.game-frame').requestFullscreen?.();else document.exitFullscreen?.();}});
  window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  document.getElementById('playBtn').addEventListener('click',()=>{started=true;document.getElementById('startScreen').classList.add('dismissed');notice('Welcome to Greenhollow');});
  document.getElementById('helpBtn').addEventListener('click',()=>document.getElementById('helpModal').classList.remove('hidden'));
  document.getElementById('closeHelp').addEventListener('click',()=>document.getElementById('helpModal').classList.add('hidden'));
  document.getElementById('helpModal').addEventListener('click',e=>{if(e.target.id==='helpModal')e.currentTarget.classList.add('hidden');});
  document.getElementById('soundBtn').addEventListener('click',e=>{e.currentTarget.classList.toggle('muted');notice(e.currentTarget.classList.contains('muted')?'Sound off':'Sound on');});
  document.querySelectorAll('[data-key]').forEach(b=>{const key=b.dataset.key;const on=e=>{e.preventDefault();keys[key]=true},off=e=>{e.preventDefault();keys[key]=false};b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointerleave',off);b.addEventListener('pointercancel',off);});
  document.querySelector('[data-action="mine"]').addEventListener('pointerdown',e=>{e.preventDefault();mouse.down=true;mineTimer=0;});
  for(const name of ['pointerup','pointercancel','pointerleave'])document.querySelector('[data-action="mine"]').addEventListener(name,()=>mouse.down=false);
  document.querySelector('[data-action="place"]').addEventListener('pointerdown',e=>{e.preventDefault();placeBlock();});

  function update(dt){
    time+=dt;if(time>150){time=0;day++;document.getElementById('dayNum').textContent=String(day).padStart(2,'0');}
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)document.getElementById('toast').classList.remove('show');}
    const left=keys.a||keys.arrowleft,right=keys.d||keys.arrowright,jump=keys.w||keys[' ']||keys.arrowup;
    player.vx=(right?1:0)-(left?1:0);if(player.vx)player.face=Math.sign(player.vx);player.vx*=180;player.walk+=Math.abs(player.vx)*dt*.04;
    if(jump&&player.ground){player.vy=-410;player.ground=false;}
    player.vy=Math.min(620,player.vy+1000*dt);
    // Horizontal movement and tile collisions
    player.x+=player.vx*dt;
    if(player.vx){const tx=player.vx>0?Math.floor((player.x+player.w)/TILE):Math.floor(player.x/TILE);for(let y=Math.floor(player.y/TILE);y<=Math.floor((player.y+player.h-1)/TILE);y++)if(blockAt(tx,y)){player.x=player.vx>0?tx*TILE-player.w:(tx+1)*TILE;break;}}
    player.y+=player.vy*dt;player.ground=false;
    if(player.vy>=0){const ty=Math.floor((player.y+player.h)/TILE);for(let x=Math.floor(player.x/TILE);x<=Math.floor((player.x+player.w-1)/TILE);x++)if(blockAt(x,ty)){player.y=ty*TILE-player.h;player.vy=0;player.ground=true;break;}}
    else{const ty=Math.floor(player.y/TILE);for(let x=Math.floor(player.x/TILE);x<=Math.floor((player.x+player.w-1)/TILE);x++)if(blockAt(x,ty)){player.y=(ty+1)*TILE;player.vy=0;break;}}
    player.x=Math.max(0,Math.min(WORLD_W*TILE-player.w,player.x));
    const maxCamX=WORLD_W*TILE-W, targetX=Math.max(0,Math.min(maxCamX,player.x+player.w/2-W*.45));
    camera.x+=(targetX-camera.x)*Math.min(1,dt*5);camera.y=0;
    document.getElementById('coord').textContent='X: '+String(Math.floor(player.x/TILE)).padStart(3,'0');
    if(mouse.down)actMine();
  }
  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
  function drawSky(){
    const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#72c6ec');grad.addColorStop(.55,'#b3e8ec');grad.addColorStop(1,'#e1f4d2');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    // hazy sun
    ctx.fillStyle='#fff5c3';ctx.beginPath();ctx.arc(754-camera.x*.035,100,34,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff9d377';ctx.beginPath();ctx.arc(754-camera.x*.035,100,51,0,Math.PI*2);ctx.fill();
    for(let layer=0;layer<2;layer++){
      let factor=layer?.17:.09, base=layer?292:259, color=layer?'#9bd4cb':'#b0e1d5';ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,H);
      for(let x=0;x<=W+20;x+=20){const wx=(x+camera.x*factor)/120;const y=base+Math.sin(wx*.85+layer)*22+Math.sin(wx*1.7)*10;ctx.lineTo(x,y);}
      ctx.lineTo(W,H);ctx.closePath();ctx.fill();
      if(layer===0){for(let i=0;i<9;i++){let x=((i*151-camera.x*.12)%(W+180)+W+180)%(W+180)-80;let y=65+(i%4)*34;drawCloud(x,y,1+(i%3)*.2);}}
    }
  }
  function drawCloud(x,y,s){ctx.fillStyle='#f4ffff88';ctx.fillRect(x,y+8*s,48*s,12*s);ctx.fillRect(x+10*s,y,15*s,18*s);ctx.fillRect(x+24*s,y+3*s,18*s,17*s);ctx.fillStyle='#fff9';ctx.fillRect(x+4*s,y+10*s,37*s,5*s);}
  function drawTile(id,x,y,tx,ty){
    const px=x*TILE-camera.x,py=y*TILE-camera.y;
    if(id===blocks.grass){rect(px,py,TILE,TILE,'#9b6949');rect(px,py,TILE,8,'#58b755');rect(px,py+7,TILE,3,'#83d264');rect(px,py+10,TILE,2,'#477e42');}
    else if(id===blocks.dirt){rect(px,py,TILE,TILE,'#966647');rect(px,py,TILE,3,'#ad7953');}
    else if(id===blocks.stone){rect(px,py,TILE,TILE,'#747f83');rect(px,py,TILE,3,'#909b9b');}
    else if(id===blocks.wood){rect(px,py,TILE,TILE,'#93603b');rect(px+6,py,TILE-12,TILE,'#ad7946');rect(px+7,py,2,TILE,'#d19a5e');rect(px+21,py,2,TILE,'#75472e');}
    else if(id===blocks.leaves){rect(px,py,TILE,TILE,'#438e4c');rect(px+3,py+4,10,7,'#69b961');rect(px+17,py+17,8,8,'#347747');}
    else if(id===blocks.plank){rect(px,py,TILE,TILE,'#bf8952');rect(px,py+2,TILE,2,'#dda96a');rect(px,py+15,TILE,2,'#8e623f');rect(px+15,py,2,15,'#9e7148');rect(px+7,py+17,2,13,'#d4a266');}
    // block face bevel and individual pixel flecks
    if(id!==blocks.grass&&id!==blocks.wood&&id!==blocks.leaves&&id!==blocks.plank){rect(px,py,TILE,2,'#ffffff14');}
    for(let n=0;n<3;n++){let r=hash2(tx*5+n,ty*8+n);let c=id===blocks.stone?'#ffffff18':id===blocks.grass?'#3f8d3c44':'#412c2344';ctx.fillStyle=c;ctx.fillRect(px+3+Math.floor(r*22),py+9+Math.floor(hash2(n,tx+ty)*17),2,2);}
    rect(px,py,TILE,1,'#efffd326');rect(px,py+TILE-1,TILE,1,'#12233321');
  }
  function drawPlayer(){
    let x=Math.round(player.x-camera.x),y=Math.round(player.y-camera.y), bob=player.ground&&Math.abs(player.vx)>0?Math.sin(player.walk)*2:0;
    // shadow
    ctx.fillStyle='#183d3970';ctx.beginPath();ctx.ellipse(x+10,y+39,13,3,0,0,Math.PI*2);ctx.fill();
    // legs
    rect(x+4,y+27+bob,5,11,'#385779');rect(x+12,y+27-bob,5,11,'#29415f');rect(x+3,y+36+bob,7,3,'#493b34');rect(x+11,y+36-bob,7,3,'#493b34');
    // body
    rect(x+3,y+13,14,15,'#d77b4d');rect(x+3,y+13,14,4,'#f1a06a');rect(x+6,y+19,3,2,'#f7ca87');
    // head and hair
    rect(x+3,y+1,14,14,'#e6aa77');rect(x+2,y,16,5,'#563c35');rect(x+2,y+2,4,7,'#563c35');
    // face orientation
    let ex=player.face>0?12:5;rect(x+ex,y+7,2,3,'#263b4c');rect(x+(player.face>0?14:4),y+11,3,1,'#9d5a4c');
    // little tool glint
    if(selected===0){ctx.strokeStyle='#e6eceb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+(player.face>0?18:2),y+22);ctx.lineTo(x+(player.face>0?23:0),y+15);ctx.stroke();ctx.fillStyle='#a5bbc4';ctx.fillRect(x+(player.face>0?20:0),y+12,7,3);}
  }
  function render(){
    drawSky();
    // distant floating grass motes
    for(let i=0;i<22;i++){let x=(i*59-camera.x*.3)%(W+20);ctx.fillStyle='#f5ffc744';ctx.fillRect(x,150+(i*47)%180,2,2);}
    let startX=Math.max(0,Math.floor(camera.x/TILE)),endX=Math.min(WORLD_W,Math.ceil((camera.x+W)/TILE)+1);
    for(let y=0;y<WORLD_H;y++)for(let x=startX;x<endX;x++){const id=world[y][x];if(id)drawTile(id,x,y,x,y);}
    drawPlayer();
    if(started&&mouse.known){const p=pointerWorld(),id=blockAt(p.x,p.y),sx=p.x*TILE-camera.x,sy=p.y*TILE-camera.y;const ok=withinReach(p.x,p.y);
      if(p.x>=0&&p.x<WORLD_W&&p.y>=0&&p.y<WORLD_H){ctx.strokeStyle=ok?'#f5fff0dd':'#ffb8a499';ctx.lineWidth=2;ctx.strokeRect(Math.round(sx)+1,Math.round(sy)+1,TILE-2,TILE-2);if(mouse.down&&id&&ok){ctx.fillStyle='#172c2440';ctx.fillRect(sx,sy,TILE,TILE);ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(sx+7,sy+8);ctx.lineTo(sx+23,sy+22);ctx.moveTo(sx+22,sy+7);ctx.lineTo(sx+9,sy+24);ctx.stroke();}}
    }
    // subtle screen scanline / vignette
    const v=ctx.createRadialGradient(W/2,H/2,150,W/2,H/2,610);v.addColorStop(.65,'#081a2200');v.addColorStop(1,'#07152236');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
  }
  function loop(now){let dt=Math.min(.04,(now-last)/1000);last=now;update(dt);render();requestAnimationFrame(loop);}
  requestAnimationFrame(loop);
})();
