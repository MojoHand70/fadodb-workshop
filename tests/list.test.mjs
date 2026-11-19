// The List of a class in front of a real FadoDB server: Jan has filed
// three expenses, and Ann, an approver, looks at their list.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';
import { acme, signIn } from './acme.mjs';
import { fits, ready, watch } from './browser.mjs';

const TRAP = '<img src=x onerror="document.title=1">';

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

  // Jan files three expenses, oldest first, and submits the first.
  const { document: train } = await server.exec('create', {
    class: 'Expense',
    values: { what: 'Train tickets to Gdańsk', bought_on: '2026-11-14', cost_centre: 'Sales', net: '4200.00 PLN', note: 'Client workshop, two people' },
  }, 'jan');
  await server.exec('create', {
    class: 'Expense',
    values: { what: 'Taxi from the airport', bought_on: '2026-11-15', cost_centre: 'Sales', net: '86.50 PLN', vat_rate: '0.08' },
  }, 'jan');
  await server.exec('create', {
    class: 'Expense',
    values: { what: TRAP, bought_on: '2026-11-16', cost_centre: 'IT', net: '1000.00 PLN' },
  }, 'jan');
  await server.exec('transition', { class: 'Expense', id: train.id, transition: 'submit' }, 'jan');

  // A class with more documents than the list asks for at a time.
  await server.exec('define_class', {
    definition: {
      name: 'Ticket',
      label: 'Ticket',
      description: 'A ticket, for the tests of a long list.',
      title: 'subject',
      variables: {
        subject: { type: 'text', label: 'Subject', description: 'What it is about.', list: true },
        weight: { type: 'int', label: 'Weight', description: 'How heavy it is.', list: true },
      },
      states: { initial: 'open', list: ['open'], labels: { open: 'Open' }, descriptions: { open: 'Open.' } },
      access: { read: 'TRUE', create: 'TRUE', update: 'FALSE', delete: 'FALSE' },
    },
  });
  await server.exec('create_many', {
    class: 'Ticket',
    documents: Array.from({ length: 60 }, (_, n) => ({ values: { subject: `Ticket ${n + 1}`, weight: String(n + 1) } })),
  });

  site = await serve({ dir: fileURLToPath(new URL('../pages/', import.meta.url)), server: server.url });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await site?.close();
  await server?.close();
});

/**
 * Ann signs in and opens the list of a class from the first page.
 *
 * @param {string} locale the language of her browser
 * @param {string} [label] the class she chooses
 */
async function annOpensTheList(locale, label = 'Expense') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale, timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await signIn(page, site, server);
  // Before she signed in the server answered 401 once, as it should.
  seen.answers.length = 0;
  await page.locator('.class-way', { has: page.locator('.class-name', { hasText: new RegExp(`^${label}$`) }) }).click();
  await ready(page);
  return { context, page, ...seen };
}

/**
 * The cells of the row whose title is given, with plain spaces.
 *
 * @param {import('playwright').Page} page
 * @param {string} title
 */
async function rowOf(page, title) {
  const row = page.locator('#rows tr', { has: page.locator('td.title', { hasText: title }) });
  return (await row.locator('td').allInnerTexts()).map((text) => text.replaceAll('\u00a0', ' '));
}

test('Ann opens the list of expenses from the first page', async () => {
  const { context, page, wrong, answers } = await annOpensTheList('en-GB');

  assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, '/list.html?class=Expense');
  assert.equal(await page.locator('#list-title').innerText(), 'Expense');
  assert.equal(await page.title(), 'Expense · FadoDB Workshop');
  assert.deepEqual(await page.locator('#heads th').allInnerTexts(), ['What was bought', 'Bought on', 'Cost centre', 'Total', 'State', 'By', 'Changed']);

  const titles = await page.locator('#rows td.title').allInnerTexts();
  assert.deepEqual(titles, [TRAP, 'Taxi from the airport', 'Train tickets to Gdańsk'], 'the newest comes first');
  assert.equal(await page.locator('#count').innerText(), '3 documents');

  const train = await rowOf(page, 'Train tickets to Gdańsk');
  assert.deepEqual(train.slice(0, 6), ['Train tickets to Gdańsk', '14 Nov 2026', 'Sales', '5,166.00 PLN', 'Waiting for approval', 'Jan Kowalski']);
  assert.match(train[6], /\d{4}/, 'when it last changed');
  const taxi = await rowOf(page, 'Taxi from the airport');
  assert.deepEqual(taxi.slice(1, 5), ['15 Nov 2026', 'Sales', '93.42 PLN', 'Draft']);

  assert.ok(await page.locator('#more').isHidden());
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, []);
  await context.close();
});

test('in a Polish browser the numbers and the days are Polish', async () => {
  const { context, page, wrong } = await annOpensTheList('pl-PL');
  const train = await rowOf(page, 'Train tickets to Gdańsk');
  assert.deepEqual(train.slice(1, 4), ['14 lis 2026', 'Sales', '5 166,00 PLN']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a value written as markup is shown as text', async () => {
  const { context, page, wrong } = await annOpensTheList('en-GB');
  assert.equal(await page.locator('#rows img, #rows script').count(), 0);
  assert.equal(await page.title(), 'Expense · FadoDB Workshop');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the list is narrowed to one state, and the address keeps the choice', async () => {
  const { context, page, wrong } = await annOpensTheList('en-GB');
  assert.deepEqual(await page.locator('#states .chip').allInnerTexts(), ['All', 'Draft', 'Waiting for approval', 'Approved', 'Paid']);

  await page.locator('#states .chip', { hasText: 'Waiting for approval' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#rows tr').length === 1);
  assert.deepEqual(await page.locator('#rows td.title').allInnerTexts(), ['Train tickets to Gdańsk']);
  assert.equal(await page.locator('#count').innerText(), '1 document');
  assert.equal(new URL(page.url()).searchParams.get('state'), 'submitted');
  assert.equal(await page.locator('#states .chip[aria-pressed="true"]').innerText(), 'Waiting for approval');

  await page.reload();
  await ready(page);
  assert.deepEqual(await page.locator('#rows td.title').allInnerTexts(), ['Train tickets to Gdańsk'], 'the choice is still there after the page is loaded again');

  await page.locator('#states .chip', { hasText: 'Paid' }).click();
  await page.waitForFunction(() => !document.getElementById('empty')?.hidden);
  assert.equal(await page.locator('#empty').innerText(), 'No document is in this state.');
  assert.ok(await page.locator('#table').isHidden());

  await page.locator('#states .chip', { hasText: 'All' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#rows tr').length === 3);
  assert.equal(new URL(page.url()).searchParams.get('state'), null);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a state the class does not have is not taken from the address', async () => {
  const { context, page, wrong, answers } = await annOpensTheList('en-GB');
  await page.goto(`${site.url}list.html?class=Expense&state=${encodeURIComponent('x" OR TRUE OR "')}`);
  await ready(page);
  assert.equal(await page.locator('#rows tr').count(), 3);
  assert.equal(await page.locator('#states .chip[aria-pressed="true"]').innerText(), 'All');
  assert.deepEqual(wrong, []);
  assert.deepEqual(answers, []);
  await context.close();
});

test('a long list comes fifty at a time', async () => {
  const { context, page, wrong } = await annOpensTheList('en-GB', 'Ticket');
  assert.equal(await page.locator('#rows tr').count(), 50);
  assert.equal(await page.locator('#count').innerText(), '60 documents');
  assert.deepEqual(await page.locator('#heads th').allInnerTexts(), ['Subject', 'Weight', 'State', 'By', 'Changed'], 'the title is not shown twice');
  await page.click('#more');
  await page.waitForFunction(() => document.querySelectorAll('#rows tr').length === 60);
  assert.ok(await page.locator('#more').isHidden());
  assert.equal(new Set(await page.locator('#rows td.title').allInnerTexts()).size, 60, 'no document comes twice');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('the list fits a phone, each document a card', async () => {
  const { context, page, wrong } = await annOpensTheList('en-GB');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the page does not scroll sideways at 390 px');
  assert.ok(await page.locator('#heads').isHidden(), 'the headings move beside each value');
  const label = await page.locator('#rows tr').first().locator('td').nth(1).evaluate((cell) => getComputedStyle(cell, '::before').content);
  assert.equal(label, '"Bought on"');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a class the server does not know is answered in the server\'s words', async () => {
  const { context, page, wrong, answers } = await annOpensTheList('en-GB');
  await page.goto(`${site.url}list.html?class=Nope`);
  await ready(page);
  assert.ok(await page.locator('#trouble').isVisible());
  assert.ok(await page.locator('#list').isHidden());
  assert.match(await page.locator('#trouble-why').innerText(), /Nope/);
  assert.deepEqual(answers.map((a) => a.path), ['/v1/get_bundle']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a person who is not signed in is offered to sign in, and comes back to the list', async () => {
  const context = await browser.newContext({ locale: 'en-GB' });
  const page = await context.newPage();
  await page.goto(`${site.url}list.html?class=Expense&state=draft`);
  await ready(page);
  assert.ok(await page.locator('#signed-out').isVisible());
  assert.equal(await page.locator('#sign-in').getAttribute('href'), '/auth/signin?next=%2Flist.html%3Fclass%3DExpense%26state%3Ddraft');
  await context.close();
});
