// How a class is read for the lists of the designer: its variables in a
// line each, its outline, its states, the ways out of a state and who
// may do what. No browser and no server: these read a definition.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TYPES,
  actionsOf,
  addMove,
  addReset,
  addRightLine,
  addRule,
  addSection,
  addSet,
  addState,
  addVariable,
  asFormula,
  asRangeEnd,
  decides,
  eventOf,
  eventsAt,
  eventsOf,
  homeOfRule,
  inputsOf,
  kindLine,
  linesOf,
  linesToAdd,
  marksOf,
  moveSection,
  moveVariable,
  outline,
  pathOfSection,
  placeOfSection,
  placeOfVariable,
  placesFor,
  placesOut,
  removeAction,
  removeMove,
  removeRightLine,
  removeRule,
  removeSection,
  removeSetValue,
  removeState,
  removeVariable,
  rightsIn,
  ruleAt,
  rulesAbout,
  rulesAt,
  sectionOfVariable,
  sectionWords,
  sectionsAround,
  sectionsOf,
  setClassWord,
  setComputed,
  setFinal,
  setInitial,
  setLine,
  setMoveWho,
  setMoveWord,
  setResetVariables,
  setRight,
  setRuleEvent,
  setRuleIf,
  setRuleVariables,
  setSectionWord,
  setSetFormula,
  setStateWord,
  setWord,
  shiftSection,
  shiftVariable,
  statesOf,
  waysIn,
  waysOut,
  whereWords,
  whoDecides,
  whoMay,
} from '../pages/class.js';

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
    { what: '*', label: 'Every variable', about: 'every variable', write: 'FALSE', read: null, writeAs: 'FALSE', readAs: '' },
    { what: 'note', label: 'Note', about: 'variable', write: 'anybody in expense_approvers', read: null, writeAs: 'INGROUP("expense_approvers")', readAs: '' },
  ]);
  assert.deepEqual(rightsIn(expense, 'paid'), []);
  const withSection = {
    variables: { salary: { type: 'money', label: 'Salary' } },
    sections: { pay: { label: 'Pay', variables: ['salary'] } },
    rights: { '*': { pay: { read: ['hr'], write: 'FALSE' }, gone: { write: 'TRUE' } } },
  };
  assert.deepEqual(rightsIn(withSection, '*'), [
    { what: 'pay', label: 'Pay', about: 'section', write: 'FALSE', read: 'anybody in hr', writeAs: 'FALSE', readAs: 'INGROUP("hr")' },
    { what: 'gone', label: 'gone', about: 'unknown', write: 'TRUE', read: null, writeAs: 'TRUE', readAs: '' },
  ]);
});

test('a right as the formula it means: a list of groups is INGROUP of each, joined by OR', () => {
  assert.equal(asFormula('CREATEDBY() = USER()'), 'CREATEDBY() = USER()');
  assert.equal(asFormula(['expense_approvers']), 'INGROUP("expense_approvers")');
  assert.equal(asFormula(['finance', 'directors']), 'INGROUP("finance") OR INGROUP("directors")');
  assert.equal(asFormula(['the "A" team']), 'INGROUP("the ""A"" team")', 'a quote in a name is written twice, as a formula wants it');
  assert.equal(asFormula([]), 'FALSE', 'anybody in no group is nobody');
  assert.equal(asFormula(undefined), '');
});

test('the lines about single variables are added, changed and taken out, state by state', () => {
  /** @type {any} */
  const it = structuredClone(expense);

  // What a line may be about, where the state has none for it yet: every variable, a section, a variable.
  assert.deepEqual(linesToAdd(it, 'submitted').map((one) => one.what), ['purchase', 'amounts', 'what', 'bought_on', 'cost_centre', 'net', 'vat_rate', 'vat', 'total', 'needs_director']);
  assert.deepEqual(linesToAdd(it, 'approved').slice(0, 4), [
    { what: '*', words: 'Every variable' },
    { what: 'purchase', words: 'The section The purchase' },
    { what: 'amounts', words: 'The section Amounts' },
    { what: 'what', words: 'what, What was bought' },
  ]);

  // A new line lets nobody set what it is about, until the designer says who may.
  addRightLine(it, 'approved', 'amounts');
  assert.deepEqual(it.rights.approved, { amounts: { write: 'FALSE' } });
  addRightLine(it, 'approved', 'amounts');
  assert.deepEqual(it.rights.approved, { amounts: { write: 'FALSE' } }, 'a line that is there is left as it is');
  assert.equal(linesToAdd(it, 'approved').some((one) => one.what === 'amounts'), false);

  setRight(it, 'approved', 'amounts', 'write', 'INGROUP("accountants")');
  setRight(it, 'approved', 'amounts', 'read', 'INGROUP("accountants") OR CREATEDBY() = USER()');
  assert.deepEqual(it.rights.approved.amounts, { write: 'INGROUP("accountants")', read: 'INGROUP("accountants") OR CREATEDBY() = USER()' });

  // A line written the short way keeps it until somebody changes that half.
  assert.deepEqual(it.rights.submitted.note, { write: ['expense_approvers'] });
  setRight(it, 'submitted', 'note', 'read', 'TRUE');
  assert.deepEqual(it.rights.submitted.note, { write: ['expense_approvers'], read: 'TRUE' });
  setRight(it, 'submitted', 'note', 'write', 'INGROUP("directors")');
  assert.deepEqual(it.rights.submitted.note, { write: 'INGROUP("directors")', read: 'TRUE' });

  // An empty formula takes that half out; a line with neither half goes, and so does a state with no line.
  setRight(it, 'approved', 'amounts', 'write', '');
  assert.deepEqual(it.rights.approved.amounts, { read: 'INGROUP("accountants") OR CREATEDBY() = USER()' });
  setRight(it, 'approved', 'amounts', 'read', '');
  assert.equal('approved' in it.rights, false);
  setRight(it, 'approved', 'amounts', 'read', '');
  assert.equal('approved' in it.rights, false, 'emptying what is not there makes nothing');

  removeRightLine(it, 'submitted', 'note');
  assert.deepEqual(Object.keys(it.rights.submitted), ['*']);
  removeRightLine(it, 'submitted', '*');
  removeRightLine(it, 'draft', '*');
  assert.equal('rights' in it, false, 'the last line taken out leaves no table');

  // On a class that keeps none, the first line makes the table.
  setRight(it, '*', 'total', 'write', 'FALSE');
  assert.deepEqual(it.rights, { '*': { total: { write: 'FALSE' } } });
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

// Changing a class through the lists.

/** @returns {any} */
const fresh = () => structuredClone(expense);

test('a word of a variable is set, and an empty one is taken out', () => {
  const it = fresh();
  setWord(it, 'note', 'required', true);
  setWord(it, 'note', 'label', 'A note');
  assert.deepEqual(it.variables.note, { type: 'text', label: 'A note', description: 'Anything the approver should know.', required: true });
  assert.deepEqual(Object.keys(it.variables.note), ['type', 'label', 'description', 'required'], 'a word that was there keeps its place, a new one goes to the end');
  setWord(it, 'note', 'required', false);
  setWord(it, 'note', 'description', '');
  setWord(it, 'what', 'list', false);
  setWord(it, 'note', 'values', []);
  assert.deepEqual(it.variables.note, { type: 'text', label: 'A note' });
  assert.equal('list' in it.variables.what, false);
  setWord(it, 'nothing', 'label', 'x');
  assert.equal(it.variables.nothing, undefined, 'a variable the class does not have is not made by the way');
});

test('a variable becomes worked out, or given, and loses the words of the other kind', () => {
  const it = fresh();
  setComputed(it, 'vat_rate', true);
  assert.deepEqual(it.variables.vat_rate, { label: 'VAT rate', format: '0%', description: 'The rate on the receipt, 23% unless it says otherwise.', formula: '' });
  assert.equal(kindLine(it.variables.vat_rate), 'fx ');
  setComputed(it, 'vat', false);
  assert.deepEqual(it.variables.vat, { label: 'VAT', format: '#,##0.00', description: 'The VAT on the net amount, to the cent.', type: 'text' });
  setComputed(it, 'total', true);
  assert.equal(it.variables.total.formula, 'net + vat', 'one that is worked out already keeps its formula');
});

test('a variable is added to a section or to none, moved, and taken out', () => {
  const it = fresh();
  addVariable(it, 'urgent', 'purchase');
  assert.deepEqual(it.variables.urgent, { type: 'text' });
  assert.deepEqual(it.sections.purchase.variables, ['what', 'bought_on', 'cost_centre', 'note', 'urgent']);
  assert.equal(sectionOfVariable(it, 'urgent'), 'purchase');

  addVariable(it, 'loose', '');
  assert.equal(sectionOfVariable(it, 'loose'), '');
  assert.deepEqual(outline(it)[0].variables, ['loose']);

  moveVariable(it, 'urgent', 'amounts');
  assert.deepEqual(it.sections.purchase.variables, ['what', 'bought_on', 'cost_centre', 'note']);
  assert.deepEqual(it.sections.amounts.variables.at(-1), 'urgent');
  moveVariable(it, 'urgent', '');
  assert.equal(sectionOfVariable(it, 'urgent'), '');
  assert.equal(it.sections.amounts.variables.includes('urgent'), false);

  removeVariable(it, 'net');
  assert.equal(it.variables.net, undefined);
  assert.equal(it.sections.amounts.variables.includes('net'), false);
  assert.equal(it.variables.vat.formula, 'ROUND(net * vat_rate, 2)', 'what reads it is left for the server to find');

  const bare = { name: 'Bare' };
  addVariable(bare, 'first', '');
  assert.deepEqual(bare, { name: 'Bare', variables: { first: { type: 'text' } } });
});

test('sections inside sections are found, each with how deep it lies', () => {
  const nested = {
    variables: { a: {}, b: {}, c: {} },
    sections: { one: { label: 'One', variables: ['a'], sections: { inner: { label: 'Inner', variables: ['b'] } } }, two: { variables: ['c'] } },
  };
  assert.deepEqual(sectionsOf(nested), [
    { name: 'one', label: 'One', depth: 0 },
    { name: 'inner', label: 'Inner', depth: 1 },
    { name: 'two', label: 'two', depth: 0 },
  ]);
  assert.equal(sectionOfVariable(nested, 'b'), 'inner');
  moveVariable(nested, 'b', 'two');
  assert.deepEqual(nested.sections.one.sections.inner.variables, []);
  assert.deepEqual(nested.sections.two.variables, ['c', 'b']);
  assert.deepEqual(sectionsOf(expense).map((s) => s.name), ['purchase', 'amounts']);
  assert.deepEqual(sectionsOf({}), []);
});

test('the end of a range is written as the type of the variable asks', () => {
  assert.equal(asRangeEnd('5', 'int'), 5);
  assert.equal(asRangeEnd(' 2.5 ', 'number'), 2.5);
  assert.equal(asRangeEnd('0.23', 'decimal'), '0.23', 'an exact number keeps its digits');
  assert.equal(asRangeEnd('100.00', 'money'), '100.00');
  assert.equal(asRangeEnd('', 'int'), '');
  assert.equal(asRangeEnd('five', 'int'), 'five', 'what is no number is kept, for the server to refuse');
  assert.ok(TYPES.includes('money') && !TYPES.includes('ref'));
});

test('the words of the class itself, and its four lines', () => {
  const it = fresh();
  setClassWord(it, 'label', 'Expense claim');
  setClassWord(it, 'plural', 'Expense claims');
  setClassWord(it, 'title', '');
  assert.equal(it.label, 'Expense claim');
  assert.equal(it.plural, 'Expense claims');
  assert.equal('title' in it, false, 'an empty title is no title');
  assert.deepEqual(Object.keys(it).slice(0, 3), ['name', 'label', 'description'], 'a word that was there keeps its place');

  setLine(it, 'delete', 'INGROUP("accountants")');
  assert.equal(it.access.delete, 'INGROUP("accountants")');
  setLine(it, 'read', '');
  assert.equal('read' in it.access, false, 'an empty line is a line left out');
  assert.deepEqual(linesOf(it).map((l) => l.formula), [null, 'INGROUP("everyone")', it.access.update, 'INGROUP("accountants")']);

  const bare = { name: 'Bare' };
  setLine(bare, 'read', '');
  assert.deepEqual(bare, { name: 'Bare' }, 'an empty line makes no block');
  setLine(bare, 'read', 'TRUE');
  assert.deepEqual(bare, { name: 'Bare', access: { read: 'TRUE' } });
});

test('the words of a state, where a document starts and where it ends', () => {
  const it = fresh();
  setStateWord(it, 'approved', 'label', 'Accepted');
  setStateWord(it, 'approved', 'description', '');
  assert.equal(it.states.labels.approved, 'Accepted');
  assert.equal('approved' in it.states.descriptions, false);
  setInitial(it, 'submitted');
  assert.equal(statesOf(it).find((s) => s.initial)?.name, 'submitted');
  setFinal(it, 'approved', true);
  assert.deepEqual(it.states.final, ['approved', 'paid'], 'in the order of the states');
  setFinal(it, 'approved', false);
  setFinal(it, 'paid', false);
  assert.equal('final' in it.states, false, 'no final state, no list of them');

  const plain = { states: { initial: 'a', list: ['a'] } };
  setStateWord(plain, 'a', 'label', 'First');
  assert.deepEqual(plain.states, { initial: 'a', list: ['a'], labels: { a: 'First' } });
  setStateWord(plain, 'a', 'label', '');
  assert.deepEqual(plain.states, { initial: 'a', list: ['a'] }, 'the last label taken out takes the block with it');
});

test('a state is added and taken out, with what is its own', () => {
  const it = fresh();
  addState(it, 'archived');
  assert.deepEqual(it.states.list, ['draft', 'submitted', 'approved', 'paid', 'archived']);
  assert.equal(it.states.initial, 'draft');

  removeState(it, 'submitted');
  assert.deepEqual(it.states.list, ['draft', 'approved', 'paid', 'archived']);
  assert.equal('submitted' in it.states.labels, false);
  assert.equal('submitted' in it.states.descriptions, false);
  assert.equal('submitted' in it.rights, false, 'the rights written for it go with it');
  assert.ok('draft' in it.rights);
  assert.equal(it.transitions.length, 5, 'a move that leaves it or leads to it is left for the designer');
  removeState(it, 'paid');
  assert.equal('final' in it.states, false);

  const bare = { name: 'Bare' };
  addState(bare, 'open');
  assert.deepEqual(bare, { name: 'Bare', states: { initial: 'open', list: ['open'] } }, 'the first state is where a new document starts');
  addState(bare, 'shut');
  assert.equal(bare.states.initial, 'open');
});

test('a transition is changed by its place, added and taken out with its line', () => {
  const it = fresh();
  assert.deepEqual(placesOut(it, 'submitted'), [1, 2, 3]);
  assert.deepEqual(placesOut(it, 'paid'), []);

  setMoveWord(it, 3, 'label', 'Accept');
  setMoveWord(it, 3, 'guard', 'total < 100000');
  setMoveWord(it, 0, 'guard', '');
  setMoveWord(it, 4, 'after', '30d');
  assert.equal(it.transitions[3].label, 'Accept');
  assert.equal(it.transitions[3].guard, 'total < 100000');
  assert.equal('guard' in it.transitions[0], false);
  assert.equal(it.transitions[4].after, '30d');

  setMoveWho(it, 4, 'INGROUP("finance")');
  assert.equal(it.access.transition.pay, 'INGROUP("finance")');
  setMoveWho(it, 0, '');
  assert.equal('submit' in it.access.transition, false, 'with no line of its own it asks the line for changing');
  assert.equal(waysOut(it, 'draft')[0].who, null);

  const at = addMove(it, 'archive', 'paid', 'paid');
  assert.equal(at, 5);
  assert.deepEqual(it.transitions[5], { name: 'archive', from: 'paid', to: 'paid' });
  setMoveWho(it, at, 'INGROUP("accountants")');

  removeMove(it, 4);
  assert.deepEqual(it.transitions.map((/** @type {any} */ t) => t.name), ['submit', 'take_back', 'send_back', 'approve', 'archive']);
  assert.equal('pay' in it.access.transition, false, 'its line goes with it');
  assert.equal(it.access.transition.archive, 'INGROUP("accountants")');

  /** @type {any} */
  const bare = { name: 'Bare', states: { initial: 'a', list: ['a', 'b'] } };
  assert.equal(addMove(bare, 'go', 'a', 'b'), 0);
  setMoveWho(bare, 0, 'TRUE');
  assert.deepEqual(bare.access, { transition: { go: 'TRUE' } });
  removeMove(bare, 0);
  assert.equal('transitions' in bare, false);
  assert.deepEqual(bare.access, {}, 'the last line taken out leaves no list of lines');
});

test('the sections around a variable: its own first, then outwards', () => {
  const trip = {
    variables: { by: {}, hotel: {}, loose: {} },
    sections: { journey: { label: 'The journey', variables: ['by'], sections: { stay: { label: 'The stay', variables: ['hotel'] } } } },
  };
  assert.deepEqual(sectionsAround(trip, 'hotel'), ['stay', 'journey']);
  assert.deepEqual(sectionsAround(trip, 'by'), ['journey']);
  assert.deepEqual(sectionsAround(trip, 'loose'), []);
  assert.deepEqual(sectionsAround(expense, 'net'), ['amounts']);
});

test('who may set a variable and who may see it, state by state, with the line that decides', () => {
  // Expense: in Draft its author sets every variable; while it waits for approval nobody does, but the approvers set the note.
  assert.deepEqual(decides(expense, 'draft', 'note', 'write'), { state: 'draft', what: '*', about: 'every variable', formula: 'CREATEDBY() = USER()' });
  assert.deepEqual(decides(expense, 'submitted', 'note', 'write'), { state: 'submitted', what: 'note', about: 'variable', formula: 'INGROUP("expense_approvers")' });
  assert.deepEqual(decides(expense, 'submitted', 'net', 'write'), { state: 'submitted', what: '*', about: 'every variable', formula: 'FALSE' });
  assert.equal(decides(expense, 'approved', 'net', 'write'), null, 'no line: who may change the document decides alone');
  assert.equal(decides(expense, 'submitted', 'note', 'read'), null, 'a line that says who may set says nothing of who may see');

  assert.deepEqual(
    whoDecides(expense, 'note').map((row) => [row.state, row.label, row.final, row.write?.formula ?? null, row.read]),
    [
      ['draft', 'Draft', false, 'CREATEDBY() = USER()', null],
      ['submitted', 'Waiting for approval', false, 'INGROUP("expense_approvers")', null],
      ['approved', 'Approved', false, null, null],
      ['paid', 'Paid', true, null, null],
    ],
  );

  // A state's own line for every variable comes before a line for every state that names the variable.
  const trap = { ...expense, rights: { ...expense.rights, '*': { note: { write: 'FALSE' }, amounts: { read: ['accountants'] } } } };
  assert.deepEqual(decides(trap, 'draft', 'note', 'write'), { state: 'draft', what: '*', about: 'every variable', formula: 'CREATEDBY() = USER()' });
  assert.deepEqual(decides(trap, 'approved', 'note', 'write'), { state: '*', what: 'note', about: 'variable', formula: 'FALSE' });
  assert.deepEqual(decides(trap, 'paid', 'total', 'read'), { state: '*', what: 'amounts', about: 'section', formula: 'INGROUP("accountants")' });

  // Where a line is, in words.
  assert.equal(whereWords(trap, /** @type {any} */ (decides(trap, 'draft', 'note', 'write'))), 'the line for every variable, in this state');
  assert.equal(whereWords(trap, /** @type {any} */ (decides(trap, 'approved', 'note', 'write'))), 'its own line, for every state');
  assert.equal(whereWords(trap, /** @type {any} */ (decides(trap, 'paid', 'total', 'read'))), 'the line for the section Amounts, for every state');
  assert.equal(whereWords(expense, /** @type {any} */ (decides(expense, 'submitted', 'note', 'write'))), 'its own line, in this state');
});

test('a section is read, given words, added, moved and taken out', () => {
  /** @type {any} */
  const it = structuredClone(expense);
  assert.deepEqual(sectionWords(it, 'amounts'), {
    name: 'amounts',
    label: 'Amounts',
    description: 'What it cost, and what is paid back.',
    inside: '',
    variables: ['net', 'vat_rate', 'vat', 'total', 'needs_director'],
    sections: [],
  });
  assert.equal(sectionWords(it, 'nothing'), null);

  setSectionWord(it, 'amounts', 'label', 'The money');
  setSectionWord(it, 'amounts', 'description', '');
  assert.equal(it.sections.amounts.label, 'The money');
  assert.equal('description' in it.sections.amounts, false, 'an empty word is taken out');

  // A section begins with a variable, which leaves the section it was in: the server takes no section with nothing in it.
  addSection(it, 'extras', 'note');
  assert.deepEqual(Object.keys(it.sections), ['purchase', 'amounts', 'extras'], 'at the end of the top level');
  assert.deepEqual(it.sections.extras, { variables: ['note'] });
  assert.deepEqual(it.sections.purchase.variables, ['what', 'bought_on', 'cost_centre']);
  assert.equal(sectionOfVariable(it, 'note'), 'extras');

  // Moved into another, with all it holds; never into itself or into what lies inside it.
  assert.deepEqual(placesFor(it, 'extras').map((one) => one.name), ['', 'purchase', 'amounts']);
  moveSection(it, 'extras', 'amounts');
  assert.deepEqual(Object.keys(it.sections), ['purchase', 'amounts']);
  assert.deepEqual(it.sections.amounts.sections, { extras: { variables: ['note'] } });
  assert.equal(sectionWords(it, 'extras')?.inside, 'amounts');
  assert.equal(pathOfSection(it, 'extras'), '/sections/amounts/sections/extras');
  assert.equal(pathOfSection(it, 'amounts'), '/sections/amounts');
  assert.equal(pathOfSection(it, 'nothing'), '');
  assert.deepEqual(placesFor(it, 'amounts').map((one) => one.name), ['', 'purchase'], 'not into itself, and not into extras, which lies inside it');
  const before = JSON.stringify(it);
  moveSection(it, 'amounts', 'extras');
  moveSection(it, 'amounts', 'amounts');
  moveSection(it, 'extras', 'amounts');
  assert.equal(JSON.stringify(it), before, 'what cannot be, and what is so already, changes nothing');

  // Back to the top: the section it left keeps no empty list of sections.
  moveSection(it, 'extras', '');
  assert.deepEqual(Object.keys(it.sections), ['purchase', 'amounts', 'extras']);
  assert.equal('sections' in it.sections.amounts, false);

  // Taken out: its variables are in no section, and the sections inside it take its place, in their order.
  moveSection(it, 'extras', 'purchase');
  removeSection(it, 'purchase');
  assert.deepEqual(Object.keys(it.sections), ['extras', 'amounts'], 'extras stands where purchase stood');
  assert.equal(sectionOfVariable(it, 'what'), '');
  assert.equal(sectionOfVariable(it, 'note'), 'extras');
  assert.ok('what' in it.variables, 'the variables stay in the class');
  removeSection(it, 'extras');
  removeSection(it, 'amounts');
  assert.equal('sections' in it, false, 'the last section taken out leaves no outline');
  removeSection(it, 'amounts');

  // On a class with no outline, the first section makes one.
  addSection(it, 'first', 'what');
  assert.deepEqual(it.sections, { first: { variables: ['what'] } });
});

test('a variable and a section are moved a step earlier or later among those beside them', () => {
  /** @type {any} */
  const it = structuredClone(expense);
  assert.deepEqual(placeOfVariable(it, 'note'), { at: 4, of: 4 });
  assert.deepEqual(placeOfVariable(it, 'net'), { at: 1, of: 5 });
  assert.deepEqual(placeOfVariable(it, 'nothing'), { at: 0, of: 0 });

  // In a section, the order is the order its list is written in.
  shiftVariable(it, 'note', -1);
  assert.deepEqual(it.sections.purchase.variables, ['what', 'bought_on', 'note', 'cost_centre']);
  shiftVariable(it, 'note', 1);
  shiftVariable(it, 'note', 1);
  assert.deepEqual(it.sections.purchase.variables, ['what', 'bought_on', 'cost_centre', 'note'], 'the last stays the last');
  shiftVariable(it, 'what', -1);
  assert.deepEqual(it.sections.purchase.variables, ['what', 'bought_on', 'cost_centre', 'note'], 'and the first the first');
  assert.deepEqual(it.sections.amounts.variables, expense.sections.amounts.variables, 'another section is left alone');
  assert.deepEqual(Object.keys(it.variables), Object.keys(expense.variables), 'and so is the order the class writes its variables in');

  // In no section, it is the order the class writes its variables in, and only those in no section change places.
  /** @type {any} */
  const loose = { variables: { a: {}, s: {}, b: {}, c: {} }, sections: { part: { variables: ['s'] } } };
  assert.deepEqual(placeOfVariable(loose, 'b'), { at: 2, of: 3 });
  shiftVariable(loose, 'b', -1);
  assert.deepEqual(Object.keys(loose.variables), ['b', 's', 'a', 'c'], 'b and a changed places; s, which is in a section, kept its own');
  shiftVariable(loose, 'b', 1);
  shiftVariable(loose, 'b', 1);
  assert.deepEqual(Object.keys(loose.variables), ['a', 's', 'c', 'b']);
  assert.deepEqual(placeOfVariable(loose, 'b'), { at: 3, of: 3 });

  // A section moves among the sections beside it, with all it holds.
  assert.deepEqual(placeOfSection(it, 'amounts'), { at: 2, of: 2 });
  shiftSection(it, 'amounts', -1);
  assert.deepEqual(Object.keys(it.sections), ['amounts', 'purchase']);
  assert.deepEqual(it.sections.amounts.variables, expense.sections.amounts.variables);
  shiftSection(it, 'amounts', -1);
  assert.deepEqual(Object.keys(it.sections), ['amounts', 'purchase'], 'the first stays the first');
  /** @type {any} */
  const nested = { variables: { a: {}, b: {}, c: {} }, sections: { outer: { variables: ['a'], sections: { one: { variables: ['b'] }, two: { variables: ['c'] } } } } };
  assert.deepEqual(placeOfSection(nested, 'two'), { at: 2, of: 2 });
  shiftSection(nested, 'two', -1);
  assert.deepEqual(Object.keys(nested.sections.outer.sections), ['two', 'one']);
  assert.deepEqual(placeOfSection(nested, 'nothing'), { at: 0, of: 0 });
});

test('what can set a rule off: everything in the class, and what belongs to one place of the lists', () => {
  assert.deepEqual(inputsOf(expense).map((one) => one.name), ['what', 'bought_on', 'cost_centre', 'note', 'net', 'vat_rate'], 'the values people give: a rule sets these and no other');
  assert.deepEqual(eventsOf(expense).slice(0, 4), [
    { event: 'create', words: 'A document is made' },
    { event: 'values_change', words: 'A value changes' },
    { event: 'enter:draft', words: 'A document enters Draft' },
    { event: 'enter:submitted', words: 'A document enters Waiting for approval' },
  ]);
  assert.deepEqual(eventsOf(expense).slice(-6).map((one) => one.event), ['transition:submit', 'transition:take_back', 'transition:send_back', 'transition:approve', 'transition:pay', 'delete']);
  assert.deepEqual(eventsAt(expense, 'submitted'), [
    { event: 'enter:submitted', words: 'A document enters Waiting for approval' },
    { event: 'exit:submitted', words: 'A document leaves Waiting for approval' },
    { event: 'transition:take_back', words: 'Take back is taken' },
    { event: 'transition:send_back', words: 'Send back is taken' },
    { event: 'transition:approve', words: 'Approve is taken' },
  ]);
  assert.deepEqual(eventsAt(expense, '').slice(0, 2), [{ event: 'create', words: 'A document is made' }, { event: 'values_change:what', words: 'What was bought changes' }]);
  assert.equal(eventsAt(expense, '').at(-1)?.event, 'delete');
  assert.equal(eventOf({ on: 'transition', name: 'approve' }), 'transition:approve');
  assert.equal(eventOf({ on: 'exit', state: 'draft' }), 'exit:draft');
  assert.equal(eventOf({ on: 'values_change', variables: ['net'] }), 'values_change');
  assert.equal(eventOf(undefined), '');
});

test('a rule is added, told where it belongs, changed and taken out; and so is each thing it does', () => {
  /** @type {any} */
  const it = structuredClone(expense);
  assert.equal('rules' in it, false);
  /** The first rule as the class holds it, read afresh: a check narrows what the checker takes it for. */
  const first = () => /** @type {any} */ (it).rules[0];

  // A rule does at least one thing: it begins by setting one variable, to a formula the designer then writes.
  assert.equal(addRule(it, 'transition:approve', 'note'), 0);
  assert.deepEqual(it.rules, [{ on: 'transition', name: 'approve', do: [{ action: 'set', values: { note: '' } }] }]);
  setSetFormula(it, 0, 0, 'note', 'note & " (seen)"');
  assert.equal(addRule(it, 'values_change:net', 'cost_centre'), 1);
  assert.deepEqual(it.rules[1], { on: 'values_change', variables: ['net'], do: [{ action: 'set', values: { cost_centre: '' } }] });
  assert.equal(addRule(it, 'enter:draft', 'note'), 2);
  assert.equal(addRule(it, 'create', 'what'), 3);

  // Where each stands in the lists, by its place in the class.
  assert.deepEqual(rulesAt(it, 'submitted'), [{ at: 0, when: 'When Approve is taken', only: '', does: ['set note = note & " (seen)"'] }]);
  assert.deepEqual(rulesAt(it, 'draft').map((rule) => [rule.at, rule.when]), [[2, 'When a document enters Draft']]);
  assert.deepEqual(rulesAt(it, '').map((rule) => [rule.at, rule.when]), [[1, 'When net changes'], [3, 'When a document is made']]);
  assert.deepEqual(rulesAbout(it, 'submitted'), [{ when: 'When Approve is taken', only: '', does: ['set note = note & " (seen)"'] }]);
  assert.equal(homeOfRule(it, 0), 'submitted');
  // A transition that leaves several states: its rule stands under each, and is at home in the one the lists show.
  /** @type {any} */
  const several = { states: { initial: 'a', list: ['a', 'b', 'c'] }, transitions: [{ name: 'stop', from: ['a', 'b'], to: 'c' }], rules: [{ on: 'transition', name: 'stop', do: [] }] };
  assert.equal(homeOfRule(several, 0), 'a');
  assert.equal(homeOfRule(several, 0, 'b'), 'b');
  assert.equal(homeOfRule(several, 0, 'c'), 'a', 'not in a state the transition does not leave');
  assert.deepEqual([rulesAt(several, 'a').length, rulesAt(several, 'b').length, rulesAt(several, 'c').length], [1, 1, 0]);
  assert.equal(homeOfRule(it, 2), 'draft');
  assert.equal(homeOfRule(it, 1), '');
  assert.equal(homeOfRule(it, 9), '');
  assert.deepEqual(ruleAt(it, 0), { when: 'When Approve is taken', only: '', does: ['set note = note & " (seen)"'], event: 'transition:approve', variables: [], condition: '' });
  assert.equal(ruleAt(it, 9), null);

  // The condition, and what sets it off. What the old event named and the new one does not is taken out.
  setRuleIf(it, 0, 'total > 1000');
  assert.deepEqual(Object.keys(it.rules[0]), ['on', 'name', 'if', 'do'], 'in the order a class writes a rule');
  setRuleEvent(it, 0, 'exit:submitted');
  assert.deepEqual(it.rules[0], { on: 'exit', state: 'submitted', if: 'total > 1000', do: [{ action: 'set', values: { note: 'note & " (seen)"' } }] });
  setRuleEvent(it, 0, 'values_change');
  assert.deepEqual(first().variables, [], 'for the designer to name');
  setRuleVariables(it, 0, ['net', 'vat_rate']);
  assert.deepEqual(Object.keys(it.rules[0]), ['on', 'variables', 'if', 'do']);
  setRuleEvent(it, 0, 'values_change');
  assert.deepEqual(first().variables, ['net', 'vat_rate'], 'the same event again keeps what it names');
  setRuleEvent(it, 0, 'delete');
  assert.deepEqual(Object.keys(it.rules[0]), ['on', 'if', 'do']);
  setRuleIf(it, 0, '');
  assert.equal('if' in it.rules[0], false);
  setRuleEvent(it, 0, 'transition:approve');

  // What it does, one action after another.
  assert.equal(addReset(it, 0, 'cost_centre'), 1);
  assert.equal(addSet(it, 0, 'what'), 2);
  setSetFormula(it, 0, 2, 'what', 'UPPER(what)');
  first().do.push({ action: 'emit', event: 'approved' });
  first().do[0].values.cost_centre = '"none"';
  assert.deepEqual(actionsOf(it, 0), [
    { at: 0, kind: 'set', values: [{ variable: 'note', label: 'Note', formula: 'note & " (seen)"' }, { variable: 'cost_centre', label: 'Cost centre', formula: '"none"' }] },
    { at: 1, kind: 'reset', variables: ['cost_centre'] },
    { at: 2, kind: 'set', values: [{ variable: 'what', label: 'What was bought', formula: 'UPPER(what)' }] },
    { at: 3, kind: 'other', words: 'emit (event: approved)' },
  ]);
  setResetVariables(it, 0, 1, ['cost_centre', 'note']);
  assert.deepEqual(it.rules[0].do[1], { action: 'reset', variables: ['cost_centre', 'note'] });
  setSetFormula(it, 0, 1, 'note', 'x');
  assert.deepEqual(it.rules[0].do[1], { action: 'reset', variables: ['cost_centre', 'note'] }, 'an action that sets nothing is given no formula');

  // One value out of an action that sets two; the last value takes the action with it.
  removeSetValue(it, 0, 0, 'note');
  assert.deepEqual(it.rules[0].do[0], { action: 'set', values: { cost_centre: '"none"' } });
  removeSetValue(it, 0, 0, 'cost_centre');
  assert.deepEqual(it.rules[0].do.map((/** @type {any} */ step) => step.action), ['reset', 'set', 'emit']);
  removeAction(it, 0, 0);
  assert.deepEqual(it.rules[0].do.map((/** @type {any} */ step) => step.action), ['set', 'emit']);
  removeAction(it, 0, 7);
  assert.equal(it.rules[0].do.length, 2);

  // Taken out, the rules after it move up; the last one leaves no list.
  removeRule(it, 1);
  assert.deepEqual(it.rules.map(eventOf), ['transition:approve', 'enter:draft', 'create']);
  removeRule(it, 5);
  removeRule(it, 0);
  removeRule(it, 0);
  removeRule(it, 0);
  assert.equal('rules' in it, false);
});
