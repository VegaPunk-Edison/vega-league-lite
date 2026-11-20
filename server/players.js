'use strict';

// Maximale Kadergröße eines Vereins.
const MAX_PLAYERS = 24;

// Die Metriken eines Spielers, in zwei Ansichten. Start bei 0 XP.
const PLAYER_METRICS = {
  technics: {
    name: 'Technik',
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
      { key: 'SPIELWISSEN', name: 'Spielwissen' },
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

// Stats aus der ProClubs-App (eSports Athlete Center, src/lib/categories.js): sechs
// Oberkategorien mit Unterattributen (Gewicht 1 bis 3) und vier Sonstige. Jeder Stat hat
// eigene XP (Schlüssel st_<key>). Die Oberkategorien SHO, PAS, DRI, PHY, DEF, PAC werden nicht
// selbst gelevelt, sondern aus den Unterattributen berechnet. Stats zählen nicht in die
// Tabellen-Summen direkt ein, die Hauptattribute schon (über ihr berechnetes Level).
const STAT_CATEGORIES = [
  { key: 'sho', name: 'Abschluss', subs: [['abschluss', 'Abschluss', 3], ['schusskraft', 'Schusskraft', 2], ['stellungsspiel', 'Stellungsspiel', 2], ['weitschuesse', 'Weitschüsse', 1], ['volley', 'Volley', 1], ['elfmeter', 'Elfmeter', 1]] },
  { key: 'pas', name: 'Passspiel', subs: [['kurzer_pass', 'Kurzer Pass', 3], ['langer_pass', 'Langer Pass', 2], ['uebersicht', 'Übersicht', 2], ['flanken', 'Flanken', 1], ['fs_praezision', 'FS-Präzision', 1], ['effet', 'Effet', 1]] },
  { key: 'dri', name: 'Ballkontrolle', subs: [['ballkontrolle', 'Ballkontrolle', 3], ['dribbling', 'Dribbling', 3], ['beweglichkeit', 'Beweglichkeit', 2], ['balance', 'Balance', 2], ['ruhe', 'Ruhe', 2], ['reaktion', 'Reaktion', 2]] },
  { key: 'phy', name: 'Physis', subs: [['ausdauer', 'Ausdauer', 2], ['staerke', 'Stärke', 2], ['sprungkraft', 'Sprungkraft', 1], ['aggressivitaet', 'Aggressivität', 1]] },
  { key: 'def', name: 'Verteidigung', subs: [['abfangen', 'Abfangen', 3], ['defensives_bewusstsein', 'Defensives Bewusstsein', 3], ['faire_zweikaempfe', 'Faire Zweikämpfe', 2], ['graetschen', 'Grätschen', 2], ['kopfball_praezision', 'Kopfball-Präzision', 1]] },
  { key: 'pac', name: 'Tempo', subs: [['beschleunigung', 'Beschleunigung', 3], ['sprinttempo', 'Sprinttempo', 3]] },
];
const STAT_SONSTIGE = [['spezialbewegung', 'Spezialbewegung'], ['schwacher_fuss', 'Schwacher Fuß'], ['controller_handling', 'Controller Handling'], ['merkfaehigkeit', 'Merkfähigkeit']];

const STAT_METRIC_KEYS = [
  ...STAT_CATEGORIES.flatMap((c) => c.subs.map(([key]) => `st_${key}`)),
  ...STAT_SONSTIGE.map(([key]) => `st_${key}`),
];

// Hauptattribute (SHO, PAS, DRI, PHY, DEF, PAC): Level aus den Unterattributen.
const DERIVED_MAIN_KEYS = STAT_CATEGORIES.map((c) => c.key.toUpperCase());

// levelOfStat(key) liefert das Level eines Unterattributs (ohne Präfix).
// Ergebnis: gewichteter Durchschnitt der Unterattribut-Level, abgerundet.
function deriveMainLevels(levelOfStat) {
  return Object.fromEntries(
    STAT_CATEGORIES.map((c) => {
      const totalWeight = c.subs.reduce((sum, [, , w]) => sum + w, 0);
      const weighted = c.subs.reduce((sum, [key, , w]) => sum + w * levelOfStat(key), 0);
      return [c.key.toUpperCase(), Math.floor(weighted / totalWeight)];
    })
  );
}

module.exports = {
  MAX_PLAYERS, PLAYER_METRICS, ALL_METRIC_KEYS, POSITIONS, validatePlayer,
  STAT_CATEGORIES, STAT_SONSTIGE, STAT_METRIC_KEYS, DERIVED_MAIN_KEYS, deriveMainLevels,
};
