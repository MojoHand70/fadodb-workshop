// The first page: the apps of the server. An app is a tile with its
// name, what it is for, and the lists a person opens in it.
//
// A person opens a list by the name its documents go by. That there is
// a class behind each list is the designer's to know: the name of a
// class, the way to its design and the making of an app or a class are
// shown to a designer alone.

import { appAddress, counted, designAddress, drawRail, listAddress, listWay, readApps } from './apps.js';
import { found } from './find.js';
import { enter, make, part, ready, show } from './shell.js';

/** What the page lists, each with what it says of itself, its place on the page and where Enter takes a person. */
/** @type {{ says: string[], item: HTMLElement, href: string }[]} */
let listed = [];

/**
 * The tile of an app.
 *
 * @param {import('./apps.js').App} app
 * @param {boolean} designer
 */
function tile(app, designer) {
  const item = make('li', 'tile');
  item.dataset.app = app.name;

  const head = make('div', 'tile-head');
  // Until an app has a picture of its own, its first letter stands in the square.
  const mark = make('span', 'tile-mark', app.label.trim().charAt(0).toUpperCase());
  mark.setAttribute('aria-hidden', 'true');
  const name = make('a', 'tile-name', app.label);
  name.setAttribute('href', appAddress(app.name));
  head.append(mark, name);
  item.append(head);

  if (app.about) item.append(make('p', 'tile-about', app.about));

  if (app.lists.length > 0) {
    const lists = make('ul', 'tile-lists');
    for (const list of app.lists) {
      const one = make('li', '');
      one.append(listWay(list));
      lists.append(one);
    }
    item.append(lists);
  }

  if (designer) {
    const classes = app.lists.length;
    item.append(make('p', 'tile-foot', classes === 0 ? 'No class yet' : classes === 1 ? '1 class' : `${classes} classes`));
  }
  return item;
}

/**
 * The tile that adds an app, for a designer.
 */
function addTile() {
  const item = make('li', 'tile tile-add');
  item.id = 'add-app';
  const go = make('a', 'button', 'New app');
  go.id = 'new-app';
  go.setAttribute('href', 'app.html?new');
  item.append(make('span', 'tile-add-title', 'Add an app'), go);
  return item;
}

/**
 * A list that belongs to no app, as a row.
 *
 * @param {import('./apps.js').List} list
 * @param {boolean} designer
 */
function looseRow(list, designer) {
  const item = make('li', 'loose-list');
  item.dataset.class = list.name;
  const way = make('a', 'loose-way');
  way.setAttribute('href', listAddress(list.name));
  way.append(make('span', 'loose-name', list.label));
  const count = counted(list.count);
  if (count) way.append(make('span', 'tile-count', count));
  item.append(way);
  if (designer) {
    item.append(make('code', 'class-name', list.name));
    const design = make('a', 'loose-design', 'Design');
    design.setAttribute('href', designAddress(list.name));
    design.setAttribute('aria-label', `Design ${list.one}`);
    item.append(design);
  }
  return item;
}

/**
 * Draws the page from what the server holds.
 *
 * @param {boolean} designer
 */
async function draw(designer) {
  const { apps, loose } = await readApps();
  drawRail(part('rail'), apps, '');
  listed = [];

  const tiles = part('apps');
  tiles.replaceChildren();
  for (const app of apps) {
    const item = tile(app, designer);
    tiles.append(item);
    // An app is found by its own words and by those of its lists; a
    // designer knows the names behind them too, and finds by those.
    const says = [app.label, app.about, ...app.lists.flatMap((list) => [list.label, list.one])];
    if (designer) says.push(app.name, ...app.lists.map((list) => list.name));
    listed.push({ says, item, href: appAddress(app.name) });
  }
  if (designer && apps.length > 0) tiles.append(addTile());
  tiles.hidden = apps.length === 0;
  part('find-box').hidden = apps.length + loose.length === 0;

  // A server with no app yet says what to do first.
  const first = part('first-app');
  first.hidden = apps.length > 0;
  part('first-title').textContent = designer ? 'Create your first FadoDB application' : 'There is no app here yet';
  part('first-about').textContent = designer
    ? 'An app holds what belongs together: the expenses of a company, its help desk.'
    : 'A designer makes the first one.';
  part('first-go').hidden = !designer;

  const rows = part('loose-lists');
  rows.replaceChildren();
  for (const list of loose) {
    const item = looseRow(list, designer);
    rows.append(item);
    listed.push({ says: designer ? [list.label, list.one, list.about, list.name] : [list.label, list.one, list.about], item, href: listAddress(list.name) });
  }
  part('loose').hidden = loose.length === 0;
  part('loose-title').textContent = designer ? 'Not in an app yet' : 'Other lists';
}

/** Shows of what is listed only what the person typed a part of. */
function narrow() {
  const typed = /** @type {HTMLInputElement} */ (part('find')).value;
  let left = 0;
  for (const one of listed) {
    const is = found(one.says, typed);
    one.item.hidden = !is;
    if (is) left++;
  }
  const add = document.getElementById('add-app');
  if (add) add.hidden = typed.trim() !== '';
  const none = part('none-found');
  none.hidden = left > 0 || listed.length === 0;
  none.textContent = none.hidden ? '' : `Nothing here goes by "${typed.trim()}".`;
}

const user = await enter();
if (user) {
  const designer = (user.system_groups ?? []).includes('designers');
  await draw(designer);
  const find = /** @type {HTMLInputElement} */ (part('find'));
  find.addEventListener('input', narrow);
  // Enter opens the first that is left: a name typed and Enter is the short way in.
  find.addEventListener('keydown', (key) => {
    if (key.key !== 'Enter' || key.isComposing || find.value.trim() === '') return;
    const first = listed.find((one) => !one.item.hidden);
    if (first) location.assign(first.href);
  });
  // A browser that brings the person back may bring what they had typed too.
  narrow();
  show('home');
  ready();
}
