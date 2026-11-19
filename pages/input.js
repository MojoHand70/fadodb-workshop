// What a person types into a field, read into a value as the wire
// carries it.
//
// A person types a number in their own language: "4 200,50" in Polish,
// "4,200.50" in English. The server takes "4200.50". Reading it is
// strict on purpose: a sign that could be a decimal point or a
// separator of thousands is taken only where it can be one thing. What
// cannot be read is answered null, and the field says so, rather than
// guessed at.

/**
 * The signs of a language: what separates thousands, and what stands
 * before the decimals.
 *
 * @param {string} locale
 */
function signsOf(locale) {
  const parts = new Intl.NumberFormat(locale, { useGrouping: 'always' }).formatToParts(-1234567.5);
  /** @param {string} type @param {string} otherwise */
  const of = (type, otherwise) => parts.find((p) => p.type === type)?.value ?? otherwise;
  return { group: of('group', ','), point: of('decimal', '.'), minus: of('minusSign', '-') };
}

/** Every kind of space a person or a language may put between digits. */
const SPACES = /[\s\u00a0\u202f\u2009]/g;

/**
 * Reads a number as a person types it in their language.
 *
 * @param {string} typed
 * @param {string} locale the person's language, a tag of BCP 47
 * @returns {string | null} the number as the wire carries it, "4200.50";
 *   '' when nothing was typed; null when it is not a number
 */
export function readNumber(typed, locale) {
  const signs = signsOf(locale);
  let text = String(typed ?? '').trim();
  if (text === '') return '';
  let negative = false;
  // One minus, as a keyboard, a typographer or the language writes it.
  for (const minus of ['-', String.fromCharCode(0x2212), signs.minus]) {
    if (text.startsWith(minus)) {
      negative = true;
      text = text.slice(minus.length).trim();
      break;
    }
  }
  const groupIsSpace = signs.group.replace(SPACES, '') === '';
  // Spaces between digits never mean anything else.
  text = text.replace(SPACES, '');

  let whole = text;
  let part = '';
  const at = text.lastIndexOf(signs.point);
  if (at >= 0) {
    whole = text.slice(0, at);
    part = text.slice(at + 1);
  } else if (signs.point !== '.' && (groupIsSpace || signs.group !== '.') && text.includes('.')) {
    // A point is taken for the decimals where the language does not
    // use it between thousands: "4200.50" typed in Polish.
    const dot = text.lastIndexOf('.');
    whole = text.slice(0, dot);
    part = text.slice(dot + 1);
  }

  if (!groupIsSpace && whole.includes(signs.group)) {
    // A separator of thousands is taken only where it stands as one:
    // "4,200" in English, never "4200,50".
    const groups = whole.split(signs.group);
    if (groups[0].length === 0 || groups[0].length > 3 || groups.slice(1).some((g) => g.length !== 3)) return null;
    whole = groups.join('');
  }
  if (!/^\d+$/.test(whole === '' && part !== '' ? '0' : whole) || !/^\d*$/.test(part)) return null;
  if (whole === '') whole = '0';
  whole = whole.replace(/^0+(?=\d)/, '');
  const zero = /^0*$/.test(whole) && /^0*$/.test(part);
  return (negative && !zero ? '-' : '') + whole + (part !== '' ? `.${part}` : '');
}

/**
 * Moves the decimal point of an exact number: by -2, "8" becomes "0.08",
 * which is how a percentage a person types is kept.
 *
 * @param {string} written an exact number as the wire carries it
 * @param {number} places to the right when positive, to the left when negative
 */
export function shift(written, places) {
  const found = /^(-?)(\d+)(?:\.(\d+))?$/.exec(written);
  if (!found) return written;
  let whole = found[2];
  let part = found[3] ?? '';
  if (places > 0) {
    part = part.padEnd(places, '0');
    whole += part.slice(0, places);
    part = part.slice(places);
  } else if (places < 0) {
    whole = whole.padStart(-places + 1, '0');
    part = whole.slice(places) + part;
    whole = whole.slice(0, places);
  }
  whole = whole.replace(/^0+(?=\d)/, '');
  part = part.replace(/0+$/, '');
  const zero = /^0*$/.test(whole) && part === '';
  return (found[1] && !zero ? '-' : '') + whole + (part !== '' ? `.${part}` : '');
}

/**
 * An exact number as a person edits it: its digits, with the decimal
 * sign of their language and nothing between thousands.
 *
 * @param {unknown} written the number as the wire carries it, or a plain number
 * @param {string} locale
 */
export function editable(written, locale) {
  if (written === null || written === undefined || written === '') return '';
  const text = typeof written === 'number'
    ? written.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 })
    : String(written);
  const signs = signsOf(locale);
  return text.replace('-', signs.minus).replace('.', signs.point);
}
