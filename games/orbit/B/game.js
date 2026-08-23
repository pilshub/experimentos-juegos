(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.querySelector('[data-testid="stage"]');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayCopy = document.getElementById('overlay-copy');
  const action = document.getElementById('action');
  const result = document.getElementById('result');
  const scoreEl = document.querySelector('[data-testid="score"]');
  const timeEl = document.getElementById('time');
  const bestEl = document.getElementById('best');
  const progressBar = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const toast = document.getElementById('toast');
  const joystick = document.getElementById('joystick');
  const stick = document.getElementById('stick');
  const BEST_KEY = 'bench.orbitCourier.bestTime';
  const TAU = Math.PI * 2;
  let raf = 0, last = 0, elapsed = 0, phase = 'ready', cellsCollected = 0, actionCount = 0, dpr = 1, w = 0, h = 0;
  const input = { x: 0, y: 0 };
  const player = { x: 0, y: 0, r: 13, speed: 245 };
  let cells = [], hazards = [];
  let best = Number(localStorage.getItem(BEST_KEY)) || null;

  function resize() {
    const rect = canvas.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height; canvas.width = Math.max(1, Math.floor(w * dpr)); canvas.height = Math.max(1, Math.floor(h * dpr)); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (phase === 'ready') resetEntities();
  }
  function resetEntities() {
    player.x = w * .16; player.y = h * .78;
    cells = [{x:.75,y:.22,got:false},{x:.24,y:.22,got:false},{x:.78,y:.76,got:false}].map(p => ({x:p.x*w,y:p.y*h,got:false,pulse:Math.random()*TAU}));
    hazards = [{x:.49,y:.47,r:16,base:0,orbit:.19,speed:1},{x:.78,y:.40,r:13,base:2,orbit:.14,speed:-1.25},{x:.30,y:.72,r:11,base:4,orbit:.23,speed:.72}].map(o => ({...o, x:o.x*w, y:o.y*h, ox:o.x*w, oy:o.y*h}));
  }
  function start() {
    cancelAnimationFrame(raf); phase='playing'; elapsed=0; cellsCollected=0; actionCount=0; input.x=0; input.y=0; resetEntities();
    overlay.classList.add('hidden'); result.textContent='Courier in motion'; result.style.color=''; updateHud(); last=performance.now(); raf=requestAnimationFrame(loop);
  }
  function updateHud() {
    scoreEl.textContent = `${cellsCollected} / 3`; const pct = Math.round(cellsCollected / 3 * 100); progressBar.style.width=pct+'%'; progressLabel.textContent=pct+'%'; timeEl.textContent=formatTime(elapsed); bestEl.textContent=best == null ? '—' : formatTime(best);
  }
  function formatTime(ms) { const s=ms/1000; return `${String(Math.floor(s/60)).padStart(2,'0')}:${(s%60).toFixed(1).padStart(4,'0')}`; }
  function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
  function loop(now) { if (phase !== 'playing') return; const dt=Math.min((now-last)/1000,.04); last=now; elapsed+=dt*1000; update(dt); draw(now/1000); updateHud(); if (phase==='playing') raf=requestAnimationFrame(loop); }
  function update(dt) {
    let dx=input.x, dy=input.y; if (dx || dy) { const len=Math.hypot(dx,dy); dx/=Math.max(1,len); dy/=Math.max(1,len); player.x += dx*player.speed*dt; player.y += dy*player.speed*dt; }
    player.x=Math.max(player.r,Math.min(w-player.r,player.x)); player.y=Math.max(player.r,Math.min(h-player.r,player.y));
    hazards.forEach((q,i) => { const boost=1+cellsCollected*.18; q.x=q.ox+Math.cos(elapsed/1000*q.speed+q.base)*w*q.orbit*boost; q.y=q.oy+Math.sin(elapsed/1000*q.speed*1.17+q.base)*h*q.orbit*boost; if(distance(player,q)<player.r+q.r-2) lose(); });
    cells.forEach(c => { if(!c.got && distance(player,c)<player.r+15) { c.got=true; cellsCollected++; showToast(cellsCollected===3?'ROUTE COMPLETE':'CELL SECURED · SENTRIES ACCELERATING'); if(cellsCollected===3) win(); } });
  }
  function draw(t) {
    ctx.clearRect(0,0,w,h); ctx.fillStyle='#091619'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(90,171,157,.10)'; ctx.lineWidth=1; const grid=42; for(let x=0;x<w;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();} for(let y=0;y<h;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ctx.strokeStyle='rgba(136,243,201,.16)'; ctx.setLineDash([2,8]); ctx.beginPath();ctx.arc(w*.5,h*.5,Math.min(w,h)*.36,0,TAU);ctx.stroke(); ctx.setLineDash([]);
    cells.forEach(c=>{if(!c.got) drawCell(c,t);}); hazards.forEach((q,i)=>drawHazard(q,t,i)); drawPlayer(t);
  }
  function drawCell(c,t) { const pulse=1+Math.sin(t*3+c.pulse)*.12; ctx.save();ctx.translate(c.x,c.y);ctx.rotate(Math.PI/4);ctx.shadowBlur=16;ctx.shadowColor='#f4c96a';ctx.fillStyle='#f4c96a';ctx.fillRect(-8*pulse,-8*pulse,16*pulse,16*pulse);ctx.shadowBlur=0;ctx.fillStyle='#fff1b0';ctx.fillRect(-3,-3,6,6);ctx.restore(); }
  function drawHazard(q,t,i) { ctx.save();ctx.translate(q.x,q.y);ctx.rotate(t*(i%2?-.7:.5));ctx.shadowBlur=15;ctx.shadowColor='#ff6f75';ctx.strokeStyle='#ff6f75';ctx.lineWidth=2;ctx.beginPath(); for(let k=0;k<8;k++){const a=k*Math.PI/4, rr=k%2?q.r:q.r*.52;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='rgba(255,111,117,.2)';ctx.fill();ctx.restore(); }
  function drawPlayer(t) { ctx.save();ctx.translate(player.x,player.y);ctx.rotate(Math.atan2(input.y,input.x)||-.4);ctx.shadowBlur=18;ctx.shadowColor='#88f3c9';ctx.fillStyle='#88f3c9';ctx.beginPath();ctx.moveTo(17,0);ctx.lineTo(-10,-9);ctx.lineTo(-6,0);ctx.lineTo(-10,9);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#0c2526';ctx.beginPath();ctx.arc(1,0,4,0,TAU);ctx.fill();ctx.restore(); }
  function showToast(text) { toast.textContent=text; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),1300); }
  function win() { if(phase!=='playing') return; phase='won'; cancelAnimationFrame(raf); if(best==null||elapsed<best){best=elapsed;localStorage.setItem(BEST_KEY,String(best));} overlayTitle.textContent='Delivery complete'; overlayCopy.innerHTML=`All cells delivered in <b>${formatTime(elapsed)}</b>.<br>The orbit is clear for your return trip.`; action.innerHTML='Run it again <span>→</span>'; overlay.classList.remove('hidden'); result.textContent='Mission accomplished'; result.style.color='var(--mint)'; updateHud(); }
  function lose() { if(phase!=='playing') return; phase='lost'; cancelAnimationFrame(raf); overlayTitle.textContent='Signal lost'; overlayCopy.innerHTML='A sentry clipped your route.<br>Reset and thread the gap again.'; action.innerHTML='Retry mission <span>→</span>'; overlay.classList.remove('hidden'); result.textContent='Collision detected · mission failed'; result.style.color='var(--red)'; updateHud(); }
  function reset() { cancelAnimationFrame(raf); phase='ready'; elapsed=0; cellsCollected=0; actionCount=0; input.x=0; input.y=0; overlayTitle.textContent='Ready to run?'; overlayCopy.innerHTML="Guide your courier through the field.<br>Collect all three cells. Don't touch the sentries."; action.innerHTML='Start mission <span>→</span>'; overlay.classList.remove('hidden'); result.textContent='Stand by for launch'; result.style.color=''; resetEntities(); updateHud(); draw(0); }
  function act() { actionCount++; if(phase==='ready'||phase==='lost'||phase==='won') start(); else { input.x=0; input.y=-1; } }
  function key(e) { const map={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]}; const v=map[e.key]; if(v){e.preventDefault();input.x=v[0];input.y=v[1]; if(phase==='ready')start(); return;} if((e.key==='Enter'||e.key===' ') && (phase==='ready'||phase==='lost'||phase==='won')){e.preventDefault();start();} }
  function keyup(e) { if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){input.x=0;input.y=0;} }
  function setStick(e) { const r=joystick.getBoundingClientRect(), dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2), max=27, len=Math.hypot(dx,dy), k=Math.min(1,max/Math.max(len,1)); input.x=dx*k/max; input.y=dy*k/max; stick.style.transform=`translate(${dx*k}px,${dy*k}px)`; if(phase==='ready')start(); }
  function releaseStick(){input.x=0;input.y=0;stick.style.transform='translate(0,0)';}
  action.addEventListener('click',act); document.querySelector('[data-testid="start"]').addEventListener('click',reset); window.addEventListener('keydown',key); window.addEventListener('keyup',keyup); window.addEventListener('resize',resize); joystick.addEventListener('pointerdown',e=>{joystick.setPointerCapture(e.pointerId);setStick(e);}); joystick.addEventListener('pointermove',e=>{if(joystick.hasPointerCapture(e.pointerId))setStick(e);}); joystick.addEventListener('pointerup',releaseStick); joystick.addEventListener('pointercancel',releaseStick);
  window.__benchmark={start,act,complete:()=>{if(phase!=='playing')start(); cells.forEach(c=>c.got=true); cellsCollected=3; win();},reset,getState:()=>({phase,score:cellsCollected,progress:cellsCollected/3,elapsed:Math.round(elapsed),actions:actionCount})};
  resize(); reset();
})();
