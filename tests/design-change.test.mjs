// Design mode, changing a class through the lists: Dan, a designer,
// chooses a variable and changes it in the card at the side, adds one
// and removes one, in front of a real FadoDB server.

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
 * @param {typeof dan} [who]
 * @param {{ width: number, height: number }} [viewport]
 * @param {string} [more] more of the address
 */
async function atTheLists(name, who = dan, viewport = { width: 1280, height: 900 }, more = '') {
  const context = await browser.newContext({ storageState: who, viewport, locale: 'en-GB', timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await page.goto(`${site.url}design.html?class=${name}${more}`);
  await ready(page);
  return { context, page, ...seen };
}

/** @param {import('playwright').Page} page @param {string} name */
const row = (page, name) => page.locator(`.var[data-variable="${name}"]`);

/**
 * Dan chooses a variable by its head in the list.
 *
 * @param {import('playwright').Page} page
 * @param {string} name
 */
async function choose(page, name) {
  await row(page, name).locator('.var-pick').click();
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

/** @param {string} name */
const held = async (name) => (await server.exec('get_class', { name })).class;

/** The variables of a part of the outline, in their order. */
/** @param {import('playwright').Page} page @param {string} section */
const inSection = (page, section) => page.locator(`.part[data-section="${section}"] > .vars > .var`).evaluateAll((all) => all.map((v) => v.getAttribute('data-variable')));

test('Dan chooses a variable, and the side shows its properties as fields', async () => {
  await aClass('Shown');
  const { context, page, wrong, commands } = await atTheLists('Shown');
  assert.match(await page.locator('#variables-about').innerText(), /Choose a variable to change it at the side/);
  commands.length = 0;

  await choose(page, 'note');
  assert.equal(await row(page, 'note').locator('.var-pick').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.locator('#states .pick').evaluateAll((all) => all.map((b) => b.getAttribute('aria-pressed'))), ['false', 'false', 'false', 'false', 'false'], 'no state is chosen while a variable is');
  assert.equal(await page.locator('#about-title').innerText(), 'Note');
  assert.equal(await page.inputValue('#v-label'), 'Note');
  assert.equal(await page.inputValue('#v-description'), 'Anything the approver should know.');
  assert.ok(await page.isChecked('#v-given'));
  assert.equal(await page.inputValue('#v-type'), 'text');
  assert.equal(await page.isChecked('#v-required'), false);
  assert.equal(await formulaOf(page, '#v-default'), '');
  assert.equal(await page.inputValue('#v-values'), '');
  assert.equal(await page.isChecked('#v-list'), false);
  assert.equal(await page.inputValue('#v-section'), 'purchase');
  assert.equal(await page.locator('#v-min, #v-scale, #v-format, #v-formula').count(), 0, 'a text has no range, no decimal places, no pattern and no formula');
  assert.deepEqual(await page.locator('#v-type option').evaluateAll((all) => all.map((o) => o.textContent)), ['text', 'number', 'int', 'decimal', 'money', 'bool', 'date', 'datetime']);
  assert.deepEqual(await page.locator('#v-section option').evaluateAll((all) => all.map((o) => o.textContent)), ['In no section', 'The purchase', 'Amounts']);

  await choose(page, 'vat_rate');
  assert.equal(await page.inputValue('#v-type'), 'decimal');
  assert.equal(await formulaOf(page, '#v-default'), '0.23');
  assert.equal(await page.inputValue('#v-min'), '0');
  assert.equal(await page.inputValue('#v-max'), '0.23');
  assert.equal(await page.inputValue('#v-scale'), '2');
  assert.equal(await page.inputValue('#v-format'), '0%');
  assert.equal(await page.locator('#v-values').count(), 0);

  await choose(page, 'total');
  assert.ok(await page.isChecked('#v-computed'));
  assert.equal(await formulaOf(page, '#v-formula'), 'net + vat');
  assert.ok(await page.isChecked('#v-list'));
  assert.equal(await page.inputValue('#v-format'), '#,##0.00');
  assert.equal(await page.locator('#v-type, #v-required, #v-default').count(), 0, 'what the class works out has no type of its own, is not required and has no first value');

  // The address keeps the choice; choosing a state takes the side back.
  assert.equal(new URL(page.url()).searchParams.get('variable'), 'total');
  assert.equal(new URL(page.url()).searchParams.get('state'), null);
  await page.reload();
  await ready(page);
  assert.equal(await formulaOf(page, '#v-formula'), 'net + vat');
  await page.click('.pick[data-state="submitted"]');
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval');
  assert.equal(await page.locator('#v-label').count(), 0);
  assert.equal(await row(page, 'total').locator('.var-pick').getAttribute('aria-pressed'), 'false');
  assert.equal(new URL(page.url()).searchParams.get('variable'), null);
  assert.deepEqual(commands, ['whoami', 'get_class', 'list_functions', 'get_user'], 'choosing asks the server nothing: only the reload did');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('beside a long list the states stay in view, and the card of what is chosen opens at its top', async () => {
  await aClass('Tall');
  const { context, page, wrong } = await atTheLists('Tall', dan, { width: 1280, height: 700 });
  // Dan scrolls down the list, chooses the last variable, and scrolls down in its card.
  await choose(page, 'needs_director');
  assert.ok(await page.locator('#states-card').evaluate((card) => card.getBoundingClientRect().top >= 0 && card.getBoundingClientRect().bottom <= innerHeight), 'the states are in view beside the end of the list');
  assert.ok(await page.locator('#about-title').evaluate((title) => title.getBoundingClientRect().top >= 0 && title.getBoundingClientRect().bottom <= innerHeight), 'and so is the top of the card');
  await page.locator('#about-card').evaluate((card) => (card.scrollTop = card.scrollHeight));
  assert.ok((await page.locator('#about-card').evaluate((card) => card.scrollTop)) > 0, 'the card is longer than the window and scrolls by itself');

  // Another choice opens at the top again, whatever the card showed before.
  await choose(page, 'vat_rate');
  assert.equal(await page.locator('#about-card').evaluate((card) => card.scrollTop), 0);
  await page.locator('#about-card').evaluate((card) => (card.scrollTop = card.scrollHeight));
  await page.click('.pick[data-state="submitted"]');
  assert.equal(await page.locator('#about-card').evaluate((card) => card.scrollTop), 0);
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what Dan changes in the fields goes into the text at once, and is saved as the next version', async () => {
  const definition = await aClass('Changed');
  const { context, page, wrong, commands } = await atTheLists('Changed');
  await choose(page, 'note');
  commands.length = 0;

  await page.fill('#v-label', 'A note for the approver');
  await page.press('#v-label', 'Tab');
  assert.equal(await row(page, 'note').locator('.var-label').innerText(), 'A note for the approver');
  assert.equal(await page.locator('#about-title').innerText(), 'A note for the approver');
  assert.ok(await page.locator('#class-changed').isVisible());
  assert.equal(await page.locator('#save').innerText(), 'Save as version 2');

  await page.fill('#v-description', 'What the approver should know before deciding.');
  await page.check('#v-required');
  assert.equal(await row(page, 'note').locator('.var-kind').innerText(), 'text, required');
  await writeFormula(page, '#v-default', '"low"');
  await page.fill('#v-values', 'low,  normal , high');
  await page.press('#v-values', 'Tab');
  assert.equal(await row(page, 'note').locator('.var-kind').innerText(), 'text, required, one of low, normal, high, at first "low"');
  assert.equal(await row(page, 'note').locator('.var-about').innerText(), 'What the approver should know before deciding.');
  await page.check('#v-list');
  assert.deepEqual(await row(page, 'note').locator('.tag').evaluateAll((all) => all.map((t) => t.textContent)), ['in The List']);
  assert.deepEqual(commands.filter((command) => command !== 'validate_class'), [], 'the formula editor asks the server to check a formula, which writes nothing; nothing else is sent');
  assert.equal((await held('Changed')).version, 1);

  // The text holds the same class: the lists and the text are one thing.
  const next = structuredClone(definition);
  next.variables.note = { type: 'text', label: 'A note for the approver', description: 'What the approver should know before deciding.', required: true, default: '"low"', values: ['low', 'normal', 'high'], list: true };

  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const now = await held('Changed');
  assert.equal(now.version, 2);
  assert.deepEqual(now.definition, next);
  assert.deepEqual(Object.keys(now.definition.variables.note), ['type', 'label', 'description', 'required', 'default', 'values', 'list'], 'a word that was there keeps its place, a new one goes to the end');
  assert.ok(await page.locator('#class-changed').isHidden());

  // Emptying a field takes the word out of the class.
  await writeFormula(page, '#v-default', '');
  await page.uncheck('#v-required');
  await page.fill('#v-values', '');
  await page.press('#v-values', 'Tab');
  assert.equal(await row(page, 'note').locator('.var-kind').innerText(), 'text');
  assert.equal(await press(page, 'save'), 'Saved as version 3.');
  assert.deepEqual((await held('Changed')).definition.variables.note, { type: 'text', label: 'A note for the approver', description: 'What the approver should know before deciding.', list: true });
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a field typed in and not left is taken when Dan presses something else', async () => {
  await aClass('Pressed');
  const { context, page, wrong } = await atTheLists('Pressed');
  await choose(page, 'note');

  // He types and presses another variable: both happen.
  await page.fill('#v-label', 'Typed, then another row');
  await choose(page, 'total');
  assert.equal(await page.locator('#about-title').innerText(), 'Total', 'the press on the other variable was not lost');
  assert.equal(await row(page, 'note').locator('.var-label').innerText(), 'Typed, then another row', 'nor what he had typed');

  // He types and presses a state.
  await choose(page, 'note');
  await page.fill('#v-description', 'Typed, then a state.');
  await page.click('.pick[data-state="approved"]');
  assert.equal(await page.locator('#about-title').innerText(), 'Approved');
  assert.equal(await row(page, 'note').locator('.var-about').innerText(), 'Typed, then a state.');

  // He types and presses Save. The button must be the same button when
  // the mouse is released as when it was pressed: its words are not
  // written again while they stay the same. WebKit loses the press
  // otherwise, and only WebKit shows it; this holds it in every browser.
  await choose(page, 'what');
  await page.evaluate(() => (/** @type {any} */ (window).words = document.getElementById('save')?.firstChild));
  await page.fill('#v-label', 'Typed, then left');
  await page.press('#v-label', 'Tab');
  assert.ok(await page.evaluate(() => document.getElementById('save')?.firstChild === /** @type {any} */ (window).words), 'the words of Save were left alone');
  await page.fill('#v-label', 'Typed, then Save');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const now = (await held('Pressed')).definition;
  assert.equal(now.variables.what.label, 'Typed, then Save');
  assert.equal(now.variables.note.label, 'Typed, then another row');
  assert.equal(now.variables.note.description, 'Typed, then a state.');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what is typed in one field is kept when another is changed without the cursor leaving the first', async () => {
  // A program or a tool that helps a person may set a field without
  // moving the cursor. The side is then drawn again; what was typed
  // must not go with it.
  await aClass('Kept2');
  const { context, page, wrong } = await atTheLists('Kept2');
  await choose(page, 'note');
  await page.locator('#v-label').focus();
  await page.keyboard.type(' for the approver');
  await page.evaluate(() => {
    const type = /** @type {HTMLSelectElement} */ (document.getElementById('v-type'));
    type.value = 'date';
    type.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await page.inputValue('#v-label'), 'Note for the approver');
  assert.equal(await row(page, 'note').locator('.var-label').innerText(), 'Note for the approver');
  assert.equal(await row(page, 'note').locator('.var-kind').innerText(), 'date');
  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.equal(await row(page, 'note').locator('.var-label').innerText(), 'Note', 'each was a step of its own');
  assert.equal(await row(page, 'note').locator('.var-kind').innerText(), 'date');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Dan turns a value people give into one the class works out, and back', async () => {
  await aClass('Turned');
  const { context, page, wrong } = await atTheLists('Turned');
  await choose(page, 'cost_centre');
  await page.check('#v-computed');
  assert.equal(await formulaOf(page, '#v-formula'), '');
  assert.equal(await page.locator('#v-type, #v-required, #v-default, #v-values').count(), 0);
  assert.equal(await row(page, 'cost_centre').locator('.var-kind').innerText(), 'fx');

  // An empty formula is no formula to the server: it finds the variable
  // with neither a formula nor a type, and says so at the variable.
  assert.equal(await press(page, 'check'), 'Checked: one thing to put right.');
  assert.match((await page.locator('#findings .finding').getAttribute('data-path')) ?? '', /^\/variables\/cost_centre\//);

  await writeFormula(page, '#v-formula', 'UPPER(what)');
  assert.equal(await row(page, 'cost_centre').locator('.var-kind').innerText(), 'fx UPPER(what)');
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Turned')).definition.variables.cost_centre, { label: 'Cost centre', list: true, description: 'The part of the company that pays for it.', formula: 'UPPER(what)' });

  await page.check('#v-given');
  assert.equal(await page.inputValue('#v-type'), 'text');
  assert.equal(await page.locator('#v-formula').count(), 0);
  assert.equal(await row(page, 'cost_centre').locator('.var-kind').innerText(), 'text');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the type of a value decides which fields it has', async () => {
  await aClass('Typed');
  const { context, page, wrong } = await atTheLists('Typed');
  await choose(page, 'note');
  await page.selectOption('#v-type', 'money');
  assert.equal(await page.locator('#v-values').count(), 0, 'a list of values is for a text');
  await page.fill('#v-min', '0');
  await page.press('#v-min', 'Tab');
  await page.fill('#v-max', '100.50');
  await page.press('#v-max', 'Tab');
  await page.fill('#v-scale', '4');
  await page.press('#v-scale', 'Tab');
  await page.fill('#v-format', '#,##0.0000');
  await page.press('#v-format', 'Tab');
  assert.equal(await row(page, 'note').locator('.var-kind').innerText(), 'money, 4 places, 0 to 100.50');

  await choose(page, 'cost_centre');
  await page.selectOption('#v-type', 'int');
  await page.fill('#v-min', '1');
  await page.press('#v-min', 'Tab');
  assert.equal(await page.locator('#v-scale').count(), 0, 'a whole number has no decimal places');
  await page.selectOption('#v-type', 'bool');
  assert.equal(await page.locator('#v-min, #v-format').count(), 0);
  await page.selectOption('#v-type', 'int');
  assert.equal(await page.inputValue('#v-min'), '1', 'the word stays in the text while the type is tried');

  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const now = (await held('Typed')).definition.variables;
  assert.deepEqual(now.note, { type: 'money', label: 'Note', description: 'Anything the approver should know.', min: '0', max: '100.50', scale: 4, format: '#,##0.0000' }, 'an exact amount keeps the digits of its range as they were typed');
  assert.equal(now.cost_centre.min, 1, 'and a whole number has a number');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Dan adds a variable to a section: its name is asked of the server, and it opens at the side', async () => {
  const definition = await aClass('Grown');
  const { context, page, wrong, commands } = await atTheLists('Grown');
  assert.deepEqual(await page.locator('#variables .adder > button').evaluateAll((all) => all.map((b) => b.textContent)), ['Add a variable to The purchase', 'Add a variable to Amounts']);
  const adder = page.locator('[data-adds="purchase"]');
  await adder.locator('button').click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'The name of the new variable');
  const why = adder.locator('.field-why');

  commands.length = 0;
  await page.keyboard.press('Enter');
  await why.filter({ hasText: /./ }).waitFor();
  assert.equal(await why.innerText(), 'Give the variable a name.');
  await page.keyboard.type('NOTE');
  await page.keyboard.press('Enter');
  await why.filter({ hasText: /already/ }).waitFor();
  assert.equal(await why.innerText(), 'note is a variable of this class already.');
  assert.deepEqual(commands, [], 'neither reaches the server');

  await adder.locator('input').fill('paid on');
  await page.keyboard.press('Enter');
  await why.filter({ hasText: /would not take/ }).waitFor();
  assert.match(await why.innerText(), /^The server would not take it: .*paid on/);
  assert.equal(await inSection(page, 'purchase').then((all) => all.length), 4, 'nothing was added');

  await adder.locator('input').fill('paid_on');
  await page.keyboard.press('Enter');
  await row(page, 'paid_on').waitFor();
  assert.deepEqual(await inSection(page, 'purchase'), ['what', 'bought_on', 'cost_centre', 'note', 'paid_on'], 'at the end of its section');
  assert.equal(await row(page, 'paid_on').locator('.var-pick').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#about-title').innerText(), 'paid_on');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'v-label', 'and the cursor is in its label');
  assert.equal(await page.inputValue('#v-section'), 'purchase');
  assert.equal(await page.locator('[data-adds="purchase"] form').count(), 0, 'the small form is gone');

  await page.keyboard.type('Paid on');
  await page.selectOption('#v-type', 'date');
  await page.fill('#v-description', 'The day accounting paid it back.');
  await page.press('#v-description', 'Tab');
  assert.equal(await row(page, 'paid_on').locator('.var-kind').innerText(), 'date');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');

  const next = structuredClone(definition);
  next.variables.paid_on = { type: 'date', label: 'Paid on', description: 'The day accounting paid it back.' };
  next.sections.purchase.variables.push('paid_on');
  assert.deepEqual((await held('Grown')).definition, next);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a class with no sections has one place to add a variable, and Cancel adds nothing', async () => {
  await server.exec('define_class', {
    definition: { name: 'Plain', label: 'Plain', description: 'A class with no sections.', variables: { price: { type: 'number', label: 'Price', description: 'What it costs.' } } },
  });
  const { context, page, wrong } = await atTheLists('Plain');
  assert.deepEqual(await page.locator('#variables .adder > button').evaluateAll((all) => all.map((b) => b.textContent)), ['Add a variable']);
  await page.click('#variables .adder > button');
  await page.keyboard.type('cost');
  await page.click('.adder-form button:has-text("Cancel")');
  assert.equal(await page.locator('#variables .var').count(), 1);
  assert.equal(await page.locator('#variables .adder > button').innerText(), 'Add a variable');

  await page.click('#variables .adder > button');
  await page.keyboard.type('cost');
  await page.keyboard.press('Enter');
  await row(page, 'cost').waitFor();
  assert.equal(await page.locator('#v-section').count(), 0, 'no section to choose where the class has none');
  await page.selectOption('#v-type', 'number');
  await choose(page, 'price');
  assert.equal(await page.inputValue('#v-type'), 'number');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual(Object.keys((await held('Plain')).definition.variables), ['price', 'cost']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Dan removes a variable; the check says what still reads it, and Undo puts it back', async () => {
  await aClass('Shrunk');
  const { context, page, wrong } = await atTheLists('Shrunk');
  await choose(page, 'net');
  await page.evaluate(() => (/** @type {HTMLElement} */ (document.getElementById('said')).textContent = ''));
  await page.click('#v-remove');
  assert.equal(await page.locator('#said').innerText(), 'Removed net from the text. Check says what still reads it; Undo puts it back.');
  assert.equal(await row(page, 'net').count(), 0);
  assert.deepEqual(await inSection(page, 'amounts'), ['vat_rate', 'vat', 'total', 'needs_director']);
  assert.equal(await page.locator('#about-title').innerText(), 'Draft', 'the side goes back to the state it showed');
  assert.equal(new URL(page.url()).searchParams.get('variable'), null);

  const said = await press(page, 'check');
  assert.match(said, /^Checked: \d+ things to put right\.$/);
  const found = await page.locator('#findings .finding').evaluateAll((all) => all.map((one) => [one.querySelector('.finding-go')?.textContent ?? '', one.getAttribute('data-path') ?? '']));
  assert.deepEqual(found[0], ['unknown variable net', '/variables/vat/formula']);
  assert.equal((await held('Shrunk')).version, 1);

  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.deepEqual(await inSection(page, 'amounts'), ['net', 'vat_rate', 'vat', 'total', 'needs_director'], 'in its place again');
  assert.ok(await page.locator('#class-changed').isHidden(), 'the class is as the server holds it');
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Dan moves a variable to another section, and to none', async () => {
  const definition = await aClass('Moved');
  const { context, page, wrong } = await atTheLists('Moved');
  await choose(page, 'note');
  await page.selectOption('#v-section', 'amounts');
  assert.deepEqual(await inSection(page, 'purchase'), ['what', 'bought_on', 'cost_centre']);
  assert.deepEqual(await inSection(page, 'amounts'), ['net', 'vat_rate', 'vat', 'total', 'needs_director', 'note']);
  assert.equal(await row(page, 'note').locator('.var-pick').getAttribute('aria-pressed'), 'true', 'it stays chosen');

  await page.selectOption('#v-section', '');
  assert.deepEqual(await page.locator('#variables .part-title').evaluateAll((all) => all.map((t) => t.textContent)), ['In no section', 'The purchase purchase', 'Amounts amounts']);
  assert.equal(await page.locator('#variables .part').first().locator('.var').getAttribute('data-variable'), 'note');
  assert.deepEqual(await page.locator('#variables .adder > button').evaluateAll((all) => all.map((b) => b.textContent)), ['Add a variable', 'Add a variable to The purchase', 'Add a variable to Amounts']);

  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const next = structuredClone(definition);
  next.sections.purchase.variables = ['what', 'bought_on', 'cost_centre'];
  assert.deepEqual((await held('Moved')).definition, next);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Undo takes back one change at a time, and says when there is none', async () => {
  await aClass('Undone');
  const { context, page, wrong } = await atTheLists('Undone');
  await choose(page, 'note');
  await page.fill('#v-label', 'First change');
  await page.press('#v-label', 'Tab');
  await page.check('#v-required');
  assert.equal(await row(page, 'note').locator('.var-kind').innerText(), 'text, required');

  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.equal(await row(page, 'note').locator('.var-kind').innerText(), 'text');
  assert.equal(await row(page, 'note').locator('.var-label').innerText(), 'First change');
  assert.equal(await page.isChecked('#v-required'), false, 'the fields at the side follow');
  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.equal(await row(page, 'note').locator('.var-label').innerText(), 'Note');
  assert.equal(await page.inputValue('#v-label'), 'Note');
  assert.ok(await page.locator('#class-changed').isHidden());
  assert.equal(await press(page, 'undo'), 'There is nothing to take back.');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('while the text cannot be read as a class, the lists offer nothing to change', async () => {
  await aClass('Unread');
  const { context, page, wrong } = await atTheLists('Unread', dan, { width: 1280, height: 900 }, '&as=text');
  await page.locator('#class-text .cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('{"name": "Unread", "variables": {"a": {"type": "text"},}}');
  await page.click('#as-lists');
  assert.ok(await page.locator('#lists-stale').isVisible());
  assert.equal(await page.locator('.adder').count(), 0, 'nothing is added, to the variables, the states or the ways out');
  await choose(page, 'note');
  assert.equal(await page.locator('#v-label').count(), 0, 'a variable shows no fields');
  assert.equal(await page.locator('#about-title').innerText(), 'Draft');

  // Put right again, the lists change the class as before.
  assert.equal(await press(page, 'discard'), 'Put back as the server holds it.');
  assert.equal(await page.locator('#variables .adder').count(), 2);
  await choose(page, 'note');
  assert.equal(await page.inputValue('#v-label'), 'Note');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Jan, who is no designer, chooses nothing and adds nothing', async () => {
  await aClass('Closed');
  const { context, page, wrong } = await atTheLists('Closed', jan, { width: 1280, height: 900 }, '&variable=note');
  assert.equal(await page.locator('.var-pick').count(), 0);
  assert.equal(await page.locator('.adder').count(), 0);
  assert.equal(await page.locator('#v-label').count(), 0, 'nor does the address open a variable for him');
  assert.equal(await page.locator('#about-title').innerText(), 'Draft');
  assert.equal(await page.locator('#variables-about').innerText(), 'What each document holds, by the sections of the class. fx marks what the class works out.');
  assert.equal(await row(page, 'note').locator('.var-label').innerText(), 'Note');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the fields fit a phone, are worked by the keyboard, and hold what a class says as text', async () => {
  const trap = '<img src=x onerror="document.title=1">';
  await server.exec('define_class', {
    definition: {
      name: 'Narrow',
      label: 'Narrow',
      description: 'A class for a narrow window.',
      variables: { note: { type: 'text', label: trap, description: `${trap} and a description long enough to wrap at the width of a phone, twice over.`, default: `"${'x'.repeat(80)}"` } },
    },
  });
  const { context, page, wrong } = await atTheLists('Narrow', dan, { width: 390, height: 844 });
  await row(page, 'note').locator('.var-pick').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.inputValue('#v-label'), trap);
  assert.equal(await page.locator('#about-title').innerText(), trap);
  assert.equal(await page.locator('#design img:not(.cm-widgetBuffer)').count(), 0);
  assert.ok(await fits(page), 'the fields do not scroll sideways at 390 px');
  assert.ok(await page.locator('#about-card').evaluate((card) => card.getBoundingClientRect().top < innerHeight), 'the card of the chosen variable is brought into view');

  // Tab goes from the label through the fields; Space ticks a box.
  await page.locator('#v-label').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'v-description');
  await page.locator('#v-required').focus();
  await page.keyboard.press('Space');
  assert.equal(await row(page, 'note').locator('.var-kind').innerText(), `text, required, at first "${'x'.repeat(80)}"`);
  assert.ok(await fits(page));
  assert.equal(await page.title(), 'Design: Narrow · FadoDB Workshop');
  assert.deepEqual(wrong, []);
  await context.close();
});
