// The first page. It asks the server who is looking, and shows one of
// three things: the classes on the server, an offer to sign in, or that
// no FadoDB server answers.

import { ACCOUNT, Refused, SIGN_IN, call, signOut } from './fado.js';

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function part(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`the page has no element ${id}`);
  return found;
}

/**
 * Makes an element that holds text. What comes from the database is
 * always put in as text, never as markup.
 *
 * @param {string} tag
 * @param {string} className
 * @param {string} text
 */
function make(tag, className, text) {
  const made = document.createElement(tag);
  if (className) made.className = className;
  made.textContent = text;
  return made;
}

/** @param {'loading' | 'signed-out' | 'no-server' | 'home'} which */
function show(which) {
  for (const id of ['loading', 'signed-out', 'no-server', 'home']) part(id).hidden = id !== which;
}

/**
 * @param {{ id: string, name?: string }} user
 */
function showWho(user) {
  const name = part('who-name');
  name.textContent = user.name || user.id;
  name.setAttribute('href', ACCOUNT);
  part('who').hidden = false;
  part('sign-out').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });
}

/**
 * The classes the person may see, each with the words its class says to
 * people. A class whose definition the person may not read is shown by
 * its name alone.
 */
async function showClasses() {
  const { classes } = await call('list_classes');
  const list = part('classes');
  list.replaceChildren();
  /** @type {string[]} */
  const names = Array.isArray(classes) ? classes : [];
  const all = await Promise.all(
    names.map((name) =>
      call('get_class', { name }).then(
        (answer) => ({ name, definition: answer?.class?.definition ?? {} }),
        () => ({ name, definition: {} }),
      ),
    ),
  );
  for (const { name, definition } of all) {
    const item = document.createElement('li');
    item.className = 'class';
    const head = document.createElement('div');
    head.className = 'class-head';
    head.append(make('span', 'class-label', String(definition.label || name)), make('code', 'class-name', name));
    item.append(head);
    if (definition.description) item.append(make('p', 'class-about', String(definition.description)));
    list.append(item);
  }
  part('no-classes').hidden = names.length > 0;
}

async function start() {
  part('sign-in').setAttribute('href', `${SIGN_IN}?next=${encodeURIComponent(location.pathname)}`);
  try {
    const { user } = await call('whoami');
    showWho(user);
    await showClasses();
    show('home');
  } catch (refusal) {
    if (refusal instanceof Refused && refusal.code === 'unauthenticated') {
      show('signed-out');
    } else {
      part('no-server-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
      show('no-server');
    }
  }
  document.documentElement.dataset.ready = 'yes';
}

start();
