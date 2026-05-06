// Main controller — wires DOM events, manages screen transitions, game lifecycle
(function () {
  const startScreen = document.getElementById('start-screen');
  const typingScreen = document.getElementById('typing-screen');
  const resultsScreen = document.getElementById('results-screen');
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');
  const homeBtn = document.getElementById('home-btn');
  const restartBtn = document.getElementById('restart-btn');
  const typingInput = document.getElementById('typing-input');
  const passageDisplay = document.getElementById('passage-display');
  const timerDisplay = document.getElementById('timer');
  const liveWpm = document.getElementById('live-wpm');
  const liveAccuracy = document.getElementById('live-accuracy');
  const soloDurationSelector = document.getElementById('solo-duration-selector');

  const soloNameSection = document.getElementById('solo-name-section');
  const soloNameInput = document.getElementById('solo-name-input');
  const soloSubmitBtn = document.getElementById('solo-submit-score-btn');
  const soloHighscoreSection = document.getElementById('solo-highscore-section');

  let engine = null;
  let timer = null;
  let timerStarted = false;
  let lastPassageIndex = -1;
  let selectedDuration = 60;
  let lastSoloResult = null;

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

    // Store result for leaderboard submission
    lastSoloResult = { wpm: wpm, accuracy: accuracy, duration: selectedDuration };

    // Show name input for leaderboard
    soloNameSection.style.display = 'block';
    soloHighscoreSection.style.display = 'none';
    soloNameInput.value = '';
    setTimeout(function () { soloNameInput.focus(); }, 100);

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

  // Submit solo score to leaderboard
  soloSubmitBtn.addEventListener('click', function () {
    var name = soloNameInput.value.trim();
    if (!name) return;
    if (!lastSoloResult) return;

    soloSubmitBtn.disabled = true;

    fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: name,
        wpm: lastSoloResult.wpm,
        accuracy: lastSoloResult.accuracy,
        duration: lastSoloResult.duration,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        soloNameSection.style.display = 'none';
        window.renderHighscoreTable('solo-highscore-body', 'solo-player-rank', data);
        soloHighscoreSection.style.display = 'block';
      })
      .catch(function () {
        soloNameSection.style.display = 'none';
      })
      .finally(function () {
        soloSubmitBtn.disabled = false;
      });
  });

  // Allow Enter key to submit name
  soloNameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      soloSubmitBtn.click();
    }
  });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', function () {
    typingInput.disabled = false;
    soloNameSection.style.display = 'none';
    soloHighscoreSection.style.display = 'none';
    startGame();
  });
  // Home button returns to start screen
  homeBtn.addEventListener('click', function () {
    if (timer) timer.stop();
    typingInput.disabled = false;
    soloNameSection.style.display = 'none';
    soloHighscoreSection.style.display = 'none';
    showScreen(startScreen);
  });
  restartBtn.addEventListener('click', function () {
    if (timer) timer.stop();
    typingInput.disabled = false;
    startGame();
  });

  // --- Shared leaderboard rendering (used by solo and multiplayer) ---

  // Format ISO date string for display
  window.formatLeaderboardDate = function (dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'Z');
    return d.toLocaleDateString();
  };

  // Render highscore table from API response data
  window.renderHighscoreTable = function (tbodyId, rankDivId, data) {
    var tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';

    data.top10.forEach(function (entry) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + entry.rank + '</td>' +
        '<td>' + escapeHTML(entry.player_name) + '</td>' +
        '<td>' + entry.wpm + '</td>' +
        '<td>' + entry.accuracy + '%</td>' +
        '<td>' + entry.duration + 's</td>' +
        '<td>' + window.formatLeaderboardDate(entry.created_at) + '</td>';
      tbody.appendChild(tr);
    });

    var rankDiv = document.getElementById(rankDivId);
    if (data.playerRank) {
      rankDiv.style.display = 'block';
      rankDiv.textContent = 'Your best: #' + data.playerRank.rank +
        ' (' + data.playerRank.wpm + ' WPM, ' + data.playerRank.accuracy + '% accuracy)';
    } else {
      rankDiv.style.display = 'none';
    }
  };
})();
