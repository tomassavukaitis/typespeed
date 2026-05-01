// Main controller — wires DOM events, manages screen transitions, game lifecycle
(function () {
  const startScreen = document.getElementById('start-screen');
  const typingScreen = document.getElementById('typing-screen');
  const resultsScreen = document.getElementById('results-screen');
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');
  const restartBtn = document.getElementById('restart-btn');
  const typingInput = document.getElementById('typing-input');
  const passageDisplay = document.getElementById('passage-display');
  const timerDisplay = document.getElementById('timer');
  const liveWpm = document.getElementById('live-wpm');
  const liveAccuracy = document.getElementById('live-accuracy');

  let engine = null;
  let timer = null;
  let timerStarted = false;
  let lastPassageIndex = -1;

  function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    screen.classList.add('active');
  }

  // Expose globally so multiplayer.js can switch screens
  window.showScreen = showScreen;

  // Random passage selection, avoiding immediate repeats
  function pickPassage() {
    let index;
    do {
      index = Math.floor(Math.random() * PASSAGES.length);
    } while (index === lastPassageIndex && PASSAGES.length > 1);
    lastPassageIndex = index;
    return PASSAGES[index];
  }

  function startGame() {
    const passage = pickPassage();
    timerStarted = false;

    engine = new TypingEngine(passage, passageDisplay);

    timer = new Timer(60, onTick, onTimeUp);

    timerDisplay.textContent = '60';
    timerDisplay.className = 'timer';
    liveWpm.textContent = '0';
    liveAccuracy.textContent = '100%';
    typingInput.value = '';

    showScreen(typingScreen);
    typingInput.focus();
  }

  function onTick(remaining, elapsed) {
    timerDisplay.textContent = remaining;
    timerDisplay.className = 'timer';
    if (remaining <= 5) {
      timerDisplay.classList.add('danger');
    } else if (remaining <= 10) {
      timerDisplay.classList.add('warning');
    }
  }

  function onTimeUp() {
    finishGame();
  }

  function updateLiveStats() {
    const stats = engine.getStats();
    const elapsed = timer.getElapsed();
    const correctKeystrokes = stats.totalKeystrokes - stats.totalMistakes;
    const wpm = calculateWPM(Math.max(0, correctKeystrokes), elapsed);
    const accuracy = calculateAccuracy(correctKeystrokes, stats.totalKeystrokes);

    liveWpm.textContent = wpm;
    liveAccuracy.textContent = accuracy + '%';
  }

  function finishGame() {
    timer.stop();
    typingInput.disabled = true;

    const stats = engine.getStats();
    const elapsed = timer.getElapsed();
    const correctKeystrokes = stats.totalKeystrokes - stats.totalMistakes;
    const wpm = calculateWPM(Math.max(0, correctKeystrokes), elapsed);
    const accuracy = calculateAccuracy(correctKeystrokes, stats.totalKeystrokes);
    const totalWords = stats.totalKeystrokes > 0 ? Math.round(stats.totalKeystrokes / 5) : 0;

    document.getElementById('result-wpm').textContent = wpm;
    document.getElementById('result-accuracy').textContent = accuracy + '%';
    document.getElementById('result-total-chars').textContent = stats.totalKeystrokes;
    document.getElementById('result-correct-chars').textContent = correctKeystrokes;
    document.getElementById('result-incorrect-chars').textContent = stats.totalMistakes;
    document.getElementById('result-total-words').textContent = totalWords;

    document.getElementById('passage-review').innerHTML = engine.getReviewHTML();

    showScreen(resultsScreen);
  }

  // Timer starts on first keystroke so the user can read the passage first
  typingInput.addEventListener('input', function () {
    if (!timerStarted && typingInput.value.length > 0) {
      timerStarted = true;
      timer.start();
    }

    const finished = engine.update(typingInput.value);
    updateLiveStats();

    if (finished) {
      finishGame();
    }
  });

  typingInput.addEventListener('paste', function (e) {
    e.preventDefault();
  });

  // Clicking the passage focuses the hidden textarea so typing works
  passageDisplay.addEventListener('click', function () {
    typingInput.focus();
  });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', function () {
    typingInput.disabled = false;
    startGame();
  });
  restartBtn.addEventListener('click', function () {
    if (timer) timer.stop();
    typingInput.disabled = false;
    startGame();
  });
})();
