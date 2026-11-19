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

module.exports = { SKILLS, levelFromXp, skillView, xpToReach };
