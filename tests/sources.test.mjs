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
