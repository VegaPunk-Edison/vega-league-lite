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

// Verein eines Vereinsmanagers (ein Verein pro Konto).
db.exec(`
  CREATE TABLE IF NOT EXISTS clubs (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS players (
    id          TEXT PRIMARY KEY,
    club_id     TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    vega_id     TEXT NOT NULL UNIQUE,
    birth_year  INTEGER NOT NULL,
    country     TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    pos_main    TEXT,
    pos_side1   TEXT,
    pos_side2   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS player_skills (
    player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    metric     TEXT NOT NULL,
    xp         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, metric)
  );
`);

// Anlauf eines Vereins: Pfad, Hauptboss, Siege, Zeitalter.
{
  const clubColumns = db.prepare('PRAGMA table_info(clubs)').all().map((c) => c.name);
  const add = {
    path: 'TEXT',
    boss_id: 'TEXT',
    mini_won: 'INTEGER NOT NULL DEFAULT 0',
    main_won: 'INTEGER NOT NULL DEFAULT 0',
    era: 'INTEGER NOT NULL DEFAULT 0',
    registered: 'INTEGER NOT NULL DEFAULT 0',
    founded: 'INTEGER',
    logo: 'TEXT',
    formation: 'TEXT',
    slots: 'TEXT',
    hype: 'INTEGER NOT NULL DEFAULT 0',
  };
  for (const [col, type] of Object.entries(add)) {
    if (!clubColumns.includes(col)) db.exec(`ALTER TABLE clubs ADD COLUMN ${col} ${type}`);
  }
}

// Ältere Datenbanken: owner_id war eindeutig (nur ein Verein pro Konto). Das wird aufgehoben,
// damit ein VM bis zu drei Vereine haben kann. Die Daten bleiben erhalten.
{
  const info = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'clubs'").get();
  if (info && /owner_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(info.sql)) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN');
    db.exec(`
      CREATE TABLE clubs_new (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        path TEXT,
        boss_id TEXT,
        mini_won INTEGER NOT NULL DEFAULT 0,
        main_won INTEGER NOT NULL DEFAULT 0,
        era INTEGER NOT NULL DEFAULT 0,
        registered INTEGER NOT NULL DEFAULT 0,
        founded INTEGER,
        logo TEXT,
        formation TEXT,
        slots TEXT
      );
      INSERT INTO clubs_new (id, owner_id, name, created_at, path, boss_id, mini_won, main_won, era, registered, founded, logo, formation, slots)
        SELECT id, owner_id, name, created_at, path, boss_id, mini_won, main_won, era, registered, founded, logo, formation, slots FROM clubs;
      DROP TABLE clubs;
      ALTER TABLE clubs_new RENAME TO clubs;
    `);
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON;');
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

// TikTok-Verknüpfung je Konto (Tokens nur für den Server).
db.exec(`
  CREATE TABLE IF NOT EXISTS tiktok_accounts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    open_id TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    refresh_expires_at INTEGER NOT NULL,
    scope TEXT
  );
`);

module.exports = db;
