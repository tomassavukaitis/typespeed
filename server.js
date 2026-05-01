const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const PASSAGES = require('./js/passages.js');

const app = express();
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// --- Room state ---

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O, 1/I
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

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

function sendTo(connId, message) {
  const client = clients.get(connId);
  if (client && client.readyState === 1) {
    client.send(JSON.stringify(message));
  }
}

function cleanupRoom(room) {
  if (room.countdownTimer) clearTimeout(room.countdownTimer);
  if (room.raceTimer) clearTimeout(room.raceTimer);
  if (room.broadcastInterval) clearInterval(room.broadcastInterval);
  rooms.delete(room.code);
}

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

function checkAllFinished(room) {
  for (const p of room.players.values()) {
    if (!p.finished) return false;
  }
  return true;
}

function finishRace(room) {
  if (room.state === 'finished') return;
  room.state = 'finished';
  if (room.broadcastInterval) clearInterval(room.broadcastInterval);
  if (room.raceTimer) clearTimeout(room.raceTimer);

  // Mark unfinished players with their current progress
  for (const p of room.players.values()) {
    if (!p.finished) {
      p.finished = true;
      p.placement = room.nextPlacement++;
    }
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

wss.on('connection', (ws) => {
  const connId = 'p' + nextConnId++;
  clients.set(connId, ws);

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
          });

          // Broadcast progress every 200ms
          room.broadcastInterval = setInterval(() => {
            broadcast(room, {
              type: 'race_update',
              players: getPlayersArray(room),
            });
          }, 200);

          // 60-second race timeout
          room.raceTimer = setTimeout(() => {
            finishRace(room);
          }, 60000);
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

server.listen(PORT, () => {
  console.log('TypeSpeed server running on port ' + PORT);
});
