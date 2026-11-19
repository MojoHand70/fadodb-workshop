// What every test of a page shares: open it in a real browser and
// collect what went wrong while it loaded.

/**
 * Opens a page and waits until its script says it is ready.
 *
 * `wrong` gathers what must never happen on a page of Workshop: something
 * refused by the security header, an error of a script, a file that did
 * not load. `answers` gathers the answers of 400 and above, which a test
 * may expect: a person who is not signed in is answered 401.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{ width: number, height: number }} [viewport]
 */
export async function open(browser, url, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const { wrong, answers } = watch(page);
  await page.goto(url);
  await ready(page);
  return { context, page, wrong, answers };
}

/**
 * Collects what goes wrong on a page from now on.
 *
 * @param {import('playwright').Page} page
 */
export function watch(page) {
  slow(page);
  /** @type {string[]} */
  const wrong = [];
  /** @type {{ status: number, path: string }[]} */
  const answers = [];
  page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`refused by the security header: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on('console', (m) => {
    // The browser writes a line for every answer of 400 and above; those
    // are in `answers`.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) wrong.push(m.text());
  });
  page.on('pageerror', (e) => wrong.push(String(e)));
  page.on('requestfailed', (r) => wrong.push(`not loaded: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) answers.push({ status: r.status(), path: new URL(r.url()).pathname });
  });
  return { wrong, answers };
}

/**
 * Makes the page's own work slower, when SLOW names by how much: SLOW=6
 * gives the page a sixth of the machine. A test that reads something
 * before the page has drawn it passes on a fast machine and fails on a
 * slow one; this finds it here, before the run on GitHub does.
 *
 * @param {import('playwright').Page} page
 */
function slow(page) {
  const rate = Number(process.env.SLOW ?? 0);
  if (rate > 1) {
    page.context().newCDPSession(page).then((session) => session.send('Emulation.setCPUThrottlingRate', { rate }));
  }
}

/**
 * Waits until the page's script has drawn what it had to.
 *
 * @param {import('playwright').Page} page
 */
export async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'yes');
}

/**
 * A text of a page with plain spaces: a number shown in a person's
 * language may hold spaces that do not break.
 *
 * @param {string} text
 */
export function plain(text) {
  return text.replaceAll(String.fromCharCode(0xa0), ' ').replaceAll(String.fromCharCode(0x202f), ' ');
}

/**
 * Whether the page fits its window, with nothing to scroll sideways.
 *
 * @param {import('playwright').Page} page
 */
export function fits(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}
