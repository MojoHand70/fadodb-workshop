// What a person types into a field: numbers in two languages, read
// strictly, and percentages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editable, readNumber, shift } from '../pages/input.js';

const EN = 'en-GB';
const PL = 'pl-PL';
const DE = 'de-DE';

test('a number typed in English', () => {
  assert.equal(readNumber('4200', EN), '4200');
  assert.equal(readNumber('4200.50', EN), '4200.50');
  assert.equal(readNumber('4,200.50', EN), '4200.50');
  assert.equal(readNumber('1,234,567', EN), '1234567');
  assert.equal(readNumber(' 86.5 ', EN), '86.5');
  assert.equal(readNumber('-12.30', EN), '-12.30');
  assert.equal(readNumber('.5', EN), '0.5');
  assert.equal(readNumber('007', EN), '7');
  assert.equal(readNumber('', EN), '');
});

test('a comma that cannot separate thousands is not guessed at, in English', () => {
  assert.equal(readNumber('4200,50', EN), null, 'it is not taken for 420050');
  assert.equal(readNumber('1,23', EN), null);
  assert.equal(readNumber('12,3456', EN), null);
  assert.equal(readNumber(',500', EN), null);
});

test('a number typed in Polish', () => {
  assert.equal(readNumber('4200,50', PL), '4200.50');
  assert.equal(readNumber('4 200,50', PL), '4200.50');
  assert.equal(readNumber('4\u00a0200,50', PL), '4200.50', 'the space the language itself writes');
  assert.equal(readNumber('4200.50', PL), '4200.50', 'a point is the decimals where the language has no other use for it');
  assert.equal(readNumber('-0,5', PL), '-0.5');
  assert.equal(readNumber('\u22120,5', PL), '-0.5', 'the minus the language itself writes');
});

test('a number typed in German, where the point separates thousands', () => {
  assert.equal(readNumber('1.234,56', DE), '1234.56');
  assert.equal(readNumber('1.234', DE), '1234');
  assert.equal(readNumber('1.5', DE), null, 'a point there is no decimal sign, and no thousands either');
  assert.equal(readNumber('1,5', DE), '1.5');
});

test('what is not a number', () => {
  assert.equal(readNumber('abc', EN), null);
  assert.equal(readNumber('12 PLN', EN), null);
  assert.equal(readNumber('1.2.3', EN), null);
  assert.equal(readNumber('1e5', EN), null);
  assert.equal(readNumber('--5', EN), null);
  assert.equal(readNumber('-0', EN), '0', 'a zero has no minus');
});

test('the decimal point moved, for a percentage', () => {
  assert.equal(shift('8', -2), '0.08');
  assert.equal(shift('23', -2), '0.23');
  assert.equal(shift('8.5', -2), '0.085');
  assert.equal(shift('100', -2), '1');
  assert.equal(shift('0', -2), '0');
  assert.equal(shift('-8', -2), '-0.08');
  assert.equal(shift('0.08', 2), '8');
  assert.equal(shift('0.085', 2), '8.5');
  assert.equal(shift('0.23', 2), '23');
  assert.equal(shift('1', 2), '100');
});

test('a number as a person edits it', () => {
  assert.equal(editable('4200.50', PL), '4200,50');
  assert.equal(editable('4200.50', EN), '4200.50');
  assert.equal(editable(1234.5, PL), '1234,5');
  assert.equal(editable(null, EN), '');
  assert.equal(readNumber(editable('-4200.50', PL), PL), '-4200.50', 'what is shown for editing is read back the same');
});
