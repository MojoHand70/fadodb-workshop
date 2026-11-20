// Design mode, changing a class through the lists: the class's own
// words and lines, its states, and the transitions between them. Dan,
// a designer, in front of a real FadoDB server.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acme, signIn } from './acme.mjs';
import { fits, launch, ready, watch } from './browser.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {{ url: string }} */
let site;
/** @type {import('playwright').Browser} */
let browser;
/** The class Expense as its fixture writes it. */
/** @type {any} */
let expense;
/** What a browser holds once Dan, and once Jan, has signed in. */
/** @type {Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>} */
let dan;
/** @type {Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>} */
let jan;

before(async () => {
  server = await acme();
  expense = JSON.parse(await readFile(new URL('./fixtures/expense.json', import.meta.url), 'utf8'));
  site = server.site;
  browser = await launch();
  for (const who of ['dan', 'jan']) {
    const context = await browser.newContext();
    await signIn(await context.newPage(), site, server, who);
    const held = await context.storageState();
    if (who === 'dan') dan = held;
    else jan = held;
    await context.close();
  }
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * A class of its own for a test: Expense under another name.
 *
 * @param {string} name
 * @returns {Promise<any>} its definition
 */
async function aClass(name) {
  const definition = { ...structuredClone(expense), name };
  await server.exec('define_class', { definition });
  return definition;
}

/**
 * Somebody opens the lists of a class.
 *
 * @param {string} name
 * @param {string} [more] more of the address
 * @param {typeof dan} [who]
 * @param {{ width: number, height: number }} [viewport]
 */
async function atTheLists(name, more = '', who = dan, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ storageState: who, viewport, locale: 'en-GB', timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await page.goto(`${site.url}design.html?class=${name}${more}`);
  await ready(page);
  return { context, page, ...seen };
}

/**
 * Presses a button of the bar and waits until the page says what came of it.
 *
 * @param {import('playwright').Page} page
 * @param {'check' | 'save' | 'discard' | 'undo'} button
 */
async function press(page, button) {
  await page.evaluate(() => (/** @type {HTMLElement} */ (document.getElementById('said')).textContent = ''));
  await page.click(`#${button}`);
  await page.waitForFunction(() => document.getElementById('said')?.textContent !== '');
  return page.locator('#said').innerText();
}

/**
 * Types in a field and leaves it.
 *
 * @param {import('playwright').Page} page
 * @param {string} field
 * @param {string} text
 */
async function type(page, field, text) {
  await page.fill(field, text);
  await page.press(field, 'Tab');
}

/** @param {string} name */
const held = async (name) => (await server.exec('get_class', { name })).class;

/** @param {import('playwright').Page} page @param {string} state */
const pick = (page, state) => page.locator(`.pick[data-state="${state}"]`);

/** @param {import('playwright').Page} page @param {string} name */
const way = (page, name) => page.locator(`.way[data-transition="${name}"]`);

/** The lines "what: answer" of a block, as two texts each. */
/** @param {import('playwright').Locator} box */
const linesOf = (box) => box.locator('.line').evaluateAll((all) => all.map((one) => [one.querySelector('.line-what')?.textContent ?? '', one.querySelector('.line-answer')?.textContent ?? '']));

/** @param {import('playwright').Page} page */
const findings = (page) => page.locator('#findings .finding').evaluateAll((all) => all.map((one) => [one.querySelector('.finding-go')?.textContent ?? '', one.getAttribute('data-path') ?? '']));

test('Dan changes the words of the class and the four lines that say who may', async () => {
  const definition = await aClass('Owned');
  const { context, page, wrong, commands } = await atTheLists('Owned', '&state=');
  assert.equal(await page.locator('#about-title').innerText(), 'The whole class');
  assert.equal(await page.inputValue('#c-label'), 'Expense');
  assert.equal(await page.inputValue('#c-plural'), '');
  assert.equal(await page.inputValue('#c-description'), definition.description);
  assert.equal(await page.inputValue('#c-title'), 'what');
  commands.length = 0;

  await type(page, '#c-label', 'Expense claim');
  await type(page, '#c-plural', 'Expense claims');
  await type(page, '#c-description', 'What an employee asks to be paid back.');
  await type(page, '#c-title', '"Claim: " & what');
  await type(page, '#c-delete', 'CREATEDBY() = USER() AND STATE() = "draft"');
  assert.ok(await page.locator('#class-changed').isVisible());
  assert.equal(await page.locator('#class-title').innerText(), 'Expense', 'the heading shows the class the server holds, until it is saved');
  assert.deepEqual(commands, [], 'nothing of this reaches the server');

  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.equal(await page.locator('#class-title').innerText(), 'Expense claim');
  const next = structuredClone(definition);
  next.label = 'Expense claim';
  next.plural = 'Expense claims';
  next.description = 'What an employee asks to be paid back.';
  next.title = '"Claim: " & what';
  next.access.delete = 'CREATEDBY() = USER() AND STATE() = "draft"';
  assert.deepEqual((await held('Owned')).definition, next);

  // An empty line is a line left out: nobody is let through, and the server notes it.
  await type(page, '#c-read', '');
  assert.equal(await press(page, 'check'), 'Checked: the server takes it, with one note.');
  assert.match(await page.locator('#notes .finding-go').innerText(), /^Owned has no read rule/);
  assert.equal(await press(page, 'save'), 'Saved as version 3.');
  assert.equal('read' in (await held('Owned')).definition.access, false);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Dan changes a state: its label, what a document waits for, where one starts and where one ends', async () => {
  const definition = await aClass('Staged');
  const { context, page, wrong } = await atTheLists('Staged', '&state=submitted');
  assert.equal(await page.inputValue('#s-label'), 'Waiting for approval');
  assert.equal(await page.inputValue('#s-description'), definition.states.descriptions.submitted);
  assert.equal(await page.isChecked('#s-final'), false);
  assert.equal(await page.locator('#s-initial').innerText(), 'Start new documents here');

  await type(page, '#s-label', 'With the approver');
  assert.equal(await pick(page, 'submitted').locator('.pick-label').innerText(), 'With the approver');
  assert.equal(await pick(page, 'submitted').getAttribute('aria-pressed'), 'true', 'it stays the chosen one');
  assert.equal(await page.locator('#about-title').innerText(), 'With the approver');
  await type(page, '#s-description', 'An approver decides.');

  await page.check('#s-final');
  assert.deepEqual(await pick(page, 'submitted').locator('.tag').evaluateAll((all) => all.map((t) => t.textContent)), ['final']);
  await page.uncheck('#s-final');
  assert.equal(await pick(page, 'submitted').locator('.tag').count(), 0);

  await page.click('#s-initial');
  assert.deepEqual(await pick(page, 'submitted').locator('.tag').evaluateAll((all) => all.map((t) => t.textContent)), ['a new document starts here']);
  assert.equal(await pick(page, 'draft').locator('.tag').count(), 0);
  assert.equal(await page.locator('#s-initial').count(), 0);
  assert.equal(await page.locator('.starts-here').innerText(), 'A new document starts here.');
  assert.equal(await page.inputValue('#s-label'), 'With the approver', 'the fields keep what they hold');

  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const next = structuredClone(definition);
  next.states.initial = 'submitted';
  next.states.labels.submitted = 'With the approver';
  next.states.descriptions.submitted = 'An approver decides.';
  assert.deepEqual((await held('Staged')).definition, next);

  // An emptied label leaves the name to stand for the state.
  await type(page, '#s-label', '');
  assert.equal(await pick(page, 'submitted').locator('.pick-label').innerText(), 'submitted');
  assert.equal(await press(page, 'save'), 'Saved as version 3.');
  assert.equal('submitted' in (await held('Staged')).definition.states.labels, false);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what is typed for a state is taken when Dan presses another state at once', async () => {
  await aClass('Hasty');
  const { context, page, wrong } = await atTheLists('Hasty', '&state=submitted');
  await page.fill('#s-label', 'Typed, then another state');
  await pick(page, 'approved').click();
  assert.equal(await page.locator('#about-title').innerText(), 'Approved', 'the press on the other state was not lost');
  assert.equal(await pick(page, 'submitted').locator('.pick-label').innerText(), 'Typed, then another state', 'nor what he had typed');
  assert.equal(await page.inputValue('#s-label'), 'Approved');

  await page.fill('#s-description', 'Typed, then a way out.');
  await way(page, 'pay').locator('.way-pick').click();
  assert.equal(await page.locator('#about-title').innerText(), 'Record payment');
  await page.fill('#m-label', 'Typed, then Back');
  await page.click('#m-back');
  assert.equal(await page.inputValue('#s-description'), 'Typed, then a way out.');
  assert.equal(await way(page, 'pay').locator('.way-label').innerText(), 'Typed, then Back');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Dan chooses a way out of a state and changes the transition', async () => {
  const definition = await aClass('Moving');
  const { context, page, wrong, commands } = await atTheLists('Moving', '&state=submitted');
  assert.match(await page.locator('#ways-out').innerText(), /Each is a transition\. Choose one to change it\./);
  commands.length = 0;
  await way(page, 'approve').locator('.way-pick').click();
  assert.equal(await page.locator('#about-title').innerText(), 'Approve');
  assert.match(await page.locator('#about-what').innerText(), /^A transition: a way out of Waiting for approval\./);
  assert.equal(await page.inputValue('#m-label'), 'Approve');
  assert.equal(await page.inputValue('#m-from'), 'submitted');
  assert.equal(await page.inputValue('#m-to'), 'approved');
  assert.equal(await page.inputValue('#m-description'), 'An approver who is not its author accepts it; above 5,000, a director.');
  assert.equal(await page.inputValue('#m-who'), definition.access.transition.approve, 'the formula whole');
  assert.equal(await page.inputValue('#m-guard'), '');
  assert.equal(await page.inputValue('#m-after'), '');
  assert.equal(await page.inputValue('#m-at'), '');
  assert.deepEqual(await page.locator('#m-to option').evaluateAll((all) => all.map((o) => o.textContent)), ['Draft', 'Waiting for approval', 'Approved', 'Paid']);
  assert.equal(await pick(page, 'submitted').getAttribute('aria-pressed'), 'true', 'the state it leaves stays chosen');
  assert.equal(new URL(page.url()).searchParams.get('move'), '3');
  assert.deepEqual(commands, []);

  await type(page, '#m-label', 'Accept');
  assert.equal(await page.locator('#about-title').innerText(), 'Accept');
  await type(page, '#m-guard', 'total < 100000');
  await type(page, '#m-who', 'INGROUP("expense_approvers") AND CREATEDBY() <> USER()');
  await type(page, '#m-after', '30d');

  // The address opens the same transition again, with what was typed still in the text.
  await page.click('#m-back');
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval');
  assert.equal(new URL(page.url()).searchParams.get('move'), null);
  assert.equal(await way(page, 'approve').locator('.way-head').innerText(), 'Accept approve to Approved');
  assert.deepEqual(await linesOf(way(page, 'approve')), [
    ['may take it', 'INGROUP("expense_approvers") AND CREATEDBY() <> USER()'],
    ['only when', 'total < 100000'],
    ['by itself', '30d after the document entered this state'],
  ]);

  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const next = structuredClone(definition);
  next.transitions[3] = { name: 'approve', from: 'submitted', to: 'approved', label: 'Accept', description: definition.transitions[3].description, guard: 'total < 100000', after: '30d' };
  next.access.transition.approve = 'INGROUP("expense_approvers") AND CREATEDBY() <> USER()';
  assert.deepEqual((await held('Moving')).definition, next);

  // With no line of its own a transition asks the line for changing; a guard and a time emptied are gone.
  await way(page, 'approve').locator('.way-pick').click();
  await type(page, '#m-who', '');
  await type(page, '#m-guard', '');
  await type(page, '#m-after', '');
  await page.selectOption('#m-to', 'paid');
  await page.click('#m-back');
  assert.equal(await way(page, 'approve').locator('.way-head').innerText(), 'Accept approve to Paid');
  assert.deepEqual(await linesOf(way(page, 'approve')), [['may take it', 'whoever may change the document: the class keeps no line for this move, so its line for changing is asked']]);
  assert.equal(await press(page, 'save'), 'Saved as version 3.');
  const then = (await held('Moving')).definition;
  assert.deepEqual(then.transitions[3], { name: 'approve', from: 'submitted', to: 'paid', label: 'Accept', description: definition.transitions[3].description });
  assert.equal('approve' in then.access.transition, false);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the address opens a transition, and a reload keeps it', async () => {
  await aClass('Linked');
  const { context, page, wrong } = await atTheLists('Linked', '&move=4');
  assert.equal(await page.locator('#about-title').innerText(), 'Record payment');
  assert.equal(await pick(page, 'approved').getAttribute('aria-pressed'), 'true', 'with the state it leaves chosen');
  assert.equal(await page.locator('#m-back').innerText(), 'Back to Approved');
  await page.reload();
  await ready(page);
  assert.equal(await page.inputValue('#m-label'), 'Record payment');

  // A place the class has no transition at opens none.
  const none = await atTheLists('Linked', '&move=40');
  assert.equal(await none.page.locator('#m-label').count(), 0);
  assert.equal(await none.page.locator('#about-title').innerText(), 'Draft');
  await none.context.close();
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Dan adds a way out: its name is asked of the server, and it opens at the side', async () => {
  const definition = await aClass('Wider');
  const { context, page, wrong, commands } = await atTheLists('Wider', '&state=submitted');
  const adder = page.locator('[data-adds-move="submitted"]');
  assert.equal(await adder.locator('button').innerText(), 'Add a way out');
  await adder.locator('button').click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'The name of the new transition');
  const why = adder.locator('.field-why');

  commands.length = 0;
  await page.keyboard.press('Enter');
  await why.filter({ hasText: /./ }).waitFor();
  assert.equal(await why.innerText(), 'Give the transition a name.');
  await adder.locator('input').fill('APPROVE');
  await page.keyboard.press('Enter');
  await why.filter({ hasText: /already/ }).waitFor();
  assert.equal(await why.innerText(), 'approve is a transition of this class already.');
  assert.deepEqual(commands, [], 'neither reaches the server');

  await adder.locator('input').fill('pass on');
  await page.keyboard.press('Enter');
  await why.filter({ hasText: /would not take/ }).waitFor();
  assert.equal(await why.innerText(), 'The server would not take it: a name is letters, digits and underscores: "pass on".');
  assert.equal(await page.locator('#ways-out .way').count(), 3, 'nothing was added');

  await adder.locator('input').fill('escalate');
  await page.keyboard.press('Enter');
  await page.locator('#m-label').waitFor();
  assert.equal(await page.locator('#about-title').innerText(), 'escalate');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'm-label', 'the cursor is in its label');
  assert.equal(await page.inputValue('#m-from'), 'submitted');
  assert.equal(await page.inputValue('#m-to'), 'approved', 'it leads to the next state, for him to change');
  assert.equal(new URL(page.url()).searchParams.get('move'), '5');

  await page.keyboard.type('Escalate');
  await type(page, '#m-description', 'An approver passes it to a director.');
  await type(page, '#m-who', 'INGROUP("expense_approvers")');
  await page.click('#m-back');
  assert.deepEqual(await page.locator('#ways-out .way').evaluateAll((all) => all.map((w) => w.getAttribute('data-transition'))), ['take_back', 'send_back', 'approve', 'escalate']);
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const next = structuredClone(definition);
  next.transitions.push({ name: 'escalate', from: 'submitted', to: 'approved', label: 'Escalate', description: 'An approver passes it to a director.' });
  next.access.transition.escalate = 'INGROUP("expense_approvers")';
  assert.deepEqual((await held('Wider')).definition, next);

  // Out of a final state a way leads back into it: a final state is left only for a final one.
  await pick(page, 'paid').click();
  await page.locator('[data-adds-move="paid"] button').click();
  await page.keyboard.type('archive');
  await page.keyboard.press('Enter');
  await page.locator('#m-label').waitFor();
  assert.equal(await page.inputValue('#m-from'), 'paid');
  assert.equal(await page.inputValue('#m-to'), 'paid');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Dan moves a transition to another state, and removes one with its line', async () => {
  const definition = await aClass('Rerouted');
  const { context, page, wrong } = await atTheLists('Rerouted', '&state=submitted');
  await way(page, 'send_back').locator('.way-pick').click();
  await page.selectOption('#m-from', 'approved');
  assert.equal(await pick(page, 'approved').getAttribute('aria-pressed'), 'true', 'the side follows it to the state it now leaves');
  assert.equal(await page.locator('#m-back').innerText(), 'Back to Approved');
  assert.equal(await page.inputValue('#m-label'), 'Send back');
  await page.click('#m-back');
  assert.deepEqual(await page.locator('#ways-out .way').evaluateAll((all) => all.map((w) => w.getAttribute('data-transition'))), ['send_back', 'pay']);

  await way(page, 'pay').locator('.way-pick').click();
  await page.evaluate(() => (/** @type {HTMLElement} */ (document.getElementById('said')).textContent = ''));
  await page.click('#m-remove');
  assert.equal(await page.locator('#said').innerText(), 'Removed the transition pay from the text, with the line that says who may take it. Undo puts it back.');
  assert.equal(await page.locator('#about-title').innerText(), 'Approved');
  assert.deepEqual(await page.locator('#ways-out .way').evaluateAll((all) => all.map((w) => w.getAttribute('data-transition'))), ['send_back']);
  assert.equal(new URL(page.url()).searchParams.get('move'), null);
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.', 'no line is left for a transition that is gone');

  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const next = structuredClone(definition);
  next.transitions[2].from = 'approved';
  next.transitions.splice(4, 1);
  delete next.access.transition.pay;
  assert.deepEqual((await held('Rerouted')).definition, next);

  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.deepEqual(await page.locator('#ways-out .way').evaluateAll((all) => all.map((w) => w.getAttribute('data-transition'))), ['send_back', 'pay']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Dan adds a state and removes one; the check names what still leads to it', async () => {
  const definition = await aClass('Regrown');
  const { context, page, wrong, commands } = await atTheLists('Regrown');
  const adder = page.locator('[data-adds-state]');
  assert.equal(await adder.locator('button').innerText(), 'Add a state');
  await adder.locator('button').click();
  const why = adder.locator('.field-why');
  commands.length = 0;
  await page.keyboard.press('Enter');
  await why.filter({ hasText: /./ }).waitFor();
  assert.equal(await why.innerText(), 'Give the state a name.');
  await adder.locator('input').fill('DRAFT');
  await page.keyboard.press('Enter');
  await why.filter({ hasText: /already/ }).waitFor();
  assert.equal(await why.innerText(), 'draft is a state of this class already.');
  assert.deepEqual(commands, []);
  await adder.locator('input').fill('on hold');
  await page.keyboard.press('Enter');
  await why.filter({ hasText: /would not take/ }).waitFor();
  assert.equal(await why.innerText(), 'The server would not take it: a name is letters, digits and underscores: "on hold".');

  await adder.locator('input').fill('archived');
  await page.keyboard.press('Enter');
  await pick(page, 'archived').waitFor();
  assert.deepEqual(await page.locator('#states .pick').evaluateAll((all) => all.map((b) => b.getAttribute('data-state'))), ['', 'draft', 'submitted', 'approved', 'paid', 'archived']);
  assert.equal(await pick(page, 'archived').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#about-title').innerText(), 'archived');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 's-label');
  await page.keyboard.type('Archived');
  await type(page, '#s-description', 'Put away. Nothing happens to it.');
  await page.check('#s-final');
  assert.match(await page.locator('#ways-out').innerText(), /None\. This state is final/);
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const next = structuredClone(definition);
  next.states.list.push('archived');
  next.states.final = ['paid', 'archived'];
  next.states.labels.archived = 'Archived';
  next.states.descriptions.archived = 'Put away. Nothing happens to it.';
  assert.deepEqual((await held('Regrown')).definition, next);

  // Removing a state takes what is its own; the moves that name it are for him to see to.
  await pick(page, 'submitted').click();
  await page.evaluate(() => (/** @type {HTMLElement} */ (document.getElementById('said')).textContent = ''));
  await page.click('#s-remove');
  assert.equal(await page.locator('#said').innerText(), 'Removed the state submitted from the text. Check says which transitions still name it; Undo puts it back.');
  assert.deepEqual(await page.locator('#states .pick').evaluateAll((all) => all.map((b) => b.getAttribute('data-state'))), ['', 'draft', 'approved', 'paid', 'archived']);
  assert.equal(await page.locator('#about-title').innerText(), 'The whole class');
  const said = await press(page, 'check');
  const found = await findings(page);
  assert.equal(said, `Checked: ${found.length} things to put right.`);
  assert.deepEqual(found.slice(0, 4), [
    ['unknown state "submitted"', '/transitions/0/to'],
    ['unknown state "submitted"', '/transitions/1/from'],
    ['unknown state "submitted"', '/transitions/2/from'],
    ['unknown state "submitted"', '/transitions/3/from'],
  ]);
  assert.deepEqual(found.filter(([, path]) => path.startsWith('/states/') || path.startsWith('/rights/')), [], 'its label, its description and its rights went with it: only the moves are named');
  assert.equal((await held('Regrown')).version, 2);
  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.equal(await pick(page, 'submitted').count(), 1);
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a transition that leaves several states, and one with no name, are shown for what they are', async () => {
  await server.exec('define_class', {
    definition: {
      name: 'Odd',
      label: 'Odd',
      description: 'A class with transitions of the rarer kinds.',
      variables: { amount: { type: 'number', label: 'Amount', description: 'How much.' } },
      states: { initial: 'open', list: ['open', 'held', 'shut'], final: ['shut'], descriptions: { open: 'Open.', held: 'Held.', shut: 'Shut.' } },
      transitions: [
        { name: 'shut', from: ['open', 'held'], to: 'shut', label: 'Shut', description: 'Somebody shuts it.' },
        { from: 'open', to: 'held', guard: 'amount > 1000' },
      ],
      access: { read: 'TRUE', create: 'TRUE', update: 'TRUE', delete: 'FALSE' },
    },
  });
  const { context, page, wrong } = await atTheLists('Odd');
  assert.deepEqual(await page.locator('#ways-out .way-label').evaluateAll((all) => all.map((w) => w.textContent)), ['Shut', 'with no name']);
  await page.locator('#ways-out .way-pick').first().click();
  assert.equal(await page.locator('#m-from').count(), 0);
  assert.match(await page.locator('#m-from-several').innerText(), /open, held/);
  assert.match(await page.locator('#m-from-several').innerText(), /changed in the text/);
  assert.match(await page.locator('#about-what').innerText(), /a way out of open and held/);

  await page.click('#m-back');
  await page.locator('#ways-out .way-pick').nth(1).click();
  assert.equal(await page.locator('#about-title').innerText(), 'A transition with no name');
  assert.match(await page.locator('#about').innerText(), /the engine makes this move by itself when its condition holds/);
  assert.equal(await page.locator('#m-who').count(), 0, 'nobody takes it, so no line says who may');
  assert.equal(await page.inputValue('#m-guard'), 'amount > 1000');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Jan, who is no designer, changes no state and opens no transition', async () => {
  await aClass('Shut');
  const { context, page, wrong } = await atTheLists('Shut', '&move=3', jan);
  assert.equal(await page.locator('#about-title').innerText(), 'Draft');
  assert.equal(await page.locator('#m-label, #s-label, #s-remove, #c-label').count(), 0);
  assert.equal(await page.locator('.way-pick').count(), 0);
  assert.equal(await page.locator('.adder').count(), 0);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a state and a transition are changed at a phone\'s width and by the keyboard', async () => {
  await aClass('Small2');
  const { context, page, wrong } = await atTheLists('Small2', '&state=submitted', dan, { width: 390, height: 844 });
  assert.ok(await fits(page), 'the fields of a state do not scroll sideways at 390 px');
  await way(page, 'approve').locator('.way-pick').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.inputValue('#m-label'), 'Approve');
  assert.ok(await fits(page), 'nor do the fields of a transition, with its longest formula');
  assert.ok(await page.locator('#about-card').evaluate((card) => card.getBoundingClientRect().top >= -1 && card.getBoundingClientRect().top < innerHeight / 2), 'the card is brought to the top of the window');
  await page.locator('#m-back').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval');
  assert.deepEqual(wrong, []);
  await context.close();
});
