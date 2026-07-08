const pages = {
  start: document.querySelector("#startPage"),
  countdown: document.querySelector("#countdownPage"),
  memory: document.querySelector("#memoryPage"),
  challenge: document.querySelector("#challengePage"),
  result: document.querySelector("#resultPage"),
};

const startButton = document.querySelector("#startButton");
const countdownNumber = document.querySelector("#countdownNumber");
const qrGrid = document.querySelector("#qrGrid");
const memoryTimer = document.querySelector("#memoryTimer");
const challengeButton = document.querySelector("#challengeButton");
const challengeProgress = document.querySelector("#challengeProgress");
const challengeQr = document.querySelector("#challengeQr");
const recallTimer = document.querySelector("#recallTimer");
const answerFeedback = document.querySelector("#answerFeedback");
const numberGrid = document.querySelector("#numberGrid");
const scoreText = document.querySelector("#scoreText");
const accuracyRing = document.querySelector(".accuracy-ring");
const accuracyText = document.querySelector("#accuracyText");
const recallTimeText = document.querySelector("#recallTimeText");
const memoriseTimeText = document.querySelector("#memoriseTimeText");
const resultFeedback = document.querySelector("#resultFeedback");
const playAgainButton = document.querySelector("#playAgainButton");
const shareButton = document.querySelector("#shareButton");

const QR_COUNT = 10;
const QR_SIZE = 29;
const MEMORY_SECONDS = 180;

let qrCodes = [];
let testOrder = [];
let currentQuestion = 0;
let score = 0;
let memoryStartedAt = 0;
let challengeStartedAt = 0;
let memoriseSeconds = MEMORY_SECONDS;
let recallSeconds = 0;
let memoryTimerId = null;
let recallTimerId = null;
let latestScoreSummary = "";

function showPage(pageName) {
  Object.values(pages).forEach((page) => page.classList.remove("active"));
  pages[pageName].classList.add("active");
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function randomSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function isFinderBuffer(row, column) {
  const nearTop = row <= 7;
  const nearLeft = column <= 7;
  const nearRight = column >= QR_SIZE - 8;
  const nearBottom = row >= QR_SIZE - 8;
  return (nearTop && nearLeft) || (nearTop && nearRight) || (nearBottom && nearLeft);
}

function finderValue(row, column, startRow, startColumn) {
  const localRow = row - startRow;
  const localColumn = column - startColumn;
  const edge = localRow === 0 || localRow === 6 || localColumn === 0 || localColumn === 6;
  const center =
    localRow >= 2 && localRow <= 4 && localColumn >= 2 && localColumn <= 4;
  return edge || center;
}

function alignmentValue(row, column) {
  const center = QR_SIZE - 7;
  const localRow = Math.abs(row - center);
  const localColumn = Math.abs(column - center);
  const outer = localRow === 2 || localColumn === 2;
  const inner = localRow === 0 && localColumn === 0;
  return outer || inner;
}

function createQrMatrix(seed) {
  const random = seededRandom(seed);
  const matrix = [];

  for (let row = 0; row < QR_SIZE; row += 1) {
    matrix[row] = [];
    for (let column = 0; column < QR_SIZE; column += 1) {
      if (row <= 6 && column <= 6) {
        matrix[row][column] = finderValue(row, column, 0, 0);
      } else if (row <= 6 && column >= QR_SIZE - 7) {
        matrix[row][column] = finderValue(row, column, 0, QR_SIZE - 7);
      } else if (row >= QR_SIZE - 7 && column <= 6) {
        matrix[row][column] = finderValue(row, column, QR_SIZE - 7, 0);
      } else if (isFinderBuffer(row, column)) {
        matrix[row][column] = false;
      } else if (
        row >= QR_SIZE - 9 &&
        row <= QR_SIZE - 5 &&
        column >= QR_SIZE - 9 &&
        column <= QR_SIZE - 5
      ) {
        matrix[row][column] = alignmentValue(row, column);
      } else if (row === 8 || column === 8) {
        matrix[row][column] = (row + column + seed) % 2 === 0;
      } else {
        const structuredPatch =
          ((row * 3 + column * 5 + seed) % 17 === 0) ||
          ((row + seed) % 11 === 0 && column % 3 !== 1) ||
          ((column + seed) % 13 === 0 && row % 4 !== 2);
        matrix[row][column] = structuredPatch || random() > 0.42;
      }
    }
  }

  return matrix;
}

function buildQrElement(qrCode) {
  const visual = document.createElement("div");
  visual.className = "qr-visual";
  visual.style.gridTemplateColumns = `repeat(${QR_SIZE}, 1fr)`;
  visual.style.gridTemplateRows = `repeat(${QR_SIZE}, 1fr)`;

  qrCode.matrix.flat().forEach((isDark) => {
    const module = document.createElement("span");
    module.className = isDark ? "qr-module dark" : "qr-module";
    visual.appendChild(module);
  });

  return visual;
}

function createQrCodes() {
  return Array.from({ length: QR_COUNT }, (_, index) => ({
    id: index + 1,
    matrix: createQrMatrix(randomSeed() + index * 97),
  }));
}

function renderMemoryGrid() {
  qrGrid.innerHTML = "";
  qrCodes.forEach((qrCode, index) => {
    const tile = document.createElement("article");
    tile.className = "qr-tile";
    tile.style.animationDelay = `${index * 40}ms`;
    tile.appendChild(buildQrElement(qrCode));

    const label = document.createElement("strong");
    label.textContent = String(qrCode.id);
    tile.appendChild(label);
    qrGrid.appendChild(tile);
  });
}

function renderNumberGrid(correctId) {
  numberGrid.innerHTML = "";
  answerFeedback.textContent = "";
  answerFeedback.className = "answer-feedback";

  qrCodes.forEach((qrCode) => {
    const button = document.createElement("button");
    button.className = "number-button";
    button.type = "button";
    button.textContent = qrCode.id;
    button.addEventListener("click", () => handleAnswer(button, qrCode.id, correctId));
    numberGrid.appendChild(button);
  });
}

function startCountdown() {
  showPage("countdown");
  let count = 3;
  countdownNumber.textContent = count;
  restartCountdownAnimation();

  const countdownId = window.setInterval(() => {
    count -= 1;

    if (count === 0) {
      window.clearInterval(countdownId);
      startMemoryStage();
      return;
    }

    countdownNumber.textContent = count;
    restartCountdownAnimation();
  }, 1000);
}

function restartCountdownAnimation() {
  countdownNumber.style.animation = "none";
  countdownNumber.offsetHeight;
  countdownNumber.style.animation = "";
}

function startMemoryStage() {
  showPage("memory");
  renderMemoryGrid();
  memoryStartedAt = Date.now();
  memoriseSeconds = MEMORY_SECONDS;
  memoryTimer.textContent = formatTime(MEMORY_SECONDS);
  window.clearInterval(memoryTimerId);

  memoryTimerId = window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - memoryStartedAt) / 1000);
    const remaining = Math.max(0, MEMORY_SECONDS - elapsed);
    memoryTimer.textContent = formatTime(remaining);

    if (remaining <= 0) {
      startChallengeStage();
    }
  }, 250);
}

function startChallengeStage() {
  if (!pages.memory.classList.contains("active")) {
    return;
  }

  window.clearInterval(memoryTimerId);
  memoriseSeconds = Math.min(
    MEMORY_SECONDS,
    Math.max(0, Math.round((Date.now() - memoryStartedAt) / 1000))
  );
  currentQuestion = 0;
  score = 0;
  testOrder = shuffle(qrCodes);
  challengeStartedAt = Date.now();
  recallSeconds = 0;
  recallTimer.textContent = "00:00";
  showPage("challenge");
  startRecallTimer();
  showQuestion();
}

function startRecallTimer() {
  window.clearInterval(recallTimerId);
  recallTimerId = window.setInterval(() => {
    recallSeconds = Math.max(0, Math.floor((Date.now() - challengeStartedAt) / 1000));
    recallTimer.textContent = formatTime(recallSeconds);
  }, 250);
}

function showQuestion() {
  const qrCode = testOrder[currentQuestion];
  challengeProgress.textContent = `QR Code ${currentQuestion + 1} of ${QR_COUNT}`;
  challengeQr.innerHTML = "";
  challengeQr.appendChild(buildQrElement(qrCode));
  renderNumberGrid(qrCode.id);
}

function handleAnswer(selectedButton, selectedId, correctId) {
  const buttons = [...numberGrid.querySelectorAll("button")];
  buttons.forEach((button) => {
    button.disabled = true;
    if (Number(button.textContent) === correctId) {
      button.classList.add("correct");
    }
  });

  if (selectedId === correctId) {
    score += 1;
    selectedButton.classList.add("correct");
    answerFeedback.textContent = "Correct";
    answerFeedback.classList.add("correct");
  } else {
    selectedButton.classList.add("incorrect");
    answerFeedback.textContent = `Incorrect. The correct number was ${correctId}.`;
    answerFeedback.classList.add("incorrect");
  }

  window.setTimeout(() => {
    currentQuestion += 1;

    if (currentQuestion >= QR_COUNT) {
      showResults();
      return;
    }

    showQuestion();
  }, 850);
}

function showResults() {
  window.clearInterval(recallTimerId);
  recallSeconds = Math.max(1, Math.round((Date.now() - challengeStartedAt) / 1000));
  const accuracy = Math.round((score / QR_COUNT) * 100);

  scoreText.textContent = `You remembered ${score}/${QR_COUNT} QR Code`;
  accuracyText.textContent = `${accuracy}%`;
  accuracyRing.style.setProperty("--accuracy", `${accuracy}%`);
  recallTimeText.textContent = formatTime(recallSeconds);
  memoriseTimeText.textContent = formatTime(memoriseSeconds);

  if (accuracy <= 50) {
    resultFeedback.textContent = "Keep training your memory!";
    resultFeedback.className = "result-feedback";
  } else if (accuracy <= 80) {
    resultFeedback.textContent = "Great memory potential!";
    resultFeedback.className = "result-feedback";
  } else {
    resultFeedback.textContent = "Memory Master Level!";
    resultFeedback.className = "result-feedback master";
  }

  latestScoreSummary =
    `I remembered ${score}/${QR_COUNT} QR Code in the QR Code Memory Game Challenge. ` +
    `Accuracy: ${accuracy}%. Recall time: ${formatTime(recallSeconds)}.`;
  showPage("result");
}

function startGame() {
  window.clearInterval(memoryTimerId);
  window.clearInterval(recallTimerId);
  qrCodes = createQrCodes();
  startCountdown();
}

async function shareScore() {
  const shareData = {
    title: "QR Code Memory Game Challenge",
    text: latestScoreSummary,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await navigator.clipboard.writeText(latestScoreSummary);
    shareButton.textContent = "Score Copied";
  } catch (error) {
    shareButton.textContent = "Score Ready";
  }

  window.setTimeout(() => {
    shareButton.textContent = "Share Score";
  }, 1600);
}

startButton.addEventListener("click", startGame);
challengeButton.addEventListener("click", startChallengeStage);
playAgainButton.addEventListener("click", startGame);
shareButton.addEventListener("click", shareScore);
