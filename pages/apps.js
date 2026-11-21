// The apps of a server, as the first page and the page of an app show
// them: an app is a name for the classes that belong together, and a
// person opens the lists of its classes.
//
// The server answers names (list_apps, list_classes) and each thing by
// its name (get_app, get_class); which class belongs to which app is
// said by the class. This module asks once and puts the two together.

import { call } from './fado.js';
import { make, who } from './shell.js';

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

/**
 * What the lists that belong to no app go by. To a person they stand
 * together as one more app, last in the rail; the server has no app of
 * this name.
 */
export const UNASSIGNED = 'Unassigned';

/** The page of the lists that belong to no app. */
export const unassignedAddress = 'app.html?unassigned';

/** The page of the settings: it opens their first part. */
export const settingsAddress = 'settings.html';

/**
 * The parts of the settings, in the order the rail names them. They are
 * a database administrator's.
 */
export const SETTINGS = [
  { part: 'server', words: 'Server' },
  { part: 'admin', words: 'Admin' },
  { part: 'users', words: 'Users' },
  { part: 'groups', words: 'Groups' },
];

/** @param {string} part the name of a part of the settings */
export const settingsPart = (part) => `settings.html?part=${encodeURIComponent(part)}`;

/**
 * What an app says of itself, for the box that finds one: its own
 * words and those of its lists. A designer knows the names behind them
 * too, and finds by those.
 *
 * @param {App} app
 * @param {boolean} designer
 */
export function appSays(app, designer) {
  const says = [app.label, app.about, ...app.lists.flatMap((list) => [list.label, list.one])];
  if (designer) says.push(app.name, ...app.lists.map((list) => list.name));
  return says;
}

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

/** The picture beside "Settings" in the rail: a cog. */
function cogPicture() {
  const space = 'http://www.w3.org/2000/svg';
  const picture = document.createElementNS(space, 'svg');
  picture.setAttribute('class', 'rail-picture');
  picture.setAttribute('viewBox', '0 0 18 18');
  picture.setAttribute('aria-hidden', 'true');
  // The teeth are a ring drawn in eight dashes; inside it the wheel and its hub.
  for (const [radius, more] of /** @type {[number, Record<string, string>][]} */ ([[7, { 'stroke-width': '2.4', 'stroke-dasharray': '2.3 3.2', 'stroke-dashoffset': '1.15' }], [5.3, {}], [2.1, {}]])) {
    const ring = document.createElementNS(space, 'circle');
    ring.setAttribute('cx', '9');
    ring.setAttribute('cy', '9');
    ring.setAttribute('r', String(radius));
    for (const [name, value] of Object.entries(more)) ring.setAttribute(name, value);
    picture.append(ring);
  }
  return picture;
}

/**
 * Draws the rail at the side: Apps, and under it each app by its name
 * and Unassigned, where a list belongs to no app; then, for a database
 * administrator, Settings, and under it each of their parts.
 *
 * @param {HTMLElement} rail
 * @param {App[]} apps
 * @param {boolean} unassigned whether Unassigned is named: a list belongs to no app, or the page is about them
 * @param {string} here the address of the page the person is on: './' for the first page, that of an app, of Unassigned or of a part of the settings
 */
export function drawRail(rail, apps, unassigned, here) {
  const home = make('a', 'rail-way rail-head rail-home');
  home.setAttribute('href', './');
  home.append(appsPicture(), make('span', '', 'Apps'));
  rail.replaceChildren(home);
  for (const [at, app] of apps.entries()) {
    // An app goes by the colour of its place among the apps.
    const way = make('a', `rail-way rail-app hue-${at % 6}`, app.label);
    way.setAttribute('href', appAddress(app.name));
    rail.append(way);
  }
  if (unassigned) {
    const way = make('a', 'rail-way rail-app', UNASSIGNED);
    way.id = 'rail-unassigned';
    way.setAttribute('href', unassignedAddress);
    rail.append(way);
  }
  if ((who()?.system_groups ?? []).includes('administrators')) {
    const settings = make('a', 'rail-way rail-head rail-settings');
    settings.id = 'rail-settings';
    settings.setAttribute('href', settingsAddress);
    settings.append(cogPicture(), make('span', '', 'Settings'));
    rail.append(settings);
    for (const { part, words } of SETTINGS) {
      const way = make('a', 'rail-way rail-sub', words);
      way.id = `rail-settings-${part}`;
      way.setAttribute('href', settingsPart(part));
      rail.append(way);
    }
  }
  for (const way of rail.querySelectorAll('.rail-way')) {
    if (way.getAttribute('href') === here) way.setAttribute('aria-current', 'page');
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
 * one of its classes: the app's own words and the way to its page. For
 * a class that belongs to no app the step is Unassigned.
 *
 * @param {unknown} name the app a class names, as its definition says it
 * @returns {Promise<{ words: string, href: string, id: string }[]>}
 */
export async function appSteps(name) {
  if (typeof name !== 'string' || name === '') return [{ words: UNASSIGNED, href: unassignedAddress, id: 'to-app' }];
  const definition = await call('get_app', { name }).then(
    (answer) => answer?.app?.definition ?? {},
    () => ({}),
  );
  return [{ words: String(definition.label || definition.name || name), href: appAddress(String(definition.name || name)), id: 'to-app' }];
}
