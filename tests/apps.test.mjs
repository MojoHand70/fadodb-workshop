// Apps, from a server that has none: Dan, a designer, is asked to
// create the first one, makes it, and makes its first class inside it,
// in front of a real FadoDB server. Jan, who is no designer, is told
// that there is none yet.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { nameFrom } from '../pages/apps.js';
import { acme, signIn } from './acme.mjs';
import { fits, launch, ready, watch } from './browser.mjs';

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

test('the name formulas write is made from the name people read', () => {
  assert.equal(nameFrom('Help desk'), 'HelpDesk');
  assert.equal(nameFrom('Expenses'), 'Expenses');
  assert.equal(nameFrom('  purchase   orders (EU) '), 'PurchaseOrdersEU');
  assert.equal(nameFrom('Zamówienia łódzkie'), 'ZamowieniaLodzkie', 'without the marks over letters');
  assert.equal(nameFrom('2026 budget'), 'App2026Budget', 'a name does not begin with a digit');
  assert.equal(nameFrom(''), '');
});

test('a server with no app asks a designer to create the first one, and tells anybody else there is none', async () => {
  assert.deepEqual((await server.exec('list_apps')).apps, []);
  const first = await at(dan, '');
  assert.ok(await first.page.locator('#first-app').isVisible());
  assert.equal(await first.page.locator('#first-title').innerText(), 'Create your first FadoDB application');
  assert.ok(await first.page.locator('#first-go').isVisible());
  assert.ok(await first.page.locator('#first-about').isHidden(), 'the words and the button say it: no sentence explains what an app is');
  assert.equal(await first.page.locator('#first-go').getAttribute('href'), 'app.html?new');
  assert.ok(await first.page.locator('#apps').isHidden(), 'there is no tile, and none that adds one beside nothing');
  // The engine's own class is there from the first day, in no app: it stands under Unassigned.
  assert.deepEqual(await first.page.locator('#rail .rail-way').allInnerTexts(), ['Apps', 'Unassigned']);
  assert.equal(await first.page.locator('#rail-unassigned').getAttribute('href'), 'app.html?unassigned');
  assert.deepEqual(first.wrong, []);
  await first.page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(first.page));
  await first.context.close();

  const plain = await at(jan, '');
  assert.equal(await plain.page.locator('#first-title').innerText(), 'There is no app here yet');
  assert.ok(await plain.page.locator('#first-go').isHidden());
  assert.equal(await plain.page.locator('.class-name').count(), 0);
  await plain.context.close();

  // Under Unassigned a designer reads the name of each class and the way to its design. A class is made in an app: nothing here adds one.
  const loose = await at(dan, 'app.html?unassigned');
  assert.equal(await loose.page.locator('#app-title').innerText(), 'Unassigned');
  assert.equal(await loose.page.locator('#rail [aria-current="page"]').innerText(), 'Unassigned');
  const engines = loose.page.locator('.tile[data-class="Substitution"]');
  assert.equal(await engines.locator('.class-name').innerText(), 'Substitution');
  assert.equal(await engines.locator('.tile-design-way').getAttribute('href'), 'design.html?class=Substitution');
  assert.equal(await loose.page.locator('#add-class, #new-class, #first-class, #app-name').locator('visible=true').count(), 0);
  assert.deepEqual(loose.wrong, []);
  await loose.context.close();

  // By its address, Jan is told whose it is, and the server is asked nothing more.
  const tried = await at(jan, 'app.html?new');
  assert.ok(await tried.page.locator('#trouble').isVisible());
  assert.equal(await tried.page.locator('#trouble-why').innerText(), 'Making an app is for a designer.');
  assert.deepEqual(tried.commands, ['whoami']);
  await tried.context.close();
});

test('Dan makes the first app, and its first class inside it', async () => {
  const { context, page, wrong, answers, commands } = await at(dan, '');
  await page.click('#first-go');
  await page.waitForURL((address) => address.pathname === '/app.html');
  await ready(page);
  assert.ok(await page.locator('#begin').isVisible());
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'new-label', 'the cursor is in the name');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'A new app']);

  // The name people read comes first; the name formulas write follows it.
  await page.fill('#new-label', 'Help desk');
  assert.equal(await page.inputValue('#new-name'), 'HelpDesk');
  // Once Dan writes that name himself, it is his.
  await page.fill('#new-name', 'Helpdesk');
  await page.fill('#new-label', 'The help desk');
  assert.equal(await page.inputValue('#new-name'), 'Helpdesk');
  await page.fill('#new-about', 'Requests to IT, from the first message to the fix.');

  commands.length = 0;
  await page.press('#new-about', 'Enter');
  await page.waitForURL((address) => address.search === '?app=Helpdesk');
  await ready(page);
  assert.deepEqual(commands.slice(0, 2), ['list_apps', 'define_app'], 'the page looks whether the name is free, then makes the app');
  const { app } = await server.exec('get_app', { name: 'Helpdesk' });
  assert.deepEqual(app.definition, { name: 'Helpdesk', label: 'The help desk', description: 'Requests to IT, from the first message to the fix.' });
  assert.equal(app.defined.by, 'dan');

  // The page of the app: nothing in it yet, and the way to its first class.
  assert.equal(await page.locator('#app-title').innerText(), 'The help desk');
  assert.equal(await page.locator('#app-about').innerText(), 'Requests to IT, from the first message to the fix.');
  assert.equal(await page.locator('#app-name').innerText(), 'Helpdesk');
  assert.equal(await page.locator('#no-lists-title').innerText(), 'Create its first class');
  assert.ok(await page.locator('#no-lists-about').isHidden(), 'and no sentence explains what a class is');
  assert.deepEqual(await page.locator('#rail .rail-way').allInnerTexts(), ['Apps', 'The help desk', 'Unassigned']);
  assert.equal(await page.locator('#first-class').getAttribute('href'), 'design.html?new&app=Helpdesk');

  await page.click('#first-class');
  await page.waitForURL((address) => address.pathname === '/design.html');
  await ready(page);
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'The help desk', 'A new class']);
  await page.fill('#new-name', 'Ticket');
  await page.fill('#new-label', 'Ticket');
  await page.press('#new-label', 'Enter');
  await page.locator('#design').waitFor();
  await page.evaluate(() => (/** @type {HTMLElement} */ (document.getElementById('said')).textContent = ''));
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('said')?.textContent !== '');
  assert.equal(await page.locator('#said').innerText(), 'Made: the class Ticket, version 1.');
  assert.equal((await server.exec('get_class', { name: 'Ticket' })).class.definition.app, 'Helpdesk', 'the class says which app it belongs to');
  assert.deepEqual((await server.exec('list_classes', { app: 'Helpdesk' })).classes, ['Ticket']);

  // Back in the app, the class is a list of it; and the first page shows the app with it.
  await page.locator('#to-app').click();
  await page.waitForURL((address) => address.pathname === '/app.html');
  await ready(page);
  const ticket = page.locator('.tile[data-class="Ticket"]');
  assert.equal(await ticket.locator('.tile-name').innerText(), 'Ticket');
  assert.equal(await ticket.locator('.class-name').innerText(), 'Ticket');
  assert.equal(await ticket.locator('.tile-design-way').getAttribute('href'), 'design.html?class=Ticket');
  // Another class is made from here as an app is on the first page: by the last tile, and by no button beside the name.
  assert.equal(await page.locator('#lists > li').last().getAttribute('id'), 'add-class');
  assert.equal(await page.locator('#add-class .tile-add-title').innerText(), 'Add a class');
  assert.equal(await page.locator('#add-class #new-class').innerText(), 'New class');
  assert.equal(await page.locator('#new-class').getAttribute('href'), 'design.html?new&app=Helpdesk');
  assert.equal(await page.locator('.home-head #new-class').count(), 0);
  assert.ok(await page.locator('#no-lists').isHidden());

  await page.locator('#to-home').click();
  await page.waitForURL(site.url);
  await ready(page);
  assert.ok(await page.locator('#first-app').isHidden());
  const tile = page.locator('.tile[data-app="Helpdesk"]');
  assert.equal(await tile.locator('.tile-name').innerText(), 'The help desk');
  assert.equal(await tile.locator('.tile-foot').innerText(), '1 class');
  assert.equal(await page.locator('#new-app').getAttribute('href'), 'app.html?new', 'the tile that adds an app stands after the apps');
  assert.deepEqual(answers, []);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a name the server has, or would not take, is said at the form, and nothing is made', async () => {
  const { context, page, wrong } = await at(dan, 'app.html?new');
  // Under a name the server has, a definition would be the next version of that app: the page looks first.
  await page.fill('#new-label', 'helpdesk');
  await page.press('#new-label', 'Enter');
  await page.locator('#begin-existing-box').waitFor();
  assert.equal(await page.locator('#begin-why').innerText(), 'Helpdesk is an app on this server already.');
  assert.equal(await page.locator('#begin-existing').getAttribute('href'), 'app.html?app=Helpdesk');
  assert.equal((await server.exec('get_app', { name: 'Helpdesk' })).app.version, 1, 'the app is as it was');

  // What may be a name is the server's to say, in its words.
  await page.fill('#new-name', 'two words');
  await page.press('#new-name', 'Enter');
  await page.waitForFunction(() => (document.getElementById('begin-why')?.textContent ?? '').startsWith('The server would not take this'));
  assert.match(await page.locator('#begin-why').innerText(), /a name is letters, digits and underscores/);
  assert.ok(await page.locator('#begin-existing-box').isHidden());

  await page.fill('#new-label', '');
  await page.fill('#new-name', '');
  await page.press('#new-name', 'Enter');
  assert.equal(await page.locator('#begin-why').innerText(), 'Give the app a name.');
  assert.deepEqual((await server.exec('list_apps')).apps, ['Helpdesk']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('an app the server does not have is answered in the server\'s words', async () => {
  const { context, page, wrong, answers } = await at(jan, 'app.html?app=Nope');
  assert.ok(await page.locator('#trouble').isVisible());
  assert.match(await page.locator('#trouble-why').innerText(), /unknown app "Nope"/);
  assert.deepEqual(answers.map((a) => a.path), ['/v1/get_app']);
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home']);
  assert.deepEqual(wrong, []);
  await context.close();
});
