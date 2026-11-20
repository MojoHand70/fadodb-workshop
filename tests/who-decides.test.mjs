// Which line about single variables is asked for a variable in a
// state: what the page works out, held against what a real FadoDB
// server does. No browser: the server is asked to change and to read a
// document, and the page's reading of the class has to foretell it.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { decides } from '../pages/class.js';
import { acme } from './acme.mjs';

/** @type {Awaited<ReturnType<typeof acme>>} */
let server;

/**
 * A class in which each of the six places of the table decides for
 * some variable, with the place after it saying the opposite, so that
 * the order shows in what the server lets Jan do.
 *
 * `one` and `two` are its states. `inner` and `deep` lie inside
 * `outer`; `apart` and `plain` are in no section.
 */
const layered = {
  name: 'Layered',
  label: 'Layered',
  description: 'Tries the order in which the lines about single variables are asked.',
  variables: {
    named: { type: 'text', label: 'Named' },
    inside: { type: 'text', label: 'Inside' },
    below: { type: 'text', label: 'Below' },
    apart: { type: 'text', label: 'Apart' },
    plain: { type: 'text', label: 'Plain' },
  },
  sections: {
    outer: {
      label: 'Outer',
      variables: [],
      sections: {
        inner: { label: 'Inner', variables: ['named', 'inside'] },
        deep: { label: 'Deep', variables: ['below'] },
      },
    },
  },
  states: { initial: 'one', list: ['one', 'two'] },
  transitions: [{ name: 'go', label: 'Go', from: 'one', to: 'two' }],
  access: { read: 'TRUE', create: 'TRUE', update: 'TRUE', delete: 'FALSE', transition: { go: 'TRUE' } },
  rights: {
    one: {
      named: { write: 'TRUE', read: 'FALSE' },
      inner: { write: 'FALSE' },
      outer: { write: 'TRUE' },
      '*': { write: 'FALSE' },
    },
    '*': {
      named: { write: 'FALSE' },
      apart: { write: 'TRUE', read: 'FALSE' },
      inner: { write: 'TRUE' },
      outer: { write: 'TRUE' },
      '*': { write: 'FALSE' },
    },
  },
};

/** What the page foretells for each variable in each state: the place that decides who may set it, and whether it lets Jan through. */
const foretold = {
  one: {
    named: ['one', 'named', 'TRUE'],
    inside: ['one', 'inner', 'FALSE'],
    below: ['one', 'outer', 'TRUE'],
    apart: ['one', '*', 'FALSE'],
    plain: ['one', '*', 'FALSE'],
  },
  two: {
    named: ['*', 'named', 'FALSE'],
    inside: ['*', 'inner', 'TRUE'],
    below: ['*', 'outer', 'TRUE'],
    apart: ['*', 'apart', 'TRUE'],
    plain: ['*', '*', 'FALSE'],
  },
};

before(async () => {
  server = await acme();
  await server.exec('define_class', { definition: layered });
});

after(async () => {
  await server?.close();
});

/**
 * Whether the server lets Jan set a variable of a document.
 *
 * @param {string} id
 * @param {string} variable
 */
async function janMaySet(id, variable) {
  try {
    await server.exec('set', { class: 'Layered', id, values: { [variable]: 'set by Jan' } }, 'jan');
    return true;
  } catch (refusal) {
    assert.match(String(refusal), /forbidden/, `the server refuses ${variable} for no other reason than who may set it`);
    return false;
  }
}

test('the line the page says is asked is the line the server asks, in each of the six places', async () => {
  for (const state of /** @type {const} */ (['one', 'two'])) {
    const { document } = await server.exec('create', { class: 'Layered', values: {} }, 'jan');
    if (state === 'two') await server.exec('transition', { class: 'Layered', id: document.id, transition: 'go' }, 'jan');
    for (const [variable, [under, what, formula]] of Object.entries(foretold[state])) {
      const line = decides(layered, state, variable, 'write');
      assert.deepEqual([line?.state, line?.what, line?.formula], [under, what, formula], `${variable} in ${state}: the place the page names`);
      assert.equal(await janMaySet(document.id, variable), formula === 'TRUE', `${variable} in ${state}: the server ${formula === 'TRUE' ? 'lets Jan set it' : 'refuses Jan'}, as the line at ${under}/${what} says`);
    }
  }
});

/** The same variables and sections, with lines about who may see. Olga sees everything; the lines keep some of it from Jan. */
const seen = {
  ...layered,
  name: 'Seen',
  label: 'Seen',
  rights: {
    one: { named: { read: 'USER() = "olga"' } },
    '*': { apart: { read: 'USER() = "olga"' }, inner: { write: 'TRUE' } },
  },
};

test('who may see is looked up by itself: a line that says only who may set says nothing of it', async () => {
  await server.exec('define_class', { definition: seen });
  const { document } = await server.exec('create', { class: 'Seen', values: { named: 'n', inside: 'i', apart: 'a', plain: 'p' } }, 'olga');
  /** What Jan gets of the document. */
  const janSees = async () => Object.keys((await server.exec('get', { class: 'Seen', id: document.id }, 'jan')).document.values).sort();

  // In `one` the line for `named` keeps it from Jan; `apart` is kept from him in every state; no line says who may see the others.
  assert.deepEqual([decides(seen, 'one', 'named', 'read')?.state, decides(seen, 'one', 'apart', 'read')?.state], ['one', '*']);
  assert.equal(decides(seen, 'one', 'inside', 'read'), null, 'the line for `inner` says who may set, and nothing of who may see');
  assert.equal(decides(seen, 'one', 'plain', 'read'), null);
  assert.deepEqual(await janSees(), ['below', 'inside', 'plain'], 'the server leaves out of what Jan gets exactly what the lines keep from him');

  await server.exec('transition', { class: 'Seen', id: document.id, transition: 'go' }, 'jan');
  assert.equal(decides(seen, 'two', 'named', 'read'), null, 'what `one` says of who may see `named` holds in `one` only');
  assert.equal(decides(seen, 'two', 'apart', 'read')?.state, '*');
  assert.deepEqual(await janSees(), ['below', 'inside', 'named', 'plain']);
});
