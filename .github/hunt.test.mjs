// Temporary: the sign-in at a plain http address, many times, and what
// the page held when the form was not sent.

import { after, before, test } from 'node:test';
import { appendFileSync } from 'node:fs';
import { PASSWORD, acme } from './acme.mjs';
import { launch } from './browser.mjs';
import { NAME, passage } from './passage.mjs';

const OUT = process.env.HUNT_OUT ?? '.';
/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {Awaited<ReturnType<typeof passage>>} */
let way;
/** @type {import('playwright').Browser} */
let browser;

before(async () => {
  server = await acme({ name: NAME });
  way = await passage(server);
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await way?.close();
  await server?.close();
});

test('hunt: twelve sign-ins at the plain address', async () => {
  const { link } = await server.exec('create_password_link', { user: 'jan' });
  {
    const context = await browser.newContext({ proxy: way.proxy });
    const page = await context.newPage();
    await page.goto(`${server.site.url}auth/password?link=${link.token}`);
    await page.fill('#password', PASSWORD);
    await page.fill('#again', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((address) => !address.search.includes('link='));
    await context.close();
  }
  let lost = 0;
  for (let round = 1; round <= 12; round++) {
    const context = await browser.newContext({ proxy: way.proxy });
    const page = await context.newPage();
    /** @type {string[]} */
    const events = [];
    const began = Date.now();
    const note = (/** @type {string} */ what) => events.push(`${Date.now() - began} ${what}`);
    page.on('framenavigated', (frame) => frame === page.mainFrame() && note(`navigated ${new URL(frame.url()).pathname}${new URL(frame.url()).search}`));
    page.on('load', () => note('load'));
    page.on('domcontentloaded', () => note('domcontentloaded'));
    page.on('request', (r) => note(`request ${r.method()} ${new URL(r.url()).pathname}`));
    page.on('response', (r) => note(`response ${r.status()} ${new URL(r.url()).pathname}`));
    page.on('console', (m) => note(`console ${m.type()} ${m.text().slice(0, 160)}`));
    await page.goto(server.site.url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'yes');
    note('ready');
    await page.click('#sign-in');
    note('clicked the link');
    await page.fill('#user', 'jan');
    note('filled user');
    await page.fill('#password', PASSWORD);
    note('filled password');
    const before = await page.evaluate(() => ({
      user: /** @type {HTMLInputElement} */ (document.querySelector('#user')).value,
      password: /** @type {HTMLInputElement} */ (document.querySelector('#password')).value.length,
      state: document.readyState,
    }));
    note(`before the click ${JSON.stringify(before)}`);
    await page.click('button[type=submit]');
    note('clicked the button');
    const arrived = await page.waitForURL(server.site.url, { timeout: 8000 }).then(() => true, () => false);
    if (!arrived) {
      lost++;
      const held = await page.evaluate(() => ({
        user: /** @type {HTMLInputElement} */ (document.querySelector('#user'))?.value,
        password: /** @type {HTMLInputElement} */ (document.querySelector('#password'))?.value.length,
        active: document.activeElement?.id || document.activeElement?.tagName,
        invalid: [...document.querySelectorAll(':invalid')].map((e) => e.id || e.tagName),
        state: document.readyState,
        at: location.pathname + location.search,
      })).catch((error) => ({ error: String(error) }));
      const stamp = `${Date.now()}-${round}`;
      await page.screenshot({ path: `${OUT}/lost-${stamp}.png` }).catch(() => {});
      appendFileSync(`${OUT}/lost-${stamp}.txt`, `LOST in round ${round}\nheld after: ${JSON.stringify(held)}\nevents:\n  ${events.join('\n  ')}\n\n`);
    }
    await context.close();
  }
  appendFileSync(`${OUT}/tally.txt`, `twelve sign-ins, ${lost} lost\n`);
  if (lost) throw new Error(`${lost} of twelve sign-ins did not arrive`);
});
