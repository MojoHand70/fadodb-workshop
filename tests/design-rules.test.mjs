// Design mode, changing what a class does by itself through the lists:
// its rules. When something happens, on a condition, the class does
// one action after another. Dan, a designer, in front of a real FadoDB
// server.

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

/** The block "By itself" under a state; '' is the whole class. */
/** @param {import('playwright').Page} page @param {string} state */
const byItself = (page, state) => page.locator(`[data-rules="${state}"]`);

/** The rules a block shows: its place in the class, when it runs, and its lines as "what: answer". */
/** @param {import('playwright').Page} page @param {string} state */
const shown = (page, state) =>
  byItself(page, state)
    .locator('.rule')
    .evaluateAll((all) => all.map((rule) => [rule.getAttribute('data-rule'), rule.querySelector('.rule-when')?.textContent, ...[...rule.querySelectorAll('.line')].map((line) => `${line.querySelector('.line-what')?.textContent}: ${line.querySelector('.line-answer')?.textContent}`)]));

/**
 * Adds a rule through "Add a rule" of a block.
 *
 * @param {import('playwright').Page} page
 * @param {string} state
 * @param {string} event what sets it off
 * @param {string} variable the value it begins by setting
 */
async function addRule(page, state, event, variable) {
  const adder = byItself(page, state).locator('[data-adds-rule]');
  await adder.getByRole('button', { name: 'Add a rule' }).click();
  await adder.locator('select').nth(0).selectOption(event);
  await adder.locator('select').nth(1).selectOption(variable);
  await adder.getByRole('button', { name: 'Add', exact: true }).click();
}

/**
 * Adds an action to the rule the card shows.
 *
 * @param {import('playwright').Page} page
 * @param {'set' | 'reset'} kind
 * @param {string} variable
 */
async function addAction(page, kind, variable) {
  const adder = page.locator('[data-adds-action]');
  await adder.getByRole('button', { name: 'Add an action' }).click();
  await adder.locator('select').nth(0).selectOption(kind);
  await adder.locator('select').nth(1).selectOption(variable);
  await adder.getByRole('button', { name: 'Add', exact: true }).click();
}

/**
 * A class of its own with rules: Expense under another name.
 *
 * @param {string} name
 * @param {any[]} rules
 */
async function withRules(name, rules) {
  const definition = { ...structuredClone(expense), name, rules };
  await server.exec('define_class', { definition });
  return definition;
}

test('Dan adds a rule under a state: when Approve is taken, the class sets a value', async () => {
  await aClass('Ruled');
  const { context, page, wrong } = await atTheLists('Ruled', '&state=submitted');
  assert.equal(await byItself(page, 'submitted').locator('.rule-none').innerText(), 'Nothing: no rule is about this state or a way out of it.');
  const adder = byItself(page, 'submitted').locator('[data-adds-rule]');
  await adder.getByRole('button', { name: 'Add a rule' }).click();
  assert.equal(await adder.locator('select').nth(0).getAttribute('aria-label'), 'What sets the rule off');
  assert.deepEqual(await adder.locator('select').nth(0).locator('option').evaluateAll((all) => all.map((one) => [one.getAttribute('value'), one.textContent])), [
    ['enter:submitted', 'when a document enters Waiting for approval'],
    ['exit:submitted', 'when a document leaves Waiting for approval'],
    ['transition:take_back', 'when take back is taken'],
    ['transition:send_back', 'when send back is taken'],
    ['transition:approve', 'when approve is taken'],
  ]);
  assert.equal(await adder.locator('select').nth(1).getAttribute('aria-label'), 'The value the rule sets');
  assert.deepEqual(
    await adder.locator('select').nth(1).locator('option').evaluateAll((all) => all.map((one) => one.getAttribute('value'))),
    ['what', 'bought_on', 'cost_centre', 'note', 'net', 'vat_rate'],
    'the values people give: a rule sets no value the class works out',
  );
  await adder.getByRole('button', { name: 'Cancel' }).click();
  assert.ok(await page.locator('#class-changed').isHidden());

  await addRule(page, 'submitted', 'transition:approve', 'note');
  assert.equal(await page.locator('#said').innerText(), 'Added a rule. Say what the value is set to.');
  assert.equal(await page.locator('#about-title').innerText(), 'When Approve is taken');
  assert.equal(new URL(page.url()).searchParams.get('rule'), '0', 'the address keeps the rule');
  assert.equal(await page.inputValue('#u-when'), 'transition:approve');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.formula-box')?.id), 'u-set-0-note', 'the cursor is where he says what the value is set to');
  assert.equal(await page.locator('#u-set-0-note .cm-content').getAttribute('aria-label'), 'Set Note to');

  // A rule that sets a value to nothing is not one the server takes: it says so, at the formula.
  assert.equal(await press(page, 'save'), 'Not saved: one thing to put right.');
  assert.equal(await page.locator('#findings .finding-go').first().innerText(), 'empty formula');
  assert.equal((await held('Ruled')).version, 1);

  await writeFormula(page, '#u-set-0-note', 'note & " (seen)"');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Ruled')).definition.rules, [{ on: 'transition', name: 'approve', do: [{ action: 'set', values: { note: 'note & " (seen)"' } }] }]);

  // Back at the state, the rule stands under "By itself", to be chosen again.
  await page.click('#u-back');
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval');
  assert.equal(new URL(page.url()).searchParams.get('rule'), null);
  assert.deepEqual(await shown(page, 'submitted'), [['0', 'When Approve is taken', 'it does: set note = note & " (seen)"']]);
  await byItself(page, 'submitted').locator('.rule[data-rule="0"] .rule-when').click();
  assert.equal(await formulaOf(page, '#u-set-0-note'), 'note & " (seen)"');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the card of a rule: what sets it off, and on what condition', async () => {
  await withRules('Timed', [{ on: 'transition', name: 'approve', do: [{ action: 'set', values: { note: '"seen"' } }] }]);
  const { context, page, wrong } = await atTheLists('Timed', '&rule=0');
  assert.equal(await page.locator('#about-title').innerText(), 'When Approve is taken');
  assert.equal(await page.locator('.pick[data-state="submitted"]').getAttribute('aria-pressed'), 'true', 'the lists stand on the state the rule belongs to');
  assert.equal(await page.locator('#u-back').innerText(), 'Back to Waiting for approval');
  assert.deepEqual((await page.locator('#u-when option').evaluateAll((all) => all.map((one) => one.textContent))).slice(0, 4), ['A document is made', 'A value changes', 'A document enters Draft', 'A document enters Waiting for approval']);

  // Another event, of another state: the rule and the lists go there.
  await page.selectOption('#u-when', 'enter:approved');
  assert.equal(await page.locator('#about-title').innerText(), 'When a document enters Approved');
  assert.equal(await page.locator('.pick[data-state="approved"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#u-back').innerText(), 'Back to Approved');

  // A change of values: the rule names them.
  assert.equal(await page.locator('#u-variables').count(), 0);
  await page.selectOption('#u-when', 'values_change');
  assert.equal(await page.locator('#u-back').innerText(), 'Back to The whole class');
  assert.equal(await page.inputValue('#u-variables'), '', 'for him to name');
  await page.fill('#u-variables', 'net, vat_rate');
  await page.press('#u-variables', 'Tab');
  assert.equal(await page.locator('#about-title').innerText(), 'When net or vat_rate changes');

  // The condition is a formula, with the server's word under it.
  await page.locator('#u-if .cm-content').focus();
  await page.keyboard.insertText('net > nothing');
  await page.waitForFunction(() => document.querySelector('#u-if')?.getAttribute('data-checked') === 'net > nothing');
  assert.equal(await page.locator('#u-if-why').innerText(), 'unknown variable nothing');
  await writeFormula(page, '#u-if', 'net > 1000');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Timed')).definition.rules, [{ on: 'values_change', variables: ['net', 'vat_rate'], if: 'net > 1000', do: [{ action: 'set', values: { note: '"seen"' } }] }]);

  // Emptied, the condition leaves the rule: it runs every time.
  await writeFormula(page, '#u-if', '');
  assert.equal(await press(page, 'save'), 'Saved as version 3.');
  assert.equal('if' in (await held('Timed')).definition.rules[0], false);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what a rule does: a value set, a value put back, and an action the lists do not change yet', async () => {
  await withRules('Done', [
    { on: 'transition', name: 'approve', do: [{ action: 'set', values: { note: '"seen"', cost_centre: '"none"' } }, { action: 'reset', variables: ['bought_on'] }, { action: 'emit', event: 'approved' }] },
  ]);
  const { context, page, wrong } = await atTheLists('Done', '&rule=0');
  assert.deepEqual(await page.locator('#u-does .rule-action').evaluateAll((all) => all.map((one) => [one.getAttribute('data-action'), one.getAttribute('data-sets')])), [['0', 'note'], ['0', 'cost_centre'], ['1', null], ['2', null]]);
  assert.equal(await formulaOf(page, '#u-set-0-note'), '"seen"');
  assert.equal(await formulaOf(page, '#u-set-0-cost_centre'), '"none"');
  assert.equal(await page.inputValue('#u-reset-1'), 'bought_on');
  assert.equal(await page.locator('#u-does .rule-other').innerText(), 'emit (event: approved) changed in the text');
  assert.equal(await page.locator('#u-does .rule-last').count(), 0);

  // Dan changes what a value is set to, and which values go back.
  await writeFormula(page, '#u-set-0-note', 'note & " (seen)"');
  await page.fill('#u-reset-1', 'bought_on, vat_rate');
  await page.press('#u-reset-1', 'Tab');

  // He adds an action of each kind: the new one goes to the end, and a formula gets the cursor.
  await addAction(page, 'set', 'what');
  assert.equal(await page.locator('#said').innerText(), 'Added an action. Say what the value is set to.');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.formula-box')?.id), 'u-set-3-what');
  await page.keyboard.insertText('UPPER(what)');
  await addAction(page, 'reset', 'net');
  assert.equal(await page.inputValue('#u-reset-4'), 'net');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'u-reset-4');
  assert.equal(await formulaOf(page, '#u-set-3-what'), 'UPPER(what)', 'what was typed and not left was taken first');

  // He takes one value out of the action that sets two, and the action the lists do not change.
  await page.click('#u-remove-0-cost_centre');
  assert.equal(await page.locator('#said').innerText(), 'Removed the action from the text. Undo puts it back.');
  await page.click('#u-remove-2');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Done')).definition.rules[0].do, [
    { action: 'set', values: { note: 'note & " (seen)"' } },
    { action: 'reset', variables: ['bought_on', 'vat_rate'] },
    { action: 'set', values: { what: 'UPPER(what)' } },
    { action: 'reset', variables: ['net'] },
  ]);

  // The last thing a rule does is not taken away: the rule is. (An action taken out, those after it move up.)
  await page.click('#u-remove-2-what');
  await page.click('#u-remove-2');
  await page.click('#u-remove-1');
  assert.equal(await page.locator('#u-does [id^="u-remove"]').count(), 0);
  assert.equal(await page.locator('#u-does .rule-last').innerText(), 'A rule does at least one thing. To take this away, remove the rule.');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a rule is removed, the rules after it move up, and Undo puts it back', async () => {
  await withRules('Fewer', [
    { on: 'transition', name: 'approve', do: [{ action: 'set', values: { note: '"approved"' } }] },
    { on: 'exit', state: 'submitted', do: [{ action: 'set', values: { note: '"left"' } }] },
  ]);
  const { context, page, wrong } = await atTheLists('Fewer', '&state=submitted');
  assert.deepEqual(await shown(page, 'submitted'), [['0', 'When Approve is taken', 'it does: set note = "approved"'], ['1', 'When a document leaves Waiting for approval', 'it does: set note = "left"']]);
  await byItself(page, 'submitted').locator('.rule[data-rule="0"] .rule-when').click();
  await page.click('#u-remove');
  assert.equal(await page.locator('#said').innerText(), 'Removed the rule from the text. Undo puts it back.');
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval', 'the lists are back at its state');
  assert.equal(new URL(page.url()).searchParams.get('rule'), null);
  assert.deepEqual(await shown(page, 'submitted'), [['0', 'When a document leaves Waiting for approval', 'it does: set note = "left"']]);
  assert.equal(await press(page, 'undo'), 'Taken back.');
  assert.deepEqual((await shown(page, 'submitted')).map((rule) => rule[1]), ['When Approve is taken', 'When a document leaves Waiting for approval']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('under the whole class stand the rules about no state: a new document, a change of a value, a deletion', async () => {
  await aClass('Whole');
  const { context, page, wrong } = await atTheLists('Whole', '&state=');
  assert.equal(await byItself(page, '').locator('.rule-none').innerText(), 'Nothing: no rule is about a new document, a change of a value or a deletion.');
  const adder = byItself(page, '').locator('[data-adds-rule]');
  await adder.getByRole('button', { name: 'Add a rule' }).click();
  const events = await adder.locator('select').nth(0).locator('option').evaluateAll((all) => all.map((one) => [one.getAttribute('value'), one.textContent]));
  assert.deepEqual([events[0], events[5], events.at(-1)], [['create', 'when a document is made'], ['values_change:net', 'when net amount changes'], ['delete', 'when a document is deleted']]);
  await adder.getByRole('button', { name: 'Cancel' }).click();

  await addRule(page, '', 'values_change:net', 'cost_centre');
  assert.equal(await page.locator('#about-title').innerText(), 'When net changes');
  assert.equal(await page.inputValue('#u-variables'), 'net');
  assert.equal(await page.locator('#u-back').innerText(), 'Back to The whole class');
  await page.keyboard.insertText('IF(net > 5000, "board", cost_centre)');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Whole')).definition.rules, [{ on: 'values_change', variables: ['net'], do: [{ action: 'set', values: { cost_centre: 'IF(net > 5000, "board", cost_centre)' } }] }]);
  await page.click('#u-back');
  assert.equal(await page.locator('#about-title').innerText(), 'The whole class');
  assert.deepEqual(await shown(page, ''), [['0', 'When net changes', 'it does: set cost_centre = IF(net > 5000, "board", cost_centre)']]);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what is typed for a rule is taken when Dan presses Back at once', async () => {
  await withRules('Brisk', [{ on: 'values_change', variables: ['net'], do: [{ action: 'reset', variables: ['note'] }] }]);
  const { context, page, wrong } = await atTheLists('Brisk', '&rule=0');
  await page.fill('#u-variables', 'net, vat_rate');
  await page.click('#u-back');
  assert.equal(await page.locator('#about-title').innerText(), 'The whole class', 'the press on Back was not lost');
  assert.deepEqual(await shown(page, ''), [['0', 'When net or vat_rate changes', 'it does: put note back to its first value']], 'nor what he had typed');
  await byItself(page, '').locator('.rule[data-rule="0"] .rule-when').click();
  await page.fill('#u-reset-0', 'note, cost_centre');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Brisk')).definition.rules, [{ on: 'values_change', variables: ['net', 'vat_rate'], do: [{ action: 'reset', variables: ['note', 'cost_centre'] }] }]);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Jan, who is no designer, reads the rules as words', async () => {
  await withRules('Seen', [{ on: 'transition', name: 'approve', if: 'total > 100', do: [{ action: 'set', values: { note: '"seen"' } }, { action: 'reset', variables: ['cost_centre', 'bought_on'] }] }]);
  const { context, page, wrong } = await atTheLists('Seen', '&state=submitted&rule=0', jan);
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval', 'the address opens no card of a rule for him');
  assert.equal(await byItself(page, 'submitted').locator('button, [data-adds-rule]').count(), 0);
  assert.deepEqual(await shown(page, 'submitted'), [['0', 'When Approve is taken', 'only when: total > 100', 'it does: set note = "seen"', 'it does: put cost_centre, bought_on back to their first values']]);
  await page.locator('.pick[data-state="draft"]').click();
  assert.equal(await byItself(page, 'draft').count(), 0, 'a state with no rule shows no empty block to somebody who cannot add one');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the card of a rule fits a phone and is worked by the keyboard', async () => {
  await aClass('Pocket');
  const { context, page, wrong } = await atTheLists('Pocket', '&state=submitted', dan, { width: 390, height: 844 });
  const adder = byItself(page, 'submitted').locator('[data-adds-rule]');
  await adder.getByRole('button', { name: 'Add a rule' }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'What sets the rule off');
  assert.ok(await fits(page), 'the form for a new rule does not push the page sideways');
  await adder.locator('select').nth(0).selectOption('transition:approve');
  await adder.locator('select').nth(1).selectOption('note');
  await adder.locator('select').nth(1).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#about-title').innerText(), 'When Approve is taken');
  await page.keyboard.insertText('"a long formula for a narrow window: " & note & " " & cost_centre & " " & what');
  assert.ok(await fits(page), 'nor does a long formula');
  await page.locator('#u-back').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#about-title').innerText(), 'Waiting for approval');
  assert.deepEqual(wrong, []);
  await context.close();
});
