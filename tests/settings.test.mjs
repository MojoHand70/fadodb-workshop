// The settings in front of a real FadoDB server: Olga, a database
// administrator, finds them in the rail under the apps, as Apps stands
// over the apps, and reads the server, who administers it, its users
// and their groups. Nothing is changed from these pages yet.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { acme, signIn } from './acme.mjs';
import { fits, launch, ready, watch } from './browser.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {{ url: string }} */
let site;
/** @type {import('playwright').Browser} */
let browser;
/** What a browser holds once Olga has signed in. */
/** @type {Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>} */
let olga;

/** A name that would be markup, were it not put on the page as text. */
const MARKUP = '<img src=x onerror="document.title=1">';

before(async () => {
  server = await acme();
  site = server.site;
  await server.exec('define_app', { definition: { name: 'Helpdesk', label: 'Help desk' } });
  await server.exec('create_user', { id: 'reader', kind: 'agent', name: MARKUP, groups: ['finance'] });
  await server.exec('create_user', { id: 'eve', kind: 'person', name: 'Eve Lis', groups: ['finance', 'expense_approvers'], system_groups: ['content-administrators'] });
  await server.exec('set_user', { id: 'eve', disabled: true });
  browser = await launch();
  const context = await browser.newContext();
  await signIn(await context.newPage(), site, server, 'olga');
  olga = await context.storageState();
  await context.close();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Olga opens a page.
 *
 * @param {string} path
 * @param {{ width: number, height: number }} [viewport]
 */
async function at(path, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ storageState: olga, viewport, locale: 'en-GB', timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await page.goto(site.url + path);
  await ready(page);
  return { context, page, ...seen };
}

/**
 * Where the words of a way of the rail begin, from the left of the window.
 *
 * @param {import('playwright').Page} page
 * @param {string} way
 */
const begins = (page, way) =>
  page.locator(way).first().evaluate((one) => {
    const walker = document.createTreeWalker(one, NodeFilter.SHOW_TEXT);
    const words = document.createRange();
    words.selectNodeContents(/** @type {Node} */ (walker.nextNode()));
    return Math.round(words.getBoundingClientRect().left);
  });

test('Olga, an administrator, has Settings in the rail under the apps, and its parts set in under it', async () => {
  const { context, page, wrong } = await at('');
  assert.deepEqual(await page.locator('#rail .rail-way').allInnerTexts(), ['Apps', 'Help desk', 'Unassigned', 'Settings', 'Server', 'Admin', 'Users', 'Groups']);
  assert.deepEqual(
    await page.locator('#rail .rail-sub').evaluateAll((all) => all.map((one) => one.getAttribute('href'))),
    ['settings.html?part=server', 'settings.html?part=admin', 'settings.html?part=users', 'settings.html?part=groups'],
  );

  // Settings stands as Apps does, and a part of it as an app does under Apps.
  const [apps, app, settings, part] = [await begins(page, '#rail .rail-home'), await begins(page, '#rail .rail-app'), await begins(page, '#rail-settings'), await begins(page, '#rail .rail-sub')];
  assert.equal(settings, apps, 'the word Settings begins where the word Apps does');
  assert.equal(part, app, 'a part of the settings begins where the name of an app does');
  assert.ok(part >= settings + 8, `and to the right of the word Settings: ${part} against ${settings}`);
  const weight = (/** @type {string} */ way) => page.locator(way).first().evaluate((one) => getComputedStyle(one).fontWeight);
  assert.equal(await weight('#rail-settings'), await weight('#rail .rail-home'));
  const [last, cog] = [await page.locator('#rail-unassigned').boundingBox(), await page.locator('#rail-settings').boundingBox()];
  assert.ok(last && cog && cog.y >= last.y + last.height && cog.y < last.y + last.height + 40, 'Settings follow the apps, close under them');

  // Settings open their first part. By the keyboard too: Enter on a way of the rail opens it.
  await page.locator('#rail-settings').click();
  await page.waitForURL((address) => address.pathname === '/settings.html');
  await ready(page);
  assert.equal(await page.title(), 'Server · FadoDB Workshop');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Settings', 'Server']);
  assert.equal(await page.locator('#rail [aria-current="page"]').innerText(), 'Server');
  assert.equal(await page.locator('#server-address').innerText(), new URL(site.url).origin);
  const { version } = await (await fetch(`${site.url}v1/health`)).json();
  assert.ok(version, 'the server says its version');
  assert.equal(await page.locator('#server-version').innerText(), version);

  await page.locator('#rail-settings-users').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((address) => address.search === '?part=users');
  await ready(page);
  assert.equal(await page.locator('#rail [aria-current="page"]').innerText(), 'Users');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('an address that names no part of the settings, or one they do not have, shows the first', async () => {
  for (const path of ['settings.html', 'settings.html?part=zebra']) {
    const { context, page, wrong } = await at(path);
    assert.ok(await page.locator('#server').isVisible(), path);
    assert.equal(await page.locator('#rail [aria-current="page"]').innerText(), 'Server');
    assert.deepEqual(wrong, []);
    await context.close();
  }
});

test('Admin names the administrators and the content administrators, each with the name they sign in by', async () => {
  const { context, page, wrong } = await at('settings.html?part=admin');
  assert.equal(await page.title(), 'Admin · FadoDB Workshop');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Settings', 'Admin']);
  assert.deepEqual(await page.locator('#admin h2').allInnerTexts(), ['Administrators', 'Content administrators']);
  /** The people of a list, each as their name and the name they sign in by. */
  const people = (/** @type {string} */ list) => page.locator(`${list} .person`).evaluateAll((all) => all.map((one) => [...one.children].map((part) => part.textContent)));
  assert.deepEqual(await people('#administrators'), [['Olga Nowak', 'olga']]);
  assert.deepEqual(await people('#content-administrators'), [['Eve Lis', 'eve']]);

  // A group nobody is in says so.
  await server.exec('set_user', { id: 'eve', system_groups: [] });
  await page.reload();
  await ready(page);
  assert.deepEqual(await page.locator('#content-administrators .person').allInnerTexts(), ['Nobody']);
  await server.exec('set_user', { id: 'eve', system_groups: ['content-administrators'] });
  assert.deepEqual(wrong, []);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the page fits a phone');
  await context.close();
});

test('Users lists every user of the server, a disabled one marked, and what a name says is text', async () => {
  const { context, page, wrong } = await at('settings.html?part=users');
  assert.equal(await page.title(), 'Users · FadoDB Workshop');
  assert.deepEqual(await page.locator('#users-table th').allInnerTexts(), ['Name', 'Signs in as', 'Kind', 'System groups', 'Groups']);
  assert.deepEqual(await page.locator('#users-rows tr').evaluateAll((all) => all.map((one) => one.getAttribute('data-user'))), ['ann', 'dan', 'eve', 'jan', 'olga', 'reader']);
  /** The cells of a user's row. */
  const row = (/** @type {string} */ id) => page.locator(`#users-rows tr[data-user="${id}"] td`).allInnerTexts();
  assert.deepEqual(await row('olga'), ['Olga Nowak', 'olga', 'person', 'administrators, designers', '']);
  assert.deepEqual(await row('ann'), ['Ann Kowalska', 'ann', 'person', '', 'expense_approvers']);
  assert.deepEqual((await row('eve')).slice(1), ['eve', 'person', 'content-administrators', 'finance, expense_approvers']);
  assert.equal(await page.locator('#users-rows tr[data-user="eve"] .state').innerText(), 'Disabled');
  assert.equal(await page.locator('#users-rows .state').count(), 1, 'nobody else is marked');
  assert.deepEqual(await row('reader'), [MARKUP, 'reader', 'agent', '', 'finance']);
  assert.equal(await page.locator('#users img, #users script').count(), 0, 'a name is text');
  assert.equal(await page.title(), 'Users · FadoDB Workshop');
  assert.deepEqual(wrong, []);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the page fits a phone');
  assert.equal(await page.locator('#users-rows tr[data-user="olga"] td').nth(1).getAttribute('data-label'), 'Signs in as', 'on a phone each value stands under its heading');
  await context.close();
});

test('Groups are read off the users, each with its members; a server with none says so', async () => {
  const { context, page, wrong } = await at('settings.html?part=groups');
  assert.equal(await page.title(), 'Groups · FadoDB Workshop');
  assert.deepEqual(await page.locator('#groups-rows tr').evaluateAll((all) => all.map((one) => [...one.children].map((cell) => cell.textContent))), [
    ['expense_approvers', 'Ann Kowalska, Eve Lis'],
    ['finance', `Eve Lis, ${MARKUP}`],
  ]);
  assert.equal(await page.locator('#groups img, #groups script').count(), 0, 'a name is text');
  assert.ok(await page.locator('#no-groups').isHidden());
  assert.deepEqual(wrong, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the page fits a phone');

  // Nobody in any group: no table, and the page says there is none.
  const had = { ann: ['expense_approvers'], eve: ['finance', 'expense_approvers'], reader: ['finance'] };
  try {
    for (const id of Object.keys(had)) await server.exec('set_user', { id, groups: [] });
    await page.reload();
    await ready(page);
    assert.ok(await page.locator('#groups-box').isHidden());
    assert.equal(await page.locator('#no-groups').innerText(), 'No groups yet.');
  } finally {
    for (const [id, groups] of Object.entries(had)) await server.exec('set_user', { id, groups });
  }
  await context.close();
});
