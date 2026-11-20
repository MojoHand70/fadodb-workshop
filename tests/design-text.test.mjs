// Design mode, the class as text: Dan, a designer, changes a class,
// asks the server to check it and saves it as the next version, in
// front of a real FadoDB server.

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
/** What a browser holds once Dan has signed in. */
/** @type {Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>} */
let dan;

before(async () => {
  server = await acme();
  expense = JSON.parse(await readFile(new URL('./fixtures/expense.json', import.meta.url), 'utf8'));
  site = server.site;
  browser = await launch();
  const context = await browser.newContext();
  await signIn(await context.newPage(), site, server, 'dan');
  dan = await context.storageState();
  await context.close();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * A class of its own for a test, so that no test changes the class of
 * another: Expense under another name, defined by Olga.
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
 * Dan opens the text of a class.
 *
 * @param {string} name
 * @param {{ width: number, height: number }} [viewport]
 */
async function atTheText(name, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ storageState: dan, viewport, locale: 'en-GB', timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await page.goto(`${site.url}design.html?class=${name}&as=text`);
  await ready(page);
  return { context, page, ...seen };
}

/**
 * Dan puts a whole text in the box, in place of what is there: he
 * selects everything and pastes.
 *
 * @param {import('playwright').Page} page
 * @param {string} text
 */
async function write(page, text) {
  await page.locator('#class-text .cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

/** @param {unknown} definition */
const asText = (definition) => JSON.stringify(definition, null, 2);

/**
 * Presses a button of the bar and waits until the page says what came of it.
 *
 * @param {import('playwright').Page} page
 * @param {'check' | 'save' | 'discard'} button
 */
async function press(page, button) {
  await page.evaluate(() => (/** @type {HTMLElement} */ (document.getElementById('said')).textContent = ''));
  await page.click(`#${button}`);
  await page.waitForFunction(() => document.getElementById('said')?.textContent !== '');
  return page.locator('#said').innerText();
}

/** @param {import('playwright').Page} page */
const findings = (page) => page.locator('#findings .finding').evaluateAll((all) => all.map((one) => [one.querySelector('.finding-go')?.textContent ?? '', one.getAttribute('data-path') ?? '']));

/** The text the cursor holds selected in the page. */
/** @param {import('playwright').Page} page */
const selected = (page) => page.evaluate(() => String(getSelection()));

/** @param {string} name */
const held = async (name) => (await server.exec('get_class', { name })).class;

test('Dan changes a class as text, checks it and saves it as the next version', async () => {
  const definition = await aClass('Claim');
  const { context, page, wrong, commands } = await atTheText('Claim');
  assert.ok(await page.locator('#design-do').isVisible());
  assert.equal(await page.locator('#save').innerText(), 'Save');
  assert.ok(await page.locator('#save').isDisabled(), 'nothing to save yet');
  assert.ok(await page.locator('#discard').isDisabled());
  assert.ok(await page.locator('#class-changed').isHidden());

  const next = structuredClone(definition);
  next.description = 'What Dan made of it.';
  next.variables.note.label = 'A note for the approver';
  next.variables.urgent = { type: 'bool', label: 'Urgent', description: 'Pay it this week.' };
  next.sections.purchase.variables.push('urgent');
  await write(page, asText(next));
  assert.ok(await page.locator('#class-changed').isVisible());
  assert.equal(await page.locator('#class-changed').innerText(), 'changed, not saved');
  assert.equal(await page.locator('#save').innerText(), 'Save as version 2');
  assert.ok(await page.locator('#save').isEnabled());
  assert.ok(await page.locator('#discard').isEnabled());

  commands.length = 0;
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.deepEqual(commands, ['validate_class']);
  assert.ok(await page.locator('#findings-box').isHidden());
  assert.equal((await held('Claim')).version, 1, 'a check writes nothing');

  // The lists show the text as it stands; the heading still shows what the server holds.
  await page.click('#as-lists');
  assert.equal(await page.locator('.var[data-variable="note"] .var-label').innerText(), 'A note for the approver');
  assert.equal(await page.locator('.var[data-variable="urgent"] .var-kind').innerText(), 'bool');
  assert.equal(await page.locator('.part[data-section="purchase"] .var').count(), 5);
  assert.equal(await page.locator('#class-about').innerText(), definition.description);
  assert.equal(await page.locator('#class-version').innerText(), 'version 1');

  commands.length = 0;
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual(commands, ['get_class', 'define_class', 'get_user'], 'the page looks whether somebody else saved, then saves');
  assert.equal(await page.locator('#class-version').innerText(), 'version 2');
  assert.equal(await page.locator('#class-about').innerText(), 'What Dan made of it.');
  assert.match(await page.locator('#class-defined').innerText(), /^Defined by Dan Mazur, /);
  assert.ok(await page.locator('#class-changed').isHidden());
  assert.ok(await page.locator('#save').isDisabled());
  assert.equal(await page.locator('#save').innerText(), 'Save');

  const now = await held('Claim');
  assert.equal(now.version, 2);
  assert.equal(now.defined.by, 'dan');
  assert.deepEqual(now.definition, next, 'the server holds what Dan wrote, word for word');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what the server finds is listed, each with its place, and marked in the text', async () => {
  const definition = await aClass('Faulty');
  const { context, page, wrong } = await atTheText('Faulty');
  const bad = structuredClone(definition);
  bad.variables.vat.formula = 'ROUND(net * vat_rat, 2)';
  // In the text of the class this formula is written with its quotes as escapes: "\"Gdańsk\" & nothing".
  bad.variables.note.default = '"Gdańsk" & nothing';
  bad.transitions[0].to = 'nowhere';
  await write(page, asText(bad));

  assert.equal(await press(page, 'check'), 'Checked: 7 things to put right.');
  assert.equal(await page.locator('#findings-what').innerText(), 'The server would refuse this class.');
  assert.deepEqual(await findings(page), [
    ['unknown variable vat_rat', '/variables/vat/formula'],
    ['unknown variable vat', '/variables/total/formula'],
    ['unknown variable total', '/variables/needs_director/formula'],
    ['unknown variable nothing', '/variables/note/default'],
    ['unknown state "nowhere"', '/transitions/0/to'],
    ['unknown variable total', '/transitions/0/guard'],
    ['unknown variable needs_director', '/access/transition/approve'],
  ]);
  assert.equal(await page.locator('#findings .finding-where').first().innerText(), 'variables / vat / formula');
  assert.equal((await held('Faulty')).version, 1);

  // Each finding leads to its place: the word inside the formula, or the whole value.
  /** @param {number} n */
  const go = (n) => page.locator('#findings .finding-go').nth(n).click();
  await go(0);
  assert.equal(await selected(page), 'vat_rat');
  await go(3);
  assert.equal(await selected(page), 'nothing', 'counted past a letter of two bytes and two quotes written as escapes');
  await go(4);
  assert.equal(await selected(page), '"nowhere"');
  await go(6);
  assert.equal(await selected(page), 'needs_director');

  // From the lists, a finding opens the text at its place.
  await page.click('#as-lists');
  assert.ok(await page.locator('#findings-box').isVisible(), 'what was found stays in view over the lists');
  await go(0);
  assert.ok(await page.locator('#text').isVisible());
  assert.equal(await selected(page), 'vat_rat');
  assert.ok((await page.locator('#class-text .cm-lintRange-error').count()) > 0, 'and the places are marked in the text');

  // Dan puts the first right: the cursor goes to the end of the word and
  // he types the letter that is missing. The page says that what was
  // found may be out of date.
  assert.equal(await page.locator('#findings-hint').innerText(), '');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('e');
  assert.equal(await page.locator('#findings-hint').innerText(), 'The text has changed since. Check again.');
  assert.equal(await press(page, 'check'), 'Checked: 2 things to put right.', 'vat_rat became vat_rate, and what followed from it is gone');
  assert.deepEqual(await findings(page), [
    ['unknown variable nothing', '/variables/note/default'],
    ['unknown state "nowhere"', '/transitions/0/to'],
  ]);

  await write(page, asText(definition));
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');
  assert.ok(await page.locator('#findings-box').isHidden());
  assert.equal(await page.locator('#class-text .cm-lintRange-error').count(), 0);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what the server only notes holds nothing back: such a class is taken, and saved', async () => {
  const definition = await aClass('Noted');
  const { context, page, wrong } = await atTheText('Noted');
  const next = structuredClone(definition);
  next.variables.urgent = { type: 'bool', label: 'Urgent' };
  delete next.access.delete;
  await write(page, asText(next));

  assert.equal(await press(page, 'check'), 'Checked: the server takes it, with 2 notes.');
  const box = page.locator('#findings-box');
  assert.ok(await box.isVisible());
  assert.equal(await box.evaluate((b) => b.classList.contains('alert')), false, 'nothing is refused: the box is not an alarm');
  assert.ok(await page.locator('#findings-what').isHidden());
  assert.equal(await page.locator('#findings .finding').count(), 0);
  assert.equal(await page.locator('#notes-what').innerText(), 'The server takes this class. It notes, which holds nothing back:');
  const notes = await page.locator('#notes .finding').evaluateAll((all) => all.map((one) => [one.querySelector('.finding-go')?.textContent ?? '', one.getAttribute('data-path') ?? '']));
  assert.deepEqual(notes.map((n) => n[1]), ['/access/delete', '/variables/urgent/description']);
  assert.match(notes[0][0], /^Noted has no delete rule/);
  assert.match(notes[1][0], /^variable urgent has no description/);
  assert.match(await page.locator('#notes .finding-hint').last().innerText(), /add "description"/);

  // A note leads to its place too: here to the variable that lacks the word.
  await page.locator('#notes .finding-go').last().click();
  assert.equal((await selected(page)).replace(/\s+/g, ' '), '{ "type": "bool", "label": "Urgent" }');
  assert.equal(await page.locator('#class-text .cm-lintRange-error').count(), 0, 'and no place in the text is marked as wrong');

  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual((await held('Noted')).definition, next);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what refuses a class is said first; the notes come once the class is right', async () => {
  const definition = await aClass('Mixed');
  const { context, page, wrong } = await atTheText('Mixed');
  const next = structuredClone(definition);
  next.variables.urgent = { type: 'bool', label: 'Urgent' };
  next.transitions[0].to = 'nowhere';
  await write(page, asText(next));

  // While something refuses the class, the server says that and no note.
  assert.equal(await press(page, 'check'), 'Checked: one thing to put right.');
  assert.equal(await page.locator('#findings-box').evaluate((b) => b.classList.contains('alert')), true);
  assert.equal(await page.locator('#findings-what').innerText(), 'The server would refuse this class.');
  assert.deepEqual(await findings(page), [['unknown state "nowhere"', '/transitions/0/to']]);
  assert.ok(await page.locator('#notes-what').isHidden());
  assert.equal(await page.locator('#notes .finding').count(), 0);
  assert.equal(await press(page, 'save'), 'Not saved: one thing to put right.');
  assert.equal((await held('Mixed')).version, 1);

  // Put right, the class is taken, and the note is told.
  next.transitions[0].to = 'submitted';
  await write(page, asText(next));
  assert.equal(await press(page, 'check'), 'Checked: the server takes it, with one note.');
  assert.equal(await page.locator('#findings-box').evaluate((b) => b.classList.contains('alert')), false);
  assert.equal(await page.locator('#findings .finding').count(), 0);
  assert.equal(await page.locator('#notes .finding').count(), 1);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a class the server refuses is not saved, and what was typed stays', async () => {
  const definition = await aClass('Refused');
  const { context, page, wrong, commands, answers } = await atTheText('Refused');
  const bad = structuredClone(definition);
  bad.transitions[0].to = 'nowhere';
  await write(page, asText(bad));
  commands.length = 0;
  answers.length = 0;
  assert.equal(await press(page, 'save'), 'Not saved: one thing to put right.');
  assert.deepEqual(commands, ['get_class', 'define_class']);
  assert.deepEqual(answers, [{ status: 422, path: '/v1/define_class' }]);
  assert.equal(await page.locator('#findings-what').innerText(), 'Not saved. The server refuses this class.');
  assert.deepEqual(await findings(page), [['unknown state "nowhere"', '/transitions/0/to']]);
  assert.equal((await held('Refused')).version, 1);
  assert.equal(await page.locator('#class-version').innerText(), 'version 1');
  assert.ok(await page.locator('#class-changed').isVisible(), 'the text is still Dan\'s');
  assert.ok(await page.locator('#save').isEnabled());
  await page.locator('#findings .finding-go').first().click();
  assert.equal(await selected(page), '"nowhere"');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a text that is not JSON is said at its place, and the server is not asked', async () => {
  await aClass('Broken');
  const { context, page, wrong, commands } = await atTheText('Broken');
  await write(page, '{\n  "name": "Broken",\n  "variables": {"a": {"type": "text"},}\n}');
  commands.length = 0;
  assert.equal(await press(page, 'check'), 'Not checked: the text cannot be read.');
  assert.equal(await page.locator('#findings-what').innerText(), 'The text cannot be read as a class.');
  assert.deepEqual(await findings(page), [['The text stops being well-formed JSON here.', '']]);
  assert.match(await page.locator('#findings .finding-hint').innerText(), /a comma between two members and none after the last/);
  assert.equal(await press(page, 'save'), 'Not saved: the text cannot be read.');
  assert.deepEqual(commands, [], 'neither a check nor a save reaches the server');

  // The place is the brace after the comma that should not be there.
  await page.locator('#findings .finding-go').first().click();
  assert.equal(await selected(page), '}');

  // The lists keep the last text that could be read, and say so.
  await page.click('#as-lists');
  assert.ok(await page.locator('#lists-stale').isVisible());
  assert.equal(await page.locator('#variables .var').count(), 9, 'the class as it last could be read');

  // A text that is JSON and no object is no class either.
  await page.click('#as-text');
  await write(page, '["Broken"]');
  assert.equal(await press(page, 'check'), 'Not checked: the text cannot be read.');
  assert.deepEqual(await findings(page), [['The text is not one JSON object, in braces.', '']]);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Discard puts the text back as the server holds it, and the change can be undone', async () => {
  const definition = await aClass('Kept');
  const { context, page, wrong, commands } = await atTheText('Kept');
  const next = structuredClone(definition);
  next.variables.note.label = 'Something else';
  await write(page, asText(next));
  await page.click('#as-lists');
  assert.equal(await page.locator('.var[data-variable="note"] .var-label').innerText(), 'Something else');

  commands.length = 0;
  assert.equal(await press(page, 'discard'), 'Put back as the server holds it.');
  assert.deepEqual(commands, [], 'the page holds what the server holds: nothing is asked');
  assert.equal(await page.locator('.var[data-variable="note"] .var-label').innerText(), 'Note');
  assert.ok(await page.locator('#class-changed').isHidden());
  assert.ok(await page.locator('#save').isDisabled());

  // The box keeps its own history: what the page put in is undone like typing.
  await page.click('#as-text');
  await page.locator('#class-text .cm-content').click();
  await page.keyboard.press('ControlOrMeta+Z');
  assert.ok(await page.locator('#class-changed').isVisible(), 'Dan\'s text is back');
  await page.click('#as-lists');
  assert.equal(await page.locator('.var[data-variable="note"] .var-label').innerText(), 'Something else');
  assert.equal((await held('Kept')).version, 1);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a change of spaces alone is no change of the class', async () => {
  const definition = await aClass('Spaced');
  const { context, page } = await atTheText('Spaced');
  await write(page, JSON.stringify(definition));
  assert.ok(await page.locator('#class-changed').isHidden(), 'the same class, written on one line');
  assert.ok(await page.locator('#save').isDisabled());
  await context.close();
});

test('a text that names another class is not saved: a class of another name is another class', async () => {
  const definition = await aClass('Named');
  const { context, page, wrong, commands } = await atTheText('Named');
  await write(page, asText({ ...definition, name: 'Renamed' }));
  commands.length = 0;
  assert.equal(await press(page, 'save'), 'Not saved: the text names another class.');
  assert.deepEqual(commands, [], 'the server is not asked');
  assert.deepEqual(await findings(page), [['This page designs Named, and the text names Renamed', '/name']]);
  assert.match(await page.locator('#findings .finding-hint').innerText(), /Put the name back to save this one/);
  await page.locator('#findings .finding-go').first().click();
  assert.equal(await selected(page), '"Renamed"');
  assert.ok(!(await server.exec('list_classes')).classes.includes('Renamed'));
  assert.deepEqual(wrong, []);
  await context.close();
});

test('when somebody else saved meanwhile, Dan is told, and saving over it is his choice', async () => {
  const definition = await aClass('Shared');
  const { context, page, wrong } = await atTheText('Shared');

  // Olga saves version 2 while Dan works on version 1.
  const olgas = structuredClone(definition);
  olgas.description = 'Olga was here.';
  await server.exec('define_class', { definition: olgas });

  const dans = structuredClone(definition);
  dans.description = 'Dan was here.';
  await write(page, asText(dans));
  assert.equal(await page.locator('#save').innerText(), 'Save as version 2');
  assert.equal(
    await press(page, 'save'),
    'Not saved. Olga Nowak saved version 2 while you worked on version 1. Save again to put your text over it as version 3, or Discard to read theirs.',
  );
  assert.equal((await held('Shared')).definition.description, 'Olga was here.', 'nothing was put over Olga\'s version');
  assert.equal(await page.locator('#class-version').innerText(), 'version 2');
  assert.equal(await page.locator('#class-about').innerText(), 'Olga was here.');
  assert.equal(await page.locator('#save').innerText(), 'Save as version 3');
  assert.ok(await page.locator('#class-changed').isVisible(), 'Dan\'s text is still in the box');

  assert.equal(await press(page, 'save'), 'Saved as version 3.');
  const now = await held('Shared');
  assert.equal(now.version, 3);
  assert.equal(now.definition.description, 'Dan was here.');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('leaving with a class that is not saved asks first', async () => {
  const definition = await aClass('Leaving');
  const { context, page } = await atTheText('Leaving');
  await write(page, asText({ ...definition, description: 'Not saved yet.' }));
  assert.ok(await page.locator('#class-changed').isVisible());
  let asked = '';
  page.once('dialog', async (dialog) => {
    asked = dialog.type();
    await dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await new Promise((wait) => setTimeout(wait, 300));
  assert.equal(asked, 'beforeunload');
  await context.close();
});

test('the text box loads under the security header, fits a phone and is worked by the keyboard', async () => {
  await aClass('Small');
  const { context, page, wrong, answers } = await atTheText('Small', { width: 390, height: 844 });
  assert.deepEqual(wrong, [], 'nothing of the text box is refused by the header the server sends');
  assert.deepEqual(answers, []);
  assert.ok(await fits(page), 'the text scrolls inside its own box at 390 px');
  assert.equal(await page.locator('#class-text .cm-content').getAttribute('aria-label'), 'The definition of the class');
  assert.equal(await page.locator('#class-text .cm-content').getAttribute('role'), 'textbox');

  // Typing in the box changes the class; the keyboard reaches the bar.
  await page.locator('#class-text .cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' ');
  assert.ok(await page.locator('#class-changed').isHidden(), 'a space after the last brace changes nothing');
  await page.keyboard.type('x');
  assert.ok(await page.locator('#class-changed').isVisible());
  assert.ok(await fits(page), 'nor with the bar of what to do shown');
  await page.locator('#check').focus();
  await page.evaluate(() => (/** @type {HTMLElement} */ (document.getElementById('said')).textContent = ''));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('said')?.textContent !== '');
  assert.equal(await page.locator('#said').innerText(), 'Not checked: the text cannot be read.');
  assert.ok(await fits(page), 'nor with what was found shown');
  assert.deepEqual(wrong, []);
  await context.close();
});
