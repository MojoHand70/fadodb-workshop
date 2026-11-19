// Temporary: the tests' own sign-in at a plain http address, many
// times, one at a time.

import { after, before, test } from 'node:test';
import { appendFileSync } from 'node:fs';
import { acme, signIn } from './acme.mjs';
import { launch } from './browser.mjs';
import { NAME, passage } from './passage.mjs';

const OUT = process.env.HUNT_OUT ?? '.';
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
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await way?.close();
  await server?.close();
});

test(`hunt: ${ROUNDS} sign-ins at the plain address, as the tests sign in`, async () => {
  let lost = 0;
  for (let round = 1; round <= ROUNDS; round++) {
    const context = await browser.newContext({ proxy: way.proxy });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    try {
      await signIn(page, server.site, server, 'jan');
    } catch (error) {
      lost++;
      appendFileSync(`${OUT}/lost.txt`, `LOST round ${round}: ${error instanceof Error ? error.message : error}\n`);
    }
    await context.close();
  }
  appendFileSync(`${OUT}/tally.txt`, `${ROUNDS} sign-ins, ${lost} lost\n`);
  if (lost) throw new Error(`${lost} of ${ROUNDS} sign-ins did not arrive`);
});
