// How a formula is read for the formula editor: its pieces, the call
// the cursor is in, and where a place the engine counts in bytes is.
// No browser and no server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callAt, fromBytes, helpFor, pieceAt, pieces } from '../pages/formula.js';

/** The pieces of a formula as "kind:text". */
/** @param {string} formula */
const read = (formula) => pieces(formula).map((p) => `${p.kind}:${formula.slice(p.from, p.to)}`);

test('a formula is read piece by piece', () => {
  assert.deepEqual(read('ROUND(net * vat_rate, 2)'), ['function:ROUND', 'open:(', 'name:net', 'sign:*', 'name:vat_rate', 'comma:,', 'number:2', 'close:)']);
  assert.deepEqual(read('total > 5000 AND NOT paid'), ['name:total', 'sign:>', 'number:5000', 'word:AND', 'word:NOT', 'name:paid']);
  assert.deepEqual(read('n <> 10'), ['name:n', 'sign:<>', 'number:10']);
  assert.deepEqual(read('a<=b'), ['name:a', 'sign:<=', 'name:b']);
  assert.deepEqual(read('n * 15%'), ['name:n', 'sign:*', 'number:15', 'sign:%']);
  assert.deepEqual(read('.5 + 1e3 + 1.5'), ['number:.5', 'sign:+', 'number:1e3', 'sign:+', 'number:1.5']);
  assert.deepEqual(read('depot.city & " " & depot.zip'), ['name:depot.city', 'sign:&', 'text:" "', 'sign:&', 'name:depot.zip']);
  assert.deepEqual(read('IF n > 5 THEN "big" ELSE "small"'), ['word:IF', 'name:n', 'sign:>', 'number:5', 'word:THEN', 'text:"big"', 'word:ELSE', 'text:"small"']);
  assert.deepEqual(read('if(true, blank, 1)'), ['function:if', 'open:(', 'word:true', 'comma:,', 'word:blank', 'comma:,', 'number:1', 'close:)'], 'names and words are written in any case');
});

test('a text holds whatever is in it, a quote written twice, and need not be closed', () => {
  assert.deepEqual(read('"say ""hi"", (now)" & x'), ['text:"say ""hi"", (now)"', 'sign:&', 'name:x']);
  assert.deepEqual(read('"not closed, ('), ['text:"not closed, (']);
  assert.deepEqual(read('""'), ['text:""']);
  assert.deepEqual(read('"Gdańsk" & nothing'), ['text:"Gdańsk"', 'sign:&', 'name:nothing']);
});

test('a variable may have the name of a function: the bracket tells them apart', () => {
  assert.deepEqual(read('count + COUNT(tags)'), ['name:count', 'sign:+', 'function:COUNT', 'open:(', 'name:tags', 'close:)']);
  assert.deepEqual(read('COUNT (tags)'), ['function:COUNT', 'open:(', 'name:tags', 'close:)'], 'a space before the bracket changes nothing');
  assert.deepEqual(read('żółw_1 + 2'), ['name:żółw_1', 'sign:+', 'number:2']);
  assert.deepEqual(read('a ? b'), ['name:a', 'other:?', 'name:b'], 'what the language does not have is a piece too');
  assert.deepEqual(read(''), []);
});

test('the call the cursor is in, and which of its arguments', () => {
  const formula = 'ROUND(net * vat_rate, 2)';
  assert.equal(callAt(formula, 0), null);
  assert.equal(callAt(formula, 5), null, 'on the name, before the bracket');
  assert.deepEqual(callAt(formula, 6), { name: 'ROUND', argument: 0 });
  assert.deepEqual(callAt(formula, 20), { name: 'ROUND', argument: 0 }, 'before the comma');
  assert.deepEqual(callAt(formula, 21), { name: 'ROUND', argument: 1 });
  assert.deepEqual(callAt(formula, 23), { name: 'ROUND', argument: 1 });
  assert.equal(callAt(formula, 24), null, 'after the closing bracket');

  const nested = 'IF(INGROUP("a, b"), ROUND((net + 1) * 2, ';
  assert.deepEqual(callAt(nested, 11), { name: 'INGROUP', argument: 0 });
  assert.deepEqual(callAt(nested, 15), { name: 'INGROUP', argument: 0 }, 'a comma inside a text parts nothing');
  assert.deepEqual(callAt(nested, 19), { name: 'IF', argument: 1 });
  assert.deepEqual(callAt(nested, 27), { name: 'ROUND', argument: 0 }, 'inside a plain bracket the call is the one around it');
  assert.deepEqual(callAt(nested, nested.length), { name: 'ROUND', argument: 1 });
  assert.deepEqual(callAt('ROUND(', 6), { name: 'ROUND', argument: 0 }, 'a formula still being written');
  assert.equal(callAt('(a + b', 4), null, 'a plain bracket is no call');
  assert.equal(callAt('"ROUND(" & x', 8), null, 'nor is what stands in a text');
});

test('a place counted in bytes by the engine is found in characters', () => {
  assert.equal(fromBytes('"Gdansk" & nothing', 11), 11);
  assert.equal(fromBytes('"Gdańsk" & nothing', 12), 11, 'ń is two bytes and one character');
  assert.equal(fromBytes(`"${String.fromCodePoint(0x1f600)}" & nothing`, 9), 7, 'a face is four bytes and two halves of a character');
  assert.equal(fromBytes('abc', 0), 0);
  assert.equal(fromBytes('abc', 99), 3, 'past the end is the end');
});

test('what a finding at a place is about: the piece that is there', () => {
  const formula = 'ROUND(net * vat_rat, 2)';
  assert.deepEqual(pieceAt(formula, 12), { from: 12, to: 19 });
  assert.equal(formula.slice(12, 19), 'vat_rat');
  assert.deepEqual(pieceAt(formula, 14), { from: 12, to: 19 }, 'anywhere inside the name');
  assert.deepEqual(pieceAt('net +', 5), { from: 4, to: 5 }, 'at the end of a formula that stops short: its last character');
  assert.deepEqual(pieceAt('a  b', 2), { from: 2, to: 3 }, 'in a space: that character');
  assert.deepEqual(pieceAt('', 0), { from: 0, to: 0 });
});

test('the help for a call names its arguments and the one the cursor is in', () => {
  const functions = [
    { name: 'ROUND', params: [{ name: 'number', type: 'number' }, { name: 'digits', type: 'number', optional: true }, { name: 'method', type: 'text', optional: true }], returns: 'number', description: 'Rounds.' },
    { name: 'CEILING', aliases: ['CEIL'], params: [{ name: 'number', type: 'number' }], returns: 'number', description: 'Rounds up.' },
    { name: 'MIN', params: [{ name: 'value', type: 'numbers', repeat: true }], returns: 'number', description: 'The least.' },
    { name: 'TODAY', params: [], returns: 'date', description: 'The day.' },
  ];
  assert.deepEqual(helpFor({ name: 'round', argument: 1 }, functions), {
    name: 'ROUND',
    params: [
      { words: 'number', current: false },
      { words: 'digits (may be left out)', current: true },
      { words: 'method (may be left out)', current: false },
    ],
    returns: 'number',
    description: 'Rounds.',
  });
  assert.equal(helpFor({ name: 'Ceil', argument: 0 }, functions)?.name, 'CEILING', 'by another name it is written by');
  assert.deepEqual(helpFor({ name: 'MIN', argument: 4 }, functions)?.params, [{ words: 'value, ...', current: true }], 'an argument that repeats keeps the cursor');
  assert.deepEqual(helpFor({ name: 'TODAY', argument: 0 }, functions)?.params, []);
  assert.deepEqual(helpFor({ name: 'ROUND', argument: 7 }, functions)?.params.map((p) => p.current), [false, false, false], 'one argument too many is in none');
  assert.equal(helpFor({ name: 'NOSUCH', argument: 0 }, functions), null);
});
