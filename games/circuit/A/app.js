(() => {
  "use strict";

  const N = 1;
  const E = 2;
  const S = 4;
  const W = 8;
  const SIZE = 4;
  const TOTAL = SIZE * SIZE;
  const STORAGE_KEY = "bench.circuitMosaic.bestMoves";
  const sourceIndex = 4;
  const destinationIndex = 11;

  const boardEl = document.getElementById("board");
  const startButton = document.getElementById("startButton");
  const startLabel = document.getElementById("startLabel");
  const moveCountEl = document.getElementById("moveCount");
  const timerEl = document.getElementById("timer");
  const bestScoreEl = document.getElementById("bestScore");
  const resultEl = document.getElementById("result");
  const subResultEl = document.getElementById("subResult");
  const poweredCountEl = document.getElementById("poweredCount");
  const progressBarEl = document.getElementById("progressBar");
  const statusCopyEl = document.querySelector(".status-copy");
  const sourceTerminal = document.querySelector(".source-terminal");
  const destinationTerminal = document.querySelector(".destination-terminal");
  const successOverlay = document.getElementById("successOverlay");

  const solvedMasks = new Array(TOTAL).fill(0);
  const tiles = [];
  let rotations = new Array(TOTAL).fill(0);
  let currentMasks = new Array(TOTAL).fill(0);
  let powered = new Set();
  let phase = "ready";
  let moves = 0;
  let startedAt = 0;
  let elapsedMs = 0;
  let timerHandle = null;
  let runNumber = 0;
  let bestMoves = readBest();

  function connect(a, b) {
    const ar = Math.floor(a / SIZE);
    const ac = a % SIZE;
    const br = Math.floor(b / SIZE);
    const bc = b % SIZE;
    if (br === ar - 1 && bc === ac) { solvedMasks[a] |= N; solvedMasks[b] |= S; }
    else if (br === ar + 1 && bc === ac) { solvedMasks[a] |= S; solvedMasks[b] |= N; }
    else if (br === ar && bc === ac + 1) { solvedMasks[a] |= E; solvedMasks[b] |= W; }
    else if (br === ar && bc === ac - 1) { solvedMasks[a] |= W; solvedMasks[b] |= E; }
  }

  [
    [4, 5], [5, 6], [6, 7], [7, 11],
    [4, 0], [0, 1], [1, 2], [2, 3],
    [5, 9], [9, 8], [8, 12], [12, 13],
    [6, 10], [10, 14], [14, 15]
  ].forEach(([a, b]) => connect(a, b));
  solvedMasks[sourceIndex] |= W;
  solvedMasks[destinationIndex] |= E;

  function readBest() {
    try {
      const value = Number.parseInt(localStorage.getItem(STORAGE_KEY), 10);
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch (_) {
      return null;
    }
  }

  function saveBest(value) {
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch (_) { /* storage can be unavailable */ }
  }

  function rotateMask(mask, turns) {
    let result = mask;
    for (let i = 0; i < turns; i += 1) {
      result = ((result << 1) & 15) | ((result & W) ? N : 0);
    }
    return result;
  }

  function scramble() {
    const pattern = [1, 2, 3, 1, 3, 2, 1, 2, 3, 1, 2, 3, 2, 1, 3, 2];
    rotations = pattern.map((turn, index) => (turn + runNumber + (index % 3 === 0 ? 1 : 0)) % 4);
    currentMasks = solvedMasks.map((mask, index) => rotateMask(mask, rotations[index]));
    const connection = tracePower();
    if (connection.won) {
      rotations[0] = (rotations[0] + 1) % 4;
      currentMasks[0] = rotateMask(solvedMasks[0], rotations[0]);
    }
  }

  function tracePower() {
    const reached = new Set();
    if ((currentMasks[sourceIndex] & W) === 0) return { reached, receiver: false, won: false };

    const queue = [sourceIndex];
    reached.add(sourceIndex);
    const directions = [
      { bit: N, opposite: S, dr: -1, dc: 0 },
      { bit: E, opposite: W, dr: 0, dc: 1 },
      { bit: S, opposite: N, dr: 1, dc: 0 },
      { bit: W, opposite: E, dr: 0, dc: -1 }
    ];

    while (queue.length) {
      const index = queue.shift();
      const row = Math.floor(index / SIZE);
      const col = index % SIZE;
      directions.forEach(({ bit, opposite, dr, dc }) => {
        if ((currentMasks[index] & bit) === 0) return;
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return;
        const next = nr * SIZE + nc;
        if ((currentMasks[next] & opposite) && !reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      });
    }

    const receiver = reached.has(destinationIndex) && Boolean(currentMasks[destinationIndex] & E);
    return { reached, receiver, won: receiver && reached.size === TOTAL };
  }

  function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function updateTimer() {
    if (phase === "playing") elapsedMs = Date.now() - startedAt;
    timerEl.textContent = formatTime(elapsedMs);
  }

  function drawTile(index) {
    const tile = tiles[index];
    const canvas = tile.canvas;
    const rect = tile.button.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const inset = Math.max(1, rect.width * .035);
    const mask = currentMasks[index] || solvedMasks[index];
    const isPowered = powered.has(index) && phase !== "ready";
    const points = [];
    if (mask & N) points.push([cx, inset]);
    if (mask & E) points.push([rect.width - inset, cy]);
    if (mask & S) points.push([cx, rect.height - inset]);
    if (mask & W) points.push([inset, cy]);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (isPowered) {
      ctx.shadowColor = "rgba(93,245,203,.75)";
      ctx.shadowBlur = Math.max(7, rect.width * .1);
    }
    ctx.strokeStyle = isPowered ? "#5df5cb" : "#54727a";
    ctx.lineWidth = Math.max(5, rect.width * .075);
    points.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    });

    ctx.shadowBlur = 0;
    ctx.fillStyle = isPowered ? "#d9fff4" : "#82999e";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, rect.width * .07), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isPowered ? "#173c3b" : "#243d45";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.5, rect.width * .025), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAll() {
    tiles.forEach((_, index) => drawTile(index));
    const rowOffset = boardEl.getBoundingClientRect().height / 8;
    sourceTerminal.style.transform = `translateY(${-rowOffset}px)`;
    destinationTerminal.style.transform = `translateY(${rowOffset}px)`;
  }

  function buildBoard() {
    boardEl.textContent = "";
    tiles.length = 0;
    for (let index = 0; index < TOTAL; index += 1) {
      const button = document.createElement("button");
      const canvas = document.createElement("canvas");
      const label = document.createElement("span");
      const row = Math.floor(index / SIZE) + 1;
      const column = (index % SIZE) + 1;
      button.type = "button";
      button.className = "tile";
      button.setAttribute("aria-label", `Rotate tile, row ${row}, column ${column}`);
      button.disabled = true;
      canvas.setAttribute("aria-hidden", "true");
      label.className = "tile-index";
      label.textContent = `${row}.${column}`;
      button.append(canvas, label);
      button.addEventListener("click", () => rotateTile(index));
      boardEl.append(button);
      tiles.push({ button, canvas });
    }
    requestAnimationFrame(drawAll);
  }

  function setTileAvailability(enabled) {
    tiles.forEach(({ button }) => { button.disabled = !enabled; });
  }

  function renderConnection(connection) {
    powered = connection.reached;
    tiles.forEach(({ button }, index) => button.classList.toggle("powered", powered.has(index)));
    poweredCountEl.textContent = String(powered.size);
    progressBarEl.style.width = `${(powered.size / TOTAL) * 100}%`;
    sourceTerminal.classList.toggle("active", powered.has(sourceIndex));
    destinationTerminal.classList.toggle("active", connection.receiver);
    drawAll();
  }

  function evaluateConnectivity() {
    const connection = tracePower();
    renderConnection(connection);
    if (phase === "playing" && connection.won) finishGame();
    else if (phase === "playing") {
      statusCopyEl.className = powered.size ? "status-copy live" : "status-copy";
      resultEl.textContent = powered.size ? "Current flowing" : "Circuit incomplete";
      subResultEl.textContent = powered.size ? `${powered.size} nodes linked to the source` : "Rotate tiles to open a route from the source";
    }
    return connection;
  }

  function rotateTile(index) {
    if (phase !== "playing") return false;
    rotations[index] = (rotations[index] + 1) % 4;
    currentMasks[index] = rotateMask(solvedMasks[index], rotations[index]);
    moves += 1;
    moveCountEl.textContent = String(moves).padStart(2, "0");
    tiles[index].button.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(5deg)" }, { transform: "rotate(0deg)" }],
      { duration: 140, easing: "ease-out" }
    );
    evaluateConnectivity();
    return true;
  }

  function startGame() {
    clearInterval(timerHandle);
    runNumber += 1;
    phase = "playing";
    moves = 0;
    elapsedMs = 0;
    startedAt = Date.now();
    scramble();
    moveCountEl.textContent = "00";
    timerEl.textContent = "00:00";
    startLabel.textContent = "Restart circuit";
    setTileAvailability(true);
    successOverlay.classList.remove("show");
    statusCopyEl.className = "status-copy";
    resultEl.textContent = "Circuit incomplete";
    subResultEl.textContent = "Rotate tiles to open a route from the source";
    evaluateConnectivity();
    timerHandle = setInterval(updateTimer, 250);
    return getState();
  }

  function finishGame() {
    if (phase !== "playing") return;
    elapsedMs = Date.now() - startedAt;
    clearInterval(timerHandle);
    timerHandle = null;
    phase = "won";
    updateTimer();
    setTileAvailability(false);
    statusCopyEl.className = "status-copy won";
    resultEl.textContent = "Circuit complete!";
    subResultEl.textContent = `All 16 nodes powered in ${moves} ${moves === 1 ? "move" : "moves"}`;
    if (bestMoves === null || moves < bestMoves) {
      bestMoves = moves;
      saveBest(bestMoves);
      bestScoreEl.textContent = String(bestMoves);
      subResultEl.textContent += " — new best";
    }
    successOverlay.classList.remove("show");
    void successOverlay.offsetWidth;
    successOverlay.classList.add("show");
  }

  function resetGame() {
    clearInterval(timerHandle);
    timerHandle = null;
    phase = "ready";
    moves = 0;
    elapsedMs = 0;
    rotations.fill(0);
    currentMasks = solvedMasks.slice();
    powered = new Set();
    moveCountEl.textContent = "00";
    timerEl.textContent = "00:00";
    startLabel.textContent = "Start circuit";
    resultEl.textContent = "Circuit on standby";
    subResultEl.textContent = "Press Start circuit to begin";
    statusCopyEl.className = "status-copy";
    poweredCountEl.textContent = "0";
    progressBarEl.style.width = "0%";
    sourceTerminal.classList.remove("active");
    destinationTerminal.classList.remove("active");
    successOverlay.classList.remove("show");
    setTileAvailability(false);
    drawAll();
    return getState();
  }

  function completeGame() {
    if (phase !== "playing") startGame();
    rotations.fill(0);
    currentMasks = solvedMasks.slice();
    moves += 1;
    moveCountEl.textContent = String(moves).padStart(2, "0");
    evaluateConnectivity();
    return getState();
  }

  function benchmarkAct() {
    if (phase !== "playing") startGame();
    rotateTile(0);
    return getState();
  }

  function getState() {
    return {
      phase,
      score: moves,
      progress: powered.size / TOTAL,
      powered: powered.size,
      elapsedMs,
      bestMoves
    };
  }

  startButton.addEventListener("click", startGame);
  window.addEventListener("resize", drawAll);
  if ("ResizeObserver" in window) new ResizeObserver(drawAll).observe(boardEl);

  bestScoreEl.textContent = bestMoves === null ? "—" : String(bestMoves);
  currentMasks = solvedMasks.slice();
  buildBoard();
  resetGame();

  window.__benchmark = {
    start: startGame,
    act: benchmarkAct,
    complete: completeGame,
    reset: resetGame,
    getState
  };
})();
