'use strict';

const crypto = require('crypto');

// Die vier Bezirke von Babylonia.
const DISTRICTS = {
  elysia: {
    name: 'Elysia',
    desc: 'Die Reichen, Ehrgeizigen und Listigen',
  },
  rotlicht: {
    name: 'Reeperbus',
    desc: 'Das herzliche, fleißige Arbeitervolk',
  },
  alexandria: {
    name: 'Alexandria',
    desc: 'Die zurückgezogenen Klugen und Weisen',
  },
  rubikon: {
    name: 'Rubikon',
    desc: 'Die Söldner, Assassinen und mutigen Rebellen',
  },
};

// Jede Antwort gehört zu einem Bezirk.
const ANSWER_DISTRICT = { A: 'elysia', B: 'rotlicht', C: 'alexandria', D: 'rubikon' };

// DISG-Typ je Ozean: D = Dominanz, I = Einfluss, S = Stetigkeit, G = Gewissenhaftigkeit.
const DISG_OF = { elysia: 'I', rotlicht: 'S', alexandria: 'G', rubikon: 'D' };
const DISG_TYPES = ['D', 'I', 'S', 'G'];
const DISG_TEXT = {
  D: { name: 'Dominanz', desc: 'Direkt, entschlossen und ergebnisorientiert. Du gehst Herausforderungen frontal an.' },
  I: { name: 'Einfluss', desc: 'Begeisterungsfähig, gesellig und überzeugend. Du gewinnst Menschen durch Ausstrahlung und dein Netzwerk.' },
  S: { name: 'Stetigkeit', desc: 'Loyal, geduldig und verlässlich. Du hältst dein Team zusammen und stehst zu deinen Leuten.' },
  G: { name: 'Gewissenhaftigkeit', desc: 'Analytisch, genau und planvoll. Du denkst nach, bevor du handelst.' },
};
// Maximale Punktzahl einer Achse (6 Gewichtungspunkte, weil Frage 5 doppelt zählt).
const DISG_MAX = 6;

const QUESTIONS = [
  {
    title: 'Der Preis des Sieges',
    text: 'Ein übermächtiger Gegner steht dir im Weg. Wie sicherst du dir den Triumph?',
    answers: [
      'Ich finde heraus, was er zu verlieren hat, und nutze es als Druckmittel.',
      'Ich verlasse mich auf meine Crew – gemeinsam halten wir stand, egal wie hart es wird.',
      'Ich studiere seine Schwächen und warte geduldig auf den einen perfekten Zug.',
      'Ich gehe frontal in den Kampf – am Ende zählt nur, wer noch steht.',
    ],
  },
  {
    title: 'Loyalität und Verrat',
    text: 'Ein Verbündeter bietet dir ein Geschäft an, das dir großen Vorteil bringt, aber andere in Gefahr bringt. Wie reagierst du?',
    answers: [
      'Ich nehme an und sorge dafür, dass ich am Ende den größten Teil des Kuchens bekomme.',
      'Niemals. Wer seine Leute für den eigenen Vorteil opfert, ist nichts wert.',
      'Ich wäge ab, wem es langfristig mehr nützt – Emotionen haben hier keinen Platz.',
      'Kommt auf die Bezahlung an – und darauf, ob die anderen sich selbst verteidigen können.',
    ],
  },
  {
    title: 'Dein Platz in Babylonia',
    text: 'Was treibt dich an, dich durch die Zeitalter bis an die Spitze zu kämpfen?',
    answers: [
      'Ruhm, Reichtum und der Platz ganz oben, auf den alle aufblicken.',
      'Dass meine Leute respektiert werden und niemand mehr auf uns herabsieht.',
      'Die Wahrheit hinter dieser Welt zu verstehen und allen anderen einen Schritt voraus zu sein.',
      'Die Herausforderung selbst – ich will mich mit den Stärksten messen und die Herrscher stürzen.',
    ],
  },
  {
    title: 'Nach einem harten Sieg',
    text: 'Die Schlacht ist geschlagen. Wo findet man dich am Abend danach?',
    answers: [
      'Auf dem prunkvollsten Bankett, um direkt die nächsten wichtigen Kontakte zu knüpfen.',
      'Unter den roten Laternen in einer vollen Taverne, wo wir zusammen feiern und anstoßen.',
      'Allein in Ruhe, um den Kampf zu analysieren und den nächsten Schritt zu planen.',
      'In der Arena oder beim Training – der nächste Gegner wartet nicht.',
    ],
  },
  {
    title: 'Die Entscheidungsfrage',
    text: 'Wenn ganz Babylonia brennt und du nur eine Sache retten kannst – was wählst du?',
    answers: [
      'Meinen Einfluss und mein Vermögen – damit lässt sich alles neu aufbauen.',
      'Die Menschen an meiner Seite – ohne sie bedeutet ein Sieg gar nichts.',
      'Das gesammelte Wissen – wer die Geschichte kennt, beherrscht die Zukunft.',
      'Meine Waffe und meine Freiheit – solange ich kämpfen kann, ist nichts verloren.',
    ],
  },
];

const LETTERS = ['A', 'B', 'C', 'D'];

// Willkommenstext vor dem Quiz (Wortlaut des Nutzers, #role ist „Vereinsmanager“).
const WELCOME = {
  title: 'Willkommen, Vereinsmanager',
  paragraphs: [
    'Du hast erfolgreich einen Account bei der PIFA angelegt und bist Teil der PIFA Familie.',
    'Wir freuen uns, dass du als Vereinsmanager die offizielle Vega League App nutzen willst. Damit dein Start und unsere Zusammenarbeit bestmöglich gestaltet werden, haben wir 5 Fragen an dich, die uns helfen, dich in den richtigen Ozean einzuteilen.',
    'Es gibt 4 und die heißen na du weißt schon.',
  ],
};

// Fragen für den Client: ohne Bezirkszuordnung, nur Buchstabe und Text.
function publicQuestions() {
  return QUESTIONS.map((q) => ({
    title: q.title,
    text: q.text,
    answers: q.answers.map((text, i) => ({ letter: LETTERS[i], text })),
  }));
}

// Berechnet den Bezirk aus 5 Antworten (A bis D).
// Die Antwort auf Frage 5 zählt doppelt. Bleibt ein Gleichstand, entscheidet der Zufall.
function scoreAnswers(letters) {
  if (!Array.isArray(letters) || letters.length !== QUESTIONS.length) {
    throw new Error('Bitte alle 5 Fragen beantworten.');
  }
  if (!letters.every((l) => ANSWER_DISTRICT[l])) {
    throw new Error('Ungültige Antwort.');
  }

  const counts = Object.fromEntries(Object.keys(DISTRICTS).map((key) => [key, 0]));
  for (const letter of letters) {
    counts[ANSWER_DISTRICT[letter]] += 1;
  }
  counts[ANSWER_DISTRICT[letters[QUESTIONS.length - 1]]] += 1; // Frage 5 doppelt

  const best = Math.max(...Object.values(counts));
  const tied = Object.keys(counts).filter((key) => counts[key] === best);
  return tied[crypto.randomInt(tied.length)];
}

// DISG-Profil aus den gespeicherten Antworten (gleiche Gewichtung wie beim Ozean).
// Gibt null zurück, wenn die Antworten ungültig sind.
function disgProfile(letters) {
  if (!Array.isArray(letters) || letters.length !== QUESTIONS.length) return null;
  if (!letters.every((l) => ANSWER_DISTRICT[l])) return null;

  const scores = Object.fromEntries(DISG_TYPES.map((t) => [t, 0]));
  for (const letter of letters) {
    scores[DISG_OF[ANSWER_DISTRICT[letter]]] += 1;
  }
  const fifth = DISG_OF[ANSWER_DISTRICT[letters[QUESTIONS.length - 1]]];
  scores[fifth] += 1; // Frage 5 doppelt

  // Bei Gleichstand gewinnt der Typ aus Frage 5, sonst die Reihenfolge D, I, S, G.
  const best = Math.max(...Object.values(scores));
  const tied = DISG_TYPES.filter((t) => scores[t] === best);
  const dominant = tied.includes(fifth) ? fifth : tied[0];

  return {
    scores,
    max: DISG_MAX,
    dominant,
    name: DISG_TEXT[dominant].name,
    description: DISG_TEXT[dominant].desc,
  };
}

module.exports = {
  DISTRICTS,
  DISG_TEXT,
  WELCOME,
  disgProfile,
  QUESTIONS,
  LETTERS,
  publicQuestions,
  scoreAnswers,
};
