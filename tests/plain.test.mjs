// Workshop at a server that people reach by a name over plain http, as
// on an office network with no certificate. A browser does not hold
// such an address for secure, and keeps some of what it can do from a
// page there. Workshop's pages have to work without it.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acme, signIn } from './acme.mjs';
import { launch, ready, watch } from './browser.mjs';
import { NAME, passage } from './passage.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {Awaited<ReturnType<typeof passage>>} */
let way;
/** @type {import('playwright').Browser} */
let browser;

before(async () => {
  server = await acme({ name: NAME });
  const expense = JSON.parse(await readFile(new URL('./fixtures/expense.json', import.meta.url), 'utf8'));
  await server.exec('define_class', { definition: expense });
  way = await passage(server);
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await way?.close();
  await server?.close();
});

test('over plain http, by a name, Jan signs in, files an expense and submits it', async () => {
  const context = await browser.newContext({ proxy: way.proxy, viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'UTC' });
  const page = await context.newPage();
  const { wrong } = watch(page);
  assert.equal(new URL(server.site.url).hostname, NAME);

  try {
    await signIn(page, server.site, server, 'jan');
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : error}\nWhat went through the passage:\n  ${way.seen.join('\n  ')}`, { cause: error });
  }
  assert.equal(await page.evaluate(() => isSecureContext), false, 'the browser does not hold this address for secure');
  assert.match(await page.locator('#who').innerText(), /Jan Kowalski/);

  await page.goto(`${server.site.url}list.html?class=Expense`);
  await ready(page);
  await page.click('#new');
  await ready(page);
  await page.fill('#f-what', 'Train tickets to Gdańsk');
  await page.fill('#f-net', '4200');
  await page.fill('#f-net-currency', 'pln');
  await page.click('#save');
  await page.waitForURL((address) => address.searchParams.has('id'));
  await ready(page);
  const id = new URL(page.url()).searchParams.get('id') ?? '';
  assert.equal(await page.locator('#doc-title').innerText(), 'Train tickets to Gdańsk');

  await page.locator('#moves button', { hasText: 'Submit' }).click();
  await page.waitForFunction(() => document.getElementById('said')?.textContent !== '');
  assert.equal(await page.locator('#said').innerText(), 'Done: Submit. It is now in Waiting for approval.');
  const { document: stored } = await server.exec('get', { class: 'Expense', id }, 'jan');
  assert.equal(stored.state, 'submitted');
  assert.equal(stored.values.net, '4200.00 PLN');
  assert.deepEqual(wrong, []);
  await context.close();
});
