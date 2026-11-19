// Moving a document that the person has typed into, in front of a real
// FadoDB server: the buttons follow what is typed, and a move takes the
// changes with it.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { acme, signIn } from './acme.mjs';
import { ready, watch } from './browser.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {{ url: string }} */
let site;
/** @type {import('playwright').Browser} */
let browser;

before(async () => {
  server = await acme();
  site = server.site;
  const expense = JSON.parse(await readFile(new URL('./fixtures/expense.json', import.meta.url), 'utf8'));
  await server.exec('define_class', { definition: expense });

  // An order that may be sent only while its currency's rate is above 4:
  // a condition the server looks up in a table, which a page cannot.
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
      name: 'Order',
      label: 'Order',
      description: 'An order in another currency.',
      title: 'subject',
      variables: {
        subject: { type: 'text', required: true, label: 'Subject', description: 'What is ordered.' },
        currency: { type: 'text', required: true, label: 'Currency', description: 'The code of the currency.' },
      },
      states: {
        initial: 'open', list: ['open', 'sent'], final: ['sent'],
        labels: { open: 'Open', sent: 'Sent' },
        descriptions: { open: 'Being written.', sent: 'Sent.' },
      },
      transitions: [{
        name: 'send', from: 'open', to: 'sent', label: 'Send',
        guard: 'LOOKUP(Rates, rate, code = THIS.currency) > 4',
        description: 'It is sent while the rate of its currency is above 4.',
      }],
      access: { read: 'INGROUP("everyone")', create: 'INGROUP("everyone")', update: 'INGROUP("everyone")', delete: 'FALSE' },
    },
  });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * A person signs in, in a browser of their own, and opens a document.
 *
 * @param {'ann' | 'jan'} user
 * @param {string} className
 * @param {string} id
 */
async function opened(user, className, id) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'UTC' });
  const page = await context.newPage();
  const seen = watch(page);
  await signIn(page, site, server, user);
  await page.goto(`${site.url}document.html?class=${className}&id=${encodeURIComponent(id)}`);
  await ready(page);
  seen.answers.length = 0;
  seen.commands.length = 0;
  return { context, page, ...seen };
}

/** The buttons of the page: each label, and whether it can be pressed. */
const buttons = (/** @type {import('playwright').Page} */ page) =>
  page.locator('#moves button').evaluateAll((all) => all.map((b) => `${b.textContent}${/** @type {HTMLButtonElement} */ (b).disabled ? ' (not yet)' : ''}`));

/** @param {string} id */
const versionsOf = async (id) => (await server.exec('history', { class: 'Expense', id }, 'jan')).versions;

test('Submit follows what Jan types, and the page asks the server nothing for it', async () => {
  const { document: draft } = await server.exec('create', { class: 'Expense', values: { what: 'Nothing yet' } }, 'jan');
  const { context, page, wrong, commands } = await opened('jan', 'Expense', draft.id);
  assert.deepEqual(await buttons(page), ['Submit (not yet)'], 'a total of nothing cannot be submitted');

  await page.fill('#f-net', '100');
  await page.fill('#f-net-currency', 'PLN');
  assert.deepEqual(await buttons(page), ['Submit'], 'with a total above zero it can, before anything is saved');

  await page.fill('#f-net', '0');
  assert.deepEqual(await buttons(page), ['Submit (not yet)']);
  assert.match(await page.locator('.move-why').innerText(), /^Not yet\. /);

  await page.fill('#f-net', '100');
  assert.deepEqual(await buttons(page), ['Submit']);
  assert.deepEqual(commands, [], 'the class\'s own rule and guard were worked out in the page');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what the page offers is what the server would offer for the same typing', async () => {
  const { document: draft } = await server.exec('create', { class: 'Expense', values: { what: 'Checked against the server' } }, 'jan');
  const { context, page, wrong } = await opened('jan', 'Expense', draft.id);
  for (const net of ['100', '0', '0.01', '5000']) {
    await page.fill('#f-net', net);
    await page.fill('#f-net-currency', 'PLN');
    const { preview } = await server.exec('preview', { class: 'Expense', id: draft.id, values: { net: `${net} PLN` } }, 'jan');
    const open = preview.transitions.filter((/** @type {any} */ t) => t.enabled || t.code === 'guard_false')
      .map((/** @type {any} */ t) => `Submit${t.enabled ? '' : ' (not yet)'}`);
    assert.deepEqual(await buttons(page), open, `with a net amount of ${net}`);
  }
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a move takes what was typed with it, in one step', async () => {
  const { document: draft } = await server.exec('create', { class: 'Expense', values: { what: 'Nothing yet' } }, 'jan');
  const { context, page, wrong, commands } = await opened('jan', 'Expense', draft.id);
  await page.fill('#f-what', 'Train tickets to Gdańsk');
  await page.fill('#f-net', '4200');
  await page.fill('#f-net-currency', 'PLN');
  assert.ok(await page.locator('#changes-hint').isVisible());

  await page.locator('#moves button', { hasText: 'Submit' }).click();
  await page.waitForFunction(() => document.getElementById('said')?.textContent !== '');
  assert.equal(await page.locator('#said').innerText(), 'Done: Submit. It is now in Waiting for approval.');
  assert.ok(await page.locator('#changes').isHidden());

  const versions = await versionsOf(draft.id);
  assert.equal(versions.length, 2, 'one step: the document has one more version, not two');
  assert.equal(versions[1].state, 'submitted');
  assert.equal(versions[1].values.net, '4200.00 PLN');
  assert.equal(versions[1].values.what, 'Train tickets to Gdańsk');
  assert.equal((await page.locator('.history-what').allInnerTexts())[0], 'Jan Kowalski moved it from Draft to Waiting for approval and changed What was bought, Net amount');
  assert.deepEqual(commands.filter((c) => c === 'transition' || c === 'set'), ['transition']);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Ann adds to the note and approves, in one step', async () => {
  const { document: draft } = await server.exec('create', { class: 'Expense', values: { what: 'Taxi', net: '86.50 PLN' } }, 'jan');
  await server.exec('transition', { class: 'Expense', id: draft.id, transition: 'submit' }, 'jan');
  const { context, page, wrong } = await opened('ann', 'Expense', draft.id);
  await page.fill('#f-note', 'Checked against the receipt');
  assert.deepEqual(await buttons(page), ['Send back', 'Approve'], 'what she may do is still there while she types');

  await page.locator('#moves button', { hasText: 'Approve' }).click();
  await page.waitForFunction(() => document.getElementById('said')?.textContent !== '');
  const versions = await versionsOf(draft.id);
  const last = versions[versions.length - 1];
  assert.equal(last.state, 'approved');
  assert.equal(last.values.note, 'Checked against the receipt');
  assert.equal(versions.length, 3);
  assert.deepEqual(wrong, []);
  await context.close();
});

test('a move the server refuses for what was typed keeps the typing', async () => {
  const { document: draft } = await server.exec('create', { class: 'Expense', values: { what: 'A rate too high', net: '100 PLN' } }, 'jan');
  const { context, page, wrong, answers } = await opened('jan', 'Expense', draft.id);
  await page.fill('#f-note', 'Kept');
  await page.fill('#f-vat_rate', '50');
  await page.locator('#moves button', { hasText: 'Submit' }).click();
  await page.waitForFunction(() => !document.getElementById('refused')?.hidden);

  assert.match(await page.locator('#refused-what').innerText(), /above the maximum/);
  assert.match(await page.locator('#f-vat_rate-why').innerText(), /above the maximum/);
  assert.equal(await page.inputValue('#f-note'), 'Kept');
  assert.equal(await page.inputValue('#f-vat_rate'), '50');
  assert.equal(await page.locator('#doc-state').innerText(), 'Draft');
  assert.deepEqual(answers.map((a) => a.path), ['/v1/transition']);
  assert.equal((await versionsOf(draft.id)).length, 1, 'the server took neither the change nor the move');

  // He puts the rate right and submits again: the buttons are his again.
  await page.fill('#f-vat_rate', '23');
  assert.deepEqual(await buttons(page), ['Submit']);
  await page.locator('#moves button', { hasText: 'Submit' }).click();
  await page.waitForFunction(() => document.getElementById('said')?.textContent !== '');
  const versions = await versionsOf(draft.id);
  assert.equal(versions.length, 2);
  assert.equal(versions[1].state, 'submitted');
  assert.equal(versions[1].values.note, 'Kept');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what cannot be read cannot go with a move', async () => {
  const { document: draft } = await server.exec('create', { class: 'Expense', values: { what: 'A number mistyped', net: '100 PLN' } }, 'jan');
  const { context, page, wrong } = await opened('jan', 'Expense', draft.id);
  await page.fill('#f-net', '12,5x');
  assert.deepEqual(await buttons(page), ['Submit (not yet)']);
  assert.ok(await page.locator('#moves-wait').isVisible());
  await page.fill('#f-net', '125');
  assert.deepEqual(await buttons(page), ['Submit']);
  assert.ok(await page.locator('#moves-wait').isHidden());
  assert.deepEqual(wrong, []);
  await context.close();
});

test('where a condition is the server\'s to work out, the page asks the server', async () => {
  const { document: order } = await server.exec('create', { class: 'Order', values: { subject: 'Paper', currency: 'EUR' } }, 'jan');
  const { context, page, wrong, commands } = await opened('jan', 'Order', order.id);
  assert.deepEqual(await buttons(page), ['Send'], 'the rate of EUR is above 4');

  await page.fill('#f-currency', 'USD');
  await page.waitForFunction(() => document.querySelector('#moves .move-why')?.textContent?.startsWith('Not yet.'));
  assert.deepEqual(await buttons(page), ['Send (not yet)'], 'the rate of USD is not');
  assert.ok(commands.includes('preview'), 'the page asked the server');

  await page.fill('#f-currency', 'EUR');
  await page.waitForFunction(() => !(/** @type {HTMLButtonElement | null} */ (document.querySelector('#moves button'))?.disabled));
  await page.fill('#f-subject', 'Paper, ten boxes');
  await page.waitForFunction(() => !(/** @type {HTMLButtonElement | null} */ (document.querySelector('#moves button'))?.disabled));
  await page.locator('#moves button', { hasText: 'Send' }).click();
  await page.waitForFunction(() => document.getElementById('said')?.textContent !== '');
  const { document } = await server.exec('get', { class: 'Order', id: order.id }, 'jan');
  assert.equal(document.state, 'sent');
  assert.equal(document.values.subject, 'Paper, ten boxes');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('Discard reads the document again, as somebody else may have left it', async () => {
  const { document: draft } = await server.exec('create', { class: 'Expense', values: { what: 'Taxi', net: '86.50 PLN' } }, 'jan');
  await server.exec('transition', { class: 'Expense', id: draft.id, transition: 'submit' }, 'jan');
  const { context, page, wrong } = await opened('ann', 'Expense', draft.id);
  await page.fill('#f-note', 'Typed, then Jan takes it back');
  await server.exec('transition', { class: 'Expense', id: draft.id, transition: 'take_back' }, 'jan');

  await page.click('#discard');
  await page.waitForFunction(() => document.getElementById('said')?.textContent === 'Put back as the server has it.');
  assert.equal(await page.locator('#doc-state').innerText(), 'Draft');
  assert.equal(await page.locator('.field:has(.input)').count(), 0, 'a draft is Jan\'s to change, not hers');
  assert.deepEqual(wrong, []);
  await context.close();
});
