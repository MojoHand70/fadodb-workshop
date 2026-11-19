// One document: what it holds, where it stands, what the person may do
// with it, and what happened to it.
//
// The page draws the document from its class and nothing else (the
// engine's ADR-0069): the sections of the class are its outline, a
// variable in no section belongs to the document as a whole, and every
// label, description and format is the class's own. This is the form
// every class has before anybody designs a face for it.
//
// Which transitions the person may take is the server's answer, not the
// page's guess. A transition that is not this person's to take is left
// out; one whose condition does not hold yet is shown, and says so.
//
// This page reads and moves a document. Changing its values comes next.

import { Refused, call } from './fado.js';
import { show as showValue } from './format.js';
import { enter, make, part, ready, show } from './shell.js';

const person = { locale: navigator.language || 'en', yes: 'Yes', no: 'No' };
const asked = new URLSearchParams(location.search);
const className = asked.get('class') ?? '';
const id = asked.get('id') ?? '';

/** @type {any} */
let definition = {};
/** The type of each calculated variable, which its definition does not say. */
/** @type {Record<string, string>} */
let calculated = {};
/** @type {Map<string, Promise<string>>} */
const names = new Map();

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

/** @param {unknown} moment */
const when = (moment) => showValue(moment, { type: 'datetime' }, person);

/**
 * One variable of the document: its label, its value as the class shows
 * it, and what the class says it is for.
 *
 * @param {string} name
 * @param {any} document
 */
function field(name, document) {
  const variable = definition.variables?.[name] ?? {};
  const box = make('div', 'field');
  box.dataset.variable = name;
  const label = make('dt', 'field-label');
  if (variable.formula) {
    const mark = make('span', 'fx', 'fx');
    mark.setAttribute('title', 'Worked out by the class');
    label.append(mark);
  }
  label.append(String(variable.label || name));
  const shown = showValue(document.values?.[name], { type: variable.type || calculated[name], format: variable.format }, person);
  const value = make('dd', shown === '' ? 'field-value field-empty' : 'field-value', shown === '' ? '—' : shown);
  box.append(label, value);
  if (variable.description) box.append(make('dd', 'field-about', String(variable.description)));
  return box;
}

/**
 * A section of the class and the sections inside it.
 *
 * @param {any} section
 * @param {any} document
 * @param {number} depth 2 for a section of the class, 3 for one inside it
 */
function sectionOf(section, document, depth) {
  const box = make('section', depth === 2 ? 'card' : 'inner');
  if (section.label) box.append(make(depth === 2 ? 'h2' : 'h3', '', String(section.label)));
  if (section.description) box.append(make('p', 'card-about', String(section.description)));
  /** @type {string[]} */
  const variables = section.variables ?? [];
  if (variables.length > 0) {
    const list = make('dl', 'fields');
    for (const name of variables) list.append(field(name, document));
    box.append(list);
  }
  for (const inner of Object.values(section.sections ?? {})) box.append(sectionOf(inner, document, 3));
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

/** @param {any} document */
function drawSections(document) {
  const box = part('sections');
  box.replaceChildren();
  const inSections = held(definition.sections, new Set());
  const loose = Object.keys(definition.variables ?? {}).filter((name) => !inSections.has(name));
  // A variable in no section belongs to the document as a whole.
  if (loose.length > 0) box.append(sectionOf({ variables: loose }, document, 2));
  for (const section of Object.values(definition.sections ?? {})) box.append(sectionOf(section, document, 2));
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
      if (changed.length > 0) did.push(`changed ${changed.map((name) => String(definition.variables[name].label || name)).join(', ')}`);
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
 * The transitions leaving the state, as the server answers them.
 *
 * @param {any[]} transitions
 */
function drawMoves(transitions) {
  const box = part('moves');
  box.replaceChildren();
  let offered = 0;
  for (const move of transitions) {
    // Not this person's to take: it is not their business to see it.
    if (!move.enabled && move.code !== 'guard_false') continue;
    const told = (definition.transitions ?? []).find((/** @type {any} */ t) => t.name === move.name) ?? {};
    const item = make('div', 'move');
    const button = make('button', 'button', String(told.label || move.name));
    button.setAttribute('type', 'button');
    button.dataset.transition = move.name;
    item.append(button);
    if (move.enabled) {
      if (told.description) button.setAttribute('title', String(told.description));
      button.addEventListener('click', () => take(move.name, String(told.label || move.name)));
    } else {
      button.setAttribute('disabled', '');
      item.append(make('p', 'move-why', `Not yet. ${String(told.description || 'Its condition does not hold.')}`));
    }
    box.append(item);
    offered++;
  }
  part('moves-none').hidden = offered > 0;
}

/**
 * Takes a transition, and shows the document as it is afterwards. A
 * refusal is shown in the server's own words, and the document is read
 * again: somebody else may have moved it meanwhile.
 *
 * @param {string} name
 * @param {string} label
 */
async function take(name, label) {
  for (const button of part('moves').querySelectorAll('button')) button.setAttribute('disabled', '');
  part('refused').hidden = true;
  part('said').textContent = '';
  try {
    await call('transition', { class: className, id, transition: name });
    await load();
    part('said').textContent = `Done: ${label}. It is now in ${part('doc-state').textContent}.`;
  } catch (refusal) {
    await load().catch(() => {});
    part('refused-what').textContent = refusal instanceof Error ? refusal.message : String(refusal);
    part('refused-hint').textContent = refusal instanceof Refused ? refusal.hint : '';
    part('refused').hidden = false;
  }
}

/** Reads the document, what may be done with it and its history, and draws them. */
async function load() {
  const [{ document: sent }, { transitions }, { versions }] = await Promise.all([
    call('get', { class: className, id }),
    call('transitions', { class: className, id }),
    call('history', { class: className, id }),
  ]);
  const title = String(sent.title || sent.id);
  document.title = `${title} · FadoDB Workshop`;
  part('doc-title').textContent = title;
  part('doc-state').textContent = stateLabel(sent.state);
  part('doc-state-about').textContent = String(definition.states?.descriptions?.[sent.state] || '');
  drawMoves(transitions ?? []);
  drawSections(sent);
  drawFacts(sent);
  drawHistory(versions ?? []);
  await Promise.all(names.values());
}

if (await enter()) {
  try {
    if (!className || !id) throw new Refused('unknown_document', 'The address names no document: it ends in document.html?class=, the name of a class, &id= and the id of a document.', 0);
    const bundle = await call('get_bundle', { class: className, language: person.locale });
    definition = bundle.definition ?? {};
    calculated = {};
    for (const one of bundle.compiled?.computed ?? []) calculated[one.variable] = one.type;
    const toList = part('to-list');
    toList.textContent = String(definition.label || className);
    toList.setAttribute('href', `list.html?class=${encodeURIComponent(className)}`);
    await load();
    show('document');
  } catch (refusal) {
    part('trouble-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
    show('trouble');
  }
  ready();
}
