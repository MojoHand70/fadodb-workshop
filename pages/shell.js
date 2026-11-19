// What every page of Workshop shares: who is looking, the person at the
// end of the top bar, and the three things a page may have to say before
// it has anything of its own to show: that it is asking, that the person
// has to sign in, or that no FadoDB server answers.
//
// A page's own parts are the sections of its <main> that name a view,
// data-view="…"; one is shown at a time.

import { ACCOUNT, Refused, SIGN_IN, call, signOut } from './fado.js';

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
export function part(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`the page has no element ${id}`);
  return found;
}

/**
 * Makes an element that holds text. What comes from a database is always
 * put on a page as text, never as markup.
 *
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 */
export function make(tag, className, text = '') {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text) made.textContent = text;
  return made;
}

/**
 * Shows one view of the page and hides the others.
 *
 * @param {string} view
 */
export function show(view) {
  /** @type {NodeListOf<HTMLElement>} */
  const views = document.querySelectorAll('main > [data-view]');
  for (const section of views) section.hidden = section.dataset.view !== view;
}

/** Says that the page has drawn what it had to. The checks wait for it. */
export function ready() {
  document.documentElement.dataset.ready = 'yes';
}

/** Puts the three shared views at the top of the page. */
function shared() {
  const main = document.querySelector('main');
  if (!main) throw new Error('the page has no main part');

  const loading = make('section', '');
  loading.id = 'loading';
  loading.dataset.view = 'loading';
  loading.setAttribute('aria-live', 'polite');
  loading.append(make('p', 'lead', 'Asking the server who you are.'));

  const signedOut = make('section', '');
  signedOut.id = 'signed-out';
  signedOut.dataset.view = 'signed-out';
  signedOut.hidden = true;
  const signIn = make('a', 'button', 'Sign in');
  signIn.id = 'sign-in';
  signIn.setAttribute('href', `${SIGN_IN}?next=${encodeURIComponent(location.pathname + location.search)}`);
  signedOut.append(
    make('h1', '', 'Sign in to work here'),
    make('p', 'lead', "You sign in on the FadoDB server's own page, and come back here. Your password is typed only there."),
    signIn,
  );

  const noServer = make('section', '');
  noServer.id = 'no-server';
  noServer.dataset.view = 'no-server';
  noServer.hidden = true;
  const told = make('div', 'card');
  const why = make('p', '');
  why.id = 'no-server-why';
  told.append(make('h2', '', 'What the page was told'), why);
  noServer.append(
    make('h1', '', 'No FadoDB server answers here'),
    make('p', 'lead', "Workshop's pages work at the address of a FadoDB server. These pages were handed out with no server behind them."),
    told,
  );

  main.prepend(loading, signedOut, noServer);
}

/**
 * Asks the server who is looking. With a person, their name goes to the
 * top bar and the page goes on. With none, the page offers to sign in,
 * or says that no server answers, and is done.
 *
 * @returns {Promise<{ id: string, name?: string, groups?: string[], system_groups?: string[] } | null>}
 */
export async function enter() {
  shared();
  try {
    const { user } = await call('whoami');
    const name = part('who-name');
    name.textContent = user.name || user.id;
    name.setAttribute('href', ACCOUNT);
    part('who').hidden = false;
    part('sign-out').addEventListener('click', async () => {
      await signOut();
      location.reload();
    });
    return user;
  } catch (refusal) {
    if (refusal instanceof Refused && refusal.code === 'unauthenticated') {
      show('signed-out');
    } else {
      part('no-server-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
      show('no-server');
    }
    ready();
    return null;
  }
}
