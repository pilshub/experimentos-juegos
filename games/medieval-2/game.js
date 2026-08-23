(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const menu = $('#menuView');
  const gameView = $('#gameView');
  const stageFrame = $('#stageFrame');
  const controlPanel = $('#controlPanel');
  const hud = $('#hud');
  const startOverlay = $('#startOverlay');
  const resultOverlay = $('#resultOverlay');
  const eventLog = $('#eventLog');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  let activeGame = null;
  let rafId = 0;
  let lastFrame = 0;
  let particles = [];
  let audioContext = null;

  const palette = { cream:'#f6eedb', gold:'#f3bd64', ember:'#e77a55', sky:'#6cc4df', mint:'#6fd0b0', dark:'#102036', deep:'#0b1727', stone:'#6b7785', wall:'#9c8a70' };
  const names = { castle:'Castle Siege', village:'Village Defense', banner:'Banner Tactics' };
  const meta = {
    castle:{ kicker:'Trial I · Precision', tag:'wind / timing / impact', title:'Castle Siege', brief:'A wall stands between your banner and the dawn. Set your aim, read the crosswind, then release the stone inside the amber charge band.', overlayTitle:'The wall is waiting', overlayText:'Use the field or arrow keys to aim. Hold the launch control, then release when the charge marker enters the amber band. Seven stones, one breach.' },
    village:{ kicker:'Trial II · Stewardship', tag:'workers / supplies / raids', title:'Village Defense', brief:'Three crews. A hungry settlement. Assign each worker every heartbeat and keep the outer wall standing through six rising raids.', overlayTitle:'The watch bell sounds', overlayText:'Assign workers to harvest, build, or repair. A balanced crew is stronger than a busy one. Survive the clock and the village keeps its light.' },
    banner:{ kicker:'Trial III · Adaptation', tag:'formation / counters / morale', title:'Banner Tactics', brief:'The enemy reveals its formation before every clash. Answer with the counter that owns the matchup, and keep your morale above the mud.', overlayTitle:'Read the field', overlayText:'Guard breaks Riders. Riders break Rangers. Rangers break Guard. Choose the answer, not the habit, for five quick clashes.' }
  };
  const counterOf = { riders:'guards', rangers:'riders', guards:'rangers' };
  const unitLabel = { guards:'Guard', riders:'Riders', rangers:'Rangers' };

  function safeGet(key) { try { return Number(localStorage.getItem(key) || 0); } catch { return 0; } }
  function safeSet(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }
  function recordKey(key) { return `bench.${key}Best`; }
  function updateRecords() {
    ['castle','village','banner'].forEach((key) => { const el = $(`#best-${key}`); if (el) el.textContent = safeGet(recordKey(key)) ? `${safeGet(recordKey(key))} pts` : 'Unwritten'; });
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a,b,t) { return a + (b-a)*t; }
  function roundedRect(c,x,y,w,h,r) { c.beginPath(); c.roundRect(x,y,w,h,r); }
  function text(c, str, x, y, size, color=palette.cream, align='left', weight='500') { c.font = `${weight} ${size}px Inter, system-ui, sans-serif`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(str,x,y); }
  function serif(c, str, x, y, size, color=palette.cream, align='left') { c.font = `500 ${size}px Georgia, serif`; c.fillStyle=color; c.textAlign=align; c.textBaseline='middle'; c.fillText(str,x,y); }
  function glow(c,color,blur) { c.shadowColor=color; c.shadowBlur=blur; }
  function resetShadow(c) { c.shadowColor='transparent'; c.shadowBlur=0; }
  function createParticles(x,y,color,count=14) { if (reducedMotion) return; for (let i=0;i<count;i++) particles.push({x,y,vx:(Math.random()-.5)*150,vy:(Math.random()-.9)*150,life:1,size:2+Math.random()*4,color}); }
  function updateParticles(dt) { particles = particles.filter(p => { p.life -= dt*1.45; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 90*dt; return p.life>0; }); }
  function drawParticles() { particles.forEach(p => { ctx.globalAlpha=clamp(p.life,0,1); ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,TAU); ctx.fill(); }); ctx.globalAlpha=1; }
  function playTone(freq=440, duration=.08, type='sine', volume=.035) {
    try { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); const osc=audioContext.createOscillator(); const gain=audioContext.createGain(); osc.type=type; osc.frequency.value=freq; gain.gain.setValueAtTime(volume,audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration); osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime+duration); } catch {}
  }
  function setLog(message, emph='Field note') { eventLog.innerHTML = `<strong>${emph}:</strong> ${message}`; }
  function normalizePointer(event) { const rect=canvas.getBoundingClientRect(); return {x:(event.clientX-rect.left)/rect.width*1000,y:(event.clientY-rect.top)/rect.height*560}; }

  function drawSky(c, skyA='#294e68', skyB='#101f34') {
    const gradient=c.createLinearGradient(0,0,0,560); gradient.addColorStop(0,skyA); gradient.addColorStop(1,skyB); c.fillStyle=gradient; c.fillRect(0,0,1000,560);
    c.fillStyle='rgba(246,238,219,.52)'; for(let i=0;i<34;i++){const x=(i*197)%1000,y=30+(i*83)%185;c.globalAlpha=(i%3)*.12+.12;c.fillRect(x,y,1.5,1.5)} c.globalAlpha=1;
    c.fillStyle='rgba(231,242,232,.09)'; c.beginPath(); c.arc(788,94,54,0,TAU); c.fill(); c.fillStyle='rgba(255,226,163,.82)'; c.beginPath(); c.arc(780,87,39,0,TAU); c.fill();
  }
  function drawGround(c, top=380, color='#152638') { c.fillStyle=color;c.beginPath();c.moveTo(0,top);c.quadraticCurveTo(160,top-42,330,top+4);c.quadraticCurveTo(510,top-58,690,top+2);c.quadraticCurveTo(820,top-35,1000,top-1);c.lineTo(1000,560);c.lineTo(0,560);c.closePath();c.fill(); }
  function drawCloud(c,x,y,s=1) { c.fillStyle='rgba(190,222,225,.10)'; c.beginPath();c.arc(x,y,25*s,0,TAU);c.arc(x+32*s,y-8*s,34*s,0,TAU);c.arc(x+70*s,y+4*s,24*s,0,TAU);c.rect(x-10*s,y,x+92*s,25*s);c.fill(); }
  function drawVillageHuts(c) { [[85,355,80,58],[170,375,62,44],[820,364,86,58],[902,390,55,40]].forEach(([x,y,w,h],i)=>{c.fillStyle=i%2?'#b96f4e':'#c68756';c.beginPath();c.moveTo(x-10,y+8);c.lineTo(x+w/2,y-h*.5);c.lineTo(x+w+10,y+8);c.closePath();c.fill();c.fillStyle='#563e3b';c.fillRect(x+18,y+8,w-36,h-8);c.fillStyle='#2a4a54';c.fillRect(x+30,y+20,12,15);}); }

  function beginSelected() {
    if (!activeGame) return;
    startOverlay.classList.add('hidden'); resultOverlay.classList.add('hidden'); stageFrame.classList.add('is-active');
    activeGame.active=true; activeGame.phase='playing'; activeGame.startedAt=performance.now(); lastFrame=performance.now(); canvas.focus(); playTone(330,.12,'triangle',.045); setLog(meta[activeGame.key].brief,'Briefing');
    cancelAnimationFrame(rafId); rafId=requestAnimationFrame(frame);
  }
  function initGame(key) {
    cancelAnimationFrame(rafId); particles=[];
    activeGame={key,active:false,phase:'briefing',score:0};
    $('#game-kicker').textContent=meta[key].kicker; $('#game-title').textContent=meta[key].title; $('#game-tag').textContent=meta[key].tag;
    menu.style.display='none'; gameView.style.display='block';
    startOverlay.classList.remove('hidden'); resultOverlay.classList.add('hidden'); stageFrame.classList.remove('is-active');
    $('#overlayTitle').textContent=meta[key].overlayTitle; $('#overlayText').textContent=meta[key].overlayText;
    if(key==='castle') initCastle(); if(key==='village') initVillage(); if(key==='banner') initBanner();
    canvas.setAttribute('aria-label',`${meta[key].title} interactive field`); canvas.focus(); drawCurrent();
  }
  function returnMenu() { cancelAnimationFrame(rafId); activeGame=null; gameView.style.display='none'; menu.style.display='block'; updateRecords(); window.scrollTo(0,0); }
  function finish(win, reason) {
    if (!activeGame || activeGame.phase==='result') return;
    activeGame.phase='result'; activeGame.active=false; stageFrame.classList.remove('is-active'); playTone(win?660:150,.22,win?'triangle':'sawtooth',.05);
    if(win) createParticles(500,260,palette.gold,38);
    const key=activeGame.key; const best=safeGet(recordKey(key)); const isBest=activeGame.score>best; if(isBest) safeSet(recordKey(key),activeGame.score);
    $('#resultKicker').textContent=win?'Trial won':'Trial lost'; $('#resultTitle').textContent=win?'The realm answers':'The line gives way'; $('#resultScore').textContent=`${activeGame.score} points`; $('#resultNote').textContent=isBest?'New best record':'Record held'; $('#resultText').textContent=reason;
    resultOverlay.classList.remove('hidden'); setLog(reason,win?'Victory':'After-action'); updateRecords(); drawCurrent();
  }
  function frame(now) { if(!activeGame) return; const dt=Math.min(.05,(now-lastFrame)/1000||0); lastFrame=now; if(activeGame.phase==='playing') updateGame(dt,now); updateParticles(dt); drawCurrent(now); rafId=requestAnimationFrame(frame); }
  function updateGame(dt,now) { if(activeGame.key==='castle') updateCastle(dt,now); if(activeGame.key==='village') updateVillage(dt,now); if(activeGame.key==='banner') updateBanner(dt,now); renderHud(); }
  function drawCurrent(now=performance.now()) { if(!activeGame) return; if(activeGame.key==='castle') drawCastle(now); if(activeGame.key==='village') drawVillage(now); if(activeGame.key==='banner') drawBanner(now); drawParticles(); }

  // Castle Siege
  function initCastle() { activeGame={...activeGame,aim:.68,power:0,charging:false,chargeStarted:0,shots:0,maxShots:7,fort:10,wind:.035,flight:0,phase:'briefing'}; controlPanel.innerHTML=`<h3>Fire control</h3><p>Place the reticle on the inner tower. Charge inside the amber band for a clean impact.</p><div class="control-section"><label for="powerButton">Power rhythm</label><div class="meter"><div id="powerFill" class="meter-fill"></div><div class="meter-zone" aria-hidden="true"></div></div><div class="charge-copy"><span>soft</span><span>sweet spot</span><span>overdraw</span></div><button id="powerButton" class="power-button" type="button">Hold to charge · release to launch</button></div><div class="control-section"><label>Aim</label><div class="action-list"><button class="action-button" data-aim="left" type="button">← Shift left <small>Arrow left</small></button><button class="action-button" data-aim="right" type="button">Shift right → <small>Arrow right</small></button></div></div><p class="help-line">Wind changes the arc, not your nerve. Seven stones remain.</p>`;
    const power=$('#powerButton'); power.addEventListener('pointerdown',(event)=>{event.preventDefault();startCharge()}); window.addEventListener('pointerup',releaseCharge); controlPanel.querySelectorAll('[data-aim]').forEach(btn=>btn.addEventListener('click',()=>{activeGame.aim=clamp(activeGame.aim+(btn.dataset.aim==='right'?.025:-.025),.18,.88);playTone(260,.04,'sine',.025);setLog(`Reticle set to ${Math.round(activeGame.aim*100)}% of the wall.`,'Aim');}));
  }
  function startCharge() { if(!activeGame||activeGame.key!=='castle'||activeGame.phase!=='playing'||activeGame.charging||activeGame.flight) return; activeGame.charging=true;activeGame.chargeStarted=performance.now();playTone(220,.05,'square',.02); }
  function releaseCharge() { if(!activeGame||activeGame.key!=='castle'||!activeGame.charging) return; activeGame.charging=false;activeGame.power=clamp(.07+((performance.now()-activeGame.chargeStarted)/1000)*.76,.07,.96); launchCastle(); }
  function launchCastle() { if(activeGame.phase!=='playing'||activeGame.flight) return; activeGame.flight=.01;activeGame.shots++; playTone(110,.12,'sawtooth',.04);setLog('Stone away. Watch the tail of the wind.','Launch'); }
  function updateCastle(dt,now) { if(activeGame.charging){const t=(now-activeGame.chargeStarted)/1000;const wave=(Math.sin(t*4.2)+1)/2;activeGame.power=.08+wave*.88;} if(activeGame.flight){activeGame.flight+=dt*1.8;if(activeGame.flight>=1){activeGame.flight=0;const drift=activeGame.wind*activeGame.power*1.8;const effectiveAim=activeGame.aim+drift;const hit=effectiveAim>.46&&effectiveAim<.86&&activeGame.power>.30;activeGame.wind=clamp(activeGame.wind+(Math.random()-.5)*.05,-.11,.11); if(hit){const damage=activeGame.power>.62?3:2;activeGame.fort-=damage;activeGame.score+=damage*10+Math.round(activeGame.power*8);createParticles(760,278,palette.ember,24);playTone(180,.16,'square',.05);setLog(`Impact confirmed. ${damage} blocks sheared from the eastern tower. Wind drift: ${Math.round(drift*100)}%.`,'Impact');if(activeGame.fort<=0){finish(true,'A clean breach. The gatehouse folds under a measured final stone.');return;}}else{createParticles(710+Math.random()*90,300,palette.stone,8);playTone(90,.08,'sawtooth',.025);setLog('The stone kisses empty air. Adjust for the new wind, then trust the rhythm.','Miss');} if(activeGame.shots>=activeGame.maxShots&&activeGame.fort>0)finish(false,'The last stone lands in the valley. The wall still holds.');}} }
  function drawCastle(now) { const c=ctx;drawSky(c,'#2f566b','#101f34');drawCloud(c,120,150,.75);drawCloud(c,420,112,.48);drawGround(c,392,'#12293a');c.fillStyle='#1b3a45';c.beginPath();c.moveTo(0,395);c.quadraticCurveTo(170,310,325,395);c.quadraticCurveTo(520,300,700,390);c.lineTo(700,560);c.lineTo(0,560);c.fill();
    // distant pennants and castle
    c.fillStyle='#243f51';c.fillRect(686,212,210,190);c.fillStyle='#324f60';c.fillRect(654,250,56,152);c.fillRect(872,232,60,170);c.fillStyle='#405b69';c.fillRect(635,205,86,48);c.fillRect(850,187,103,50);c.fillStyle=palette.wall; c.fillRect(705,282,165,120); for(let x=705;x<870;x+=33){c.fillRect(x,265,22,22)} for(let y=300;y<400;y+=26){for(let x=710;x<868;x+=32){c.strokeStyle='rgba(32,42,54,.34)';c.strokeRect(x,y,29,23)}}
    // tower damage overlays
    const broken=Math.max(0,10-activeGame.fort); c.fillStyle='rgba(11,23,38,.75)';if(broken>0)c.fillRect(774,288,22,35);if(broken>2)c.fillRect(808,315,28,26);if(broken>4)c.fillRect(738,350,22,28);if(broken>6)c.fillRect(837,276,22,39);c.fillStyle=palette.ember;c.fillRect(763,224,5,64);c.beginPath();c.moveTo(768,226);c.lineTo(817,241);c.lineTo(768,254);c.closePath();c.fill();
    // catapult
    c.strokeStyle='#8f6546';c.lineWidth=10;c.beginPath();c.moveTo(180,420);c.lineTo(270,420);c.lineTo(245,359);c.lineTo(208,420);c.stroke();c.lineWidth=7;c.beginPath();c.moveTo(223,382);c.lineTo(205,295);c.stroke();c.lineWidth=4;c.strokeStyle=palette.gold;c.beginPath();c.moveTo(205,295);c.lineTo(294,335);c.stroke();c.fillStyle='#314d5c';c.beginPath();c.arc(190,430,18,0,TAU);c.arc(272,430,18,0,TAU);c.fill();c.fillStyle=palette.gold;c.beginPath();c.arc(294,335,11,0,TAU);c.fill();
    // aim reticle and arc
    const targetX=460+activeGame.aim*360; c.strokeStyle='rgba(243,189,100,.35)';c.setLineDash([5,9]);c.lineWidth=1;c.beginPath();c.moveTo(294,335);c.quadraticCurveTo(510,90-(activeGame.power*60),targetX,280);c.stroke();c.setLineDash([]);c.strokeStyle=palette.gold;c.lineWidth=2;c.beginPath();c.arc(targetX,280,18,0,TAU);c.moveTo(targetX-26,280);c.lineTo(targetX+26,280);c.moveTo(targetX,254);c.lineTo(targetX,306);c.stroke();
    // wind ribbon
    c.strokeStyle='rgba(108,196,223,.65)';c.lineWidth=2;c.beginPath();c.moveTo(420,70);c.bezierCurveTo(490,40,520,105,585,73);c.stroke();text(c,`CROSSWIND  ${activeGame.wind>0?'↗':'↙'}  ${Math.abs(Math.round(activeGame.wind*100))}`,418,45,11,palette.sky);
    if(activeGame.flight){const t=activeGame.flight;const x=lerp(294,targetX,t);const y=lerp(335,280,t)-Math.sin(t*Math.PI)*155*activeGame.power;glow(c,palette.ember,16);c.fillStyle=palette.ember;c.beginPath();c.arc(x,y,9,0,TAU);c.fill();resetShadow(c);}
    c.fillStyle='rgba(246,238,219,.7)';c.fillRect(0,498,1000,1);text(c,'THE EASTERN TOWER',758,435,10,'rgba(246,238,219,.65)','center','800');text(c,'EMBERWARD RANGE · I',500,525,10,'rgba(246,238,219,.42)','center','700');
  }

  // Village Defense
  function initVillage() { activeGame={...activeGame,elapsed:0,duration:28,wall:9,wallMax:10,food:4,wood:6,morale:4,wave:0,nextRaid:4,workers:[{action:'harvest'},{action:'build'},{action:'repair'}],phase:'briefing',pulse:0}; renderVillageControls(); }
  function renderVillageControls() { controlPanel.innerHTML=`<h3>Assign the crews</h3><p>Each worker acts once per heartbeat. Keep food coming, grow the palisade, and repair before the next horn.</p><div class="control-section"><label>Worker orders</label><div class="action-list">${activeGame.workers.map((worker,i)=>`<div><div class="stat-row"><span>Worker ${i+1}</span><span style="color:${worker.action==='repair'? 'var(--mint)':worker.action==='build'?'var(--gold)':'var(--sky)'}">${worker.action}</span></div><div class="action-list" style="grid-template-columns:repeat(3,1fr)">${['harvest','build','repair'].map(action=>`<button class="action-button ${worker.action===action?'selected':''}" data-worker="${i}" data-action="${action}" type="button" aria-label="Assign worker ${i+1} to ${action}">${action[0].toUpperCase()}<small>${action}</small></button>`).join('')}</div></div>`).join('')}</div></div><div class="control-section"><label>Quick orders</label><div class="action-list"><button class="action-button" data-all="repair" type="button">All crews repair <small>R</small></button><button class="action-button" data-all="harvest" type="button">All crews harvest <small>H</small></button></div></div><p class="help-line">The raid counter is honest. The wall is not.</p>`;
    controlPanel.querySelectorAll('[data-worker]').forEach(btn=>btn.addEventListener('click',()=>assignWorker(Number(btn.dataset.worker),btn.dataset.action)));
    controlPanel.querySelectorAll('[data-all]').forEach(btn=>btn.addEventListener('click',()=>{activeGame.workers.forEach(w=>w.action=btn.dataset.all);renderVillageControls();setLog(`All crews report to ${btn.dataset.all}.`,'Order');playTone(310,.06,'triangle',.03)}));
  }
  function assignWorker(index,action) { if(!activeGame||activeGame.phase!=='playing')return;activeGame.workers[index].action=action;renderVillageControls();setLog(`Worker ${index+1} now assigned to ${action}.`,'Order');playTone(action==='repair'?460:action==='build'?360:250,.05,'triangle',.025); }
  function updateVillage(dt) { activeGame.elapsed+=dt;activeGame.pulse+=dt;if(activeGame.elapsed>=activeGame.nextRaid){activeGame.wave++;activeGame.nextRaid+=4.4;const attack=1.8+activeGame.wave*.45;const protectedWall=activeGame.wall;activeGame.wall=clamp(activeGame.wall-attack,0,activeGame.wallMax);activeGame.morale=clamp(activeGame.morale-(protectedWall<attack?1:0),0,4);createParticles(675,320,palette.ember,18);playTone(120,.18,'sawtooth',.035);setLog(`Raid ${activeGame.wave} breaks against ${Math.round(protectedWall)} wall strength.`, 'Raid');if(activeGame.wall<=0||activeGame.morale<=0){activeGame.score=Math.max(0,Math.round(activeGame.elapsed*5));finish(false,'The watchtower goes dark. A better order, given sooner, could have held the breach.');return;}}
    if(Math.floor(activeGame.elapsed*2)!==Math.floor((activeGame.elapsed-dt)*2)){activeGame.workers.forEach(worker=>{if(worker.action==='harvest')activeGame.food+=1; if(worker.action==='build'){activeGame.wood+=1;activeGame.wall=clamp(activeGame.wall+.52,0,activeGame.wallMax);} if(worker.action==='repair'&&activeGame.wood>0){activeGame.wood-=1;activeGame.wall=clamp(activeGame.wall+1.15,0,activeGame.wallMax);}});}
    if(activeGame.elapsed>=activeGame.duration){activeGame.score=activeGame.wave*25+Math.round(activeGame.wall*10)+activeGame.morale*12;finish(true,'The sixth horn fades. The village still has roofs, grain, and a future.');}
  }
  function drawVillage(now) { const c=ctx;drawSky(c,'#3e6b72','#1a3041');drawCloud(c,150,116,.8);drawCloud(c,525,155,.5);drawGround(c,382,'#17373b');c.fillStyle='#275049';c.beginPath();c.moveTo(0,390);c.quadraticCurveTo(220,290,410,388);c.quadraticCurveTo(650,270,1000,390);c.lineTo(1000,560);c.lineTo(0,560);c.fill();drawVillageHuts(c);
    // wall and gate
    const wallY=357;c.fillStyle='#75644f';c.fillRect(560,wallY,350,58);c.fillStyle='#9f8766';for(let x=560;x<910;x+=36)c.fillRect(x,wallY-16,26,17);for(let x=574;x<900;x+=50){c.strokeStyle='rgba(20,35,46,.35)';c.strokeRect(x,wallY+10,42,20);c.strokeRect(x+22,wallY+31,40,20)}c.fillStyle='#1b2b35';c.beginPath();c.arc(691,420,37,Math.PI,TAU);c.lineTo(728,420);c.lineTo(654,420);c.fill();c.fillStyle=palette.ember;c.fillRect(851,274,5,85);c.beginPath();c.moveTo(856,276);c.lineTo(900,290);c.lineTo(856,304);c.fill();
    // villagers
    activeGame.workers.forEach((worker,i)=>{const x=255+i*98;const bob=reducedMotion?0:Math.sin(now/320+i)*3;c.fillStyle=worker.action==='repair'?palette.mint:worker.action==='build'?palette.gold:palette.sky;c.beginPath();c.arc(x,354+bob,12,0,TAU);c.fill();c.fillStyle='#1a2734';c.fillRect(x-9,366+bob,18,30);c.strokeStyle=c.fillStyle;c.lineWidth=3;c.beginPath();c.moveTo(x-7,396+bob);c.lineTo(x-11,420+bob);c.moveTo(x+7,396+bob);c.lineTo(x+11,420+bob);c.stroke();text(c,worker.action[0].toUpperCase(),x,354+bob,11,palette.dark,'center','800');});
    // fire and night watch
    glow(c,palette.ember,22);c.fillStyle=palette.ember;c.beginPath();c.arc(485,390,13+Math.sin(now/180)*3,0,TAU);c.fill();resetShadow(c);text(c,'NORTHMEADOW',500,478,10,'rgba(246,238,219,.46)','center','800');text(c,'RATIONS',100,450,10,'rgba(246,238,219,.5)','center','800');
    if(activeGame.wave){c.fillStyle='rgba(231,122,85,.16)';c.beginPath();c.arc(690,330,40+activeGame.wave*7,0,TAU);c.fill();text(c,`RAID ${activeGame.wave}`,690,330,12,palette.ember,'center','800');}
  }

  // Banner Tactics
  function initBanner() { activeGame={...activeGame,round:0,morale:3,enemy:'riders',feedback:'',feedbackUntil:0,phase:'briefing',score:0}; renderBannerControls(); }
  function renderBannerControls() { controlPanel.innerHTML=`<h3>Choose a counter</h3><p id="bannerHint">Scout report: their next formation is visible on the field. The answer is never hidden.</p><div class="control-section"><label>Available banners</label><div class="action-list">${['guards','riders','rangers'].map(unit=>`<button class="action-button" data-unit="${unit}" type="button"><span>${unitLabel[unit]}</span><small>${unit==='guards'?'G':unit==='riders'?'R':'E'}</small></button>`).join('')}</div></div><div class="keys"><span class="key">Q</span><span class="key">W</span><span class="key">E</span></div><p class="help-line">Guard > Riders · Riders > Rangers · Rangers > Guard</p>`;controlPanel.querySelectorAll('[data-unit]').forEach(btn=>btn.addEventListener('click',()=>playBanner(btn.dataset.unit))); }
  function playBanner(unit) { if(!activeGame||activeGame.phase!=='playing')return;const enemy=activeGame.enemy;const correct=counterOf[enemy]===unit;if(correct){activeGame.score+=30+activeGame.morale*4;activeGame.feedback=`${unitLabel[unit]} owns the matchup.`;createParticles(700,270,palette.mint,20);playTone(520,.11,'triangle',.04);setLog(`${unitLabel[unit]} cuts through the ${unitLabel[enemy]} formation.`,'Tactical read');}else{activeGame.morale--;activeGame.score=Math.max(0,activeGame.score-6);activeGame.feedback=`${unitLabel[unit]} cannot answer ${unitLabel[enemy]}.`;createParticles(700,270,palette.ember,16);playTone(140,.15,'sawtooth',.04);setLog(`${unitLabel[enemy]} catches your ${unitLabel[unit]} in the open.`,'Tactical miss');}activeGame.feedbackUntil=performance.now()+1050;activeGame.round++;if(activeGame.morale<=0){finish(false,'Three wrong reads. The banners scatter before the scout can call another order.');return;}if(activeGame.round>=5){finish(true,'Five formations answered. Your banner becomes a lesson carried from camp to camp.');return;}activeGame.enemy=['riders','rangers','guards','riders','rangers'][activeGame.round];renderBannerControls(); }
  function updateBanner() { if(activeGame.feedback&&performance.now()>activeGame.feedbackUntil)activeGame.feedback=''; }
  function drawBanner(now) { const c=ctx;drawSky(c,'#55415a','#151f37');drawCloud(c,110,148,.65);drawGround(c,382,'#202b3f');c.fillStyle='#283d4b';c.beginPath();c.moveTo(0,408);c.quadraticCurveTo(230,335,430,405);c.quadraticCurveTo(690,315,1000,404);c.lineTo(1000,560);c.lineTo(0,560);c.fill();
    // arena lines
    c.strokeStyle='rgba(246,238,219,.12)';c.lineWidth=2;for(let x=460;x<900;x+=74){c.beginPath();c.arc(x,382,30,Math.PI,TAU);c.stroke()}c.fillStyle='rgba(243,189,100,.12)';c.fillRect(455,391,450,2);
    // enemy formation icons
    const icons={guards:{color:palette.ember,label:'GUARDS'},riders:{color:palette.gold,label:'RIDERS'},rangers:{color:palette.sky,label:'RANGERS'}};const enemy=icons[activeGame.enemy];glow(c,enemy.color,18);c.fillStyle=enemy.color;c.beginPath();c.arc(700,280,42,0,TAU);c.fill();resetShadow(c);c.fillStyle='#182438';c.beginPath();c.moveTo(680,298);c.lineTo(690,254);c.lineTo(709,247);c.lineTo(721,298);c.closePath();c.fill();serif(c,enemy.label,700,348,14,enemy.color,'center');
    // player pennants
    const bannerColors=[palette.mint,palette.gold,palette.ember];['GUARDS','RIDERS','RANGERS'].forEach((label,i)=>{const x=250+i*120;c.strokeStyle='#d6aa71';c.lineWidth=4;c.beginPath();c.moveTo(x,402);c.lineTo(x,260-i*10);c.stroke();c.fillStyle=bannerColors[i];c.beginPath();c.moveTo(x+3,265-i*10);c.lineTo(x+62,279-i*10);c.lineTo(x+44,300-i*10);c.lineTo(x+3,291-i*10);c.closePath();c.fill();text(c,label,x+31,430,9,'rgba(246,238,219,.65)','center','800')});
    c.fillStyle='rgba(246,238,219,.65)';c.fillRect(0,498,1000,1);text(c,`CLASH ${Math.min(activeGame.round+1,5)} / 5`,500,525,10,'rgba(246,238,219,.45)','center','800');if(activeGame.feedback){roundedRect(c,380,84,240,44,12);c.fillStyle='rgba(11,23,39,.85)';c.fill();text(c,activeGame.feedback,500,106,12,activeGame.feedback.includes('owns')?palette.mint:palette.ember,'center','800');}
  }

  function renderHud() {
    if(!activeGame)return;
    if(activeGame.key==='castle')hud.innerHTML=`<div class="hud-group"><div class="hud-pill">Fortification <b class="gold">${Math.max(0,activeGame.fort)} / 10</b></div><div class="hud-pill">Stones <b>${Math.max(0,activeGame.maxShots-activeGame.shots)}</b></div></div><div class="hud-group"><div class="hud-pill">Score <b class="gold">${activeGame.score}</b></div></div>`;
    if(activeGame.key==='village')hud.innerHTML=`<div class="hud-group"><div class="hud-pill">Wall <b class="gold">${Math.round(activeGame.wall)} / 10</b></div><div class="hud-pill">Morale <b>${activeGame.morale}</b></div></div><div class="hud-group"><div class="hud-pill">Food <b>${activeGame.food}</b></div><div class="hud-pill">Wood <b>${activeGame.wood}</b></div><div class="hud-pill">${Math.max(0,Math.ceil(activeGame.duration-activeGame.elapsed))}s <b class="gold">${activeGame.wave} raids</b></div></div>`;
    if(activeGame.key==='banner')hud.innerHTML=`<div class="hud-group"><div class="hud-pill">Morale <b class="gold">${activeGame.morale} / 3</b></div><div class="hud-pill">Clash <b>${Math.min(activeGame.round+1,5)} / 5</b></div></div><div class="hud-group"><div class="hud-pill">Score <b class="gold">${activeGame.score}</b></div></div>`;
    const fill=$('#powerFill');if(fill&&activeGame.key==='castle')fill.style.width=`${Math.round(activeGame.power*100)}%`;
  }

  canvas.addEventListener('pointermove',(event)=>{if(activeGame?.key==='castle'&&activeGame.phase==='playing'){const p=normalizePointer(event);activeGame.aim=clamp((p.x-460)/360,.18,.88);}});
  canvas.addEventListener('pointerdown',(event)=>{if(activeGame?.key==='castle'&&activeGame.phase==='playing'){canvas.setPointerCapture?.(event.pointerId);startCharge();}});
  window.addEventListener('keydown',(event)=>{if(!activeGame||activeGame.phase!=='playing')return;const key=event.key.toLowerCase();if(['arrowleft','arrowright',' ','q','w','e','1','2','3','r','h'].includes(key))event.preventDefault();if(activeGame.key==='castle'){if(key==='arrowleft')activeGame.aim=clamp(activeGame.aim-.025,.18,.88);if(key==='arrowright')activeGame.aim=clamp(activeGame.aim+.025,.18,.88);if(key===' '&&!event.repeat)startCharge();}else if(activeGame.key==='village'){if(key==='r')controlPanel.querySelector('[data-all="repair"]')?.click();if(key==='h')controlPanel.querySelector('[data-all="harvest"]')?.click();}else if(activeGame.key==='banner'){if(key==='q')playBanner('guards');if(key==='w')playBanner('riders');if(key==='e')playBanner('rangers');}});
  window.addEventListener('keyup',(event)=>{if(activeGame?.key==='castle'&&event.key===' ')releaseCharge();});
  $('#startButton').addEventListener('click',beginSelected);$('#restartButton').addEventListener('click',()=>{const key=activeGame.key;initGame(key);beginSelected();});$('#resultBackButton').addEventListener('click',returnMenu);$('#backButton').addEventListener('click',returnMenu);$('#brandLink').addEventListener('click',(event)=>{event.preventDefault();returnMenu();});document.querySelectorAll('[data-game]').forEach(btn=>btn.addEventListener('click',()=>initGame(btn.dataset.game)));updateRecords();
  window.__bench={getState:()=>activeGame?JSON.parse(JSON.stringify(activeGame)):null,records:()=>({castle:safeGet(recordKey('castle')),village:safeGet(recordKey('village')),banner:safeGet(recordKey('banner'))})};
})();
