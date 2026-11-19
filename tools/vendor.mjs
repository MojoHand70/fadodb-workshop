// Puts the files Workshop's pages need from outside into pages/vendor/.
// They are copied from what npm installed, at the versions package.json
// fixes, and are never kept in the repository.
//
// Today that is one file: the engine's formula machine for a page,
// fadodb-vm, with which a page works a document out as the server does.

import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const from = new URL('../node_modules/fadodb-vm/', import.meta.url);
const to = new URL('../pages/vendor/', import.meta.url);

await mkdir(to, { recursive: true });
for (const file of ['fadodb-vm.js', 'fadodb-vm.d.ts', 'LICENSE']) {
  await copyFile(new URL(file, from), new URL(file === 'LICENSE' ? 'fadodb-vm.LICENSE' : file, to));
}
console.log(`fadodb-vm is in ${fileURLToPath(to)}`);
