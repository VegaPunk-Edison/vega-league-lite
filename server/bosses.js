'use strict';

// Pfade: Admiral (dunkel violettblau) und Kaiser (dunkel weinrot).
const PATHS = {
  admiral: { name: 'Admiral', color: '#2b2a6b' },
  kaiser: { name: 'Kaiser', color: '#6b1a2a' },
};

// Ozean-Schlüssel wie in server/quiz.js (rotlicht = Reeperbus).
const DIFFICULTY = ['schwer', 'mittel', 'leicht']; // Miniboss 1 ist am schwersten, 3 am leichtesten

// Je Ozean und Pfad stehen drei Hauptboss-Auswahlen zur Wahl.
// Namen sind vorerst Platzhalter und werden später eingetragen.
function bossesFor(district, path) {
  if (!PATHS[path]) return [];
  return [1, 2, 3].map((n) => ({
    id: `${district}-${path}-${n}`,
    name: `Hauptboss ${n} (${PATHS[path].name})`,
    minibosses: [1, 2, 3].map((k) => ({
      index: k,
      name: `Miniboss ${k} von Hauptboss ${n}`,
      difficulty: DIFFICULTY[k - 1],
    })),
  }));
}

// Zerlegt eine Boss-ID wie "elysia-admiral-2" in Ozean, Pfad und Nummer.
function parseBossId(bossId) {
  const m = String(bossId ?? '').match(/^(elysia|rotlicht|alexandria|rubikon)-(admiral|kaiser)-([123])$/);
  if (!m) return null;
  return { district: m[1], path: m[2], n: Number(m[3]) };
}

module.exports = { PATHS, DIFFICULTY, bossesFor, parseBossId };
