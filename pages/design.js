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
import {
  TYPES,
  addMove,
  addState,
  addVariable,
  asRangeEnd,
  kindLine,
  linesOf,
  marksOf,
  moveVariable,
  outline,
  placesOut,
  removeMove,
  removeState,
  removeVariable,
  rightsIn,
  rulesAbout,
  sectionOfVariable,
  sectionsOf,
  setClassWord,
  setComputed,
  setFinal,
  setInitial,
  setLine,
  setMoveWho,
  setMoveWord,
  setStateWord,
  setWord,
  starter,
  statesOf,
  waysIn,
  waysOut,
} from './class.js';
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
/** The variable whose properties the side of the page shows, or '' when it shows a state or the whole class. */
let variable = '';
/** The transition the side of the page shows, by its place in the list of the class, or -1. */
let move = -1;
/** Whether the person may change a class: a designer. */
let designer = false;
/**
 * What was typed into a field at the side and is not in the class yet:
 * a field gives its text when the cursor leaves it. Before the page
 * draws the side again or reads the text, it takes this first, so that
 * nothing typed is lost whatever is pressed next.
 *
 * @type {(() => void) | null}
 */
let pending = null;

/** Takes into the class what was typed and not given yet. */
function flush() {
  const take = pending;
  pending = null;
  if (take) take();
}
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
 * True while the page holds a class that is not made yet: the server
 * has none of this name, `saved` is what the page began it as, and
 * saving makes the class.
 */
let making = asked.has('new');

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
  if (!making && held.name) {
    address.searchParams.delete('new');
    address.searchParams.set('class', held.name);
  }
  if (chosen && !variable) address.searchParams.set('state', chosen);
  else address.searchParams.delete('state');
  if (variable) address.searchParams.set('variable', variable);
  else address.searchParams.delete('variable');
  if (move >= 0 && !variable) address.searchParams.set('move', String(move));
  else address.searchParams.delete('move');
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
  const it = definition.variables?.[name];
  const row = make('li', 'var');
  row.dataset.variable = name;
  // A designer chooses a variable by its head, to change it at the side.
  const head = make(designer && it ? 'button' : 'div', designer && it ? 'var-head var-pick' : 'var-head');
  if (designer && it) {
    head.setAttribute('type', 'button');
    head.setAttribute('aria-pressed', String(name === variable));
    head.addEventListener('click', () => choose(name));
  }
  head.append(make('code', 'var-name', name));
  if (!it) {
    // A section may name a variable the class does not have; the
    // server says so when the class is checked.
    head.append(make('span', 'var-kind', 'not a variable of this class'));
    row.append(head);
    return row;
  }
  if (it.label) head.append(make('span', 'var-label', String(it.label)));
  row.append(head, make('p', 'var-kind', kindLine(it)));
  if (it.description) row.append(make('p', 'var-about', String(it.description)));
  const marks = marksOf(it);
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
  if (designer && editable()) {
    const add = adder(section.name ? `Add a variable to ${section.label}` : 'Add a variable', 'The name of the new variable', 'its name, such as paid_on', (name) => addNamed(name, section.name));
    add.dataset.adds = section.name;
    box.append(add);
  }
  for (const inner of section.parts) box.append(sectionOf(inner, level + 1, sectioned));
  return box;
}

/** Whether the lists may change the class: the text has to be one they can read. */
const editable = () => Boolean(editor) && read() !== null;

/**
 * A way to add something that has a name: a button that becomes a
 * small form asking for the name.
 *
 * @param {string} words what the button says
 * @param {string} asks what the field is, for a screen reader
 * @param {string} hint what the field shows while it is empty
 * @param {(name: string) => Promise<string>} add adds it; answers why not, or '' when it was added
 */
function adder(words, asks, hint, add) {
  const box = make('div', 'adder');
  const open = make('button', 'button button-plain button-small', words);
  open.setAttribute('type', 'button');
  open.addEventListener('click', () => {
    const form = make('form', 'adder-form');
    form.setAttribute('novalidate', '');
    const name = /** @type {HTMLInputElement} */ (make('input', 'input'));
    name.setAttribute('aria-label', asks);
    name.setAttribute('placeholder', hint);
    name.setAttribute('autocomplete', 'off');
    name.setAttribute('autocapitalize', 'off');
    name.setAttribute('spellcheck', 'false');
    const go = make('button', 'button button-small', 'Add');
    go.setAttribute('type', 'submit');
    const cancel = make('button', 'button button-plain button-small', 'Cancel');
    cancel.setAttribute('type', 'button');
    const why = make('p', 'field-why');
    why.setAttribute('role', 'alert');
    cancel.addEventListener('click', () => box.replaceChildren(open));
    form.addEventListener('submit', async (sent) => {
      sent.preventDefault();
      why.textContent = await add(name.value.trim());
    });
    form.append(name, go, cancel);
    box.replaceChildren(form, why);
    name.focus();
  });
  box.append(open);
  return box;
}

/**
 * Whether the server would refuse a class for what was just added to
 * it, and in which words. Whether a name may be a name is the server's
 * to say.
 *
 * @param {Record<string, any>} draft the class with the new thing in it
 * @param {string} place where the new thing is, as a JSON pointer
 * @returns {Promise<string>} the server's words, or '' when it takes it
 */
async function refusedAt(draft, place) {
  try {
    const { diagnostics } = await call('validate_class', { definition: draft });
    /** @type {import('./fado.js').Finding[]} */
    const findings = Array.isArray(diagnostics) ? diagnostics : [];
    const about = findings.find((f) => f.note !== true && (f.path === place || f.path.startsWith(`${place}/`)));
    return about ? `The server would not take it: ${about.message}.` : '';
  } catch (refusal) {
    return `The server said: ${refusal instanceof Error ? refusal.message : String(refusal)}`;
  }
}

/**
 * Adds a variable of a name, where the name may be one, and opens it
 * at the side.
 *
 * @param {string} name
 * @param {string} section
 * @returns {Promise<string>} why not, or '' when it was added
 */
async function addNamed(name, section) {
  flush();
  if (!name) return 'Give the variable a name.';
  const draft = read();
  if (!draft) return 'The text cannot be read as a class just now. Put it right first.';
  const taken = Object.keys(draft.variables ?? {}).find((one) => one.toLowerCase() === name.toLowerCase());
  if (taken) return `${taken} is a variable of this class already.`;
  addVariable(draft, name, section);
  const why = await refusedAt(draft, `/variables/${name}`);
  if (why) return why;
  change((it) => addVariable(it, name, section));
  variable = name;
  move = -1;
  remember();
  drawVariables();
  drawStates();
  drawAbout();
  part('v-label').focus();
  return '';
}

/**
 * Chooses a variable: the side of the page shows its properties.
 *
 * @param {string} name
 */
function choose(name) {
  flush();
  variable = name;
  move = -1;
  remember();
  for (const head of document.querySelectorAll('#variables .var-pick')) {
    head.setAttribute('aria-pressed', String(head.closest('.var')?.getAttribute('data-variable') === name));
  }
  drawStates();
  drawAbout();
  showSide();
}

/**
 * Brings the card of what was just chosen into view, at its top. In a
 * wide window the card stays beside the lists and scrolls by itself;
 * in a narrow one it lies below them.
 */
function showSide() {
  const card = part('about-card');
  card.scrollTop = 0;
  if (matchMedia('(max-width: 900px)').matches) card.scrollIntoView({ block: 'start' });
}

/**
 * Changes the class through the lists: the text is read, changed and
 * written again, as one step that Undo takes back. Nothing is the
 * server's until the designer saves.
 *
 * @param {(draft: Record<string, any>) => void} how
 * @returns {boolean} false when the text cannot be read as a class
 */
function change(how) {
  const draft = read();
  if (!draft) return false;
  const before = JSON.stringify(draft);
  how(draft);
  definition = draft;
  // What changes nothing is no step for Undo to take back.
  if (JSON.stringify(draft) !== before) editor.set(written(draft));
  return true;
}

/**
 * Draws one row of the list of variables again, in its place: the rows
 * beside it stay as they are, so that a press on one of them, made
 * while a field at the side still held the cursor, is not lost.
 *
 * @param {string} name
 */
function redrawRow(name) {
  for (const row of document.querySelectorAll('#variables .var')) {
    if (row.getAttribute('data-variable') === name) row.replaceWith(variableRow(name));
  }
}

function drawVariables() {
  const box = part('variables');
  box.replaceChildren();
  const parts = outline(definition);
  const sectioned = parts.some((p) => p.name !== '');
  const none = Object.keys(definition.variables ?? {}).length === 0;
  if (none) box.append(make('p', 'card-about', 'This class has no variable.'));
  for (const section of parts) box.append(sectionOf(section, 3, sectioned));
  part('variables-about').textContent = designer
    ? 'What each document holds, by the sections of the class. Choose a variable to change it at the side. fx marks what the class works out.'
    : 'What each document holds, by the sections of the class. fx marks what the class works out.';
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
  button.setAttribute('aria-pressed', String(!variable && state === chosen));
  button.append(make('span', 'pick-label', label));
  if (name) button.append(make('code', 'pick-name', name));
  for (const mark of marks) button.append(make('span', 'tag', mark));
  button.addEventListener('click', () => {
    flush();
    chosen = state;
    variable = '';
    move = -1;
    remember();
    for (const head of document.querySelectorAll('#variables .var-pick')) head.setAttribute('aria-pressed', 'false');
    drawStates();
    drawAbout();
    part('about-card').scrollTop = 0;
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
  if (designer && editable()) {
    const add = adder('Add a state', 'The name of the new state', 'its name, such as archived', addStateNamed);
    add.dataset.addsState = '';
    box.append(add);
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
  if (designer && editable()) {
    // A designer changes the class's own words and its four lines here.
    /** @param {string} word @param {string} value */
    const set = (word, value) => void change((draft) => setClassWord(draft, word, value));
    const words = make('div', 'props');
    words.append(
      field('c-label', 'Label', typed(definition.label, (t) => set('label', t.trim())), 'What people call one document of the class.'),
      field('c-plural', 'Label for many', typed(definition.plural, (t) => set('plural', t.trim())), 'What a list of them is called. Empty: the label.'),
      field('c-description', 'What it is for', typed(definition.description, (t) => set('description', t.trim()), { lines: 2 }), 'For the people who work with it, and for an agent that reads the class.'),
      field('c-title', 'The title of a document', typed(definition.title, (t) => set('title', t), { mono: true }), 'A formula that names each document: what, or "Invoice " & number. Empty: its id.'),
    );
    box.append(words);
    const who = block('Who may', 'Each is a formula: INGROUP("everyone"), CREATEDBY() = USER(), FALSE. An empty line lets nobody through.');
    const lines = make('div', 'props');
    for (const { line: name, what, formula } of linesOf(definition)) {
      lines.append(field(`c-${name}`, what, typed(formula ?? '', (t) => void change((draft) => setLine(draft, name, t.trim())), { mono: true })));
    }
    who.append(lines);
    box.append(who);
  } else {
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
  const changing = designer && editable();
  part('about-title').textContent = state.label;
  part('about-what').textContent = changing ? 'A state of the class. What you change here goes into the text at once. Nothing is the server\'s until you save.' : state.description;

  if (changing) {
    const props = make('div', 'props');
    const named = make('div', 'field');
    named.append(make('p', 'field-label', 'Name'), make('code', 'var-name', state.name), make('p', 'field-about', 'A state keeps its name: a document is in it by its name.'));
    props.append(named);
    props.append(
      field(
        's-label',
        'Label',
        typed(definition.states?.labels?.[state.name], (t) => {
          change((draft) => setStateWord(draft, state.name, 'label', t.trim()));
          redrawPick(state.name);
          part('about-title').textContent = statesOf(definition).find((one) => one.name === state.name)?.label ?? state.name;
        }),
        'What a person reads in place of the name.',
      ),
      field('s-description', 'What a document waits for here', typed(state.description, (t) => void change((draft) => setStateWord(draft, state.name, 'description', t.trim())), { lines: 2 }), 'For the people who see a document in this state, and for an agent.'),
    );
    const starts = make('div', 'field');
    if (state.initial) {
      starts.append(make('p', 'field-about starts-here', 'A new document starts here.'));
    } else {
      const here = make('button', 'button button-plain button-small', 'Start new documents here');
      here.id = 's-initial';
      here.setAttribute('type', 'button');
      here.addEventListener('click', () => {
        change((draft) => setInitial(draft, state.name));
        drawStates();
        drawAbout();
      });
      starts.append(here);
    }
    props.append(starts);
    props.append(
      tick(
        's-final',
        'Final',
        state.final,
        (on) => {
          change((draft) => setFinal(draft, state.name, on));
          redrawPick(state.name);
        },
        'A document that reaches a final state is finished: its values change no more.',
      ),
    );
    box.append(props);
  }

  const ways = waysOut(definition, state.name);
  const places = placesOut(definition, state.name);
  const out = block('Ways out of this state', changing ? 'Each is a transition. Choose one to change it.' : '');
  out.id = 'ways-out';
  if (ways.length === 0) {
    out.append(make('p', 'card-about', state.final ? 'None. This state is final: a document that reaches it is finished and changes no more.' : 'None: a document that reaches this state stays in it.'));
  }
  ways.forEach((way, n) => {
    const one = make('div', 'way');
    one.dataset.transition = way.name;
    const head = make(changing ? 'button' : 'p', changing ? 'way-head way-pick' : 'way-head');
    if (changing) {
      head.setAttribute('type', 'button');
      head.addEventListener('click', () => {
        flush();
        move = places[n];
        remember();
        drawAbout();
      });
    }
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
  });
  if (changing) {
    const add = adder('Add a way out', 'The name of the new transition', 'its name, such as send_back', (name) => addMoveNamed(name, state.name));
    add.dataset.addsMove = state.name;
    out.append(add);
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

  if (changing) {
    const remove = make('button', 'button button-plain', 'Remove this state');
    remove.id = 's-remove';
    remove.setAttribute('type', 'button');
    remove.addEventListener('click', () => {
      change((draft) => removeState(draft, state.name));
      chosen = '';
      remember();
      drawStates();
      drawAbout();
      part('said').textContent = `Removed the state ${state.name} from the text. Check says which transitions still name it; Undo puts it back.`;
    });
    const last = block('', '');
    last.append(remove, make('p', 'field-about', 'Its label, its description and the rights written for it go with it. A transition that leaves it or leads to it stays, for you to say where it goes now.'));
    box.append(last);
  }
}

/**
 * Draws one state of the list of states again, in its place, so that
 * a press on another, made while a field at the side still held the
 * cursor, is not lost.
 *
 * @param {string} name
 */
function redrawPick(name) {
  const state = statesOf(definition).find((one) => one.name === name);
  if (!state) return;
  /** @type {string[]} */
  const marks = [];
  if (state.initial) marks.push('a new document starts here');
  if (state.final) marks.push('final');
  for (const button of document.querySelectorAll('#states .pick')) {
    if (button.getAttribute('data-state') === name) button.replaceWith(pick(state.name, state.label, state.name, marks));
  }
}

/**
 * Adds a state of a name, where the name may be one, and opens it at
 * the side.
 *
 * @param {string} name
 * @returns {Promise<string>} why not, or '' when it was added
 */
async function addStateNamed(name) {
  flush();
  if (!name) return 'Give the state a name.';
  const draft = read();
  if (!draft) return 'The text cannot be read as a class just now. Put it right first.';
  const taken = statesOf(draft).find((one) => one.name.toLowerCase() === name.toLowerCase());
  if (taken) return `${taken.name} is a state of this class already.`;
  addState(draft, name);
  const why = await refusedAt(draft, `/states/list/${statesOf(draft).length - 1}`);
  if (why) return why;
  change((it) => addState(it, name));
  chosen = name;
  variable = '';
  move = -1;
  remember();
  for (const head of document.querySelectorAll('#variables .var-pick')) head.setAttribute('aria-pressed', 'false');
  drawStates();
  drawAbout();
  part('s-label').focus();
  return '';
}

/**
 * Adds a way out of a state, a transition of a name, and opens it at
 * the side. It leads to the next state of the class, for the designer
 * to change; out of a final state it leads back into that state, since
 * a final state is left only for a final one.
 *
 * @param {string} name
 * @param {string} from the state it leaves
 * @returns {Promise<string>} why not, or '' when it was added
 */
async function addMoveNamed(name, from) {
  flush();
  if (!name) return 'Give the transition a name.';
  const draft = read();
  if (!draft) return 'The text cannot be read as a class just now. Put it right first.';
  /** @type {any[]} */
  const all = Array.isArray(draft.transitions) ? draft.transitions : [];
  const taken = all.find((one) => String(one?.name ?? '').toLowerCase() === name.toLowerCase());
  if (taken) return `${taken.name} is a transition of this class already.`;
  const states = statesOf(draft);
  const here = states.findIndex((one) => one.name === from);
  const to = states[here]?.final ? from : (states[here + 1] ?? states.find((one) => one.name !== from) ?? states[here])?.name ?? from;
  const at = addMove(draft, name, from, to);
  const why = await refusedAt(draft, `/transitions/${at}`);
  if (why) return why;
  change((it) => void addMove(it, name, from, to));
  move = at;
  remember();
  drawAbout();
  part('m-label').focus();
  return '';
}

/**
 * The properties of a transition, as fields. It is told by its place
 * in the list of the class.
 *
 * @param {number} at
 */
function drawMove(at) {
  const it = definition.transitions[at];
  const box = part('about');
  const states = statesOf(definition);
  const from = Array.isArray(it.from) ? it.from.map(String) : [String(it.from ?? '')];
  /** @param {string} name */
  const labelOf = (name) => states.find((one) => one.name === name)?.label ?? name;
  part('about-title').textContent = String(it.label || it.name || 'A transition with no name');
  part('about-what').textContent = `A transition: a way out of ${from.map(labelOf).join(' and ')}. What you change here goes into the text at once. Nothing is the server's until you save.`;

  const back = make('button', 'button button-plain button-small', `Back to ${labelOf(chosen && from.includes(chosen) ? chosen : from[0])}`);
  back.id = 'm-back';
  back.setAttribute('type', 'button');
  back.addEventListener('click', () => {
    flush();
    if (!from.includes(chosen)) chosen = from[0];
    move = -1;
    remember();
    drawStates();
    drawAbout();
  });

  /**
   * @param {string} word
   * @param {unknown} value
   * @param {boolean} [again] whether the side changes with it
   */
  const set = (word, value, again = false) => {
    change((draft) => setMoveWord(draft, at, word, value));
    if (word === 'label') part('about-title').textContent = String(definition.transitions[at]?.label || it.name || 'A transition with no name');
    if (again) drawAbout();
  };
  /**
   * A choice among the states of the class.
   *
   * @param {string} now
   * @param {(state: string) => void} then
   */
  const stateChoice = (now, then) => {
    const select = /** @type {HTMLSelectElement} */ (make('select', 'input'));
    for (const one of states) {
      const option = /** @type {HTMLOptionElement} */ (make('option', '', one.label));
      option.value = one.name;
      option.selected = one.name === now;
      select.append(option);
    }
    if (!states.some((one) => one.name === now)) {
      // What the text names and the class does not have is shown as it is written.
      const option = /** @type {HTMLOptionElement} */ (make('option', '', `${now} (not a state of this class)`));
      option.value = now;
      option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => then(select.value));
    return select;
  };

  const props = make('div', 'props');
  const top = make('div', 'field');
  top.append(back);
  props.append(top);
  const named = make('div', 'field');
  named.append(
    make('p', 'field-label', 'Name'),
    make('code', 'var-name', it.name === undefined ? '(none)' : String(it.name)),
    make('p', 'field-about', it.name === undefined ? 'It has no name: the engine makes this move by itself when its condition holds.' : 'A transition keeps its name: the history tells each move by it.'),
  );
  props.append(named);
  props.append(field('m-label', 'Label', typed(it.label, (t) => set('label', t.trim())), 'The caption of its button.'));
  if (from.length === 1) {
    props.append(
      field(
        'm-from',
        'Leaves',
        stateChoice(from[0], (state) => {
          change((draft) => setMoveWord(draft, at, 'from', state));
          chosen = state;
          remember();
          drawStates();
          drawAbout();
        }),
        'The state it is a way out of.',
      ),
    );
  } else {
    const several = make('div', 'field');
    several.id = 'm-from-several';
    several.append(make('p', 'field-label', 'Leaves'), make('p', '', from.map(labelOf).join(', ')), make('p', 'field-about', 'It leaves several states. That list is changed in the text.'));
    props.append(several);
  }
  props.append(field('m-to', 'Leads to', stateChoice(String(it.to ?? ''), (state) => set('to', state, true)), 'The state a document is in afterwards.'));
  props.append(field('m-description', 'What taking it means', typed(it.description, (t) => set('description', t.trim()), { lines: 2 }), 'For the person who presses the button, and for an agent.'));
  if (it.name !== undefined) {
    props.append(
      field(
        'm-who',
        'Who may take it',
        typed(definition.access?.transition?.[it.name], (t) => void change((draft) => setMoveWho(draft, at, t.trim())), { mono: true }),
        'A formula asked for the person and the document: CREATEDBY() = USER(), INGROUP("accountants"). Empty: whoever may change the document.',
      ),
    );
  }
  props.append(field('m-guard', 'Only when', typed(it.guard, (t) => set('guard', t), { mono: true }), 'A condition about the document: total > 0. Empty: always.'));
  props.append(field('m-after', 'By itself, after', typed(it.after, (t) => set('after', t.trim()), { mono: true }), 'So long after the document entered the state: 30d, 12h, 90m. Empty: only when somebody takes it.'));
  props.append(field('m-at', 'By itself, at', typed(it.at, (t) => set('at', t), { mono: true }), 'At a day or a moment the document holds: ADDDAYS(bought_on, 60). Empty: not by a date.'));

  const remove = make('button', 'button button-plain', 'Remove this transition');
  remove.id = 'm-remove';
  remove.setAttribute('type', 'button');
  remove.addEventListener('click', () => {
    change((draft) => removeMove(draft, at));
    if (!from.includes(chosen)) chosen = from[0];
    move = -1;
    remember();
    drawStates();
    drawAbout();
    part('said').textContent = `Removed the transition ${it.name ?? 'with no name'} from the text, with the line that says who may take it. Undo puts it back.`;
  });
  const last = make('div', 'field');
  last.append(remove);
  props.append(last);
  box.append(props);
}

/**
 * A field of the side: a label, the control, and a line of help.
 *
 * @param {string} id the id of the control
 * @param {string} label
 * @param {HTMLElement} control
 * @param {string} [help]
 */
function field(id, label, control, help = '') {
  const box = make('div', 'field');
  control.id = id;
  const head = make('p', 'field-label');
  const words = make('label', '', label);
  words.setAttribute('for', id);
  head.append(words);
  box.append(head, control);
  if (help) {
    const about = make('p', 'field-about', help);
    about.id = `${id}-about`;
    control.setAttribute('aria-describedby', about.id);
    box.append(about);
  }
  return box;
}

/**
 * A box to tick, with its words beside it.
 *
 * @param {string} id
 * @param {string} label
 * @param {boolean} ticked
 * @param {(ticked: boolean) => void} then
 * @param {string} [help]
 */
function tick(id, label, ticked, then, help = '') {
  const box = make('div', 'field tick');
  const control = /** @type {HTMLInputElement} */ (make('input', 'check'));
  control.type = 'checkbox';
  control.id = id;
  control.checked = ticked;
  control.addEventListener('change', () => then(control.checked));
  const words = make('label', 'tick-label', label);
  words.setAttribute('for', id);
  box.append(control, words);
  if (help) box.append(make('p', 'field-about', help));
  return box;
}

/**
 * A line of text to type in. What is typed goes into the class when
 * the field is left or Enter is pressed, as one step.
 *
 * @param {unknown} value
 * @param {(typed: string) => void} then
 * @param {{ mono?: boolean, lines?: number }} [how]
 */
function typed(value, then, { mono = false, lines = 1 } = {}) {
  const control = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (make(lines > 1 ? 'textarea' : 'input', mono ? 'input input-mono' : 'input'));
  if (lines > 1) control.setAttribute('rows', String(lines));
  control.value = value === undefined || value === null ? '' : String(value);
  control.setAttribute('autocomplete', 'off');
  control.setAttribute('spellcheck', mono ? 'false' : 'true');
  control.addEventListener('input', () => {
    pending = () => then(control.value);
  });
  control.addEventListener('change', () => {
    pending = null;
    then(control.value);
  });
  return control;
}

/**
 * The properties of a variable, as fields. What a designer changes
 * here goes into the text of the class at once.
 *
 * @param {string} name
 */
function drawVariable(name) {
  const it = definition.variables[name];
  const box = part('about');
  part('about-title').textContent = String(it.label || name);
  part('about-what').textContent = 'A variable of the class. What you change here goes into the text at once. Nothing is the server\'s until you save.';

  /**
   * Sets one word of this variable and draws its row again.
   *
   * @param {string} word
   * @param {unknown} value
   * @param {boolean} [again] whether the fields at the side change with it
   */
  const set = (word, value, again = false) => {
    change((draft) => setWord(draft, name, word, value));
    redrawRow(name);
    if (word === 'label') part('about-title').textContent = String(definition.variables[name]?.label || name);
    if (again) drawAbout();
  };

  const props = make('div', 'props');
  const named = make('div', 'field');
  named.append(make('p', 'field-label', 'Name'), make('code', 'var-name', name), make('p', 'field-about', 'A variable keeps its name: documents hold their values by it, and formulas read it by it.'));
  props.append(named);
  props.append(field('v-label', 'Label', typed(it.label, (t) => set('label', t.trim())), 'What a person reads in place of the name.'));
  props.append(field('v-description', 'What it is for', typed(it.description, (t) => set('description', t.trim()), { lines: 2 }), 'For the person who fills it in, and for an agent that reads the class.'));

  // How it gets its value: people give it, or the class works it out.
  const computed = it.formula !== undefined;
  const how = make('fieldset', 'field how');
  how.append(make('legend', 'field-label', 'How it gets its value'));
  for (const [id, words, value] of /** @type {[string, string, boolean][]} */ ([
    ['v-given', 'People give it', false],
    ['v-computed', 'The class works it out, by a formula', true],
  ])) {
    const one = make('div', 'tick');
    const radio = /** @type {HTMLInputElement} */ (make('input', 'check'));
    radio.type = 'radio';
    radio.name = 'v-how';
    radio.id = id;
    radio.checked = computed === value;
    radio.addEventListener('change', () => {
      change((draft) => setComputed(draft, name, value));
      redrawRow(name);
      drawAbout();
    });
    const label = make('label', 'tick-label', words);
    label.setAttribute('for', id);
    one.append(radio, label);
    how.append(one);
  }
  props.append(how);

  const type = String(it.type ?? '');
  if (computed) {
    props.append(field('v-formula', 'Formula', typed(it.formula, (t) => set('formula', t), { mono: true }), 'As in a spreadsheet: net + vat, ROUND(net * vat_rate, 2). Check says where a formula is wrong. The formula editor comes next.'));
  } else {
    if (TYPES.includes(type) || type === '') {
      const select = /** @type {HTMLSelectElement} */ (make('select', 'input'));
      for (const one of TYPES) {
        const option = /** @type {HTMLOptionElement} */ (make('option', '', one));
        option.value = one;
        option.selected = one === type;
        select.append(option);
      }
      select.addEventListener('change', () => set('type', select.value, true));
      props.append(field('v-type', 'Type', select, 'What kind of value it holds.'));
    } else {
      const other = make('div', 'field');
      other.id = 'v-type-other';
      other.append(make('p', 'field-label', 'Type'), make('code', 'var-name', kindLine({ type: it.type, class: it.class, schema: it.schema })), make('p', 'field-about', 'A type of this kind is changed in the text.'));
      props.append(other);
    }
    props.append(tick('v-required', 'Required', it.required === true, (on) => set('required', on), 'A document without a value for it is refused.'));
    props.append(field('v-default', 'First value', typed(it.default, (t) => set('default', t), { mono: true }), 'A formula for what a new document gets when nobody gives a value: TODAY(), 0.23, "PLN".'));
    if (type === 'text') {
      props.append(
        field(
          'v-values',
          'One of',
          typed(Array.isArray(it.values) ? it.values.join(', ') : '', (t) =>
            set(
              'values',
              t
                .split(',')
                .map((one) => one.trim())
                .filter(Boolean),
            ),
          ),
          'The values it may take, with commas between: low, normal, high. Empty for any text.',
        ),
      );
    }
    if (['number', 'int', 'decimal', 'money'].includes(type)) {
      const range = make('div', 'pair');
      range.append(
        field('v-min', 'At least', typed(it.min, (t) => set('min', asRangeEnd(t, type)), { mono: true })),
        field('v-max', 'At most', typed(it.max, (t) => set('max', asRangeEnd(t, type)), { mono: true })),
      );
      props.append(range);
    }
    if (type === 'decimal' || type === 'money') {
      props.append(field('v-scale', 'Decimal places', typed(it.scale, (t) => set('scale', /^\d+$/.test(t.trim()) ? Number(t.trim()) : t.trim()), { mono: true }), 'Two when left empty.'));
    }
  }
  props.append(tick('v-list', 'Shown in The List', it.list === true, (on) => set('list', on), 'The List of the class may show it as a column.'));
  if (computed || ['number', 'int', 'decimal', 'money', 'date', 'datetime'].includes(type)) {
    props.append(field('v-format', 'Shown as', typed(it.format, (t) => set('format', t.trim()), { mono: true }), 'An Excel pattern: #,##0.00 for an amount, 0% for a rate, d mmm yyyy for a day.'));
  }

  const sections = sectionsOf(definition);
  if (sections.length > 0) {
    const select = /** @type {HTMLSelectElement} */ (make('select', 'input'));
    const at = sectionOfVariable(definition, name);
    for (const one of [{ name: '', label: 'In no section', depth: 0 }, ...sections]) {
      const option = /** @type {HTMLOptionElement} */ (make('option', '', `${'  '.repeat(one.depth)}${one.label}`));
      option.value = one.name;
      option.selected = one.name === at;
      select.append(option);
    }
    select.addEventListener('change', () => {
      change((draft) => moveVariable(draft, name, select.value));
      drawVariables();
    });
    props.append(field('v-section', 'Section', select, 'Which part of the document it belongs to. It goes to the end of that part.'));
  }

  const remove = make('button', 'button button-plain', 'Remove this variable');
  remove.id = 'v-remove';
  remove.setAttribute('type', 'button');
  remove.addEventListener('click', () => {
    change((draft) => removeVariable(draft, name));
    variable = '';
    move = -1;
    remember();
    drawVariables();
    drawStates();
    drawAbout();
    part('said').textContent = `Removed ${name} from the text. Check says what still reads it; Undo puts it back.`;
  });
  const last = make('div', 'field');
  last.append(remove, make('p', 'field-about', 'It leaves the class at the next save. A formula or a right that still reads it is for the check to find.'));
  props.append(last);
  box.append(props);
}

function drawAbout() {
  flush();
  part('about').replaceChildren();
  if (variable && designer && editable() && definition.variables?.[variable]) return drawVariable(variable);
  if (move >= 0 && designer && editable() && definition.transitions?.[move]) return drawMove(move);
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
  part('class-about').textContent = String(saved.description || '');
  const toList = part('to-list');
  if (making) {
    // The server has no such class yet: there is no version and no list.
    part('class-version').textContent = 'not made yet';
    toList.textContent = 'A new class';
    toList.removeAttribute('href');
    part('class-defined').textContent = '';
    return;
  }
  part('class-version').textContent = `version ${held.version}`;
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
  if (variable && !definition.variables?.[variable]) variable = '';
  if (move >= 0 && !definition.transitions?.[move]) move = -1;
  drawVariables();
  drawStates();
  drawAbout();
}

function drawShownAs() {
  flush();
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
  // A class that is not made yet says so in place of its version.
  part('class-changed').hidden = making || !changed;
  /** @type {HTMLButtonElement} */ (part('discard')).disabled = !changed;
  /** @type {HTMLButtonElement} */ (part('save')).disabled = !making && !changed;
  say(part('save'), making ? 'Make the class' : changed ? `Save as version ${held.version + 1}` : 'Save');
  if (found) part('findings-hint').textContent = 'The text has changed since. Check again.';
}

/**
 * Writes the words of an element, and leaves it alone when they are
 * its words already.
 *
 * This runs while a press of the mouse is under way: a field at the
 * side gives its text when the cursor leaves it, which a press on a
 * button makes it do. A button whose words are written again between
 * the press and the release is, to WebKit, no longer the button that
 * was pressed, and the press is lost: a designer in Safari would type
 * in a field, press Save, and see nothing happen.
 *
 * @param {HTMLElement} element
 * @param {string} words
 */
function say(element, words) {
  if (element.textContent !== words) element.textContent = words;
}

/** Takes what was found off the page. */
function clearFindings() {
  found = false;
  part('findings-box').hidden = true;
  part('findings').replaceChildren();
  part('notes').replaceChildren();
  part('findings-hint').textContent = '';
  editor.mark([]);
}

/**
 * Puts what was found on the page, each finding a way to its place in
 * the text, and marks the places in the text.
 *
 * The server finds two kinds of thing. Some refuse the class. The
 * others are notes, such as a variable that says nothing of what it is
 * for: the class is taken with them. The two are never mixed: a class
 * with notes alone is a class the server takes.
 *
 * @param {string} lead what is said of the findings that refuse the class
 * @param {import('./fado.js').Finding[]} findings
 * @returns {{ refusing: number, notes: number }} how many of each kind
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

  /** @type {import('./text.js').Mark[]} */
  const marks = [];
  /**
   * @param {HTMLElement} list
   * @param {import('./fado.js').Finding[]} these
   */
  const fill = (list, these) => {
    list.replaceChildren();
    for (const finding of these) {
      const place = placeOf(finding);
      if (place) marks.push({ ...place, message: finding.hint ? `${finding.message}. ${finding.hint}` : finding.message, note: finding.note === true });
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
  };
  const refusing = each.filter((f) => f.note !== true);
  const notes = each.filter((f) => f.note === true);
  fill(part('findings'), refusing);
  fill(part('notes'), notes);
  editor.mark(marks);

  const box = part('findings-box');
  box.classList.toggle('alert', refusing.length > 0);
  box.classList.toggle('notes-only', refusing.length === 0);
  part('findings-what').textContent = refusing.length > 0 ? lead : '';
  part('findings-what').hidden = refusing.length === 0;
  const what = part('notes-what');
  what.hidden = notes.length === 0;
  what.textContent = refusing.length > 0 ? 'And the server notes, which holds nothing back:' : 'The server takes this class. It notes, which holds nothing back:';
  part('findings-hint').textContent = '';
  box.hidden = each.length === 0;
  found = each.length > 0;
  return { refusing: refusing.length, notes: notes.length };
}

/**
 * So many things, in words: "one thing", "3 things".
 *
 * @param {number} n
 * @param {string} one
 * @param {string} many
 */
const count = (n, one, many) => (n === 1 ? `one ${one}` : `${n} ${many}`);

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
  flush();
  part('said').textContent = '';
  clearFindings();
  const draft = draftOrSay();
  if (!draft) return void (part('said').textContent = 'Not checked: the text cannot be read.');
  try {
    const { diagnostics } = await call('validate_class', { definition: draft });
    /** @type {import('./fado.js').Finding[]} */
    const findings = Array.isArray(diagnostics) ? diagnostics : [];
    const { refusing, notes } = showFindings('The server would refuse this class.', findings);
    const noted = notes > 0 ? `, with ${count(notes, 'note', 'notes')}` : '';
    part('said').textContent = refusing > 0 ? `Checked: ${count(refusing, 'thing', 'things')} to put right${noted}.` : `Checked: the server takes it${noted}.`;
  } catch (refusal) {
    part('said').textContent = `Not checked. The server said: ${refusal instanceof Error ? refusal.message : String(refusal)}`;
  }
}

/**
 * Makes the class the text describes: the server has none of its name
 * yet. A name the server has is another class, and nothing is put over
 * it from here.
 *
 * @param {Record<string, any>} draft
 */
async function makeClass(draft) {
  const name = String(draft.name ?? '');
  try {
    const taken = await classNamed(name);
    if (taken) {
      showFindings('Not made.', [
        { code: 'duplicate', path: '/name', pos: -1, message: `${taken} is a class on this server already`, hint: 'Give this one another name. That one has a design of its own.' },
      ]);
      return void (part('said').textContent = 'Not made: the server has a class of this name.');
    }
    const { class: made } = await call('define_class', { definition: draft });
    making = false;
    held = made;
    saved = made.definition ?? {};
    remember();
    await drawHeld();
    follow();
    if (shownAs === 'lists') drawLists();
    part('said').textContent = `Made: the class ${String(saved.label || made.name)}, version ${made.version}.`;
  } catch (refusal) {
    if (refusal instanceof Refused && refusal.findings.length > 0) {
      const { refusing } = showFindings('Not made. The server refuses this class.', refusal.findings);
      part('said').textContent = `Not made: ${count(refusing, 'thing', 'things')} to put right.`;
    } else {
      part('said').textContent = `Not made. The server said: ${refusal instanceof Error ? refusal.message : String(refusal)}`;
    }
  }
}

/**
 * The class of the server that a name names, as the server writes it,
 * or '' where it has none. The server takes a name in any case.
 *
 * @param {string} name
 */
async function classNamed(name) {
  const { classes } = await call('list_classes');
  /** @type {string[]} */
  const all = Array.isArray(classes) ? classes : [];
  return all.find((one) => one.toLowerCase() === name.toLowerCase()) ?? '';
}

/** Saves the text as the next version of the class, or makes a class that is not made yet. */
async function save() {
  flush();
  part('said').textContent = '';
  clearFindings();
  const draft = draftOrSay();
  if (!draft) return void (part('said').textContent = `Not ${making ? 'made' : 'saved'}: the text cannot be read.`);
  if (making) return makeClass(draft);
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
      const { refusing } = showFindings('Not saved. The server refuses this class.', refusal.findings);
      part('said').textContent = `Not saved: ${count(refusing, 'thing', 'things')} to put right.`;
    } else {
      part('said').textContent = `Not saved. The server said: ${refusal instanceof Error ? refusal.message : String(refusal)}`;
    }
  }
}

function trouble(/** @type {unknown} */ refusal) {
  part('trouble-why').textContent = refusal instanceof Error ? refusal.message : String(refusal);
  show('trouble');
}

/**
 * Opens the designer on the class the page holds: `held`, `saved` and
 * `making` say which.
 *
 * @param {boolean} mayChange whether the person may change a class
 */
async function open(mayChange) {
  designer = mayChange;
  definition = saved;
  await drawHeld();

  const states = statesOf(definition);
  const wanted = asked.get('state');
  // The page opens on the state a new document starts in, where the
  // flow begins; a class with no states opens on the whole class.
  chosen = wanted !== null && (wanted === '' || states.some((s) => s.name === wanted)) ? wanted : (states.find((s) => s.initial)?.name ?? '');
  const wantedVariable = asked.get('variable') ?? '';
  variable = designer && definition.variables?.[wantedVariable] ? wantedVariable : '';
  const wantedMove = /^\d+$/.test(asked.get('move') ?? '') ? Number(asked.get('move')) : -1;
  move = designer && !variable && definition.transitions?.[wantedMove] ? wantedMove : -1;
  if (move >= 0) {
    // The state at the side of a transition is one it leaves.
    const leaves = [definition.transitions[move].from].flat().map(String);
    if (!leaves.includes(chosen)) chosen = leaves[0] ?? chosen;
  }

  // Changing a class is for a designer: the server refuses anybody else.
  editor = codeView(part('class-text'), { text: written(saved), label: 'The definition of the class', readOnly: !designer, onChange: follow });
  part('design-do').hidden = !designer;
  if (!designer) part('text-about').textContent = 'What an agent writes, and what the server keeps. Changing a class is for a designer.';
  part('check').addEventListener('click', check);
  part('save').addEventListener('click', save);
  part('undo').addEventListener('click', () => {
    flush();
    part('said').textContent = editor.undo() ? 'Taken back.' : 'There is nothing to take back.';
    if (shownAs === 'lists') drawLists();
  });
  part('discard').addEventListener('click', () => {
    pending = null;
    clearFindings();
    editor.set(written(saved));
    if (shownAs === 'lists') drawLists();
    part('said').textContent = making ? 'Put back as it began.' : 'Put back as the server holds it.';
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
}

/**
 * Asks for the name of a new class and begins it: a small class that
 * works, which the designer changes and then makes. Nothing is the
 * server's until then.
 */
function begin() {
  const why = part('begin-why');
  part('begin-form').addEventListener('submit', async (sent) => {
    sent.preventDefault();
    why.textContent = '';
    part('begin-existing-box').hidden = true;
    const name = /** @type {HTMLInputElement} */ (part('new-name')).value.trim();
    const label = /** @type {HTMLInputElement} */ (part('new-label')).value.trim();
    if (!name) return void (why.textContent = 'Give the class a name.');
    try {
      const taken = await classNamed(name);
      if (taken) {
        why.textContent = `${taken} is a class on this server already.`;
        part('begin-existing').setAttribute('href', `design.html?class=${encodeURIComponent(taken)}`);
        part('begin-existing-box').hidden = false;
        return;
      }
      // Whether a name may be a name is the server's to say, in its words.
      const first = starter(name, label);
      const { diagnostics } = await call('validate_class', { definition: first });
      /** @type {import('./fado.js').Finding | undefined} */
      const about = (Array.isArray(diagnostics) ? diagnostics : []).find((/** @type {import('./fado.js').Finding} */ d) => d.path === '/name');
      if (about) return void (why.textContent = `The server would not take this name: ${about.message}.`);
      held = { name, version: 0 };
      saved = first;
      await open(true);
    } catch (refusal) {
      why.textContent = `The server said: ${refusal instanceof Error ? refusal.message : String(refusal)}`;
    }
  });
  show('begin');
  part('new-name').focus();
}

const user = await enter();
if (user) {
  try {
    const mayChange = (user.system_groups ?? []).includes('designers');
    if (making) {
      if (!mayChange) throw new Refused('forbidden', 'Making a class is for a designer.', 0);
      // The text is what a new class is worked on: the page opens there.
      if (!asked.has('as')) shownAs = 'text';
      begin();
    } else {
      if (!className) throw new Refused('unknown_class', 'The address names no class: it ends in design.html?class= and the name of a class.', 0);
      const answer = await call('get_class', { name: className });
      held = answer.class;
      saved = held && /** @type {any} */ (held).definition ? /** @type {any} */ (held).definition : {};
      await open(mayChange);
    }
  } catch (refusal) {
    trouble(refusal);
  }
  ready();
}
