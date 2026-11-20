// What a formula says of itself, read without the engine: its pieces,
// for the colours of the formula editor, and the call the cursor is
// in, for the help under it.
//
// Nothing here judges a formula. Whether one is right is the server's
// to say; this reads the text as it stands, right or wrong, so that a
// person sees what they are writing while they write it.

/** The words of the language that are no names (the engine's chapter "The formula language"). */
export const WORDS = ['TRUE', 'FALSE', 'BLANK', 'AND', 'OR', 'NOT', 'IF', 'THEN', 'ELSE'];

/**
 * A piece of a formula: where it is, and what it is.
 *
 * - text: a text in double quotes, a quote inside it written twice
 * - number: 12, 1.5, .5, 1e3
 * - word: a word of the language, such as TRUE or AND
 * - function: a name with a bracket after it
 * - name: any other name, with the fields read from it by a dot
 * - sign: an operator
 * - open, close, comma: a bracket and what parts the arguments
 * - other: anything else
 *
 * @typedef {{ from: number, to: number, kind: 'text' | 'number' | 'word' | 'function' | 'name' | 'sign' | 'open' | 'close' | 'comma' | 'other' }} Piece
 */

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const NAME = /^[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*/u;
const SIGN = /^(?:<>|<=|>=|[=<>+\-*/^&%])/;

/**
 * The pieces of a formula, in their order. Spaces are no piece.
 *
 * @param {string} formula
 * @returns {Piece[]}
 */
export function pieces(formula) {
  /** @type {Piece[]} */
  const all = [];
  let at = 0;
  while (at < formula.length) {
    const rest = formula.slice(at);
    const space = /^\s+/.exec(rest);
    if (space) {
      at += space[0].length;
      continue;
    }
    if (rest[0] === '"') {
      // To the closing quote; two quotes in a row are one inside the text.
      let to = 1;
      while (to < rest.length) {
        if (rest[to] === '"') {
          if (rest[to + 1] === '"') to += 2;
          else break;
        } else to++;
      }
      to = Math.min(to + 1, rest.length);
      all.push({ from: at, to: at + to, kind: 'text' });
      at += to;
      continue;
    }
    const number = NUMBER.exec(rest);
    if (number) {
      all.push({ from: at, to: at + number[0].length, kind: 'number' });
      at += number[0].length;
      continue;
    }
    const name = NAME.exec(rest);
    if (name) {
      const after = /^\s*\(/.test(rest.slice(name[0].length));
      const kind = after ? 'function' : WORDS.includes(name[0].toUpperCase()) ? 'word' : 'name';
      all.push({ from: at, to: at + name[0].length, kind });
      at += name[0].length;
      continue;
    }
    const sign = SIGN.exec(rest);
    if (sign) {
      all.push({ from: at, to: at + sign[0].length, kind: 'sign' });
      at += sign[0].length;
      continue;
    }
    const one = rest[0];
    all.push({ from: at, to: at + 1, kind: one === '(' ? 'open' : one === ')' ? 'close' : one === ',' ? 'comma' : 'other' });
    at += 1;
  }
  return all;
}

/**
 * The call the cursor is in: the innermost function whose bracket is
 * open at that place, and which of its arguments the cursor is in,
 * counted from 0. Null where the cursor is in no call.
 *
 * @param {string} formula
 * @param {number} at where the cursor is
 * @returns {{ name: string, argument: number } | null}
 */
export function callAt(formula, at) {
  /** @type {{ name: string, argument: number }[]} */
  const open = [];
  let last = '';
  for (const piece of pieces(formula)) {
    // A piece counts once the cursor is past its beginning; a text the
    // cursor is inside hides whatever looks like a bracket in it.
    if (piece.from >= at) break;
    if (piece.kind === 'open') open.push({ name: last, argument: 0 });
    else if (piece.kind === 'close') open.pop();
    else if (piece.kind === 'comma' && open.length > 0) open[open.length - 1].argument++;
    last = piece.kind === 'function' ? formula.slice(piece.from, piece.to) : '';
  }
  for (let depth = open.length - 1; depth >= 0; depth--) {
    if (open[depth].name) return open[depth];
  }
  return null;
}

/**
 * Where a place the engine counts in bytes is, counted in characters
 * as a browser counts them. The engine says where a finding is inside
 * a formula in bytes of UTF-8; a letter such as ń is two of them.
 *
 * @param {string} formula
 * @param {number} bytes
 */
export function fromBytes(formula, bytes) {
  const encoder = new TextEncoder();
  let seen = 0;
  let at = 0;
  for (const letter of formula) {
    if (seen >= bytes) break;
    seen += encoder.encode(letter).length;
    at += letter.length;
  }
  return at;
}

/**
 * The piece of a formula that begins at a place, or, where none does,
 * the one character there: what a finding at that place is about.
 *
 * @param {string} formula
 * @param {number} at
 * @returns {{ from: number, to: number }}
 */
export function pieceAt(formula, at) {
  if (formula.length === 0) return { from: 0, to: 0 };
  const found = pieces(formula).find((piece) => piece.from <= at && at < piece.to);
  if (found) return { from: found.from, to: found.to };
  // At the end of the formula, or in a space: the character before, so
  // that there is something to mark.
  const from = Math.min(Math.max(at, 0), formula.length - 1);
  return { from, to: from + 1 };
}

/**
 * The help for a call: the function as the engine tells it, its
 * arguments one by one, and which of them the cursor is in. A function
 * whose last argument may be given many times keeps the cursor on that
 * one. Null where the engine's list has no function of that name.
 *
 * @param {{ name: string, argument: number }} call
 * @param {{ name: string, aliases?: string[], params: { name: string, type: string, optional?: boolean, repeat?: boolean }[], returns: string, description: string }[]} functions
 * @returns {{ name: string, params: { words: string, current: boolean }[], returns: string, description: string } | null}
 */
export function helpFor(call, functions) {
  const asked = call.name.toUpperCase();
  const fn = functions.find((one) => one.name === asked || (one.aliases ?? []).includes(asked));
  if (!fn) return null;
  const last = fn.params.length - 1;
  const current = last >= 0 && fn.params[last].repeat ? Math.min(call.argument, last) : call.argument;
  return {
    name: fn.name,
    params: fn.params.map((param, n) => ({ words: `${param.name}${param.repeat ? ', ...' : ''}${param.optional ? ' (may be left out)' : ''}`, current: n === current })),
    returns: fn.returns,
    description: fn.description,
  };
}
