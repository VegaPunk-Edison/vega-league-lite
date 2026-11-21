'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const db = require('./db');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const { validateField, FIELDS } = require('./validate');
const { DISTRICTS, DISG_TEXT, WELCOME, publicQuestions, scoreAnswers, disgProfile } = require('./quiz');
const { SKILLS, skillView, roleFor, levelFromXp } = require('./skills');
const tiktok = require('./tiktok');
const { MAX_PLAYERS, PLAYER_METRICS, ALL_METRIC_KEYS, POSITIONS, validatePlayer, STAT_CATEGORIES, STAT_SONSTIGE, STAT_METRIC_KEYS, DERIVED_MAIN_KEYS, deriveMainLevels } = require('./players');
const { PATHS, DIFFICULTY, bossesFor, parseBossId } = require('./bosses');


const PORT = Number(process.env.PORT) || 3000;
// Kennung dieses Builds. Unter http://localhost:3000/api/state sichtbar.
const BUILD = 'vega-league-bosses';
// Auf Hosting-Diensten (Render setzt RENDER) von außen erreichbar, lokal nur auf dem eigenen Rechner.
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const RP_NAME = 'ProClubs Internationale FootSim Association';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const DEVICE_MS = 365 * 24 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;
const MAX_PIN_FAILURES = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;

// Kurzlebige WebAuthn-Challenges, Schlüssel = Zufalls-ID im Cookie.
const challenges = new Map();

// Demo-Konto: wie ein echt registriertes Konto, aber mit erfundenen Daten.
// Nur für den Admin sichtbar und nutzbar. Abschalten mit DEMO_ACCOUNT=0.
const DEMO_ENABLED = process.env.DEMO_ACCOUNT !== '0';
const DEMO_USER_ID = 'demo-account';
// Admin-Schlüssel (Umgebungsvariable ADMIN_KEY). Ohne Schlüssel ist der Admin-Login aus.
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const ADMIN_MAX_FAILURES = 5;
const ADMIN_LOCK_MS = 5 * 60 * 1000;
const ADMIN_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const adminAttempts = { failures: 0, lockedUntil: 0 };

if (DEMO_ENABLED) {
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, birthdate, phone, email)
     VALUES (?, ?, ?, ?, ?)`
  ).run(DEMO_USER_ID, 'Max Demo', '01.01.1990', '+4900000001', 'demo@example.com');
  // Altes Demo-Konto (mit fest zugewiesenem Ozean) zurücksetzen, damit das Quiz kommt.
  db.prepare(
    `UPDATE users SET district = NULL, answers = NULL
     WHERE id = ? AND answers = ?`
  ).run(DEMO_USER_ID, JSON.stringify(['C', 'C', 'C', 'C', 'C']));
}

const app = express();
// Hinter dem Proxy des Hosting-Dienstes: echte Adresse (https) und Verbindung aus dem Proxy-Header übernehmen.
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
// Home-Seite nur mit gültiger Sitzung. Ohne Sitzung zurück zur Startseite.
app.get('/home.html', (req, res, next) => {
  if (!currentUser(req)) return res.redirect('/');
  next();
});
// Dateien nie aus dem Browser-Zwischenspeicher nehmen, damit immer die aktuelle Version läuft.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
  })
);

// ---------- Hilfsfunktionen ----------

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function cookieOpts(req, maxAge) {
  return { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge };
}

function origin(req) {
  return process.env.ORIGIN || `${req.protocol}://${req.get('host')}`;
}

function rpID(req) {
  return process.env.RP_ID || new URL(origin(req)).hostname;
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

function verifyPin(pin, stored) {
  const [saltB64, hashB64] = stored.split(':');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(pin, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const bytesToB64u = (bytes) => Buffer.from(bytes).toString('base64url');
const b64uToBytes = (str) => new Uint8Array(Buffer.from(str, 'base64url'));

function emailTaken(email) {
  return !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
}

function currentUser(req) {
  const token = readCookie(req, 'pifa_session');
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(hashToken(token), Date.now()) || null
  );
}

function currentDevice(req) {
  const token = readCookie(req, 'pifa_device');
  if (!token) return null;
  return db.prepare('SELECT * FROM devices WHERE token_hash = ?').get(hashToken(token)) || null;
}

function createSession(res, req, userId) {
  const token = randomToken();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    userId,
    Date.now() + SESSION_MS
  );
  res.cookie('pifa_session', token, cookieOpts(req, SESSION_MS));
}

// Verbindet dieses Gerät mit dem Konto (wird bei Registrierung und Setup gesetzt).
function bindDevice(res, req, userId) {
  const existing = currentDevice(req);
  if (existing && existing.user_id === userId) return;
  const token = randomToken();
  db.prepare('INSERT INTO devices (token_hash, user_id) VALUES (?, ?)').run(hashToken(token), userId);
  res.cookie('pifa_device', token, cookieOpts(req, DEVICE_MS));
}

function storeChallenge(res, req, data) {
  const id = randomToken();
  challenges.set(id, { ...data, expires: Date.now() + CHALLENGE_MS });
  res.cookie('pifa_challenge', id, cookieOpts(req, CHALLENGE_MS));
}

function takeChallenge(req, res) {
  const id = readCookie(req, 'pifa_challenge');
  const entry = id ? challenges.get(id) : null;
  if (id) challenges.delete(id);
  res.clearCookie('pifa_challenge', { path: '/' });
  if (!entry || entry.expires < Date.now()) return null;
  return entry;
}

// ---------- Status ----------

// ---------- Admin ----------

function isAdmin(req) {
  const token = readCookie(req, 'pifa_admin');
  if (!token) return false;
  const row = db
    .prepare('SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > ?')
    .get(hashToken(token), Date.now());
  return !!row;
}

function keysMatch(given, expected) {
  // Beide Werte auf gleiche Länge bringen, dann zeitkonstant vergleichen.
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_KEY) return res.status(404).json({ ok: false, error: 'Admin ist nicht eingerichtet.' });

  const now = Date.now();
  if (adminAttempts.lockedUntil > now) {
    const minutes = Math.ceil((adminAttempts.lockedUntil - now) / 60000);
    return res.status(429).json({ ok: false, error: `Zu viele Fehlversuche. Bitte ${minutes} Minute(n) warten.` });
  }

  const key = String(req.body?.key ?? '');
  if (!key || !keysMatch(key, ADMIN_KEY)) {
    adminAttempts.failures += 1;
    if (adminAttempts.failures >= ADMIN_MAX_FAILURES) {
      adminAttempts.lockedUntil = now + ADMIN_LOCK_MS;
      adminAttempts.failures = 0;
      return res.status(429).json({ ok: false, error: 'Zu viele Fehlversuche. Zugang für 5 Minuten gesperrt.' });
    }
    return res.status(401).json({ ok: false, error: 'Der Schlüssel ist falsch.' });
  }

  adminAttempts.failures = 0;
  const token = randomToken();
  db.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').run(
    hashToken(token),
    now + ADMIN_SESSION_MS
  );
  res.cookie('pifa_admin', token, cookieOpts(req, ADMIN_SESSION_MS));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  const token = readCookie(req, 'pifa_admin');
  if (token) db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashToken(token));
  res.clearCookie('pifa_admin', { path: '/' });
  res.json({ ok: true });
});

// XP für eine Fähigkeit eines Kontos vergeben (nur Admin). Vorerst die einzige XP-Quelle.
app.post('/api/admin/skills/grant', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Nur für den Admin.' });

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const skill = SKILLS.find((s) => s.key === String(req.body?.skill ?? ''));
  const xp = Number(req.body?.xp);
  if (!skill) return res.status(400).json({ ok: false, error: 'Unbekannte Fähigkeit.' });
  if (!Number.isInteger(xp) || xp <= 0 || xp > 1000000) {
    return res.status(400).json({ ok: false, error: 'XP muss eine ganze Zahl über 0 sein.' });
  }

  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ ok: false, error: 'Kein Konto mit dieser E-Mail.' });

  db.prepare(
    `INSERT INTO skills (user_id, skill, xp) VALUES (?, ?, ?)
     ON CONFLICT(user_id, skill) DO UPDATE SET xp = xp + excluded.xp`
  ).run(user.id, skill.key, xp);
  const row = db.prepare('SELECT xp FROM skills WHERE user_id = ? AND skill = ?').get(user.id, skill.key);
  res.json({ ok: true, name: user.name, skill: skillView(skill, row.xp) });
});

// Demo-Konto auf den Ausgangszustand zurücksetzen (Quiz kommt wieder, Daten Standard).
app.post('/api/admin/demo/reset', (req, res) => {
  if (!DEMO_ENABLED) return res.status(404).json({ ok: false, error: 'Demo-Zugang ist ausgeschaltet.' });
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Nur für den Admin.' });
  try {
    db.prepare(
      `UPDATE users SET name = ?, birthdate = ?, phone = ?, email = ?, district = NULL, answers = NULL, personality = NULL
       WHERE id = ?`
    ).run('Max Demo', '01.01.1990', '+4900000001', 'demo@example.com', DEMO_USER_ID);
    db.prepare('DELETE FROM skills WHERE user_id = ?').run(DEMO_USER_ID);
  } catch (err) {
    return res.status(409).json({ ok: false, error: 'Die Standard-E-Mail des Demo-Kontos ist bereits vergeben.' });
  }
  res.json({ ok: true });
});

// Demo-Konto öffnen: nur mit Admin-Sitzung.
app.post('/api/demo/login', (req, res) => {
  if (!DEMO_ENABLED) return res.status(404).json({ ok: false, error: 'Demo-Zugang ist ausgeschaltet.' });
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Nur für den Admin.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(DEMO_USER_ID);
  if (!user) return res.status(500).json({ ok: false, error: 'Demo-Konto fehlt.' });
  createSession(res, req, user.id);
  res.json({ ok: true, name: user.name });
});

// ---------- Status ----------

app.get('/api/state', (req, res) => {
  const user = currentUser(req);
  const device = currentDevice(req);
  const deviceUser = device
    ? db.prepare('SELECT id, pin_hash FROM users WHERE id = ?').get(device.user_id)
    : null;
  const admin = isAdmin(req);
  res.json({
    loggedIn: !!user,
    name: user ? user.name : null,
    deviceKnown: !!deviceUser,
    hasPin: !!(deviceUser && deviceUser.pin_hash),
    adminKeyConfigured: !!ADMIN_KEY,
    isAdmin: admin,
    demoEnabled: DEMO_ENABLED && admin,
    build: BUILD,
  });
});

// ---------- Registrierung ----------

// Prüft ein einzelnes Feld (wird nach jeder Eingabe aufgerufen).
app.post('/api/register/check', (req, res) => {
  const body = req.body ?? {};
  const result = validateField(body.field, body.value);
  if (!result.ok) return res.json({ ok: false, error: result.error });
  if (body.field === 'email' && emailTaken(result.value)) {
    return res.json({ ok: false, error: 'Diese E-Mail-Adresse ist bereits registriert.' });
  }
  res.json({ ok: true, value: result.value });
});

// Legt das Konto an, nachdem alle Felder bestätigt wurden.
app.post('/api/register/create', (req, res) => {
  const body = req.body ?? {};
  const values = {};
  for (const field of FIELDS) {
    const result = validateField(field, body[field]);
    if (!result.ok) {
      return res.status(400).json({ ok: false, field, error: result.error });
    }
    values[field] = result.value;
  }
  if (emailTaken(values.email)) {
    return res.status(409).json({ ok: false, field: 'email', error: 'Diese E-Mail-Adresse ist bereits registriert.' });
  }

  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO users (id, name, birthdate, phone, email) VALUES (?, ?, ?, ?, ?)'
  ).run(id, values.name, values.birthdate, values.phone, values.email);

  createSession(res, req, id);
  bindDevice(res, req, id);
  res.json({ ok: true, name: values.name });
});

// ---------- Zugang einrichten (eingeloggt nötig) ----------

app.post('/api/setup/pin', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Bitte zuerst registrieren.' });

  const pin = String(req.body?.pin ?? '');
  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ ok: false, error: 'Der Code muss aus genau 6 Ziffern bestehen.' });
  }
  if (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321') {
    return res.status(400).json({ ok: false, error: 'Dieser Code ist zu einfach.' });
  }

  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(pin), user.id);
  bindDevice(res, req, user.id);
  res.json({ ok: true });
});

app.post('/api/setup/passkey/options', async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Bitte zuerst registrieren.' });

  const existing = db.prepare('SELECT credential_id, transports FROM passkeys WHERE user_id = ?').all(user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpID(req),
    userName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });

  storeChallenge(res, req, { challenge: options.challenge, kind: 'register', userId: user.id });
  res.json(options);
});

app.post('/api/setup/passkey/verify', async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Bitte zuerst registrieren.' });

  const challenge = takeChallenge(req, res);
  if (!challenge || challenge.kind !== 'register' || challenge.userId !== user.id) {
    return res.status(400).json({ ok: false, error: 'Die Sitzung ist abgelaufen. Bitte erneut versuchen.' });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body?.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin(req),
      expectedRPID: rpID(req),
      requireUserVerification: true,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: 'Der Fingerabdruck konnte nicht geprüft werden.' });
  }
  if (!verification.verified) {
    return res.status(400).json({ ok: false, error: 'Der Fingerabdruck konnte nicht bestätigt werden.' });
  }

  const { credential } = verification.registrationInfo;
  db.prepare(
    'INSERT INTO passkeys (credential_id, user_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)'
  ).run(
    credential.id,
    user.id,
    bytesToB64u(credential.publicKey),
    credential.counter,
    JSON.stringify(credential.transports ?? [])
  );
  bindDevice(res, req, user.id);
  res.json({ ok: true });
});

// ---------- Anmeldung ----------

// Fingerabdruck: Gerät schlägt selbst das passende Konto vor (discoverable credential).
app.post('/api/login/passkey/options', async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: rpID(req),
    userVerification: 'required',
    allowCredentials: [],
  });
  storeChallenge(res, req, { challenge: options.challenge, kind: 'login' });
  res.json(options);
});

app.post('/api/login/passkey/verify', async (req, res) => {
  const challenge = takeChallenge(req, res);
  if (!challenge || challenge.kind !== 'login') {
    return res.status(400).json({ ok: false, error: 'Die Sitzung ist abgelaufen. Bitte erneut versuchen.' });
  }

  const response = req.body?.response;
  const stored = response?.id
    ? db.prepare('SELECT * FROM passkeys WHERE credential_id = ?').get(response.id)
    : null;
  if (!stored) {
    return res.status(401).json({ ok: false, error: 'Dieser Fingerabdruck ist keinem Konto zugeordnet.' });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin(req),
      expectedRPID: rpID(req),
      credential: {
        id: stored.credential_id,
        publicKey: b64uToBytes(stored.public_key),
        counter: stored.counter,
        transports: stored.transports ? JSON.parse(stored.transports) : undefined,
      },
      requireUserVerification: true,
    });
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Der Fingerabdruck konnte nicht geprüft werden.' });
  }
  if (!verification.verified) {
    return res.status(401).json({ ok: false, error: 'Der Fingerabdruck wurde nicht erkannt.' });
  }

  db.prepare('UPDATE passkeys SET counter = ? WHERE credential_id = ?').run(
    verification.authenticationInfo.newCounter,
    stored.credential_id
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(stored.user_id);
  createSession(res, req, user.id);
  bindDevice(res, req, user.id);
  res.json({ ok: true, name: user.name });
});

// Code: Das Gerät erkennt das Konto, der 6-stellige Code bestätigt die Person.
app.post('/api/login/pin', (req, res) => {
  const device = currentDevice(req);
  if (!device) {
    return res.status(401).json({ ok: false, error: 'Dieses Gerät ist nicht registriert. Bitte zuerst registrieren.' });
  }

  const now = Date.now();
  if (device.locked_until > now) {
    const minutes = Math.ceil((device.locked_until - now) / 60000);
    return res.status(429).json({
      ok: false,
      error: `Zu viele Fehlversuche. Bitte ${minutes} Minute(n) warten.`,
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(device.user_id);
  if (!user || !user.pin_hash) {
    return res.status(400).json({ ok: false, error: 'Für dieses Konto ist kein Code hinterlegt.' });
  }

  const pin = String(req.body?.pin ?? '');
  // Admin-Zugang: der Admin-Schlüssel (6 Ziffern) wird über den Code-Login auf einem bekannten Gerät eingegeben.
  if (ADMIN_KEY && /^\d{6}$/.test(pin) && keysMatch(pin, ADMIN_KEY)) {
    db.prepare('UPDATE devices SET pin_failures = 0, locked_until = 0 WHERE token_hash = ?').run(device.token_hash);
    const adminToken = randomToken();
    db.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').run(hashToken(adminToken), now + ADMIN_SESSION_MS);
    res.cookie('pifa_admin', adminToken, cookieOpts(req, ADMIN_SESSION_MS));
    return res.json({ ok: true, admin: true });
  }
  const valid = /^\d{6}$/.test(pin) && verifyPin(pin, user.pin_hash);
  if (!valid) {
    const failures = device.pin_failures + 1;
    const lockedUntil = failures >= MAX_PIN_FAILURES ? now + PIN_LOCK_MS : 0;
    db.prepare('UPDATE devices SET pin_failures = ?, locked_until = ? WHERE token_hash = ?').run(
      lockedUntil ? 0 : failures,
      lockedUntil,
      device.token_hash
    );
    return res.status(401).json({
      ok: false,
      error: lockedUntil ? 'Zu viele Fehlversuche. Zugang für 5 Minuten gesperrt.' : 'Der Code ist falsch.',
    });
  }

  db.prepare('UPDATE devices SET pin_failures = 0, locked_until = 0 WHERE token_hash = ?').run(device.token_hash);
  createSession(res, req, user.id);
  res.json({ ok: true, name: user.name });
});

// Code-Login auf neuem Gerät: E-Mail + Code. Danach ist das Gerät bekannt.
const emailAttempts = new Map(); // E-Mail -> { failures, lockedUntil }
app.post('/api/login/email', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const pin = String(req.body?.pin ?? '');
  if (!email) return res.status(400).json({ ok: false, error: 'Bitte die E-Mail-Adresse eingeben.' });

  const now = Date.now();
  const attempt = emailAttempts.get(email) || { failures: 0, lockedUntil: 0 };
  if (attempt.lockedUntil > now) {
    const minutes = Math.ceil((attempt.lockedUntil - now) / 60000);
    return res.status(429).json({ ok: false, error: `Zu viele Fehlversuche. Bitte ${minutes} Minute(n) warten.` });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const valid = !!user && !!user.pin_hash && /^\d{6}$/.test(pin) && verifyPin(pin, user.pin_hash);
  if (!valid) {
    attempt.failures += 1;
    if (attempt.failures >= MAX_PIN_FAILURES) {
      attempt.lockedUntil = now + PIN_LOCK_MS;
      attempt.failures = 0;
    }
    emailAttempts.set(email, attempt);
    // Absichtlich allgemein, damit man nicht prüfen kann, welche E-Mails existieren.
    return res.status(401).json({ ok: false, error: 'E-Mail oder Code ist falsch.' });
  }

  emailAttempts.delete(email);
  createSession(res, req, user.id);
  bindDevice(res, req, user.id);
  res.json({ ok: true, name: user.name });
});

app.post('/api/logout', (req, res) => {
  const token = readCookie(req, 'pifa_session');
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
  res.clearCookie('pifa_session', { path: '/' });
  res.json({ ok: true });
});

// ---------- Home / Bezirks-Quiz (Sitzung nötig) ----------

function districtView(key) {
  if (!key || !DISTRICTS[key]) return null;
  return { key, name: DISTRICTS[key].name, desc: DISTRICTS[key].desc };
}

function personalityView(type) {
  if (!type || !DISG_TEXT[type]) return null;
  return { type, name: DISG_TEXT[type].name, description: DISG_TEXT[type].desc };
}

// Alle sieben Fähigkeiten eines Kontos, mit 0 XP für fehlende Einträge.
function skillsFor(userId) {
  const rows = db.prepare('SELECT skill, xp FROM skills WHERE user_id = ?').all(userId);
  const xpByKey = Object.fromEntries(rows.map((r) => [r.skill, r.xp]));
  return SKILLS.map((s) => skillView(s, xpByKey[s.key] || 0));
}

function profileView(u) {
  return { name: u.name, birthdate: u.birthdate, phone: u.phone, email: u.email };
}

app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  let answers = null;
  try {
    answers = user.answers ? JSON.parse(user.answers) : null;
  } catch (err) {
    answers = null;
  }
  res.json({
    ok: true,
    name: user.name,
    profile: profileView(user),
    district: districtView(user.district),
    disg: user.district && answers ? disgProfile(answers) : null,
    personality: personalityView(user.personality),
    skills: skillsFor(user.id),
    role: roleFor(skillsFor(user.id)),
    clubs: clubsFor(user.id).map(clubSummary),
    eraNow: eraName(Math.max(0, ...clubsFor(user.id).map((c) => c.era))),
  });
});

app.get('/api/quiz', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  res.json({ ok: true, welcome: WELCOME, questions: publicQuestions() });
});

// Persönliche Daten ändern (gleiche Prüfungen wie bei der Registrierung).
app.post('/api/profile', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });

  const body = req.body ?? {};
  const values = {};
  for (const field of FIELDS) {
    const result = validateField(field, body[field]);
    if (!result.ok) return res.status(400).json({ ok: false, field, error: result.error });
    values[field] = result.value;
  }

  const taken = db
    .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
    .get(values.email, user.id);
  if (taken) {
    return res.status(409).json({ ok: false, field: 'email', error: 'Diese E-Mail-Adresse ist bereits registriert.' });
  }

  db.prepare('UPDATE users SET name = ?, birthdate = ?, phone = ?, email = ? WHERE id = ?').run(
    values.name,
    values.birthdate,
    values.phone,
    values.email,
    user.id
  );
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ ok: true, name: updated.name, profile: profileView(updated) });
});

app.post('/api/quiz/submit', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  if (user.district) {
    return res.status(409).json({ ok: false, error: 'Der Ozean wurde bereits festgelegt.' });
  }

  const answers = req.body?.answers;
  let key;
  try {
    key = scoreAnswers(answers);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  const profile = disgProfile(answers);
  db.prepare('UPDATE users SET district = ?, answers = ?, personality = ? WHERE id = ?').run(
    key,
    JSON.stringify(answers),
    profile ? profile.dominant : null,
    user.id
  );
  res.json({ ok: true, district: districtView(key) });
});

// Vereine, Kader, Formation, Freischalten, Anlauf und Tabelle.
// Ein VM hat bis zu MAX_CLUBS Vereine.
const ERAS = ['Antike', 'Renaissance', 'Moderne'];
const MAX_CLUBS = 3;
const MIN_PLAYERS_FOR_UNLOCK = 11; // "Jetzt freischalten" (Vega League)
const MIN_PLAYERS_FOR_FORMATION = 5;
const LOGO_DIR = path.join(DATA_DIR, 'logos');
fs.mkdirSync(LOGO_DIR, { recursive: true });
app.use('/logos', express.static(LOGO_DIR, { etag: false, lastModified: false, setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));

// Formationen: Zeilen von hinten nach vorne. Die Reihenfolge der Positionen ergibt die Slots 0 bis 10.
const FORMATIONS = {
  '4-4-2': [['TW'], ['LV', 'IV', 'IV', 'RV'], ['LM', 'ZM', 'ZM', 'RM'], ['ST', 'ST']],
  '4-3-3': [['TW'], ['LV', 'IV', 'IV', 'RV'], ['ZM', 'DM', 'ZM'], ['LA', 'ST', 'RA']],
  '4-2-3-1': [['TW'], ['LV', 'IV', 'IV', 'RV'], ['DM', 'DM'], ['LM', 'OM', 'RM'], ['ST']],
  '3-5-2': [['TW'], ['IV', 'IV', 'IV'], ['LM', 'ZM', 'DM', 'ZM', 'RM'], ['ST', 'ST']],
};
const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function eraName(index) {
  return ERAS[index] || `Zeitalter ${index + 1}`;
}

function clubsFor(userId) {
  return db.prepare('SELECT * FROM clubs WHERE owner_id = ? ORDER BY created_at, rowid').all(userId);
}

function ownedClub(userId, clubId) {
  return db.prepare('SELECT * FROM clubs WHERE id = ? AND owner_id = ?').get(clubId, userId) || null;
}

function playerCount(clubId) {
  return db.prepare('SELECT COUNT(*) AS n FROM players WHERE club_id = ?').get(clubId).n;
}

function ownerOf(club) {
  return db.prepare('SELECT id, name, district FROM users WHERE id = ?').get(club.owner_id);
}

// Hype-Stufen: 0 = Aus, 1 = Lauwarm, 2 = Warm, 3 = Heiß. Die Grenzen sind vorläufig.
function hypeStageFor(value) {
  if (value <= 0) return 0;
  if (value < 34) return 1;
  if (value < 67) return 2;
  return 3;
}

function clubSummary(club) {
  const owner = ownerOf(club);
  const count = playerCount(club.id);
  return {
    id: club.id,
    name: club.name,
    founded: club.founded,
    logo: club.logo ? `/logos/${club.logo}` : null,
    manager: owner ? owner.name : '',
    members: count,
    playerCount: count,
    maxPlayers: MAX_PLAYERS,
    era: eraName(club.era),
    eraIndex: club.era,
    registered: !!club.registered,
    path: club.path || null,
    pathName: club.path ? PATHS[club.path].name : null,
    activeRun: !!club.boss_id,
    district: owner ? owner.district : null,
    canUnlock: !club.registered && count >= MIN_PLAYERS_FOR_UNLOCK,
    minPlayers: MIN_PLAYERS_FOR_UNLOCK,
    hype: club.hype || 0,
    hypeStage: hypeStageFor(club.hype || 0),
  };
}

// Zustand des Anlaufs: Pfad, Hauptboss, Minibosse mit Status.
function bossState(club, district) {
  const state = {
    path: club.path || null,
    pathName: club.path ? PATHS[club.path].name : null,
    bossId: club.boss_id || null,
    bossName: null,
    minibosses: [],
    options: [],
    miniWon: club.mini_won,
    mainWon: !!club.main_won,
  };
  if (club.boss_id) {
    const parsed = parseBossId(club.boss_id);
    const boss = bossesFor(parsed.district, parsed.path)[parsed.n - 1];
    state.bossName = boss.name;
    state.minibosses = boss.minibosses.map((m) => ({
      ...m,
      status: m.index <= club.mini_won ? 'besiegt' : m.index === club.mini_won + 1 ? 'aktuell' : 'gesperrt',
    }));
  } else if (club.path && district) {
    state.options = bossesFor(district, club.path).map((b) => ({ id: b.id, name: b.name }));
  }
  return state;
}

function playerXp(playerId) {
  const rows = db.prepare('SELECT metric, xp FROM player_skills WHERE player_id = ?').all(playerId);
  return Object.fromEntries(rows.map((r) => [r.metric, r.xp]));
}

// Summe der Level aller Metriken eines Spielers.
function playerLevelSum(playerId) {
  const xp = playerXp(playerId);
  const main = deriveMainLevels((key) => levelFromXp(xp[`st_${key}`] || 0));
  return ALL_METRIC_KEYS.reduce((sum, key) => sum + (key in main ? main[key] : levelFromXp(xp[key] || 0)), 0);
}

// Summe der Level der sieben VM-Fähigkeiten eines Kontos.
function vmLevelSum(userId) {
  const rows = db.prepare('SELECT skill, xp FROM skills WHERE user_id = ?').all(userId);
  const xpByKey = Object.fromEntries(rows.map((r) => [r.skill, r.xp]));
  return SKILLS.reduce((sum, s) => sum + levelFromXp(xpByKey[s.key] || 0), 0);
}

// Platzierungswert eines Vereins: Summe der Spieler-Level plus Gesamt-Level des VM.
function clubScore(club) {
  const players = db.prepare('SELECT id FROM players WHERE club_id = ?').all(club.id);
  const playerSum = players.reduce((sum, p) => sum + playerLevelSum(p.id), 0);
  return playerSum + vmLevelSum(club.owner_id);
}

// Spieler mit Kontaktdaten, Positionen und allen Metriken.
function playerDetail(p) {
  const xp = playerXp(p.id);
  const main = deriveMainLevels((key) => levelFromXp(xp[`st_${key}`] || 0));
  return {
    id: p.id,
    fullName: p.full_name,
    vegaId: p.vega_id,
    birthYear: p.birth_year,
    country: p.country,
    email: p.email,
    phone: p.phone,
    positions: { main: p.pos_main, side1: p.pos_side1, side2: p.pos_side2 },
    groups: Object.entries(PLAYER_METRICS).map(([key, g]) => ({
      key,
      name: g.name,
      metrics: g.metrics.map((m) => (
        m.key in main
          ? { key: m.key, name: m.name, short: m.key, level: main[m.key], derived: true }
          : skillView({ key: m.key, name: m.name, short: m.key }, xp[m.key] || 0)
      )),
    })),
    stats: STAT_CATEGORIES.map((c) => ({
      key: c.key,
      name: c.name,
      subs: c.subs.map(([key, name]) => skillView({ key: `st_${key}`, name, short: key }, xp[`st_${key}`] || 0)),
    })),
    sonstige: STAT_SONSTIGE.map(([key, name]) => skillView({ key: `st_${key}`, name, short: key }, xp[`st_${key}`] || 0)),
  };
}

// Spieler-XP vergeben (nur Admin): Attribut- oder Stat-Schlüssel, ganze Zahl über 0.
app.post('/api/admin/players/grant', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Nur für den Admin.' });
  const vegaId = String(req.body?.vegaId ?? '').trim();
  const metric = String(req.body?.metric ?? '').trim();
  const xp = req.body?.xp;
  if (DERIVED_MAIN_KEYS.includes(metric)) {
    return res.status(400).json({ ok: false, error: 'Hauptattribute werden aus den Unterattributen berechnet. Vergib XP an einen Stat.' });
  }
  const allowed = [...ALL_METRIC_KEYS, ...STAT_METRIC_KEYS];
  if (!allowed.includes(metric)) return res.status(400).json({ ok: false, error: 'Unbekannte Metrik.' });
  if (!Number.isInteger(xp) || xp <= 0 || xp > 1000000) {
    return res.status(400).json({ ok: false, error: 'XP muss eine ganze Zahl über 0 sein.' });
  }
  const player = db.prepare('SELECT * FROM players WHERE vega_id = ?').get(vegaId);
  if (!player) return res.status(404).json({ ok: false, error: 'Kein Spieler mit dieser Vega ID.' });
  db.prepare(`INSERT INTO player_skills (player_id, metric, xp) VALUES (?, ?, ?)
    ON CONFLICT(player_id, metric) DO UPDATE SET xp = xp + excluded.xp`).run(player.id, metric, xp);
  res.json({ ok: true, player: playerDetail(db.prepare('SELECT * FROM players WHERE id = ?').get(player.id)) });
});

// Verein anlegen (bis zu drei pro VM).
// Vereinsname: 3 bis 60 Zeichen, Leerzeichen zusammengefasst. null bei ungültigem Namen.
function clubNameFrom(body) {
  const name = String(body?.name ?? '').replace(/\s+/g, ' ').trim();
  return name.length >= 3 && name.length <= 60 ? name : null;
}

app.post('/api/clubs', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  if (clubsFor(user.id).length >= MAX_CLUBS) {
    return res.status(409).json({ ok: false, error: `Du kannst höchstens ${MAX_CLUBS} Vereine anlegen.` });
  }
  const name = clubNameFrom(req.body);
  if (!name) {
    return res.status(400).json({ ok: false, error: 'Der Vereinsname braucht 3 bis 60 Zeichen.' });
  }
  const founded = Number(req.body?.founded);
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(founded) || founded < 1900 || founded > thisYear) {
    return res.status(400).json({ ok: false, error: `Bitte ein gültiges Gründungsjahr eingeben (1900 bis ${thisYear}).` });
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO clubs (id, owner_id, name, founded) VALUES (?, ?, ?, ?)').run(id, user.id, name, founded);
  res.json({ ok: true, club: clubSummary(ownedClub(user.id, id)) });
});

// Alle eigenen Vereine (Vereinshaus).
app.get('/api/clubs', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  res.json({ ok: true, maxClubs: MAX_CLUBS, clubs: clubsFor(user.id).map(clubSummary) });
});

// Logo hochladen (optional, png, jpg oder webp, bis 1 MB).
app.post(
  '/api/clubs/:id/logo',
  express.raw({ type: Object.keys(LOGO_TYPES), limit: '1mb' }),
  (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
    const club = ownedClub(user.id, req.params.id);
    if (!club) return res.status(404).json({ ok: false, error: 'Verein nicht gefunden.' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ ok: false, error: 'Keine Bilddatei empfangen.' });
    }
    const ext = LOGO_TYPES[req.headers['content-type']];
    const file = `${club.id}.${ext}`;
    if (club.logo && club.logo !== file) fs.rmSync(path.join(LOGO_DIR, club.logo), { force: true });
    fs.writeFileSync(path.join(LOGO_DIR, file), req.body);
    db.prepare('UPDATE clubs SET logo = ? WHERE id = ?').run(file, club.id);
    res.json({ ok: true, club: clubSummary(ownedClub(user.id, club.id)) });
  }
);

// Name des Vereins ändern (nur eigene Vereine).
app.patch('/api/clubs/:id', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const club = ownedClub(user.id, req.params.id);
  if (!club) return res.status(404).json({ ok: false, error: 'Verein nicht gefunden.' });
  const name = clubNameFrom(req.body);
  if (!name) return res.status(400).json({ ok: false, error: 'Der Vereinsname braucht 3 bis 60 Zeichen.' });
  db.prepare('UPDATE clubs SET name = ? WHERE id = ?').run(name, club.id);
  res.json({ ok: true, club: clubSummary(ownedClub(user.id, club.id)) });
});

// Ein Verein mit Kader, Formation, Anlauf und Freischaltung.
app.get('/api/clubs/:id', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const club = ownedClub(user.id, req.params.id);
  if (!club) return res.status(404).json({ ok: false, error: 'Verein nicht gefunden.' });
  const players = db
    .prepare('SELECT id, full_name, vega_id, birth_year, country, pos_main FROM players WHERE club_id = ? ORDER BY full_name')
    .all(club.id)
    .map((p) => ({
      id: p.id,
      fullName: p.full_name,
      vegaId: p.vega_id,
      birthYear: p.birth_year,
      country: p.country,
      posMain: p.pos_main,
      level: playerLevelSum(p.id),
    }));
  res.json({
    ok: true,
    club: clubSummary(club),
    players,
    formation: club.formation || null,
    slots: club.slots ? JSON.parse(club.slots) : {},
    formations: Object.entries(FORMATIONS).map(([name, rows]) => ({ name, rows })),
    minPlayersForFormation: MIN_PLAYERS_FOR_FORMATION,
    boss: bossState(club, user.district),
  });
});

// Spieler anlegen (bis zu 24 pro Verein).
app.post('/api/clubs/:id/players', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const club = ownedClub(user.id, req.params.id);
  if (!club) return res.status(404).json({ ok: false, error: 'Verein nicht gefunden.' });
  if (playerCount(club.id) >= MAX_PLAYERS) {
    return res.status(409).json({ ok: false, error: `Der Kader ist voll (maximal ${MAX_PLAYERS} Spieler).` });
  }
  const result = validatePlayer(req.body ?? {});
  if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
  const v = result.value;
  if (db.prepare('SELECT id FROM players WHERE vega_id = ?').get(v.vegaId)) {
    return res.status(409).json({ ok: false, error: 'Diese Vega ID ist bereits vergeben.' });
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO players (id, club_id, full_name, vega_id, birth_year, country, email, phone, pos_main, pos_side1, pos_side2)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, club.id, v.fullName, v.vegaId, v.birthYear, v.country, v.email, v.phone, v.posMain, v.posSide1, v.posSide2);
  res.json({ ok: true, player: playerDetail(db.prepare('SELECT * FROM players WHERE id = ?').get(id)) });
});

// Spieler-Detail (nur eigene Spieler).
app.get('/api/clubs/:id/players/:pid', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const club = ownedClub(user.id, req.params.id);
  const player = club ? db.prepare('SELECT * FROM players WHERE id = ? AND club_id = ?').get(req.params.pid, club.id) : null;
  if (!player) return res.status(404).json({ ok: false, error: 'Spieler nicht gefunden.' });
  res.json({ ok: true, player: playerDetail(player) });
});

// Formation und Zuordnung der Spieler auf die Positionen (ab 5 Spielern).
app.post('/api/clubs/:id/formation', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const club = ownedClub(user.id, req.params.id);
  if (!club) return res.status(404).json({ ok: false, error: 'Verein nicht gefunden.' });
  if (playerCount(club.id) < MIN_PLAYERS_FOR_FORMATION) {
    return res.status(400).json({ ok: false, error: `Eine Formation gibt es ab ${MIN_PLAYERS_FOR_FORMATION} Spielern.` });
  }
  const formation = String(req.body?.formation ?? '');
  if (!FORMATIONS[formation]) return res.status(400).json({ ok: false, error: 'Unbekannte Formation.' });
  const slotCount = FORMATIONS[formation].flat().length;
  const given = req.body?.slots ?? {};
  const clean = {};
  const used = new Set();
  for (let i = 0; i < slotCount; i++) {
    const pid = given[i] ?? null;
    if (!pid) {
      clean[i] = null;
      continue;
    }
    const owns = db.prepare('SELECT id FROM players WHERE id = ? AND club_id = ?').get(String(pid), club.id);
    if (!owns || used.has(pid)) return res.status(400).json({ ok: false, error: 'Ungültige Spielerzuordnung.' });
    used.add(pid);
    clean[i] = String(pid);
  }
  db.prepare('UPDATE clubs SET formation = ?, slots = ? WHERE id = ?').run(formation, JSON.stringify(clean), club.id);
  res.json({ ok: true, formation, slots: clean });
});

// Verein in der Vega League freischalten (ab 11 Spielern).
app.post('/api/clubs/:id/unlock', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const club = ownedClub(user.id, req.params.id);
  if (!club) return res.status(404).json({ ok: false, error: 'Verein nicht gefunden.' });
  if (club.registered) return res.status(409).json({ ok: false, error: 'Der Verein ist bereits freigeschaltet.' });
  const count = playerCount(club.id);
  if (count < MIN_PLAYERS_FOR_UNLOCK) {
    return res.status(400).json({ ok: false, error: `Zum Freischalten braucht der Verein mindestens ${MIN_PLAYERS_FOR_UNLOCK} Spieler (aktuell ${count}).` });
  }
  db.prepare('UPDATE clubs SET registered = 1 WHERE id = ?').run(club.id);
  res.json({ ok: true, club: clubSummary(ownedClub(user.id, club.id)) });
});

// Pfad wählen (Admiral oder Kaiser). Nur freigeschaltet und ohne laufenden Anlauf.
app.post('/api/clubs/:id/path', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const club = ownedClub(user.id, req.params.id);
  if (!club) return res.status(404).json({ ok: false, error: 'Verein nicht gefunden.' });
  if (!club.registered) return res.status(409).json({ ok: false, error: 'Der Verein ist noch nicht freigeschaltet.' });
  if (club.boss_id) return res.status(409).json({ ok: false, error: 'Der laufende Anlauf ist noch nicht beendet.' });
  if (!user.district) return res.status(400).json({ ok: false, error: 'Bitte zuerst das Quiz machen, damit dein Ozean feststeht.' });
  const path = String(req.body?.path ?? '');
  if (!PATHS[path]) return res.status(400).json({ ok: false, error: 'Unbekannter Pfad.' });
  db.prepare('UPDATE clubs SET path = ?, boss_id = NULL, mini_won = 0, main_won = 0 WHERE id = ?').run(path, club.id);
  res.json({ ok: true, boss: bossState(ownedClub(user.id, club.id), user.district) });
});

// Hauptboss wählen. Er muss zu Ozean und Pfad passen.
app.post('/api/clubs/:id/boss', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const club = ownedClub(user.id, req.params.id);
  if (!club) return res.status(404).json({ ok: false, error: 'Verein nicht gefunden.' });
  if (!club.registered) return res.status(409).json({ ok: false, error: 'Der Verein ist noch nicht freigeschaltet.' });
  if (!club.path) return res.status(400).json({ ok: false, error: 'Bitte zuerst einen Pfad wählen.' });
  if (club.boss_id) return res.status(409).json({ ok: false, error: 'Der laufende Anlauf ist noch nicht beendet.' });
  const parsed = parseBossId(req.body?.bossId);
  if (!parsed || parsed.path !== club.path || parsed.district !== user.district) {
    return res.status(400).json({ ok: false, error: 'Dieser Hauptboss passt nicht zu deinem Ozean oder Pfad.' });
  }
  db.prepare('UPDATE clubs SET boss_id = ? WHERE id = ?').run(String(req.body.bossId), club.id);
  res.json({ ok: true, boss: bossState(ownedClub(user.id, club.id), user.district) });
});

// Tabelle: Platzierung in Ozean und Zeitalter, nur freigeschaltete Vereine.
app.get('/api/tabelle', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const groups = clubsFor(user.id).map((own) => {
    const ownerDistrict = ownerOf(own)?.district || null;
    const rows = db
      .prepare(
        `SELECT clubs.* FROM clubs JOIN users ON users.id = clubs.owner_id
         WHERE clubs.registered = 1 AND clubs.era = ? AND users.district IS ?`
      )
      .all(own.era, ownerDistrict)
      .map((c) => ({ club: c, score: clubScore(c) }))
      .sort((a, b) => b.score - a.score);
    const place = rows.findIndex((r) => r.club.id === own.id) + 1;
    return {
      clubId: own.id,
      clubName: own.name,
      era: eraName(own.era),
      registered: !!own.registered,
      place: place || null,
      of: rows.length,
      entries: rows.map((r, i) => ({
        place: i + 1,
        clubId: r.club.id,
        name: r.club.name,
        manager: ownerOf(r.club)?.name || '',
        score: r.score,
        own: r.club.owner_id === user.id,
      })),
    };
  });
  res.json({ ok: true, groups });
});

// Bosssieg eintragen (nur Admin): über E-Mail des VM und Vereinsname.
app.post('/api/admin/clubs/win', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Nur für den Admin.' });
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const clubName = String(req.body?.clubName ?? '').trim();
  const kind = String(req.body?.kind ?? '');
  const owner = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const club = owner
    ? db.prepare('SELECT * FROM clubs WHERE owner_id = ? AND name = ?').get(owner.id, clubName)
    : null;
  if (!club) return res.status(404).json({ ok: false, error: 'Kein Verein mit diesem Namen zu dieser E-Mail.' });
  if (!club.registered) return res.status(409).json({ ok: false, error: 'Der Verein ist noch nicht freigeschaltet.' });
  if (!club.boss_id) return res.status(409).json({ ok: false, error: 'Dieser Verein hat keinen Hauptboss gewählt.' });

  if (kind === 'miniboss') {
    if (club.mini_won >= DIFFICULTY.length) return res.status(409).json({ ok: false, error: 'Alle Minibosse sind schon besiegt.' });
    db.prepare('UPDATE clubs SET mini_won = mini_won + 1 WHERE id = ?').run(club.id);
  } else if (kind === 'main') {
    if (club.mini_won < DIFFICULTY.length) {
      return res.status(409).json({ ok: false, error: 'Erst alle drei Minibosse besiegen.' });
    }
    db.prepare('UPDATE clubs SET era = era + 1, path = NULL, boss_id = NULL, mini_won = 0, main_won = 0 WHERE id = ?').run(club.id);
  } else {
    return res.status(400).json({ ok: false, error: 'Art unbekannt: miniboss oder main.' });
  }
  const updated = db.prepare('SELECT * FROM clubs WHERE id = ?').get(club.id);
  res.json({ ok: true, club: clubSummary(updated), boss: bossState(updated, null) });
});

// ---------- TikTok: Konto verknüpfen und Videos lesen ----------

app.get('/api/tiktok/status', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const row = db.prepare('SELECT user_id FROM tiktok_accounts WHERE user_id = ?').get(user.id);
  res.json({ ok: true, configured: tiktok.isConfigured(), connected: !!row });
});

app.post('/api/tiktok/connect', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  if (!tiktok.isConfigured()) {
    return res.status(503).json({ ok: false, error: 'TikTok ist auf dem Server noch nicht eingerichtet.' });
  }
  res.json({ ok: true, url: tiktok.startAuth(user.id) });
});

// Ziel der Weiterleitung von TikTok nach der Zustimmung.
app.get('/api/tiktok/callback', async (req, res) => {
  const entry = tiktok.takeAuth(String(req.query.state || ''));
  const code = String(req.query.code || '');
  if (!entry || !code) return res.redirect('/home.html?tiktok=fehler');
  try {
    const row = tiktok.tokenRow(await tiktok.exchangeCode(code, entry.verifier));
    db.prepare(`INSERT INTO tiktok_accounts (user_id, open_id, access_token, refresh_token, expires_at, refresh_expires_at, scope)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET open_id = excluded.open_id, access_token = excluded.access_token,
        refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
        refresh_expires_at = excluded.refresh_expires_at, scope = excluded.scope`).run(
      entry.userId, row.open_id, row.access_token, row.refresh_token, row.expires_at, row.refresh_expires_at, row.scope
    );
    res.redirect('/home.html?tiktok=ok');
  } catch (err) {
    console.error('TikTok-Verknüpfung fehlgeschlagen:', err.message);
    res.redirect('/home.html?tiktok=fehler');
  }
});

app.post('/api/tiktok/disconnect', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  db.prepare('DELETE FROM tiktok_accounts WHERE user_id = ?').run(user.id);
  res.json({ ok: true });
});

app.get('/api/tiktok/videos', async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Nicht angemeldet.' });
  const row = db.prepare('SELECT * FROM tiktok_accounts WHERE user_id = ?').get(user.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Kein TikTok-Konto verknüpft.' });
  try {
    let accessToken = row.access_token;
    if (row.expires_at - Date.now() < 60 * 1000) {
      if (row.refresh_expires_at < Date.now()) {
        return res.status(401).json({ ok: false, error: 'Die TikTok-Verknüpfung ist abgelaufen. Bitte neu verknüpfen.' });
      }
      const fresh = tiktok.tokenRow(await tiktok.refreshAccess(row.refresh_token));
      db.prepare('UPDATE tiktok_accounts SET access_token = ?, refresh_token = ?, expires_at = ?, refresh_expires_at = ? WHERE user_id = ?').run(
        fresh.access_token, fresh.refresh_token, fresh.expires_at, fresh.refresh_expires_at, user.id
      );
      accessToken = fresh.access_token;
    }
    res.json({ ok: true, videos: await tiktok.listVideos(accessToken) });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ---------- Fehler ----------

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Nicht gefunden.' });
});

app.use((err, req, res, next) => {
  // Fehler in der Anfrage (z. B. ungültiges JSON) sind 400, alles andere 500.
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ ok: false, error: 'Ungültige Anfrage.' });
  }
  console.error(err);
  res.status(500).json({ ok: false, error: 'Interner Fehler. Bitte später erneut versuchen.' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Vega League läuft auf http://localhost:${PORT}`);
  });
}

module.exports = app;
