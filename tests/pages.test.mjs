// Workshop's pages handed out alone, with no FadoDB server behind them:
// what the helper sends, and what the first page says then.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';
import { fits, open } from './browser.mjs';

/** @type {{ url: string, close: () => Promise<void> }} */
let site;
/** @type {import('playwright').Browser} */
let browser;

before(async () => {
  site = await serve({ dir: fileURLToPath(new URL('../pages/', import.meta.url)) });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await site?.close();
});

test('with no server behind it, the first page says so, and nothing is refused', async () => {
  const { context, page, wrong, answers } = await open(browser, site.url);
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, [{ status: 502, path: '/v1/whoami' }]);
  assert.equal(await page.title(), 'FadoDB Workshop');
  assert.ok(await page.locator('#no-server').isVisible());
  assert.match(await page.locator('#no-server h1').innerText(), /No FadoDB server answers here/);
  assert.ok(await page.locator('#home').isHidden());
  assert.ok(await page.locator('#who').isHidden());
  const colour = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(colour, 'rgb(247, 245, 240)', 'the style sheet is applied');
  await context.close();
});

test('the first page fits a phone', async () => {
  const { context, page, wrong } = await open(browser, site.url, { width: 390, height: 844 });
  assert.deepEqual(wrong, []);
  assert.ok(await fits(page), 'the page does not scroll sideways at 390 px');
  await context.close();
});

test('the first page can be walked with the keyboard', async () => {
  const { context, page } = await open(browser, site.url);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement?.className);
  assert.equal(first, 'brand', 'Tab reaches the first link');
  await context.close();
});

test('the helper sends the security header and hands out nothing outside the folder', async () => {
  const page = await fetch(site.url);
  assert.equal(page.status, 200);
  const header = page.headers.get('content-security-policy') ?? '';
  assert.match(header, /default-src 'none'/);
  assert.match(header, /script-src 'self'/);
  assert.doesNotMatch(header, /unsafe/);
  await page.arrayBuffer();

  const outside = await fetch(site.url + '..%2Fpackage.json');
  assert.equal(outside.status, 404);
  await outside.arrayBuffer();

  const posted = await fetch(site.url, { method: 'POST' });
  assert.equal(posted.status, 405);
  await posted.arrayBuffer();

  const command = await fetch(site.url + 'v1/whoami', { method: 'POST', body: '{}' });
  assert.equal(command.status, 502, 'a command has nowhere to go');
  await command.arrayBuffer();
});
