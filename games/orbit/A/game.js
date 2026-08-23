(() => {
  'use strict';

  const canvas = document.getElementById('arena');
  const ctx = canvas.getContext('2d');
  const startButton = document.querySelector('[data-testid="start"]');
  const scoreEl = document.querySelector('[data-testid="score"]');
  const resultEl = document.querySelector('[data-testid="result"]');
  const timeEl = document.getElementById('time');
  const bestEl = document.getElementById('best');
  const threatEl = document.getElementById('threat');
  const introOverlay = document.getElementById('introOverlay');
  const outcomeOverlay = document.getElementById('outcomeOverlay');
  const resultKicker = document.getElementById('resultKicker');
  const resultDetail = document.getElementById('resultDetail');
  const againButton = document.getElementById('againButton');
  const cellIndicators = [...document.querySelectorAll('.cells i')];
  const joystick = document.querySelector('.joystick');
  const joystickKnob = document.querySelector('.joystick-knob');
  const pulseButton = document.getElementById('pulseButton');
  const STORAGE_KEY = 'bench.orbit-courier.best-time';

  let W = 900;
  let H = 500;
  let dpr = 1;
  let rafId = 0;
  let runToken = 0;
  let lastFrame = 0;
  let state = freshState();
  const keys = new Set();
  const stick = { x: 0, y: 0, active: false, pointerId: null };
  let pointerTarget = null;

  function freshState() {
    return {
      phase: 'ready',
      score: 0,
      progress: 0,
      elapsed: 0,
      startedAt: 0,
      difficulty: 1,
      player: { x: 0, y: 0, r: 13, angle: 0, trail: [] },
      cells: [],
      hazards: [],
      flash: 0,
      best: readBest()
    };
  }

  function readBest() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch (_) { return null; }
  }

  function writeBest(value) {
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch (_) { /* storage may be unavailable */ }
  }

  function formatTime(ms) {
    const totalTenths = Math.max(0, Math.floor(ms / 100));
    const minutes = Math.floor(totalTenths / 600);
    const seconds = Math.floor((totalTenths % 600) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${totalTenths % 10}`;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(300, rect.width);
    H = Math.max(260, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!state.player.x) {
      state.player.x = W * .12;
      state.player.y = H * .5;
    } else {
      state.player.x = Math.min(W - 24, state.player.x);
      state.player.y = Math.min(H - 24, state.player.y);
    }
    draw();
  }

  function setupLevel() {
    state.player = { x: W * .12, y: H * .5, r: 13, angle: 0, trail: [] };
    state.cells = [
      { x: W * .34, y: H * .24, r: 10, active: true, phase: .3 },
      { x: W * .62, y: H * .72, r: 10, active: true, phase: 2.1 },
      { x: W * .84, y: H * .28, r: 10, active: true, phase: 4.2 }
    ];
    state.hazards = [
      { cx: W * .45, cy: H * .49, rx: W * .13, ry: H * .21, phase: 0, speed: .72, r: 15, x: 0, y: 0 },
      { cx: W * .72, cy: H * .48, rx: W * .10, ry: H * .30, phase: Math.PI, speed: .91, r: 14, x: 0, y: 0 },
      { cx: W * .55, cy: H * .48, rx: W * .31, ry: H * .10, phase: 1.4, speed: .54, r: 12, x: 0, y: 0 }
    ];
    updateHazards(0);
  }

  function startGame() {
    cancelLoop();
    runToken += 1;
    state = freshState();
    state.phase = 'playing';
    state.startedAt = performance.now();
    lastFrame = state.startedAt;
    setupLevel();
    keys.clear();
    pointerTarget = null;
    resetStick();
    introOverlay.hidden = true;
    outcomeOverlay.hidden = true;
    startButton.querySelector('.button-copy b').textContent = 'RESTART RUN';
    startButton.querySelector('.button-icon').textContent = '↻';
    canvas.focus({ preventScroll: true });
    updateHud();
    const token = runToken;
    rafId = requestAnimationFrame(t => loop(t, token));
  }

  function resetGame() {
    cancelLoop();
    runToken += 1;
    state = freshState();
    state.player.x = W * .12;
    state.player.y = H * .5;
    keys.clear();
    pointerTarget = null;
    resetStick();
    introOverlay.hidden = false;
    outcomeOverlay.hidden = true;
    startButton.querySelector('.button-copy b').textContent = 'START RUN';
    startButton.querySelector('.button-icon').textContent = '▶';
    updateHud();
    draw();
  }

  function cancelLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function loop(now, token) {
    if (token !== runToken || state.phase !== 'playing') return;
    const dt = Math.min((now - lastFrame) / 1000, .04);
    lastFrame = now;
    state.elapsed = Math.max(0, now - state.startedAt);
    update(dt);
    draw();
    updateHud();
    if (state.phase === 'playing') rafId = requestAnimationFrame(t => loop(t, token));
  }

  function movementVector() {
    let x = 0;
    let y = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) x += 1;
    if (keys.has('ArrowUp') || keys.has('w')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('s')) y += 1;
    x += stick.x;
    y += stick.y;
    if (pointerTarget) {
      const dx = pointerTarget.x - state.player.x;
      const dy = pointerTarget.y - state.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 7) { x += dx / dist; y += dy / dist; }
      else pointerTarget = null;
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  function update(dt) {
    const move = movementVector();
    const p = state.player;
    const speed = Math.min(W, H) * .47;
    if (move.x || move.y) {
      p.angle = Math.atan2(move.y, move.x);
      p.x += move.x * speed * dt;
      p.y += move.y * speed * dt;
      p.trail.unshift({ x: p.x, y: p.y, life: 1 });
      if (p.trail.length > 14) p.trail.pop();
    }
    p.x = Math.max(20, Math.min(W - 20, p.x));
    p.y = Math.max(20, Math.min(H - 20, p.y));
    p.trail.forEach(t => { t.life -= dt * 3.3; });
    p.trail = p.trail.filter(t => t.life > 0);
    state.flash = Math.max(0, state.flash - dt * 2.5);
    updateHazards(state.elapsed / 1000);
    resolveCollisions();
  }

  function updateHazards(seconds) {
    state.hazards.forEach((h, index) => {
      const a = h.phase + seconds * h.speed * state.difficulty;
      h.x = h.cx + Math.cos(a) * h.rx;
      h.y = h.cy + Math.sin(a * (index === 2 ? 1.45 : 1)) * h.ry;
    });
  }

  function overlaps(a, b, padding = 0) {
    return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + padding;
  }

  function resolveCollisions(options = {}) {
    if (state.phase !== 'playing') return;
    for (const cell of state.cells) {
      if (cell.active && overlaps(state.player, cell, 4)) collectCell(cell);
    }
    if (!options.ignoreHazards && state.phase === 'playing') {
      for (const hazard of state.hazards) {
        if (overlaps(state.player, hazard, -2)) {
          finish(false);
          break;
        }
      }
    }
  }

  function collectCell(cell) {
    if (!cell.active || state.phase !== 'playing') return;
    cell.active = false;
    state.score += 1;
    state.progress = state.score / 3;
    state.difficulty = 1 + state.score * .28;
    state.flash = 1;
    if (state.score === 3) finish(true);
    else updateHud();
  }

  function finish(won) {
    if (state.phase !== 'playing') return;
    state.elapsed = Math.max(state.elapsed, performance.now() - state.startedAt, 1);
    state.phase = won ? 'won' : 'lost';
    state.progress = won ? 1 : state.progress;
    cancelLoop();
    if (won && (!state.best || state.elapsed < state.best)) {
      state.best = state.elapsed;
      writeBest(state.best);
    }
    outcomeOverlay.hidden = false;
    const icon = outcomeOverlay.querySelector('.outcome-icon');
    if (won) {
      icon.textContent = '✓';
      icon.style.borderColor = 'var(--cyan)';
      icon.style.color = 'var(--cyan)';
      resultKicker.textContent = 'DELIVERY COMPLETE';
      resultEl.textContent = 'Cargo secured.';
      resultDetail.textContent = `Route cleared in ${formatTime(state.elapsed)} · Best ${formatTime(state.best)}`;
    } else {
      icon.textContent = '×';
      icon.style.borderColor = 'var(--red)';
      icon.style.color = 'var(--red)';
      resultKicker.textContent = 'COURIER SIGNAL LOST';
      resultEl.textContent = 'Sentry collision.';
      resultDetail.textContent = `${state.score} of 3 cells recovered · Recalibrate and retry.`;
    }
    updateHud();
    draw();
  }

  function updateHud() {
    scoreEl.textContent = `${state.score} / 3`;
    timeEl.textContent = formatTime(state.elapsed);
    bestEl.textContent = state.best ? formatTime(state.best) : '--:--.-';
    threatEl.textContent = state.score === 0 ? 'LOW' : state.score === 1 ? 'RISING' : 'HIGH';
    threatEl.style.color = state.score < 2 ? 'var(--cyan)' : 'var(--red)';
    cellIndicators.forEach((el, i) => el.classList.toggle('active', i < state.score));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawField();
    if (state.cells.length) {
      state.cells.forEach(drawCell);
      state.hazards.forEach(drawHazard);
      drawPlayer();
    }
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(83,242,223,${state.flash * .08})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawField() {
    const bg = ctx.createRadialGradient(W * .5, H * .45, 10, W * .5, H * .45, W * .7);
    bg.addColorStop(0, '#101832');
    bg.addColorStop(.55, '#0a1022');
    bg.addColorStop(1, '#060a15');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(116,140,198,.10)';
    ctx.lineWidth = 1;
    const grid = Math.max(34, W / 22);
    ctx.beginPath();
    for (let x = 0; x <= W; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(83,242,223,.12)';
    ctx.setLineDash([4, 10]);
    ctx.beginPath();
    ctx.ellipse(W * .54, H * .5, W * .4, H * .31, -.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 42; i++) {
      const x = ((i * 97 + 31) % 997) / 997 * W;
      const y = ((i * 61 + 17) % 503) / 503 * H;
      ctx.fillStyle = i % 7 === 0 ? 'rgba(83,242,223,.4)' : 'rgba(190,205,245,.22)';
      ctx.fillRect(x, y, i % 5 === 0 ? 1.5 : 1, i % 5 === 0 ? 1.5 : 1);
    }
    ctx.strokeStyle = 'rgba(83,242,223,.32)';
    ctx.strokeRect(8.5, 8.5, W - 17, H - 17);
  }

  function drawCell(cell) {
    if (!cell.active) return;
    const pulse = 1 + Math.sin(performance.now() / 260 + cell.phase) * .12;
    ctx.save();
    ctx.translate(cell.x, cell.y);
    ctx.rotate(performance.now() / 1300 + cell.phase);
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#53f2df';
    ctx.strokeStyle = '#53f2df';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-11 * pulse, -11 * pulse, 22 * pulse, 22 * pulse);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(83,242,223,.22)';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = '#dffffa';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  function drawHazard(h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ff536d';
    ctx.strokeStyle = '#ff536d';
    ctx.fillStyle = 'rgba(255,83,109,.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const r = i % 2 ? h.r * .66 : h.r;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff8395';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    p.trail.forEach((t, i) => {
      ctx.beginPath();
      ctx.fillStyle = `rgba(83,242,223,${Math.max(0, t.life) * .18})`;
      ctx.arc(t.x, t.y, Math.max(1, 7 - i * .35), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#53f2df';
    ctx.fillStyle = '#dffffa';
    ctx.strokeStyle = '#53f2df';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(11, 11);
    ctx.lineTo(0, 7);
    ctx.lineTo(-11, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6558c8';
    ctx.fillRect(-3, 2, 6, 7);
    ctx.restore();
  }

  function pulseMove() {
    if (state.phase !== 'playing') startGame();
    const vector = movementVector();
    const vx = vector.x || 1;
    const vy = vector.y || 0;
    state.player.x = Math.max(20, Math.min(W - 20, state.player.x + vx * Math.min(W, H) * .10));
    state.player.y = Math.max(20, Math.min(H - 20, state.player.y + vy * Math.min(W, H) * .10));
    state.player.angle = Math.atan2(vy, vx);
    resolveCollisions();
    draw();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function updateStick(event) {
    const rect = joystick.getBoundingClientRect();
    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width * .30;
    const distance = Math.hypot(x, y);
    if (distance > max) { x = x / distance * max; y = y / distance * max; }
    stick.x = x / max;
    stick.y = y / max;
    joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
  }

  function resetStick() {
    stick.x = 0;
    stick.y = 0;
    stick.active = false;
    stick.pointerId = null;
    if (joystickKnob) joystickKnob.style.transform = '';
  }

  startButton.addEventListener('click', startGame);
  againButton.addEventListener('click', startGame);
  pulseButton.addEventListener('click', pulseMove);
  joystick.addEventListener('keydown', e => {
    const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], Enter: [1, 0], ' ': [1, 0] };
    if (map[e.key]) {
      e.preventDefault();
      if (state.phase !== 'playing') startGame();
      stick.x = map[e.key][0]; stick.y = map[e.key][1];
      pulseMove(); stick.x = 0; stick.y = 0;
    }
  });
  joystick.addEventListener('pointerdown', e => {
    if (state.phase !== 'playing') startGame();
    stick.active = true;
    stick.pointerId = e.pointerId;
    joystick.setPointerCapture(e.pointerId);
    updateStick(e);
  });
  joystick.addEventListener('pointermove', e => { if (stick.active && e.pointerId === stick.pointerId) updateStick(e); });
  joystick.addEventListener('pointerup', resetStick);
  joystick.addEventListener('pointercancel', resetStick);

  canvas.addEventListener('pointerdown', e => {
    if (state.phase !== 'playing') return;
    pointerTarget = canvasPoint(e);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (state.phase === 'playing' && canvas.hasPointerCapture(e.pointerId)) pointerTarget = canvasPoint(e);
  });
  canvas.addEventListener('pointerup', e => { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); });

  window.addEventListener('keydown', e => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d'].includes(key)) {
      e.preventDefault();
      if (state.phase === 'ready') startGame();
      keys.add(key);
    }
    if (e.key === 'Enter' && state.phase !== 'playing') startGame();
  });
  window.addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  window.addEventListener('blur', () => { keys.clear(); resetStick(); });
  window.addEventListener('resize', resize);

  function adapterAct() {
    if (state.phase !== 'playing') startGame();
    const next = state.cells.find(c => c.active);
    if (next) {
      state.player.x = next.x;
      state.player.y = next.y;
      resolveCollisions({ ignoreHazards: true });
      draw();
      updateHud();
    }
    return getPublicState();
  }

  function adapterComplete() {
    if (state.phase !== 'playing') startGame();
    while (state.phase === 'playing') adapterAct();
    return getPublicState();
  }

  function getPublicState() {
    return {
      phase: state.phase,
      score: state.score,
      progress: state.progress,
      elapsed: Math.round(state.elapsed),
      difficulty: state.difficulty,
      player: { x: Math.round(state.player.x), y: Math.round(state.player.y) },
      best: state.best === null ? null : Math.round(state.best)
    };
  }

  window.__benchmark = {
    start: () => { startGame(); return getPublicState(); },
    act: adapterAct,
    complete: adapterComplete,
    reset: () => { resetGame(); return getPublicState(); },
    getState: getPublicState
  };

  resize();
  resetGame();
})();
