// Making a new document in front of a real FadoDB server: Jan files an
// expense from the list.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acme, signIn } from './acme.mjs';
import { fits, launch, plain, ready, watch } from './browser.mjs';

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

  // A quote whose rate the server looks up in a table.
  await server.exec('define_table', {
    definition: {
      name: 'Rates',
      columns: { code: 'text', rate: 'decimal(4)' },
      key: ['code'],
      access: { read: 'INGROUP("everyone")', write: 'INGROUP("everyone")' },
    },
  });
  await server.exec('import_rows', { table: 'Rates', rows: [{ code: 'EUR', rate: '4.2500' }] });
  await server.exec('define_class', {
    definition: {
      name: 'Quote',
      label: 'Quote',
      description: 'A price in another currency, and what it is in PLN.',
      title: '"Quote in " & currency',
      variables: {
        currency: { type: 'text', required: true, label: 'Currency', description: 'The code of the currency.' },
        amount: { type: 'decimal', scale: 2, required: true, label: 'Amount', description: 'The price in that currency.' },
        rate: { formula: 'LOOKUP(Rates, rate, code = THIS.currency)', label: 'Rate', description: 'The rate of the currency, from the table.' },
        in_pln: { formula: 'ROUND(amount * rate, 2)', label: 'In PLN', description: 'The price in PLN.', format: '#,##0.00' },
      },
      states: { initial: 'open', list: ['open'], labels: { open: 'Open' }, descriptions: { open: 'Open.' } },
      access: { read: 'INGROUP("everyone")', create: 'INGROUP("everyone")', update: 'INGROUP("everyone")', delete: 'FALSE' },
    },
  });

  // A class only directors may make a document of.
  await server.exec('define_class', {
    definition: {
      name: 'Decree',
      label: 'Decree',
      description: 'What a director decides.',
      title: 'subject',
      variables: { subject: { type: 'text', required: true, label: 'Subject', description: 'What is decided.', list: true } },
      states: { initial: 'open', list: ['open'], labels: { open: 'Open' }, descriptions: { open: 'Open.' } },
      access: { read: 'INGROUP("everyone")', create: 'INGROUP("directors")', update: 'FALSE', delete: 'FALSE' },
    },
  });

  site = server.site;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Jan signs in and opens the list of a class.
 *
 * @param {string} [className]
 * @param {string} [locale]
 */
async function janAtTheList(className = 'Expense', locale = 'en-GB') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale, timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await signIn(page, site, server, 'jan');
  seen.answers.length = 0;
  await page.goto(`${site.url}list.html?class=${className}`);
  await ready(page);
  return { context, page, ...seen };
}

/** Jan opens the page that makes a new document of a class. */
async function janBeginsOne(className = 'Expense') {
  const all = await janAtTheList(className);
  await all.page.click('#new');
  await ready(all.page);
  return all;
}

/**
 * What a value that is not a field shows, with plain spaces.
 *
 * @param {import('playwright').Page} page
 * @param {string} name
 */
const shown = async (page, name) => plain(await page.locator(`[data-variable="${name}"] .field-value`).innerText());

/** @param {import('playwright').Page} page */
const fields = (page) => page.locator('.field:has(.input, .check)').evaluateAll((boxes) => boxes.map((b) => b.getAttribute('data-variable')));

/** @param {string} className */
const countOf = async (className) => (await server.exec('count', { class: className }, 'jan')).count;

test('Jan makes a new expense from the list', async () => {
  const { context, page, wrong, answers } = await janAtTheList();
  assert.ok(await page.locator('#new').isVisible());
  await page.click('#new');
  await ready(page);

  const at = new URL(page.url());
  assert.equal(at.pathname + at.search, '/document.html?class=Expense&new');
  assert.equal(await page.locator('#doc-title').innerText(), 'New: Expense');
  assert.equal(await page.locator('#doc-state').innerText(), 'Draft');
  assert.deepEqual(await fields(page), ['what', 'bought_on', 'cost_centre', 'note', 'net', 'vat_rate']);
  assert.equal(await page.locator('#save').innerText(), 'Create');
  assert.equal(await page.locator('#discard').innerText(), 'Cancel');
  assert.match(await page.locator('#changes-what').innerText(), /Not made yet/);
  assert.equal(await page.locator('#moves button').count(), 0);
  assert.ok(await page.locator('#moves-none').isHidden());
  assert.ok(await page.locator('#about').isHidden());
  assert.ok(await page.locator('#history-card').isHidden());

  // What the class gives a new document is there, and is what the server would give.
  const { preview } = await server.exec('preview', { class: 'Expense', values: {} }, 'jan');
  assert.equal(await page.inputValue('#f-bought_on'), preview.document.values.bought_on, 'the day is today, as the class says');
  assert.equal(await page.inputValue('#f-vat_rate'), '23');
  assert.equal(await shown(page, 'total'), '—');

  await page.fill('#f-what', 'Train tickets to Gdańsk');
  assert.equal(await page.locator('#doc-title').innerText(), 'Train tickets to Gdańsk');
  await page.fill('#f-net', '4200');
  assert.match(await page.locator('#f-net-why').innerText(), /Give the currency/, 'a new document has no currency yet');
  await page.fill('#f-net-currency', 'pln');
  assert.equal(await shown(page, 'vat'), '966.00 PLN');
  assert.equal(await shown(page, 'total'), '5,166.00 PLN');
  assert.equal(await shown(page, 'needs_director'), 'Yes');
  assert.equal(await countOf('Expense'), 0, 'nothing is the server\'s until he creates it');

  await page.click('#save');
  await page.waitForURL((address) => address.searchParams.has('id'));
  await ready(page);
  const id = new URL(page.url()).searchParams.get('id') ?? '';
  assert.equal(await page.locator('#doc-title').innerText(), 'Train tickets to Gdańsk');
  assert.equal(await page.locator('#doc-state').innerText(), 'Draft');
  assert.deepEqual(await page.locator('.history-what').allInnerTexts(), ['Jan Kowalski made it']);
  assert.deepEqual(await page.locator('#moves button').allInnerTexts(), ['Submit']);

  const { document } = await server.exec('get', { class: 'Expense', id }, 'jan');
  assert.equal(document.created_by, 'jan');
  assert.equal(document.values.what, 'Train tickets to Gdańsk');
  assert.equal(document.values.net, '4200.00 PLN');
  assert.equal(document.values.vat_rate, '0.23');
  assert.equal(document.values.total, '5166.00 PLN');
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, []);
  await context.close();
});

test('what is needed and missing is said at its field, and nothing typed is lost', async () => {
  const { context, page, wrong, answers } = await janBeginsOne();
  const before = await countOf('Expense');
  await page.fill('#f-cost_centre', 'Sales');
  await page.click('#save');
  await page.waitForFunction(() => !document.getElementById('refused')?.hidden);
  assert.match(await page.locator('#f-what-why').innerText(), /required/);
  assert.equal(await page.inputValue('#f-cost_centre'), 'Sales');
  assert.equal(await countOf('Expense'), before);
  assert.deepEqual(answers.map((a) => a.path), ['/v1/create']);

  await page.fill('#f-what', 'A notebook');
  await page.click('#save');
  await page.waitForURL((address) => address.searchParams.has('id'));
  await ready(page);
  assert.equal(await countOf('Expense'), before + 1);
  assert.equal(await page.inputValue('#f-cost_centre'), 'Sales');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('pressing Create twice makes one document', async () => {
  const { context, page, wrong } = await janBeginsOne();
  const before = await countOf('Expense');
  await page.fill('#f-what', 'Pressed twice');
  await page.dblclick('#save');
  await page.waitForURL((address) => address.searchParams.has('id'));
  await ready(page);
  assert.equal(await countOf('Expense'), before + 1);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a default the person empties stays empty, on the page and on the server alike', async () => {
  const { context, page, wrong } = await janBeginsOne();
  await page.fill('#f-what', 'No rate on the receipt');
  await page.fill('#f-vat_rate', '');
  await page.fill('#f-net', '100');
  await page.fill('#f-net-currency', 'PLN');
  assert.equal(await shown(page, 'total'), '100.00 PLN', 'with no rate there is no VAT');
  await page.click('#save');
  await page.waitForURL((address) => address.searchParams.has('id'));
  await ready(page);
  const id = new URL(page.url()).searchParams.get('id') ?? '';
  const { document } = await server.exec('get', { class: 'Expense', id }, 'jan');
  assert.equal(document.values.vat_rate, null, 'the server did not put the default back');
  assert.equal(document.values.total, '100.00 PLN');
  assert.equal(await page.inputValue('#f-vat_rate'), '');
  assert.equal(await shown(page, 'total'), '100.00 PLN');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a new quote: the rate the server looks up is asked of the server', async () => {
  const { context, page, wrong } = await janBeginsOne('Quote');
  assert.equal(await page.locator('#doc-title').innerText(), 'Quote in', 'the title is the class\'s formula, from the first key');
  await page.fill('#f-currency', 'EUR');
  await page.waitForFunction(() => document.querySelector('[data-variable=rate] .field-value')?.textContent === '4.2500');
  await page.fill('#f-amount', '100');
  assert.equal(await shown(page, 'in_pln'), '425.00');
  await page.click('#save');
  await page.waitForURL((address) => address.searchParams.has('id'));
  await ready(page);
  const id = new URL(page.url()).searchParams.get('id') ?? '';
  const { document } = await server.exec('get', { class: 'Quote', id }, 'jan');
  assert.equal(document.values.in_pln, '425.00');
  assert.equal(document.title, 'Quote in EUR');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a class that keeps making for others offers no New, and says so when asked', async () => {
  const { context, page, wrong, answers } = await janAtTheList('Decree');
  assert.ok(await page.locator('#new').isHidden());
  await page.goto(`${site.url}document.html?class=Decree&new`);
  await ready(page);
  assert.ok(await page.locator('#trouble').isVisible());
  assert.match(await page.locator('#trouble-why').innerText(), /You may not make a document of Decree/);
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, [], 'the page did not have to ask the server to know');
  await context.close();
});

test('Cancel goes back to the list without a question; leaving any other way asks first', async () => {
  const { context, page } = await janBeginsOne();
  await page.fill('#f-what', 'Not wanted after all');
  let asked = '';
  page.on('dialog', async (dialog) => {
    asked = dialog.type();
    await dialog.dismiss();
  });
  await page.click('#discard');
  await page.waitForURL((address) => address.pathname === '/list.html');
  assert.equal(asked, '', 'Cancel is the person\'s own word: nothing is asked');

  await page.click('#new');
  await ready(page);
  await page.fill('#f-what', 'Typed, then the window is closed');
  await page.close({ runBeforeUnload: true });
  await new Promise((wait) => setTimeout(wait, 300));
  assert.equal(asked, 'beforeunload');
  await context.close();
});

test('the page of a new document fits a phone', async () => {
  const { context, page, wrong } = await janBeginsOne();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the page does not scroll sideways at 390 px');
  assert.deepEqual(wrong, []);
  await context.close();
});
