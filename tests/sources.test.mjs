// The source files themselves: nothing in them that cannot be seen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// A space that does not break, a narrow one, a thin one, one of no width,
// and the minus that looks like a hyphen. In a source file each is
// written as its escape, where a reader can see it.
const UNSEEN = [0x00a0, 0x202f, 0x2009, 0x200b, 0x2212];

test('no source file holds a character that cannot be told apart by eye', async () => {
  /** @type {string[]} */
  const found = [];
  for (const folder of ['pages', 'tests', 'tools']) {
    const at = new URL(`../${folder}/`, import.meta.url);
    for (const name of await readdir(at)) {
      if (!/\.(js|mjs|html|css)$/.test(name)) continue;
      const text = await readFile(new URL(name, at), 'utf8');
      text.split('\n').forEach((line, n) => {
        for (const code of UNSEEN) {
          if (line.includes(String.fromCharCode(code))) found.push(`${folder}/${name}:${n + 1} holds U+${code.toString(16).toUpperCase().padStart(4, '0')}`);
        }
      });
    }
  }
  assert.deepEqual(found, [], `write each as its escape, as in '\\u00a0' (checked from ${fileURLToPath(new URL('..', import.meta.url))})`);
});

test('every page names its icon, so that no browser asks the server for one it does not have', async () => {
  // A page that names none makes Firefox ask the server for
  // /favicon.ico each time, which the server answers with "not found".
  const at = new URL('../pages/', import.meta.url);
  /** @type {string[]} */
  const without = [];
  for (const name of await readdir(at)) {
    if (!name.endsWith('.html')) continue;
    const text = await readFile(new URL(name, at), 'utf8');
    if (!/<link rel="icon" href="[^"]+">/.test(text)) without.push(name);
  }
  assert.deepEqual(without, []);
});

test('every page carries FadoDB\'s mark in its top corner, and none a mark of its own making', async () => {
  const at = new URL('../pages/', import.meta.url);
  const pages = (await readdir(at)).filter((name) => name.endsWith('.html'));
  assert.ok(pages.length >= 4);
  for (const name of pages) {
    const text = await readFile(new URL(name, at), 'utf8');
    const top = text.slice(text.indexOf('<header class="top">'), text.indexOf('</header>'));
    assert.equal(top.split('<img class="brand-mark" src="mark.png"').length - 1, 1, `${name} shows the mark once`);
    assert.ok(!top.includes('<svg'), `${name} draws no mark of its own`);
  }
  // The mark is a picture: a PNG, and it is there.
  const mark = await readFile(new URL('mark.png', at));
  assert.deepEqual([...mark.subarray(1, 4)], [0x50, 0x4e, 0x47]);
});

test('every dependency has its row in docs/dependencies.md, at the version package.json fixes', async () => {
  const about = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const page = await readFile(new URL('../docs/dependencies.md', import.meta.url), 'utf8');
  /** @type {string[]} */
  const missing = [];
  // What reaches the browser is fixed at one version, and its row says which.
  for (const [name, version] of Object.entries(about.dependencies ?? {})) {
    if (!/^\d+\.\d+\.\d+$/.test(String(version))) missing.push(`${name} is not fixed at one version: ${version}`);
    if (!page.includes(`| \`${name}\` | ${version}, fixed |`)) missing.push(`${name} ${version} has no row among what reaches the browser`);
  }
  for (const name of Object.keys(about.devDependencies ?? {})) {
    if (!page.includes(`| \`${name}\` |`)) missing.push(`${name} has no row among the development tools`);
  }
  assert.deepEqual(missing, []);
});
