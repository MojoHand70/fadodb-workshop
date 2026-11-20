// The List of a class: its documents, one a row.
//
// The columns are the class's own choice (the engine's ADR-0068, item
// 4): the title of a document, then every variable the class marks
// "list": true, in the order they are written; then what every document
// carries: its state, who made it and when it last changed. Hiding and
// reordering columns, and saved views, come later.
//
// The class comes as its bundle, in the person's language when the
// class has words in it. The documents are the ones the person may
// read: the server decides, the page shows what it is sent.

import { Refused, call } from './fado.js';
import { kindOf, show as showValue } from './format.js';
import { Live } from './live.js';
import { appSteps } from './apps.js';
import { crumbs, enter, make, part, ready, show } from './shell.js';

/** How many documents are asked for at a time. */
const AT_A_TIME = 50;

const person = { locale: navigator.language || 'en', yes: 'Yes', no: 'No' };
const asked = new URLSearchParams(location.search);
const className = asked.get('class') ?? '';

/** @type {any} */
let definition = {};
/** @type {{ name: string, label: string, type: string, format: string }[]} */
let columns = [];
/** The state the list is narrowed to, or '' for every state. */
let state = '';
let shown = 0;
/** @type {Map<string, Promise<string>>} */
const names = new Map();

/**
 * The name of a person, asked once.
 *
 * @param {string} id
 */
function nameOf(id) {
  let name = names.get(id);
  if (!name) {
    name = call('get_user', { id }).then(
      (answer) => String(answer?.user?.name || id),
      () => id,
    );
    names.set(id, name);
  }
  return name;
}

/**
 * Reads the class: its words, its states, and the columns of its list.
 *
 * @param {any} bundle
 */
function readClass(bundle) {
  definition = bundle.definition ?? {};
  /** @type {Record<string, string>} */
  const calculated = {};
  for (const one of bundle.compiled?.computed ?? []) calculated[one.variable] = one.type;
  const variables = definition.variables ?? {};
  columns = [];
  for (const [name, variable] of Object.entries(variables)) {
    // A class whose title is one of its variables shows it once, as the title.
    if (!variable?.list || name === definition.title) continue;
    columns.push({
      name,
      label: String(variable.label || name),
      type: String(variable.type || calculated[name] || ''),
      format: String(variable.format || ''),
    });
  }
}

/** The headings: the title, the class's columns, then what every document carries. */
function drawHeadings() {
  const titled = definition.variables?.[definition.title];
  const headings = [String(titled?.label || 'Title'), ...columns.map((c) => c.label), 'State', 'By', 'Changed'];
  const row = part('heads');
  row.replaceChildren();
  headings.forEach((heading, at) => {
    const cell = make('th', isNumber(columns[at - 1]) ? 'num' : '', heading);
    cell.setAttribute('scope', 'col');
    row.append(cell);
  });
  return headings;
}

/**
 * Whether a column holds numbers, which are set to the right.
 *
 * @param {{ type: string } | undefined} column
 */
function isNumber(column) {
  return !!column && ['number', 'int', 'decimal', 'money'].includes(kindOf(column.type));
}

/**
 * Whether a column holds something short that reads badly when broken
 * over two lines: a day, a moment, a yes or a no.
 *
 * @param {{ type: string }} column
 */
function isShort(column) {
  return ['date', 'datetime', 'bool'].includes(kindOf(column.type));
}

/** The states of the class, to narrow the list to one. */
function drawStates() {
  const box = part('states');
  box.replaceChildren();
  /** @type {string[]} */
  const all = definition.states?.list ?? [];
  if (all.length === 0) return;
  for (const name of ['', ...all]) {
    const label = name === '' ? 'All' : String(definition.states?.labels?.[name] || name);
    const chip = make('button', 'chip', label);
    chip.setAttribute('type', 'button');
    chip.setAttribute('aria-pressed', String(name === state));
    chip.addEventListener('click', () => {
      state = name;
      const address = new URL(location.href);
      if (state) address.searchParams.set('state', state);
      else address.searchParams.delete('state');
      history.replaceState(null, '', address);
      drawStates();
      load(true);
    });
    box.append(chip);
  }
}

/**
 * Asks for documents and puts them on the page.
 *
 * @param {boolean} fromTheStart true to begin the list again, false to add to it
 */
async function load(fromTheStart) {
  if (fromTheStart) shown = 0;
  // The state comes from the class's own list of states, never from the
  // address as it was typed, so nothing typed there becomes a formula.
  const where = state ? `STATE() = "${state}"` : undefined;
  const [{ documents }, { count }] = await Promise.all([
    call('query', { class: className, where, order: ['-created_at', '-id'], limit: AT_A_TIME, offset: shown }),
    call('count', { class: className, where }),
  ]);
  const headings = drawHeadings();
  const rows = part('rows');
  if (fromTheStart) rows.replaceChildren();

  for (const document of documents ?? []) {
    const row = make('tr', '');
    const way = make('a', '', String(document.title || document.id));
    way.setAttribute('href', `document.html?class=${encodeURIComponent(className)}&id=${encodeURIComponent(document.id)}`);
    const titleCell = make('td', 'title');
    titleCell.append(way);
    /** @type {HTMLElement[]} */
    const cells = [titleCell];
    for (const column of columns) {
      cells.push(make('td', isNumber(column) ? 'num' : isShort(column) ? 'short' : '', showValue(document.values?.[column.name], column, person)));
    }
    const stateCell = make('td', 'short');
    stateCell.append(make('span', 'state', String(definition.states?.labels?.[document.state] || document.state || '')));
    const by = make('td', 'short', String(document.created_by ?? ''));
    if (document.created_by) nameOf(document.created_by).then((name) => (by.textContent = name));
    cells.push(stateCell, by, make('td', 'short', showValue(document.updated_at, { type: 'datetime' }, person)));
    cells.forEach((cell, at) => cell.setAttribute('data-label', headings[at]));
    row.append(...cells);
    rows.append(row);
  }

  shown += (documents ?? []).length;
  part('count').textContent = count === 1 ? '1 document' : `${showValue(count, { type: 'int' }, person)} documents`;
  part('table').hidden = shown === 0;
  const empty = part('empty');
  empty.hidden = shown > 0;
  empty.textContent = state ? 'No document is in this state.' : 'There is no document here yet.';
  part('more').hidden = shown >= count;
  await Promise.all(names.values());
}

/** Shows that the list cannot be shown, in the server's own words. */
function trouble(/** @type {unknown} */ refusal) {
  part('trouble-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
  crumbs();
  show('trouble');
}

const user = await enter();
if (user) {
  try {
    if (!className) throw new Refused('unknown_class', 'The address does not say which list to show. Choose one from Home.', 0);
    const bundle = await call('get_bundle', { class: className, language: person.locale });
    readClass(bundle);
    // A new document is offered to whoever the class lets make one. Where
    // the page cannot tell, it is offered and the server decides.
    const fresh = part('new');
    fresh.setAttribute('href', `document.html?class=${encodeURIComponent(className)}&new`);
    fresh.hidden = new Live(bundle, user).mayCreate() === false;
    // A designer gets a way to the design of the class.
    const design = part('design');
    design.setAttribute('href', `design.html?class=${encodeURIComponent(className)}`);
    design.hidden = !(user.system_groups ?? []).includes('designers');
    const wanted = asked.get('state') ?? '';
    state = (definition.states?.list ?? []).includes(wanted) ? wanted : '';
    // A list goes by the word for many of its documents, where the class has one.
    const label = String(definition.plural || definition.label || className);
    document.title = `${label} · FadoDB Workshop`;
    crumbs([...(await appSteps(definition.app)), { words: label }]);
    part('list-title').textContent = label;
    part('list-about').textContent = String(definition.description || '');
    drawStates();
    part('more').addEventListener('click', () => load(false).catch(trouble));
    await load(true);
    show('list');
  } catch (refusal) {
    trouble(refusal);
  }
  ready();
}
