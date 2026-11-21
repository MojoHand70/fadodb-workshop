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

/**
 * Says where the person is: the way from the first page to this one,
 * Home first. A step with an address leads there; the last step, when
 * it has none, is the page itself.
 *
 * @param {{ words: string, href?: string, id?: string }[]} [steps] the steps after Home
 * @param {boolean} [atHome] whether the page is Home itself, which then leads nowhere
 */
export function crumbs(steps = [], atHome = false) {
  /** @type {{ words: string, href?: string, id?: string }[]} */
  const all = [atHome ? { words: 'Home', id: 'to-home' } : { words: 'Home', href: './', id: 'to-home' }, ...steps];
  const list = make('ol', '');
  all.forEach((step, at) => {
    const one = make(step.href ? 'a' : 'span', '', step.words);
    if (step.href) one.setAttribute('href', step.href);
    else if (at === all.length - 1) one.setAttribute('aria-current', 'page');
    if (step.id) one.id = step.id;
    const item = make('li', '');
    item.append(one);
    list.append(item);
  });
  const box = part('crumbs');
  box.replaceChildren(list);
  box.hidden = false;
}

/**
 * Changes the words of the page's own step, the last one, where they
 * differ. The steps before it are left as they are: a person may be
 * pressing one.
 *
 * @param {string} words
 */
export function crumbHere(words) {
  const here = part('crumbs').querySelector('[aria-current]');
  if (here && here.textContent !== words) here.textContent = words;
}

/**
 * The letters that stand for a person in the round mark: the first of
 * the first word of their name and the first of the last.
 *
 * @param {string} name
 */
export function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = Array.from(words[0] ?? '')[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * The name a person signs in by, made from the name people read:
 * "Eve Lis" gives eve.lis. Whether it may be one is the server's to say.
 *
 * @param {string} name
 */
export function idFrom(name) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('.');
}

/** Says that the page has drawn what it had to. The checks wait for it. */
export function ready() {
  document.documentElement.dataset.ready = 'yes';
}

/** @type {{ id: string, name?: string, groups?: string[], system_groups?: string[] } | null} */
let looking = null;

/**
 * Who is looking, as the server answered when the page asked; nobody
 * before that. The rail reads it: the settings are an administrator's.
 */
export function who() {
  return looking;
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
    const name = String(user.name || user.id);
    part('who-name').textContent = name;
    part('who-mark').textContent = initials(name);
    part('who-full').textContent = name;
    part('who-id').textContent = String(user.id);
    part('who-account').setAttribute('href', ACCOUNT);
    part('who').hidden = false;
    // The menu opens under the person, wherever the top bar has put them.
    const menu = part('who-menu');
    menu.addEventListener('toggle', () => {
      const under = part('who-open').getBoundingClientRect();
      menu.style.top = `${Math.round(under.bottom + 6)}px`;
      menu.style.right = `${Math.max(8, Math.round(document.documentElement.clientWidth - under.right))}px`;
    });
    part('sign-out').addEventListener('click', async () => {
      await signOut();
      location.reload();
    });
    looking = user;
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
