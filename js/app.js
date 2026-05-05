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
  const soloDurationSelector = document.getElementById('solo-duration-selector');

  let engine = null;
  let timer = null;
  let timerStarted = false;
  let lastPassageIndex = -1;
  let selectedDuration = 60;

  // Duration selector click handler
  soloDurationSelector.addEventListener('click', function (e) {
    const btn = e.target.closest('.duration-btn');
    if (!btn) return;
    soloDurationSelector.querySelector('.duration-btn.active').classList.remove('active');
    btn.classList.add('active');
    selectedDuration = parseInt(btn.dataset.duration, 10);
  });

  // Escape HTML characters for safe display
  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Animate a number counting up from 0 to target
  function animateCounter(element, target, suffix, duration) {
    suffix = suffix || '';
    duration = duration || 800;
    var start = 0;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease-out curve for a satisfying deceleration
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(eased * target);
      element.textContent = current + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  // Show specified screen by adding active class
  function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    screen.classList.add('active');

    // Hide particles during typing screens to avoid distraction
    var particles = document.getElementById('particles');
    if (particles) {
      var isTyping = screen === typingScreen || screen.id === 'mp-typing-screen';
      particles.classList.toggle('hidden', isTyping);
    }
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

  // Initialize and start a new solo game
  function startGame() {
    const passage = pickPassage();
    timerStarted = false;

    engine = new TypingEngine(passage, passageDisplay);

    timer = new Timer(selectedDuration, onTick, onTimeUp);

    timerDisplay.textContent = selectedDuration;
    timerDisplay.className = 'timer';
    liveWpm.textContent = '0';
    liveAccuracy.textContent = '100%';
    typingInput.value = '';

    showScreen(typingScreen);
    typingInput.focus();
  }

  // Update timer display and styling
  function onTick(remaining, elapsed) {
    timerDisplay.textContent = remaining;
    timerDisplay.className = 'timer';
    if (remaining <= 5) {
      timerDisplay.classList.add('danger');
    } else if (remaining <= 10) {
      timerDisplay.classList.add('warning');
    }
  }

  // Handle timer expiration
  function onTimeUp() {
    finishGame();
  }

  // Calculate and display live WPM and accuracy
  function updateLiveStats() {
    const stats = engine.getStats();
    const elapsed = timer.getElapsed();
    const correctKeystrokes = stats.totalKeystrokes - stats.totalMistakes;
    const wpm = calculateWPM(Math.max(0, correctKeystrokes), elapsed);
    const accuracy = calculateAccuracy(correctKeystrokes, stats.totalKeystrokes);

    liveWpm.textContent = wpm;
    liveAccuracy.textContent = accuracy + '%';
  }

  // End game and show results
  function finishGame() {
    timer.stop();
    typingInput.disabled = true;

    const stats = engine.getStats();
    const elapsed = timer.getElapsed();
    const correctKeystrokes = stats.totalKeystrokes - stats.totalMistakes;
    const wpm = calculateWPM(Math.max(0, correctKeystrokes), elapsed);
    const accuracy = calculateAccuracy(correctKeystrokes, stats.totalKeystrokes);
    const totalWords = stats.totalKeystrokes > 0 ? Math.round(stats.totalKeystrokes / 5) : 0;

    // Animate the main result numbers counting up
    animateCounter(document.getElementById('result-wpm'), wpm, '', 1000);
    animateCounter(document.getElementById('result-accuracy'), accuracy, '%', 1000);
    document.getElementById('result-total-chars').textContent = stats.totalKeystrokes;
    document.getElementById('result-correct-chars').textContent = correctKeystrokes;
    document.getElementById('result-incorrect-chars').textContent = stats.totalMistakes;
    document.getElementById('result-total-words').textContent = totalWords;

    document.getElementById('passage-review').innerHTML = engine.getReviewHTML();

    // Populate mistake analysis section
    const analysis = engine.getMistakeAnalysis();
    const analysisEl = document.getElementById('mistake-analysis');

    if (analysis.totalMistakes > 0) {
      analysisEl.style.display = 'block';

      // Mistyped pairs table (show top 5)
      const pairsBody = document.getElementById('mistyped-pairs-body');
      pairsBody.innerHTML = '';
      analysis.mistypedPairs.slice(0, 5).forEach(function (pair) {
        const tr = document.createElement('tr');
        var expectedLabel = pair.expected === ' ' ? 'space' : pair.expected;
        var actualLabel = pair.actual === ' ' ? 'space' : pair.actual;
        tr.innerHTML =
          '<td><span class="analysis-key">' + escapeHTML(expectedLabel) + '</span></td>' +
          '<td><span class="analysis-key analysis-key-wrong">' + escapeHTML(actualLabel) + '</span></td>' +
          '<td>' + pair.count + '</td>';
        pairsBody.appendChild(tr);
      });

    } else {
      analysisEl.style.display = 'none';
    }

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

  // Block forward typing when there is an uncorrected error
  typingInput.addEventListener('keydown', function (e) {
    if (engine && engine.hasCurrentError && e.key !== 'Backspace') {
      e.preventDefault();
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
