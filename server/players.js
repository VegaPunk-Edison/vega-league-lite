'use strict';

// Maximale Kadergröße eines Vereins.
const MAX_PLAYERS = 24;

// Die Metriken eines Spielers, in zwei Ansichten. Start bei 0 XP.
const PLAYER_METRICS = {
  technics: {
    name: 'Technics',
    metrics: [
      { key: 'SHO', name: 'Schuss' },
      { key: 'PAS', name: 'Passspiel' },
      { key: 'DRI', name: 'Dribbling' },
      { key: 'PAC', name: 'Tempo' },
      { key: 'DEF', name: 'Verteidigung' },
      { key: 'PHY', name: 'Physis' },
    ],
  },
  athletics: {
    name: 'PIFA E-Sport Athletics',
    metrics: [
      { key: 'GAMESENSE', name: 'Game-Sense' },
      { key: 'SPIELWISSEN', name: 'Spiel-Wissen' },
      { key: 'MINDSET', name: 'Mindset' },
      { key: 'CHARISMA', name: 'Charisma' },
    ],
  },
};

const ALL_METRIC_KEYS = Object.values(PLAYER_METRICS).flatMap((g) => g.metrics.map((m) => m.key));

// Klassische Fußballpositionen (Kurzzeichen und Langname).
const POSITIONS = {
  TW: 'Torwart',
  IV: 'Innenverteidiger',
  LV: 'Linksverteidiger',
  RV: 'Rechtsverteidiger',
  DM: 'Defensives Mittelfeld',
  ZM: 'Zentrales Mittelfeld',
  OM: 'Offensives Mittelfeld',
  LM: 'Linkes Mittelfeld',
  RM: 'Rechtes Mittelfeld',
  LA: 'Linker Angreifer',
  RA: 'Rechter Angreifer',
  ST: 'Mittelstürmer',
};

function clean(value, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Prüft die Eingaben für einen neuen Spieler. Gibt { ok, error, value }.
function validatePlayer(body) {
  const fullName = clean(body.fullName, 80);
  if (fullName.length < 3) return { ok: false, error: 'Bitte den vollständigen Namen eingeben.' };

  const vegaId = clean(body.vegaId, 40);
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(vegaId)) {
    return { ok: false, error: 'Die Vega ID braucht 3 bis 40 Zeichen: Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.' };
  }

  const year = Number(body.birthYear);
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1950 || year > thisYear) {
    return { ok: false, error: `Bitte ein gültiges Geburtsjahr eingeben (1950 bis ${thisYear}).` };
  }

  const country = clean(body.country, 60);
  if (country.length < 2) return { ok: false, error: 'Bitte das Land eingeben.' };

  // Optional
  const email = clean(body.email, 254).toLowerCase();
  if (email && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
    return { ok: false, error: 'Die E-Mail-Adresse ist ungültig.' };
  }
  const phone = clean(body.phone, 24);
  if (phone && !/^\+?\d{6,15}$/.test(phone.replace(/[\s\-/()]/g, ''))) {
    return { ok: false, error: 'Die Telefonnummer ist ungültig.' };
  }

  const positions = [body.posMain, body.posSide1, body.posSide2].map((p) => clean(p, 3).toUpperCase());
  for (const p of positions) {
    if (p && !POSITIONS[p]) return { ok: false, error: 'Unbekannte Position.' };
  }
  const [posMain, posSide1, posSide2] = positions.map((p) => p || null);

  return {
    ok: true,
    value: { fullName, vegaId, birthYear: year, country, email: email || null, phone: phone || null, posMain, posSide1, posSide2 },
  };
}

// Stats aus der ProClubs-App (eSports Athlete Center): sechs Oberkategorien mit Unterattributen
// und vier Sonstige. Jeder Stat hat eigene XP (Schlüssel st_<key>) und zählt nicht in die
// Level-Summen der Vereinstabelle.
const STAT_CATEGORIES = [
  { key: 'sho', name: 'Abschluss', subs: [['abschluss', 'Abschluss'], ['schusskraft', 'Schusskraft'], ['stellungsspiel', 'Stellungsspiel'], ['weitschuesse', 'Weitschüsse'], ['volley', 'Volley'], ['elfmeter', 'Elfmeter']] },
  { key: 'pas', name: 'Passspiel', subs: [['kurzer_pass', 'Kurzer Pass'], ['langer_pass', 'Langer Pass'], ['uebersicht', 'Übersicht'], ['flanken', 'Flanken'], ['fs_praezision', 'FS-Präzision'], ['effet', 'Effet']] },
  { key: 'dri', name: 'Ballkontrolle', subs: [['ballkontrolle', 'Ballkontrolle'], ['dribbling', 'Dribbling'], ['beweglichkeit', 'Beweglichkeit'], ['balance', 'Balance'], ['ruhe', 'Ruhe'], ['reaktion', 'Reaktion']] },
  { key: 'phy', name: 'Physis', subs: [['ausdauer', 'Ausdauer'], ['staerke', 'Stärke'], ['sprungkraft', 'Sprungkraft'], ['aggressivitaet', 'Aggressivität']] },
  { key: 'def', name: 'Verteidigung', subs: [['abfangen', 'Abfangen'], ['defensives_bewusstsein', 'Defensives Bewusstsein'], ['faire_zweikaempfe', 'Faire Zweikämpfe'], ['graetschen', 'Grätschen'], ['kopfball_praezision', 'Kopfball-Präzision']] },
  { key: 'pac', name: 'Tempo', subs: [['beschleunigung', 'Beschleunigung'], ['sprinttempo', 'Sprinttempo']] },
];
const STAT_SONSTIGE = [['spezialbewegung', 'Spezialbewegung'], ['schwacher_fuss', 'Schwacher Fuß'], ['controller_handling', 'Controller Handling'], ['merkfaehigkeit', 'Merkfähigkeit']];

const STAT_METRIC_KEYS = [
  ...STAT_CATEGORIES.flatMap((c) => c.subs.map(([key]) => `st_${key}`)),
  ...STAT_SONSTIGE.map(([key]) => `st_${key}`),
];

module.exports = {
  MAX_PLAYERS, PLAYER_METRICS, ALL_METRIC_KEYS, POSITIONS, validatePlayer,
  STAT_CATEGORIES, STAT_SONSTIGE, STAT_METRIC_KEYS,
};
