// How Workshop looks to a person (ADR-0008): six schemes, each in a
// light and a dark shade. The colours are worked out by a tool and held
// here to what is read on what; then Ann chooses in front of a real
// FadoDB server, and her choice holds from page to page.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { acme, signIn } from './acme.mjs';
import { fits, launch, ready, watch } from './browser.mjs';
import { MUST, SCHEMES, STANDARD_LIGHT, colours, contrast, sharedDark, written } from '../tools/schemes.mjs';

const pages = new URL('../pages/', import.meta.url);
const sheet = await readFile(new URL('workshop.css', pages), 'utf8');

/**
 * The tokens a rule of the style sheet sets, by the rule's selector as
 * it is written.
 *
 * @param {string} selector
 */
function rule(selector) {
  /** @type {Record<string, string>} */
  const tokens = {};
  let from = 0;
  for (;;) {
    const at = sheet.indexOf(`\n${selector} {`, from);
    if (at < 0) break;
    const body = sheet.slice(at, sheet.indexOf('}', at));
    for (const [, token, value] of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tokens[token] = value.trim();
    from = at + 1;
  }
  return tokens;
}

/**
 * The colours a page has in a scheme and a shade, as the style sheet
 * gives them: the root's, then the dark shade's, then the scheme's.
 *
 * @param {string} scheme
 * @param {'light' | 'dark'} shade
 */
function tokensOf(scheme, shade) {
  return {
    ...rule(':root'),
    ...(shade === 'dark' ? rule(':root[data-shade="dark"]') : {}),
    ...(scheme === 'standard' ? {} : rule(`:root[data-scheme="${scheme}"]`)),
    ...(shade === 'dark' && scheme !== 'standard' ? rule(`:root[data-scheme="${scheme}"][data-shade="dark"]`) : {}),
  };
}

const SHADES = /** @type {const} */ (['light', 'dark']);

test('the style sheet holds the colours the tool works out, and Fado Standard in the light shade is as it was chosen', () => {
  assert.equal(written(sheet), sheet, 'run node tools/schemes.mjs');
  const root = rule(':root');
  assert.equal(root.accent, STANDARD_LIGHT.accent);
  assert.equal(root['accent-soft'], STANDARD_LIGHT['accent-soft']);
  // The light shade of Fado Standard is the look the owner chose by eye (ADR-0007): no rule of a scheme touches it.
  assert.deepEqual(rule(':root[data-scheme="standard"]'), {});
  assert.deepEqual([root.bg, root.surface, root.ink, root.accent, root['accent-strong']], ['#FAF9FF', '#FFFFFF', '#262338', '#6A5AE0', '#5546C9']);
});

test('in every scheme and shade, what is read is far enough from its ground', () => {
  /** What every scheme shares: the words of a wrong thing, of what waits, the colours inside a text, and each app's ink on its ground. */
  const shared = [
    ['bad', 'surface', 4.5], ['bad', 'bad-bg', 4.5], ['bad', 'bg', 4.5], ['bad-edge', 'surface', 3],
    ['wip', 'wip-bg', 4.5], ['code-text', 'bg', 4.5], ['code-text', 'surface', 4.5], ['code-number', 'bg', 4.5], ['code-number', 'surface', 4.5],
    ...[0, 1, 2, 3, 4, 5].map((n) => [`h${n}-fg`, `h${n}-bg`, 4.5]),
  ];
  for (const scheme of SCHEMES) {
    for (const shade of SHADES) {
      const tokens = tokensOf(scheme.name, shade);
      for (const [one, other, least] of [...MUST, ...shared]) {
        const [a, b] = [tokens[String(one)], tokens[String(other)]];
        assert.match(a ?? '', /^#[0-9A-F]{6}$/, `${scheme.name}, ${shade}: --${one} is a colour`);
        assert.match(b ?? '', /^#[0-9A-F]{6}$/, `${scheme.name}, ${shade}: --${other} is a colour`);
        const apart = contrast(a, b);
        assert.ok(apart >= Number(least), `${scheme.name}, ${shade}: --${one} on --${other} is ${apart.toFixed(2)} to 1, and at least ${least} is asked`);
      }
    }
  }
});

test('the schemes a page offers are the ones the tool works out, and every page takes the look before it is drawn', async () => {
  const early = await readFile(new URL('look-early.js', pages), 'utf8');
  const offered = [...early.matchAll(/\['([a-z]+)', '([^']+)'\],/g)].map(([, name, words]) => [name, words]);
  assert.deepEqual(offered.slice(0, SCHEMES.length), SCHEMES.map((scheme) => [scheme.name, scheme.words]));
  assert.deepEqual(offered.slice(SCHEMES.length), [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]);
  const html = (await readdir(pages)).filter((name) => name.endsWith('.html'));
  assert.ok(html.length >= 6);
  for (const name of html) {
    const page = await readFile(new URL(name, pages), 'utf8');
    const [script, style] = [page.indexOf('<script src="look-early.js"></script>'), page.indexOf('<link rel="stylesheet" href="workshop.css">')];
    assert.ok(script > 0 && style > script, `${name} runs look-early.js before it reads the style sheet`);
  }
});

test('no rule and no script writes a colour of its own: each is a token, and so follows the scheme', async () => {
  // What a rule declares, without the selectors, where #add-app is a name and no colour.
  const declared = [...sheet.slice(sheet.indexOf('/* schemes: end */')).matchAll(/\{([^{}]*)\}/g)].map(([, body]) => body).join('\n');
  assert.deepEqual(declared.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\((?!var\(--shade\))[^)]*\)|hsla?\([^)]*\)/g) ?? [], []);
  for (const name of (await readdir(pages)).filter((one) => one.endsWith('.js'))) {
    const script = await readFile(new URL(name, pages), 'utf8');
    assert.deepEqual(script.match(/'#[0-9A-Fa-f]{6}'|rgba?\((?!var\(--shade\))\s*\d[^)]*\)/g) ?? [], [], name);
  }
});

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;
/** @type {{ url: string }} */
let site;
/** @type {import('playwright').Browser} */
let browser;
/** What a browser holds once Ann has signed in. */
/** @type {Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>} */
let ann;

before(async () => {
  server = await acme();
  site = server.site;
  await server.exec('define_app', { definition: { name: 'Helpdesk', label: 'Help desk' } });
  browser = await launch();
  const context = await browser.newContext();
  await signIn(await context.newPage(), site, server, 'ann');
  ann = await context.storageState();
  await context.close();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/** What the root of a page says of the look, and the ground the page is drawn on. */
const shown = (/** @type {import('playwright').Page} */ page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return { scheme: root.dataset.scheme, shade: root.dataset.shade, bg: style.getPropertyValue('--bg').trim(), accent: style.getPropertyValue('--accent').trim() };
  });

/**
 * @param {string} scheme
 * @param {'light' | 'dark'} shade
 */
const worked = (scheme, shade) => {
  const tokens = tokensOf(scheme, shade);
  return { scheme, shade, bg: tokens.bg, accent: tokens.accent };
};

test('Ann chooses a scheme and a shade in her menu; it shows at once and holds from page to page', async () => {
  // Her machine is in the dark shade. What nobody chose is Fado Standard, light.
  const context = await browser.newContext({ storageState: ann, viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const { wrong } = watch(page);
  await page.goto(site.url);
  await ready(page);
  assert.deepEqual(await shown(page), worked('standard', 'light'));

  await page.locator('#who-open').click();
  const look = page.locator('#look');
  await look.waitFor();
  assert.equal(await page.locator('#look-name').innerText(), 'Fado Standard');
  assert.deepEqual(await page.getByRole('radiogroup', { name: 'Colours' }).getByRole('radio').evaluateAll((all) => all.map((one) => one.getAttribute('aria-label'))), SCHEMES.map((scheme) => scheme.words));
  assert.deepEqual(await page.locator('.look-mode').allInnerTexts(), ['Light', 'Dark', 'System']);
  assert.ok(await page.getByRole('radio', { name: 'Fado Standard' }).isChecked());
  assert.ok(await page.getByRole('radio', { name: 'Light', exact: true }).isChecked());

  // A swatch pressed: the page is in that scheme at once.
  await page.locator('.look-scheme:has(.look-swatch[data-swatch="ocean"])').click();
  assert.deepEqual(await shown(page), worked('ocean', 'light'));
  assert.equal(await page.locator('#look-name').innerText(), 'Ocean');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  assert.deepEqual(await shown(page), worked('ocean', 'dark'));

  // Every scheme and shade, as the style sheet and the tool have them.
  for (const scheme of SCHEMES) {
    for (const shade of SHADES) {
      await page.getByRole('radio', { name: scheme.words }).check();
      await page.getByRole('radio', { name: shade === 'light' ? 'Light' : 'Dark', exact: true }).check();
      const now = await shown(page);
      assert.deepEqual(now, worked(scheme.name, shade));
      if (scheme.name !== 'standard' || shade === 'dark') {
        const tool = Object.fromEntries(colours(scheme, shade));
        assert.deepEqual([now.bg, now.accent], [tool.bg, tool.accent], `${scheme.name}, ${shade}`);
      }
    }
  }
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--h0-fg').trim()), Object.fromEntries(sharedDark())['h0-fg'], 'an app keeps its colour, in its dark shade');

  // By the keyboard: the arrows go from scheme to scheme, and Escape puts the menu away.
  await page.getByRole('radio', { name: 'Graphite' }).focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal((await shown(page)).scheme, 'rose');
  assert.ok(await page.getByRole('radio', { name: 'Rose' }).isChecked());
  await page.keyboard.press('Escape');
  await look.waitFor({ state: 'hidden' });

  // Another page, and the same page read again: the look is there before the page is drawn.
  await page.goto(`${site.url}app.html?unassigned`);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.scheme, document.documentElement.dataset.shade]), ['rose', 'dark'], 'said on the root before the page has asked the server anything');
  await ready(page);
  assert.deepEqual(await shown(page), worked('rose', 'dark'));
  await page.locator('#who-open').click();
  assert.equal(await page.locator('#look-name').innerText(), 'Rose');
  assert.ok(await page.getByRole('radio', { name: 'Dark', exact: true }).isChecked());

  // Another window of hers shows what she chooses here.
  const other = await context.newPage();
  await other.goto(site.url);
  await ready(other);
  assert.equal((await shown(other)).scheme, 'rose');
  await page.getByRole('radio', { name: 'Meadow' }).check();
  await other.waitForFunction(() => document.documentElement.dataset.scheme === 'meadow');
  await other.close();
  assert.deepEqual(wrong, []);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await fits(page), 'the menu with the choice fits a phone');
  const [menu, last] = [await page.locator('#who-menu').boundingBox(), await page.locator('.look-scheme').last().boundingBox()];
  assert.ok(menu && last && last.x + last.width <= menu.x + menu.width, 'every swatch is inside the menu');
  await context.close();
});

test('System is the shade of the person\'s machine, and follows it', async () => {
  const context = await browser.newContext({ storageState: ann, viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
  const page = await context.newPage();
  const { wrong } = watch(page);
  await page.goto(site.url);
  await ready(page);
  await page.locator('#who-open').click();
  await page.getByRole('radio', { name: 'System', exact: true }).check();
  assert.equal((await shown(page)).shade, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.shade === 'dark');
  assert.deepEqual(await shown(page), worked('standard', 'dark'));
  await page.reload();
  await ready(page);
  assert.equal((await shown(page)).shade, 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.shade === 'light');
  assert.deepEqual(wrong, []);
  await context.close();
});

test('what the browser keeps that is no choice is taken as no choice', async () => {
  const context = await browser.newContext({ storageState: ann, viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('workshop.look', '{"scheme":"zebra","mode":7}');
    } catch {
      // Before the page has an address there is nothing to keep it in.
    }
  });
  const page = await context.newPage();
  await page.goto(site.url);
  await ready(page);
  assert.deepEqual(await shown(page), worked('standard', 'light'));
  await page.evaluate(() => localStorage.setItem('workshop.look', 'not json'));
  await page.reload();
  await ready(page);
  assert.deepEqual(await shown(page), worked('standard', 'light'));
  await context.close();
});
