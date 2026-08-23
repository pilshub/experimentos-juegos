(() => {
  'use strict';

  const BEST_KEY = 'bench.pulse-stop.best-total';
  const rounds = [
    { width: 24, center: 50, speed: 0.72, label: 'CALIBRATION' },
    { width: 16, center: 68, speed: 0.98, label: 'ACCELERATION' },
    { width: 10, center: 35, speed: 1.28, label: 'FINAL PULSE' }
  ];

  const el = {
    stage: document.getElementById('stage'),
    track: document.getElementById('track'),
    target: document.getElementById('target'),
    marker: document.getElementById('marker'),
    impact: document.getElementById('impact'),
    primary: document.getElementById('primaryAction'),
    start: document.getElementById('startButton'),
    actionText: document.getElementById('actionText'),
    startText: document.getElementById('startText'),
    score: document.getElementById('score'),
    best: document.getElementById('bestScore'),
    roundNumber: document.getElementById('roundNumber'),
    roundLabel: document.getElementById('roundLabel'),
    speedLabel: document.getElementById('speedLabel'),
    result: document.getElementById('result'),
    detail: document.getElementById('resultDetail'),
    feedback: document.getElementById('feedback'),
    dial: document.getElementById('dialProgress'),
    pips: [...document.querySelectorAll('.pip')]
  };

  const state = {
    phase: 'ready',
    round: 0,
    score: 0,
    progress: 0,
    roundScores: [],
    markerPosition: 4,
    startedAt: 0,
    raf: 0,
    timer: 0,
    locked: false
  };

  function readBest() {
    const value = Number.parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
    return Number.isFinite(value) ? Math.max(0, Math.min(300, value)) : 0;
  }

  function setFeedback(kind, title, detail, icon) {
    el.feedback.className = `feedback${kind ? ` ${kind}` : ''}`;
    el.feedback.querySelector('.feedback-icon').textContent = icon;
    el.result.textContent = title;
    el.detail.textContent = detail;
  }

  function updateScore() {
    el.score.textContent = String(state.score).padStart(3, '0');
    el.roundNumber.textContent = state.phase === 'ready' ? '0' : String(Math.min(state.round + 1, 3));
    const completed = state.roundScores.length;
    el.dial.style.strokeDashoffset = String(138.23 * (1 - completed / 3));
  }

  function clearAsync() {
    cancelAnimationFrame(state.raf);
    clearTimeout(state.timer);
    state.raf = 0;
    state.timer = 0;
  }

  function configureRound() {
    const config = rounds[state.round];
    el.target.style.width = `${config.width}%`;
    el.target.style.left = `${config.center - config.width / 2}%`;
    el.roundLabel.textContent = `ROUND 0${state.round + 1} / ${config.label}`;
    el.speedLabel.textContent = `VELOCITY ${(config.speed * 1.35).toFixed(1)}×`;
    el.pips.forEach((pip, index) => pip.classList.toggle('current', index === state.round));
    state.markerPosition = 4;
    el.marker.style.left = '4%';
  }

  function animate(now) {
    if (state.phase !== 'playing' || state.locked) return;
    if (!state.startedAt) state.startedAt = now;
    const elapsed = (now - state.startedAt) / 1000;
    const travel = (elapsed * rounds[state.round].speed) % 2;
    const normalized = travel <= 1 ? travel : 2 - travel;
    state.markerPosition = 4 + normalized * 92;
    el.marker.style.left = `${state.markerPosition}%`;
    state.progress = Math.round(((state.round + normalized) / 3) * 1000) / 10;
    state.raf = requestAnimationFrame(animate);
  }

  function beginRound() {
    state.locked = false;
    state.phase = 'playing';
    state.startedAt = 0;
    configureRound();
    el.stage.classList.add('playing');
    el.stage.classList.remove('hit-flash', 'miss-flash');
    el.primary.disabled = false;
    el.actionText.textContent = 'STOP PULSE';
    setFeedback('', `Round ${state.round + 1} armed`, 'Find the center of the signal window', '⌁');
    updateScore();
    state.raf = requestAnimationFrame(animate);
  }

  function startGame() {
    clearAsync();
    state.round = 0;
    state.score = 0;
    state.progress = 0;
    state.roundScores = [];
    state.locked = false;
    el.pips.forEach(pip => {
      pip.className = 'pip';
      pip.querySelector('b').textContent = '—';
    });
    el.startText.textContent = 'RESTART';
    beginRound();
  }

  function finishGame() {
    state.phase = 'won';
    state.progress = 100;
    state.locked = false;
    el.stage.classList.remove('playing');
    el.primary.disabled = true;
    el.actionText.textContent = 'SEQUENCE COMPLETE';
    el.startText.textContent = 'PLAY AGAIN';
    el.roundLabel.textContent = 'SEQUENCE COMPLETE';
    el.speedLabel.textContent = 'SIGNAL LOCKED';
    el.pips.forEach(pip => pip.classList.remove('current'));

    const oldBest = readBest();
    const isNewBest = state.score > oldBest;
    if (isNewBest) localStorage.setItem(BEST_KEY, String(state.score));
    el.best.textContent = String(Math.max(oldBest, state.score)).padStart(3, '0');

    let rank = 'Signal acquired';
    if (state.score >= 285) rank = 'Perfect synchronization';
    else if (state.score >= 240) rank = 'Elite timing';
    else if (state.score < 150) rank = 'Calibration needed';
    setFeedback('hit', rank, `${state.score} / 300 total${isNewBest ? ' • New personal best' : ''}`, '✓');
    updateScore();
  }

  function resolveStop(options = {}) {
    if (state.phase !== 'playing' || state.locked) return false;
    state.locked = true;
    cancelAnimationFrame(state.raf);

    const config = rounds[state.round];
    if (Number.isFinite(options.position)) {
      state.markerPosition = options.position;
      el.marker.style.left = `${state.markerPosition}%`;
    }
    const distance = Math.abs(state.markerPosition - config.center);
    const accuracy = Math.max(0, Math.round(100 * (1 - distance / 50)));
    const hit = distance <= config.width / 2;

    state.roundScores.push(accuracy);
    state.score += accuracy;
    state.progress = Math.round(((state.round + 1) / 3) * 1000) / 10;
    el.primary.disabled = true;
    el.pips[state.round].querySelector('b').textContent = String(accuracy);
    el.pips[state.round].classList.remove('current');
    el.pips[state.round].classList.add(hit ? 'hit' : 'miss');
    el.stage.classList.remove('playing');
    el.stage.classList.add(hit ? 'hit-flash' : 'miss-flash');
    el.impact.style.left = `${state.markerPosition}%`;
    el.impact.style.borderColor = hit ? '#41e7d1' : '#ff647c';
    el.impact.classList.remove('burst');
    void el.impact.offsetWidth;
    el.impact.classList.add('burst');
    setFeedback(hit ? 'hit' : 'miss', hit ? `${accuracy}% — Signal locked` : `${accuracy}% — Outside window`, hit ? 'Clean timing. Preparing next pulse…' : 'Too early or late. Recalibrating…', hit ? '✓' : '×');
    updateScore();

    const advance = () => {
      if (state.round >= rounds.length - 1) {
        finishGame();
      } else {
        state.round += 1;
        beginRound();
      }
    };

    if (options.instant) advance();
    else state.timer = window.setTimeout(advance, 1050);
    return true;
  }

  function act() {
    if (state.phase === 'ready' || state.phase === 'won') {
      startGame();
      return true;
    }
    return resolveStop();
  }

  function complete() {
    // Run the same stop-resolution path at each target center, without transition delays.
    startGame();
    while (state.phase === 'playing') {
      const center = rounds[state.round].center;
      resolveStop({ position: center, instant: true });
    }
    return getState();
  }

  function reset() {
    clearAsync();
    state.phase = 'ready';
    state.round = 0;
    state.score = 0;
    state.progress = 0;
    state.roundScores = [];
    state.markerPosition = 4;
    state.startedAt = 0;
    state.locked = false;
    el.marker.style.left = '4%';
    el.target.style.width = '24%';
    el.target.style.left = '38%';
    el.stage.className = 'stage';
    el.primary.disabled = true;
    el.actionText.textContent = 'STOP PULSE';
    el.startText.textContent = 'START SEQUENCE';
    el.roundLabel.textContent = 'SYSTEM READY';
    el.speedLabel.textContent = 'AWAITING INPUT';
    el.pips.forEach(pip => {
      pip.className = 'pip';
      pip.querySelector('b').textContent = '—';
    });
    setFeedback('', 'Ready when you are', 'Launch the sequence to begin', '⌁');
    updateScore();
    return getState();
  }

  function getState() {
    return {
      phase: state.phase,
      score: state.score,
      progress: state.progress,
      round: state.round + 1,
      roundScores: [...state.roundScores],
      markerPosition: Math.round(state.markerPosition * 10) / 10,
      best: readBest()
    };
  }

  el.start.addEventListener('click', startGame);
  el.primary.addEventListener('click', resolveStop);
  el.stage.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    resolveStop();
  });
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || state.phase !== 'playing') return;
    event.preventDefault();
    resolveStop();
  });

  window.__benchmark = { start: startGame, act, complete, reset, getState };
  el.best.textContent = readBest() ? String(readBest()).padStart(3, '0') : '—';
  reset();
})();
