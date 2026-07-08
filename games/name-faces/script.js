const FEMALE_NAMES = ["Emma", "Olivia", "Sophia", "Ava", "Mia", "Charlotte", "Amelia", "Harper", "Evelyn", "Grace", "Ella", "Lily", "Chloe", "Nora", "Abigail", "Emily", "Isabella", "Scarlett", "Hannah", "Victoria", "Zoe", "Sarah", "Claire", "Lucy", "Alice", "Julia", "Sophie"];
const MALE_NAMES = ["James", "Daniel", "Michael", "William", "Benjamin", "Lucas", "Henry", "Alexander", "Jack", "Samuel", "Matthew", "Joseph", "David", "Thomas", "Andrew", "Joshua", "Christopher", "Ryan", "Nathan", "Adam", "Luke", "John", "Aaron", "Dylan", "Robert", "Ethan"];
const COMMON_NAMES = FEMALE_NAMES.concat(MALE_NAMES);
const GAME_SIZE = 10;
const MEMORY_SECONDS = 60;
const COUNTDOWN_SECONDS = 3;

const screens = {
  start: document.querySelector("#startPage"),
  countdown: document.querySelector("#countdownPage"),
  memory: document.querySelector("#memoryPage"),
  quiz: document.querySelector("#quizPage"),
  result: document.querySelector("#resultPage")
};

const countdownNumber = document.querySelector("#countdownNumber");
const peopleGrid = document.querySelector("#peopleGrid");
const memoryTimer = document.querySelector("#memoryTimer");
const quizTimer = document.querySelector("#quizTimer");
const quizProgress = document.querySelector("#quizProgress");
const quizFace = document.querySelector("#quizFace");
const answerOptions = document.querySelector("#answerOptions");
const scoreText = document.querySelector("#scoreText");
const accuracyText = document.querySelector("#accuracyText");
const recallTimeText = document.querySelector("#recallTimeText");
const memoryTimeText = document.querySelector("#memoryTimeText");
const feedbackText = document.querySelector("#feedbackText");
const scoreRing = document.querySelector(".score-ring");

let people = [];
let quizOrder = [];
let currentQuestion = 0;
let score = 0;
let memoryStartedAt = 0;
let quizStartedAt = 0;
let memoryElapsed = 0;
let recallElapsed = 0;
let countdownInterval = null;
let memoryInterval = null;
let quizInterval = null;

document.querySelector("#startBtn").addEventListener("click", startGame);
document.querySelector("#quizBtn").addEventListener("click", startQuiz);
document.querySelector("#playAgainBtn").addEventListener("click", startGame);
document.querySelector("#shareBtn").addEventListener("click", shareScore);

function startGame() {
  clearInterval(countdownInterval);
  clearInterval(memoryInterval);
  clearInterval(quizInterval);
  people = createPeople();
  quizOrder = shuffle(people.slice());
  currentQuestion = 0;
  score = 0;
  memoryElapsed = 0;
  recallElapsed = 0;
  renderMemoryCards();
  startCountdown();
}

function startCountdown() {
  let count = COUNTDOWN_SECONDS;
  countdownNumber.textContent = count;
  countdownNumber.classList.remove("countdown-pop");
  showScreen("countdown");

  countdownInterval = setInterval(() => {
    count -= 1;
    if (count === 0) {
      clearInterval(countdownInterval);
      showScreen("memory");
      startMemoryTimer();
      return;
    }
    countdownNumber.textContent = count;
    countdownNumber.classList.remove("countdown-pop");
    void countdownNumber.offsetWidth;
    countdownNumber.classList.add("countdown-pop");
  }, 1000);
}

function createPeople() {
  const femaleNames = shuffle(FEMALE_NAMES.slice());
  const maleNames = shuffle(MALE_NAMES.slice());
  const usedPhotos = new Set();
  const groupPlan = shuffle(["women", "women", "women", "women", "women", "men", "men", "men", "men", "men"]);

  return groupPlan.map((group, index) => {
    const name = group === "women" ? femaleNames.pop() : maleNames.pop();
    let photoKey = "";

    while (!photoKey || usedPhotos.has(photoKey)) {
      const number = Math.floor(Math.random() * 99);
      photoKey = group + "/" + number;
    }

    usedPhotos.add(photoKey);

    return {
      id: window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + index,
      name: name,
      gender: group === "women" ? "female" : "male",
      photo: "https://randomuser.me/api/portraits/" + photoKey + ".jpg"
    };
  });
}

function renderMemoryCards() {
  peopleGrid.innerHTML = "";
  people.forEach((person, index) => {
    const card = document.createElement("article");
    card.className = "person-card";
    card.style.animationDelay = index * 35 + "ms";
    card.innerHTML = '<img src="' + person.photo + '" alt="' + person.name + '"><strong>' + person.name + '</strong>';
    peopleGrid.appendChild(card);
  });
}

function startMemoryTimer() {
  clearInterval(memoryInterval);
  memoryStartedAt = Date.now();
  memoryTimer.textContent = formatTime(MEMORY_SECONDS);
  memoryInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - memoryStartedAt) / 1000);
    const remaining = Math.max(MEMORY_SECONDS - elapsed, 0);
    memoryElapsed = Math.min(elapsed, MEMORY_SECONDS);
    memoryTimer.textContent = formatTime(remaining);
    if (remaining === 0) startQuiz();
  }, 250);
}

function startQuiz() {
  clearInterval(countdownInterval);
  clearInterval(memoryInterval);
  memoryElapsed = Math.min(Math.floor((Date.now() - memoryStartedAt) / 1000), MEMORY_SECONDS);
  currentQuestion = 0;
  score = 0;
  showScreen("quiz");
  quizStartedAt = Date.now();
  clearInterval(quizInterval);
  quizInterval = setInterval(updateQuizTimer, 250);
  updateQuizTimer();
  renderQuestion();
}

function updateQuizTimer() {
  recallElapsed = Math.floor((Date.now() - quizStartedAt) / 1000);
  quizTimer.textContent = formatTime(recallElapsed);
}

function renderQuestion() {
  const person = quizOrder[currentQuestion];
  quizProgress.textContent = "Person " + (currentQuestion + 1) + " of " + GAME_SIZE;
  quizFace.src = person.photo;
  quizFace.alt = "Person to identify";

  const namePool = person.gender === "female" ? FEMALE_NAMES : MALE_NAMES;
  const wrongNames = shuffle(namePool.filter((name) => name !== person.name)).slice(0, 3);
  const options = shuffle([person.name].concat(wrongNames));

  answerOptions.innerHTML = "";
  options.forEach((name) => {
    const button = document.createElement("button");
    button.className = "option-btn";
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => handleAnswer(button, name, person.name));
    answerOptions.appendChild(button);
  });
}

function handleAnswer(button, selectedName, correctName) {
  const isCorrect = selectedName === correctName;
  if (isCorrect) score += 1;

  Array.from(answerOptions.children).forEach((option) => {
    option.disabled = true;
    if (option.textContent === correctName) option.classList.add("correct");
  });

  if (!isCorrect) button.classList.add("incorrect");

  setTimeout(() => {
    currentQuestion += 1;
    if (currentQuestion >= GAME_SIZE) finishGame();
    else renderQuestion();
  }, 520);
}

function finishGame() {
  clearInterval(quizInterval);
  recallElapsed = Math.floor((Date.now() - quizStartedAt) / 1000);
  const accuracy = Math.round((score / GAME_SIZE) * 100);
  scoreText.textContent = "You remembered " + score + "/" + GAME_SIZE + " names";
  accuracyText.textContent = accuracy + "%";
  recallTimeText.textContent = formatTime(recallElapsed);
  memoryTimeText.textContent = formatTime(memoryElapsed);
  feedbackText.textContent = getFeedback(accuracy);
  scoreRing.style.setProperty("--score-angle", accuracy * 3.6 + "deg");
  showScreen("result");
}

function getFeedback(accuracy) {
  if (accuracy <= 50) return "Keep training your memory!";
  if (accuracy <= 80) return "Great memory potential!";
  return "Memory Master Level!";
}

function shareScore() {
  const text = "I remembered " + score + "/" + GAME_SIZE + " names in the Names & Faces Memory Challenge with " + Math.round((score / GAME_SIZE) * 100) + "% accuracy.";
  if (navigator.share) {
    navigator.share({ title: "Names & Faces Memory Challenge", text: text });
    return;
  }
  if (navigator.clipboard) navigator.clipboard.writeText(text);
  const button = document.querySelector("#shareBtn");
  button.textContent = "Score Copied";
  setTimeout(() => { button.textContent = "Share Score"; }, 1400);
}

function showScreen(screenName) {
  Object.values(screens).forEach((screen) => screen.classList.remove("screen-active"));
  screens[screenName].classList.add("screen-active");
}

function shuffle(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return minutes + ":" + seconds;
}

