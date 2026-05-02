// Multiplayer module — WebSocket connection, lobby, race progress, and results
(function () {
  let ws = null;
  let playerId = null;
  let roomCode = null;
  let isHost = false;
  let playerName = '';
  let engine = null;
  let timer = null;
  let timerStarted = false;
  let progressThrottleId = null;

  // --- DOM references ---

  const mpMenuScreen = document.getElementById('mp-menu-screen');
  const mpLobbyScreen = document.getElementById('mp-lobby-screen');
  const mpTypingScreen = document.getElementById('mp-typing-screen');
  const mpResultsScreen = document.getElementById('mp-results-screen');

  const nameInput = document.getElementById('mp-name-input');
  const createBtn = document.getElementById('mp-create-btn');
  const joinBtn = document.getElementById('mp-join-btn');
  const codeInput = document.getElementById('mp-code-input');
  const menuError = document.getElementById('mp-menu-error');
  const menuBackBtn = document.getElementById('mp-menu-back-btn');

  const lobbyCode = document.getElementById('mp-lobby-code');
  const lobbyCopyBtn = document.getElementById('mp-lobby-copy-btn');
  const lobbyPlayers = document.getElementById('mp-lobby-players');
  const lobbyStartBtn = document.getElementById('mp-lobby-start-btn');
  const lobbyLeaveBtn = document.getElementById('mp-lobby-leave-btn');
  const lobbyError = document.getElementById('mp-lobby-error');

  const mpPassageDisplay = document.getElementById('mp-passage-display');
  const mpTypingInput = document.getElementById('mp-typing-input');
  const mpTimerDisplay = document.getElementById('mp-timer');
  const mpLiveWpm = document.getElementById('mp-live-wpm');
  const mpLiveAccuracy = document.getElementById('mp-live-accuracy');
  const mpProgressBars = document.getElementById('mp-progress-bars');
  const mpCountdownOverlay = document.getElementById('mp-countdown-overlay');
  const mpCountdownNumber = document.getElementById('mp-countdown-number');

  const mpStandings = document.getElementById('mp-standings-body');
  const mpResultWpm = document.getElementById('mp-result-wpm');
  const mpResultAccuracy = document.getElementById('mp-result-accuracy');
  const mpPlayAgainBtn = document.getElementById('mp-play-again-btn');
  const mpResultsLeaveBtn = document.getElementById('mp-results-leave-btn');
  const mpResultReview = document.getElementById('mp-passage-review');

  // --- WebSocket ---

  let pendingMessages = [];
  let reconnectAttempts = 0;
  var MAX_RECONNECT_ATTEMPTS = 3;
  var RECONNECT_DELAY = 1000;

  function connectWS(onOpenCallback) {
    if (ws && ws.readyState <= 1) {
      if (onOpenCallback) onOpenCallback();
      return;
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + location.host);

    ws.onopen = function () {
      reconnectAttempts = 0;
      // Flush any messages that were queued before the connection opened
      pendingMessages.forEach(function (m) {
        ws.send(JSON.stringify(m));
      });
      pendingMessages = [];
      if (onOpenCallback) onOpenCallback();
    };

    ws.onmessage = function (e) {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      handleServerMessage(msg);
    };

    ws.onerror = function () {
      showError(menuError, 'Could not connect to server.');
    };

    ws.onclose = function () {
      ws = null;
      if (roomCode && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        // Attempt to reconnect and rejoin the room
        var savedRoom = roomCode;
        var savedName = playerName;
        reconnectAttempts++;
        showError(lobbyError, 'Reconnecting... (attempt ' + reconnectAttempts + ')');
        setTimeout(function () {
          connectWS(function () {
            send({ type: 'rejoin_room', roomCode: savedRoom, playerName: savedName });
          });
        }, RECONNECT_DELAY);
      } else if (roomCode) {
        // Exhausted reconnect attempts
        showError(menuError, 'Connection lost.');
        leaveRoom();
        window.showScreen(mpMenuScreen);
      }
    };
  }

  function send(msg) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    } else if (ws && ws.readyState === 0) {
      // Connection still opening — queue the message
      pendingMessages.push(msg);
    }
  }

  // --- Message handling ---

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        playerId = msg.playerId;
        roomCode = msg.roomCode;
        isHost = true;
        showLobby(msg.roomCode, msg.players);
        break;

      case 'room_joined':
        playerId = msg.playerId;
        roomCode = msg.roomCode;
        isHost = false;
        showLobby(msg.roomCode, msg.players);
        break;

      case 'room_rejoined':
        playerId = msg.playerId;
        roomCode = msg.roomCode;
        isHost = msg.isHost;
        showLobby(msg.roomCode, msg.players);
        break;

      case 'player_joined':
        renderLobbyPlayers(msg.players);
        break;

      case 'player_left':
        if (msg.players) renderLobbyPlayers(msg.players);
        break;

      case 'host_changed':
        isHost = msg.hostId === playerId;
        if (msg.players) renderLobbyPlayers(msg.players);
        lobbyStartBtn.style.display = isHost ? '' : 'none';
        break;

      case 'countdown':
        window.showScreen(mpTypingScreen);
        mpCountdownOverlay.style.display = 'flex';
        mpCountdownNumber.textContent = msg.seconds;
        mpTypingInput.disabled = true;
        break;

      case 'race_start':
        startRace(msg.passageIndex);
        break;

      case 'race_update':
        renderProgressBars(msg.players);
        break;

      case 'player_done':
        renderProgressBars(msg.players);
        break;

      case 'race_finished':
        showResults(msg.standings);
        break;

      case 'error':
        // Show error in the most relevant place
        if (mpLobbyScreen.classList.contains('active')) {
          showError(lobbyError, msg.message);
        } else {
          showError(menuError, msg.message);
        }
        break;
    }
  }

  // --- UI helpers ---

  function showError(el, text) {
    el.textContent = text;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function showLobby(code, players) {
    menuError.style.display = 'none';
    lobbyError.style.display = 'none';
    lobbyCode.textContent = code;
    lobbyStartBtn.style.display = isHost ? '' : 'none';
    renderLobbyPlayers(players);
    window.showScreen(mpLobbyScreen);
  }

  function renderLobbyPlayers(players) {
    lobbyPlayers.innerHTML = '';
    players.forEach(function (p) {
      const div = document.createElement('div');
      div.className = 'lobby-player';
      div.textContent = p.name;
      if (p.isHost) {
        const badge = document.createElement('span');
        badge.className = 'host-badge';
        badge.textContent = 'HOST';
        div.appendChild(badge);
      }
      if (p.id === playerId) {
        div.classList.add('lobby-player-self');
      }
      lobbyPlayers.appendChild(div);
    });
    // Update start button state
    if (isHost) {
      lobbyStartBtn.disabled = players.length < 2;
    }
  }

  // --- Race ---

  function startRace(passageIndex) {
    mpCountdownOverlay.style.display = 'none';
    mpTypingInput.disabled = false;
    mpTypingInput.value = '';
    mpTypingInput.focus();

    const passage = PASSAGES[passageIndex];
    engine = new TypingEngine(passage, mpPassageDisplay);

    timerStarted = true;
    timer = new Timer(60, onRaceTick, onRaceTimeUp);
    timer.start();

    mpTimerDisplay.textContent = '60';
    mpTimerDisplay.className = 'timer';
    mpLiveWpm.textContent = '0';
    mpLiveAccuracy.textContent = '100%';

    // Start throttled progress sending
    progressThrottleId = setInterval(sendProgress, 200);
  }

  function onRaceTick(remaining) {
    mpTimerDisplay.textContent = remaining;
    mpTimerDisplay.className = 'timer';
    if (remaining <= 5) {
      mpTimerDisplay.classList.add('danger');
    } else if (remaining <= 10) {
      mpTimerDisplay.classList.add('warning');
    }
  }

  function onRaceTimeUp() {
    finishRace();
  }

  function sendProgress() {
    if (!engine || !timer) return;
    const stats = engine.getStats();
    const elapsed = timer.getElapsed();
    const correctKeystrokes = stats.totalKeystrokes - stats.totalMistakes;
    const wpm = calculateWPM(Math.max(0, correctKeystrokes), elapsed);
    const accuracy = calculateAccuracy(correctKeystrokes, stats.totalKeystrokes);
    const progress = Math.round((engine.currentIndex / engine.passage.length) * 100);

    send({
      type: 'progress_update',
      progress: progress,
      wpm: wpm,
      accuracy: accuracy,
    });
  }

  function finishRace() {
    if (timer) timer.stop();
    if (progressThrottleId) {
      clearInterval(progressThrottleId);
      progressThrottleId = null;
    }
    mpTypingInput.disabled = true;

    const stats = engine.getStats();
    const elapsed = timer.getElapsed();
    const correctKeystrokes = stats.totalKeystrokes - stats.totalMistakes;
    const wpm = calculateWPM(Math.max(0, correctKeystrokes), elapsed);
    const accuracy = calculateAccuracy(correctKeystrokes, stats.totalKeystrokes);

    send({
      type: 'player_finished',
      wpm: wpm,
      accuracy: accuracy,
    });
  }

  function updateMpLiveStats() {
    const stats = engine.getStats();
    const elapsed = timer.getElapsed();
    const correctKeystrokes = stats.totalKeystrokes - stats.totalMistakes;
    const wpm = calculateWPM(Math.max(0, correctKeystrokes), elapsed);
    const accuracy = calculateAccuracy(correctKeystrokes, stats.totalKeystrokes);

    mpLiveWpm.textContent = wpm;
    mpLiveAccuracy.textContent = accuracy + '%';
  }

  // --- Progress bars ---

  function renderProgressBars(players) {
    mpProgressBars.innerHTML = '';
    players.forEach(function (p) {
      const row = document.createElement('div');
      row.className = 'progress-row';
      if (p.id === playerId) row.classList.add('progress-row-self');

      const name = document.createElement('span');
      name.className = 'progress-name';
      name.textContent = p.name;

      const barWrap = document.createElement('div');
      barWrap.className = 'progress-bar-wrap';

      const bar = document.createElement('div');
      bar.className = 'progress-bar-fill';
      bar.style.width = p.progress + '%';
      if (p.finished) bar.classList.add('progress-bar-done');

      const pct = document.createElement('span');
      pct.className = 'progress-pct';
      pct.textContent = p.progress + '%';

      barWrap.appendChild(bar);
      row.appendChild(name);
      row.appendChild(barWrap);
      row.appendChild(pct);
      mpProgressBars.appendChild(row);
    });
  }

  // --- Results ---

  function showResults(standings) {
    if (timer) timer.stop();
    if (progressThrottleId) {
      clearInterval(progressThrottleId);
      progressThrottleId = null;
    }
    mpTypingInput.disabled = true;

    mpStandings.innerHTML = '';
    standings.forEach(function (s) {
      const tr = document.createElement('tr');
      if (s.id === playerId) tr.classList.add('standings-self');

      var placementText = '#' + s.placement;
      tr.innerHTML =
        '<td>' + placementText + '</td>' +
        '<td>' + escapeHTML(s.name) + '</td>' +
        '<td>' + s.wpm + '</td>' +
        '<td>' + s.accuracy + '%</td>';
      mpStandings.appendChild(tr);
    });

    // Show local player stats
    const me = standings.find(function (s) { return s.id === playerId; });
    if (me) {
      mpResultWpm.textContent = me.wpm;
      mpResultAccuracy.textContent = me.accuracy + '%';
    }

    // Show passage review if engine exists
    if (engine) {
      mpResultReview.innerHTML = engine.getReviewHTML();
    }

    window.showScreen(mpResultsScreen);
  }

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Room management ---

  function leaveRoom() {
    if (ws && roomCode) {
      send({ type: 'leave_room' });
    }
    roomCode = null;
    playerId = null;
    isHost = false;
    if (timer) timer.stop();
    if (progressThrottleId) {
      clearInterval(progressThrottleId);
      progressThrottleId = null;
    }
    engine = null;
    timer = null;
  }

  // --- Event listeners ---

  // Multiplayer button on start screen
  document.getElementById('multiplayer-btn').addEventListener('click', function () {
    connectWS();
    menuError.style.display = 'none';
    window.showScreen(mpMenuScreen);
  });

  menuBackBtn.addEventListener('click', function () {
    leaveRoom();
    if (ws) { ws.close(); ws = null; }
    window.showScreen(document.getElementById('start-screen'));
  });

  createBtn.addEventListener('click', function () {
    playerName = nameInput.value.trim();
    if (!playerName) return showError(menuError, 'Enter a display name.');
    if (playerName.length > 16) playerName = playerName.slice(0, 16);
    send({ type: 'create_room', playerName: playerName });
  });

  joinBtn.addEventListener('click', function () {
    playerName = nameInput.value.trim();
    if (!playerName) return showError(menuError, 'Enter a display name.');
    if (playerName.length > 16) playerName = playerName.slice(0, 16);
    var code = codeInput.value.trim().toUpperCase();
    if (!code) return showError(menuError, 'Enter a room code.');
    send({ type: 'join_room', roomCode: code, playerName: playerName });
  });

  lobbyCopyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(lobbyCode.textContent).then(function () {
      lobbyCopyBtn.textContent = 'Copied!';
      setTimeout(function () { lobbyCopyBtn.textContent = 'Copy'; }, 1500);
    });
  });

  lobbyStartBtn.addEventListener('click', function () {
    send({ type: 'start_game' });
  });

  lobbyLeaveBtn.addEventListener('click', function () {
    leaveRoom();
    window.showScreen(document.getElementById('start-screen'));
  });

  // Typing input for multiplayer race
  mpTypingInput.addEventListener('input', function () {
    if (!engine || !timer) return;

    var finished = engine.update(mpTypingInput.value);
    updateMpLiveStats();

    if (finished) {
      finishRace();
    }
  });

  mpTypingInput.addEventListener('paste', function (e) {
    e.preventDefault();
  });

  mpPassageDisplay.addEventListener('click', function () {
    mpTypingInput.focus();
  });

  mpPlayAgainBtn.addEventListener('click', function () {
    // Go back to lobby if still connected
    if (ws && ws.readyState === 1) {
      // Reset race state
      engine = null;
      timer = null;
      connectWS();
      menuError.style.display = 'none';
      window.showScreen(mpMenuScreen);
    } else {
      window.showScreen(document.getElementById('start-screen'));
    }
  });

  mpResultsLeaveBtn.addEventListener('click', function () {
    leaveRoom();
    if (ws) { ws.close(); ws = null; }
    window.showScreen(document.getElementById('start-screen'));
  });

  // Auto-uppercase room code input
  codeInput.addEventListener('input', function () {
    codeInput.value = codeInput.value.toUpperCase();
  });
})();
