// Finding a thing by what a person types of its name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { found, plain } from '../pages/find.js';

test('what is typed and what is searched come down to the same plain letters', () => {
  assert.equal(plain('Zamówienia'), 'zamowienia');
  assert.equal(plain('Łódź'), 'lodz', 'the l with a stroke is one sign with no mark to take off');
  assert.equal(plain('Straße'), 'strasse');
  assert.equal(plain('EXPENSES'), 'expenses');
});

test('a thing is found by every word typed, in any order, anywhere in what it says', () => {
  const expenses = ['Expenses', 'What an employee paid for the company and asks to be paid back.'];
  assert.ok(found(expenses, ''));
  assert.ok(found(expenses, '   '), 'spaces alone are nothing typed');
  assert.ok(found(expenses, 'exp'));
  assert.ok(found(expenses, 'PENS'), 'a part from the middle, in capitals');
  assert.ok(found(expenses, 'paid employee'), 'two words, in another order than written');
  assert.ok(!found(expenses, 'exp zebra'), 'every word has to be there');
  assert.ok(found(['Zamówienia'], 'zamow'), 'typed without the mark');
  assert.ok(found(['Zamowienia'], 'zamów'), 'and typed with a mark the name has not');
  assert.ok(!found([], 'x'));
});
