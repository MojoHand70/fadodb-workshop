// One document in front of a real FadoDB server: Jan files expenses,
// Ann, an approver, opens one, reads it and moves it.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';
import { acme, signIn } from './acme.mjs';
import { fits, ready, watch } from './browser.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {{ url: string, close: () => Promise<void> }} */
let site;
/** @type {import('playwright').Browser} */
let browser;

before(async () => {
  server = await acme();
  const expense = JSON.parse(await readFile(new URL('./fixtures/expense.json', import.meta.url), 'utf8'));
  await server.exec('define_class', { definition: expense });
  site = await serve({ dir: fileURLToPath(new URL('../pages/', import.meta.url)), server: server.url });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await site?.close();
  await server?.close();
});

/**
 * Jan files the taxi expense, adds a note and submits it.
 *
 * @param {string} [what]
 * @returns {Promise<string>} its id
 */
async function janSubmitsATaxi(what = 'Taxi from the airport') {
  const { document } = await server.exec('create', {
    class: 'Expense',
    values: { what, bought_on: '2026-11-15', cost_centre: 'Sales', net: '86.50 PLN', vat_rate: '0.08' },
  }, 'jan');
  await server.exec('set', { class: 'Expense', id: document.id, values: { note: 'From the client meeting' } }, 'jan');
  await server.exec('transition', { class: 'Expense', id: document.id, transition: 'submit' }, 'jan');
  return document.id;
}

/**
 * A person signs in, in a browser of their own.
 *
 * @param {'ann' | 'jan'} user
 * @param {string} [locale]
 */
async function signedIn(user, locale = 'en-GB') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale, timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await signIn(page, site, server, user);
  seen.answers.length = 0;
  return { context, page, ...seen };
}

/**
 * @param {import('playwright').Page} page
 * @param {string} id
 */
async function openDocument(page, id) {
  await page.goto(`${site.url}document.html?class=Expense&id=${encodeURIComponent(id)}`);
  await ready(page);
}

/**
 * The fields of the page: each label with its value, plain spaces.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<Record<string, string>>}
 */
function fieldsOf(page) {
  return page.evaluate(() => {
    /** @type {Record<string, string>} */
    const all = {};
    for (const box of document.querySelectorAll('.field')) {
      const label = [...(box.querySelector('.field-label')?.childNodes ?? [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
      all[label] = (box.querySelector('.field-value')?.textContent ?? '').replaceAll(' ', ' ');
    }
    return all;
  });
}

/** @param {import('playwright').Page} page */
const historyOf = (page) => page.locator('.history-what').allInnerTexts();

test('Ann opens an expense from the list and reads it by the sections of its class', async () => {
  const id = await janSubmitsATaxi('Taxi to the station');
  const { context, page, wrong, answers } = await signedIn('ann');
  await page.goto(`${site.url}list.html?class=Expense`);
  await ready(page);
  await page.locator('#rows td.title a', { hasText: 'Taxi to the station' }).click();
  await ready(page);

  const at = new URL(page.url());
  assert.equal(at.pathname, '/document.html');
  assert.equal(at.searchParams.get('id'), id);
  assert.equal(await page.locator('#doc-title').innerText(), 'Taxi to the station');
  assert.equal(await page.title(), 'Taxi to the station · FadoDB Workshop');
  assert.equal(await page.locator('#doc-state').innerText(), 'Waiting for approval');
  assert.match(await page.locator('#doc-state-about').innerText(), /Waiting for an approver/);
  assert.equal(await page.locator('#to-list').getAttribute('href'), 'list.html?class=Expense');

  assert.deepEqual(await page.locator('#sections h2').allInnerTexts(), ['The purchase', 'Amounts']);
  assert.deepEqual(await fieldsOf(page), {
    'What was bought': 'Taxi to the station',
    'Bought on': '15 Nov 2026',
    'Cost centre': 'Sales',
    'Note': 'From the client meeting',
    'Net amount': '86.50 PLN',
    'VAT rate': '8%',
    'VAT': '6.92 PLN',
    'Total': '93.42 PLN',
    'Needs the director': 'No',
  });
  assert.deepEqual(await page.locator('.field:has(.fx)').evaluateAll((boxes) => boxes.map((b) => b.getAttribute('data-variable'))), ['vat', 'total', 'needs_director'], 'what the class works out is marked');
  assert.match(await page.locator('.field[data-variable=net] .field-about').innerText(), /before VAT/);

  assert.deepEqual(await page.locator('#moves button').allInnerTexts(), ['Send back', 'Approve'], 'Take back is Jan\'s, and is not shown to Ann');
  assert.equal(await page.locator('#moves button[disabled]').count(), 0);
  assert.match(await page.locator('#facts').innerText(), /Made by\s+Jan Kowalski, /);
  assert.deepEqual(await historyOf(page), [
    'Jan Kowalski moved it from Draft to Waiting for approval',
    'Jan Kowalski changed Note',
    'Jan Kowalski made it',
  ]);
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, []);
  await context.close();
});

test('Ann approves it, and the page shows where it stands afterwards', async () => {
  const id = await janSubmitsATaxi();
  const { context, page, wrong } = await signedIn('ann');
  await openDocument(page, id);

  await page.locator('#moves button', { hasText: 'Approve' }).click();
  await page.waitForFunction(() => document.getElementById('doc-state')?.textContent === 'Approved');
  assert.equal(await page.locator('#said').innerText(), 'Done: Approve. It is now in Approved.');
  assert.equal(await page.locator('#moves button').count(), 0, 'paying it is the accountants\'');
  assert.ok(await page.locator('#moves-none').isVisible());
  assert.equal((await historyOf(page))[0], 'Ann Kowalska moved it from Waiting for approval to Approved');
  assert.match(await page.locator('#facts').innerText(), /In Approved since\s+Ann Kowalska, /);

  const { document } = await server.exec('get', { class: 'Expense', id }, 'jan');
  assert.equal(document.state, 'approved', 'the server moved it');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Jan is shown what is his to do, and a condition that does not hold yet', async () => {
  const submitted = await janSubmitsATaxi();
  const { document: empty } = await server.exec('create', { class: 'Expense', values: { what: 'Nothing yet' } }, 'jan');
  const { context, page, wrong } = await signedIn('jan');

  await openDocument(page, submitted);
  assert.deepEqual(await page.locator('#moves button').allInnerTexts(), ['Take back']);

  await openDocument(page, empty.id);
  assert.deepEqual(await page.locator('#moves button').allInnerTexts(), ['Submit']);
  assert.ok(await page.locator('#moves button').isDisabled());
  assert.equal(await page.locator('.move-why').innerText(), 'Not yet. The author sends it for approval. It needs a total above zero.');
  assert.equal((await fieldsOf(page))['Cost centre'], '—', 'a value that is not there is shown as a dash');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a move that came too late is refused in the server\'s words, and the page shows the document as it is', async () => {
  const id = await janSubmitsATaxi();
  const { context, page, wrong, answers } = await signedIn('ann');
  await openDocument(page, id);

  // Jan takes it back while Ann is still looking at it.
  await server.exec('transition', { class: 'Expense', id, transition: 'take_back' }, 'jan');
  await page.locator('#moves button', { hasText: 'Approve' }).click();
  await page.waitForFunction(() => !document.getElementById('refused')?.hidden);

  assert.notEqual(await page.locator('#refused-what').innerText(), '');
  assert.equal(await page.locator('#doc-state').innerText(), 'Draft');
  assert.equal(await page.locator('#moves button').count(), 0, 'a draft is its author\'s');
  assert.equal(answers.filter((a) => a.path === '/v1/transition').length, 1);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('in a Polish browser the document reads in Polish numbers and days', async () => {
  const id = await janSubmitsATaxi();
  const { context, page, wrong } = await signedIn('ann', 'pl-PL');
  await openDocument(page, id);
  const fields = await fieldsOf(page);
  assert.equal(fields['Bought on'], '15 lis 2026');
  assert.equal(fields['Net amount'], '86,50 PLN');
  assert.equal(fields['Total'], '93,42 PLN');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a value written as markup is shown as text', async () => {
  const trap = '<img src=x onerror="document.title=1">';
  const id = await janSubmitsATaxi(trap);
  const { context, page, wrong } = await signedIn('ann');
  await openDocument(page, id);
  assert.equal(await page.locator('#doc-title').innerText(), trap);
  assert.equal(await page.locator('#document img, #document script').count(), 0);
  assert.equal(await page.title(), `${trap} · FadoDB Workshop`);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the document fits a phone', async () => {
  const id = await janSubmitsATaxi();
  const { context, page, wrong } = await signedIn('ann');
  await page.setViewportSize({ width: 390, height: 844 });
  await openDocument(page, id);
  assert.ok(await fits(page), 'the page does not scroll sideways at 390 px');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a document the server does not know is answered in the server\'s words', async () => {
  const { context, page, wrong } = await signedIn('ann');
  await openDocument(page, 'no-such-document');
  assert.ok(await page.locator('#trouble').isVisible());
  assert.ok(await page.locator('#document').isHidden());
  assert.match(await page.locator('#trouble-why').innerText(), /no-such-document/);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a person who is not signed in is offered to sign in, and comes back to the document', async () => {
  const context = await browser.newContext({ locale: 'en-GB' });
  const page = await context.newPage();
  await page.goto(`${site.url}document.html?class=Expense&id=abc`);
  await ready(page);
  assert.ok(await page.locator('#signed-out').isVisible());
  assert.equal(await page.locator('#sign-in').getAttribute('href'), '/auth/signin?next=%2Fdocument.html%3Fclass%3DExpense%26id%3Dabc');
  await context.close();
});
