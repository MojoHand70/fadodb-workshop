// The apps of a server, as the first page and the page of an app show
// them: an app is a name for the classes that belong together, and a
// person opens the lists of its classes.
//
// The server answers names (list_apps, list_classes) and each thing by
// its name (get_app, get_class); which class belongs to which app is
// said by the class. This module asks once and puts the two together.

import { call } from './fado.js';
import { make } from './shell.js';

/**
 * A list a person may open: the documents of one class.
 *
 * @typedef {object} List
 * @property {string} name the name of the class
 * @property {string} label what the list is called: the word for many of its documents
 * @property {string} one what one document is called
 * @property {string} about what the class is for
 * @property {string} app the name of the app the class belongs to, '' for none
 * @property {number | null} count how many documents the person may see, null where the server did not say
 */

/**
 * An app with its lists.
 *
 * @typedef {object} App
 * @property {string} name
 * @property {string} label
 * @property {string} about
 * @property {List[]} lists
 */

/**
 * Reads the apps of the server and the lists of each, and the lists
 * that belong to no app.
 *
 * @returns {Promise<{ apps: App[], loose: List[] }>}
 */
export async function readApps() {
  const [named, classed] = await Promise.all([call('list_apps'), call('list_classes')]);
  /** @type {string[]} */
  const appNames = Array.isArray(named?.apps) ? named.apps : [];
  /** @type {string[]} */
  const classNames = Array.isArray(classed?.classes) ? classed.classes : [];
  const [definitions, lists] = await Promise.all([
    Promise.all(
      appNames.map((name) =>
        call('get_app', { name }).then(
          (answer) => answer?.app?.definition ?? {},
          () => ({}),
        ),
      ),
    ),
    Promise.all(classNames.map(readList)),
  ]);
  /** @type {App[]} */
  const apps = appNames.map((name, at) => ({
    name,
    label: String(definitions[at].label || name),
    about: String(definitions[at].description || ''),
    lists: [],
  }));
  /** @type {List[]} */
  const loose = [];
  for (const list of lists) {
    // Names are the same name in any capitals, to the server and so here.
    const home = apps.find((app) => app.name.toLowerCase() === list.app.toLowerCase());
    if (home) home.lists.push(list);
    else loose.push(list);
  }
  return { apps, loose };
}

/**
 * Reads one class as a list: its words, and how many documents of it
 * the person may see. A class whose definition the person may not read
 * goes by its name alone; a class that keeps no documents has no count.
 *
 * @param {string} name
 * @returns {Promise<List>}
 */
async function readList(name) {
  const [definition, count] = await Promise.all([
    call('get_class', { name }).then(
      (answer) => answer?.class?.definition ?? {},
      () => ({}),
    ),
    call('count', { class: name }).then(
      (answer) => (typeof answer?.count === 'number' ? answer.count : null),
      () => null,
    ),
  ]);
  return {
    name,
    label: String(definition.plural || definition.label || name),
    one: String(definition.label || name),
    about: String(definition.description || ''),
    app: String(definition.app || ''),
    count,
  };
}

/** @param {string} name the name of an app */
export const appAddress = (name) => `app.html?app=${encodeURIComponent(name)}`;

/** @param {string} name the name of a class */
export const listAddress = (name) => `list.html?class=${encodeURIComponent(name)}`;

/** @param {string} name the name of a class */
export const designAddress = (name) => `design.html?class=${encodeURIComponent(name)}`;

/** The picture beside "Apps" in the rail: four squares. */
function appsPicture() {
  const space = 'http://www.w3.org/2000/svg';
  const picture = document.createElementNS(space, 'svg');
  picture.setAttribute('class', 'rail-picture');
  picture.setAttribute('viewBox', '0 0 18 18');
  picture.setAttribute('aria-hidden', 'true');
  for (const [x, y] of [[2, 2], [10.5, 2], [2, 10.5], [10.5, 10.5]]) {
    const square = document.createElementNS(space, 'rect');
    square.setAttribute('x', String(x));
    square.setAttribute('y', String(y));
    square.setAttribute('width', '5.5');
    square.setAttribute('height', '5.5');
    square.setAttribute('rx', '1.2');
    picture.append(square);
  }
  return picture;
}

/**
 * Draws the rail at the side: Apps, and under it each app by its name.
 *
 * @param {HTMLElement} rail
 * @param {App[]} apps
 * @param {string} here the name of the app the page is about, '' on the first page
 */
export function drawRail(rail, apps, here) {
  const home = make('a', 'rail-way rail-home');
  home.setAttribute('href', './');
  home.append(appsPicture(), make('span', '', 'Apps'));
  if (!here) home.setAttribute('aria-current', 'page');
  rail.replaceChildren(home);
  for (const app of apps) {
    const way = make('a', 'rail-way rail-app', app.label);
    way.setAttribute('href', appAddress(app.name));
    if (app.name === here) way.setAttribute('aria-current', 'page');
    rail.append(way);
  }
  rail.hidden = false;
}

/**
 * How many documents, as a person reads it beside a name.
 *
 * @param {number | null} count
 */
export function counted(count) {
  return count === null ? '' : new Intl.NumberFormat(navigator.language || 'en').format(count);
}

/**
 * The way to a list, as it stands inside a tile: its name and how many
 * documents it has.
 *
 * @param {List} list
 */
export function listWay(list) {
  const way = make('a', 'tile-list');
  way.setAttribute('href', listAddress(list.name));
  way.append(make('span', 'tile-list-name', list.label));
  const count = counted(list.count);
  if (count) way.append(make('span', 'tile-count', count));
  return way;
}

/** Letters that are one sign with no mark to take off, and the plain letters they are written as in a name. */
const PLAIN = new Map([
  ['\u0142', 'l'],
  ['\u0141', 'L'],
  ['\u00f8', 'o'],
  ['\u00d8', 'O'],
  ['\u0111', 'd'],
  ['\u0110', 'D'],
  ['\u00df', 'ss'],
  ['\u00e6', 'ae'],
  ['\u00c6', 'Ae'],
  ['\u0153', 'oe'],
  ['\u0152', 'Oe'],
]);

/**
 * A name as formulas and commands write it, made from the words people
 * read: "Help desk" gives HelpDesk. Whether it may be a name is the
 * server's to say.
 *
 * @param {string} words
 */
export function nameFrom(words) {
  let plain = '';
  for (const sign of words.normalize('NFD').replace(/\p{M}/gu, '')) plain += PLAIN.get(sign) ?? sign;
  const name = plain
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  return /^[0-9]/.test(name) ? `App${name}` : name;
}

/**
 * The step of an app on the way from the first page, for a page about
 * one of its classes: the app's own words and the way to its page. A
 * class that belongs to no app has no such step.
 *
 * @param {unknown} name the app a class names, as its definition says it
 * @returns {Promise<{ words: string, href: string, id: string }[]>}
 */
export async function appSteps(name) {
  if (typeof name !== 'string' || name === '') return [];
  const definition = await call('get_app', { name }).then(
    (answer) => answer?.app?.definition ?? {},
    () => ({}),
  );
  return [{ words: String(definition.label || definition.name || name), href: appAddress(String(definition.name || name)), id: 'to-app' }];
}
