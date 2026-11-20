// The page of an app: the lists a person opens in it. A designer makes
// an app here too, and from an app a class that belongs to it.

import { appAddress, counted, designAddress, drawRail, listAddress, nameFrom, readApps } from './apps.js';
import { Refused, call } from './fado.js';
import { crumbs, enter, make, part, ready, show } from './shell.js';

const asked = new URLSearchParams(location.search);
const appName = asked.get('app') ?? '';
const making = appName === '' && asked.has('new');

/**
 * The tile of a list of the app.
 *
 * @param {import('./apps.js').List} list
 * @param {boolean} designer
 */
function tile(list, designer) {
  const item = make('li', 'tile');
  item.dataset.class = list.name;
  const head = make('div', 'tile-head');
  const name = make('a', 'tile-name', list.label);
  name.setAttribute('href', listAddress(list.name));
  head.append(name);
  const count = counted(list.count);
  if (count) head.append(make('span', 'tile-count', count));
  item.append(head);
  if (list.about) item.append(make('p', 'tile-about', list.about));
  if (designer) {
    const foot = make('p', 'tile-foot tile-design');
    const design = make('a', 'tile-design-way', 'Design');
    design.setAttribute('href', designAddress(list.name));
    design.setAttribute('aria-label', `Design ${list.one}`);
    foot.append(make('code', 'class-name', list.name), design);
    item.append(foot);
  }
  return item;
}

/**
 * Shows the app the address names.
 *
 * @param {boolean} designer
 */
async function showApp(designer) {
  const { apps } = await readApps();
  const app = apps.find((one) => one.name.toLowerCase() === appName.toLowerCase());
  if (!app) {
    // The server says it in its own words.
    await call('get_app', { name: appName });
    throw new Refused('unknown_app', `The server has no app ${appName}.`, 0);
  }
  drawRail(part('rail'), apps, app.name);
  crumbs([{ words: app.label }]);
  document.title = `${app.label} · FadoDB Workshop`;
  part('app-title').textContent = app.label;
  part('app-about').textContent = app.about;
  part('app-about').hidden = app.about === '';

  const fresh = `design.html?new&app=${encodeURIComponent(app.name)}`;
  const name = part('app-name');
  name.textContent = app.name;
  name.hidden = !designer;
  part('new-class').setAttribute('href', fresh);
  part('new-class').hidden = !designer || app.lists.length === 0;

  const lists = part('lists');
  lists.replaceChildren(...app.lists.map((list) => tile(list, designer)));
  lists.hidden = app.lists.length === 0;

  const none = part('no-lists');
  none.hidden = app.lists.length > 0;
  part('no-lists-title').textContent = designer ? 'Make its first class' : 'There is nothing here yet';
  part('no-lists-about').textContent = designer ? 'A class says what a kind of document holds and how it moves: an expense, a ticket.' : 'A designer is still building this app.';
  part('first-class').setAttribute('href', fresh);
  part('first-class').hidden = !designer;
  show('app');
}

/**
 * Asks what a new app is called and makes it. The name people read
 * comes first; the name formulas and commands write follows it until
 * the designer writes one of their own.
 */
async function begin() {
  const { apps } = await readApps();
  drawRail(part('rail'), apps, '');
  crumbs([{ words: 'A new app' }]);
  document.title = 'A new app · FadoDB Workshop';
  const label = /** @type {HTMLInputElement} */ (part('new-label'));
  const name = /** @type {HTMLInputElement} */ (part('new-name'));
  const about = /** @type {HTMLInputElement} */ (part('new-about'));
  const why = part('begin-why');
  let own = false;
  label.addEventListener('input', () => {
    if (!own) name.value = nameFrom(label.value);
  });
  name.addEventListener('input', () => {
    own = name.value !== '';
  });
  part('begin-form').addEventListener('submit', async (sent) => {
    sent.preventDefault();
    why.textContent = '';
    part('begin-existing-box').hidden = true;
    const definition = { name: name.value.trim(), label: label.value.trim() || name.value.trim(), description: about.value.trim() };
    if (!definition.name) return void (why.textContent = 'Give the app a name.');
    try {
      // Under a name the server has, a definition would be the next
      // version of that app: the page looks first.
      const { apps: names } = await call('list_apps');
      const taken = (Array.isArray(names) ? names : []).find((/** @type {string} */ one) => one.toLowerCase() === definition.name.toLowerCase());
      if (taken) {
        why.textContent = `${taken} is an app on this server already.`;
        part('begin-existing').setAttribute('href', appAddress(taken));
        part('begin-existing-box').hidden = false;
        return;
      }
      const { app } = await call('define_app', { definition });
      location.assign(appAddress(app.name));
    } catch (refusal) {
      const first = refusal instanceof Refused ? refusal.findings[0] : undefined;
      why.textContent = first ? `The server would not take this: ${first.message}.` : `The server said: ${refusal instanceof Error ? refusal.message : String(refusal)}`;
    }
  });
  show('begin');
  label.focus();
}

const user = await enter();
if (user) {
  try {
    const designer = (user.system_groups ?? []).includes('designers');
    if (making) {
      if (!designer) throw new Refused('forbidden', 'Making an app is for a designer.', 0);
      await begin();
    } else {
      if (!appName) throw new Refused('unknown_app', 'The address does not say which app to show. Choose one from Home.', 0);
      await showApp(designer);
    }
  } catch (refusal) {
    part('trouble-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
    crumbs();
    show('trouble');
  }
  ready();
}
