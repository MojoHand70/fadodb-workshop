// Design mode, a new class: Dan, a designer, gives a class a name,
// changes what it begins as and makes it, in front of a real FadoDB
// server.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { starter } from '../pages/class.js';
import { acme, signIn } from './acme.mjs';
import { CLOSING_NOT_CHECKED, fits, launch, leaveByClosing, leaveByLink, ready, watch } from './browser.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {{ url: string }} */
let site;
/** @type {import('playwright').Browser} */
let browser;
/** What a browser holds once Dan, and once Jan, has signed in. */
/** @type {Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>} */
let dan;
/** @type {Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>} */
let jan;

before(async () => {
  server = await acme();
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
 * Somebody who is signed in opens a page.
 *
 * @param {typeof dan} who
 * @param {string} path
 * @param {{ width: number, height: number }} [viewport]
 */
async function at(who, path, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ storageState: who, viewport, locale: 'en-GB', timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await page.goto(site.url + path);
  await ready(page);
  return { context, page, ...seen };
}

/**
 * Dan names a new class and begins it.
 *
 * @param {import('playwright').Page} page
 * @param {string} name
 * @param {string} [label]
 */
async function begin(page, name, label = '') {
  await page.fill('#new-name', name);
  await page.fill('#new-label', label);
  await page.press('#new-label', 'Enter');
}

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

/**
 * Dan puts a whole text in the box, in place of what is there.
 *
 * @param {import('playwright').Page} page
 * @param {unknown} definition
 */
async function write(page, definition) {
  await page.locator('#class-text .cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(JSON.stringify(definition, null, 2));
}

/** @param {import('playwright').Page} page */
const findings = (page) => page.locator('#findings .finding').evaluateAll((all) => all.map((one) => [one.querySelector('.finding-go')?.textContent ?? '', one.getAttribute('data-path') ?? '']));

const classes = async () => (await server.exec('list_classes')).classes;

test('what a new class begins as is a class the server takes, and it is its author\'s', async () => {
  const first = starter('Memo', 'Memo');
  assert.deepEqual((await server.exec('validate_class', { definition: first })).diagnostics, []);
  await server.exec('define_class', { definition: first });
  const { document: made } = await server.exec('create', { class: 'Memo', values: { subject: 'To Gdańsk' } }, 'jan');
  assert.equal(made.title, 'To Gdańsk');
  assert.equal(made.state, 'draft');
  assert.equal((await server.exec('count', { class: 'Memo' }, 'jan')).count, 1, 'its author sees it');
  assert.equal((await server.exec('count', { class: 'Memo' })).count, 0, 'and nobody else does, an administrator included');
  assert.equal(starter('Memo', '').label, 'Memo', 'with no label given, the name is the label');
});

test('Dan is offered a new class on the page of an app; Jan is not', async () => {
  // A class is made inside an app: the app is there first.
  await server.exec('define_app', { definition: { name: 'Travel', label: 'Travel' } });
  const first = await at(dan, 'app.html?app=Travel');
  assert.equal(await first.page.locator('#no-lists-title').innerText(), 'Create its first class');
  assert.ok(await first.page.locator('#first-class').isVisible());
  assert.equal(await first.page.locator('#first-class').getAttribute('href'), 'design.html?new&app=Travel');
  assert.deepEqual(first.wrong, []);
  await first.context.close();

  const plain = await at(jan, 'app.html?app=Travel');
  assert.equal(await plain.page.locator('#no-lists-title').innerText(), 'There is nothing here yet');
  assert.ok(await plain.page.locator('#first-class').isHidden());
  assert.ok(await plain.page.locator('#new-class').isHidden());
  await plain.context.close();

  // By its address, Jan is told whose it is, and the server is asked nothing more.
  const tried = await at(jan, 'design.html?new');
  assert.ok(await tried.page.locator('#trouble').isVisible());
  assert.equal(await tried.page.locator('#trouble-why').innerText(), 'Making a class is for a designer.');
  assert.deepEqual(tried.commands, ['whoami']);
  await tried.context.close();
});

test('Dan names a class, changes what it begins as, and makes it', async () => {
  const { context, page, wrong, commands, answers } = await at(dan, 'app.html?app=Travel');
  await page.click('#first-class');
  await page.waitForURL((address) => address.pathname === '/design.html');
  await ready(page);
  assert.ok(await page.locator('#begin').isVisible());
  assert.ok(await page.locator('#design').isHidden());
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'new-name', 'the cursor is in the name');

  commands.length = 0;
  await begin(page, 'Trip', 'Business trip');
  await page.locator('#design').waitFor();
  assert.deepEqual(commands, ['list_classes', 'validate_class', 'list_functions', 'get_app'], 'the page looks whether the name is free and whether the server takes it, then asks what a formula can call and what its app is called');
  assert.equal(await page.locator('#class-title').innerText(), 'Business trip');
  assert.equal(await page.locator('#class-name').innerText(), 'Trip');
  assert.equal(await page.locator('#class-version').innerText(), 'not made yet');
  assert.equal(await page.locator('#class-defined').innerText(), '');
  assert.equal(await page.locator('#to-list').getAttribute('href'), null, 'a class that is not made has no list');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Travel', 'A new class'], 'the class is made inside the app');
  assert.equal(await page.locator('#to-app').getAttribute('href'), 'app.html?app=Travel');
  assert.ok(await page.locator('#text').isVisible(), 'the page opens on the text');
  assert.equal(await page.locator('#save').innerText(), 'Create class');
  assert.ok(await page.locator('#save').isEnabled(), 'it may be made as it begins');
  assert.ok(await page.locator('#discard').isDisabled());
  assert.ok(!(await classes()).includes('Trip'), 'nothing is the server\'s yet');

  // The lists show what it begins as.
  await page.click('#as-lists');
  assert.deepEqual(await page.locator('#variables .var').evaluateAll((all) => all.map((v) => v.getAttribute('data-variable'))), ['subject']);
  assert.deepEqual(await page.locator('#states .pick .pick-label').evaluateAll((all) => all.map((one) => one.textContent)), ['The whole class', 'Draft', 'Done']);

  // Dan adds a variable, then makes the class.
  await page.click('#as-text');
  const mine = starter('Trip', 'Business trip', 'Travel');
  assert.equal(mine.app, 'Travel');
  mine.description = 'A journey for the company.';
  mine.variables.where_to = { type: 'text', label: 'Where to', list: true };
  await write(page, mine);
  assert.ok(await page.locator('#discard').isEnabled());
  assert.equal(await press(page, 'check'), 'Checked: the server takes it, with one note.', 'the new variable says nothing of what it is for, which holds nothing back');

  commands.length = 0;
  assert.equal(await press(page, 'save'), 'Made: the class Business trip, version 1.');
  assert.deepEqual(commands, ['list_classes', 'define_class', 'get_app', 'get_user']);
  assert.equal(await page.locator('#class-version').innerText(), 'version 1');
  assert.match(await page.locator('#class-defined').innerText(), /^Defined by Dan Mazur, /);
  assert.equal(await page.locator('#class-about').innerText(), 'A journey for the company.');
  assert.equal(await page.locator('#to-list').getAttribute('href'), 'list.html?class=Trip');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Travel', 'Business trip', 'Design']);
  assert.equal(await page.locator('#save').innerText(), 'Save');
  assert.ok(await page.locator('#save').isDisabled());
  const address = new URL(page.url());
  assert.equal(address.searchParams.get('class'), 'Trip', 'the class is at its own address now');
  assert.equal(address.searchParams.has('new'), false);

  const { class: held } = await server.exec('get_class', { name: 'Trip' });
  assert.equal(held.version, 1);
  assert.equal(held.defined.by, 'dan');
  assert.deepEqual(held.definition, mine);

  // From here it is a class like any other: the address opens it, and a change is version 2.
  await page.reload();
  await ready(page);
  assert.equal(await page.locator('#class-title').innerText(), 'Business trip');
  assert.equal(await page.locator('#class-version').innerText(), 'version 1');
  mine.description = 'A journey for the company, by train where there is one.';
  await write(page, mine);
  assert.equal(await page.locator('#save').innerText(), 'Save as version 2');
  assert.equal(await press(page, 'save'), 'Saved as version 2.');
  assert.deepEqual(answers, []);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a name the server has, a name it would not take and no name are said before anything begins', async () => {
  await server.exec('define_class', { definition: starter('Taken', 'Taken') });
  const { context, page, wrong, commands } = await at(dan, 'design.html?new');

  commands.length = 0;
  await begin(page, '');
  await page.locator('#begin-why:not(:empty)').waitFor();
  assert.equal(await page.locator('#begin-why').innerText(), 'Give the class a name.');
  assert.deepEqual(commands, []);

  // The server takes a name in any case, so "taken" is the class Taken.
  await begin(page, 'taken');
  await page.locator('#begin-existing-box').waitFor();
  assert.equal(await page.locator('#begin-why').innerText(), 'Taken is a class on this server already.');
  assert.equal(await page.locator('#begin-existing').getAttribute('href'), 'design.html?class=Taken');
  assert.ok(await page.locator('#begin').isVisible());

  await begin(page, 'business trip');
  await page.waitForFunction(() => (document.getElementById('begin-why')?.textContent ?? '').startsWith('The server would not'));
  assert.equal(await page.locator('#begin-why').innerText(), 'The server would not take this name: a name is letters, digits and underscores: "business trip".');
  assert.ok(await page.locator('#begin-existing-box').isHidden());
  assert.ok(await page.locator('#begin').isVisible());

  await begin(page, 'business_trip');
  await page.locator('#design').waitFor();
  assert.equal(await page.locator('#class-title').innerText(), 'business_trip', 'with no label, the name stands for it');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a class somebody else made meanwhile is not put over, and the name of a new class is what its text says', async () => {
  const { context, page, wrong, commands } = await at(dan, 'design.html?new');
  await begin(page, 'Leave');
  await page.locator('#design').waitFor();

  // Olga makes a class Leave while Dan works on his.
  const olgas = starter('Leave', 'Leave of absence');
  olgas.description = 'Olga made this one.';
  await server.exec('define_class', { definition: olgas });

  commands.length = 0;
  assert.equal(await press(page, 'save'), 'Not made: the server has a class of this name.');
  assert.deepEqual(commands, ['list_classes'], 'nothing is sent to be defined');
  assert.deepEqual(await findings(page), [['Leave is a class on this server already', '/name']]);
  assert.equal((await server.exec('get_class', { name: 'Leave' })).class.definition.description, 'Olga made this one.');
  assert.equal(await page.locator('#class-version').innerText(), 'not made yet');

  // Dan gives his another name in the text, and makes it.
  await write(page, starter('Holiday', 'Holiday'));
  assert.equal(await press(page, 'save'), 'Made: the class Holiday, version 1.');
  assert.equal(new URL(page.url()).searchParams.get('class'), 'Holiday');
  assert.equal(await page.locator('#class-name').innerText(), 'Holiday');
  assert.ok((await classes()).includes('Holiday'));
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a new class the server refuses is not made, and Discard puts it back as it began', async () => {
  const { context, page, wrong } = await at(dan, 'design.html?new');
  await begin(page, 'Ticket');
  await page.locator('#design').waitFor();
  const bad = starter('Ticket', 'Ticket');
  bad.transitions[0].to = 'nowhere';
  await write(page, bad);
  assert.equal(await press(page, 'save'), 'Not made: one thing to put right.');
  assert.equal(await page.locator('#findings-what').innerText(), 'Not made. The server refuses this class.');
  assert.deepEqual(await findings(page), [['unknown state "nowhere"', '/transitions/0/to']]);
  assert.ok(!(await classes()).includes('Ticket'));

  assert.equal(await press(page, 'discard'), 'Put back as it began.');
  assert.ok(await page.locator('#discard').isDisabled());
  assert.equal(await press(page, 'check'), 'Checked: the server takes it.');

  // A text with no name is no class.
  await write(page, { ...starter('', ''), name: '' });
  assert.equal(await press(page, 'save'), 'Not made: one thing to put right.');
  assert.deepEqual(await findings(page), [['a name is required: ""', '/name']]);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('leaving a new class asks first only when something was changed', async (t) => {
  const untouched = await at(dan, 'design.html?new');
  await begin(untouched.page, 'Untouched');
  await untouched.page.locator('#design').waitFor();
  assert.equal(await leaveByLink(untouched.page), 'left', 'what it began as is no work to lose');
  await untouched.context.close();

  const touched = await at(dan, 'design.html?new');
  await begin(touched.page, 'Touched');
  await touched.page.locator('#design').waitFor();
  await write(touched.page, { ...starter('Touched', 'Touched'), description: 'Something of Dan\'s.' });
  assert.equal(await leaveByLink(touched.page), 'asked');
  assert.ok(await touched.page.locator('#design').isVisible(), 'who stays is where they were');

  await t.test('and closing the window does the same', { skip: CLOSING_NOT_CHECKED }, async () => {
    assert.equal(await leaveByClosing(touched.page), 'asked');
    const again = await at(dan, 'design.html?new');
    await begin(again.page, 'Untouched');
    await again.page.locator('#design').waitFor();
    assert.equal(await leaveByClosing(again.page), 'left');
    await again.context.close();
  });
  await touched.context.close();
});

test('the page of a new class fits a phone, is worked by the keyboard, and shows a name as text', async () => {
  const { context, page, wrong } = await at(dan, 'design.html?new', { width: 390, height: 844 });
  assert.ok(await fits(page), 'the form does not scroll sideways at 390 px');
  assert.deepEqual(wrong, []);
  await page.keyboard.type('Note');
  await page.keyboard.press('Tab');
  await page.keyboard.type('<img src=x onerror="document.title=1">');
  await page.keyboard.press('Enter');
  await page.locator('#design').waitFor();
  assert.equal(await page.locator('#class-title').innerText(), '<img src=x onerror="document.title=1">');
  assert.equal(await page.locator('#design img:not(.cm-widgetBuffer)').count(), 0);
  assert.equal(await page.title(), 'Design: <img src=x onerror="document.title=1"> · FadoDB Workshop');
  assert.ok(await fits(page), 'nor does the design of a class that is not made yet');
  assert.deepEqual(wrong, []);
  await context.close();
});
