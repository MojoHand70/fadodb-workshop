// The first page in front of a real FadoDB server: Ann signs in on the
// server's own page, comes back, and sees her name and the lists she
// may open. She finds one by a part of its name. That a list has a class
// behind it is the designer's to know: no page says the word to her.

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
  await server.exec('define_class', { definition: expense });
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

test('Ann signs in on the server\'s page and sees her name and the lists she may open', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const { wrong } = watch(page);
  await annSignsIn(page);

  assert.equal(page.url(), site.url, 'she comes back to the page she left');
  assert.equal(await page.locator('#who-name').innerText(), 'Ann Kowalska');
  assert.ok(await page.locator('#home').isVisible());
  assert.ok(await page.locator('#signed-out').isHidden());

  const labels = await page.locator('.class-label').allInnerTexts();
  assert.ok(labels.includes('Expense'), `the classes shown: ${labels.join(', ')}`);
  const expense = page.locator('.class[data-class="Expense"]');
  assert.match(await expense.locator('.class-about').innerText(), /What an employee paid for the company/);
  assert.equal(await expense.locator('.class-way').getAttribute('href'), 'list.html?class=Expense');
  assert.equal(await page.locator('.status').count(), 0, 'the page says nothing of how far Workshop is: the README does');
  assert.equal(await page.locator('#crumbs').count(), 0, 'the first page is where the way begins');
  assert.deepEqual(wrong, []);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the list of classes fits a phone');
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

test('what a class says is shown as text, never run as markup', async () => {
  await server.exec('define_class', {
    definition: {
      name: 'Trap',
      label: '<img src=x onerror="document.title=1">',
      description: '<script>document.title = "run"</script>',
      variables: { note: { type: 'text' } },
    },
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const { wrong } = watch(page);
  await annSignsIn(page);
  const trap = page.locator('.class[data-class="Trap"]');
  assert.equal(await trap.locator('.class-label').innerText(), '<img src=x onerror="document.title=1">');
  assert.equal(await page.title(), 'FadoDB Workshop');
  assert.equal(await page.locator('#classes img, #classes script').count(), 0);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a list goes by the word for many of its documents, where its class has one', async () => {
  await server.exec('define_class', {
    definition: {
      name: 'Trip',
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
  const trip = page.locator('.class[data-class="Trip"]');
  assert.equal(await trip.locator('.class-label').innerText(), 'Business trips');
  await trip.locator('.class-way').click();
  await page.waitForURL((address) => address.pathname === '/list.html');
  await ready(page);
  assert.equal(await page.locator('#list-title').innerText(), 'Business trips');
  assert.equal(await page.title(), 'Business trips · FadoDB Workshop');
  assert.deepEqual(await page.locator('#crumbs li').allInnerTexts(), ['Home', 'Business trips']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Ann finds a list by a part of its name, and Enter opens the first that is left', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const { wrong } = watch(page);
  await annSignsIn(page);
  /** The lists that are shown, by the name of the class behind each. */
  const shown = () => page.locator('.class:visible').evaluateAll((all) => all.map((one) => one.getAttribute('data-class')));
  const all = await shown();
  assert.ok(all.includes('Expense') && all.includes('Substitution'), `what is listed: ${all.join(', ')}`);
  const find = page.getByRole('searchbox', { name: 'Find by name' });
  assert.ok(await find.isVisible());

  // Without capitals, and by a word of what the list is for as well.
  await find.fill('EXPEN');
  assert.deepEqual(await shown(), ['Expense']);
  assert.ok(await page.locator('#none-found').isHidden());
  await find.fill('paid back');
  assert.deepEqual(await shown(), ['Expense']);

  // Nothing found is said, in the words that were typed, as text.
  await find.fill('<b>zebra</b>');
  assert.deepEqual(await shown(), []);
  assert.equal(await page.locator('#none-found').innerText(), 'Nothing here goes by "<b>zebra</b>".');
  assert.equal(await page.locator('#none-found b').count(), 0);

  // Emptied, all are back.
  await find.fill('');
  assert.deepEqual(await shown(), all);
  assert.ok(await page.locator('#none-found').isHidden());

  // Ann knows a list by its words. The name a designer gave the class is not hers to search by.
  await find.fill('trap');
  assert.deepEqual(await shown(), [], 'the class Trap says other words to people');

  await find.fill('expen');
  await find.press('Enter');
  await page.waitForURL((address) => address.pathname === '/list.html');
  assert.equal(new URL(page.url()).search, '?class=Expense');
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
      const engines = document.querySelector('.class[data-class="Substitution"]');
      if (engines) engines.hidden = true;
      const spoken = [...document.querySelectorAll('[aria-label], [title], [placeholder]')]
        .filter((one) => /** @type {HTMLElement} */ (one).offsetParent !== null)
        .map((one) => [one.getAttribute('aria-label'), one.getAttribute('title'), one.getAttribute('placeholder')].join(' '));
      const words = [document.title, document.body.innerText, ...spoken].join('\n');
      if (engines) engines.hidden = false;
      return words;
    });
  const pages = ['', 'list.html?class=Expense', 'list.html?class=Trip', `document.html?class=Expense&id=${encodeURIComponent(made.id)}`, 'document.html?class=Expense&new', 'list.html', 'document.html'];
  for (const path of pages) {
    await page.goto(site.url + path);
    await ready(page);
    const words = await said();
    // The class Trap of the test above says markup of its own making; the word is looked for as a word.
    assert.doesNotMatch(words, /\bclass(es)?\b/i, `${path || 'the first page'} says: ${/.{0,60}\bclass(es)?\b.{0,60}/is.exec(words)?.[0]}`);
  }
  assert.equal(await page.locator('.class-name').count(), 0);
  assert.deepEqual(wrong, []);
  await context.close();
});
