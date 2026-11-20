// The first page in front of a real FadoDB server: Ann signs in on the
// server's own page, comes back, and sees her name and the apps of the
// server, each with the lists she opens in it. She finds an app by a
// part of its name or of a list's. That a list has a class behind it is
// the designer's to know: no page says the word to her.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acme, signIn } from './acme.mjs';
import { fits, launch, open, ready, watch } from './browser.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** Where Workshop's pages answer: the server's own address. */
/** @type {{ url: string }} */
let site;
/** @type {import('playwright').Browser} */
let browser;

before(async () => {
  server = await acme();
  const expense = JSON.parse(await readFile(new URL('./fixtures/expense.json', import.meta.url), 'utf8'));
  await server.exec('define_app', { definition: { name: 'Expenses', label: 'Expenses', description: 'What employees paid for the company, approved and paid back.' } });
  await server.exec('define_class', { definition: { ...expense, app: 'Expenses' } });
  // An app nothing belongs to yet.
  await server.exec('define_app', { definition: { name: 'Helpdesk', label: 'Help desk' } });
  site = server.site;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * @param {import('playwright').Page} page
 */
const annSignsIn = (page) => signIn(page, site, server);

test('a person who is not signed in is offered to sign in', async () => {
  const { context, page, wrong, answers } = await open(browser, site.url);
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, [{ status: 401, path: '/v1/whoami' }]);
  assert.ok(await page.locator('#signed-out').isVisible());
  assert.ok(await page.locator('#home').isHidden());
  assert.equal(await page.locator('#sign-in').getAttribute('href'), '/auth/signin?next=%2F');
  assert.ok(await fits(page));
  await context.close();
});

test('Ann signs in on the server\'s page and sees her name and the apps, each with its lists', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const { wrong } = watch(page);
  await annSignsIn(page);

  assert.equal(page.url(), site.url, 'she comes back to the page she left');
  assert.equal(await page.locator('#who-name').innerText(), 'Ann Kowalska');
  assert.ok(await page.locator('#home').isVisible());
  assert.ok(await page.locator('#signed-out').isHidden());
  assert.equal(await page.locator('#home h1').innerText(), 'Apps');

  // An app is a tile: its name, what it is for, and the lists she opens in it.
  assert.deepEqual(await page.locator('.tile .tile-name').allInnerTexts(), ['Expenses', 'Help desk']);
  const expenses = page.locator('.tile[data-app="Expenses"]');
  assert.equal(await expenses.locator('.tile-name').getAttribute('href'), 'app.html?app=Expenses');
  assert.equal(await expenses.locator('.tile-about').innerText(), 'What employees paid for the company, approved and paid back.');
  assert.deepEqual(await expenses.locator('.tile-list .tile-list-name').allInnerTexts(), ['Expense']);
  assert.equal(await expenses.locator('.tile-list').getAttribute('href'), 'list.html?class=Expense');
  assert.equal(await expenses.locator('.tile-count').innerText(), '0', 'how many she may see');
  assert.equal(await page.locator('.tile[data-app="Helpdesk"] .tile-list').count(), 0);

  // The rail at the side names the apps too.
  assert.deepEqual(await page.locator('#rail .rail-way').allInnerTexts(), ['Apps', 'Expenses', 'Help desk']);
  assert.equal(await page.locator('#rail [aria-current="page"]').innerText(), 'Apps');

  // What belongs to no app comes after the apps: here the engine's own Substitution.
  assert.equal(await page.locator('#loose-title').innerText(), 'Other lists');
  assert.deepEqual(await page.locator('#loose-lists .loose-name').allInnerTexts(), ['Substitutions']);

  // Making an app or a class is a designer's: nothing offers it to her.
  assert.equal(await page.locator('#add-app, #new-app').count(), 0);
  assert.equal(await page.locator('.status').count(), 0, 'the page says nothing of how far Workshop is: the README does');
  assert.equal(await page.locator('#crumbs').count(), 0, 'the first page is where the way begins');
  assert.deepEqual(wrong, []);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the apps fit a phone');
  await context.close();
});

test('signing out ends the session on the server', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { wrong } = watch(page);
  await annSignsIn(page);

  await page.click('#sign-out');
  await page.waitForFunction(() => !document.getElementById('signed-out')?.hidden);
  assert.ok(await page.locator('#who').isHidden());
  const status = await page.evaluate(async () => (await fetch('/v1/whoami', { method: 'POST', body: '{}' })).status);
  assert.equal(status, 401, 'the server no longer knows the session');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what an app and a class say is shown as text, never run as markup', async () => {
  await server.exec('define_app', { definition: { name: 'Trap', label: '<img src=x onerror="document.title=1">', description: '<script>document.title = "run"</script>' } });
  await server.exec('define_class', {
    definition: {
      name: 'Snare',
      app: 'Trap',
      label: '<b onmouseover="document.title=2">bold</b>',
      description: '<script>document.title = "run"</script>',
      variables: { note: { type: 'text' } },
    },
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const { wrong } = watch(page);
  await annSignsIn(page);
  const trap = page.locator('.tile[data-app="Trap"]');
  assert.equal(await trap.locator('.tile-name').innerText(), '<img src=x onerror="document.title=1">');
  assert.equal(await trap.locator('.tile-about').innerText(), '<script>document.title = "run"</script>');
  assert.equal(await trap.locator('.tile-list-name').innerText(), '<b onmouseover="document.title=2">bold</b>');
  assert.equal(await page.locator('#rail .rail-app').nth(2).innerText(), '<img src=x onerror="document.title=1">');
  assert.equal(await page.title(), 'FadoDB Workshop');
  assert.equal(await page.locator('#home img, #home script, #home b, #rail img').count(), 0);

  // The page of the app says the same words, as text.
  await page.goto(`${site.url}app.html?app=Trap`);
  await ready(page);
  assert.equal(await page.locator('#app-title').innerText(), '<img src=x onerror="document.title=1">');
  assert.equal(await page.locator('.tile[data-class="Snare"] .tile-name').innerText(), '<b onmouseover="document.title=2">bold</b>');
  assert.equal(await page.locator('main img, main script, main b').count(), 0);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a list goes by the word for many of its documents, and the way back names its app', async () => {
  await server.exec('define_app', { definition: { name: 'Travel', label: 'Travel', description: 'Journeys for the company.' } });
  await server.exec('define_class', {
    definition: {
      name: 'Trip',
      app: 'Travel',
      label: 'Business trip',
      plural: 'Business trips',
      description: 'A journey for the company.',
      variables: { where: { type: 'text' } },
      states: { initial: 'draft', list: ['draft'] },
    },
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const { wrong } = watch(page);
  await annSignsIn(page);
  const travel = page.locator('.tile[data-app="Travel"]');
  assert.equal(await travel.locator('.tile-list-name').innerText(), 'Business trips');

  // The tile leads to the app, where each list is a tile of its own.
  await travel.locator('.tile-name').click();
  await page.waitForURL((address) => address.pathname === '/app.html');
  await ready(page);
  assert.equal(await page.locator('#app-title').innerText(), 'Travel');
  assert.equal(await page.locator('#app-about').innerText(), 'Journeys for the company.');
  assert.equal(await page.title(), 'Travel · FadoDB Workshop');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Travel']);
  assert.equal(await page.locator('#rail [aria-current="page"]').innerText(), 'Travel');
  const trips = page.locator('.tile[data-class="Trip"]');
  assert.equal(await trips.locator('.tile-name').innerText(), 'Business trips');
  assert.equal(await trips.locator('.tile-about').innerText(), 'A journey for the company.');
  assert.equal(await page.locator('#new-class, #first-class, #app-name, .tile-design').locator('visible=true').count(), 0, 'nothing of the designer\'s is shown to her');

  await trips.locator('.tile-name').click();
  await page.waitForURL((address) => address.pathname === '/list.html');
  await ready(page);
  assert.equal(await page.locator('#list-title').innerText(), 'Business trips');
  assert.equal(await page.title(), 'Business trips · FadoDB Workshop');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Travel', 'Business trips']);
  assert.equal(await page.locator('#to-app').getAttribute('href'), 'app.html?app=Travel');
  assert.deepEqual(wrong, []);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${site.url}app.html?app=Travel`);
  await ready(page);
  assert.ok(await fits(page), 'the page of an app fits a phone');
  await context.close();
});

test('Ann finds an app by a part of its name or of a list\'s, and Enter opens the first that is left', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const { wrong } = watch(page);
  await annSignsIn(page);
  /** The apps that are shown, by name. */
  const apps = () => page.locator('.tile[data-app]:visible').evaluateAll((all) => all.map((one) => one.getAttribute('data-app')));
  /** The lists of no app that are shown, by the name of the class behind each. */
  const others = () => page.locator('.loose-list:visible').evaluateAll((all) => all.map((one) => one.getAttribute('data-class')));
  const all = await apps();
  assert.deepEqual(all, ['Expenses', 'Helpdesk', 'Trap', 'Travel']);
  assert.deepEqual(await others(), ['Substitution']);
  const find = page.getByRole('searchbox', { name: 'Find an app' });
  assert.ok(await find.isVisible());

  // Without capitals, by a word of what the app is for, and by a list in it.
  await find.fill('EXPEN');
  assert.deepEqual(await apps(), ['Expenses']);
  assert.deepEqual(await others(), []);
  assert.ok(await page.locator('#none-found').isHidden());
  await find.fill('paid back');
  assert.deepEqual(await apps(), ['Expenses']);
  await find.fill('business trip');
  assert.deepEqual(await apps(), ['Travel'], 'by the name of a list of the app');
  // A list that belongs to no app is found too.
  await find.fill('substit');
  assert.deepEqual(await apps(), []);
  assert.deepEqual(await others(), ['Substitution']);
  assert.ok(await page.locator('#none-found').isHidden());

  // Nothing found is said, in the words that were typed, as text.
  await find.fill('<b>zebra</b>');
  assert.deepEqual(await apps(), []);
  assert.equal(await page.locator('#none-found').innerText(), 'Nothing here goes by "<b>zebra</b>".');
  assert.equal(await page.locator('#none-found b').count(), 0);

  // Emptied, all are back.
  await find.fill('');
  assert.deepEqual(await apps(), all);
  assert.ok(await page.locator('#none-found').isHidden());

  // Ann knows an app by its words. The name a designer gave a class is not hers to search by.
  await find.fill('snare');
  assert.deepEqual(await apps(), [], 'the class Snare says other words to people');

  await find.fill('expen');
  await find.press('Enter');
  await page.waitForURL((address) => address.pathname === '/app.html');
  assert.equal(new URL(page.url()).search, '?app=Expenses');
  assert.deepEqual(wrong, []);

  await page.goto(site.url);
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the box fits a phone');
  await context.close();
});

test('no page says the word class to Ann: it is a designer\'s word', async () => {
  const { document: made } = await server.exec('create', {
    class: 'Expense',
    values: { what: 'Taxi to the station', bought_on: '2026-11-15', cost_centre: 'Sales', net: '86.50 PLN', vat_rate: '0.08' },
  }, 'jan');
  await server.exec('transition', { class: 'Expense', id: made.id, transition: 'submit' }, 'jan');
  // A list that belongs to no app is read too: it stands after the apps.
  await server.exec('define_class', { definition: { name: 'Memo', label: 'Memo', plural: 'Memos', description: 'A note to a colleague.', variables: { subject: { type: 'text' } }, states: { initial: 'draft', list: ['draft'] } } });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const { wrong } = watch(page);
  await annSignsIn(page);
  /**
   * What a person reads and hears of the page: its words, its title, and
   * what is said of a thing to whoever cannot see it. These are
   * Workshop's own words and those of the classes of this test. The
   * engine's own class, Substitution, is left out: what it says of
   * itself is the engine's, written for those who build on it ("on
   * which classes", "the engine brings this class"), and is not
   * Workshop's to change.
   */
  const said = () =>
    page.evaluate(() => {
      /** @type {HTMLElement | null} */
      const engines = document.querySelector('[data-class="Substitution"]');
      if (engines) engines.hidden = true;
      const spoken = [...document.querySelectorAll('[aria-label], [title], [placeholder]')]
        .filter((one) => /** @type {HTMLElement} */ (one).offsetParent !== null)
        .map((one) => [one.getAttribute('aria-label'), one.getAttribute('title'), one.getAttribute('placeholder')].join(' '));
      const words = [document.title, document.body.innerText, ...spoken].join('\n');
      if (engines) engines.hidden = false;
      return words;
    });
  const pages = ['', 'app.html?app=Expenses', 'app.html?app=Helpdesk', 'app.html?app=Nope', 'app.html', 'app.html?new', 'list.html?class=Expense', 'list.html?class=Trip', `document.html?class=Expense&id=${encodeURIComponent(made.id)}`, 'document.html?class=Expense&new', 'list.html', 'document.html'];
  for (const path of pages) {
    await page.goto(site.url + path);
    await ready(page);
    const words = await said();
    // The app Trap of the test above says markup of its own making; the word is looked for as a word.
    assert.doesNotMatch(words, /\bclass(es)?\b/i, `${path || 'the first page'} says: ${/.{0,60}\bclass(es)?\b.{0,60}/is.exec(words)?.[0]}`);
  }
  assert.equal(await page.locator('.class-name').count(), 0);
  await page.goto(site.url);
  await ready(page);
  assert.deepEqual(await page.locator('#loose-lists .loose-name').allInnerTexts(), ['Substitutions', 'Memos'], 'what was read on the first page had a list of no app on it');
  assert.deepEqual(wrong, []);
  await context.close();
});
