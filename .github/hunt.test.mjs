// Temporary: the sign-in at a plain http address, many times, four at
// once, and what the page held when the form was not sent. HUNT_HOW
// names the way the form is filled and sent.

import { after, before, test } from 'node:test';
import { appendFileSync } from 'node:fs';
import { firefox } from 'playwright';
import { PASSWORD, acme } from './acme.mjs';
import { NAME, passage } from './passage.mjs';

const OUT = process.env.HUNT_OUT ?? '.';
const HOW = process.env.HUNT_HOW ?? 'as-it-is';
// One at a time: a browser opens a box of its own only in the window a person is in.
const LANES = 1;
const ROUNDS = 24;
/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {Awaited<ReturnType<typeof passage>>} */
let way;
/** @type {import('playwright').Browser} */
let browser;

before(async () => {
  server = await acme({ name: NAME });
  way = await passage(server);
  browser = await firefox.launch(HOW === 'no-warning' ? { firefoxUserPrefs: { 'security.insecure_field_warning.contextual.enabled': false } } : {});
});

after(async () => {
  await browser?.close();
  await way?.close();
  await server?.close();
});

test(`hunt (${HOW}): ${LANES * ROUNDS} sign-ins at the plain address`, async () => {
  const { link } = await server.exec('create_password_link', { user: 'jan' });
  {
    const context = await browser.newContext({ proxy: way.proxy });
    const page = await context.newPage();
    await page.goto(`${server.site.url}auth/password?link=${link.token}`);
    await page.fill('#password', PASSWORD);
    await page.fill('#again', PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForURL((address) => !address.search.includes('link='));
    await context.close();
  }
  let lost = 0;
  let second = 0;
  /** @param {number} lane */
  const lane = async (lane) => {
    for (let round = 1; round <= ROUNDS; round++) {
      const context = await browser.newContext({ proxy: way.proxy });
      const page = await context.newPage();
      /** @type {string[]} */
      const events = [];
      const began = Date.now();
      const note = (/** @type {string} */ what) => events.push(`${Date.now() - began} ${what}`);
      page.on('request', (r) => r.method() === 'POST' && note(`request POST ${new URL(r.url()).pathname}`));
      await page.goto(server.site.url);
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'yes');
      await page.click('#sign-in');
      await page.fill('#user', 'jan');
      note('filled user');
      if (HOW === 'typed') {
        await page.click('#password');
        await page.keyboard.type(PASSWORD);
      } else {
        await page.fill('#password', PASSWORD);
      }
      note('filled password');
      // What reaches the page of a press of the mouse, from now on.
      await page.evaluate(() => {
        /** @type {any} */ (window).reached = [];
        for (const kind of ['mousedown', 'mouseup', 'click', 'submit', 'blur']) {
          window.addEventListener(kind, (e) => /** @type {any} */ (window).reached.push(`${kind} ${/** @type {Element} */ (e.target).id || /** @type {Element} */ (e.target).tagName}`), true);
        }
      });
      if (HOW === 'enter') await page.press('#password', 'Enter');
      else await page.click('button[type=submit]');
      note('sent');
      let arrived = await page.waitForURL(server.site.url, { timeout: 6000 }).then(() => true, () => false);
      if (!arrived) {
        lost++;
        const held = await page.evaluate(() => ({
          user: /** @type {HTMLInputElement} */ (document.querySelector('#user'))?.value,
          password: /** @type {HTMLInputElement} */ (document.querySelector('#password'))?.value.length,
          active: document.activeElement?.id || document.activeElement?.tagName,
          at: location.pathname + location.search,
          reached: /** @type {any} */ (window).reached,
        })).catch((error) => ({ error: String(error) }));
        note(`lost; the page holds ${JSON.stringify(held)}`);
        // What a person would do next: press the button again.
        await page.click('button[type=submit]').catch(() => {});
        note('clicked the button a second time');
        arrived = await page.waitForURL(server.site.url, { timeout: 6000 }).then(() => true, () => false);
        if (arrived) second++;
        note(`after the second click: ${arrived ? 'arrived' : 'still not there'}`);
        appendFileSync(`${OUT}/lost.txt`, `LOST (${HOW}) lane ${lane} round ${round}\n  ${events.join('\n  ')}\n`);
      }
      await context.close();
    }
  };
  await Promise.all(Array.from({ length: LANES }, (_, n) => lane(n + 1)));
  appendFileSync(`${OUT}/tally.txt`, `${HOW}: ${LANES * ROUNDS} sign-ins, ${lost} lost at the first try, ${second} of them arrived at a second click\n`);
  if (lost) throw new Error(`${lost} of ${LANES * ROUNDS} sign-ins did not arrive at the first try`);
});
