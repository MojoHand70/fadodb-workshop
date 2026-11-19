// Design mode for a class: the class as lists, and the same class as
// text.
//
// The lists are the owner's sketch of the designer: the variables, the
// states, and under a state the ways out of it and who may do what
// there. What has no state, who may see, make, change and delete a
// document, is under "The whole class". Every formula is shown whole,
// as the class writes it.
//
// The text is the class itself, as an agent writes it and as the server
// keeps it. A designer changes it there, asks the server to check it,
// and saves it as the next version. The lists are a reading of the
// text as it stands, so they follow it. Nothing is the server's until
// it is saved, and whether a class is right is the server's to say.
//
// The page works on the definition the server holds, the class's own
// words and not a translation: a designer works on what is written.

import { Refused, call } from './fado.js';
import { show as showValue } from './format.js';
import { kindLine, linesOf, marksOf, outline, rightsIn, rulesAbout, statesOf, waysIn, waysOut } from './class.js';
import { enter, make, part, ready, show } from './shell.js';
import { codeView } from './text.js';

const person = { locale: navigator.language || 'en', yes: 'Yes', no: 'No' };
const asked = new URLSearchParams(location.search);
const className = asked.get('class') ?? '';

/** The class as the server holds it: its name, its version, who defined it. */
/** @type {{ name: string, version: number, defined?: { by?: string, at?: unknown } }} */
let held = { name: '', version: 0 };
/** Its definition as the server holds it. */
/** @type {Record<string, any>} */
let saved = {};
/** The definition the lists show: the text as it stands, where it can be read. */
/** @type {Record<string, any>} */
let definition = {};
/** The state whose ways and rights are shown; '' is the whole class. */
let chosen = '';
/** 'lists' or 'text'. */
let shownAs = asked.get('as') === 'text' ? 'text' : 'lists';
/** The text box. */
/** @type {import('./text.js').CodeView} */
let editor;
/** Whether the text differs from what the server holds. */
let changed = false;
/** Whether findings are on the page, and so may be out of date. */
let found = false;
/** A newer version the person was told of, so that saving over it is their choice. */
let toldOf = 0;

/**
 * A formula, shown whole and as it is written.
 *
 * @param {string} formula
 */
const formulaOf = (formula) => make('code', 'formula', formula);

/**
 * A line of two parts: what is asked, and the answer.
 *
 * @param {string} what
 * @param {Node | string} answer
 */
function line(what, answer) {
  const row = make('div', 'line');
  const value = make('dd', 'line-answer');
  value.append(answer);
  row.append(make('dt', 'line-what', what), value);
  return row;
}

/** Keeps what the person chose in the address, so that it can be sent to somebody. */
function remember() {
  const address = new URL(location.href);
  if (chosen) address.searchParams.set('state', chosen);
  else address.searchParams.delete('state');
  if (shownAs === 'text') address.searchParams.set('as', 'text');
  else address.searchParams.delete('as');
  history.replaceState(null, '', address);
}

/**
 * One variable, as a row: its name, its label, its kind in a line, and
 * under them what the class says it is for.
 *
 * @param {string} name
 */
function variableRow(name) {
  const variable = definition.variables?.[name];
  const row = make('li', 'var');
  row.dataset.variable = name;
  const head = make('div', 'var-head');
  head.append(make('code', 'var-name', name));
  if (!variable) {
    // A section may name a variable the class does not have; the
    // server says so when the class is checked.
    head.append(make('span', 'var-kind', 'not a variable of this class'));
    row.append(head);
    return row;
  }
  if (variable.label) head.append(make('span', 'var-label', String(variable.label)));
  row.append(head, make('p', 'var-kind', kindLine(variable)));
  if (variable.description) row.append(make('p', 'var-about', String(variable.description)));
  const marks = marksOf(variable);
  if (marks.length > 0) {
    const tags = make('p', 'tags');
    for (const mark of marks) tags.append(make('span', 'tag', mark));
    row.append(tags);
  }
  return row;
}

/**
 * A part of the outline: a section, its variables, and the sections
 * inside it.
 *
 * @param {import('./class.js').Part} section
 * @param {number} level the level of its heading
 * @param {boolean} sectioned whether the class has sections at all
 */
function sectionOf(section, level, sectioned) {
  const box = make('section', level > 3 ? 'part part-inner' : 'part');
  if (section.name) box.dataset.section = section.name;
  if (section.name) {
    const head = make(`h${Math.min(level, 6)}`, 'part-title', section.label);
    head.append(' ', make('code', 'part-name', section.name));
    box.append(head);
    if (section.description) box.append(make('p', 'part-about', section.description));
  } else if (sectioned) {
    box.append(make(`h${Math.min(level, 6)}`, 'part-title', 'In no section'));
  }
  if (section.variables.length > 0) {
    const list = make('ul', 'vars');
    for (const name of section.variables) list.append(variableRow(name));
    box.append(list);
  }
  for (const inner of section.parts) box.append(sectionOf(inner, level + 1, sectioned));
  return box;
}

function drawVariables() {
  const box = part('variables');
  box.replaceChildren();
  const parts = outline(definition);
  const sectioned = parts.some((p) => p.name !== '');
  const none = Object.keys(definition.variables ?? {}).length === 0;
  if (none) box.append(make('p', 'card-about', 'This class has no variable.'));
  else for (const section of parts) box.append(sectionOf(section, 3, sectioned));
}

/**
 * A button that chooses what the side of the page is about.
 *
 * @param {string} state '' for the whole class
 * @param {string} label
 * @param {string} name
 * @param {string[]} marks
 */
function pick(state, label, name, marks) {
  const button = make('button', 'pick');
  button.setAttribute('type', 'button');
  button.dataset.state = state;
  button.setAttribute('aria-pressed', String(state === chosen));
  button.append(make('span', 'pick-label', label));
  if (name) button.append(make('code', 'pick-name', name));
  for (const mark of marks) button.append(make('span', 'tag', mark));
  button.addEventListener('click', () => {
    chosen = state;
    remember();
    drawStates();
    drawAbout();
  });
  return button;
}

function drawStates() {
  const box = part('states');
  box.replaceChildren(pick('', 'The whole class', '', []));
  const states = statesOf(definition);
  for (const state of states) {
    /** @type {string[]} */
    const marks = [];
    if (state.initial) marks.push('a new document starts here');
    if (state.final) marks.push('final');
    box.append(pick(state.name, state.label, state.name, marks));
  }
  part('states-about').textContent =
    states.length > 0
      ? 'Choose a state to see the ways out of it and who may do what there.'
      : 'This class has no states: it stores no documents. It can still be asked to work its formulas out, as a calculator.';
}

/**
 * A block of the side: a heading and what is under it.
 *
 * @param {string} title
 * @param {string} about
 */
function block(title, about) {
  const box = make('section', 'inner');
  box.append(make('h3', '', title));
  if (about) box.append(make('p', 'card-about', about));
  return box;
}

/**
 * The lines of the rights table under one state, as a block.
 *
 * @param {string} state
 * @param {string} title
 * @param {string} about
 */
function rightsBlock(state, title, about) {
  const rights = rightsIn(definition, state);
  if (rights.length === 0) return null;
  const box = block(title, about);
  box.dataset.rights = state;
  for (const right of rights) {
    const one = make('dl', 'right');
    one.dataset.what = right.what;
    const head = make('p', 'right-what', right.label);
    if (right.what !== '*') head.append(' ', make('code', 'pick-name', right.what));
    if (right.about === 'section') head.append(' ', make('span', 'tag', 'a section'));
    if (right.about === 'unknown') head.append(' ', make('span', 'tag', 'not in this class'));
    box.append(head);
    if (right.write !== null) one.append(line('may set it', formulaOf(right.write)));
    if (right.read !== null) one.append(line('may see it', formulaOf(right.read)));
    box.append(one);
  }
  return box;
}

/**
 * The rules about a state, or about none, as a block.
 *
 * @param {string} state
 * @param {string} title
 */
function rulesBlock(state, title) {
  const rules = rulesAbout(definition, state);
  if (rules.length === 0) return null;
  const box = block(title, 'What the class does by itself.');
  box.dataset.rules = state;
  for (const rule of rules) {
    const one = make('div', 'rule');
    one.append(make('p', 'rule-when', rule.when));
    const lines = make('dl', 'right');
    if (rule.only) lines.append(line('only when', formulaOf(rule.only)));
    for (const does of rule.does) lines.append(line('it does', formulaOf(does)));
    one.append(lines);
    box.append(one);
  }
  return box;
}

/** What holds for the whole class: who may see, make, change and delete a document. */
function drawWholeClass() {
  const box = part('about');
  part('about-title').textContent = 'The whole class';
  part('about-what').textContent = 'What holds in every state: who may do what with a document as a whole. Each line is a formula asked for the person and the document.';
  const who = block('Who may', '');
  const lines = make('dl', 'right');
  for (const { line: name, what, formula } of linesOf(definition)) {
    const row = line(what, formula === null ? make('span', 'nobody', 'nobody: the class leaves this line out') : formulaOf(formula));
    row.dataset.line = name;
    lines.append(row);
  }
  who.append(lines);
  box.append(who);
  if (definition.title) {
    const title = block('The title of a document', 'A formula that names each document.');
    title.append(formulaOf(String(definition.title)));
    box.append(title);
  }
  const rights = rightsBlock('*', 'Single variables, in every state', 'This narrows what the lines above let through, and never widens it. A state that says something of its own comes first.');
  if (rights) box.append(rights);
  const rules = rulesBlock('', 'By itself');
  if (rules) box.append(rules);
}

/**
 * What holds in one state: the ways out of it, and who may do what
 * there.
 *
 * @param {{ name: string, label: string, description: string, initial: boolean, final: boolean }} state
 */
function drawState(state) {
  const box = part('about');
  part('about-title').textContent = state.label;
  part('about-what').textContent = state.description;

  const ways = waysOut(definition, state.name);
  const out = block('Ways out of this state', '');
  out.id = 'ways-out';
  if (ways.length === 0) {
    out.append(make('p', 'card-about', state.final ? 'None. This state is final: a document that reaches it is finished and changes no more.' : 'None: a document that reaches this state stays in it.'));
  }
  for (const way of ways) {
    const one = make('div', 'way');
    one.dataset.transition = way.name;
    const head = make('p', 'way-head');
    head.append(make('span', 'way-label', way.label), ' ');
    if (way.name) head.append(make('code', 'pick-name', way.name), ' ');
    head.append(make('span', 'way-to', `to ${way.toLabel}`));
    one.append(head);
    if (way.description) one.append(make('p', 'var-about', way.description));
    const lines = make('dl', 'right');
    lines.append(line('may take it', way.who === null ? make('span', 'nobody', 'whoever may change the document: the class keeps no line for this move, so its line for changing is asked') : formulaOf(way.who)));
    if (way.guard) lines.append(line('only when', formulaOf(way.guard)));
    if (way.after) lines.append(line('by itself', `${way.after} after the document entered this state`));
    if (way.at) lines.append(line('by itself, at', formulaOf(way.at)));
    one.append(lines);
    out.append(one);
  }
  box.append(out);

  const coming = waysIn(definition, state.name);
  const into = block('Ways into this state', '');
  into.id = 'ways-in';
  if (coming.length === 0) into.append(make('p', 'card-about', state.initial ? 'A new document starts here. No move leads back.' : 'None: no move leads here.'));
  else {
    const list = make('ul', 'plain');
    for (const way of coming) list.append(make('li', '', `${way.label}, from ${way.from.join(' or ')}`));
    if (state.initial) into.append(make('p', 'card-about', 'A new document starts here.'));
    into.append(list);
  }
  box.append(into);

  const here = rightsBlock(state.name, 'Single variables, in this state', 'Who may set and see single variables while a document is here. This narrows what the whole class lets through, and never widens it.');
  if (here) box.append(here);
  const everywhere = rightsBlock('*', 'Single variables, in every state', 'Asked where this state says nothing of its own about a variable.');
  if (everywhere) box.append(everywhere);
  if (!here && !everywhere) {
    const none = block('Single variables', '');
    none.append(make('p', 'card-about', 'The class keeps no line for single variables: whoever may change a document may set every value in it.'));
    box.append(none);
  }
  const rules = rulesBlock(state.name, 'By itself');
  if (rules) box.append(rules);
}

function drawAbout() {
  part('about').replaceChildren();
  const state = statesOf(definition).find((s) => s.name === chosen);
  if (state) drawState(state);
  else drawWholeClass();
}

/**
 * The text of a class as the page writes it.
 *
 * @param {Record<string, any>} it
 */
const written = (it) => JSON.stringify(it, null, 2);

/**
 * The text read as a class, or null where it cannot be: where it is
 * not well-formed JSON, or is no object.
 *
 * @returns {Record<string, any> | null}
 */
function read() {
  try {
    const value = JSON.parse(editor.text());
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The name of a person, for a sentence. Every user may ask the name of
 * another; where the server does not say, the id stands.
 *
 * @param {string} id
 */
const nameOf = (id) =>
  call('get_user', { id }).then(
    (answer) => String(answer?.user?.name || id),
    () => id,
  );

/** Draws the class as the server holds it: its name, its version, who defined it. */
async function drawHeld() {
  const label = String(saved.label || held.name);
  document.title = `Design: ${label} · FadoDB Workshop`;
  part('class-title').textContent = label;
  part('class-name').textContent = held.name;
  part('class-version').textContent = `version ${held.version}`;
  part('class-about').textContent = String(saved.description || '');
  const toList = part('to-list');
  toList.textContent = label;
  toList.setAttribute('href', `list.html?class=${encodeURIComponent(held.name)}`);

  // Who defined this version, by name.
  const by = String(held.defined?.by ?? '');
  const at = held.defined?.at === undefined ? '' : showValue(held.defined.at, { type: 'datetime' }, person);
  part('class-defined').textContent = by ? `Defined by ${await nameOf(by)}${at ? `, ${at}` : ''}` : '';
}

/** Draws the lists from the text as it stands, where it can be read. */
function drawLists() {
  const draft = editor ? read() : saved;
  if (draft) definition = draft;
  part('lists-stale').hidden = draft !== null;
  if (chosen !== '' && !statesOf(definition).some((s) => s.name === chosen)) chosen = '';
  drawVariables();
  drawStates();
  drawAbout();
}

function drawShownAs() {
  part('as-lists').setAttribute('aria-pressed', String(shownAs === 'lists'));
  part('as-text').setAttribute('aria-pressed', String(shownAs === 'text'));
  if (shownAs === 'lists') drawLists();
  part('lists').hidden = shownAs !== 'lists';
  part('text').hidden = shownAs !== 'text';
  if (shownAs === 'text') editor.shown();
}

/** Follows the text: whether it differs from what the server holds, and what may be done about it. */
function follow() {
  const draft = read();
  changed = draft === null || JSON.stringify(draft) !== JSON.stringify(saved);
  part('class-changed').hidden = !changed;
  /** @type {HTMLButtonElement} */ (part('discard')).disabled = !changed;
  /** @type {HTMLButtonElement} */ (part('save')).disabled = !changed;
  part('save').textContent = changed ? `Save as version ${held.version + 1}` : 'Save';
  if (found) part('findings-hint').textContent = 'The text has changed since. Check again.';
}

/** Takes what was found off the page. */
function clearFindings() {
  found = false;
  part('findings-box').hidden = true;
  part('findings').replaceChildren();
  part('findings-hint').textContent = '';
  editor.mark([]);
}

/**
 * Puts what was found on the page: a list, each finding a way to its
 * place in the text, and the places marked in the text.
 *
 * @param {string} lead what is said of them all
 * @param {import('./fado.js').Finding[]} findings
 */
function showFindings(lead, findings) {
  // The server may say one thing twice; once is enough for a person.
  const said = new Set();
  const each = findings.filter((f) => {
    const key = JSON.stringify([f.code, f.path, f.pos, f.message]);
    if (said.has(key)) return false;
    said.add(key);
    return true;
  });
  /** @param {import('./fado.js').Finding} finding */
  const placeOf = (finding) => (finding.code === 'not_json' ? (finding.pos >= 0 ? { from: finding.pos, to: finding.pos + 1 } : null) : finding.path ? editor.placeOf(finding.path, finding.pos) : null);

  const list = part('findings');
  list.replaceChildren();
  /** @type {import('./text.js').Mark[]} */
  const marks = [];
  for (const finding of each) {
    const place = placeOf(finding);
    if (place) marks.push({ ...place, message: finding.hint ? `${finding.message}. ${finding.hint}` : finding.message });
    const item = make('li', 'finding');
    item.dataset.path = finding.path;
    const go = make('button', 'finding-go', finding.message);
    go.setAttribute('type', 'button');
    go.addEventListener('click', () => {
      // The place is looked up again: the text may have changed since.
      const now = placeOf(finding);
      shownAs = 'text';
      remember();
      drawShownAs();
      if (now) editor.show(now.from, now.to);
    });
    item.append(go);
    if (finding.path) item.append(' ', make('code', 'finding-where', finding.path.slice(1).replaceAll('/', ' / ')));
    if (finding.hint) item.append(make('p', 'finding-hint', finding.hint));
    list.append(item);
  }
  editor.mark(marks);
  part('findings-what').textContent = lead;
  part('findings-hint').textContent = '';
  part('findings-box').hidden = false;
  found = true;
}

/**
 * The text read as a class for the server, or, where it cannot be
 * read, null with the place said.
 */
function draftOrSay() {
  const draft = read();
  if (draft) return draft;
  const at = editor.fault();
  showFindings('The text cannot be read as a class.', [
    { code: 'not_json', path: '', pos: at ?? -1, message: at === null ? 'The text is not one JSON object, in braces.' : 'The text stops being well-formed JSON here.', hint: 'A class is one JSON object: names and texts in double quotes, a comma between two members and none after the last.' },
  ]);
  return null;
}

/** Asks the server to check the text. It writes nothing. */
async function check() {
  part('said').textContent = '';
  clearFindings();
  const draft = draftOrSay();
  if (!draft) return void (part('said').textContent = 'Not checked: the text cannot be read.');
  try {
    const { diagnostics } = await call('validate_class', { definition: draft });
    /** @type {import('./fado.js').Finding[]} */
    const findings = Array.isArray(diagnostics) ? diagnostics : [];
    if (findings.length === 0) return void (part('said').textContent = 'Checked: the server takes it.');
    showFindings('The server would refuse this class.', findings);
    part('said').textContent = `Checked: ${part('findings').children.length === 1 ? 'one thing' : `${part('findings').children.length} things`} to put right.`;
  } catch (refusal) {
    part('said').textContent = `Not checked. The server said: ${refusal instanceof Error ? refusal.message : String(refusal)}`;
  }
}

/** Saves the text as the next version of the class. */
async function save() {
  part('said').textContent = '';
  clearFindings();
  const draft = draftOrSay();
  if (!draft) return void (part('said').textContent = 'Not saved: the text cannot be read.');
  if (String(draft.name ?? '') !== held.name) {
    showFindings('Not saved.', [
      { code: 'another_class', path: '/name', pos: -1, message: `This page designs ${held.name}, and the text names ${String(draft.name ?? 'no class')}`, hint: 'A class of another name is another class. Put the name back to save this one.' },
    ]);
    return void (part('said').textContent = 'Not saved: the text names another class.');
  }
  try {
    // Somebody else may have saved since this page read the class.
    const { class: now } = await call('get_class', { name: held.name });
    if (now.version !== held.version && toldOf !== now.version) {
      toldOf = now.version;
      const was = held.version;
      held = now;
      saved = now.definition ?? {};
      await drawHeld();
      follow();
      const who = now.defined?.by ? await nameOf(String(now.defined.by)) : 'Somebody';
      return void (part('said').textContent = `Not saved. ${who} saved version ${now.version} while you worked on version ${was}. Save again to put your text over it as version ${now.version + 1}, or Discard to read theirs.`);
    }
    const { class: made } = await call('define_class', { definition: draft });
    const before = held.version;
    held = made;
    saved = made.definition ?? {};
    await drawHeld();
    follow();
    if (shownAs === 'lists') drawLists();
    part('said').textContent = made.version === before ? 'Nothing to save: the server holds this class already.' : `Saved as version ${made.version}.`;
  } catch (refusal) {
    if (refusal instanceof Refused && refusal.findings.length > 0) {
      showFindings('Not saved. The server refuses this class.', refusal.findings);
      part('said').textContent = `Not saved: ${part('findings').children.length === 1 ? 'one thing' : `${part('findings').children.length} things`} to put right.`;
    } else {
      part('said').textContent = `Not saved. The server said: ${refusal instanceof Error ? refusal.message : String(refusal)}`;
    }
  }
}

function trouble(/** @type {unknown} */ refusal) {
  part('trouble-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
  show('trouble');
}

const user = await enter();
if (user) {
  try {
    if (!className) throw new Refused('unknown_class', 'The address names no class: it ends in design.html?class= and the name of a class.', 0);
    const answer = await call('get_class', { name: className });
    held = answer.class;
    saved = held && /** @type {any} */ (held).definition ? /** @type {any} */ (held).definition : {};
    definition = saved;
    await drawHeld();

    const states = statesOf(definition);
    const wanted = asked.get('state');
    // The page opens on the state a new document starts in, where the
    // flow begins; a class with no states opens on the whole class.
    chosen = wanted !== null && (wanted === '' || states.some((s) => s.name === wanted)) ? wanted : (states.find((s) => s.initial)?.name ?? '');

    // Changing a class is for a designer: the server refuses anybody else.
    const designer = (user.system_groups ?? []).includes('designers');
    editor = codeView(part('class-text'), { text: written(saved), label: 'The definition of the class', readOnly: !designer, onChange: follow });
    part('design-do').hidden = !designer;
    if (!designer) part('text-about').textContent = 'What an agent writes, and what the server keeps. Changing a class is for a designer.';
    part('check').addEventListener('click', check);
    part('save').addEventListener('click', save);
    part('discard').addEventListener('click', () => {
      clearFindings();
      editor.set(written(saved));
      if (shownAs === 'lists') drawLists();
      part('said').textContent = 'Put back as the server holds it.';
    });
    window.addEventListener('beforeunload', (leaving) => {
      if (changed) leaving.preventDefault();
    });

    part('as-lists').addEventListener('click', () => {
      shownAs = 'lists';
      remember();
      drawShownAs();
    });
    part('as-text').addEventListener('click', () => {
      shownAs = 'text';
      remember();
      drawShownAs();
    });
    follow();
    drawShownAs();
    if (shownAs === 'text') drawLists();
    show('design');
  } catch (refusal) {
    trouble(refusal);
  }
  ready();
}
