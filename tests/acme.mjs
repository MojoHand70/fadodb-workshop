// A real FadoDB server for the tests: the database of Acme, made new
// for each run in a folder that is thrown away.
//
// Its people: Olga, an administrator and a designer; Jan, who files
// expenses; and Ann, in the group expense_approvers, who signs in on a
// screen as a person does. The tests send commands with the keys of
// Olga and of Jan.
//
// The server hands out Workshop's pages itself, from the folder pages/,
// as it does for whoever installs Workshop: fadodb serve --pages.
//
// The program is the one FADODB_BIN names, built from the commit of the
// engine that package.json says this Workshop needs (config.engine).

import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The folder of Workshop's pages. */
export const PAGES = fileURLToPath(new URL('../pages/', import.meta.url));

/**
 * @param {string} program
 * @param {string[]} args
 * @returns {Promise<string>} what it printed
 */
function run(program, args) {
  return new Promise((done, failed) => {
    execFile(program, args, (error, stdout, stderr) => {
      if (error) failed(new Error(`${program} ${args.join(' ')}: ${stderr || error.message}`));
      else done(stdout);
    });
  });
}

/** @returns {Promise<number>} a port nobody listens on */
function freePort() {
  return new Promise((done, failed) => {
    const probe = createServer();
    probe.once('error', failed);
    probe.listen(0, '127.0.0.1', () => {
      const at = probe.address();
      const port = at && typeof at === 'object' ? at.port : 0;
      probe.close(() => done(port));
    });
  });
}

/**
 * Makes the database, starts the server and waits until it answers.
 *
 * @param {{ name?: string }} [options]
 *   name, when given, is the name people reach the server by, over plain
 *   http: the operator tells the server so, as `url` in its settings,
 *   and `site` is then at that name. The server still listens on this
 *   machine; tests/passage.mjs takes a browser to it.
 */
export async function acme({ name } = {}) {
  const program = process.env.FADODB_BIN;
  if (!program) {
    throw new Error('FADODB_BIN is not set: it names the fadodb program the tests start, built from the engine this Workshop needs (package.json, config.engine).');
  }
  const folder = await mkdtemp(join(tmpdir(), 'workshop-acme-'));
  const database = join(folder, 'acme.db');
  await run(program, ['init', database]);
  await run(program, ['user', 'add', 'olga', '--kind', 'person', '--name', 'Olga Nowak', '--system', 'administrators', '--system', 'designers', '--db', database]);
  await run(program, ['user', 'add', 'jan', '--kind', 'person', '--name', 'Jan Kowalski', '--db', database]);
  await run(program, ['user', 'add', 'ann', '--kind', 'person', '--name', 'Ann Kowalska', '--group', 'expense_approvers', '--db', database]);
  /** @param {string} user */
  const keyOf = async (user) => (await run(program, ['key', 'new', user, '--db', database])).trim().split('\n').pop() ?? '';
  /** @type {Record<string, string>} */
  const keys = { olga: await keyOf('olga'), jan: await keyOf('jan') };

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const reached = name ? `http://${name}:${port}` : url;
  const told = ['serve', database, '--listen', `127.0.0.1:${port}`, '--pages', PAGES];
  if (name) {
    const settings = join(folder, 'settings.json');
    await writeFile(settings, JSON.stringify({ url: reached }));
    told.push('--settings', settings);
  }
  const server = spawn(program, told, { stdio: 'ignore' });
  /** @type {Promise<void>} */
  const ended = new Promise((done) => server.once('exit', () => done()));

  let answers = false;
  for (let tries = 0; tries < 100 && !answers; tries++) {
    try {
      answers = (await fetch(`${url}/v1/health`)).ok;
    } catch {
      await new Promise((wait) => setTimeout(wait, 50));
    }
  }
  if (!answers) {
    server.kill();
    throw new Error(`the FadoDB server did not answer at ${url}`);
  }

  return {
    /** The address the server listens at. */
    url,
    /** Where Workshop's pages answer: the address people reach the server at. */
    site: { url: `${reached}/` },
    /**
     * Sends a command with a key: Olga's, or Jan's when asked.
     *
     * @param {string} command
     * @param {Record<string, unknown>} [object]
     * @param {'olga' | 'jan'} [who]
     * @returns {Promise<any>}
     */
    async exec(command, object = {}, who = 'olga') {
      const answer = await fetch(`${url}/v1/${command}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${keys[who]}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(object),
      });
      const body = await answer.json();
      if (!answer.ok) throw new Error(`${command}: ${body?.error?.code}: ${body?.error?.message}`);
      return body;
    },
    /** Stops the server and throws the database away. */
    async close() {
      server.kill();
      await ended;
      await rm(folder, { recursive: true, force: true });
    },
  };
}

/** The password every person of the tests sets. */
export const PASSWORD = 'a long password 42';

/**
 * A person sets their password with a link an administrator made, as a
 * person does the first time, and signs in from Workshop's first page.
 *
 * @param {import('playwright').Page} page
 * @param {{ url: string }} site where Workshop's pages are
 * @param {{ exec: (command: string, object?: Record<string, unknown>) => Promise<any> }} server
 * @param {string} [user]
 */
export async function signIn(page, site, server, user = 'ann') {
  const { link } = await server.exec('create_password_link', { user });
  await page.goto(`${site.url}auth/password?link=${link.token}`);
  await page.fill('#password', PASSWORD);
  await page.fill('#again', PASSWORD);
  await page.click('button[type=submit]');
  // The server answers with a page that no longer carries the link. Only
  // then is the password set, and only then may the browser go on.
  await page.waitForURL((address) => !address.search.includes('link='));
  await page.goto(site.url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'yes');
  await page.click('#sign-in');
  await page.fill('#user', user);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(site.url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'yes');
}
