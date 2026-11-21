// The box that finds an app, in the top bar of every page.
//
// On the first page the apps are on the page, so the box narrows them
// there. On every other page it lists the apps that go by what was
// typed, under the box: the arrows move through them, Enter opens the
// one that is marked, the first unless the person moved.

import { appAddress, appSays, readApps } from './apps.js';
import { found } from './find.js';
import { make, part } from './shell.js';

/** How many apps the list under the box shows at most. */
const MOST = 8;

/**
 * Makes the box work.
 *
 * @param {object} how
 * @param {boolean} how.designer whether the person is a designer, who finds by the names behind the words too
 * @param {import('./apps.js').App[]} [how.apps] the apps, where the page has read them; otherwise they are read when the person first types
 * @param {(typed: string) => string | null} [how.narrow] the first page's own way: narrows what the page shows and answers where Enter leads, or null
 */
export function finder({ designer, apps, narrow }) {
  const box = part('find-box');
  const input = /** @type {HTMLInputElement} */ (part('find'));
  box.hidden = false;

  if (narrow) {
    input.addEventListener('input', () => narrow(input.value));
    input.addEventListener('keydown', (key) => {
      if (key.key !== 'Enter' || key.isComposing || input.value.trim() === '') return;
      const first = narrow(input.value);
      if (first) location.assign(first);
    });
    return;
  }

  const list = make('ul', 'find-list');
  list.id = 'find-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Apps');
  list.hidden = true;
  box.append(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');

  /** @type {Promise<import('./apps.js').App[]> | undefined} */
  let reading = apps ? Promise.resolve(apps) : undefined;
  /** @type {{ app: import('./apps.js').App, item: HTMLElement }[]} */
  let shown = [];
  let marked = 0;

  /** Marks one of the apps that are shown. */
  const mark = (/** @type {number} */ at) => {
    marked = at;
    shown.forEach((one, place) => one.item.setAttribute('aria-selected', String(place === at)));
    if (shown[at]) input.setAttribute('aria-activedescendant', shown[at].item.id);
    else input.removeAttribute('aria-activedescendant');
  };

  const close = () => {
    list.hidden = true;
    shown = [];
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const draw = async () => {
    const typed = input.value;
    if (typed.trim() === '') return close();
    reading ??= readApps().then((read) => read.apps);
    const all = await reading;
    // The person may have typed on while the apps were read.
    if (input.value !== typed) return;
    const places = new Map(all.map((app, at) => [app, at]));
    const matches = all.filter((app) => found(appSays(app, designer), typed)).slice(0, MOST);
    list.replaceChildren();
    shown = matches.map((app, at) => {
      const item = make('li', `find-app hue-${(places.get(app) ?? 0) % 6}`);
      item.id = `find-app-${at}`;
      item.setAttribute('role', 'option');
      item.append(make('span', 'find-mark'), make('span', 'find-name', app.label));
      // A press takes the person there before the box loses them.
      item.addEventListener('mousedown', (press) => {
        press.preventDefault();
        location.assign(appAddress(app.name));
      });
      list.append(item);
      return { app, item };
    });
    if (shown.length === 0) {
      const none = make('li', 'find-none', `Nothing here goes by "${typed.trim()}".`);
      none.setAttribute('role', 'presentation');
      list.append(none);
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    mark(0);
  };

  input.addEventListener('input', draw);
  input.addEventListener('focus', () => {
    if (input.value.trim() !== '') draw();
  });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (key) => {
    if (key.isComposing) return;
    if (key.key === 'ArrowDown' || key.key === 'ArrowUp') {
      if (shown.length === 0) return;
      key.preventDefault();
      mark((marked + (key.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length);
    } else if (key.key === 'Enter') {
      const one = shown[marked];
      if (one) location.assign(appAddress(one.app.name));
    } else if (key.key === 'Escape' && !list.hidden) {
      key.preventDefault();
      close();
    }
  });
}
