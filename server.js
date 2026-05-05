const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const PASSAGES = require('./js/passages.js');

const app = express();
app.use(express.static(path.join(__dirname)));

const HTTP_PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Determine if SSL certs are available
const certPath = path.join(__dirname, 'certs', 'cert.pem');
const keyPath = path.join(__dirname, 'certs', 'key.pem');
const sslAvailable = fs.existsSync(certPath) && fs.existsSync(keyPath);

let server;

if (sslAvailable) {
  // HTTPS mode: main server is HTTPS, HTTP redirects to HTTPS
  const sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  server = https.createServer(sslOptions, app);

  // HTTP server that redirects all requests to HTTPS
  const redirectApp = express();
  redirectApp.use((req, res) => {
    const host = req.headers.host ? req.headers.host.replace(/:.*/, '') : req.hostname;
    res.redirect(301, `https://${host}${req.url}`);
  });
  const httpServer = http.createServer(redirectApp);
  httpServer.listen(HTTP_PORT, () => {
    console.log('HTTP redirect server running on port ' + HTTP_PORT);
  });
} else {
  // Fallback: plain HTTP (local development without certs)
  server = http.createServer(app);
}

const wss = new WebSocketServer({ server });

// --- Room state ---

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O, 1/I
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Create a new room with the given host
function createRoom(hostId, playerName) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));

  const room = {
    code,
    hostId,
    state: 'waiting', // waiting | countdown | racing | finished
    passageIndex: null,
    players: new Map(),
    createdAt: Date.now(),
    lastActivity: Date.now(),
    countdownTimer: null,
    raceTimer: null,
    broadcastInterval: null,
    nextPlacement: 1,
  };

  room.players.set(hostId, {
    id: hostId,
    name: playerName,
    progress: 0,
    wpm: 0,
    accuracy: 100,
    finished: false,
    placement: null,
  });

  rooms.set(code, room);
  return room;
}

// Convert room players map to array for sending to clients
function getPlayersArray(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    progress: p.progress,
    wpm: p.wpm,
    accuracy: p.accuracy,
    finished: p.finished,
    placement: p.placement,
    isHost: p.id === room.hostId,
  }));
}

// Send message to all players in room except optional excludeId
function broadcast(room, message, excludeId) {
  const data = JSON.stringify(message);
  for (const [connId] of room.players) {
    if (connId === excludeId) continue;
    const client = clients.get(connId);
    if (client && client.readyState === 1) {
      client.send(data);
    }
  }
}

// Send message to specific connection
function sendTo(connId, message) {
  const client = clients.get(connId);
  if (client && client.readyState === 1) {
    client.send(JSON.stringify(message));
  }
}

// Clean up room timers and remove from memory
function cleanupRoom(room) {
  if (room.countdownTimer) clearTimeout(room.countdownTimer);
  if (room.raceTimer) clearTimeout(room.raceTimer);
  if (room.broadcastInterval) clearInterval(room.broadcastInterval);
  rooms.delete(room.code);
}

// Promote a new host when current host leaves
function promoteHost(room) {
  const remaining = Array.from(room.players.keys());
  if (remaining.length === 0) {
    cleanupRoom(room);
    return;
  }
  room.hostId = remaining[0];
  broadcast(room, {
    type: 'host_changed',
    hostId: room.hostId,
    players: getPlayersArray(room),
  });
}

// Check if all players in room have finished the race
function checkAllFinished(room) {
  for (const p of room.players.values()) {
    if (!p.finished) return false;
  }
  return true;
}

// End the race and broadcast final standings
function finishRace(room) {
  if (room.state === 'finished') return;
  room.state = 'finished';
  if (room.broadcastInterval) clearInterval(room.broadcastInterval);
  if (room.raceTimer) clearTimeout(room.raceTimer);

  // Rank unfinished players by WPM (descending), then accuracy (descending)
  const unfinished = Array.from(room.players.values())
    .filter(p => !p.finished)
    .sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy);
  for (const p of unfinished) {
    p.finished = true;
    p.placement = room.nextPlacement++;
  }

  const standings = Array.from(room.players.values())
    .sort((a, b) => a.placement - b.placement)
    .map(p => ({
      id: p.id,
      name: p.name,
      placement: p.placement,
      wpm: p.wpm,
      accuracy: p.accuracy,
      progress: p.progress,
    }));

  broadcast(room, { type: 'race_finished', standings });
  room.lastActivity = Date.now();
}

// --- Connection tracking ---

const clients = new Map(); // connId -> ws
const connRooms = new Map(); // connId -> roomCode
let nextConnId = 1;

// --- Ping/pong heartbeat to detect dead connections ---

const HEARTBEAT_INTERVAL = 10000; // 10 seconds

setInterval(() => {
  for (const [connId, ws] of clients) {
    if (ws.isAlive === false) {
      // Missed a pong — connection is dead
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL);

wss.on('connection', (ws) => {
  const connId = 'p' + nextConnId++;
  clients.set(connId, ws);
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handleMessage(connId, msg);
  });

  ws.on('close', () => {
    clients.delete(connId);
    const roomCode = connRooms.get(connId);
    connRooms.delete(connId);

    if (roomCode) {
      const room = rooms.get(roomCode);
      if (!room) return;

      const wasHost = room.hostId === connId;

      if (room.state === 'racing') {
        // Mark player as finished at current progress
        const player = room.players.get(connId);
        if (player && !player.finished) {
          player.finished = true;
          player.placement = room.nextPlacement++;
        }
        room.players.delete(connId);
        broadcast(room, { type: 'player_left', playerId: connId });
        if (room.players.size === 0) {
          cleanupRoom(room);
        } else if (checkAllFinished(room)) {
          finishRace(room);
        }
      } else {
        room.players.delete(connId);
        if (room.players.size === 0) {
          cleanupRoom(room);
          return;
        }
        if (wasHost) promoteHost(room);
        broadcast(room, {
          type: 'player_left',
          playerId: connId,
          players: getPlayersArray(room),
        });
      }
    }
  });
});

// Main message handler for client messages
function handleMessage(connId, msg) {
  switch (msg.type) {
    case 'create_room': {
      const name = String(msg.playerName || '').trim().slice(0, 16);
      if (!name) return sendTo(connId, { type: 'error', message: 'Name is required.' });

      const room = createRoom(connId, name);
      connRooms.set(connId, room.code);
      sendTo(connId, {
        type: 'room_created',
        roomCode: room.code,
        playerId: connId,
        players: getPlayersArray(room),
      });
      break;
    }

    case 'join_room': {
      const code = String(msg.roomCode || '').trim().toUpperCase();
      const name = String(msg.playerName || '').trim().slice(0, 16);
      if (!name) return sendTo(connId, { type: 'error', message: 'Name is required.' });

      const room = rooms.get(code);
      if (!room) return sendTo(connId, { type: 'error', message: 'Room not found.' });
      if (room.state !== 'waiting') return sendTo(connId, { type: 'error', message: 'Race already started.' });
      if (room.players.size >= 10) return sendTo(connId, { type: 'error', message: 'Room is full (max 10).' });

      room.players.set(connId, {
        id: connId,
        name,
        progress: 0,
        wpm: 0,
        accuracy: 100,
        finished: false,
        placement: null,
      });
      connRooms.set(connId, code);
      room.lastActivity = Date.now();

      sendTo(connId, {
        type: 'room_joined',
        roomCode: code,
        playerId: connId,
        players: getPlayersArray(room),
      });

      broadcast(room, {
        type: 'player_joined',
        player: { id: connId, name, isHost: false },
        players: getPlayersArray(room),
      }, connId);
      break;
    }

    case 'start_game': {
      const code = connRooms.get(connId);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      if (room.hostId !== connId) return sendTo(connId, { type: 'error', message: 'Only the host can start.' });
      if (room.state !== 'waiting') return;
      if (room.players.size < 2) return sendTo(connId, { type: 'error', message: 'Need at least 2 players.' });

      // Validate duration (30, 60, or 120 seconds)
      const allowedDurations = [30, 60, 120];
      const duration = allowedDurations.includes(Number(msg.duration)) ? Number(msg.duration) : 60;
      room.duration = duration;

      room.state = 'countdown';
      room.passageIndex = Math.floor(Math.random() * PASSAGES.length);
      room.nextPlacement = 1;

      // 3-2-1 countdown
      let count = 3;
      broadcast(room, { type: 'countdown', seconds: count });

      room.countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
          broadcast(room, { type: 'countdown', seconds: count });
        } else {
          clearInterval(room.countdownTimer);
          room.countdownTimer = null;
          room.state = 'racing';

          broadcast(room, {
            type: 'race_start',
            passageIndex: room.passageIndex,
            duration: room.duration,
          });

          // Broadcast progress every 200ms
          room.broadcastInterval = setInterval(() => {
            broadcast(room, {
              type: 'race_update',
              players: getPlayersArray(room),
            });
          }, 200);

          // Race timeout based on selected duration
          room.raceTimer = setTimeout(() => {
            finishRace(room);
          }, room.duration * 1000);
        }
      }, 1000);
      break;
    }

    case 'progress_update': {
      const code = connRooms.get(connId);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.state !== 'racing') return;

      const player = room.players.get(connId);
      if (!player || player.finished) return;

      player.progress = Math.min(100, Math.max(0, Number(msg.progress) || 0));
      player.wpm = Math.max(0, Math.round(Number(msg.wpm) || 0));
      player.accuracy = Math.min(100, Math.max(0, Math.round(Number(msg.accuracy) || 0)));
      room.lastActivity = Date.now();
      break;
    }

    case 'player_finished': {
      const code = connRooms.get(connId);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.state !== 'racing') return;

      const player = room.players.get(connId);
      if (!player || player.finished) return;

      player.finished = true;
      player.placement = room.nextPlacement++;
      player.wpm = Math.max(0, Math.round(Number(msg.wpm) || 0));
      player.accuracy = Math.min(100, Math.max(0, Math.round(Number(msg.accuracy) || 0)));
      player.progress = 100;

      broadcast(room, {
        type: 'player_done',
        playerId: connId,
        placement: player.placement,
        players: getPlayersArray(room),
      });

      if (checkAllFinished(room)) {
        finishRace(room);
      }
      break;
    }

    case 'rejoin_room': {
      const code = String(msg.roomCode || '').trim().toUpperCase();
      const name = String(msg.playerName || '').trim().slice(0, 16);
      if (!name) return sendTo(connId, { type: 'error', message: 'Name is required.' });

      const room = rooms.get(code);
      if (!room) return sendTo(connId, { type: 'error', message: 'Room not found.' });
      if (room.state === 'finished') return sendTo(connId, { type: 'error', message: 'Race already finished.' });
      if (room.players.size >= 10) return sendTo(connId, { type: 'error', message: 'Room is full (max 10).' });

      room.players.set(connId, {
        id: connId,
        name,
        progress: 0,
        wpm: 0,
        accuracy: 100,
        finished: false,
        placement: null,
      });
      connRooms.set(connId, code);
      room.lastActivity = Date.now();

      sendTo(connId, {
        type: 'room_rejoined',
        roomCode: code,
        playerId: connId,
        players: getPlayersArray(room),
        isHost: room.hostId === connId,
      });

      broadcast(room, {
        type: 'player_joined',
        player: { id: connId, name, isHost: false },
        players: getPlayersArray(room),
      }, connId);
      break;
    }

    case 'play_again': {
      const code = connRooms.get(connId);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      if (room.state !== 'finished') return;

      // Reset room state for a new round
      room.state = 'waiting';
      room.passageIndex = null;
      room.nextPlacement = 1;
      room.lastActivity = Date.now();

      // Reset all player stats
      for (const p of room.players.values()) {
        p.progress = 0;
        p.wpm = 0;
        p.accuracy = 100;
        p.finished = false;
        p.placement = null;
      }

      broadcast(room, {
        type: 'back_to_lobby',
        players: getPlayersArray(room),
      });
      break;
    }

    case 'leave_room': {
      const leaveCode = connRooms.get(connId);
      if (!leaveCode) return;
      connRooms.delete(connId);

      const room = rooms.get(leaveCode);
      if (!room) return;

      room.players.delete(connId);
      if (room.players.size === 0) {
        cleanupRoom(room);
        return;
      }

      const wasHost = room.hostId === connId;
      if (wasHost) promoteHost(room);
      broadcast(room, {
        type: 'player_left',
        playerId: connId,
        players: getPlayersArray(room),
      });
      break;
    }
  }
}

// --- Room expiry cleanup (runs every 60s) ---

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const age = now - room.createdAt;
    const idle = now - room.lastActivity;
    if (age > 30 * 60 * 1000 || (room.state === 'finished' && idle > 5 * 60 * 1000)) {
      cleanupRoom(room);
    }
  }
}, 60000);

const listenPort = sslAvailable ? HTTPS_PORT : HTTP_PORT;
server.listen(listenPort, () => {
  console.log('TypeSpeed server running on port ' + listenPort + (sslAvailable ? ' (HTTPS)' : ' (HTTP)'));
});
