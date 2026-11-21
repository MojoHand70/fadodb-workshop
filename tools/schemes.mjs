// Works out the colours of Workshop's schemes (ADR-0008) and writes
// them into pages/workshop.css, between the two marks there.
//
// A scheme is a hue for its grounds, a hue for what is pressed, and how
// strong the two are. Every scheme takes its colours from one ladder of
// lightness, once for the light shade and once for the dark one, so
// that what is read keeps the same contrast in all of them. The ladder
// of the light shade is that of Fado Standard, whose own light colours
// are the ones the owner chose by eye and are written by hand in the
// style sheet; this tool leaves them alone.
//
// A colour is worked out in OKLCH, where the same lightness reads as
// nearly the same lightness in every hue, and written as the hex a
// browser of any age draws. A colour stronger than a screen shows is
// made weaker, its lightness and hue kept, until it fits. Nearly is not
// enough for what is read: the edge of a field and the two colours of
// what is pressed are then moved, a little darker in the light shade
// and a little lighter in the dark one, until each is as far from its
// ground as MUST says.
//
//   node tools/schemes.mjs          writes the colours into the style sheet
//   node tools/schemes.mjs --check  fails if the style sheet holds other ones

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * The schemes, in the order a person is shown them. `hue` is that of
 * the grounds, `press` that of what is pressed; `ground` and `strong`
 * say how much of the ladder's colour each takes, 1 being all of it.
 */
export const SCHEMES = [
  { name: 'standard', words: 'Fado Standard', hue: 292, press: 283, ground: 1, strong: 1 },
  { name: 'ocean', words: 'Ocean', hue: 240, press: 252, ground: 1, strong: 1 },
  { name: 'meadow', words: 'Meadow', hue: 155, press: 155, ground: 1, strong: 1 },
  { name: 'sunset', words: 'Sunset', hue: 65, press: 42, ground: 1, strong: 1 },
  { name: 'rose', words: 'Rose', hue: 350, press: 2, ground: 1, strong: 1 },
  { name: 'graphite', words: 'Graphite', hue: 260, press: 260, ground: 0.3, strong: 0.22 },
];

/** Each token of a scheme: its lightness and strength in the light shade and in the dark one, and which hue it takes. */
const LADDER = /** @type {const} */ ([
  ['bg', [0.985, 0.008], [0.17, 0.018], 'hue'],
  ['bg-2', [0.959, 0.019], [0.2, 0.022], 'hue'],
  ['surface', [1, 0], [0.235, 0.024], 'hue'],
  ['ink', [0.27, 0.039], [0.94, 0.012], 'hue'],
  ['ink-2', [0.485, 0.043], [0.76, 0.028], 'hue'],
  ['line', [0.906, 0.034], [0.335, 0.03], 'hue'],
  ['line-2', [0.939, 0.024], [0.29, 0.026], 'hue'],
  ['edge', [0.671, 0.09], [0.6, 0.06], 'hue'],
  ['accent', [0.557, 0.196], [0.76, 0.13], 'press'],
  ['accent-strong', [0.49, 0.194], [0.83, 0.1], 'press'],
  ['accent-soft', [0.915, 0.045], [0.33, 0.08], 'hue'],
  ['accent-tint', [0.962, 0.02], [0.27, 0.045], 'hue'],
  ['on-accent', [1, 0], [0.2, 0.03], 'press'],
]);

/** The colours every scheme shares in the dark shade: what is wrong, what waits, the colours inside a text, and the six of the apps. */
const DARK = /** @type {const} */ ([
  ['wip', 0.85, 0.1, 85],
  ['wip-bg', 0.3, 0.05, 85],
  ['bad', 0.82, 0.1, 30],
  ['bad-bg', 0.27, 0.05, 30],
  ['bad-line', 0.42, 0.08, 30],
  ['bad-edge', 0.7, 0.15, 30],
  ['code-text', 0.82, 0.1, 165],
  ['code-number', 0.84, 0.1, 70],
  ['mute', 0.55, 0.02, 290],
  ['h0-bg', 0.32, 0.06, 168], ['h0-fg', 0.86, 0.1, 168],
  ['h1-bg', 0.32, 0.06, 45], ['h1-fg', 0.86, 0.1, 45],
  ['h2-bg', 0.32, 0.06, 252], ['h2-fg', 0.86, 0.1, 252],
  ['h3-bg', 0.32, 0.07, 290], ['h3-fg', 0.86, 0.1, 290],
  ['h4-bg', 0.32, 0.06, 88], ['h4-fg', 0.88, 0.1, 88],
  ['h5-bg', 0.32, 0.06, 5], ['h5-fg', 0.86, 0.1, 5],
]);

/**
 * The red, green and blue of a colour given in OKLCH, each from 0 to 1
 * when a screen shows the colour, and outside that when it does not.
 *
 * @param {number} l
 * @param {number} c
 * @param {number} h in degrees
 */
function linear(l, c, h) {
  const [a, b] = [c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  const [x, y, z] = [(l + 0.3963377774 * a + 0.2158037573 * b) ** 3, (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, (l - 0.0894841775 * a - 1.291485548 * b) ** 3];
  return [4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z, -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z, -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z];
}

/**
 * A colour given in OKLCH, as the hex a style sheet writes. One that a
 * screen does not show is made weaker until it does.
 *
 * @param {number} l
 * @param {number} c
 * @param {number} h
 */
export function hex(l, c, h) {
  const shown = (/** @type {number} */ strength) => linear(l, strength, h).every((part) => part >= -0.0005 && part <= 1.0005);
  let strength = c;
  if (!shown(strength)) {
    let [none, all] = [0, c];
    for (let step = 0; step < 24; step++) {
      const half = (none + all) / 2;
      if (shown(half)) none = half;
      else all = half;
    }
    strength = none;
  }
  const parts = linear(l, strength, h).map((part) => {
    const clipped = Math.min(1, Math.max(0, part));
    const curved = clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
    return Math.round(curved * 255).toString(16).padStart(2, '0');
  });
  return `#${parts.join('').toUpperCase()}`;
}

/**
 * How far apart two colours are for somebody who reads one on the
 * other, from 1 (the same) to 21 (black on white), as WCAG counts it.
 *
 * @param {string} one a hex
 * @param {string} other a hex
 */
export function contrast(one, other) {
  const light = (/** @type {string} */ colour) => {
    const [r, g, b] = [1, 3, 5].map((at) => {
      const part = parseInt(colour.slice(at, at + 2), 16) / 255;
      return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [light(one), light(other)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/**
 * How far apart what is read must be from its ground, at the least: a
 * token, what it is read on or what is read on it, and the contrast.
 * The first three are moved until they hold; the rest hold by the
 * ladder, and a test reads them all.
 */
export const MUST = /** @type {const} */ ([
  ['edge', 'surface', 3],
  ['accent', 'on-accent', 4.5],
  ['accent', 'surface', 4.5],
  ['accent-strong', 'on-accent', 4.5],
  ['accent-strong', 'accent-soft', 4.5],
  ['accent-strong', 'surface', 4.5],
  ['accent-strong', 'bg-2', 4.5],
  ['ink', 'bg', 4.5],
  ['ink', 'bg-2', 4.5],
  ['ink', 'surface', 4.5],
  ['ink', 'accent-tint', 4.5],
  ['ink-2', 'bg', 4.5],
  ['ink-2', 'bg-2', 4.5],
  ['ink-2', 'surface', 4.5],
]);

/** The tokens that are moved to hold MUST. */
const MOVED = ['edge', 'accent', 'accent-strong'];

/**
 * The colours of one scheme in one shade, by token: those that differ
 * from scheme to scheme.
 *
 * @param {typeof SCHEMES[number]} scheme
 * @param {'light' | 'dark'} shade
 * @returns {[string, string][]}
 */
export function colours(scheme, shade) {
  /** @type {Map<string, { l: number, c: number, h: number }>} */
  const made = new Map();
  for (const [token, light, dark, which] of LADDER) {
    const [l, c] = shade === 'light' ? light : dark;
    const pressed = which === 'press';
    made.set(token, { l, c: c * (pressed ? scheme.strong : scheme.ground), h: pressed ? scheme.press : scheme.hue });
  }
  const of = (/** @type {string} */ token) => {
    const one = made.get(token);
    if (!one) throw new Error(`no token ${token}`);
    return hex(one.l, one.c, one.h);
  };
  // A little more than the least, so that a colour rounded to a hex still holds it.
  const holds = (/** @type {string} */ token) => MUST.every(([a, b, least]) => a !== token || contrast(of(a), of(b)) >= least + 0.05);
  for (const token of MOVED) {
    const one = made.get(token);
    for (let step = 0; one && step < 60 && !holds(token); step++) one.l += shade === 'light' ? -0.004 : 0.004;
    if (!holds(token)) throw new Error(`the scheme ${scheme.name} cannot hold the contrast of ${token} in the ${shade} shade`);
  }
  return [...made.keys()].map((token) => [token, of(token)]);
}

/**
 * The colours every scheme shares in the dark shade.
 *
 * @returns {[string, string][]}
 */
export function sharedDark() {
  return DARK.map(([token, l, c, h]) => [token, hex(l, c, h)]);
}

/** The two colours of Fado Standard in the light shade that a swatch shows, as :root writes them by hand; a test holds them to it. */
export const STANDARD_LIGHT = { accent: '#6A5AE0', 'accent-soft': '#E3DEFF' };

/** The rules of the style sheet between the two marks. */
export function rules() {
  const lines = [];
  /** @param {[string, string][]} tokens */
  const body = (tokens) => {
    const out = [];
    for (let at = 0; at < tokens.length; at += 4) out.push(`  ${tokens.slice(at, at + 4).map(([token, colour]) => `--${token}: ${colour};`).join(' ')}`);
    return out.join('\n');
  };
  for (const scheme of SCHEMES) {
    // Fado Standard's light colours are the hand-written ones of :root.
    if (scheme.name !== 'standard') lines.push(`:root[data-scheme="${scheme.name}"] {\n${body(colours(scheme, 'light'))}\n}`);
    // The dark shade of Fado Standard is the dark shade of any scheme that says nothing else, and holds what all share.
    if (scheme.name === 'standard') lines.push(`:root[data-shade="dark"] {\n${body([...colours(scheme, 'dark'), ...sharedDark()])}\n}`);
    else lines.push(`:root[data-scheme="${scheme.name}"][data-shade="dark"] {\n${body(colours(scheme, 'dark'))}\n}`);
  }
  // In the menu where a person chooses, each scheme is shown by its own two colours, whatever scheme the page is in.
  for (const shade of /** @type {const} */ (['light', 'dark'])) {
    const swatches = SCHEMES.map((scheme) => {
      const all = Object.fromEntries(colours(scheme, shade));
      const [accent, soft] = scheme.name === 'standard' && shade === 'light' ? [STANDARD_LIGHT.accent, STANDARD_LIGHT['accent-soft']] : [all.accent, all['accent-soft']];
      return `${shade === 'dark' ? ':root[data-shade="dark"] ' : ''}.look-swatch[data-swatch="${scheme.name}"] { --swatch: ${accent}; --swatch-ground: ${soft}; }`;
    });
    lines.push(swatches.join('\n'));
  }
  return lines.join('\n\n');
}

const BEGIN = '/* schemes: begin (written by tools/schemes.mjs, not by hand) */';
const END = '/* schemes: end */';

/**
 * The style sheet with the rules of the schemes put between the marks.
 *
 * @param {string} sheet
 */
export function written(sheet) {
  const [from, to] = [sheet.indexOf(BEGIN), sheet.indexOf(END)];
  if (from < 0 || to < from) throw new Error(`pages/workshop.css has no place for the schemes: the marks "${BEGIN}" and "${END}" are not both there`);
  return `${sheet.slice(0, from + BEGIN.length)}\n\n${rules()}\n\n${sheet.slice(to)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('../pages/workshop.css', import.meta.url);
  const sheet = await readFile(file, 'utf8');
  const next = written(sheet);
  if (process.argv.includes('--check')) {
    if (next !== sheet) {
      console.error('pages/workshop.css holds other colours than tools/schemes.mjs works out: run node tools/schemes.mjs');
      process.exit(1);
    }
  } else if (next !== sheet) {
    await writeFile(file, next);
    console.log('The colours of the schemes are written into pages/workshop.css.');
  } else {
    console.log('pages/workshop.css holds the colours of the schemes already.');
  }
}
