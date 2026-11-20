// Finding a thing by what a person types of its name.
//
// A person types as they remember: without capitals, without the marks
// over letters, a word or two in any order. So both what is typed and
// what is searched are brought to the same plain letters first.

/** Letters that are one sign with no mark to take off, and the plain letters they are typed as. */
const PLAIN = new Map([
  ['\u0142', 'l'], // l with a stroke
  ['\u00f8', 'o'], // o with a stroke
  ['\u0111', 'd'], // d with a stroke
  ['\u00df', 'ss'], // sharp s
  ['\u00e6', 'ae'],
  ['\u0153', 'oe'],
]);

/**
 * The plain letters of a text: small, with no marks over them.
 *
 * @param {string} text
 */
export function plain(text) {
  const small = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  let out = '';
  for (const sign of small) out += PLAIN.get(sign) ?? sign;
  return out;
}

/**
 * Whether a thing is one the person looks for: every word they typed is
 * somewhere in what the thing says of itself. Nothing typed finds all.
 *
 * @param {string[]} says what the thing says of itself: its name, its label, what it is for
 * @param {string} typed
 */
export function found(says, typed) {
  const words = plain(typed).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const all = plain(says.join('\n'));
  return words.every((word) => all.includes(word));
}
