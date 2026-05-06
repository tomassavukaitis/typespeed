// Database module — SQLite persistence for highscores
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'typespeed.db');

// Initialize database: create directory, open connection, create tables
function initDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      wpm INTEGER NOT NULL,
      accuracy INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_scores_wpm ON scores(wpm DESC, accuracy DESC)`);

  return db;
}

// Insert a new score entry and return the row id
function insertScore(db, playerName, wpm, accuracy, duration) {
  const stmt = db.prepare(
    'INSERT INTO scores (player_name, wpm, accuracy, duration) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(playerName, wpm, accuracy, duration);
  return result.lastInsertRowid;
}

// Fetch top 10 scores and optionally the player's best rank
function getLeaderboard(db, playerName) {
  // Top 10 scores ordered by WPM desc, accuracy desc
  const top10 = db.prepare(`
    SELECT id, player_name, wpm, accuracy, duration, created_at
    FROM scores
    ORDER BY wpm DESC, accuracy DESC
    LIMIT 10
  `).all();

  // Add rank numbers
  top10.forEach(function (row, i) {
    row.rank = i + 1;
  });

  let playerRank = null;

  if (playerName) {
    // Find the player's best score
    const best = db.prepare(`
      SELECT id, player_name, wpm, accuracy, duration, created_at
      FROM scores
      WHERE player_name = ?
      ORDER BY wpm DESC, accuracy DESC
      LIMIT 1
    `).get(playerName);

    if (best) {
      // Check if already in top 10
      const inTop10 = top10.some(function (row) { return row.id === best.id; });

      if (!inTop10) {
        // Calculate rank: count how many scores are better
        const rank = db.prepare(`
          SELECT COUNT(*) as cnt FROM scores
          WHERE wpm > ? OR (wpm = ? AND accuracy > ?)
        `).get(best.wpm, best.wpm, best.accuracy);

        playerRank = {
          rank: rank.cnt + 1,
          player_name: best.player_name,
          wpm: best.wpm,
          accuracy: best.accuracy,
          duration: best.duration,
          created_at: best.created_at,
        };
      }
    }
  }

  return { top10, playerRank };
}

module.exports = { initDB, insertScore, getLeaderboard };
