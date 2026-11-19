'use strict';

// Spam-Filter für die Registrierung. Die Prüfung ist nur "Show" (jede Eingabe
// wird angenommen), aber unechte Namen, Telefonnummern und E-Mails werden
// abgefangen, damit man Nutzer erreichen und zuordnen kann.

const KEYBOARD_ROWS = ['qwertzuiop', 'qwertyuiop', 'asdfghjkl', 'yxcvbnm', 'azertyuiop', '1234567890'];
const BLOCKED_NAME_WORDS = ['test', 'asdf', 'xxx', 'null', 'undefined', 'admin', 'fake', 'spam', 'dummy', 'nobody', 'keine'];
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com',
  'yopmail.com', 'trashmail.com', 'throwawaymail.com', 'sharklasers.com', 'getnada.com',
  'dispostable.com', 'fakeinbox.com', 'maildrop.cc', 'mailnesia.com', 'wegwerfmail.de',
  'spam4.me', 'tempinbox.com', 'mohmal.com', 'emailondeck.com', 'mintemail.com',
]);

const MIN_YEAR = 1900;

function ok(value) {
  return { ok: true, value };
}

function fail(error) {
  return { ok: false, error };
}

// Erkennt Tastatur-Muster wie "asdf" oder "qwer" (inkl. rückwärts).
function hasKeyboardRun(text) {
  const s = text.toLowerCase();
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i <= row.length - 4; i++) {
      const seg = row.slice(i, i + 4);
      const rev = [...seg].reverse().join('');
      if (s.includes(seg) || s.includes(rev)) return true;
    }
  }
  return false;
}

// Drei oder mehr gleiche Buchstaben hintereinander ("aaa", "xxxx").
function hasLongRepeat(text) {
  return /(.)\1{2,}/iu.test(text);
}

function validateName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 5 || name.length > 80) {
    return fail('Bitte den vollständigen Namen eingeben (Vor- und Nachname).');
  }
  if (!/^\p{L}[\p{L}'\-. ]*$/u.test(name)) {
    return fail('Der Name darf nur Buchstaben, Leerzeichen, Bindestriche und Apostrophe enthalten.');
  }
  const parts = name.split(' ');
  if (parts.length < 2) {
    return fail('Bitte Vor- und Nachnamen eingeben.');
  }
  const seen = new Set();
  for (const part of parts) {
    const letters = part.replace(/[^\p{L}]/gu, '');
    const lower = letters.toLowerCase();
    if (letters.length < 2) {
      return fail('Jeder Namensteil braucht mindestens zwei Buchstaben.');
    }
    if (BLOCKED_NAME_WORDS.includes(lower) || hasLongRepeat(letters) || hasKeyboardRun(letters)) {
      return fail('Dieser Name wirkt nicht echt. Bitte den richtigen Namen eingeben.');
    }
    if (letters.length > 2 && !/[aeiouyäöü]/i.test(letters)) {
      return fail('Dieser Name wirkt nicht echt. Bitte den richtigen Namen eingeben.');
    }
    if (seen.has(lower)) {
      return fail('Vor- und Nachname dürfen nicht gleich sein.');
    }
    seen.add(lower);
  }
  return ok(name);
}

function validateBirthdate(raw) {
  const match = String(raw ?? '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return fail('Bitte das Geburtsdatum im Format TT.MM.JJJJ eingeben.');
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const realDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!realDate) {
    return fail('Dieses Datum gibt es nicht.');
  }
  if (year < MIN_YEAR || date.getTime() > Date.now()) {
    return fail('Bitte ein gültiges Geburtsdatum eingeben.');
  }
  const pad = (n) => String(n).padStart(2, '0');
  return ok(`${pad(day)}.${pad(month)}.${year}`);
}

function validatePhone(raw) {
  const cleaned = String(raw ?? '').replace(/[\s\-/()]/g, '');
  if (!/^\+?\d{6,15}$/.test(cleaned)) {
    return fail('Bitte eine gültige Telefonnummer eingeben (nur Ziffern, optional mit +).');
  }
  const digits = cleaned.replace('+', '');
  if (/^(\d)\1+$/.test(digits)) {
    return fail('Diese Telefonnummer wirkt nicht echt.');
  }
  if (digits.length >= 6 && ('01234567890123456789'.includes(digits) || '98765432109876543210'.includes(digits))) {
    return fail('Diese Telefonnummer wirkt nicht echt.');
  }
  return ok(cleaned);
}

function validateEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
    return fail('Bitte eine gültige E-Mail-Adresse eingeben.');
  }
  const [local, domain] = email.split('@');
  if (local.length < 2 || hasLongRepeat(local) || hasKeyboardRun(local)) {
    return fail('Diese E-Mail-Adresse wirkt nicht echt.');
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return fail('Wegwerf-E-Mail-Adressen sind nicht erlaubt.');
  }
  return ok(email);
}

const VALIDATORS = {
  name: validateName,
  birthdate: validateBirthdate,
  phone: validatePhone,
  email: validateEmail,
};

function validateField(field, value) {
  const validator = VALIDATORS[field];
  if (!validator) {
    return fail('Unbekanntes Feld.');
  }
  return validator(value);
}

module.exports = { validateField, FIELDS: Object.keys(VALIDATORS) };
