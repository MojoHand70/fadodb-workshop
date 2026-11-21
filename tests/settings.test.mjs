// The settings in front of a real FadoDB server: Olga, a database
// administrator, finds them in the rail under the apps, as Apps stands
// over the apps, and reads the server, who administers it, its users
// and their groups. She makes a user and changes one, and makes a group
// and changes who is in it.

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

test('Olga finds a user by a part of anything their row says', async () => {
  const { context, page, wrong } = await at('settings.html?part=users');
  const find = page.getByRole('searchbox', { name: 'Find a user' });
  assert.ok(await find.isVisible());
  /** The users whose rows are shown. */
  const left = () => page.locator('#users-rows tr').evaluateAll((all) => all.filter((one) => !(/** @type {HTMLElement} */ (one).hidden)).map((one) => one.getAttribute('data-user')));
  assert.deepEqual(await left(), ['ann', 'dan', 'eve', 'jan', 'olga', 'reader']);

  // Without capitals, by a name, a group, a kind, a system group, and by two words in any order.
  await find.fill('KOWAL');
  assert.deepEqual(await left(), ['ann', 'jan']);
  await find.fill('finance');
  assert.deepEqual(await left(), ['eve', 'reader']);
  await find.fill('agent');
  assert.deepEqual(await left(), ['reader']);
  await find.fill('designers olga');
  assert.deepEqual(await left(), ['olga']);
  await find.fill('disabled');
  assert.deepEqual(await left(), ['eve']);
  assert.ok(await page.locator('#no-users-found').isHidden());

  // Nothing found is said, in the words that were typed, as text.
  await find.fill('<b>zebra</b>');
  assert.deepEqual(await left(), []);
  assert.ok(await page.locator('#users-box').isHidden());
  assert.equal(await page.locator('#no-users-found').innerText(), 'Nothing here goes by "<b>zebra</b>".');
  assert.equal(await page.locator('#no-users-found b').count(), 0);

  // Emptied, all are back.
  await find.fill('');
  assert.deepEqual(await left(), ['ann', 'dan', 'eve', 'jan', 'olga', 'reader']);
  assert.ok(await page.locator('#no-users-found').isHidden());
  assert.deepEqual(wrong, []);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the box fits a phone');
  await context.close();
});

test('the groups of a user stand in a container of their own at the right: all, those they belong to or do not, and found by a part of a name', async () => {
  const { context, page, wrong } = await at('settings.html?part=users&user=ann');
  const [user, groups] = [await page.locator('#user-card').boundingBox(), await page.locator('#user-groups-card').boundingBox()];
  assert.ok(user && groups && groups.x >= user.x + user.width && Math.abs(groups.y - user.y) < 2, 'the groups are beside the user, at the right, from the same height');
  assert.equal(await page.locator('#user-groups-card h2').innerText(), 'Groups');

  const ways = page.getByRole('radiogroup', { name: 'Which groups are shown' }).getByRole('radio');
  assert.deepEqual(await ways.evaluateAll((all) => all.map((one) => one.getAttribute('aria-label'))), ['Belongs to', "Doesn't belong to", 'All groups']);
  assert.deepEqual(await page.locator('.groups-show-one').evaluateAll((all) => all.map((one) => one.getAttribute('title'))), ['Belongs to', "Doesn't belong to", 'All groups'], 'each picture says what it is under the pointer');
  assert.ok(await page.getByRole('radio', { name: 'All groups' }).isChecked());
  /** The groups that are shown, and which of them are ticked. */
  const shown = () => page.locator('#user-groups .tick').evaluateAll((all) => all.filter((one) => !(/** @type {HTMLElement} */ (one).hidden)).map((one) => `${one.querySelector('input')?.getAttribute('data-group')}${/** @type {HTMLInputElement} */ (one.querySelector('input')).checked ? ' *' : ''}`));
  assert.deepEqual(await shown(), ['expense_approvers *', 'finance']);
  assert.equal(await page.locator('#user-groups-shown').innerText(), 'All groups');

  await page.getByRole('radio', { name: 'Belongs to', exact: true }).check();
  assert.deepEqual(await shown(), ['expense_approvers *']);
  assert.equal(await page.locator('#user-groups-shown').innerText(), 'Belongs to');
  await page.getByRole('radio', { name: "Doesn't belong to" }).check();
  assert.deepEqual(await shown(), ['finance']);
  assert.equal(await page.locator('#user-groups-shown').innerText(), "Doesn't belong to");

  // A group just ticked stays under her hand; it goes where it belongs when she asks again.
  await page.locator('#user-groups [data-group="finance"]').check();
  assert.deepEqual(await shown(), ['finance *']);
  // By the keyboard: the arrows go from one way of showing to the next.
  await page.getByRole('radio', { name: "Doesn't belong to" }).focus();
  await page.keyboard.press('ArrowRight');
  assert.ok(await page.getByRole('radio', { name: 'All groups' }).isChecked());
  assert.deepEqual(await shown(), ['expense_approvers *', 'finance *']);
  await page.getByRole('radio', { name: "Doesn't belong to" }).check();
  assert.deepEqual(await shown(), []);
  assert.equal(await page.locator('#user-groups-none').innerText(), 'In every group.');
  await page.getByRole('radio', { name: 'All groups' }).check();
  await page.locator('#user-groups [data-group="finance"]').uncheck();
  await page.locator('#user-groups [data-group="expense_approvers"]').uncheck();
  await page.getByRole('radio', { name: 'Belongs to', exact: true }).check();
  assert.deepEqual(await shown(), []);
  assert.equal(await page.locator('#user-groups-none').innerText(), 'In no group.');
  await page.getByRole('radio', { name: 'All groups' }).check();
  await page.locator('#user-groups [data-group="expense_approvers"]').check();

  // The box finds a group by a part of its name; Enter in it does not send the form.
  const find = page.getByRole('searchbox', { name: 'Find a group' });
  await find.fill('FIN');
  assert.deepEqual(await shown(), ['finance']);
  await find.press('Enter');
  assert.equal(new URL(page.url()).search, '?part=users&user=ann', 'she is still at the form');
  await find.fill('<i>zebra</i>');
  assert.deepEqual(await shown(), []);
  assert.equal(await page.locator('#user-groups-none').innerText(), 'Nothing here goes by "<i>zebra</i>".');
  assert.equal(await page.locator('#user-groups-none i').count(), 0);
  // A group added is shown, whatever is asked for.
  await page.fill('#user-group-new', 'night shift');
  await page.locator('#user-group-add').click();
  assert.deepEqual(await shown(), ['night shift *']);
  assert.ok(await page.locator('#user-groups-none').isHidden());
  await find.fill('');
  assert.deepEqual(await shown(), ['expense_approvers *', 'finance', 'night shift *']);

  // Nothing was sent: Ann is as she was.
  assert.deepEqual((await server.exec('get_user', { id: 'ann' })).user.groups, ['expense_approvers']);
  assert.deepEqual(wrong, []);

  // On a phone the groups come under the user.
  await page.setViewportSize({ width: 390, height: 844 });
  const [above, below] = [await page.locator('#user-card').boundingBox(), await page.locator('#user-groups-card').boundingBox()];
  assert.ok(above && below && below.y >= above.y + above.height && Math.abs(below.x - above.x) < 2);
  assert.ok(await fits(page), 'the page of a user fits a phone');
  await context.close();
});

// From here on Olga changes what the server holds.

/**
 * Sends a form and waits for where it leads.
 *
 * @param {import('playwright').Page} page
 * @param {string} button
 * @param {(address: URL) => boolean} where
 */
async function send(page, button, where) {
  await page.locator(button).click();
  await page.waitForURL(where);
  await ready(page);
}

test('Olga makes a user: the name they sign in by follows their name, and a link lets them set a password', async () => {
  const { context, page, wrong } = await at('settings.html?part=users');
  await page.locator('#new-user').click();
  await page.waitForURL((address) => address.searchParams.has('new'));
  await ready(page);
  assert.equal(await page.title(), 'A new user · FadoDB Workshop');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Settings', 'Users', 'A new user']);
  assert.equal(await page.locator('#to-users').getAttribute('href'), 'settings.html?part=users');
  assert.equal(await page.locator('#rail [aria-current="page"]').innerText(), 'Users');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'user-name', 'the cursor is in the name');
  assert.equal(await page.locator('#user-go').innerText(), 'Create user');
  assert.ok(await page.locator('#user-disabled-field').isHidden());
  assert.ok(await page.locator('#user-password').isHidden());

  // The name they sign in by follows the name, without the marks over letters, until Olga writes one.
  await page.fill('#user-name', 'Żaneta Łoś');
  assert.equal(await page.inputValue('#user-id'), 'zaneta.los');
  await page.fill('#user-id', 'zaneta');
  await page.fill('#user-name', 'Żaneta Łoś-Kowal');
  assert.equal(await page.inputValue('#user-id'), 'zaneta');

  // An e-mail is a person's.
  await page.selectOption('#user-kind', 'agent');
  assert.ok(await page.locator('#user-email-field').isHidden());
  await page.selectOption('#user-kind', 'person');
  await page.fill('#user-email', 'zaneta@acme.example');

  assert.deepEqual(await page.locator('#user-system .tick-label').allInnerTexts(), ['Administrators', 'Designers', 'Content administrators', 'Analysts']);
  await page.locator('#user-system [data-system="designers"]').check();
  assert.deepEqual(await page.locator('#user-groups .tick-label').allInnerTexts(), ['expense_approvers', 'finance']);
  await page.locator('#user-groups [data-group="finance"]').check();
  // Another group is added with Enter, which does not send the form.
  await page.fill('#user-group-new', 'night shift');
  await page.press('#user-group-new', 'Enter');
  assert.deepEqual(await page.locator('#user-groups .tick-label').allInnerTexts(), ['expense_approvers', 'finance', 'night shift']);
  assert.ok(await page.locator('#user-groups [data-group="night shift"]').isChecked());
  assert.equal(await page.inputValue('#user-group-new'), '');
  assert.ok(new URL(page.url()).searchParams.has('new'), 'the form was not sent');

  // Enter in the name sends it; the page of the new user follows.
  await page.press('#user-name', 'Enter');
  await page.waitForURL((address) => address.searchParams.get('user') === 'zaneta');
  await ready(page);
  const { user } = await server.exec('get_user', { id: 'zaneta' });
  assert.deepEqual({ ...user, groups: [...user.groups].sort() }, { id: 'zaneta', kind: 'person', name: 'Żaneta Łoś-Kowal', email: 'zaneta@acme.example', groups: ['finance', 'night shift'], system_groups: ['designers'], disabled: false });
  assert.equal(await page.title(), 'Żaneta Łoś-Kowal · FadoDB Workshop');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Settings', 'Users', 'Żaneta Łoś-Kowal']);
  assert.equal(await page.locator('#user-go').innerText(), 'Save');
  // Who a user is and of what kind is said once.
  assert.ok(await page.locator('#user-id').evaluate((one) => /** @type {HTMLInputElement} */ (one).readOnly));
  assert.ok(await page.locator('#user-kind').isDisabled());

  // A link for her to set her password: shown once, marked to be copied, and the server's page takes it.
  assert.ok(await page.locator('#user-link-box').isHidden());
  await page.locator('#user-link-go').click();
  await page.locator('#user-link-box').waitFor();
  const link = await page.inputValue('#user-link');
  assert.match(link, new RegExp(`^${new URL(site.url).origin}/auth/password\\?link=[A-Za-z0-9_%-]+$`));
  assert.match(await page.locator('#user-link-ends').innerText(), /^Good once, until .+\. It is shown this once\.$/);
  const marked = () => page.locator('#user-link').evaluate((one) => [/** @type {HTMLInputElement} */ (one).selectionStart, /** @type {HTMLInputElement} */ (one).selectionEnd]);
  assert.deepEqual(await marked(), [0, link.length]);
  await page.locator('#user-name').focus();
  await page.locator('#user-link-copy').click();
  assert.deepEqual(await marked(), [0, link.length], 'Copy marks the link, for a browser that keeps its clipboard to itself');
  assert.deepEqual(wrong, []);
  const hers = await browser.newContext();
  const there = await hers.newPage();
  await there.goto(link);
  assert.ok(await there.locator('#password').isVisible(), 'the server\'s page asks her for a password');
  await hers.close();

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the page of a user fits a phone');
  await context.close();
});

test('what the server refuses is said in its words: a name that is taken, and the last administrator', async () => {
  const { context, page, wrong } = await at('settings.html?part=users&new');
  await page.locator('#user-go').click();
  assert.equal(await page.locator('#user-why').innerText(), 'Give the name the user signs in by.');
  await page.fill('#user-name', 'Olga the second');
  await page.fill('#user-id', 'olga');
  await page.locator('#user-go').click();
  await page.locator('#user-why:not(:empty)').waitFor();
  assert.match(await page.locator('#user-why').innerText(), /^The server said: a user "olga" exists\./);
  assert.ok(new URL(page.url()).searchParams.has('new'), 'she is still at the form');
  assert.equal((await server.exec('get_user', { id: 'olga' })).user.name, 'Olga Nowak');

  // Olga may not take the last administrator away, herself.
  await page.goto(`${site.url}settings.html?part=users&user=olga`);
  await ready(page);
  assert.ok(await page.locator('#user-system [data-system="administrators"]').isChecked());
  await page.locator('#user-system [data-system="administrators"]').uncheck();
  await page.locator('#user-go').click();
  await page.locator('#user-why:not(:empty)').waitFor();
  assert.match(await page.locator('#user-why').innerText(), /^The server said: the change would leave the database without an administrator\. .*make another user an administrator first\.$/);
  assert.deepEqual((await server.exec('get_user', { id: 'olga' })).user.system_groups, ['administrators', 'designers']);

  // A user the server does not have.
  await page.goto(`${site.url}settings.html?part=users&user=nobody`);
  await ready(page);
  assert.ok(await page.locator('#trouble').isVisible());
  assert.match(await page.locator('#trouble-why').innerText(), /no user "nobody"/);
  // The refusals are the server's answers, which the browser notes as failed requests: nothing else went wrong.
  assert.deepEqual(wrong.filter((one) => !/create_user|set_user|get_user/.test(one)), []);
  await context.close();
});

test('Olga changes a user: their name, their groups, and whether they may sign in', async () => {
  const { context, page, wrong } = await at('settings.html?part=users');
  await page.locator('#users-rows tr[data-user="jan"] .title a').click();
  await page.waitForURL((address) => address.searchParams.get('user') === 'jan');
  await ready(page);
  assert.equal(await page.inputValue('#user-name'), 'Jan Kowalski');
  assert.equal(await page.inputValue('#user-id'), 'jan');
  assert.ok(await page.locator('#user-disabled-field').isVisible());
  assert.ok(await page.locator('#user-password').isVisible());

  await page.fill('#user-name', 'Jan Kowalski-Lis');
  await page.fill('#user-email', 'Jan@Acme.example');
  await page.locator('#user-system [data-system="analysts"]').check();
  await page.locator('#user-groups [data-group="expense_approvers"]').check();
  // A group typed and not added is meant too.
  await page.fill('#user-group-new', 'travel');
  await page.locator('#user-disabled').check();
  await send(page, '#user-go', (address) => address.search === '?part=users');
  const { user } = await server.exec('get_user', { id: 'jan' });
  assert.deepEqual({ ...user, groups: [...user.groups].sort() }, { id: 'jan', kind: 'person', name: 'Jan Kowalski-Lis', email: 'jan@acme.example', groups: ['expense_approvers', 'travel'], system_groups: ['analysts'], disabled: true });
  const row = page.locator('#users-rows tr[data-user="jan"]');
  assert.equal(await row.locator('.title a').innerText(), 'Jan Kowalski-Lis');
  assert.equal(await row.locator('.state').innerText(), 'Disabled');

  // A user who may not sign in is given no link; let in again, he is.
  await row.locator('.title a').click();
  await page.waitForURL((address) => address.searchParams.get('user') === 'jan');
  await ready(page);
  assert.ok(await page.locator('#user-password').isHidden());
  assert.ok(await page.locator('#user-disabled').isChecked());
  await page.locator('#user-disabled').uncheck();
  await page.locator('#user-system [data-system="analysts"]').uncheck();
  await page.locator('#user-groups [data-group="travel"]').uncheck();
  await page.locator('#user-groups [data-group="expense_approvers"]').uncheck();
  await page.fill('#user-name', 'Jan Kowalski');
  await page.fill('#user-email', '');
  await send(page, '#user-go', (address) => address.search === '?part=users');
  assert.deepEqual((await server.exec('get_user', { id: 'jan' })).user, { id: 'jan', kind: 'person', name: 'Jan Kowalski', groups: [], system_groups: [], disabled: false });
  assert.equal(await page.locator('#users-rows tr[data-user="jan"] .state').count(), 0);

  // What a name says is text in a form too; an agent has no e-mail and no password.
  await page.goto(`${site.url}settings.html?part=users&user=reader`);
  await ready(page);
  assert.equal(await page.inputValue('#user-name'), MARKUP);
  assert.equal(await page.locator('#crumbs [aria-current]').innerText(), MARKUP);
  assert.equal(await page.locator('#user img, #crumbs img').count(), 0);
  assert.ok(await page.locator('#user-email-field').isHidden());
  assert.ok(await page.locator('#user-password').isHidden());
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Olga makes a group by ticking who is in it, changes who is in it, and a group nobody is in is gone', async () => {
  const { context, page, wrong } = await at('settings.html?part=groups');
  await page.locator('#new-group').click();
  await page.waitForURL((address) => address.searchParams.has('new'));
  await ready(page);
  assert.equal(await page.title(), 'A new group · FadoDB Workshop');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Settings', 'Groups', 'A new group']);
  assert.equal(await page.locator('#rail [aria-current="page"]').innerText(), 'Groups');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'group-name', 'the cursor is in the name');
  assert.equal(await page.locator('#group-go').innerText(), 'Create group');
  assert.equal(await page.locator('#group-members img').count(), 0, 'a name is text');

  // A group is its members: it needs a name, and somebody in it; a name that is taken is said, with the way to it.
  await page.locator('#group-go').click();
  assert.equal(await page.locator('#group-why').innerText(), 'Give the group a name.');
  await page.fill('#group-name', 'auditors');
  await page.locator('#group-go').click();
  assert.equal(await page.locator('#group-why').innerText(), 'Tick who is in it: a group is the people in it.');
  await page.locator('#group-members [data-user="dan"]').check();
  await page.fill('#group-name', 'finance');
  await page.locator('#group-go').click();
  await page.locator('#group-existing-box').waitFor();
  assert.equal(await page.locator('#group-why').innerText(), 'finance is a group on this server already.');
  assert.equal(await page.locator('#group-existing').getAttribute('href'), 'settings.html?part=groups&group=finance');
  assert.deepEqual((await server.exec('get_user', { id: 'dan' })).user.groups, [], 'nothing was changed');

  await page.fill('#group-name', 'auditors');
  await page.locator('#group-members [data-user="jan"]').check();
  await page.press('#group-name', 'Enter');
  await page.waitForURL((address) => address.search === '?part=groups');
  await ready(page);
  assert.deepEqual(await page.locator('#groups-rows tr[data-group="auditors"] td').allInnerTexts(), ['auditors', 'Dan Mazur, Jan Kowalski']);

  // Its page: who is in it is ticked, and its name is in the way above.
  await page.locator('#groups-rows tr[data-group="auditors"] .title a').click();
  await page.waitForURL((address) => address.searchParams.get('group') === 'auditors');
  await ready(page);
  assert.equal(await page.title(), 'auditors · FadoDB Workshop');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Settings', 'Groups', 'auditors']);
  assert.ok(await page.locator('#group-name-field').isHidden());
  assert.equal(await page.locator('#group-go').innerText(), 'Save');
  assert.deepEqual(await page.locator('#group-members .check:checked').evaluateAll((all) => all.map((one) => one.getAttribute('data-user'))), ['dan', 'jan']);
  assert.equal(await page.locator('#group-members .tick-label').first().innerText(), 'Ann Kowalska ann', 'a member is named, with the name they sign in by');

  // Ann comes in and Dan goes out. What somebody else gave Ann while the page was open is kept.
  await server.exec('set_user', { id: 'ann', groups: ['expense_approvers', 'night watch'] });
  await page.locator('#group-members [data-user="ann"]').check();
  await page.locator('#group-members [data-user="dan"]').uncheck();
  await send(page, '#group-go', (address) => address.search === '?part=groups');
  const groups = async (/** @type {string} */ id) => [...(await server.exec('get_user', { id })).user.groups].sort();
  assert.deepEqual(await groups('ann'), ['auditors', 'expense_approvers', 'night watch']);
  assert.deepEqual(await groups('dan'), []);
  assert.deepEqual(await groups('jan'), ['auditors']);
  assert.deepEqual(await page.locator('#groups-rows tr[data-group="auditors"] td').allInnerTexts(), ['auditors', 'Ann Kowalska, Jan Kowalski']);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${site.url}settings.html?part=groups&group=auditors`);
  await ready(page);
  assert.ok(await fits(page), 'the page of a group fits a phone');
  await page.setViewportSize({ width: 1280, height: 800 });

  // Nobody in it: the group is gone.
  for (const id of ['ann', 'jan']) await page.locator(`#group-members [data-user="${id}"]`).uncheck();
  await send(page, '#group-go', (address) => address.search === '?part=groups');
  assert.equal(await page.locator('#groups-rows tr[data-group="auditors"]').count(), 0);
  assert.deepEqual(await groups('ann'), ['expense_approvers', 'night watch']);
  assert.deepEqual(await groups('jan'), []);
  await server.exec('set_user', { id: 'ann', groups: ['expense_approvers'] });

  // A group nobody is in has no page.
  await page.goto(`${site.url}settings.html?part=groups&group=zebra`);
  await ready(page);
  assert.equal(await page.locator('#trouble-why').innerText(), 'Nobody on the server is in a group zebra.');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the name a person signs in by is made from their name', async () => {
  const { idFrom } = await import('../pages/shell.js');
  assert.equal(idFrom('Eve Lis'), 'eve.lis');
  assert.equal(idFrom('  Żaneta   Łoś-Kowal '), 'zaneta.los.kowal');
  assert.equal(idFrom('Invoice reader 2'), 'invoice.reader.2');
  assert.equal(idFrom(''), '');
});
