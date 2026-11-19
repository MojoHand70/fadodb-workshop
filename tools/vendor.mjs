// Puts the files Workshop's pages need from outside into pages/vendor/.
// They come from what npm installed, at the versions package.json
// fixes, and are never kept in the repository.
//
// - fadodb-vm, the engine's formula machine for a page, with which a
//   page works a document out as the server does: copied as it is.
// - CodeMirror 6, under the text boxes of the design mode (ADR-0003):
//   built into one file from the list in tools/codemirror.entry.mjs,
//   with the licences of everything that went into it beside it.

import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const to = new URL('../pages/vendor/', import.meta.url);
await mkdir(to, { recursive: true });

const vm = new URL('../node_modules/fadodb-vm/', import.meta.url);
for (const file of ['fadodb-vm.js', 'fadodb-vm.d.ts', 'LICENSE']) {
  await copyFile(new URL(file, vm), new URL(file === 'LICENSE' ? 'fadodb-vm.LICENSE.txt' : file, to));
}

const entry = fileURLToPath(new URL('./codemirror.entry.mjs', import.meta.url));
const built = await build({
  entryPoints: [entry],
  outfile: fileURLToPath(new URL('codemirror.js', to)),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
  absWorkingDir: root,
});

// The types of the built file are the types of what it was built from.
const lines = (await readFile(entry, 'utf8')).split('\n').filter((line) => line.startsWith('export '));
await writeFile(new URL('codemirror.d.ts', to), `// Made by tools/vendor.mjs from tools/codemirror.entry.mjs.\n${lines.join('\n')}\n`);

/**
 * The package a built-in file belongs to: the folder that holds its
 * package.json.
 *
 * @param {string} file
 */
async function packageOf(file) {
  for (let folder = dirname(join(root, file)); folder.startsWith(join(root, 'node_modules')); folder = dirname(folder)) {
    const described = join(folder, 'package.json');
    if (await stat(described).then(() => true, () => false)) {
      const about = JSON.parse(await readFile(described, 'utf8'));
      if (about.name && about.version) return { folder, name: String(about.name), version: String(about.version), licence: String(about.license ?? '') };
    }
  }
  return null;
}

/** @type {Map<string, { folder: string, name: string, version: string, licence: string }>} */
const went = new Map();
for (const file of Object.keys(built.metafile.inputs)) {
  const one = file.includes('node_modules/') ? await packageOf(file) : null;
  if (one) went.set(one.name, one);
}
const packages = [...went.values()].sort((a, b) => a.name.localeCompare(b.name));
let licences = 'pages/vendor/codemirror.js is built from the packages below. Each is under the licence that follows its name.\n';
for (const one of packages) {
  const names = await readdir(one.folder);
  const file = names.find((name) => /^licen[cs]e(\.md|\.txt)?$/i.test(name));
  if (!file) throw new Error(`${one.name} ${one.version} names no licence file: it cannot be built into a file Workshop hands out`);
  licences += `\n${'='.repeat(72)}\n${one.name} ${one.version} (${one.licence})\n${'='.repeat(72)}\n\n${(await readFile(join(one.folder, file), 'utf8')).trim()}\n`;
}
await writeFile(new URL('codemirror.LICENSE.txt', to), licences);

const size = (await stat(new URL('codemirror.js', to))).size;
console.log(`fadodb-vm and CodeMirror (${packages.length} packages, ${size} bytes) are in ${fileURLToPath(to)}`);
