// What every test of a page shares: open it in a real browser and
// collect what went wrong while it loaded.
//
// The browser is Chromium unless TEST_BROWSER names another: firefox,
// or webkit, the engine of Safari. The same tests run in each. (The
// name is not BROWSER: on many machines that one already names the
// program that opens a link.)

import { chromium, firefox, webkit } from 'playwright';

/** The browser the tests run in, by its name. */
export const BROWSER = process.env.TEST_BROWSER || 'chromium';

/**
 * Starts the browser the tests run in.
 *
 * @returns {Promise<import('playwright').Browser>}
 */
export function launch() {
  const engines = { chromium, firefox, webkit };
  const engine = engines[/** @type {'chromium' | 'firefox' | 'webkit'} */ (BROWSER)];
  if (!engine) throw new Error(`TEST_BROWSER names ${BROWSER}; the tests run in chromium, firefox or webkit.`);
  return engine.launch();
}

/**
 * Opens a page and waits until its script says it is ready.
 *
 * `wrong` gathers what must never happen on a page of Workshop: something
 * refused by the security header, an error of a script, a file that did
 * not load. `answers` gathers the answers of 400 and above, which a test
 * may expect: a person who is not signed in is answered 401. `commands`
 * gathers the names of the commands the page sent.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{ width: number, height: number }} [viewport]
 */
export async function open(browser, url, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const { wrong, answers, commands } = watch(page);
  await page.goto(url);
  await ready(page);
  return { context, page, wrong, answers, commands };
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
  /** The commands the page sent, by name, in order. */
  /** @type {string[]} */
  const commands = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/v1/')) commands.push(path.slice(4));
  });
  page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`refused by the security header: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The browser writes a line for every answer of 400 and above; those
    // are in `answers`.
    if (m.text().startsWith('Failed to load resource')) return;
    wrong.push(m.text());
  });
  page.on('pageerror', (e) => wrong.push(String(e)));
  page.on('requestfailed', (r) => wrong.push(`not loaded: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) answers.push({ status: r.status(), path: new URL(r.url()).pathname });
  });
  return { wrong, answers, commands };
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
  // Only Chromium can be slowed this way.
  if (rate > 1 && BROWSER === 'chromium') {
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

/**
 * Leaves a page as a person does who follows a link away from it, the
 * name of Workshop at the top of every page, and answers what came of
 * it: 'asked' when the browser asked first, and the person then stays
 * on the page; 'left' when the page went without a question.
 *
 * It waits for the one or the other to happen, however long the
 * browser takes: never for a moment in between.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<'asked' | 'left'>}
 */
export async function leaveByLink(page) {
  const from = page.url();
  /** @type {(dialog: import('playwright').Dialog) => void} */
  let question = () => {};
  /** @type {(frame: import('playwright').Frame) => void} */
  let gone = () => {};
  /** @type {Promise<'asked' | 'left'>} */
  const came = new Promise((answer) => {
    question = async (dialog) => {
      const about = dialog.type();
      await dialog.dismiss();
      if (about === 'beforeunload') answer('asked');
    };
    gone = (frame) => {
      if (frame === page.mainFrame() && frame.url() !== from) answer('left');
    };
  });
  page.on('dialog', question);
  page.on('framenavigated', gone);
  await page.locator('header.top a.brand').click();
  const what = await came;
  page.off('dialog', question);
  page.off('framenavigated', gone);
  return what;
}

/**
 * Why closing a window is not checked in WebKit; false in the browsers
 * where it is checked.
 *
 * Asked to close a window, WebKit gives the page 50 ms to answer and
 * closes it when no answer came in that time, whatever the page would
 * have said (`tryCloseTimeoutDelay` in its `WebPageProxy.cpp`). A busy
 * page, or a machine that runs several browsers at once, is sometimes
 * slower than that; the window then goes without a question, and
 * nothing a page does changes it. Leaving by a link has no such clock:
 * `leaveByLink` holds the question in every browser.
 */
export const CLOSING_NOT_CHECKED =
  BROWSER === 'webkit' ? 'WebKit closes a window whose page has not answered within 50 ms, whatever the page would have answered' : false;

/**
 * Leaves a page as a person does who closes its window, and answers
 * what came of it: 'asked' when the browser asked first, and the
 * person then stays; 'left' when the page went without a question.
 *
 * It waits for the one or the other to happen, however long the
 * browser takes: never for a moment in between. Not for WebKit: see
 * `CLOSING_NOT_CHECKED`.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<'asked' | 'left'>}
 */
export async function leaveByClosing(page) {
  /** @type {Promise<'asked'>} */
  const asked = new Promise((answer) => {
    page.once('dialog', async (dialog) => {
      if (dialog.type() === 'beforeunload') answer('asked');
      await dialog.dismiss();
    });
  });
  /** @type {Promise<'left'>} */
  const left = new Promise((answer) => {
    page.once('close', () => answer('left'));
  });
  await page.close({ runBeforeUnload: true });
  return Promise.race([asked, left]);
}
