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
// Kept in sync with --ball-fade in styles.css so the two can't drift apart.
const FADE_MS = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ball-fade')) || 3000;
// Three countdown steps spread across the fade, so they end together.
const COUNT_STEP_MS = FADE_MS / 3;
let trackSeconds = 10;
let ballCount = 6;
let speedMultiplier = 1;
let targetCount = 1;
let balls = [];
let targetIndices = new Set();
let selectedIndices = new Set();
let state = 'ready';
let animationId = null;
let lastFrame = 0;
let trackStartedAt = 0;
let runToken = 0;

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

function makeBalls() {
  balls.forEach(ball => ball.el.remove());
  balls = [];
  const size = Math.max(38, Math.min(52, arena.clientWidth * .095));
  const padding = size * .55;
  const cols = 3;
  const rows = Math.ceil(ballCount / cols);

  targetIndices = new Set();
  while (targetIndices.size < targetCount) {
    targetIndices.add(Math.floor(Math.random() * ballCount));
  }
  for (let i = 0; i < ballCount; i++) {
    const el = document.createElement('button');
    el.type = 'button';
    const isTarget = targetIndices.has(i);
    el.className = `ball${isTarget ? ' target-visible' : ''}`;
    el.setAttribute('aria-label', isTarget ? 'Blue target ball' : `Green ball ${i + 1}`);
    el.tabIndex = -1;
    arena.appendChild(el);

    const cellW = (arena.clientWidth - padding * 2) / cols;
    const cellH = (arena.clientHeight - padding * 2) / rows;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padding + col * cellW + Math.random() * Math.max(0, cellW - size);
    const y = padding + row * cellH + Math.random() * Math.max(0, cellH - size);
    const angle = Math.random() * Math.PI * 2;
    const speed = (92 + Math.random() * 48) * speedMultiplier;
    const ball = { el, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size };
    el.addEventListener('click', () => chooseBall(i));
    balls.push(ball);
    renderBall(ball);
  }
}

function renderBall(ball) { ball.el.style.transform = `translate3d(${ball.x}px, ${ball.y}px, 0)`; }

function animate(now) {
  if (state !== 'tracking' && state !== 'intro') return;
  const dt = Math.min((now - lastFrame) / 1000 || 0, .032);
  lastFrame = now;
  const width = arena.clientWidth;
  const height = arena.clientHeight;

  balls.forEach(ball => {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x <= 6 || ball.x + ball.size >= width - 6) {
      ball.vx *= -1;
      ball.x = Math.max(6, Math.min(width - ball.size - 6, ball.x));
    }
    if (ball.y <= 6 || ball.y + ball.size >= height - 6) {
      ball.vy *= -1;
      ball.y = Math.max(6, Math.min(height - ball.size - 6, ball.y));
    }
    renderBall(ball);
  });

  if (state === 'tracking') {
    const elapsed = (now - trackStartedAt) / 1000;
    setTimer(Math.max(0, trackSeconds - elapsed));
    if (elapsed >= trackSeconds) {
      finishTracking();
      return;
    }
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

  targetIndices.forEach(index => {
    // slow-fade must land before the colour change so the long transition applies.
    balls[index].el.classList.add('slow-fade');
    balls[index].el.classList.remove('target-visible');
    balls[index].el.setAttribute('aria-label', `Green ball ${index + 1}`);
  });
  instruction.textContent = `Watch ${targetCount === 1 ? 'it' : 'them'} fade to green. Tracking starts at zero.`;

  // The 3-2-1 runs over the balls for exactly as long as the fade takes, so
  // nothing moves and the clock stays full until the colour has gone.
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

  state = 'tracking';
  trackStartedAt = performance.now();
  setStatus('tracking', 'Tracking');
  instruction.textContent = `All ${ballCount} balls now look the same. Keep following ${targetCount === 1 ? 'your target' : 'your targets'}.`;
  buttonLabel.textContent = 'Tracking in progress…';
  lastFrame = performance.now();
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

window.addEventListener('resize', () => {
  if (state === 'ready') resetGame();
});

resetGame();
