const arena = document.querySelector('#arena');
const primaryButton = document.querySelector('#primaryButton');
const buttonLabel = document.querySelector('#buttonLabel');
const timerValue = document.querySelector('#timerValue');
const statusBadge = document.querySelector('#statusBadge');
const instruction = document.querySelector('#instruction');
const countdown = document.querySelector('#countdown');
const resultCard = document.querySelector('#resultCard');
const resultIcon = document.querySelector('#resultIcon');
const resultTitle = document.querySelector('#resultTitle');
const resultText = document.querySelector('#resultText');
const settingButtons = [...document.querySelectorAll('.setting-button')];
const ballCountButtons = [...document.querySelectorAll('.ball-count')];
const speedButtons = [...document.querySelectorAll('.speed')];
const targetCountButtons = [...document.querySelectorAll('.target-count')];
const trackTimeButtons = [...document.querySelectorAll('.track-time')];
const trackTimeGroup = document.querySelector('#trackTimeGroup');
const timerCard = document.querySelector('#timerCard');

const TARGET_REVEAL_MS = 900;
const COUNT_STEP_MS = 1000;
// Paths are simulated at a fixed step and then played back against the clock,
// so what gets validated is exactly what gets shown.
const STEP_MS = 1000 / 60;
// Daylight required between two balls once they stop, so a pick is unambiguous.
const BALL_GAP = 2;
// Candidate rounds to roll before settling for the roomiest one found.
const MAX_LAYOUT_TRIES = 60;
let trackSeconds = 10;
let ballCount = 6;
let speedMultiplier = 1;
let targetCount = 1;
let balls = [];
let targetIndices = new Set();
let selectedIndices = new Set();
let state = 'ready';
let animationId = null;
let trackStartedAt = 0;
let runToken = 0;
let pathSteps = 0;

function setStatus(type, label) {
  statusBadge.className = `status-badge ${type}`;
  statusBadge.querySelector('b').textContent = label;
}

function setTimer(seconds) { timerValue.textContent = `${seconds.toFixed(1)}s`; }

// The status row shows the tracking-time picker until a round starts,
// then swaps it for the live countdown.
function showTimer(playing) {
  trackTimeGroup.hidden = playing;
  timerCard.hidden = !playing;
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Plays one whole round forward at a fixed step and records where every ball is
// on every frame. Balls fly straight through each other, exactly as before —
// only where they come to rest matters.
function simulateRound(size, padding, cols, rows, width, height) {
  const dt = STEP_MS / 1000;
  const cellW = (width - padding * 2) / cols;
  const cellH = (height - padding * 2) / rows;
  const paths = [];
  const movers = [];

  for (let i = 0; i < ballCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const angle = Math.random() * Math.PI * 2;
    const speed = (92 + Math.random() * 48) * speedMultiplier;
    movers.push({
      x: padding + col * cellW + Math.random() * Math.max(0, cellW - size),
      y: padding + row * cellH + Math.random() * Math.max(0, cellH - size),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed
    });
    paths.push(new Float32Array(pathSteps * 2));
  }

  for (let step = 0; step < pathSteps; step++) {
    for (let i = 0; i < movers.length; i++) {
      const mover = movers[i];
      if (step > 0) {
        mover.x += mover.vx * dt;
        mover.y += mover.vy * dt;
        if (mover.x <= 6 || mover.x + size >= width - 6) {
          mover.vx *= -1;
          mover.x = Math.max(6, Math.min(width - size - 6, mover.x));
        }
        if (mover.y <= 6 || mover.y + size >= height - 6) {
          mover.vy *= -1;
          mover.y = Math.max(6, Math.min(height - size - 6, mover.y));
        }
      }
      paths[i][step * 2] = mover.x;
      paths[i][step * 2 + 1] = mover.y;
    }
  }

  return { paths, finalGap: smallestFinalGap(paths, size) };
}

// Closest any two balls come to each other on the last frame. Every ball is the
// same size, so the radii sum to one ball width.
function smallestFinalGap(paths, size) {
  const last = (pathSteps - 1) * 2;
  let smallest = Infinity;
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const dx = paths[j][last] - paths[i][last];
      const dy = paths[j][last + 1] - paths[i][last + 1];
      smallest = Math.min(smallest, Math.hypot(dx, dy) - size);
    }
  }
  return smallest;
}

function makeBalls() {
  balls.forEach(ball => ball.el.remove());
  balls = [];
  const width = arena.clientWidth;
  const height = arena.clientHeight;
  const size = Math.max(38, Math.min(52, width * .095));
  const padding = size * .55;
  const cols = 3;
  const rows = Math.ceil(ballCount / cols);
  pathSteps = Math.ceil(trackSeconds * 1000 / STEP_MS) + 1;

  targetIndices = new Set();
  while (targetIndices.size < targetCount) {
    targetIndices.add(Math.floor(Math.random() * ballCount));
  }

  // Keep the first rolled round that ends with everything clear of its
  // neighbours; if none does, show the roomiest of the attempts.
  let chosen = null;
  for (let attempt = 0; attempt < MAX_LAYOUT_TRIES; attempt++) {
    const candidate = simulateRound(size, padding, cols, rows, width, height);
    if (chosen === null || candidate.finalGap > chosen.finalGap) chosen = candidate;
    if (chosen.finalGap >= BALL_GAP) break;
  }

  for (let i = 0; i < ballCount; i++) {
    const el = document.createElement('button');
    el.type = 'button';
    const isTarget = targetIndices.has(i);
    el.className = `ball${isTarget ? ' target-visible' : ''}`;
    el.setAttribute('aria-label', isTarget ? 'Blue target ball' : `Green ball ${i + 1}`);
    el.tabIndex = -1;
    el.addEventListener('click', () => chooseBall(i));
    arena.appendChild(el);

    const path = chosen.paths[i];
    const ball = { el, size, path, x: path[0], y: path[1] };
    balls.push(ball);
    renderBall(ball);
  }
}

function renderBall(ball) { ball.el.style.transform = `translate3d(${ball.x}px, ${ball.y}px, 0)`; }

// Playback, not simulation: the clock picks a position along the recorded path,
// so a slow or fast frame changes smoothness but never the destination.
function animate(now) {
  if (state !== 'tracking') return;
  const elapsed = (now - trackStartedAt) / 1000;
  const exact = Math.min(elapsed / trackSeconds, 1) * (pathSteps - 1);
  const step = Math.min(Math.floor(exact), pathSteps - 2);
  const blend = exact - step;

  balls.forEach(ball => {
    const from = step * 2;
    const to = from + 2;
    ball.x = ball.path[from] + (ball.path[to] - ball.path[from]) * blend;
    ball.y = ball.path[from + 1] + (ball.path[to + 1] - ball.path[from + 1]) * blend;
    renderBall(ball);
  });

  setTimer(Math.max(0, trackSeconds - elapsed));
  if (elapsed >= trackSeconds) {
    finishTracking();
    return;
  }
  animationId = requestAnimationFrame(animate);
}

async function startRound() {
  if (state !== 'ready' && state !== 'result') return;
  const thisRun = ++runToken;
  cancelAnimationFrame(animationId);
  balls.forEach(ball => ball.el.remove());
  balls = [];
  resultCard.hidden = true;
  setTimer(trackSeconds);
  showTimer(true);
  primaryButton.disabled = true;
  buttonLabel.textContent = targetCount === 1 ? 'Watch the blue ball' : `Watch the ${targetCount} blue balls`;
  setStatus('tracking', 'Memorise');
  state = 'intro';
  settingButtons.forEach(button => button.disabled = true);

  // Balls first, so the target is on screen before anything counts down.
  makeBalls();
  instruction.textContent = `Remember the ${targetCount === 1 ? 'blue ball' : `${targetCount} blue balls`} before ${targetCount === 1 ? 'it changes' : 'they change'} colour.`;
  await delay(TARGET_REVEAL_MS);
  if (thisRun !== runToken) return;

  // The 3-2-1 runs over the balls while the target is still blue.
  for (const step of ['3', '2', '1']) {
    countdown.classList.remove('pop');
    countdown.textContent = step;
    void countdown.offsetWidth;
    countdown.classList.add('pop');
    await delay(COUNT_STEP_MS);
    if (thisRun !== runToken) return;
  }
  countdown.classList.remove('pop');
  countdown.textContent = '';

  // Movement, the clock and the fade all start on the same beat, so the target
  // bleeds into the pack over the first few seconds of tracking.
  targetIndices.forEach(index => {
    // slow-fade must land before the colour change so the long transition applies.
    balls[index].el.classList.add('slow-fade');
    balls[index].el.classList.remove('target-visible');
    balls[index].el.setAttribute('aria-label', `Green ball ${index + 1}`);
  });
  state = 'tracking';
  trackStartedAt = performance.now();
  setStatus('tracking', 'Tracking');
  instruction.textContent = `Keep following ${targetCount === 1 ? 'your target' : 'your targets'} as ${targetCount === 1 ? 'it fades' : 'they fade'} into the others.`;
  buttonLabel.textContent = 'Tracking in progress…';
  animationId = requestAnimationFrame(animate);
}

function finishTracking() {
  cancelAnimationFrame(animationId);
  state = 'choosing';
  setTimer(0);
  setStatus('choose', 'Your Turn');
  selectedIndices = new Set();
  instruction.textContent = `The balls have stopped. Select the ${targetCount} ${targetCount === 1 ? 'ball' : 'balls'} that started blue.`;
  buttonLabel.textContent = targetCount === 1 ? 'Choose a ball above' : `Choose ${targetCount} balls above`;
  balls.forEach((ball, index) => {
    ball.el.classList.remove('slow-fade');
    ball.el.classList.add('selectable');
    ball.el.tabIndex = 0;
    ball.el.setAttribute('aria-label', `Choose ball ${index + 1}`);
  });
}

function chooseBall(index) {
  if (state !== 'choosing') return;
  if (selectedIndices.has(index)) {
    selectedIndices.delete(index);
    balls[index].el.classList.remove('selected');
  } else {
    selectedIndices.add(index);
    balls[index].el.classList.add('selected');
  }
  const remaining = targetCount - selectedIndices.size;
  if (remaining > 0) {
    buttonLabel.textContent = `Choose ${remaining} more ${remaining === 1 ? 'ball' : 'balls'}`;
    return;
  }

  state = 'result';
  const correct = [...targetIndices].every(target => selectedIndices.has(target));
  balls.forEach((ball, i) => {
    ball.el.classList.remove('selectable', 'selected');
    ball.el.tabIndex = -1;
    if (targetIndices.has(i)) ball.el.classList.add('correct', 'target-visible');
    else if (!correct && selectedIndices.has(i)) ball.el.classList.add('wrong');
  });
  resultIcon.textContent = correct ? '✓' : '↻';
  resultIcon.style.background = correct ? 'var(--mint)' : 'var(--warning)';
  resultTitle.textContent = correct ? 'Sharp eyes!' : 'Almost!';
  resultText.textContent = correct ? (targetCount === 1 ? 'You tracked the correct target.' : `You tracked all ${targetCount} targets.`) : `The blue ${targetCount === 1 ? 'target is' : 'targets are'} highlighted. Try another round!`;
  resultCard.hidden = false;
  setStatus(correct ? 'tracking' : 'choose', correct ? 'Correct' : 'Try Again');
  instruction.textContent = correct ? 'Excellent focus and visual tracking!' : 'Good effort — tracking gets easier with practice.';
  primaryButton.disabled = false;
  settingButtons.forEach(button => button.disabled = false);
  showTimer(false);
  buttonLabel.textContent = 'Play Again';
}

primaryButton.addEventListener('click', () => {
  if (state === 'result') state = 'ready';
  startRound();
});

function bindSetting(buttons, updateValue) {
  buttons.forEach(button => button.addEventListener('click', () => {
    if (state !== 'ready' && state !== 'result') return;
    updateValue(Number(button.dataset.value));
    buttons.forEach(option => option.classList.toggle('active', option === button));
    instruction.textContent = `${ballCount} balls · ×${speedMultiplier} speed · ${targetCount} blue ${targetCount === 1 ? 'ball' : 'balls'} · ${trackSeconds}s tracking.`;
  }));
}

bindSetting(ballCountButtons, value => { ballCount = value; });
bindSetting(speedButtons, value => { speedMultiplier = value; });
bindSetting(targetCountButtons, value => { targetCount = value; });
bindSetting(trackTimeButtons, value => { trackSeconds = value; setTimer(value); });

function resetGame() {
  runToken += 1;
  cancelAnimationFrame(animationId);
  balls.forEach(ball => ball.el.remove());
  balls = [];
  state = 'ready';
  countdown.textContent = '';
  countdown.classList.remove('pop');
  resultCard.hidden = true;
  setTimer(trackSeconds);
  showTimer(false);
  setStatus('ready', 'Ready');
  instruction.textContent = 'Watch the blue ball, then keep tracking it once it blends in with the others.';
  primaryButton.disabled = false;
  buttonLabel.textContent = 'Start Challenge';
  settingButtons.forEach(button => button.disabled = false);
}

// Paths are baked against the arena size at the start of a round, so a resize
// invalidates whatever is in flight. Debounced, because resize arrives in
// bursts — and on mobile every time the URL bar slides away.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const interrupted = state !== 'ready';
    resetGame();
    if (interrupted) {
      instruction.textContent = 'The window changed size, so the round was reset. Start again when you are ready.';
    }
  }, 150);
});

resetGame();
