// The first page in front of a real FadoDB server: Ann signs in on the
// server's own page, comes back, and sees her name and the classes.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acme, signIn } from './acme.mjs';
import { fits, launch, open, watch } from './browser.mjs';

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

test('Ann signs in on the server\'s page and sees her name and the classes', async () => {
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
  const expense = page.locator('.class', { has: page.locator('.class-name', { hasText: /^Expense$/ }) });
  assert.match(await expense.locator('.class-about').innerText(), /What an employee paid for the company/);
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
  const trap = page.locator('.class', { has: page.locator('.class-name', { hasText: /^Trap$/ }) });
  assert.equal(await trap.locator('.class-label').innerText(), '<img src=x onerror="document.title=1">');
  assert.equal(await page.title(), 'FadoDB Workshop');
  assert.equal(await page.locator('#classes img, #classes script').count(), 0);
  assert.deepEqual(wrong, []);
  await context.close();
});
