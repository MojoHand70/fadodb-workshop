// How Workshop's pages are handed out: by a real FadoDB server, from the
// folder pages/, and what the first page says where no FadoDB server
// answers at all.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { POLICY, serve } from '../tools/serve.mjs';
import { PAGES, acme } from './acme.mjs';
import { fits, launch, open } from './browser.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** A place that hands out the pages and is no FadoDB server. */
/** @type {{ url: string, close: () => Promise<void> }} */
let alone;
/** @type {import('playwright').Browser} */
let browser;

before(async () => {
  server = await acme();
  alone = await serve({ dir: PAGES });
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await alone?.close();
  await server?.close();
});

test('a FadoDB server hands out Workshop\'s pages at its own address', async () => {
  const first = await fetch(server.site.url);
  assert.equal(first.status, 200);
  assert.match(first.headers.get('content-type') ?? '', /^text\/html/);
  assert.match(await first.text(), /<title>FadoDB Workshop<\/title>/);

  const files = [
    ['workshop.css', 'text/css'],
    ['workshop.js', 'text/javascript'],
    ['vendor/fadodb-vm.js', 'text/javascript'],
    ['vendor/fadodb-vm.LICENSE.txt', 'text/plain'],
    ['mark.png', 'image/png'],
    // The typefaces, each with its licence beside it (ADR-0006).
    ['vendor/fonts/inter-latin-wght-normal.woff2', 'font/woff2'],
    ['vendor/fonts/inter-latin-ext-wght-normal.woff2', 'font/woff2'],
    ['vendor/fonts/inter.LICENSE.txt', 'text/plain'],
    ['vendor/fonts/jetbrains-mono-latin-wght-normal.woff2', 'font/woff2'],
    ['vendor/fonts/jetbrains-mono-latin-ext-wght-normal.woff2', 'font/woff2'],
    ['vendor/fonts/jetbrains-mono.LICENSE.txt', 'text/plain'],
  ];
  for (const [file, type] of files) {
    const answer = await fetch(server.site.url + file);
    assert.equal(answer.status, 200, file);
    assert.ok((answer.headers.get('content-type') ?? '').startsWith(type), `${file} is sent as ${answer.headers.get('content-type')}`);
    await answer.arrayBuffer();
  }

  // The server's own addresses are still the server's.
  const health = await fetch(`${server.url}/v1/health`);
  assert.equal((await health.json()).ok, true);
  const signIn = await fetch(`${server.url}/auth/signin`);
  assert.match(await signIn.text(), /action="\/auth\/signin"/);
});

test('the header the server sends with a page is the one the pages are written for', async () => {
  const first = await fetch(server.site.url);
  assert.equal(first.headers.get('content-security-policy'), POLICY);
  await first.arrayBuffer();
  assert.match(POLICY, /script-src 'self';/, 'no script from elsewhere, and none written in a page');
  assert.match(POLICY, /connect-src 'self';/, 'a page calls the server alone');
});

test('the first page loads from the server with nothing refused, and fits a phone', async () => {
  const { context, page, wrong, answers } = await open(browser, server.site.url);
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, [{ status: 401, path: '/v1/whoami' }], 'nobody is signed in yet');
  assert.ok(await page.locator('#signed-out').isVisible());
  const colour = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(colour, 'rgb(250, 249, 255)', 'the style sheet is applied');
  // FadoDB's own mark stands beside the name: a picture of the folder, which the header lets through.
  const mark = page.locator('header.top a.brand img.brand-mark');
  assert.equal(await mark.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth), 96);
  assert.equal(await mark.getAttribute('alt'), '', 'the words beside it say what it is');
  assert.equal(await page.locator('header.top a.brand').innerText(), 'FadoDB\nworkshop');

  // The words are set in the typefaces the pages carry, whatever the machine has:
  // the browser fetched them from the server, and nothing was refused.
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replaceAll('"', ''));
  });
  assert.ok(faces.includes('Inter'), `the faces a page loaded: ${faces.join(', ')}`);
  assert.ok(faces.includes('JetBrains Mono'), 'the word "workshop" beside the mark is set in it');
  assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /^"?Inter"?,/);

  await page.keyboard.press('Tab');
  const reached = await page.evaluate(() => document.activeElement?.className);
  assert.equal(reached, 'brand', 'Tab reaches the first link');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the page does not scroll sideways at 390 px');
  await context.close();
});

test('where no FadoDB server answers, the first page says so', async () => {
  const { context, page, wrong, answers } = await open(browser, alone.url);
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers.map((a) => a.path), ['/v1/whoami']);
  assert.ok(await page.locator('#no-server').isVisible());
  assert.match(await page.locator('#no-server h1').innerText(), /No FadoDB server answers here/);
  assert.ok(await page.locator('#home').isHidden());
  assert.ok(await page.locator('#who').isHidden());
  await context.close();
});

test('the helper sends the same header, and hands out nothing outside the folder', async () => {
  const page = await fetch(alone.url);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-security-policy'), POLICY);
  await page.arrayBuffer();

  const outside = await fetch(alone.url + '..%2Fpackage.json');
  assert.equal(outside.status, 404);
  await outside.arrayBuffer();

  const posted = await fetch(alone.url, { method: 'POST' });
  assert.equal(posted.status, 405);
  await posted.arrayBuffer();
});
