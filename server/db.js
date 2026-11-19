'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

// SQLite ist in Node.js eingebaut (node:sqlite), keine Build-Werkzeuge nötig.
const db = new DatabaseSync(path.join(dataDir, 'pifa.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    birthdate   TEXT NOT NULL,
    phone       TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    pin_hash    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS passkeys (
    credential_id TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key    TEXT NOT NULL,
    counter       INTEGER NOT NULL DEFAULT 0,
    transports    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Gerätekennung (Cookie), damit der Code-Login weiß, welches Konto gemeint ist.
  CREATE TABLE IF NOT EXISTS devices (
    token_hash    TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pin_failures  INTEGER NOT NULL DEFAULT 0,
    locked_until  INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );

  -- Admin-Sitzungen (Schlüssel-Login), unabhängig von Konten.
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash  TEXT PRIMARY KEY,
    expires_at  INTEGER NOT NULL
  );
`);

// Migration: Bezirk und Antworten für bestehende Datenbanken nachrüsten.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('district')) {
  db.exec('ALTER TABLE users ADD COLUMN district TEXT');
}
if (!userColumns.includes('answers')) {
  db.exec('ALTER TABLE users ADD COLUMN answers TEXT');
}

// Persönlichkeitstyp (D, I, S, G) dauerhaft speichern.
if (!userColumns.includes('personality')) {
  db.exec('ALTER TABLE users ADD COLUMN personality TEXT');
}
// Für bestehende Konten mit Quiz einmal aus den Antworten nachfüllen.
{
  const { disgProfile } = require('./quiz');
  const missing = db
    .prepare('SELECT id, answers FROM users WHERE personality IS NULL AND answers IS NOT NULL')
    .all();
  const update = db.prepare('UPDATE users SET personality = ? WHERE id = ?');
  for (const row of missing) {
    try {
      const profile = disgProfile(JSON.parse(row.answers));
      if (profile) update.run(profile.dominant, row.id);
    } catch (err) {
      // Ungültige Antworten überspringen.
    }
  }
}

// Fähigkeiten (XP) pro Konto.
db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill    TEXT NOT NULL,
    xp       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, skill)
  );
`);

module.exports = db;
