// The settings: what a database administrator keeps. Each part is a
// view of this page, named in the address: the server, who administers
// it, its users and their groups. Today every part is read; nothing is
// changed from here yet.

import { SETTINGS, drawRail, readApps, settingsPart } from './apps.js';
import { call, health } from './fado.js';
import { finder } from './finder.js';
import { crumbs, enter, make, part, ready, show } from './shell.js';

/**
 * A user, as the server lists one.
 *
 * @typedef {{ id: string, kind?: string, name?: string, groups?: string[], system_groups?: string[], disabled?: boolean }} User
 */

/** @param {User} user */
const nameOf = (user) => String(user.name || user.id);

/**
 * A cell of a table. On a phone a row is a card and each value stands
 * under its heading, which the cell carries.
 *
 * @param {string} heading
 * @param {string} className
 * @param {string} [text]
 */
function cell(heading, className, text = '') {
  const made = make('td', className, text);
  made.setAttribute('data-label', heading);
  return made;
}

/**
 * A cell that holds a name as commands and formulas write it.
 *
 * @param {string} heading
 * @param {string} className
 * @param {string} name
 */
function nameCell(heading, className, name) {
  const made = cell(heading, className);
  made.append(make('code', 'list-code', name));
  return made;
}

/** The server: where it answers, and the version of its program. */
async function showServer() {
  const { version } = await health();
  part('server-address').textContent = location.origin;
  part('server-version').textContent = version;
}

/**
 * The people of one system group, by name, each with the name they
 * sign in by.
 *
 * @param {HTMLElement} list
 * @param {User[]} users
 * @param {string} group
 */
function people(list, users, group) {
  const members = users.filter((user) => (user.system_groups ?? []).includes(group));
  list.replaceChildren();
  for (const user of members) {
    const item = make('li', 'person');
    item.append(make('span', 'person-name', nameOf(user)), make('code', 'person-id', String(user.id)));
    list.append(item);
  }
  if (members.length === 0) list.append(make('li', 'person person-none', 'Nobody'));
}

/** @param {User[]} users */
function showAdmin(users) {
  people(part('administrators'), users, 'administrators');
  people(part('content-administrators'), users, 'content-administrators');
}

/** @param {User[]} users */
function showUsers(users) {
  const rows = part('users-rows');
  rows.replaceChildren();
  for (const user of users) {
    const row = make('tr', '');
    row.setAttribute('data-user', String(user.id));
    const name = cell('Name', 'title', nameOf(user));
    if (user.disabled) name.append(' ', make('span', 'state', 'Disabled'));
    row.append(
      name,
      nameCell('Signs in as', 'short', String(user.id)),
      cell('Kind', 'short', String(user.kind ?? '')),
      cell('System groups', '', (user.system_groups ?? []).join(', ')),
      cell('Groups', '', (user.groups ?? []).join(', ')),
    );
    rows.append(row);
  }
}

/**
 * The groups, each with its members. A group is a word on a user: the
 * server keeps no list of groups, so they are read off the users.
 *
 * @param {User[]} users
 */
function showGroups(users) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const user of users) {
    for (const group of user.groups ?? []) groups.set(group, [...(groups.get(group) ?? []), nameOf(user)]);
  }
  const rows = part('groups-rows');
  rows.replaceChildren();
  for (const group of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    const row = make('tr', '');
    row.setAttribute('data-group', group);
    row.append(nameCell('Group', 'title', group), cell('Members', '', (groups.get(group) ?? []).join(', ')));
    rows.append(row);
  }
  part('groups-box').hidden = groups.size === 0;
  part('no-groups').hidden = groups.size > 0;
}

const user = await enter();
if (user && !(user.system_groups ?? []).includes('administrators')) {
  // The settings are an administrator's: anybody else is at Home.
  location.replace('./');
} else if (user) {
  const asked = new URLSearchParams(location.search).get('part') ?? '';
  const here = SETTINGS.find((one) => one.part === asked) ?? SETTINGS[0];
  try {
    const designer = (user.system_groups ?? []).includes('designers');
    const { apps, loose } = await readApps();
    drawRail(part('rail'), apps, loose.length > 0, settingsPart(here.part));
    finder({ designer, apps });
    crumbs([{ words: 'Settings' }, { words: here.words }]);
    document.title = `${here.words} · FadoDB Workshop`;
    if (here.part === 'server') {
      await showServer();
    } else {
      /** @type {{ users?: User[] }} */
      const { users = [] } = await call('list_users');
      if (here.part === 'admin') showAdmin(users);
      else if (here.part === 'users') showUsers(users);
      else showGroups(users);
    }
    show(here.part);
  } catch (refusal) {
    part('trouble-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
    crumbs();
    show('trouble');
  }
  ready();
}
