// Workshop's door to the FadoDB server its pages came from.
//
// Every command of the server is sent the same way: its name in the
// address, one JSON object as the body, one JSON object as the answer.
// The browser adds the session the person got by signing in on the
// server's own page; no script of Workshop ever sees it.

/** Where a person signs in: the server's own page. */
export const SIGN_IN = '/auth/signin';

/** Where a person keeps their password, their sessions and what they allowed: the server's own page. */
export const ACCOUNT = '/auth/account';

/**
 * What the server answers when it does not do what was asked: a code
 * that never changes, for the program, and a message, for a person.
 * The code `unreachable` is Workshop's own: nothing that answers as a
 * FadoDB server does was there.
 */
export class Refused extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} status the status of the answer, 0 when none came
   * @param {string} [hint] what to do instead, when the server knows
   */
  constructor(code, message, status, hint = '') {
    super(message);
    this.name = 'Refused';
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

/**
 * Sends one command and gives its answer.
 *
 * @param {string} command the name of a command, such as whoami
 * @param {Record<string, unknown>} [object] what the command takes
 * @returns {Promise<any>} the object the command answers
 * @throws {Refused}
 */
export async function call(command, object = {}) {
  let answer;
  try {
    answer = await fetch(`/v1/${command}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(object),
    });
  } catch {
    throw new Refused('unreachable', 'The server does not answer.', 0);
  }
  /** @type {any} */
  let body = null;
  try {
    body = await answer.json();
  } catch {
    // Not JSON: not an answer of a FadoDB server.
  }
  if (answer.ok && body !== null) return body;
  const error = body?.error;
  if (typeof error?.code === 'string') throw new Refused(error.code, String(error.message ?? ''), answer.status, String(error.hint ?? ''));
  throw new Refused('unreachable', 'Nothing here answers as a FadoDB server does.', answer.status);
}

/**
 * Ends the session of this browser, on the server. The server answers by
 * sending the browser to its sign-in page; the answer is read and left,
 * and the person stays where they are.
 */
export async function signOut() {
  const answer = await fetch('/auth/signout', { method: 'POST' });
  await answer.arrayBuffer();
}
