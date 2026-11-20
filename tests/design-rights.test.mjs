// Design mode, changing who may set and who may see single variables,
// state by state, through the lists. Dan, a designer, in front of a
// real FadoDB server.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acme, signIn } from './acme.mjs';
import { fits, formulaOf, launch, ready, watch, writeFormula } from './browser.mjs';

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
 * Waits until the page has asked the server about the formula a box
 * holds, and says so.
 *
 * @param {import('playwright').Page} page
 * @param {string} box
 * @param {string} formula
 */
async function checked(page, box, formula) {
  await page.waitForFunction(([selector, wanted]) => document.querySelector(selector)?.getAttribute('data-checked') === wanted, [box, formula]);
}

/** @param {string} name */
const held = async (name) => (await server.exec('get_class', { name })).class;

/** The block of the lines under a state; `*` is every state. */
/** @param {import('playwright').Page} page @param {string} state */
const lines = (page, state) => page.locator(`[data-rights="${state}"]`);

/** What the lines of a block are about, in their order. */
/** @param {import('playwright').Page} page @param {string} state */
const about = (page, state) => lines(page, state).locator('[data-what]').evaluateAll((all) => all.map((one) => one.getAttribute('data-what')));

/**
 * Adds a line through "Add a line" of a block, choosing what it is about.
 *
 * @param {import('playwright').Page} page
 * @param {string} state
 * @param {string} what
 */
async function addLine(page, state, what) {
  const adder = lines(page, state).locator('[data-adds-right]');
  await adder.getByRole('button', { name: 'Add a line' }).click();
  await adder.locator('select').selectOption(what);
  await adder.getByRole('button', { name: 'Add', exact: true }).click();
}

test('under a state, who may set and who may see single variables are formulas in boxes', async () => {
  await aClass('Lined');
  const { context, page, wrong } = await atTheLists('Lined', '&state=submitted');
  assert.deepEqual(await about(page, 'submitted'), ['*', 'note']);
  assert.equal(await formulaOf(page, '#r-submitted-0-write'), 'FALSE');
  assert.equal(await formulaOf(page, '#r-submitted-0-read'), '', 'the class says nothing of who may see: the box is empty');
  // The class writes this line the short way, as a list of groups. The box shows the formula it means.
  assert.equal(await formulaOf(page, '#r-submitted-note-write'), 'INGROUP("expense_approvers")');
  assert.equal(await page.locator('#r-submitted-note-write .cm-content').getAttribute('aria-label'), 'May set Note');
  assert.equal(await page.locator('#r-submitted-0-read .cm-content').getAttribute('aria-label'), 'May see every variable');
  assert.ok(await page.locator('#class-changed').isHidden(), 'looking changes nothing');

  // Typed in, put back as it was, and left: nothing is changed, and the short way the class wrote it stays.
  // By the keyboard alone, so that it is the box that tells the bar, and not a press of the mouse coming to its end.
  await page.locator('#r-submitted-note-write .cm-content').focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' ');
  assert.ok(await page.locator('#save').isEnabled(), 'while he types, Save is there');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Tab');
  assert.ok(await page.locator('#save').isDisabled(), 'and out of reach again once the box is left with what it had');
  assert.ok(await page.locator('#class-changed').isHidden());

  // Dan lets the directors see every variable here, and says who may see the note.
  await writeFormula(page, '#r-submitted-0-read', 'INGROUP("directors") OR CREATEDBY() = USER()');
  await writeFormula(page, '#r-submitted-note-read', 'INGROUP("expense_approvers")');
  assert.ok(await page.locator('#class-changed').isVisible());
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const now = (await held('Lined')).definition;
  assert.deepEqual(now.rights.submitted, {
    '*': { write: 'FALSE', read: 'INGROUP("directors") OR CREATEDBY() = USER()' },
    // The half of the line he did not touch stays as the class wrote it.
    note: { write: ['expense_approvers'], read: 'INGROUP("expense_approvers")' },
  });
  assert.deepEqual(now.rights.draft, expense.rights.draft, 'and nothing of another state changed');

  // The half he changes is written as the formula he wrote.
  await writeFormula(page, '#r-submitted-note-write', 'INGROUP("expense_approvers") OR INGROUP("directors")');
  assert.equal(await press(page, 'save'), 'Saved as version 3.');
  assert.deepEqual((await held('Lined')).definition.rights.submitted.note, { write: 'INGROUP("expense_approvers") OR INGROUP("directors")', read: 'INGROUP("expense_approvers")' });
  assert.deepEqual(wrong, []);
  await context.close();
});

test('"Add a line" offers what the class has and the state has no line for; the new line lets nobody set it', async () => {
  await aClass('Added');
  const { context, page, wrong } = await atTheLists('Added', '&state=submitted');
  const adder = lines(page, 'submitted').locator('[data-adds-right]');
  await adder.getByRole('button', { name: 'Add a line' }).click();
  assert.equal(await adder.locator('select').getAttribute('aria-label'), 'What the new line is about');
  assert.deepEqual(
    await adder.locator('option').evaluateAll((all) => all.map((one) => [one.getAttribute('value'), one.textContent])),
    [
      ['purchase', 'The section The purchase'],
      ['amounts', 'The section Amounts'],
      ['what', 'what, What was bought'],
      ['bought_on', 'bought_on, Bought on'],
      ['cost_centre', 'cost_centre, Cost centre'],
      ['net', 'net, Net amount'],
      ['vat_rate', 'vat_rate, VAT rate'],
      ['vat', 'vat, VAT'],
      ['total', 'total, Total'],
      ['needs_director', 'needs_director, Needs the director'],
    ],
    'every variable and note have a line here already',
  );
  await adder.getByRole('button', { name: 'Cancel' }).click();
  assert.deepEqual(await about(page, 'submitted'), ['*', 'note']);

  await addLine(page, 'submitted', 'amounts');
  assert.equal(await page.locator('#said').innerText(), 'Added a line that lets nobody set it. Say who may.');
  assert.deepEqual(await about(page, 'submitted'), ['*', 'note', 'amounts']);
  assert.equal(await formulaOf(page, '#r-submitted-amounts-write'), 'FALSE');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.formula-box')?.id), 'r-submitted-amounts-write', 'the cursor is where he says who may');
  assert.equal(await lines(page, 'submitted').locator('.right-what').last().innerText(), 'Amounts amounts a section');

  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('INGROUP("accountants")');
  assert.equal(await press(page, 'save'), 'Saved as version 2.', 'what is typed and not left is taken by Save');
  assert.deepEqual((await held('Added')).definition.rights.submitted.amounts, { write: 'INGROUP("accountants")' });

  // Approved has no line at all: the block says so, and the first line makes one.
  await page.locator('.pick[data-state="approved"]').click();
  assert.equal(await lines(page, 'approved').locator('.right-none').innerText(), 'No line here, and none for every state: whoever may change a document may set every value in it.');
  await addLine(page, 'approved', '*');
  assert.equal(await formulaOf(page, '#r-approved-0-write'), 'FALSE');
  assert.equal(await lines(page, 'approved').locator('.right-none').count(), 0);
  assert.equal(await press(page, 'save'), 'Saved as version 3.');
  assert.deepEqual((await held('Added')).definition.rights.approved, { '*': { write: 'FALSE' } });
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a line is taken out by its button, or by emptying both its boxes; Undo puts it back', async () => {
  await aClass('Removed');
  const { context, page, wrong } = await atTheLists('Removed', '&state=submitted');
  await page.click('#r-submitted-note-remove');
  assert.equal(await page.locator('#said').innerText(), 'Removed the line about Note from the text. Undo puts it back.');
  assert.deepEqual(await about(page, 'submitted'), ['*']);
  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.deepEqual(await about(page, 'submitted'), ['*', 'note']);
  assert.equal(await formulaOf(page, '#r-submitted-note-write'), 'INGROUP("expense_approvers")');
  await page.click('#r-submitted-note-remove');

  // A line with nothing in it says nothing, and the server takes no such line: it is not kept in the text.
  await writeFormula(page, '#r-submitted-0-write', '');
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const now = (await held('Removed')).definition;
  assert.equal('submitted' in now.rights, false, 'the state has no line left, and is not in the table');
  assert.deepEqual(now.rights.draft, expense.rights.draft);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what is typed in a box is taken when another line is removed at once', async () => {
  await aClass('Quick');
  const { context, page, wrong } = await atTheLists('Quick', '&state=submitted');
  await page.locator('#r-submitted-0-write .cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('INGROUP("accountants")');
  // No Tab, no Enter: the next thing he does is press a button.
  await page.click('#r-submitted-note-remove');
  assert.deepEqual(await about(page, 'submitted'), ['*']);
  assert.equal(await formulaOf(page, '#r-submitted-0-write'), 'INGROUP("accountants")');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Quick')).definition.rights.submitted, { '*': { write: 'INGROUP("accountants")' } });
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a line removed while its own box holds something typed stays removed', async () => {
  await aClass('Gone');
  const { context, page, wrong } = await atTheLists('Gone', '&state=submitted');
  await page.locator('#r-submitted-note-write .cm-content').focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('INGROUP("directors")');
  // A tool that helps a person may press a button without the cursor leaving the box.
  await page.locator('#r-submitted-note-remove').evaluate((button) => /** @type {HTMLElement} */ (button).click());
  assert.deepEqual(await about(page, 'submitted'), ['*'], 'what was typed in the line does not bring the line back');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Gone')).definition.rights.submitted, { '*': { write: 'FALSE' } });
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the lines for every state are changed under The whole class, and read under a state', async () => {
  await aClass('Everywhere');
  const { context, page, wrong } = await atTheLists('Everywhere', '&state=');
  assert.equal(await lines(page, '*').locator('.right-none').innerText(), 'No line for every state. Where a state says nothing either, whoever may change a document may set every value in it.');
  await addLine(page, '*', 'total');
  assert.equal(await formulaOf(page, '#r-0-total-write'), 'FALSE');
  await writeFormula(page, '#r-0-total-read', 'INGROUP("accountants") OR CREATEDBY() = USER()');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Everywhere')).definition.rights['*'], { total: { write: 'FALSE', read: 'INGROUP("accountants") OR CREATEDBY() = USER()' } });

  // Under a state these lines are read, with the place they are changed at; the state's own are fields.
  await page.locator('.pick[data-state="approved"]').click();
  assert.equal(await lines(page, 'approved').locator('.right-none').innerText(), 'No line here: what is said for every state holds.');
  await page.locator('.pick[data-state="draft"]').click();
  assert.equal(await lines(page, '*').locator('.formula-box').count(), 0);
  assert.deepEqual(await lines(page, '*').locator('.line').evaluateAll((all) => all.map((one) => one.textContent)), ['may set itFALSE', 'may see itINGROUP("accountants") OR CREATEDBY() = USER()']);
  assert.match(await lines(page, '*').locator('.card-about').innerText(), /They are changed under The whole class\.$/);
  assert.equal(await formulaOf(page, '#r-draft-0-write'), 'CREATEDBY() = USER()');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a formula the server refuses is marked in its own box, and said under it', async () => {
  await aClass('Wrong');
  const { context, page, wrong } = await atTheLists('Wrong', '&state=submitted');
  // By the keyboard alone: it is the typing that must make Save available, not a press of the mouse coming to its end.
  await page.locator('#r-submitted-note-write .cm-content').focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('INGROUP("expense_approvers") AND nothing');
  assert.ok(await page.locator('#save').isEnabled(), 'what is typed is work: Save is there before the box is left');
  await checked(page, '#r-submitted-note-write', 'INGROUP("expense_approvers") AND nothing');
  assert.equal(await page.locator('#r-submitted-note-write-why').innerText(), 'unknown variable nothing');
  assert.deepEqual(await page.locator('#r-submitted-note-write .cm-lintRange-error').evaluateAll((all) => all.map((mark) => mark.textContent)), ['nothing']);
  assert.equal(await page.locator('#r-submitted-0-write-why').innerText(), '');
  assert.equal(await page.locator('#r-submitted-note-read-why').innerText(), '');
  // Save says it too, and nothing is saved.
  assert.equal(await press(page, 'save'), 'Not saved: one thing to put right.');
  assert.equal((await held('Wrong')).version, 1);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Jan, who is no designer, reads the lines as words', async () => {
  await aClass('Read');
  const { context, page, wrong } = await atTheLists('Read', '&state=submitted', jan);
  assert.equal(await lines(page, 'submitted').locator('.formula-box, [data-adds-right], button').count(), 0);
  assert.deepEqual(await lines(page, 'submitted').locator('.line').evaluateAll((all) => all.map((one) => one.textContent)), ['may set itFALSE', 'may set itanybody in expense_approvers']);
  await page.locator('.pick[data-state="approved"]').click();
  assert.equal(await lines(page, 'approved').count(), 0, 'a state with no line shows no empty block to somebody who cannot add one');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the lines fit a phone and are worked by the keyboard', async () => {
  await aClass('Pocket');
  const { context, page, wrong } = await atTheLists('Pocket', '&state=submitted', dan, { width: 390, height: 844 });
  assert.ok(await fits(page));
  const adder = lines(page, 'submitted').locator('[data-adds-right]');
  await adder.getByRole('button', { name: 'Add a line' }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SELECT', 'the list to choose from has the cursor');
  await adder.locator('select').selectOption('total');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await formulaOf(page, '#r-submitted-total-write'), 'FALSE');
  assert.ok(await fits(page), 'nor do the boxes of a line push the page sideways');
  assert.deepEqual(wrong, []);
  await context.close();
});
