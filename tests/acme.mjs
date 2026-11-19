// A real FadoDB server for the tests: the database of Acme, made new
// for each run in a folder that is thrown away.
//
// Its people: Olga, an administrator and a designer, whose key the tests
// send commands with; and Ann, in the group expense_approvers, who signs
// in on a screen as a person does.
//
// The program is the one FADODB_BIN names, built from the commit of the
// engine that package.json says this Workshop needs (config.engine).

import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
 */
export async function acme() {
  const program = process.env.FADODB_BIN;
  if (!program) {
    throw new Error('FADODB_BIN is not set: it names the fadodb program the tests start, built from the engine this Workshop needs (package.json, config.engine).');
  }
  const folder = await mkdtemp(join(tmpdir(), 'workshop-acme-'));
  const database = join(folder, 'acme.db');
  await run(program, ['init', database]);
  await run(program, ['user', 'add', 'olga', '--kind', 'person', '--name', 'Olga Nowak', '--system', 'administrators', '--system', 'designers', '--db', database]);
  await run(program, ['user', 'add', 'ann', '--kind', 'person', '--name', 'Ann Kowalska', '--group', 'expense_approvers', '--db', database]);
  const key = (await run(program, ['key', 'new', 'olga', '--db', database])).trim().split('\n').pop() ?? '';

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(program, ['serve', database, '--listen', `127.0.0.1:${port}`], { stdio: 'ignore' });
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
    /**
     * Sends a command as Olga.
     *
     * @param {string} command
     * @param {Record<string, unknown>} [object]
     * @returns {Promise<any>}
     */
    async exec(command, object = {}) {
      const answer = await fetch(`${url}/v1/${command}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
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
