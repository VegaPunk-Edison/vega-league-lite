'use strict';

// Die sieben Vereinsmanager-Fähigkeiten. Jede startet bei 0 XP (Skillpoints).
const SKILLS = [
  { key: 'taktik', name: 'Taktisches Verständnis und Spielanalyse', short: 'Taktik' },
  { key: 'kommunikation', name: 'Kommunikation & Live-Coaching', short: 'Kommunikation' },
  { key: 'leadership', name: 'Leadership', short: 'Leadership' },
  { key: 'teammanagement', name: 'Teammanagement', short: 'Team' },
  { key: 'networking', name: 'Networking', short: 'Networking' },
  { key: 'charisma', name: 'Charisma', short: 'Charisma' },
  { key: 'finances', name: 'Finances', short: 'Finances' },
];

// Level-Kurve: Jedes Level braucht 10 % mehr XP als das vorige, ohne Obergrenze.
// Gesamt-XP, um Level n zu erreichen: 1000 × (1,1^n − 1). Level 1 = 100 XP, Level 2 = 210 XP.
const BASE = 1000;
const GROWTH = 1.1;

function xpToReach(level) {
  return Math.round(BASE * (Math.pow(GROWTH, level) - 1));
}

function levelFromXp(xp) {
  let level = 0;
  while (xpToReach(level + 1) <= xp) level += 1;
  return level;
}

// Eine Fähigkeit mit XP, Level und Fortschritt im aktuellen Level.
function skillView(skill, xp) {
  const level = levelFromXp(xp);
  const from = xpToReach(level);
  const to = xpToReach(level + 1);
  return {
    key: skill.key,
    name: skill.name,
    short: skill.short,
    xp,
    level,
    xpIntoLevel: xp - from,
    xpForNext: to - from,
    progress: Math.floor(((xp - from) / (to - from)) * 100),
  };
}

// Rollen nach Gesamt-Level (Summe der Level aller Fähigkeiten).
// Die Grenzen sind ein Vorschlag und lassen sich hier ändern.
const ROLES = [
  { name: 'Rookie', min: 0 },
  { name: 'Semi Pro', min: 10 },
  { name: 'Pro', min: 20 },
  { name: 'Elite', min: 35 },
  { name: 'Legend', min: 50 },
  { name: 'GOAT', min: 75 },
];

// Rolle, Gesamt-Level und nächste Rolle aus einer Liste von Fähigkeiten.
function roleFor(skills) {
  const total = skills.reduce((sum, s) => sum + s.level, 0);
  let index = 0;
  ROLES.forEach((r, i) => {
    if (total >= r.min) index = i;
  });
  const next = ROLES[index + 1] || null;
  return {
    name: ROLES[index].name,
    totalLevel: total,
    nextName: next ? next.name : null,
    nextAt: next ? next.min : null,
  };
}

module.exports = { SKILLS, ROLES, levelFromXp, skillView, xpToReach, roleFor };
