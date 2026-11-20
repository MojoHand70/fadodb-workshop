// Design mode, trying a class before it is saved: the class as the
// text stands, on a new document. Dan, a designer, in front of a real
// FadoDB server, which works the document out and writes nothing.

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

/** @param {string} name */
const held = async (name) => (await server.exec('get_class', { name })).class;

/**
 * Waits until the page has asked the server about the values the form
 * holds, and says so.
 *
 * @param {import('playwright').Page} page
 * @param {string} [holding] a text the values asked about must hold
 */
async function tried(page, holding = '') {
  await page.waitForFunction((part) => (document.getElementById('try')?.dataset.tried ?? null)?.includes(part) === true, holding);
}

/** The ways out the answer shows: the name of the transition, whether it is open, and its line. */
/** @param {import('playwright').Page} page */
const ways = (page) => page.locator('#try-ways li').evaluateAll((all) => all.map((one) => [one.getAttribute('data-transition'), one.getAttribute('data-open'), one.textContent]));

test('Dan tries a class he has changed and not saved: a taxi for 199.99 PLN', async () => {
  await aClass('Tried');
  const { context, page, wrong } = await atTheLists('Tried', '&variable=vat');
  // He rounds the VAT to whole units, and does not save.
  await writeFormula(page, '#v-formula', 'ROUND(net * vat_rate, 0)');
  assert.ok(await page.locator('#class-changed').isVisible());
  await page.click('#as-try');
  await tried(page);
  assert.equal(await page.locator('#as-try').getAttribute('aria-pressed'), 'true');
  assert.equal(new URL(page.url()).searchParams.get('as'), 'try');
  assert.ok(await page.locator('#lists').isHidden());

  // With nothing given, the document is as the class begins it, and the server says what it lacks.
  assert.equal(await page.locator('#try-said').innerText(), 'Tried. The server would not keep this document yet; it wrote nothing.');
  assert.deepEqual(await page.locator('#try-missing li').evaluateAll((all) => all.map((one) => [one.getAttribute('data-variable'), one.textContent])), [['what', 'what is required']]);
  assert.match(await page.locator('#t-bought_on-first').innerText(), /^Left empty, it begins as \d{1,2} \w{3} \d{4}\.$/);
  assert.equal(await page.locator('#t-vat_rate-first').innerText(), 'Left empty, it begins as 23%.');
  assert.equal(await page.locator('#t-note-first').innerText(), '');
  assert.equal(await page.locator('#try-state').innerText(), 'Draft');
  assert.deepEqual(await ways(page), [['submit', 'false', 'Submit, to Waiting for approval: closed, its condition does not hold']]);

  // He gives it what a taxi costs.
  await page.fill('#t-what', 'Taxi');
  await page.fill('#t-net', '199.99');
  await page.fill('#t-net-currency', 'PLN');
  await tried(page, '199.99 PLN');
  assert.equal(await page.locator('#t-vat-value').innerText(), '46.00\u00a0PLN', 'worked out by the formula he wrote and has not saved');
  assert.equal(await page.locator('#t-total-value').innerText(), '245.99\u00a0PLN');
  assert.equal(await page.locator('#t-needs_director-value').innerText(), 'No');
  assert.equal(await page.locator('#t-net-first').innerText(), '', 'a field he filled says nothing of a first value');
  assert.equal(await page.locator('#try-title').innerText(), 'Taxi');
  assert.equal(await page.locator('#try-missing').count(), 0);
  assert.deepEqual(await ways(page), [['submit', 'true', 'Submit, to Waiting for approval: open']]);
  assert.equal(await page.locator('#try-said').innerText(), 'Tried: the server would take this document. It wrote nothing.');

  // Nothing was written: the server holds the class as it was, and no document.
  const now = await held('Tried');
  assert.equal(now.version, 1);
  assert.equal(now.definition.variables.vat.formula, expense.variables.vat.formula);
  assert.equal((await server.exec('count', { class: 'Tried' })).count, 0);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a value the page cannot read, and one the server does not take, are said under their fields', async () => {
  await aClass('Refused');
  const { context, page, wrong, commands } = await atTheLists('Refused', '&as=try');
  await tried(page);
  await page.fill('#t-net', '100');
  await page.fill('#t-net-currency', 'PLN');
  await tried(page, '100 PLN');
  assert.equal(await page.locator('#t-vat-value').innerText(), '23.00\u00a0PLN');
  commands.length = 0;

  // What is no number is not sent at all, and what the earlier try worked out is taken away: it is not what would come of this.
  await page.fill('#t-net', 'a lot');
  await tried(page);
  assert.equal(await page.locator('#t-net-why').innerText(), 'This is not a number.');
  assert.equal(await page.locator('#try-said').innerText(), 'Not tried: one field cannot be read.');
  assert.deepEqual(commands, [], 'the server was not asked about it');
  assert.equal(await page.locator('#try-result').innerText(), '');
  assert.equal(await page.locator('#t-vat-value').innerText(), '—');

  // A rate above what the class lets it be: the server says so, in its words, at the field.
  await page.fill('#t-net', '100');
  await tried(page, '100 PLN');
  assert.equal(await page.locator('#t-vat-value').innerText(), '23.00\u00a0PLN');
  await page.fill('#t-vat_rate', '50');
  await tried(page, 'vat_rate');
  assert.equal(await page.locator('#t-net-why').innerText(), '');
  assert.equal(await page.locator('#t-vat_rate-why').innerText(), '0.50 is above the maximum 0.23');
  assert.equal(await page.locator('#t-vat_rate').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#try-said').innerText(), 'Not tried: the server does not take one of the values.');
  assert.equal(await page.locator('#t-vat-value').innerText(), '—');

  // Put right, it is tried.
  await page.fill('#t-vat_rate', '8');
  await tried(page, 'vat_rate');
  assert.equal(await page.locator('#t-vat_rate-why').innerText(), '');
  assert.equal(await page.locator('#t-vat_rate').getAttribute('aria-invalid'), 'false');
  assert.equal(await page.locator('#t-vat-value').innerText(), '8.00\u00a0PLN');

  // Emptied again, the field gives no value: the class gives its own first value.
  await page.fill('#t-vat_rate', '');
  await tried(page, '100 PLN');
  assert.equal(await page.locator('#t-vat_rate-first').innerText(), 'Left empty, it begins as 23%.');
  assert.equal(await page.locator('#t-vat-value').innerText(), '23.00\u00a0PLN');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a class the server refuses, and a text that cannot be read, are not tried', async () => {
  await aClass('Broken');
  const { context, page, wrong } = await atTheLists('Broken', '&variable=vat');
  await writeFormula(page, '#v-formula', 'net * nothing');
  await page.click('#as-try');
  await tried(page);
  assert.equal(await page.locator('#try-said').innerText(), 'Not tried: the server refuses this class as it stands. Check says what to put right.');
  assert.equal(await page.locator('#try-result').innerText(), '');
  assert.equal(await page.locator('#t-what').count(), 1, 'the fields are there, for when it is put right');

  // Undo puts the formula back while the view is shown: the view begins again, and the class is tried.
  assert.equal(await press(page, 'undo'), 'Taken back.');
  await tried(page);
  assert.equal(await page.locator('#try-state').innerText(), 'Draft');

  await page.click('#as-text');
  await page.locator('#class-text .cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('{"name": "Broken", "variables": {"a": {"type": "text"},}}');
  // The lists say that they show the class as it last could be read; the view that tries it says its own.
  await page.click('#as-lists');
  assert.ok(await page.locator('#lists-stale').isVisible());
  await page.click('#as-try');
  assert.equal(await page.locator('#try-said').innerText(), 'The text cannot be read as a class just now. Put it right under Text first.');
  assert.equal(await page.locator('#try-form').innerText(), '');
  assert.ok(await page.locator('#lists-stale').isHidden(), 'the view says it for itself');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what the class does by itself for a new document is shown, with the values it worked out', async () => {
  const definition = { ...structuredClone(expense), name: 'Lively' };
  definition.rules = [
    { on: 'create', do: [{ action: 'set', values: { note: '"made by " & USER()' } }, { action: 'emit', event: 'made' }] },
    { on: 'transition', name: 'approve', do: [{ action: 'set', values: { note: '"approved"' } }] },
    { on: 'create', if: 'net > 100000', do: [{ action: 'set', values: { cost_centre: '"board"' } }] },
  ];
  await server.exec('define_class', { definition });
  const { context, page, wrong } = await atTheLists('Lively', '&as=try');
  await tried(page);
  // Of three rules one runs: the second is about a transition, and the condition of the third does not hold.
  assert.deepEqual(await page.locator('#try-rules .rule').evaluateAll((all) => all.map((rule) => [rule.getAttribute('data-rule'), rule.querySelector('.rule-when')?.textContent, ...[...rule.querySelectorAll('li')].map((step) => step.textContent)])), [
    ['0', 'When a document is made', 'set note to made by dan', 'emit (event: made)'],
  ]);
  assert.equal(await page.locator('#t-note-first').innerText(), 'Left empty, it begins as made by dan.', 'what the rule set is what the document holds');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what was typed stays while Dan goes to the lists and back, and the form follows the text', async () => {
  await aClass('Kept');
  const { context, page, wrong } = await atTheLists('Kept', '&as=try');
  await tried(page);
  await page.fill('#t-what', 'Taxi');
  await page.fill('#t-net', '40');
  await page.fill('#t-net-currency', 'EUR');
  await page.fill('#t-cost_centre', 'Sales');
  await tried(page, 'Sales');

  // In the lists he takes the cost centre out of the class and adds a variable.
  await page.click('#as-lists');
  await page.locator('.var[data-variable="cost_centre"] .var-pick').click();
  await page.click('#v-remove');
  const adder = page.locator('[data-adds="purchase"]');
  await adder.locator('button').click();
  await adder.locator('input').fill('trip');
  await adder.locator('input').press('Enter');
  await page.locator('#v-label').waitFor();
  await page.click('#as-try');
  await tried(page, '40 EUR');
  assert.equal(await page.inputValue('#t-what'), 'Taxi');
  assert.equal(await page.inputValue('#t-net'), '40');
  assert.equal(await page.inputValue('#t-net-currency'), 'EUR');
  assert.equal(await page.locator('#t-trip').count(), 1, 'the new variable has its field');
  assert.equal(await page.locator('#t-cost_centre').count(), 0, 'and the one he took out has none');
  assert.equal(await page.locator('#t-total-value').innerText(), '49.20\u00a0EUR', 'what was typed for a variable the class no longer has is not sent');

  // Undo takes the variable back while the view is shown, and the view follows.
  assert.equal(await press(page, 'undo'), 'Taken back.');
  await tried(page, '40 EUR');
  assert.equal(await page.locator('#t-trip').count(), 0);
  assert.equal(await page.inputValue('#t-what'), 'Taxi');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('typed letter by letter, the document is asked of the server once, when the typing stops', async () => {
  await aClass('Patient');
  const { context, page, wrong, commands } = await atTheLists('Patient', '&as=try');
  await tried(page);
  commands.length = 0;
  await page.locator('#t-what').pressSequentially('A long way home', { delay: 15 });
  await tried(page, 'A long way home');
  assert.deepEqual(commands, ['preview_draft'], 'fifteen letters, one question');
  assert.equal(await page.locator('#try-title').innerText(), 'A long way home');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Jan, who is no designer, is offered no trying, by the page or by the address', async () => {
  await aClass('Closed');
  const { context, page, wrong, commands } = await atTheLists('Closed', '&as=try', jan);
  assert.ok(await page.locator('#as-try').isHidden());
  assert.ok(await page.locator('#try').isHidden());
  assert.ok(await page.locator('#lists').isVisible(), 'he is shown the lists');
  assert.equal(await page.locator('#as-lists').getAttribute('aria-pressed'), 'true');
  assert.ok(!commands.includes('preview_draft'));
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the view fits a phone and is worked by the keyboard', async () => {
  await aClass('Pocket');
  const { context, page, wrong } = await atTheLists('Pocket', '', dan, { width: 390, height: 844 });
  await page.locator('#as-try').focus();
  await page.keyboard.press('Enter');
  await tried(page);
  assert.ok(await fits(page));
  await page.locator('#t-what').focus();
  await page.keyboard.type('Taxi');
  await page.keyboard.press('Tab');
  await tried(page, 'Taxi');
  assert.equal(await page.locator('#try-title').innerText(), 'Taxi');
  assert.equal(await page.locator('#t-net').getAttribute('inputmode'), 'decimal');
  assert.equal(await page.locator('label[for="t-net"]').innerText(), 'Net amount');
  assert.equal(await page.locator('#t-net-currency').getAttribute('aria-label'), 'Currency of Net amount');
  assert.ok(await fits(page));
  assert.deepEqual(wrong, []);
  await context.close();
});
