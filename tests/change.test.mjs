// Changing a document in front of a real FadoDB server: Jan changes his
// draft, what the class works out follows as he types, and the server
// decides what is taken.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { show } from '../pages/format.js';
import { acme, signIn } from './acme.mjs';
import { fits, ready, watch } from './browser.mjs';

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

  // A quote whose rate the server looks up in a table: a page cannot.
  await server.exec('define_table', {
    definition: {
      name: 'Rates',
      columns: { code: 'text', rate: 'decimal(4)' },
      key: ['code'],
      access: { read: 'INGROUP("everyone")', write: 'INGROUP("everyone")' },
    },
  });
  await server.exec('import_rows', { table: 'Rates', rows: [{ code: 'EUR', rate: '4.2500' }, { code: 'USD', rate: '3.9000' }] });
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

  site = server.site;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Jan files the taxi expense, as a draft.
 *
 * @returns {Promise<string>} its id
 */
async function janDraftsATaxi() {
  const { document } = await server.exec('create', {
    class: 'Expense',
    values: { what: 'Taxi from the airport', bought_on: '2026-11-15', cost_centre: 'Sales', net: '86.50 PLN', vat_rate: '0.08' },
  }, 'jan');
  return document.id;
}

/**
 * A person signs in, in a browser of their own, and opens a document.
 *
 * @param {'ann' | 'jan'} user
 * @param {string} id
 * @param {{ locale?: string, className?: string }} [how]
 */
async function opened(user, id, { locale = 'en-GB', className = 'Expense' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale, timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await signIn(page, site, server, user);
  seen.answers.length = 0;
  await page.goto(`${site.url}document.html?class=${className}&id=${encodeURIComponent(id)}`);
  await ready(page);
  return { context, page, ...seen };
}

/**
 * What a value that is not a field shows, with plain spaces.
 *
 * @param {import('playwright').Page} page
 * @param {string} name
 */
async function shown(page, name) {
  return (await page.locator(`[data-variable="${name}"] .field-value`).innerText()).replaceAll('\u00a0', ' ');
}

/** @param {import('playwright').Page} page */
const fields = (page) => page.locator('.field:has(.input, .check)').evaluateAll((boxes) => boxes.map((b) => b.getAttribute('data-variable')));

test('Jan changes his draft, and what the class works out follows as he types', async () => {
  const id = await janDraftsATaxi();
  const { context, page, wrong, answers } = await opened('jan', id);

  assert.deepEqual(await fields(page), ['what', 'bought_on', 'cost_centre', 'note', 'net', 'vat_rate'], 'what the class works out is not a field');
  assert.equal(await page.inputValue('#f-net'), '86.50');
  assert.equal(await page.inputValue('#f-net-currency'), 'PLN');
  assert.equal(await page.inputValue('#f-vat_rate'), '8', 'a rate the class shows as a percentage is typed as one');
  assert.equal(await page.inputValue('#f-bought_on'), '2026-11-15');
  assert.ok(await page.locator('#changes').isHidden());

  await page.fill('#f-net', '4200');
  assert.equal(await shown(page, 'vat'), '336.00 PLN');
  assert.equal(await shown(page, 'total'), '4,536.00 PLN');
  assert.equal(await shown(page, 'needs_director'), 'No');
  await page.fill('#f-vat_rate', '23');
  assert.equal(await shown(page, 'vat'), '966.00 PLN');
  assert.equal(await shown(page, 'total'), '5,166.00 PLN');
  assert.equal(await shown(page, 'needs_director'), 'Yes', 'above 5,000 it needs a director');

  await page.fill('#f-what', 'Train tickets to Gdańsk');
  assert.equal(await page.locator('#doc-title').innerText(), 'Train tickets to Gdańsk', 'the title follows too');

  assert.equal(await page.locator('#changes-what').innerText(), 'Not saved yet: Net amount, VAT rate, What was bought.');
  assert.ok(await page.locator('#changes-hint').isVisible());

  const { document } = await server.exec('get', { class: 'Expense', id }, 'jan');
  assert.equal(document.values.net, '86.50 PLN', 'nothing is the server\'s until he saves');
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, []);
  await context.close();
});

test('what the page works out is what the server would work out', async () => {
  const id = await janDraftsATaxi();
  const { context, page, wrong } = await opened('jan', id);
  const person = { locale: 'en-GB' };
  const tries = [
    { net: '4200', rate: '8' },
    { net: '0.01', rate: '23' },
    { net: '5000', rate: '23' },
    { net: '4065.04', rate: '23' },
    { net: '4065.05', rate: '23' },
    { net: '1234567.89', rate: '5' },
    { net: '99.99', rate: '0' },
  ];
  for (const one of tries) {
    await page.fill('#f-net', one.net);
    await page.fill('#f-vat_rate', one.rate);
    const { preview } = await server.exec('preview', {
      class: 'Expense', id, values: { net: `${one.net} PLN`, vat_rate: (Number(one.rate) / 100).toFixed(2) },
    }, 'jan');
    const values = preview.document.values;
    const where = `net ${one.net} at ${one.rate}%`;
    assert.equal(await shown(page, 'vat'), show(values.vat, { type: 'money(2)', format: '#,##0.00' }, person).replaceAll('\u00a0', ' '), `${where}: the VAT`);
    assert.equal(await shown(page, 'total'), show(values.total, { type: 'money(2)', format: '#,##0.00' }, person).replaceAll('\u00a0', ' '), `${where}: the total`);
    assert.equal(await shown(page, 'needs_director'), values.needs_director ? 'Yes' : 'No', `${where}: whether it needs the director`);
  }
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Save sends the changes, and the history says what changed', async () => {
  const id = await janDraftsATaxi();
  const { context, page, wrong } = await opened('jan', id);
  await page.fill('#f-net', '4200');
  await page.fill('#f-note', 'Two people, second class');
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('said')?.textContent === 'Saved.');

  const { document } = await server.exec('get', { class: 'Expense', id }, 'jan');
  assert.equal(document.values.net, '4200.00 PLN', 'the server keeps a money at the scale of its variable');
  assert.equal(document.values.total, '4536.00 PLN');
  assert.equal(document.values.note, 'Two people, second class');
  assert.ok(await page.locator('#changes').isHidden());
  assert.equal(await page.inputValue('#f-net'), '4200.00', 'the field shows the value as the server keeps it');
  assert.equal((await page.locator('.history-what').allInnerTexts())[0], 'Jan Kowalski changed Note, Net amount');
  assert.ok(await page.locator('#moves button').isEnabled(), 'saved, it can be moved again');
  assert.ok(await page.locator('#moves-wait').isHidden());
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Discard puts everything back as the server has it', async () => {
  const id = await janDraftsATaxi();
  const { context, page, wrong } = await opened('jan', id);
  await page.fill('#f-net', '4200');
  await page.fill('#f-what', 'Something else');
  await page.click('#discard');
  await page.waitForFunction(() => document.getElementById('said')?.textContent === 'Put back as the server has it.');
  assert.equal(await page.inputValue('#f-net'), '86.50');
  assert.equal(await page.inputValue('#f-what'), 'Taxi from the airport');
  assert.equal(await page.locator('#doc-title').innerText(), 'Taxi from the airport');
  assert.equal(await shown(page, 'total'), '93.42 PLN');
  assert.ok(await page.locator('#changes').isHidden());
  assert.ok(await page.locator('#moves button').isEnabled());
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a change the server refuses is shown at its field, and nothing typed is lost', async () => {
  const id = await janDraftsATaxi();
  const { context, page, wrong, answers } = await opened('jan', id);
  await page.fill('#f-note', 'Kept while the rate is put right');
  await page.fill('#f-vat_rate', '50');
  await page.click('#save');
  await page.waitForFunction(() => !document.getElementById('refused')?.hidden);

  assert.match(await page.locator('#refused-what').innerText(), /above the maximum/);
  assert.match(await page.locator('#f-vat_rate-why').innerText(), /above the maximum/);
  assert.ok(await page.locator('[data-variable=vat_rate]').evaluate((box) => box.classList.contains('field-wrong')));
  assert.equal(await page.inputValue('#f-note'), 'Kept while the rate is put right');
  assert.equal(await page.inputValue('#f-vat_rate'), '50');
  assert.ok(await page.locator('#changes').isVisible());
  assert.deepEqual(answers.map((a) => a.path), ['/v1/set']);

  await page.fill('#f-vat_rate', '23');
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('said')?.textContent === 'Saved.');
  const { document } = await server.exec('get', { class: 'Expense', id }, 'jan');
  assert.equal(document.values.vat_rate, '0.23');
  assert.equal(document.values.note, 'Kept while the rate is put right');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what cannot be read as a number is said at the field, and cannot be saved', async () => {
  const id = await janDraftsATaxi();
  const { context, page, wrong, answers } = await opened('jan', id);
  await page.fill('#f-net', '12,5x');
  assert.equal(await page.locator('#f-net-why').innerText(), 'This is not a number.');
  assert.equal(await page.locator('#f-net').getAttribute('aria-invalid'), 'true');
  assert.ok(await page.locator('#save').isDisabled());
  assert.ok(await page.locator('#changes-wrong').isVisible());
  assert.equal(await shown(page, 'total'), '93.42 PLN', 'the last number that could be read still counts');

  await page.fill('#f-net', '4200,50');
  assert.equal(await page.locator('#f-net-why').innerText(), 'This is not a number.', 'in English a comma there is not guessed at');
  await page.fill('#f-net', '4,200.50');
  assert.ok(await page.locator('#f-net-why').isHidden());
  assert.equal(await shown(page, 'total'), '4,536.54 PLN');
  assert.ok(await page.locator('#save').isEnabled());

  await page.fill('#f-net-currency', '');
  assert.match(await page.locator('#f-net-why').innerText(), /Give the currency/);
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, []);
  await context.close();
});

test('in a Polish browser Jan types a Polish number', async () => {
  const id = await janDraftsATaxi();
  const { context, page, wrong } = await opened('jan', id, { locale: 'pl-PL' });
  assert.equal(await page.inputValue('#f-net'), '86,50');
  await page.fill('#f-net', '4 200,50');
  assert.equal(await shown(page, 'vat'), '336,04 PLN');
  assert.equal(await shown(page, 'total'), '4 536,54 PLN');
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('said')?.textContent === 'Saved.');
  const { document } = await server.exec('get', { class: 'Expense', id }, 'jan');
  assert.equal(document.values.net, '4200.50 PLN');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Ann, an approver, may set the note of a submitted expense and nothing else', async () => {
  const id = await janDraftsATaxi();
  await server.exec('transition', { class: 'Expense', id, transition: 'submit' }, 'jan');
  const { context, page, wrong } = await opened('ann', id);

  assert.deepEqual(await fields(page), ['note'], 'in this state the class opens the note to approvers, and closes the rest');
  assert.equal(await shown(page, 'net'), '86.50 PLN');
  await page.fill('#f-note', 'Checked against the receipt');
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('said')?.textContent === 'Saved.');
  const { document } = await server.exec('get', { class: 'Expense', id }, 'jan');
  assert.equal(document.values.note, 'Checked against the receipt');
  assert.equal(document.updated_by, 'ann');
  assert.deepEqual(await page.locator('#moves button').allInnerTexts(), ['Send back', 'Approve']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Ann cannot change Jan\'s draft: its values are shown, not offered', async () => {
  const { document: empty } = await server.exec('create', { class: 'Expense', values: { what: 'Nothing yet' } }, 'jan');
  const { context, page, wrong } = await opened('ann', empty.id);
  assert.deepEqual(await fields(page), []);
  assert.equal(await shown(page, 'what'), 'Nothing yet');
  assert.equal(await shown(page, 'cost_centre'), '—', 'a value that is not there is shown as a dash');
  assert.ok(await page.locator('#changes').isHidden());
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a value the server works out is asked of the server, and what reads it follows', async () => {
  const { document: quote } = await server.exec('create', { class: 'Quote', values: { currency: 'EUR', amount: '100.00' } }, 'jan');
  const { context, page, wrong } = await opened('jan', quote.id, { className: 'Quote' });

  assert.deepEqual(await fields(page), ['currency', 'amount']);
  assert.equal(await shown(page, 'rate'), '4.2500');
  assert.equal(await shown(page, 'in_pln'), '425.00');

  // The amount is the page's own to follow: no question to the server.
  await page.fill('#f-amount', '200');
  assert.equal(await shown(page, 'in_pln'), '850.00');

  // The rate is looked up by the server: the page asks, then works out what reads it.
  await page.fill('#f-currency', 'USD');
  await page.waitForFunction(() => document.querySelector('[data-variable=rate] .field-value')?.textContent === '3.9000');
  assert.equal(await shown(page, 'in_pln'), '780.00');
  assert.equal(await page.locator('#doc-title').innerText(), 'Quote in USD');

  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('said')?.textContent === 'Saved.');
  const { document } = await server.exec('get', { class: 'Quote', id: quote.id }, 'jan');
  assert.equal(document.values.in_pln, '780.00');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('leaving with something not saved asks first', async () => {
  const id = await janDraftsATaxi();
  const { context, page } = await opened('jan', id);
  await page.fill('#f-net', '4200');
  let asked = '';
  page.once('dialog', async (dialog) => {
    asked = dialog.type();
    await dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await new Promise((wait) => setTimeout(wait, 300));
  assert.equal(asked, 'beforeunload');
  await context.close();
});

test('the fields fit a phone', async () => {
  const id = await janDraftsATaxi();
  const { context, page, wrong } = await opened('jan', id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.fill('#f-net', '4200');
  assert.ok(await fits(page), 'the page does not scroll sideways at 390 px, with the bar of changes shown');
  assert.deepEqual(wrong, []);
  await context.close();
});
