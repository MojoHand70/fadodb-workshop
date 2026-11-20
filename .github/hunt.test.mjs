// Temporary: why WebKit sometimes lets a designer's page with unsaved
// text go without asking. Each round leaves such a page in one of four
// ways and writes down what the browser did, and what the page's own
// handler had decided when the page went without a question.

import { after, before, test } from 'node:test';
import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { acme, signIn } from './acme.mjs';
import { launch, leave, ready } from './browser.mjs';

const OUT = process.env.HUNT_OUT ?? '.';
const ROUNDS = 8;
/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {import('playwright').Browser} */
let browser;
/** @type {any} */
let dan;
/** @type {any} */
let expense;

before(async () => {
  server = await acme();
  expense = JSON.parse(await readFile(new URL('./fixtures/expense.json', import.meta.url), 'utf8'));
  await server.exec('define_class', { definition: { ...expense, name: 'Hunted' } });
  browser = await launch();
  const context = await browser.newContext();
  await signIn(await context.newPage(), server.site, server, 'dan');
  dan = await context.storageState();
  await context.close();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const WAYS = ['as the tests do', 'with a press on the page just before', 'with a letter typed, not put in', 'with returnValue set as well'];

test('hunt: leaving a designer\'s page with unsaved text, four ways', async () => {
  /** @type {Record<string, { asked: number, left: number, logs: string[] }>} */
  const tally = {};
  for (const way of WAYS) tally[way] = { asked: 0, left: 0, logs: [] };
  for (let round = 0; round < ROUNDS; round++) {
    for (const way of WAYS) {
      const context = await browser.newContext({ storageState: dan });
      const page = await context.newPage();
      await page.goto(`${server.site.url}design.html?class=Hunted&as=text`);
      await ready(page);
      if (way === 'with returnValue set as well') {
        await page.evaluate(() => window.addEventListener('beforeunload', (e) => { if (e.defaultPrevented) e.returnValue = true; }));
      }
      // What the page's own handler had decided, kept where another page of the site can read it.
      await page.evaluate(() => {
        localStorage.removeItem('hunt');
        window.addEventListener('beforeunload', (e) => localStorage.setItem('hunt', JSON.stringify({ fired: true, prevented: e.defaultPrevented, returnValue: String(e.returnValue) })));
      });
      await page.locator('#class-text .cm-content').click();
      await page.keyboard.press('ControlOrMeta+A');
      if (way === 'with a letter typed, not put in') await page.keyboard.type('x');
      else await page.keyboard.insertText(JSON.stringify({ ...expense, name: 'Hunted', description: 'Not saved.' }, null, 2));
      await page.locator('#class-changed').waitFor();
      if (way === 'with a press on the page just before') await page.click('#class-title');
      const outcome = await leave(page);
      tally[way][outcome]++;
      if (outcome === 'left') {
        const again = await context.newPage();
        await again.goto(server.site.url);
        tally[way].logs.push(String(await again.evaluate(() => localStorage.getItem('hunt'))));
      }
      await context.close();
    }
  }
  for (const way of WAYS) appendFileSync(`${OUT}/tally.txt`, `${way}: asked ${tally[way].asked}, left ${tally[way].left}${tally[way].logs.length ? '; when left, the handler had said: ' + tally[way].logs.join(' | ') : ''}\n`);
});
