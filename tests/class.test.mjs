// How a class is read for the lists of the designer: its variables in a
// line each, its outline, its states, the ways out of a state and who
// may do what. No browser and no server: these read a definition.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { kindLine, linesOf, marksOf, outline, rightsIn, rulesAbout, statesOf, waysIn, waysOut, whoMay } from '../pages/class.js';

const expense = JSON.parse(await readFile(new URL('./fixtures/expense.json', import.meta.url), 'utf8'));

test('the kind of a variable is said in a line', () => {
  /** @type {[Record<string, unknown>, string][]} */
  const cases = [
    [{ type: 'text', required: true }, 'text, required'],
    [{ type: 'date', default: 'TODAY()' }, 'date, at first TODAY()'],
    [{ type: 'decimal', scale: 2, default: '0.23', min: 0, max: '0.23' }, 'decimal, 0 to 0.23, at first 0.23'],
    [{ type: 'money', scale: 2 }, 'money'],
    [{ type: 'decimal', scale: 4 }, 'decimal, 4 places'],
    [{ formula: 'ROUND(net * vat_rate, 2)' }, 'fx ROUND(net * vat_rate, 2)'],
    [{ type: 'money', formula: 'net + vat' }, 'fx net + vat, money'],
    [{ type: 'text', values: ['low', 'high'] }, 'text, one of low, high'],
    [{ type: 'int', min: 1 }, 'int, at least 1'],
    [{ type: 'int', max: 5 }, 'int, at most 5'],
    [{ type: 'ref', class: 'Customer' }, 'ref to Customer'],
    [{ type: 'object', schema: 'Address' }, 'object of Address'],
    [{ type: 'rows', schema: { what: 'text', cost: 'money' } }, 'rows with what, cost'],
    [{ type: 'array<text>' }, 'array<text>'],
    [{ formula: 'USER()', mode: 'triggered', on: ['transition:check'] }, 'fx USER(), worked out at transition:check'],
    [{}, 'no type'],
  ];
  for (const [variable, said] of cases) assert.equal(kindLine(variable), said, JSON.stringify(variable));
  assert.equal(kindLine(undefined), 'no type');
});

test('what else a class says of a variable', () => {
  assert.deepEqual(marksOf({ type: 'text', list: true, index: true, format: '#,##0.00' }), ['in The List', 'indexed', 'shown as #,##0.00']);
  assert.deepEqual(marksOf({ type: 'text', list: false }), []);
  assert.deepEqual(marksOf(undefined), []);
});

test('the outline: the sections as they are written, and before them what is in none', () => {
  const parts = outline(expense);
  assert.deepEqual(parts.map((p) => p.name), ['purchase', 'amounts']);
  assert.deepEqual(parts[0], { name: 'purchase', label: 'The purchase', description: 'What was bought, when, and for whom.', variables: ['what', 'bought_on', 'cost_centre', 'note'], parts: [] });

  const nested = outline({
    variables: { a: {}, b: {}, c: {}, d: {} },
    sections: { one: { label: 'One', variables: ['b'], sections: { inner: { variables: ['c'] } } } },
  });
  assert.deepEqual(nested.map((p) => p.name), ['', 'one']);
  assert.deepEqual(nested[0].variables, ['a', 'd'], 'what is in no section comes first, in the written order');
  assert.deepEqual(nested[1].parts, [{ name: 'inner', label: 'inner', description: '', variables: ['c'], parts: [] }]);

  assert.deepEqual(outline({ variables: { a: {}, b: {} } }), [{ name: '', label: '', description: '', variables: ['a', 'b'], parts: [] }]);
  assert.deepEqual(outline({}), [{ name: '', label: '', description: '', variables: [], parts: [] }]);
});

test('the states, with where a document starts and where it ends', () => {
  const states = statesOf(expense);
  assert.deepEqual(states.map((s) => s.name), ['draft', 'submitted', 'approved', 'paid']);
  assert.deepEqual(states[0], { name: 'draft', label: 'Draft', description: 'Its author writes it and may change it.', initial: true, final: false });
  assert.deepEqual(states[3], { name: 'paid', label: 'Paid', description: 'Paid back. It changes no more.', initial: false, final: true });
  assert.deepEqual(statesOf({}), []);
  assert.deepEqual(statesOf({ states: { initial: 'a', list: ['a'] } }), [{ name: 'a', label: 'a', description: '', initial: true, final: false }]);
});

test('the ways out of a state, each with who may take it and when', () => {
  const out = waysOut(expense, 'submitted');
  assert.deepEqual(out.map((w) => w.name), ['take_back', 'send_back', 'approve']);
  assert.equal(out[2].label, 'Approve');
  assert.equal(out[2].toLabel, 'Approved');
  assert.equal(out[2].who, expense.access.transition.approve, 'the formula whole, as the class writes it');
  assert.equal(waysOut(expense, 'draft')[0].guard, 'total > 0');
  assert.deepEqual(waysOut(expense, 'paid'), []);

  const other = {
    states: { initial: 'a', list: ['a', 'b', 'c'] },
    transitions: [
      { name: 'go', from: ['a', 'b'], to: 'c' },
      { name: 'expire', from: 'b', to: 'c', after: '30d' },
      { name: 'due', from: 'b', to: 'c', at: 'ADDDAYS(spent_on, 60)' },
    ],
    access: { transition: { expire: 'FALSE' } },
  };
  assert.deepEqual(waysOut(other, 'a').map((w) => w.name), ['go'], 'a transition that leaves several states is a way out of each');
  assert.equal(waysOut(other, 'a')[0].who, null, 'with no line of its own it asks the line for changing');
  assert.equal(waysOut(other, 'a')[0].label, 'go', 'with no label it is shown by its name');
  const fromB = waysOut(other, 'b');
  assert.deepEqual(fromB.map((w) => [w.name, w.after, w.at, w.who]), [['go', '', '', null], ['expire', '30d', '', 'FALSE'], ['due', '', 'ADDDAYS(spent_on, 60)', null]]);
});

test('the ways into a state', () => {
  assert.deepEqual(waysIn(expense, 'draft'), [
    { name: 'take_back', label: 'Take back', from: ['Waiting for approval'] },
    { name: 'send_back', label: 'Send back', from: ['Waiting for approval'] },
  ]);
  assert.deepEqual(waysIn(expense, 'submitted'), [{ name: 'submit', label: 'Submit', from: ['Draft'] }]);
});

test('who a right names: a formula as it is written, or anybody in a list of groups', () => {
  assert.equal(whoMay('CREATEDBY() = USER()'), 'CREATEDBY() = USER()');
  assert.equal(whoMay(['expense_approvers']), 'anybody in expense_approvers');
  assert.equal(whoMay(['finance', 'directors']), 'anybody in finance or directors');
  assert.equal(whoMay([]), 'nobody');
});

test('the lines of the rights table under a state', () => {
  assert.deepEqual(rightsIn(expense, 'submitted'), [
    { what: '*', label: 'Every variable', about: 'every variable', write: 'FALSE', read: null },
    { what: 'note', label: 'Note', about: 'variable', write: 'anybody in expense_approvers', read: null },
  ]);
  assert.deepEqual(rightsIn(expense, 'paid'), []);
  const withSection = {
    variables: { salary: { type: 'money', label: 'Salary' } },
    sections: { pay: { label: 'Pay', variables: ['salary'] } },
    rights: { '*': { pay: { read: ['hr'], write: 'FALSE' }, gone: { write: 'TRUE' } } },
  };
  assert.deepEqual(rightsIn(withSection, '*'), [
    { what: 'pay', label: 'Pay', about: 'section', write: 'FALSE', read: 'anybody in hr' },
    { what: 'gone', label: 'gone', about: 'unknown', write: 'TRUE', read: null },
  ]);
});

test('the four lines of a class; one left out lets nobody through', () => {
  assert.deepEqual(linesOf(expense).map((l) => [l.line, l.formula]), [
    ['read', expense.access.read],
    ['create', 'INGROUP("everyone")'],
    ['update', expense.access.update],
    ['delete', 'FALSE'],
  ]);
  assert.deepEqual(linesOf({ access: { read: 'TRUE' } }).map((l) => l.formula), ['TRUE', null, null, null]);
  assert.deepEqual(linesOf({}).map((l) => l.formula), [null, null, null, null]);
});

test('the rules about a state, and the rules about none', () => {
  const ruled = {
    ...expense,
    rules: [
      { on: 'transition', name: 'approve', do: [{ action: 'set', values: { note: '"ok"', cost_centre: 'UPPER(cost_centre)' } }] },
      { on: 'enter', state: 'paid', do: [{ action: 'emit', event: 'expense_paid' }] },
      { on: 'exit', state: 'draft', if: 'net > 100', do: [{ action: 'refresh', variables: ['note'] }] },
      { on: 'create', do: [{ action: 'reset' }] },
      { on: 'values_change', variables: ['net', 'vat_rate'], do: [{ action: 'http.call', url: '"https://books.acme.example"', retries: 3 }] },
    ],
  };
  assert.deepEqual(rulesAbout(ruled, 'submitted'), [{ when: 'When Approve is taken', only: '', does: ['set note = "ok", cost_centre = UPPER(cost_centre)'] }]);
  assert.deepEqual(rulesAbout(ruled, 'paid'), [{ when: 'When a document enters Paid', only: '', does: ['emit (event: expense_paid)'] }]);
  assert.deepEqual(rulesAbout(ruled, 'draft'), [{ when: 'When a document leaves Draft', only: 'net > 100', does: ['refresh (variables: ["note"])'] }]);
  assert.deepEqual(rulesAbout(ruled, ''), [
    { when: 'When a document is made', only: '', does: ['reset'] },
    { when: 'When net or vat_rate changes', only: '', does: ['http.call (url: "https://books.acme.example", retries: 3)'] },
  ]);
  assert.deepEqual(rulesAbout(expense, 'draft'), []);
});
