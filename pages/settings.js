// The settings: what a database administrator keeps. Each part is a
// view of this page, named in the address: the server, who administers
// it, its users and their groups. The server and who administers it are
// read; a user is made and changed here, and so is who is in a group.
//
// A group is a word on a user: the server keeps no list of groups. So a
// group is made by putting somebody in it, and is gone when nobody is.

import { SETTINGS, drawRail, readApps, settingsPart } from './apps.js';
import { Refused, call, health } from './fado.js';
import { found } from './find.js';
import { finder } from './finder.js';
import { crumbs, enter, idFrom, make, part, ready, show } from './shell.js';

/**
 * A user, as the server lists one.
 *
 * @typedef {{ id: string, kind?: string, name?: string, email?: string, groups?: string[], system_groups?: string[], disabled?: boolean }} User
 */

/** The system groups of the server, by the words a person reads. */
const SYSTEM = [
  { name: 'administrators', words: 'Administrators' },
  { name: 'designers', words: 'Designers' },
  { name: 'content-administrators', words: 'Content administrators' },
  { name: 'analysts', words: 'Analysts' },
];

/** Which groups the page of a user shows, by the words a person reads. */
const SHOWN = /** @type {[string, string][]} */ ([
  ['in', 'Belongs to'],
  ['out', "Doesn't belong to"],
  ['all', 'All groups'],
]);

/**
 * The picture of one way the groups are shown: a ring with a tick in
 * it, a ring with a stroke in it, and three lines.
 *
 * @param {string} shown
 */
function shownPicture(shown) {
  const space = 'http://www.w3.org/2000/svg';
  const picture = document.createElementNS(space, 'svg');
  picture.setAttribute('class', 'groups-show-picture');
  picture.setAttribute('viewBox', '0 0 18 18');
  picture.setAttribute('aria-hidden', 'true');
  const draw = (/** @type {string} */ tag, /** @type {Record<string, string>} */ says) => {
    const one = document.createElementNS(space, tag);
    for (const [name, value] of Object.entries(says)) one.setAttribute(name, value);
    picture.append(one);
  };
  if (shown === 'all') {
    for (const y of ['5', '9', '13']) draw('line', { x1: '3.5', y1: y, x2: '14.5', y2: y });
  } else {
    draw('circle', { cx: '9', cy: '9', r: '6.6' });
    if (shown === 'in') draw('polyline', { points: '5.9,9.3 8.1,11.4 12.2,6.9' });
    else draw('line', { x1: '6', y1: '9', x2: '12', y2: '9' });
  }
  return picture;
}

const usersAddress = settingsPart('users');
const newUserAddress = `${usersAddress}&new`;
/** @param {string} id */
const userAddress = (id) => `${usersAddress}&user=${encodeURIComponent(id)}`;
const groupsAddress = settingsPart('groups');
/** @param {string} name */
const groupAddress = (name) => `${groupsAddress}&group=${encodeURIComponent(name)}`;

/** @param {User} user */
const nameOf = (user) => String(user.name || user.id);

/**
 * What the server said when it would not do something, for a person:
 * its words, and how to put it right where it says so.
 *
 * @param {unknown} refusal
 */
function said(refusal) {
  if (!(refusal instanceof Refused)) return `The server said: ${refusal instanceof Error ? refusal.message : String(refusal)}`;
  return refusal.hint ? `The server said: ${refusal.message}. ${refusal.hint}.` : `The server said: ${refusal.message}.`;
}

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
 * A way to a page, by the words given.
 *
 * @param {string} href
 * @param {string} words
 */
function way(href, words) {
  const made = make('a', '', words);
  made.setAttribute('href', href);
  return made;
}

/**
 * A tick with its words, and beside them a name as commands write it.
 *
 * @param {string} id
 * @param {string} words
 * @param {boolean} ticked
 * @param {string} [name]
 */
function tick(id, words, ticked, name = '') {
  const box = make('div', 'tick');
  const input = /** @type {HTMLInputElement} */ (make('input', 'check'));
  input.type = 'checkbox';
  input.id = id;
  input.checked = ticked;
  const label = /** @type {HTMLLabelElement} */ (make('label', 'tick-label', words));
  label.htmlFor = id;
  if (name) label.append(' ', make('code', 'tick-id', name));
  box.append(input, label);
  return { box, input };
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
    const name = make('span', 'person-name');
    name.append(way(userAddress(user.id), nameOf(user)));
    item.append(name, make('code', 'person-id', String(user.id)));
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
    const name = cell('Name', 'title');
    name.append(way(userAddress(user.id), nameOf(user)));
    if (user.disabled) name.append(' ', make('span', 'state', 'Disabled'));
    const id = cell('Signs in as', 'short');
    id.append(make('code', 'list-code', String(user.id)));
    row.append(name, id, cell('Kind', 'short', String(user.kind ?? '')), cell('System groups', '', (user.system_groups ?? []).join(', ')), cell('Groups', '', (user.groups ?? []).join(', ')));
    rows.append(row);
  }

  // A user is found by a part of anything their row says: a name, the name they sign in by, a kind, a group.
  const find = /** @type {HTMLInputElement} */ (part('users-find'));
  const none = part('no-users-found');
  const narrow = () => {
    let left = 0;
    users.forEach((user, at) => {
      const is = found([nameOf(user), String(user.id), String(user.kind ?? ''), ...(user.system_groups ?? []), ...(user.groups ?? []), user.disabled ? 'disabled' : ''], find.value);
      /** @type {HTMLElement} */ (rows.children[at]).hidden = !is;
      if (is) left++;
    });
    part('users-box').hidden = left === 0;
    none.hidden = left > 0;
    none.textContent = left > 0 ? '' : `Nothing here goes by "${find.value.trim()}".`;
  };
  find.addEventListener('input', narrow);
  // A browser that brings the person back may bring what they had typed too.
  narrow();
}

/**
 * The groups of the server, each with its members, read off the users.
 *
 * @param {User[]} users
 * @returns {Map<string, User[]>} by name, in the order of the names
 */
function groupsOf(users) {
  /** @type {Map<string, User[]>} */
  const groups = new Map();
  for (const user of users) {
    for (const group of user.groups ?? []) groups.set(group, [...(groups.get(group) ?? []), user]);
  }
  return new Map([...groups].sort(([a], [b]) => a.localeCompare(b)));
}

/** @param {User[]} users */
function showGroups(users) {
  const groups = groupsOf(users);
  const rows = part('groups-rows');
  rows.replaceChildren();
  for (const [group, members] of groups) {
    const row = make('tr', '');
    row.setAttribute('data-group', group);
    const name = cell('Group', 'title');
    const to = way(groupAddress(group), '');
    to.append(make('code', 'list-code', group));
    name.append(to);
    row.append(name, cell('Members', '', members.map(nameOf).join(', ')));
    rows.append(row);
  }
  part('groups-box').hidden = groups.size === 0;
  part('no-groups').hidden = groups.size > 0;
}

/**
 * One user: a new one, or one the server has, with what an
 * administrator changes of it.
 *
 * @param {User[]} users
 * @param {string} id the user the address names; empty for a new one
 */
async function showUser(users, id) {
  const fresh = id === '';
  /** @type {User | undefined} */
  let held = fresh ? { id: '', kind: 'person', groups: [], system_groups: [] } : users.find((one) => one.id === id);
  // A user the list does not have: the server says so in its own words.
  if (!held) held = (await call('get_user', { id })).user;
  if (!held) throw new Refused('unknown_user', `The server has no user ${id}.`, 0);
  const user = held;
  const words = fresh ? 'A new user' : nameOf(user);
  crumbs([{ words: 'Settings' }, { words: 'Users', href: usersAddress, id: 'to-users' }, { words }]);
  document.title = `${words} · FadoDB Workshop`;
  part('user-title').textContent = words;

  const name = /** @type {HTMLInputElement} */ (part('user-name'));
  const signs = /** @type {HTMLInputElement} */ (part('user-id'));
  const kind = /** @type {HTMLSelectElement} */ (part('user-kind'));
  const email = /** @type {HTMLInputElement} */ (part('user-email'));
  const disabled = /** @type {HTMLInputElement} */ (part('user-disabled'));
  const why = part('user-why');
  name.value = String(user.name ?? '');
  signs.value = String(user.id);
  kind.value = String(user.kind ?? 'person');
  email.value = String(user.email ?? '');
  disabled.checked = user.disabled === true;
  // Who a user is and of what kind is said once, when it is made.
  signs.readOnly = !fresh;
  kind.disabled = !fresh;
  part('user-disabled-field').hidden = fresh;
  part('user-go').textContent = fresh ? 'Create user' : 'Save';
  const person = () => kind.value === 'person';
  const mail = () => {
    part('user-email-field').hidden = !person();
  };
  kind.addEventListener('change', mail);
  mail();

  const system = SYSTEM.map((group, at) => ({ ...group, ...tick(`user-system-${at}`, group.words, (user.system_groups ?? []).includes(group.name)) }));
  for (const one of system) one.input.setAttribute('data-system', one.name);
  part('user-system').replaceChildren(...system.map((one) => one.box));

  // The groups, in a container of their own beside the user: all the
  // server has, those the user belongs to or those it does not, and
  // among them the ones that go by what was typed.
  /** @type {{ name: string, input: HTMLInputElement, box: HTMLElement }[]} */
  const groups = [];
  const box = part('user-groups');
  box.replaceChildren();
  const add = (/** @type {string} */ group, /** @type {boolean} */ ticked) => {
    const made = tick(`user-group-${groups.length}`, group, ticked);
    made.input.setAttribute('data-group', group);
    groups.push({ name: group, input: made.input, box: made.box });
    box.append(made.box);
  };
  for (const group of new Set([...groupsOf(users).keys(), ...(user.groups ?? [])])) add(group, (user.groups ?? []).includes(group));

  const findGroup = /** @type {HTMLInputElement} */ (part('user-groups-find'));
  let showing = 'all';
  /**
   * Shows the groups that are asked for. It is called when what is asked
   * changes, and not at a tick: a group just ticked or unticked stays
   * where it is, under the person's hand.
   */
  const showGroupsAsked = () => {
    let left = 0;
    for (const one of groups) {
      const is = (showing === 'all' || (showing === 'in') === one.input.checked) && found([one.name], findGroup.value);
      one.box.hidden = !is;
      if (is) left++;
    }
    const typed = findGroup.value.trim();
    const none = part('user-groups-none');
    none.hidden = left > 0;
    none.textContent = left > 0 ? '' : typed ? `Nothing here goes by "${typed}".` : groups.length === 0 ? 'No groups yet.' : showing === 'in' ? 'In no group.' : 'In every group.';
    part('user-groups-shown').textContent = SHOWN.find(([name]) => name === showing)?.[1] ?? '';
  };
  const ways = part('user-groups-show');
  ways.replaceChildren();
  for (const [name, words] of SHOWN) {
    const one = make('label', 'groups-show-one');
    one.setAttribute('title', words);
    const input = /** @type {HTMLInputElement} */ (make('input', 'look-input'));
    input.type = 'radio';
    input.name = 'user-groups-show';
    input.value = name;
    input.checked = name === showing;
    input.setAttribute('aria-label', words);
    input.addEventListener('change', () => {
      showing = name;
      showGroupsAsked();
    });
    one.append(input, shownPicture(name));
    ways.append(one);
  }
  findGroup.addEventListener('input', showGroupsAsked);
  // Enter in the box that finds a group does not send the form.
  findGroup.addEventListener('keydown', (pressed) => {
    if (pressed.key === 'Enter') pressed.preventDefault();
  });
  showGroupsAsked();

  const another = /** @type {HTMLInputElement} */ (part('user-group-new'));
  const addAnother = () => {
    const group = another.value.trim();
    if (!group) return;
    const has = groups.find((one) => one.name === group);
    if (has) has.input.checked = true;
    else add(group, true);
    another.value = '';
    // What was just added is shown, whatever is asked for.
    const added = groups.find((one) => one.name === group);
    if (added) added.box.hidden = false;
    part('user-groups-none').hidden = true;
  };
  part('user-group-add').addEventListener('click', addAnother);
  // Enter in the box adds the group; it does not send the form.
  another.addEventListener('keydown', (pressed) => {
    if (pressed.key !== 'Enter') return;
    pressed.preventDefault();
    addAnother();
  });

  if (fresh) {
    let own = false;
    name.addEventListener('input', () => {
      if (!own) signs.value = idFrom(name.value);
    });
    signs.addEventListener('input', () => {
      own = signs.value !== '';
    });
  }

  part('user-form').addEventListener('submit', async (sent) => {
    sent.preventDefault();
    why.textContent = '';
    // A group typed and not yet added is meant too.
    addAnother();
    const told = {
      id: signs.value.trim(),
      name: name.value.trim(),
      groups: groups.filter((one) => one.input.checked).map((one) => one.name),
      system_groups: system.filter((one) => one.input.checked).map((one) => one.name),
    };
    if (!told.id) return void (why.textContent = 'Give the name the user signs in by.');
    try {
      if (fresh) {
        const made = await call('create_user', { ...told, kind: kind.value, ...(person() && email.value.trim() ? { email: email.value.trim() } : {}) });
        location.assign(userAddress(String(made.user.id)));
      } else {
        await call('set_user', { ...told, disabled: disabled.checked, ...(person() ? { email: email.value.trim() } : {}) });
        location.assign(usersAddress);
      }
    } catch (refusal) {
      why.textContent = said(refusal);
    }
  });

  // A person sets their own password, by a link an administrator makes for them.
  part('user-password').hidden = fresh || !person() || user.disabled === true;
  const link = /** @type {HTMLInputElement} */ (part('user-link'));
  part('user-link-go').addEventListener('click', async () => {
    part('user-link-why').textContent = '';
    try {
      const made = (await call('create_password_link', { user: id })).link;
      link.value = `${location.origin}/auth/password?link=${encodeURIComponent(String(made.token))}`;
      const ends = new Intl.DateTimeFormat(navigator.language || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(made.ends) * 1000));
      part('user-link-ends').textContent = `Good once, until ${ends}. It is shown this once.`;
      part('user-link-ends').hidden = false;
      part('user-link-box').hidden = false;
      part('user-link-copy').textContent = 'Copy';
      link.focus();
      link.select();
    } catch (refusal) {
      part('user-link-why').textContent = said(refusal);
    }
  });
  link.addEventListener('focus', () => link.select());
  part('user-link-copy').addEventListener('click', async () => {
    link.focus();
    link.select();
    try {
      await navigator.clipboard.writeText(link.value);
      part('user-link-copy').textContent = 'Copied';
    } catch {
      // A browser that keeps the clipboard to itself leaves the link marked, to be copied by hand.
    }
  });

  show('user');
  if (fresh) name.focus();
}

/**
 * One group: a new one, or one some user is in, with who is in it.
 *
 * @param {User[]} users
 * @param {string} group the group the address names; empty for a new one
 */
function showGroup(users, group) {
  const fresh = group === '';
  const words = fresh ? 'A new group' : group;
  crumbs([{ words: 'Settings' }, { words: 'Groups', href: groupsAddress, id: 'to-groups' }, { words }]);
  document.title = `${words} · FadoDB Workshop`;
  part('group-title').textContent = words;

  const name = /** @type {HTMLInputElement} */ (part('group-name'));
  const why = part('group-why');
  name.value = group;
  // A group is the word its members carry: there is nothing of its own
  // to rename, and the way above says which group this is.
  part('group-name-field').hidden = !fresh;
  part('group-go').textContent = fresh ? 'Create group' : 'Save';

  const members = users.map((user, at) => {
    const made = tick(`group-member-${at}`, nameOf(user), !fresh && (user.groups ?? []).includes(group), String(user.id));
    made.input.setAttribute('data-user', String(user.id));
    return { id: String(user.id), ...made };
  });
  part('group-members').replaceChildren(...members.map((one) => one.box));

  part('group-form').addEventListener('submit', async (sent) => {
    sent.preventDefault();
    why.textContent = '';
    part('group-existing-box').hidden = true;
    const named = fresh ? name.value.trim() : group;
    const ticked = new Set(members.filter((one) => one.input.checked).map((one) => one.id));
    if (!named) return void (why.textContent = 'Give the group a name.');
    if (fresh && ticked.size === 0) return void (why.textContent = 'Tick who is in it: a group is the people in it.');
    try {
      // Who is in which group is read again, so that what somebody else changed meanwhile is kept.
      /** @type {{ users?: User[] }} */
      const { users: now = [] } = await call('list_users');
      if (fresh && now.some((user) => (user.groups ?? []).includes(named))) {
        why.textContent = `${named} is a group on this server already.`;
        part('group-existing').setAttribute('href', groupAddress(named));
        part('group-existing-box').hidden = false;
        return;
      }
      for (const user of now) {
        const has = (user.groups ?? []).includes(named);
        const wanted = ticked.has(String(user.id));
        if (has === wanted) continue;
        const groups = wanted ? [...(user.groups ?? []), named] : (user.groups ?? []).filter((one) => one !== named);
        await call('set_user', { id: user.id, groups });
      }
      location.assign(groupsAddress);
    } catch (refusal) {
      why.textContent = said(refusal);
    }
  });

  show('group');
  if (fresh) name.focus();
}

const user = await enter();
if (user && !(user.system_groups ?? []).includes('administrators')) {
  // The settings are an administrator's: anybody else is at Home.
  location.replace('./');
} else if (user) {
  const asked = new URLSearchParams(location.search);
  const here = SETTINGS.find((one) => one.part === asked.get('part')) ?? SETTINGS[0];
  try {
    const designer = (user.system_groups ?? []).includes('designers');
    const { apps, loose } = await readApps();
    drawRail(part('rail'), apps, loose.length > 0, settingsPart(here.part));
    finder({ designer, apps });
    crumbs([{ words: 'Settings' }, { words: here.words }]);
    document.title = `${here.words} · FadoDB Workshop`;
    if (here.part === 'server') {
      await showServer();
      show('server');
    } else {
      /** @type {{ users?: User[] }} */
      const { users = [] } = await call('list_users');
      if (here.part === 'admin') {
        showAdmin(users);
        show('admin');
      } else if (here.part === 'users') {
        if (asked.has('new')) await showUser(users, '');
        else if (asked.get('user')) await showUser(users, String(asked.get('user')));
        else {
          part('new-user').setAttribute('href', newUserAddress);
          showUsers(users);
          show('users');
        }
      } else if (asked.has('new')) {
        showGroup(users, '');
      } else if (asked.get('group')) {
        const group = String(asked.get('group'));
        if (!groupsOf(users).has(group)) throw new Refused('unknown_group', `Nobody on the server is in a group ${group}.`, 0);
        showGroup(users, group);
      } else {
        part('new-group').setAttribute('href', `${groupsAddress}&new`);
        showGroups(users);
        show('groups');
      }
    }
  } catch (refusal) {
    part('trouble-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
    crumbs();
    show('trouble');
  }
  ready();
}
