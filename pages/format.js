// How a value is shown to a person.
//
// A class may give a number, a money, a day or a moment a format, in
// the pattern language of Excel's number formats: "#,##0.00", "0%",
// "d mmm yyyy", "yyyy-mm-dd hh:mm". The engine checks a pattern when
// the class is defined and never applies one: the page does, and the
// person's language gives the separators and the names of the months
// (the engine's ADR-0068, item 5). This file applies them.
//
// What it reads is what the engine takes: for numbers 0, #, the two
// separators, %, text in quotes, the characters Excel shows as they
// are, and up to three sections split by ";"; for days and moments d,
// m, y, h, s, AM/PM, text in quotes and the same characters.
//
// A number that is exact on the wire, a decimal, a whole number or a
// money, comes as text and is rounded here as text, half away from
// zero, so that no digit is lost on the way through the browser's
// numbers.
//
// Two things differ from Excel on purpose: a number that rounds to zero
// is shown without a minus, and a decimal point with no digit after it
// is left out.

/** The characters Excel shows as they are, without quotes. */
const LITERALS = " $-+/():!^&'~{}<>=";

/**
 * The kind of a value, from the type a class declares or the bundle
 * names for a calculated variable: "money(2)" is money.
 *
 * @param {string | undefined | null} type
 * @returns {string}
 */
export function kindOf(type) {
  return String(type ?? '').split('(')[0].trim();
}

/**
 * The separators and signs of a language.
 *
 * @param {string} locale
 */
function signsOf(locale) {
  const parts = new Intl.NumberFormat(locale, { useGrouping: 'always' }).formatToParts(-1234567.5);
  /** @param {string} type @param {string} otherwise */
  const of = (type, otherwise) => parts.find((p) => p.type === type)?.value ?? otherwise;
  return { group: of('group', ','), point: of('decimal', '.'), minus: of('minusSign', '-') };
}

/**
 * A number as exact text: its sign, the digits before the point and the
 * digits after it. Null when the value is not a number.
 *
 * @param {unknown} value a number, or a number written as text
 */
function exact(value) {
  const text = typeof value === 'number'
    ? value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 })
    : String(value ?? '').trim();
  const found = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!found) return null;
  return { negative: found[1] === '-', whole: found[2].replace(/^0+(?=\d)/, ''), part: found[3] ?? '' };
}

/**
 * Adds one to a number written as digits.
 *
 * @param {string} digits
 */
function addOne(digits) {
  const out = digits.split('');
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] !== '9') {
      out[i] = String(Number(out[i]) + 1);
      return out.join('');
    }
    out[i] = '0';
  }
  return '1' + out.join('');
}

/**
 * Rounds to so many digits after the point, a half away from zero.
 *
 * @param {string} whole
 * @param {string} part
 * @param {number} places
 */
function round(whole, part, places) {
  if (part.length <= places) return { whole, part: part.padEnd(places, '0') };
  const up = part[places] >= '5';
  let digits = whole + part.slice(0, places);
  if (up) digits = addOne(digits);
  const cut = digits.length - places;
  return { whole: digits.slice(0, cut) || '0', part: digits.slice(cut) };
}

/**
 * Reads one section of a number's pattern.
 *
 * @param {string} section
 */
function readNumberSection(section) {
  /** @type {{ kind: 'text' | 'whole' | 'point' | 'part', text: string }[]} */
  const pieces = [];
  let zeros = 0;
  let grouped = false;
  let percent = false;
  let seenPoint = false;
  let partPlaces = 0;
  let partNeeded = 0;
  let wholePlaces = 0;
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      pieces.push({ kind: 'text', text: section.slice(i + 1, end < 0 ? section.length : end) });
      i = end < 0 ? section.length : end;
    } else if (ch === '0' || ch === '#') {
      if (seenPoint) {
        partPlaces++;
        if (ch === '0') partNeeded = partPlaces;
        if (pieces.at(-1)?.kind !== 'part') pieces.push({ kind: 'part', text: '' });
      } else {
        wholePlaces++;
        if (ch === '0') zeros++;
        if (!pieces.some((p) => p.kind === 'whole')) pieces.push({ kind: 'whole', text: '' });
      }
    } else if (ch === ',') {
      grouped = true;
    } else if (ch === '.') {
      seenPoint = true;
      pieces.push({ kind: 'point', text: '' });
    } else if (ch === '%') {
      percent = true;
      pieces.push({ kind: 'text', text: '%' });
    } else {
      pieces.push({ kind: 'text', text: ch });
    }
  }
  return { pieces, zeros, grouped, percent, partPlaces, partNeeded, wholePlaces };
}

/**
 * Shows a number by a pattern.
 *
 * @param {unknown} value a number, or a number written as text: "5166.00"
 * @param {string} pattern such as "#,##0.00" or "0%"
 * @param {string} locale the person's language, a tag of BCP 47
 * @returns {string} the value as it came when it is not a number
 */
export function showNumber(value, pattern, locale) {
  const number = exact(value);
  if (!number) return String(value ?? '');
  const sections = splitSections(pattern);
  const isZero = /^0*$/.test(number.whole) && /^0*$/.test(number.part);
  let section = sections[0];
  let sign = number.negative;
  if (isZero && sections.length > 2) section = sections[2];
  else if (number.negative && sections.length > 1) {
    section = sections[1];
    sign = false;
  }

  const read = readNumberSection(section);
  let { whole, part } = number;
  if (read.percent) {
    const moved = part.padEnd(2, '0');
    whole = (whole + moved.slice(0, 2)).replace(/^0+(?=\d)/, '');
    part = moved.slice(2);
  }
  ({ whole, part } = round(whole, part, read.partPlaces));
  whole = whole.replace(/^0+(?=\d)/, '');
  while (part.length > read.partNeeded && part.endsWith('0')) part = part.slice(0, -1);

  const signs = signsOf(locale);
  let digits = whole === '0' ? '' : whole;
  digits = digits.padStart(read.zeros, '0');
  if (read.grouped) digits = digits.replace(/\B(?=(\d{3})+(?!\d))/g, signs.group);
  const nothingLeft = /^0*$/.test(whole) && /^0*$/.test(part);

  let out = '';
  let wholeShown = false;
  for (const piece of read.pieces) {
    if (piece.kind === 'text') out += piece.text;
    else if (piece.kind === 'whole') {
      out += digits;
      wholeShown = true;
    } else if (piece.kind === 'point') {
      if (!wholeShown) out += digits;
      wholeShown = true;
      if (part !== '') out += signs.point;
    } else out += part;
  }
  return (sign && !nothingLeft ? signs.minus : '') + out;
}

/**
 * Splits a pattern at the ";" that stand outside quotes.
 *
 * @param {string} pattern
 */
function splitSections(pattern) {
  const sections = [''];
  let quoted = false;
  for (const ch of pattern) {
    if (ch === '"') quoted = !quoted;
    if (ch === ';' && !quoted) sections.push('');
    else sections[sections.length - 1] += ch;
  }
  return sections;
}

/**
 * The parts of a day or a moment, as numbers.
 *
 * A day, "2026-12-05", is a day of the calendar and the same everywhere.
 * A moment, seconds since 1970, is shown at the person's own place, or
 * at the place named.
 *
 * @param {unknown} value
 * @param {string | undefined} place a time zone, such as "Europe/Warsaw"
 */
function whenOf(value, place) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (day) {
    return { year: +day[1], month: +day[2], day: +day[3], hour: 0, minute: 0, second: 0 };
  }
  const at = typeof value === 'number' ? new Date(value * 1000) : new Date(String(value ?? '').replace(' ', 'T') + 'Z');
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hourCycle: 'h23', timeZone: place,
  }).formatToParts(at);
  /** @param {string} type */
  const of = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: of('year'), month: of('month'), day: of('day'), hour: of('hour'), minute: of('minute'), second: of('second') };
}

/**
 * Shows a day or a moment by a pattern.
 *
 * @param {unknown} value a day as "2026-12-05", or a moment as seconds since 1970
 * @param {string} pattern such as "d mmm yyyy" or "yyyy-mm-dd hh:mm"
 * @param {string} locale the person's language
 * @param {string} [place] the time zone a moment is shown at; the person's own when left out
 * @returns {string} the value as it came when it is not a day or a moment
 */
export function showDate(value, pattern, locale, place) {
  const when = whenOf(value, place);
  if (!when) return String(value ?? '');
  const noon = new Date(Date.UTC(when.year, when.month - 1, when.day, 12));
  /** @param {Intl.DateTimeFormatOptions} options @param {string} type */
  const name = (options, type) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).formatToParts(noon).find((p) => p.type === type)?.value ?? '';
  /** @param {number} n */
  const two = (n) => String(n).padStart(2, '0');
  const halves = /am\/pm/i.test(pattern);
  const withDay = /d/i.test(pattern.replace(/"[^"]*"/g, ''));

  let out = '';
  let afterHour = false;
  for (let i = 0; i < pattern.length; ) {
    const ch = pattern[i];
    if (ch === '"') {
      const end = pattern.indexOf('"', i + 1);
      out += pattern.slice(i + 1, end < 0 ? pattern.length : end);
      i = end < 0 ? pattern.length : end + 1;
      continue;
    }
    if (pattern.slice(i, i + 5).toUpperCase() === 'AM/PM') {
      out += when.hour < 12 ? 'AM' : 'PM';
      i += 5;
      continue;
    }
    const letter = ch.toLowerCase();
    if (!'dmyhs'.includes(letter)) {
      out += ch;
      i++;
      continue;
    }
    let n = 1;
    while (i + n < pattern.length && pattern[i + n].toLowerCase() === letter) n++;
    if (letter === 'd') {
      afterHour = false;
      if (n === 1) out += when.day;
      else if (n === 2) out += two(when.day);
      else out += name({ weekday: n === 3 ? 'short' : 'long' }, 'weekday');
    } else if (letter === 'm' && afterHour) {
      out += n === 1 ? when.minute : two(when.minute);
    } else if (letter === 'm') {
      if (n === 1) out += when.month;
      else if (n === 2) out += two(when.month);
      else if (n === 3) out += name({ month: 'short' }, 'month');
      // Beside a day, a language may bend the month's name: 5 grudnia.
      else out += name(withDay ? { day: 'numeric', month: 'long' } : { month: 'long' }, 'month');
    } else if (letter === 'y') {
      afterHour = false;
      out += n === 2 ? two(when.year % 100) : String(when.year).padStart(4, '0');
    } else if (letter === 'h') {
      afterHour = true;
      const hour = halves ? when.hour % 12 || 12 : when.hour;
      out += n === 1 ? hour : two(hour);
    } else {
      out += two(when.second);
    }
    i += n;
  }
  return out;
}

/**
 * Shows any value of a document to a person.
 *
 * @param {unknown} value the value as the server sent it
 * @param {{ type?: string | null, format?: string | null }} how
 *   the type of the variable, declared or calculated, and its format
 * @param {{ locale: string, yes?: string, no?: string, place?: string }} person
 *   the person's language, their words for a yes and a no, and the time
 *   zone a moment is shown at
 * @returns {string}
 */
export function show(value, how, person) {
  if (value === null || value === undefined || value === '') return '';
  const kind = kindOf(how.type);
  const pattern = how.format ?? '';
  const { locale } = person;

  if (kind === 'bool' || typeof value === 'boolean') return value ? (person.yes ?? 'Yes') : (person.no ?? 'No');

  if (kind === 'money') {
    const found = /^(\S+)\s+(\S+)$/.exec(String(value));
    if (!found) return String(value);
    const amount = pattern ? showNumber(found[1], pattern, locale) : plainNumber(found[1], locale);
    return `${amount}\u00a0${found[2]}`;
  }

  if (kind === 'number' || kind === 'int' || kind === 'decimal') {
    return pattern ? showNumber(value, pattern, locale) : plainNumber(value, locale);
  }

  if (kind === 'date') {
    if (pattern) return showDate(value, pattern, locale);
    const when = whenOf(value, undefined);
    if (!when) return String(value);
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(when.year, when.month - 1, when.day, 12)));
  }

  if (kind === 'datetime') {
    if (pattern) return showDate(value, pattern, locale, person.place);
    if (typeof value !== 'number') return String(value);
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: person.place }).format(new Date(value * 1000));
  }

  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * A number with no pattern: every digit it came with, the separators of
 * the person's language.
 *
 * @param {unknown} value
 * @param {string} locale
 */
function plainNumber(value, locale) {
  const number = exact(value);
  if (!number) return String(value ?? '');
  const signs = signsOf(locale);
  const whole = number.whole.replace(/\B(?=(\d{3})+(?!\d))/g, signs.group);
  const zero = /^0*$/.test(number.whole) && /^0*$/.test(number.part);
  return (number.negative && !zero ? signs.minus : '') + whole + (number.part ? signs.point + number.part : '');
}
