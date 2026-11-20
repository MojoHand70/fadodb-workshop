// Design mode, changing the sections of a class through the lists:
// which variables belong together. Dan, a designer, in front of a real
// FadoDB server.

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

/** @param {string} name */
const held = async (name) => (await server.exec('get_class', { name })).class;

/** The titles of the sections in the list, as they read: label and name. */
/** @param {import('playwright').Page} page */
const titles = (page) => page.locator('#variables .part-title').evaluateAll((all) => all.map((one) => (one.textContent ?? '').trim()));

/** The variables a part of the list shows, by the name of its section; '' is "In no section". */
/** @param {import('playwright').Page} page @param {string} section */
const inPart = (page, section) =>
  page.locator(section ? `.part[data-section="${section}"]` : '.part:not([data-section])').locator(':scope > .vars > .var').evaluateAll((all) => all.map((one) => one.getAttribute('data-variable')));

/** @param {import('playwright').Page} page @param {string} section */
const title = (page, section) => page.locator(`.part[data-section="${section}"] > .part-title .part-pick`);

/**
 * Adds a section through "Add a section", and answers what the page
 * says of it: '' when it was added.
 *
 * @param {import('playwright').Page} page
 * @param {string} name
 * @param {string} first the variable it begins with
 */
async function addSection(page, name, first) {
  const adder = page.locator('[data-adds-section]');
  if (await adder.locator('form').count() === 0) await adder.getByRole('button', { name: 'Add a section' }).click();
  await adder.locator('input').fill(name);
  await adder.locator('select').selectOption(first);
  // What the page said of the name before is taken away, so that what it says of this one is told from it.
  await adder.locator('.field-why').evaluate((why) => (why.textContent = ''));
  await adder.getByRole('button', { name: 'Add', exact: true }).click();
  // The form is gone when the section was added; it stays, with the reason, when it was not.
  await page.waitForFunction(() => document.querySelector('[data-adds-section] .field-why')?.textContent !== '' || document.querySelector('[data-adds-section] form') === null);
  return (await adder.locator('.field-why').count()) ? adder.locator('.field-why').innerText() : '';
}

test('Dan chooses a section by its title, and the side shows it as fields', async () => {
  await aClass('Parted');
  const { context, page, wrong } = await atTheLists('Parted');
  assert.deepEqual(await titles(page), ['The purchase purchase', 'Amounts amounts']);
  await title(page, 'amounts').click();
  assert.equal(await title(page, 'amounts').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#about-title').innerText(), 'Amounts');
  assert.equal(new URL(page.url()).searchParams.get('section'), 'amounts', 'the address keeps the choice');
  assert.equal(await page.locator('.pick[aria-pressed="true"]').count(), 0, 'no state is the chosen thing now');
  assert.equal(await page.inputValue('#p-label'), 'Amounts');
  assert.equal(await page.inputValue('#p-description'), 'What it cost, and what is paid back.');
  assert.equal(await page.inputValue('#p-inside'), '');
  assert.deepEqual(await page.locator('#p-inside option').evaluateAll((all) => all.map((one) => one.textContent)), ['At the top', 'Inside The purchase']);
  assert.equal(await page.locator('#p-holds .field-value').innerText(), 'net, vat_rate, vat, total, needs_director');

  // What he changes shows in the list at once, and is saved as the next version.
  await page.fill('#p-label', 'The money');
  await page.press('#p-label', 'Tab');
  assert.deepEqual(await titles(page), ['The purchase purchase', 'The money amounts']);
  assert.equal(await page.locator('#about-title').innerText(), 'The money');
  assert.equal(await page.locator('.part[data-section="amounts"] > .adder > button').innerText(), 'Add a variable to The money');
  await page.fill('#p-description', 'What was paid, and what comes back.');
  await page.press('#p-description', 'Tab');
  assert.equal(await page.locator('.part[data-section="amounts"] > .part-about').innerText(), 'What was paid, and what comes back.');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const now = (await held('Parted')).definition;
  assert.equal(now.sections.amounts.label, 'The money');
  assert.equal(now.sections.amounts.description, 'What was paid, and what comes back.');
  assert.deepEqual(now.sections.amounts.variables, expense.sections.amounts.variables);

  // A variable or a state chosen puts the section's card away; the address opens it again.
  await page.locator('.var[data-variable="net"] .var-pick').click();
  assert.equal(await title(page, 'amounts').getAttribute('aria-pressed'), 'false');
  assert.equal(new URL(page.url()).searchParams.get('section'), null);
  await page.goto(`${site.url}design.html?class=Parted&section=purchase`);
  await ready(page);
  assert.equal(await page.locator('#about-title').innerText(), 'The purchase');
  assert.equal(await title(page, 'purchase').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('"Add a section" asks its name and the variable it begins with; the server says whether the name may be one', async () => {
  await aClass('Grown');
  const { context, page, wrong } = await atTheLists('Grown');
  const adder = page.locator('[data-adds-section]');
  await adder.getByRole('button', { name: 'Add a section' }).click();
  assert.equal(await adder.locator('input').getAttribute('aria-label'), 'The name of the new section');
  assert.equal(await adder.locator('select').getAttribute('aria-label'), 'The variable the section begins with');
  assert.deepEqual((await adder.locator('option').evaluateAll((all) => all.map((one) => one.textContent))).slice(0, 2), ['begins with what, What was bought', 'begins with bought_on, Bought on']);

  assert.equal(await addSection(page, '', 'note'), 'Give the section a name.');
  assert.equal(await addSection(page, 'Amounts', 'note'), 'amounts is a section of this class already.');
  assert.equal(await addSection(page, 'net', 'note'), 'The server would not take it: section "net" has the name of variable "net".');
  assert.equal(await addSection(page, 'two words', 'note'), 'The server would not take it: a name is letters, digits and underscores: "two words".');
  assert.deepEqual(await titles(page), ['The purchase purchase', 'Amounts amounts'], 'nothing was added');
  assert.ok(await page.locator('#class-changed').isHidden());

  assert.equal(await addSection(page, 'extras', 'note'), '');
  assert.deepEqual(await titles(page), ['The purchase purchase', 'Amounts amounts', 'extras extras']);
  assert.deepEqual(await inPart(page, 'extras'), ['note']);
  assert.deepEqual(await inPart(page, 'purchase'), ['what', 'bought_on', 'cost_centre'], 'the note left the section it was in');
  assert.equal(await page.locator('#about-title').innerText(), 'extras');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'p-label', 'the cursor is where he gives it a label');
  await page.keyboard.type('Extras');
  await page.fill('#p-description', 'What does not belong elsewhere.');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Grown')).definition.sections.extras, { variables: ['note'], label: 'Extras', description: 'What does not belong elsewhere.' });
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a section is moved inside another and back to the top; how deep is the server\'s to say', async () => {
  const definition = { ...structuredClone(expense), name: 'Nested' };
  // Three sections inside one another under Amounts: a fourth level is the last the server takes.
  definition.sections.amounts.variables = ['net', 'vat_rate'];
  definition.sections.amounts.sections = { taxes: { label: 'Taxes', description: 'd', variables: ['vat'], sections: { sums: { label: 'Sums', description: 'd', variables: ['total'], sections: { marks: { label: 'Marks', description: 'd', variables: ['needs_director'] } } } } } };
  await server.exec('define_class', { definition });
  const { context, page, wrong } = await atTheLists('Nested', '&section=purchase');
  assert.deepEqual(await page.locator('#p-inside option').evaluateAll((all) => all.map((one) => one.textContent?.trim())), ['At the top', 'Inside Amounts', 'Inside Taxes', 'Inside Sums', 'Inside Marks']);

  // Inside Marks it would be a fifth level: the server says no, in its words, and nothing moves.
  await page.selectOption('#p-inside', 'marks');
  await page.waitForFunction(() => document.getElementById('p-inside-why')?.textContent !== '');
  assert.equal(await page.locator('#p-inside-why').innerText(), 'The server would not take it: sections nest at most 4 deep, the top level counted as the first.');
  assert.equal(await page.inputValue('#p-inside'), '', 'the field shows where the section still lies');
  assert.ok(await page.locator('#class-changed').isHidden());

  // Inside Amounts it goes, with its variables, to the end of the sections there.
  await page.selectOption('#p-inside', 'amounts');
  await page.locator('.part[data-section="amounts"] > .part[data-section="purchase"]').waitFor();
  assert.equal(await page.locator('#p-inside-why').innerText(), '');
  assert.deepEqual(await page.locator('.part[data-section="amounts"] > .part').evaluateAll((all) => all.map((one) => one.getAttribute('data-section'))), ['taxes', 'purchase']);
  assert.deepEqual(await inPart(page, 'purchase'), ['what', 'bought_on', 'cost_centre', 'note']);
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual(Object.keys((await held('Nested')).definition.sections), ['amounts']);
  assert.deepEqual(Object.keys((await held('Nested')).definition.sections.amounts.sections), ['taxes', 'purchase']);

  // A section is not offered itself, nor what lies inside it.
  await title(page, 'taxes').click();
  assert.deepEqual(await page.locator('#p-inside option').evaluateAll((all) => all.map((one) => one.textContent?.trim())), ['At the top', 'Inside Amounts', 'Inside The purchase']);
  assert.equal(await page.inputValue('#p-inside'), 'amounts');
  assert.equal(await page.locator('#p-holds .field-value').innerText(), 'vat; and the section sums');

  // Back to the top.
  await page.selectOption('#p-inside', '');
  await page.locator('#variables > .part[data-section="taxes"]').waitFor();
  assert.deepEqual(await page.locator('#variables > .part').evaluateAll((all) => all.map((one) => one.getAttribute('data-section'))), ['amounts', 'taxes']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a section is removed: its variables stay, in no section, and the sections inside it take its place', async () => {
  const definition = { ...structuredClone(expense), name: 'Emptied' };
  definition.sections.amounts.variables = ['net', 'vat_rate', 'vat'];
  definition.sections.amounts.sections = { sums: { label: 'Sums', description: 'What it comes to.', variables: ['total', 'needs_director'] } };
  definition.rights.submitted.amounts = { write: 'FALSE' };
  await server.exec('define_class', { definition });
  const { context, page, wrong } = await atTheLists('Emptied', '&section=amounts');
  await page.click('#p-remove');
  assert.equal(await page.locator('#said').innerText(), 'Removed the section amounts from the text. Its variables are in no section now; Undo puts it back.');
  assert.deepEqual(await titles(page), ['In no section', 'The purchase purchase', 'Sums sums']);
  assert.deepEqual(await inPart(page, ''), ['net', 'vat_rate', 'vat']);
  assert.deepEqual(await inPart(page, 'sums'), ['total', 'needs_director']);
  assert.equal(new URL(page.url()).searchParams.get('section'), null);

  // A line about single variables still names the section: the server says so, and nothing is saved.
  assert.equal(await press(page, 'save'), 'Not saved: one thing to put right.');
  assert.equal(await page.locator('#findings .finding-go').first().innerText(), 'the class has no variable and no section named "amounts"');
  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.deepEqual(await titles(page), ['The purchase purchase', 'Amounts amounts', 'Sums sums']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what is typed for a section is taken when Dan presses a variable at once', async () => {
  await aClass('Swift');
  const { context, page, wrong } = await atTheLists('Swift', '&section=amounts');
  await page.fill('#p-label', 'Typed, then a row');
  await page.locator('.var[data-variable="net"] .var-pick').click();
  assert.equal(await page.locator('#about-title').innerText(), 'Net amount', 'the press on the variable was not lost');
  assert.deepEqual(await titles(page), ['The purchase purchase', 'Typed, then a row amounts'], 'nor what he had typed');
  await title(page, 'purchase').click();
  await page.fill('#p-description', 'Typed, then Save.');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  const now = (await held('Swift')).definition;
  assert.equal(now.sections.amounts.label, 'Typed, then a row');
  assert.equal(now.sections.purchase.description, 'Typed, then Save.');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Jan, who is no designer, chooses no section and adds none', async () => {
  await aClass('Kept');
  const { context, page, wrong } = await atTheLists('Kept', '&section=amounts', jan);
  assert.equal(await page.locator('.part-pick, [data-adds-section]').count(), 0);
  assert.deepEqual(await titles(page), ['The purchase purchase', 'Amounts amounts']);
  assert.notEqual(await page.locator('#about-title').innerText(), 'Amounts', 'the address opens no card of a section for him');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the card of a section fits a phone and is worked by the keyboard', async () => {
  await aClass('Pocket');
  const { context, page, wrong } = await atTheLists('Pocket', '', dan, { width: 390, height: 844 });
  await title(page, 'purchase').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#about-title').innerText(), 'The purchase');
  assert.ok(await fits(page));
  await page.locator('[data-adds-section] button').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'The name of the new section');
  assert.ok(await fits(page), 'nor does the form for a new section push the page sideways');
  await page.keyboard.type('extras');
  await page.keyboard.press('Enter');
  await page.locator('.part[data-section="extras"]').waitFor();
  assert.deepEqual(await inPart(page, 'extras'), ['what'], 'Enter adds it, beginning with the variable the list stood on');
  assert.ok(await fits(page));
  assert.deepEqual(wrong, []);
  await context.close();
});
