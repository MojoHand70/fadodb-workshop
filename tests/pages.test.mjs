// Opens Workshop's pages in a real browser, handed out with the security
// header they are held to. A page passes when the browser refused
// nothing, reported no error, and the page fits a phone.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';

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

/**
 * Opens a page and collects everything that went wrong while it loaded.
 *
 * @param {string} path
 * @param {{ width: number, height: number }} viewport
 */
async function open(path, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  /** @type {string[]} */
  const wrong = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`refused by the security header: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on('console', (m) => {
    if (m.type() === 'error') wrong.push(m.text());
  });
  page.on('pageerror', (e) => wrong.push(String(e)));
  page.on('requestfailed', (r) => wrong.push(`not loaded: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) wrong.push(`${r.status()} for ${r.url()}`);
  });
  await page.goto(site.url + path);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'yes');
  return { context, page, wrong };
}

test('the first page loads with nothing refused and no error', async () => {
  const { context, page, wrong } = await open('', { width: 1280, height: 800 });
  assert.deepEqual(wrong, []);
  assert.equal(await page.title(), 'FadoDB Workshop');
  assert.match(await page.locator('.status').innerText(), /nothing works yet/);
  const colour = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(colour, 'rgb(247, 245, 240)', 'the style sheet is applied');
  await context.close();
});

test('the first page fits a phone', async () => {
  const { context, page, wrong } = await open('', { width: 390, height: 844 });
  assert.deepEqual(wrong, []);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  assert.ok(fits, 'the page does not scroll sideways at 390 px');
  await context.close();
});

test('the first page can be walked with the keyboard', async () => {
  const { context, page } = await open('', { width: 1280, height: 800 });
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
});
