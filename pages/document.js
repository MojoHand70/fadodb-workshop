// One document: what it holds, where it stands, what the person may do
// with it, and what happened to it.
//
// The page draws the document from its class and nothing else (the
// engine's ADR-0069): the sections of the class are its outline, a
// variable in no section belongs to the document as a whole, and every
// label, description and format is the class's own. This is the form
// every class has before anybody designs a face for it.
//
// A value the person may set, as the document stands, is a field. As
// they type, the page works out what the class calculates, with the
// live document (live.js), and nothing is the server's until they save.
// The server decides: a change it refuses is shown at its field, in its
// own words.
//
// Which transitions the person may take is the server's answer for the
// document as it has it. Once the person has typed something, the page
// works them out for the document as it now reads, by the class's own
// rules and guards, and asks the server where it cannot tell; taking one
// then sends the changes with it, in one step. A transition that is not
// this person's to take is left out; one whose condition does not hold
// yet is shown, and says so.
//
// The same page makes a new document, at document.html?class=…&new: it
// begins with what the class gives a new document, its defaults, and is
// the server's when the person creates it.

import { Refused, call } from './fado.js';
import { control as controlOf } from './fields.js';
import { show as showValue } from './format.js';
import { Live } from './live.js';
import { appSteps } from './apps.js';
import { crumbHere, crumbs, enter, make, part, ready, show } from './shell.js';

const person = { locale: navigator.language || 'en', yes: 'Yes', no: 'No' };
const asked = new URLSearchParams(location.search);
const className = asked.get('class') ?? '';
const id = asked.get('id') ?? '';
/** True when the page makes a new document, and has none to read. */
const making = id === '' && asked.has('new');
/** One key for this new document, so that sending it twice makes it once. */
const key = newKey();

/** @type {Live} */
let live;
/** @type {any} */
let definition = {};
/** @type {Map<string, Promise<string>>} */
const names = new Map();
/** Where each value that is not a field is shown, to show it again when it is worked out. */
/** @type {Map<string, HTMLElement>} */
const cells = new Map();
/** The fields whose typing cannot be read, each with why. */
/** @type {Map<string, string>} */
const unread = new Map();
/** The transitions as the server last answered them, for the document as it has it. */
/** @type {any[]} */
let moves = [];
/** The transitions the server would open for the changes it was last asked about. */
/** @type {{ changes: string, transitions: any[] } | null} */
let answered = null;
let asking = 0;
/** The buttons as they were last drawn, so that they are drawn again only when they change. */
let drawnMoves = '';
/** Each field as it was drawn: its box, and the value it was drawn with. */
/** @type {Map<string, { box: HTMLElement, drawn: string }>} */
const fields = new Map();
/** True once the person is sent on by the page itself: then leaving asks nothing. */
let done = false;

/**
 * The name of a person, asked once.
 *
 * @param {string} who
 */
function nameOf(who) {
  let name = names.get(who);
  if (!name) {
    name = call('get_user', { id: who }).then(
      (answer) => String(answer?.user?.name || who),
      () => who,
    );
    names.set(who, name);
  }
  return name;
}

/**
 * An element whose text is a person's name, once it is known.
 *
 * @param {string} tag
 * @param {string} who
 */
function named(tag, who) {
  const made = make(tag, '', who);
  if (who) nameOf(who).then((name) => (made.textContent = name));
  return made;
}

/** @param {string} name */
const stateLabel = (name) => String(definition.states?.labels?.[name] || name || '');

/** @param {string} name */
const labelOf = (name) => String(definition.variables?.[name]?.label || name);

/** @param {unknown} moment */
const when = (moment) => showValue(moment, { type: 'datetime' }, person);

/**
 * Shows a value that is not a field: by the class's format, a dash for
 * none, and a word for one the person may not read.
 *
 * @param {string} name
 */
function showCell(name) {
  const cell = cells.get(name);
  if (!cell) return;
  const variable = definition.variables?.[name] ?? {};
  if (!live.mayRead(name)) {
    cell.textContent = 'Hidden from you';
    cell.className = 'field-value field-empty';
    return;
  }
  const shown = showValue(live.values[name], { type: live.typeOf(name), format: variable.format }, person);
  cell.textContent = shown === '' ? '—' : shown;
  cell.className = `field-value${shown === '' ? ' field-empty' : ''}${live.asks.has(name) ? ' field-waiting' : ''}`;
}

/**
 * The control a person sets a variable with, by its kind. Null for a
 * kind this page does not set yet: a list, rows, an object.
 *
 * @param {string} name
 */
const control = (name) =>
  controlOf({
    id: `f-${name}`,
    variable: definition.variables?.[name] ?? {},
    type: live.typeOf(name),
    value: live.values[name],
    locale: person.locale,
    label: labelOf(name),
    currency: currencyOfTheDocument,
  });

/** The currency the document already counts in, for a money that has none yet. */
function currencyOfTheDocument() {
  for (const value of Object.values(live.saved.values ?? {})) {
    const found = /^-?\d+(?:\.\d+)? ([A-Z]{3})$/.exec(String(value));
    if (found) return found[1];
  }
  return '';
}

/**
 * One variable of the document: its label, its value or its field, and
 * what the class says it is for.
 *
 * @param {string} name
 */
function field(name) {
  const variable = definition.variables?.[name] ?? {};
  const box = make('div', 'field');
  box.dataset.variable = name;
  const set = live.maySet(name) ? control(name) : null;

  const label = make('dt', 'field-label');
  if (variable.formula) {
    const mark = make('span', 'fx', 'fx');
    mark.setAttribute('title', 'Worked out, not typed');
    label.append(mark);
  }
  if (set) {
    const forField = make('label', '', labelOf(name));
    forField.setAttribute('for', `f-${name}`);
    label.append(forField);
    if (variable.required) label.append(make('span', 'field-must', ' needed'));
  } else {
    label.append(labelOf(name));
  }
  box.append(label);

  if (set) {
    fields.set(name, { box, drawn: JSON.stringify(live.values[name] ?? null) });
    const holder = make('dd', 'field-input');
    holder.append(...set.parts);
    const why = make('dd', 'field-why');
    why.id = `f-${name}-why`;
    why.hidden = true;
    for (const one of set.parts) {
      one.setAttribute('aria-describedby', why.id);
      one.addEventListener('input', () => typed(name, set.read(), box, why));
      one.addEventListener('change', () => typed(name, set.read(), box, why));
    }
    box.append(holder, why);
  } else {
    const value = make('dd', 'field-value');
    cells.set(name, value);
    box.append(value);
    showCell(name);
  }
  if (variable.description) box.append(make('dd', 'field-about', String(variable.description)));
  return box;
}

/**
 * What the person typed into a field: taken into the live document, or
 * marked as something the page cannot read.
 *
 * @param {string} name
 * @param {{ wire: any } | { why: string }} read
 * @param {HTMLElement} box
 * @param {HTMLElement} why
 */
function typed(name, read, box, why) {
  if ('why' in read) {
    unread.set(name, read.why);
    why.textContent = read.why;
  } else {
    unread.delete(name);
    live.set(name, read.wire);
  }
  why.hidden = !('why' in read);
  box.classList.toggle('field-wrong', 'why' in read);
  for (const one of box.querySelectorAll('input, select')) one.setAttribute('aria-invalid', String('why' in read));
  follow();
}

/**
 * Shows what follows from a change: the calculated values, the title,
 * what is not saved yet, and that the document cannot be moved until it
 * is. What the page cannot work out is asked of the server.
 */
function follow() {
  for (const name of cells.keys()) showCell(name);
  // A field the person has not touched follows too: a default worked
  // out again, or one the server has just answered.
  for (const [name, { box, drawn }] of fields) {
    if (live.changed.has(name) || unread.has(name) || box.contains(document.activeElement)) continue;
    if (JSON.stringify(live.values[name] ?? null) !== drawn) box.replaceWith(field(name));
  }
  part('doc-title').textContent = live.title || (making ? `New: ${String(definition.label || className)}` : '');
  crumbHere(live.title || (making ? `New: ${String(definition.label || className)}` : id));

  const changed = [...live.changed, ...[...unread.keys()].filter((name) => !live.changed.has(name))];
  const dirty = changed.length > 0;
  part('changes').hidden = !dirty && !making;
  part('changes-what').textContent = making
    ? 'Not made yet. Nothing is the server\'s until you create it.'
    : `Not saved yet: ${changed.map(labelOf).join(', ')}.`;
  part('changes-wrong').hidden = unread.size === 0;
  part('changes-hint').hidden = making || unread.size > 0;
  /** @type {HTMLButtonElement} */ (part('save')).disabled = unread.size > 0 || (!making && live.changed.size === 0);
  const unknown = drawMoves(dirty);

  // What the page cannot work out, a value or whether a transition is
  // open, it asks of the server, once the person stops typing.
  if (live.asks.size > 0 || unknown) {
    const mine = ++asking;
    const changes = live.changes();
    setTimeout(async () => {
      if (mine !== asking) return;
      try {
        const { preview } = await call('preview', making ? { class: className, values: changes } : { class: className, id, values: changes });
        if (mine !== asking) return;
        if (!making) answered = { changes: JSON.stringify(changes), transitions: preview?.transitions ?? [] };
        live.settle(preview?.document?.values ?? {});
        follow();
      } catch {
        // The server could not work it out for these values: the value
        // stays as it last was, and saving will say why.
      }
    }, 300);
  }
}

/**
 * A section of the class and the sections inside it.
 *
 * @param {any} section
 * @param {number} depth 2 for a section of the class, 3 for one inside it
 */
function sectionOf(section, depth) {
  const box = make('section', depth === 2 ? 'card' : 'inner');
  if (section.label) box.append(make(depth === 2 ? 'h2' : 'h3', '', String(section.label)));
  if (section.description) box.append(make('p', 'card-about', String(section.description)));
  /** @type {string[]} */
  const variables = section.variables ?? [];
  if (variables.length > 0) {
    const list = make('dl', 'fields');
    for (const name of variables) list.append(field(name));
    box.append(list);
  }
  for (const inner of Object.values(section.sections ?? {})) box.append(sectionOf(inner, 3));
  return box;
}

/**
 * Every variable some section holds.
 *
 * @param {any} sections
 * @param {Set<string>} into
 */
function held(sections, into) {
  for (const section of Object.values(sections ?? {})) {
    for (const name of section.variables ?? []) into.add(name);
    held(section.sections, into);
  }
  return into;
}

function drawSections() {
  const box = part('sections');
  box.replaceChildren();
  cells.clear();
  fields.clear();
  unread.clear();
  const inSections = held(definition.sections, new Set());
  const loose = Object.keys(definition.variables ?? {}).filter((name) => !inSections.has(name));
  // A variable in no section belongs to the document as a whole.
  if (loose.length > 0) box.append(sectionOf({ variables: loose }, 2));
  for (const section of Object.values(definition.sections ?? {})) box.append(sectionOf(section, 2));
}

/** @param {any} document */
function drawFacts(document) {
  const facts = part('facts');
  facts.replaceChildren();
  /** @param {string} what @param {string} who @param {unknown} moment */
  const fact = (what, who, moment) => {
    const value = make('dd', '');
    value.append(named('span', who), `, ${when(moment)}`);
    facts.append(make('dt', '', what), value);
  };
  fact('Made by', document.created_by, document.created_at);
  fact('Last changed by', document.updated_by, document.updated_at);
  fact(`In ${stateLabel(document.state)} since`, document.state_entered_by, document.state_entered_at);
}

/**
 * What happened to the document, newest first: each version against the
 * one before it.
 *
 * @param {any[]} versions oldest first, as the server sends them
 */
function drawHistory(versions) {
  const list = part('history');
  list.replaceChildren();
  versions.forEach((version, at) => {
    const before = versions[at - 1];
    /** @type {string[]} */
    const did = [];
    if (!before) did.push('made it');
    else {
      if (before.state !== version.state) did.push(`moved it from ${stateLabel(before.state)} to ${stateLabel(version.state)}`);
      const changed = Object.keys(definition.variables ?? {}).filter(
        (name) =>
          !definition.variables[name].formula &&
          JSON.stringify(before.values?.[name] ?? null) !== JSON.stringify(version.values?.[name] ?? null),
      );
      if (changed.length > 0) did.push(`changed ${changed.map(labelOf).join(', ')}`);
      if (did.length === 0) did.push('saved it; its values were worked out again');
    }
    const entry = make('li', 'history-entry');
    const what = make('p', 'history-what');
    what.append(named('strong', version.actor_id || version.updated_by || ''), ` ${did.join(' and ')}`);
    entry.append(what, make('p', 'history-when', when(version.valid_from ?? version.updated_at)));
    list.prepend(entry);
  });
}

/**
 * The transitions leaving the state. With nothing typed they are the
 * server's answer. With something typed they are worked out by the page
 * for the document as it now reads, and where the page cannot tell, they
 * are what the server answered when it was asked about these changes.
 *
 * @param {boolean} dirty whether something is typed and not saved
 * @returns {boolean} whether the server has to be asked about a transition
 */
function drawMoves(dirty) {
  const box = part('moves');
  if (making) {
    box.replaceChildren();
    part('moves-none').hidden = true;
    part('moves-wait').hidden = true;
    return false;
  }

  let unknown = false;
  /** @type {any[]} */
  let offered = moves;
  if (dirty) {
    const asked = answered && answered.changes === JSON.stringify(live.changes()) ? answered.transitions : null;
    offered = live.moves().map((move) => {
      if (move.enabled !== null) return move;
      const said = asked?.find((one) => one.name === move.name);
      if (said) return said;
      unknown = true;
      return { ...move, enabled: false, code: 'asking' };
    });
  }

  // The buttons are drawn again only when they change. A field that is
  // left tells the page so, and a button drawn again at that moment
  // would be gone from under the click that left the field.
  const now = JSON.stringify([offered.map((move) => [move.name, move.enabled, move.code]), unread.size > 0]);
  if (now === drawnMoves) return unknown;
  drawnMoves = now;
  box.replaceChildren();

  let shown = 0;
  for (const move of offered) {
    // Not this person's to take: it is not their business to see it.
    if (!move.enabled && move.code !== 'guard_false' && move.code !== 'asking') continue;
    const told = (definition.transitions ?? []).find((/** @type {any} */ t) => t.name === move.name) ?? {};
    const item = make('div', 'move');
    const button = make('button', 'button', String(told.label || move.name));
    button.setAttribute('type', 'button');
    button.dataset.transition = move.name;
    item.append(button);
    if (move.enabled && unread.size === 0) {
      if (told.description) button.setAttribute('title', String(told.description));
      button.addEventListener('click', () => take(move.name, String(told.label || move.name)));
    } else {
      button.setAttribute('disabled', '');
      if (move.code === 'guard_false') item.append(make('p', 'move-why', `Not yet. ${String(told.description || 'Its condition does not hold.')}`));
      if (move.code === 'asking') item.append(make('p', 'move-why', 'Asking the server.'));
    }
    box.append(item);
    shown++;
  }
  part('moves-none').hidden = shown > 0;
  // A move takes what is typed with it; what cannot be read cannot go.
  part('moves-wait').hidden = !(unread.size > 0 && shown > 0);
  return unknown;
}

/**
 * Shows a refusal in the server's own words.
 *
 * @param {unknown} refusal
 */
function refused(refusal) {
  part('refused-what').textContent = refusal instanceof Error ? refusal.message : String(refusal);
  part('refused-hint').textContent = refusal instanceof Refused ? refusal.hint : '';
  part('refused').hidden = false;
}

/**
 * Takes a transition, and shows the document as it is afterwards. What
 * the person typed and did not save goes with it, in the same step: the
 * server takes both or neither.
 *
 * A refusal is shown in the server's own words. With nothing typed the
 * document is read again, since somebody else may have moved it. With
 * something typed it stays as the person left it, so that nothing they
 * typed is lost.
 *
 * @param {string} name
 * @param {string} label
 */
async function take(name, label) {
  for (const button of part('moves').querySelectorAll('button')) button.setAttribute('disabled', '');
  part('refused').hidden = true;
  part('said').textContent = '';
  const changes = live.changes();
  const typed = Object.keys(changes).length > 0;
  try {
    await call('transition', typed ? { class: className, id, transition: name, values: changes } : { class: className, id, transition: name });
    await load();
    part('said').textContent = `Done: ${label}. It is now in ${part('doc-state').textContent}.`;
  } catch (refusal) {
    // The buttons were greyed while the server was asked: draw them anew.
    drawnMoves = '';
    if (typed) {
      atItsField(refusal);
      follow();
    } else {
      await load().catch(() => {});
    }
    refused(refusal);
  }
}

/**
 * Marks the field a refusal is about, when it is about one.
 *
 * @param {unknown} refusal
 */
function atItsField(refusal) {
  if (!(refusal instanceof Refused) || !refusal.variable) return;
  const box = part('sections').querySelector(`[data-variable="${CSS.escape(refusal.variable)}"]`);
  const why = document.getElementById(`f-${refusal.variable}-why`);
  if (box && why) {
    why.textContent = refusal.message;
    why.hidden = false;
    box.classList.add('field-wrong');
  }
}

/**
 * Sends the changes to the server. What it takes is the document from
 * then on; what it refuses is shown, at its field when it is about one,
 * and nothing the person typed is lost.
 */
async function save() {
  /** @type {HTMLButtonElement} */ (part('save')).disabled = true;
  part('refused').hidden = true;
  part('said').textContent = '';
  try {
    if (making) {
      // The same key goes with every try, so a second click, or a try
      // after a lost answer, makes no second document.
      const { document: made } = await call('create', { class: className, values: live.changes(), key });
      done = true;
      location.replace(`document.html?class=${encodeURIComponent(className)}&id=${encodeURIComponent(made.id)}`);
      return;
    }
    await call('set', { class: className, id, values: live.changes() });
    await load();
    part('said').textContent = 'Saved.';
  } catch (refusal) {
    refused(refusal);
    atItsField(refusal);
    follow();
  }
}

/** Reads the document, what may be done with it and its history, and draws them. */
async function load() {
  const [{ document: sent }, { transitions }, { versions }] = await Promise.all([
    call('get', { class: className, id }),
    call('transitions', { class: className, id }),
    call('history', { class: className, id }),
  ]);
  live.take(sent);
  moves = transitions ?? [];
  answered = null;
  drawnMoves = '';
  document.title = `${live.title} · FadoDB Workshop`;
  part('doc-state').textContent = stateLabel(sent.state);
  part('doc-state-about').textContent = String(definition.states?.descriptions?.[sent.state] || '');
  drawSections();
  drawFacts(sent);
  drawHistory(versions ?? []);
  follow();
  await Promise.all(names.values());
}

const user = await enter();
if (user) {
  try {
    if (!className || (!id && !making)) throw new Refused('unknown_document', 'The address does not say which document to show. Open one from its list.', 0);
    const bundle = await call('get_bundle', { class: className, language: person.locale });
    live = new Live(bundle, user);
    definition = live.definition;
    const list = `list.html?class=${encodeURIComponent(className)}`;
    crumbs([...(await appSteps(definition.app)), { words: String(definition.plural || definition.label || className), href: list, id: 'to-list' }, { words: '' }]);
    part('save').addEventListener('click', save);
    part('discard').addEventListener('click', () => {
      if (making) {
        done = true;
        location.assign(list);
        return;
      }
      // The document is read again: somebody else may have changed it
      // since the person began to type.
      part('refused').hidden = true;
      part('said').textContent = '';
      load()
        .catch(() => {
          live.discard();
          drawSections();
          follow();
        })
        .then(() => (part('said').textContent = 'Put back as the server has it.'));
    });
    window.addEventListener('beforeunload', (leaving) => {
      if (!done && live.changed.size > 0) leaving.preventDefault();
    });
    if (making) {
      if (live.mayCreate() === false) throw new Refused('forbidden', `You may not make a document of ${String(definition.label || className)}: that is kept for others.`, 0);
      live.begin();
      const first = live.saved.state;
      document.title = `New: ${String(definition.label || className)} · FadoDB Workshop`;
      part('doc-state').textContent = stateLabel(first);
      part('doc-state-about').textContent = String(definition.states?.descriptions?.[first] || '');
      part('save').textContent = 'Create';
      part('discard').textContent = 'Cancel';
      part('about').hidden = true;
      part('history-card').hidden = true;
      drawSections();
      follow();
    } else {
      await load();
    }
    show('document');
  } catch (refusal) {
    part('trouble-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
    crumbs();
    show('trouble');
  }
  ready();
}

/**
 * A key nobody can guess: 32 digits, base sixteen. The browser's own
 * maker of such keys, crypto.randomUUID, is there only at an address the
 * browser holds for secure, https or this machine; a server on an
 * office network may answer over plain http, and the page must load
 * there too.
 */
function newKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
