// What every test stands on: a server of its own.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acme } from './acme.mjs';

test('a file whose port was taken by the server of another file starts its own on another port', async () => {
  const theirs = await acme();
  // The port this file was about to take is now held by the server of another file.
  const ours = await acme({ first: Number(new URL(theirs.url).port) });
  try {
    assert.notEqual(ours.url, theirs.url);
    // Each answers its own file: a server knows only the keys made for its own database.
    assert.equal((await ours.exec('whoami')).user.id, 'olga');
    assert.equal((await theirs.exec('whoami')).user.id, 'olga');
  } finally {
    await ours.close();
    await theirs.close();
  }
});
