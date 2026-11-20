// Design mode, the formula editor: Dan, a designer, writes a formula of
// the class Expense with help, in front of a real FadoDB server that
// hands out its list of functions.

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
 * Puts the cursor in a formula box and selects what is there, so that
 * typing replaces it.
 *
 * @param {import('playwright').Page} page
 * @param {string} box
 */
async function into(page, box) {
  await page.locator(`${box} .cm-content`).click();
  await page.keyboard.press('ControlOrMeta+A');
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

/** The pieces of the formula in a box, each with its kind, as the box colours them. */
/** @param {import('playwright').Page} page @param {string} box */
const colours = (page, box) => page.locator(`${box} [class^="fx-"]`).evaluateAll((all) => all.map((piece) => `${piece.className.slice(3)}:${piece.textContent}`));

/** What the list of names offers, as its lines read. */
/** @param {import('playwright').Page} page */
const offered = (page) => page.locator('.cm-tooltip-autocomplete li').evaluateAll((all) => all.map((line) => line.textContent ?? ''));

/** @param {string} name */
const held = async (name) => (await server.exec('get_class', { name })).class;

test('a formula is shown in colours: functions, variables of the class, numbers, texts and words', async () => {
  await aClass('Coloured');
  const { context, page, wrong } = await atTheLists('Coloured', '&variable=vat');
  assert.equal(await formulaOf(page, '#v-formula'), 'ROUND(net * vat_rate, 2)');
  assert.deepEqual(await colours(page, '#v-formula'), ['function:ROUND', 'variable:net', 'sign:*', 'variable:vat_rate', 'number:2']);
  assert.equal(await page.locator('#v-formula .cm-content').getAttribute('aria-label'), 'Formula');
  assert.equal(await page.locator('#v-formula .cm-content').getAttribute('role'), 'textbox');

  // A name the class does not have is a name, and is not painted as a variable of it.
  await into(page, '#v-formula');
  await page.keyboard.insertText('IF(Net > 1000 AND nothing = "PLN", TRUE, false)');
  assert.deepEqual(await colours(page, '#v-formula'), ['function:IF', 'variable:Net', 'sign:>', 'number:1000', 'word:AND', 'name:nothing', 'sign:=', 'text:"PLN"', 'word:TRUE', 'word:false']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('as Dan types, the names that may be written are offered: the variables of the class and the engine\'s functions', async () => {
  await aClass('Offered');
  const { context, page, wrong, commands } = await atTheLists('Offered', '&variable=vat');
  assert.ok(commands.includes('list_functions'), 'the page asked the server what a formula can call');
  await into(page, '#v-formula');
  await page.keyboard.type('RO');
  await page.locator('.cm-tooltip-autocomplete').waitFor();
  const forRO = await offered(page);
  assert.equal(forRO[0], 'ROUND(number[, digits[, method]])', 'the function whose name begins so comes first, with its arguments');
  assert.ok(forRO.length < 20, 'only what fits what was typed');

  // Enter takes the offer: the name, and its bracket.
  await page.keyboard.press('Enter');
  assert.equal(await formulaOf(page, '#v-formula'), 'ROUND(');
  await page.locator('.cm-tooltip-autocomplete').waitFor({ state: 'detached' });

  // A variable is offered by its name, with its label beside it, before the functions.
  await page.keyboard.type('va');
  await page.locator('.cm-tooltip-autocomplete').waitFor();
  const forVa = await offered(page);
  assert.deepEqual(forVa.slice(0, 2), ['vatVAT', 'vat_rateVAT rate']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await formulaOf(page, '#v-formula'), 'ROUND(vat_rate');

  // A function with no argument is written with both its brackets; a function the engine has not built is not offered.
  await into(page, '#v-formula');
  await page.keyboard.type('TODA');
  await page.locator('.cm-tooltip-autocomplete').waitFor();
  await page.keyboard.press('Enter');
  assert.equal(await formulaOf(page, '#v-formula'), 'TODAY()');
  await into(page, '#v-formula');
  await page.keyboard.type('FIRST');
  await page.locator('.cm-tooltip-autocomplete').waitFor();
  assert.ok(!(await offered(page)).some((line) => line.startsWith('FIRST(')), 'FIRST is part of the language and not built: offering it would lead to a refusal');
  assert.ok((await offered(page)).some((line) => line.startsWith('FIRSTENTERED(')));
  assert.deepEqual(wrong, []);
  await context.close();
});

test('"Names" opens the whole list where the cursor is, for somebody who does not know what to type', async () => {
  await aClass('Listed');
  const { context, page, wrong } = await atTheLists('Listed', '&variable=vat');
  const names = page.locator('.field:has(#v-formula) .formula-names');
  assert.equal(await names.getAttribute('aria-label'), 'What may be written in Formula');
  await into(page, '#v-formula');
  await page.keyboard.press('Delete');
  await names.click();
  await page.locator('.cm-tooltip-autocomplete').waitFor();
  const all = await offered(page);
  assert.deepEqual(all.slice(0, 9).map((line) => line.replace(/[A-Z].*$/, '')), ['bought_on', 'cost_centre', 'needs_director', 'net', 'note', 'total', 'vat', 'vat_rate', 'what'], 'the variables of the class first');
  const { functions } = await server.exec('list_functions');
  const built = functions.filter((/** @type {any} */ f) => f.not_built !== true);
  assert.equal(all.length, 9 + built.length + 9, 'then every function the engine has built, then the words of the language');
  assert.ok(all.includes('TRUE') && all.includes('AND'));
  await page.keyboard.press('Escape');
  await page.locator('.cm-tooltip-autocomplete').waitFor({ state: 'detached' });
  assert.deepEqual(wrong, []);
  await context.close();
});

test('under the box, the function the cursor is in is told: its arguments, the one being written, and what it gives', async () => {
  await aClass('Helped');
  const { context, page, wrong } = await atTheLists('Helped', '&variable=vat');
  const help = page.locator('#v-formula-call');
  await into(page, '#v-formula');
  await page.keyboard.insertText('ROUND(');
  assert.equal(await help.locator('.formula-sig').innerText(), 'ROUND(number, digits (may be left out), method (may be left out))');
  assert.equal(await help.locator('.formula-arg').innerText(), 'number');
  assert.match(await help.innerText(), /Rounds to the given decimal places/);
  assert.match(await help.innerText(), /Gives: number\.$/);

  await page.keyboard.insertText('net * vat_rate, ');
  assert.equal(await help.locator('.formula-arg').innerText(), 'digits (may be left out)', 'past the comma the second argument is the one being written');
  await page.keyboard.insertText('ABS(');
  assert.equal(await help.locator('.formula-sig').innerText(), 'ABS(number)', 'the innermost call is the one told');
  await page.keyboard.insertText('2)');
  assert.equal(await help.locator('.formula-arg').innerText(), 'digits (may be left out)');
  await page.keyboard.insertText(')');
  assert.equal(await help.innerText(), '', 'outside every call there is nothing to tell');

  // The cursor moved back into the call brings its help back; leaving the box takes it away.
  await page.keyboard.press('ArrowLeft');
  assert.equal(await help.locator('.formula-sig').innerText(), 'ROUND(number, digits (may be left out), method (may be left out))');
  await page.keyboard.press('Tab');
  assert.equal(await help.innerText(), '');
  assert.equal(await page.locator('#v-formula .cm-content').getAttribute('aria-describedby'), 'v-formula-call v-formula-why v-formula-about');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a moment after the typing stops the server is asked, and what it finds is marked at its place', async () => {
  await aClass('Marked');
  const { context, page, wrong, commands } = await atTheLists('Marked', '&variable=vat');
  commands.length = 0;
  await into(page, '#v-formula');
  await page.keyboard.insertText('ROUND(net * vat_rat, 2)');
  assert.deepEqual(commands, [], 'not while he types');
  await checked(page, '#v-formula', 'ROUND(net * vat_rat, 2)');
  assert.deepEqual(commands, ['validate_class'], 'the server is asked once, and nothing is written');
  assert.equal(await page.locator('#v-formula-why').innerText(), 'unknown variable vat_rat');
  assert.deepEqual(await page.locator('#v-formula .cm-lintRange-error').evaluateAll((all) => all.map((mark) => mark.textContent)), ['vat_rat']);

  // The class is not changed by a check: the formula goes into it when Dan is done with the box.
  assert.ok(await page.locator('#class-changed').isHidden());
  assert.equal(await page.locator('.var[data-variable="vat"] .var-kind').innerText(), 'fx ROUND(net * vat_rate, 2)');

  // He puts it right; the mark and the words go.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('e');
  await checked(page, '#v-formula', 'ROUND(net * vat_rate, 2)');
  assert.equal(await page.locator('#v-formula-why').innerText(), '');
  assert.equal(await page.locator('#v-formula .cm-lintRange-error').count(), 0);

  // A formula that stops short is marked at its end; the place is counted past a letter of two bytes.
  await into(page, '#v-formula');
  await page.keyboard.insertText('net +');
  await checked(page, '#v-formula', 'net +');
  assert.equal(await page.locator('#v-formula-why').innerText(), 'unexpected end of formula');
  assert.deepEqual(await page.locator('#v-formula .cm-lintRange-error').evaluateAll((all) => all.map((mark) => mark.textContent)), ['+']);
  await into(page, '#v-formula');
  await page.keyboard.insertText('"Gdańsk" & nothing');
  await checked(page, '#v-formula', '"Gdańsk" & nothing');
  assert.deepEqual(await page.locator('#v-formula .cm-lintRange-error').evaluateAll((all) => all.map((mark) => mark.textContent)), ['nothing']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('typed letter by letter, a formula is asked of the server once, when the typing stops', async () => {
  await aClass('Patient');
  const { context, page, wrong, commands } = await atTheLists('Patient', '&variable=total');
  await into(page, '#v-formula');
  commands.length = 0;
  await page.keyboard.type('net + vat + 1', { delay: 15 });
  await checked(page, '#v-formula', 'net + vat + 1');
  assert.deepEqual(commands, ['validate_class'], 'thirteen letters, one question');
  assert.equal(await page.locator('#v-formula-why').innerText(), '');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Enter, or leaving the box, puts the formula into the class as one step', async () => {
  const definition = await aClass('Entered');
  const { context, page, wrong } = await atTheLists('Entered', '&variable=vat');
  await into(page, '#v-formula');
  await page.keyboard.insertText('ROUND(net * vat_rate, 4)');
  assert.ok(await page.locator('#class-changed').isHidden(), 'not yet');
  await page.keyboard.press('Enter');
  assert.ok(await page.locator('#class-changed').isVisible());
  assert.equal(await page.locator('.var[data-variable="vat"] .var-kind').innerText(), 'fx ROUND(net * vat_rate, 4)');
  assert.equal(await formulaOf(page, '#v-formula'), 'ROUND(net * vat_rate, 4)', 'Enter writes no new line: a formula is one line');

  // Typed and not left, it is taken when he presses Save.
  await into(page, '#v-formula');
  await page.keyboard.insertText('ROUND(net * vat_rate, 3)');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const next = structuredClone(definition);
  next.variables.vat.formula = 'ROUND(net * vat_rate, 3)';
  assert.deepEqual((await held('Entered')).definition, next);

  // Undo takes back the formula as one step, and the box follows.
  await writeFormula(page, '#v-formula', 'net');
  assert.equal(await page.locator('.var[data-variable="vat"] .var-kind').innerText(), 'fx net');
  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.equal(await page.locator('.var[data-variable="vat"] .var-kind').innerText(), 'fx ROUND(net * vat_rate, 3)');
  assert.equal(await formulaOf(page, '#v-formula'), 'ROUND(net * vat_rate, 3)');

  // A formula is one line: what comes in as several becomes one.
  await into(page, '#v-formula');
  await page.keyboard.insertText('IF(net > 0,\n   net,\n   0)');
  assert.equal(await formulaOf(page, '#v-formula'), 'IF(net > 0, net, 0)');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('every place a formula is written has the editor: a first value, a title, who may, a condition', async () => {
  await aClass('Everywhere');
  const { context, page, wrong } = await atTheLists('Everywhere', '&variable=bought_on');
  assert.deepEqual(await colours(page, '#v-default'), ['function:TODAY']);
  await into(page, '#v-default');
  await page.keyboard.insertText('ADDDAYS(');
  assert.match(await page.locator('#v-default-call .formula-sig').innerText(), /^ADDDAYS\(/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');

  await page.click('.pick[data-state=""]');
  assert.deepEqual(await colours(page, '#c-title'), ['variable:what']);
  assert.deepEqual((await colours(page, '#c-read')).slice(0, 4), ['function:CREATEDBY', 'sign:=', 'function:USER', 'word:OR']);
  await into(page, '#c-delete');
  await page.keyboard.insertText('INGROUP("accountants") AND no_such_thing');
  await checked(page, '#c-delete', 'INGROUP("accountants") AND no_such_thing');
  assert.equal(await page.locator('#c-delete-why').innerText(), 'unknown variable no_such_thing');
  assert.equal(await page.locator('#c-read-why').innerText(), '', 'what is said of one formula is said under that one');

  await page.click('.pick[data-state="submitted"]');
  await page.locator('.way[data-transition="approve"] .way-pick').click();
  assert.deepEqual((await colours(page, '#m-who')).slice(0, 2), ['function:INGROUP', 'text:"expense_approvers"']);
  await into(page, '#m-guard');
  await page.keyboard.insertText('total > ');
  await checked(page, '#m-guard', 'total > ');
  assert.equal(await page.locator('#m-guard-why').innerText(), 'unexpected end of formula');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the editor fits a phone and is worked by the keyboard', async () => {
  await aClass('Pocket');
  const { context, page, wrong } = await atTheLists('Pocket', '&state=submitted', dan, { width: 390, height: 844 });
  await page.locator('.way[data-transition="approve"] .way-pick').click();
  assert.ok(await fits(page), 'the longest formula of the class wraps inside its box at 390 px');
  assert.equal(await formulaOf(page, '#m-who'), expense.access.transition.approve);

  // The keyboard reaches the box, the list of names is walked with the arrows, and Escape shuts it.
  await page.locator('#m-guard .cm-content').focus();
  await page.keyboard.type('tot');
  await page.locator('.cm-tooltip-autocomplete').waitFor();
  assert.ok(await fits(page), 'nor does the list of names push the page sideways');
  assert.equal(await page.locator('.cm-tooltip-autocomplete li[aria-selected="true"]').innerText(), 'totalTotal');
  await page.keyboard.press('Escape');
  await page.locator('.cm-tooltip-autocomplete').waitFor({ state: 'detached' });
  assert.equal(await formulaOf(page, '#m-guard'), 'tot');
  await page.keyboard.press('Tab');
  assert.notEqual(await page.evaluate(() => document.activeElement?.className), 'cm-content', 'Tab leaves the box: it is a field, not a trap');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Jan, who is no designer, sees formulas as words and is asked for no list of functions', async () => {
  await aClass('Plainly');
  const { context, page, wrong, commands } = await atTheLists('Plainly', '&state=', jan);
  assert.equal(await page.locator('.formula-box, .formula-names').count(), 0);
  assert.ok(!commands.includes('list_functions'));
  assert.deepEqual(wrong, []);
  await context.close();
});
