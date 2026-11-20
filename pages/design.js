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
  actionsOf,
  addMove,
  addReset,
  addRightLine,
  addRule,
  addSection,
  addSet,
  addState,
  addVariable,
  asRangeEnd,
  eventsAt,
  eventsOf,
  homeOfRule,
  inputsOf,
  kindLine,
  linesOf,
  linesToAdd,
  marksOf,
  moveSection,
  moveVariable,
  outline,
  pathOfSection,
  placeOfSection,
  placeOfVariable,
  placesFor,
  placesOut,
  removeAction,
  removeMove,
  removeRightLine,
  removeRule,
  removeSection,
  removeSetValue,
  removeState,
  removeVariable,
  rightsIn,
  ruleAt,
  rulesAt,
  sectionOfVariable,
  sectionWords,
  sectionsOf,
  setClassWord,
  setComputed,
  setFinal,
  setInitial,
  setLine,
  setMoveWho,
  setMoveWord,
  setResetVariables,
  setRight,
  setRuleEvent,
  setRuleIf,
  setRuleVariables,
  setSectionWord,
  setSetFormula,
  setStateWord,
  setWord,
  shiftAction,
  shiftSection,
  shiftVariable,
  starter,
  statesOf,
  waysIn,
  waysOut,
  whereWords,
  whoDecides,
} from './class.js';
import { enter, make, part, ready, show } from './shell.js';
import { callAt, fromBytes, helpFor, pieceAt } from './formula.js';
import { codeView, formulaBox } from './text.js';

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
/** The section whose card the side of the page shows, or '' when it shows something else. */
let shownSection = '';
/** The rule whose card the side of the page shows, by its place in the list of the class, or -1. */
let shownRule = -1;
/** Whether the person may change a class: a designer. */
let designer = false;
/**
 * The functions a formula can call, as the engine tells them with
 * list_functions: empty until the server has answered, and where the
 * server does not know the command.
 *
 * @type {any[]}
 */
let functions = [];
/**
 * What was typed into a field at the side and is not in the class yet:
 * a field gives its text when the cursor leaves it. Before the page
 * draws the side again or reads the text, it takes this first, so that
 * nothing typed is lost whatever is pressed next.
 *
 * @type {(() => void) | null}
 */
let pending = null;

/**
 * True while a press of the mouse, or of a finger, is under way. The
 * bar stands still under a press: see `bar`.
 */
let pressing = false;
document.addEventListener(
  'pointerdown',
  () => {
    pressing = true;
  },
  true,
);
// The press is over when it is released or given up, and for certain
// when a key is pressed or the window is left: a release outside the
// window may never be told to the page.
for (const over of ['pointerup', 'pointercancel', 'keydown']) {
  document.addEventListener(
    over,
    () => {
      if (!pressing) return;
      pressing = false;
      // After whatever the press did: the click comes with the release.
      setTimeout(() => {
        if (editor) bar();
      }, 0);
    },
    true,
  );
}
window.addEventListener('blur', () => {
  if (!pressing) return;
  pressing = false;
  if (editor) bar();
});
// A press that ends where it began is a click: once whatever was
// pressed has done its work, the bar says how things stand.
document.addEventListener('click', () => {
  if (editor) bar();
});

/** Takes into the class what was typed and not given yet. */
function flush() {
  const take = pending;
  pending = null;
  if (!take) return;
  take();
  // What was typed may be what the class held already: the bar follows what is there now.
  bar();
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
  if (chosen && !variable && !shownSection) address.searchParams.set('state', chosen);
  else address.searchParams.delete('state');
  if (shownSection) address.searchParams.set('section', shownSection);
  else address.searchParams.delete('section');
  if (variable) address.searchParams.set('variable', variable);
  else address.searchParams.delete('variable');
  if (move >= 0 && !variable) address.searchParams.set('move', String(move));
  else address.searchParams.delete('move');
  if (shownRule >= 0) address.searchParams.set('rule', String(shownRule));
  else address.searchParams.delete('rule');
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
    const head = make(`h${Math.min(level, 6)}`, 'part-title');
    const words = [make('span', 'part-label', section.label), ' ', make('code', 'part-name', section.name)];
    if (designer && editable()) {
      // A designer chooses a section by its title, as a variable by its row.
      const pick = make('button', 'part-pick');
      pick.setAttribute('type', 'button');
      pick.setAttribute('aria-pressed', String(section.name === shownSection));
      pick.append(...words);
      pick.addEventListener('click', () => chooseSection(section.name));
      head.append(pick);
    } else head.append(...words);
    box.append(head);
    // The line is there even when it is empty, so that filling it in moves nothing else.
    box.append(make('p', 'part-about', section.description));
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
 * A place among neighbours, with two buttons that move it a step
 * earlier or later. A button that has nowhere to move to stays where
 * the keyboard left it, and says so when pressed.
 *
 * @param {string} id 'v' for a variable, 'p' for a section
 * @param {() => { at: number, of: number }} place where it is now
 * @param {() => string} among the words for its neighbours: 'in The purchase', 'at the top'
 * @param {(by: -1 | 1) => void} shift moves it
 * @param {string} help
 */
function placeField(id, place, among, shift, help) {
  const box = make('div', 'field');
  box.id = `${id}-place-field`;
  box.append(make('p', 'field-label', 'Its place'));
  const says = make('p', 'field-value');
  says.id = `${id}-place`;
  says.setAttribute('aria-live', 'polite');
  const row = make('div', 'place-row');
  const earlier = make('button', 'button button-plain button-small', 'Earlier');
  earlier.id = `${id}-earlier`;
  const later = make('button', 'button button-plain button-small', 'Later');
  later.id = `${id}-later`;
  const tell = () => {
    const { at, of } = place();
    says.textContent = `${at} of ${of} ${among()}`;
    earlier.setAttribute('aria-disabled', String(at <= 1));
    later.setAttribute('aria-disabled', String(at >= of));
  };
  for (const [button, by] of /** @type {[HTMLElement, -1 | 1][]} */ ([[earlier, -1], [later, 1]])) {
    button.setAttribute('type', 'button');
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') === 'true') {
        part('said').textContent = by < 0 ? 'It is the first already.' : 'It is the last already.';
        return;
      }
      flush();
      shift(by);
      tell();
      part('said').textContent = '';
    });
  }
  tell();
  row.append(earlier, later);
  box.append(says, row, make('p', 'field-about', help));
  return box;
}

/**
 * Chooses a section: the side of the page shows its card.
 *
 * @param {string} name
 */
function chooseSection(name) {
  flush();
  shownSection = name;
  variable = '';
  move = -1;
  shownRule = -1;
  remember();
  for (const head of document.querySelectorAll('#variables .var-pick')) head.setAttribute('aria-pressed', 'false');
  for (const head of document.querySelectorAll('#variables .part-pick')) head.setAttribute('aria-pressed', String(head.closest('.part')?.getAttribute('data-section') === name));
  drawStates();
  drawAbout();
  showSide();
}

/**
 * A way to add a section: a button that becomes a small form asking
 * for its name and for the variable it begins with. The server takes
 * no section with nothing in it, so a section begins with what it is
 * for.
 */
function sectionAdder() {
  const box = make('div', 'adder');
  box.dataset.addsSection = '';
  const open = make('button', 'button button-plain button-small', 'Add a section');
  open.setAttribute('type', 'button');
  open.addEventListener('click', () => {
    const form = make('form', 'adder-form');
    form.setAttribute('novalidate', '');
    const name = /** @type {HTMLInputElement} */ (make('input', 'input'));
    name.setAttribute('aria-label', 'The name of the new section');
    name.setAttribute('placeholder', 'its name, such as delivery');
    name.setAttribute('autocomplete', 'off');
    name.setAttribute('autocapitalize', 'off');
    name.setAttribute('spellcheck', 'false');
    const first = /** @type {HTMLSelectElement} */ (make('select', 'input adder-whole'));
    first.setAttribute('aria-label', 'The variable the section begins with');
    for (const [variable, it] of Object.entries(definition.variables ?? {})) {
      const option = /** @type {HTMLOptionElement} */ (make('option', '', it?.label ? `begins with ${variable}, ${it.label}` : `begins with ${variable}`));
      option.value = variable;
      first.append(option);
    }
    const go = make('button', 'button button-small', 'Add');
    go.setAttribute('type', 'submit');
    const cancel = make('button', 'button button-plain button-small', 'Cancel');
    cancel.setAttribute('type', 'button');
    const why = make('p', 'field-why');
    why.setAttribute('role', 'alert');
    cancel.addEventListener('click', () => box.replaceChildren(open));
    form.addEventListener('submit', async (sent) => {
      sent.preventDefault();
      // What was said of the name before is not said of this one.
      why.textContent = '';
      why.textContent = await addSectionNamed(name.value.trim(), first.value);
    });
    form.append(name, first, go, cancel);
    box.replaceChildren(form, why, make('p', 'field-about', 'A section holds at least one variable: it begins with one, which leaves the section it was in.'));
    name.focus();
  });
  box.append(open);
  return box;
}

/**
 * Adds a section of a name, where the name may be one, and opens its
 * card at the side.
 *
 * @param {string} name
 * @param {string} first the variable it begins with
 * @returns {Promise<string>} why not, or '' when it was added
 */
async function addSectionNamed(name, first) {
  flush();
  if (!name) return 'Give the section a name.';
  const draft = read();
  if (!draft) return 'The text cannot be read as a class just now. Put it right first.';
  const taken = sectionsOf(draft).find((one) => one.name.toLowerCase() === name.toLowerCase());
  if (taken) return `${taken.name} is a section of this class already.`;
  addSection(draft, name, first);
  const why = await refusedAt(draft, `/sections/${name}`);
  if (why) return why;
  change((it) => addSection(it, name, first));
  shownSection = name;
  variable = '';
  move = -1;
  shownRule = -1;
  remember();
  drawVariables();
  drawStates();
  drawAbout();
  part('p-label').focus();
  return '';
}

/**
 * Writes again, in the list, what a section says of itself: its label
 * on its title and on its button for a new variable, and what it is
 * for. Nothing else of the list is drawn again, so that a press on a
 * row, made while a field at the side still held the cursor, is not
 * lost.
 *
 * @param {string} name
 */
function redrawPart(name) {
  const it = sectionWords(definition, name);
  const box = document.querySelector(`#variables .part[data-section="${name}"]`);
  if (!it || !box) return;
  const label = it.label || name;
  for (const one of box.querySelectorAll(':scope > .part-title .part-label')) say(/** @type {HTMLElement} */ (one), label);
  for (const one of box.querySelectorAll(':scope > .part-about')) say(/** @type {HTMLElement} */ (one), it.description);
  for (const one of box.querySelectorAll(':scope > .adder > button')) say(/** @type {HTMLElement} */ (one), `Add a variable to ${label}`);
}

/**
 * A section, as fields: its label, what it is for, and where it lies.
 * What a designer changes here goes into the text of the class at
 * once.
 *
 * @param {string} name
 */
function drawSection(name) {
  const it = sectionWords(definition, name);
  if (!it) return;
  const box = part('about');
  part('about-title').textContent = it.label || name;
  part('about-what').textContent = 'A section of the class: which variables belong together. What you change here goes into the text at once. Nothing is the server\'s until you save.';

  const props = make('div', 'props');
  const named = make('div', 'field');
  named.append(make('p', 'field-label', 'Name'), make('code', 'var-name', name), make('p', 'field-about', 'A section keeps its name: a line about single variables names it.'));
  props.append(named);
  props.append(
    field(
      'p-label',
      'Label',
      typed(it.label, (t) => {
        change((draft) => setSectionWord(draft, name, 'label', t.trim()));
        redrawPart(name);
        part('about-title').textContent = sectionWords(definition, name)?.label || name;
      }),
      'What a person reads above this part of the document.',
    ),
    field(
      'p-description',
      'What it is for',
      typed(
        it.description,
        (t) => {
          change((draft) => setSectionWord(draft, name, 'description', t.trim()));
          redrawPart(name);
        },
        { lines: 2 },
      ),
      'For the people who fill it in, and for an agent that reads the class.',
    ),
  );

  const places = /** @type {HTMLSelectElement} */ (make('select', 'input'));
  for (const one of placesFor(definition, name)) {
    const option = /** @type {HTMLOptionElement} */ (make('option', '', one.name ? `${'  '.repeat(one.depth)}Inside ${one.label}` : one.label));
    option.value = one.name;
    option.selected = one.name === it.inside;
    places.append(option);
  }
  const lies = field('p-inside', 'Where it lies', places, 'At the top of the outline, or inside another section. It goes to the end of the sections there, with all it holds.');
  const why = make('p', 'field-why');
  why.id = 'p-inside-why';
  why.setAttribute('role', 'alert');
  lies.append(why);
  places.addEventListener('change', async () => {
    flush();
    why.textContent = '';
    const draft = read();
    if (!draft) return;
    moveSection(draft, name, places.value);
    // How deep sections may nest is the server's to say.
    const refused = await refusedAt(draft, pathOfSection(draft, name));
    if (refused) {
      why.textContent = refused;
      places.value = sectionWords(definition, name)?.inside ?? '';
      return;
    }
    change((to) => moveSection(to, name, places.value));
    drawVariables();
    document.getElementById('p-place-field')?.replaceWith(sectionPlace());
  });
  props.append(lies);
  /** The place of this section among the sections beside it. */
  const sectionPlace = () =>
    placeField(
      'p',
      () => placeOfSection(definition, name),
      () => {
        const inside = sectionWords(definition, name)?.inside ?? '';
        return inside ? `inside ${sectionWords(definition, inside)?.label || inside}` : 'at the top';
      },
      (by) => {
        change((draft) => shiftSection(draft, name, by));
        drawVariables();
      },
      'The order a document shows its parts in.',
    );
  props.append(sectionPlace());

  const holds = make('div', 'field');
  holds.id = 'p-holds';
  holds.append(make('p', 'field-label', 'What it holds'));
  const all = make('p', 'field-value');
  all.append(it.variables.length > 0 ? it.variables.join(', ') : 'No variable of its own');
  if (it.sections.length > 0) all.append(`; and the ${it.sections.length === 1 ? 'section' : 'sections'} ${it.sections.join(', ')}`);
  holds.append(all, make('p', 'field-about', 'A variable is put into a section on its own card, under Section.'));
  props.append(holds);
  box.append(props);

  const remove = make('button', 'button button-plain', 'Remove this section');
  remove.id = 'p-remove';
  remove.setAttribute('type', 'button');
  remove.addEventListener('click', () => {
    flush();
    change((draft) => removeSection(draft, name));
    shownSection = '';
    remember();
    drawVariables();
    drawStates();
    drawAbout();
    part('said').textContent = `Removed the section ${name} from the text. Its variables are in no section now; Undo puts it back.`;
  });
  const end = block('', '');
  end.append(remove, make('p', 'field-about', 'Its variables stay in the class, in no section, and the sections inside it take its place. A line about single variables that names it is for the check to find.'));
  box.append(end);
}

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
  shownSection = '';
  shownRule = -1;
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
  shownSection = '';
  shownRule = -1;
  remember();
  for (const head of document.querySelectorAll('#variables .part-pick')) head.setAttribute('aria-pressed', 'false');
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
  if (designer && editable() && !none) box.append(sectionAdder());
  part('variables-about').textContent = designer
    ? 'What each document holds, by the sections of the class. Choose a variable, or a section by its title, to change it at the side. fx marks what the class works out.'
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
  button.setAttribute('aria-pressed', String(!variable && !shownSection && state === chosen));
  button.append(make('span', 'pick-label', label));
  if (name) button.append(make('code', 'pick-name', name));
  for (const mark of marks) button.append(make('span', 'tag', mark));
  button.addEventListener('click', () => chooseState(state));
  return button;
}

/**
 * Chooses a state, or the whole class: the side of the page shows it.
 *
 * @param {string} state '' for the whole class
 */
function chooseState(state) {
  flush();
  chosen = state;
  variable = '';
  move = -1;
  shownSection = '';
  shownRule = -1;
  remember();
  for (const head of document.querySelectorAll('#variables .var-pick, #variables .part-pick')) head.setAttribute('aria-pressed', 'false');
  drawStates();
  drawAbout();
  part('about-card').scrollTop = 0;
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
 * A way to add something the class already names: a button that
 * becomes a small form with a list to choose from.
 *
 * @param {string} words what the button says
 * @param {string} asks what the list is, for a screen reader
 * @param {() => { what: string, words: string }[]} options what may be chosen, asked when the form opens
 * @param {(what: string) => void} add adds what was chosen
 */
function chooser(words, asks, options, add) {
  const box = make('div', 'adder');
  const open = make('button', 'button button-plain button-small', words);
  open.setAttribute('type', 'button');
  open.addEventListener('click', () => {
    const form = make('form', 'adder-form');
    form.setAttribute('novalidate', '');
    const list = /** @type {HTMLSelectElement} */ (make('select', 'input'));
    list.setAttribute('aria-label', asks);
    for (const one of options()) {
      const option = /** @type {HTMLOptionElement} */ (make('option', '', one.words));
      option.value = one.what;
      list.append(option);
    }
    const go = make('button', 'button button-small', 'Add');
    go.setAttribute('type', 'submit');
    const cancel = make('button', 'button button-plain button-small', 'Cancel');
    cancel.setAttribute('type', 'button');
    cancel.addEventListener('click', () => box.replaceChildren(open));
    form.addEventListener('submit', (sent) => {
      sent.preventDefault();
      add(list.value);
    });
    form.append(list, go, cancel);
    box.replaceChildren(form);
    list.focus();
  });
  box.append(open);
  return box;
}

/** A name as a part of an id: `*`, which no variable and no state is called, is 0, which none is called either. */
const idOf = (/** @type {string} */ name) => (name === '*' ? '0' : name);

/**
 * The lines of the rights table under one state, as a block: who may
 * set and who may see single variables there.
 *
 * Where a designer changes them, each half of a line is a formula in a
 * box. A line written the short way, as a list of groups, is shown as
 * the formula it means, and stays as it is written until that box is
 * changed.
 *
 * @param {string} state the name of a state, or `*` for every state
 * @param {string} title
 * @param {string} about
 * @param {boolean} [changing] whether the lines are fields here
 */
function rightsBlock(state, title, about, changing = false) {
  const rights = rightsIn(definition, state);
  if (rights.length === 0 && !changing) return null;
  const box = block(title, about);
  box.dataset.rights = state;
  if (rights.length === 0) {
    const everywhere = Object.keys(definition.rights?.['*'] ?? {}).length > 0;
    const none =
      state === '*'
        ? 'No line for every state. Where a state says nothing either, whoever may change a document may set every value in it.'
        : everywhere
          ? 'No line here: what is said for every state holds.'
          : 'No line here, and none for every state: whoever may change a document may set every value in it.';
    box.append(make('p', 'card-about right-none', none));
  }
  for (const right of rights) {
    const head = make('p', 'right-what', right.label);
    if (right.what !== '*') head.append(' ', make('code', 'pick-name', right.what));
    if (right.about === 'section') head.append(' ', make('span', 'tag', 'a section'));
    if (right.about === 'unknown') head.append(' ', make('span', 'tag', 'not in this class'));
    box.append(head);
    if (!changing) {
      const one = make('dl', 'right');
      one.dataset.what = right.what;
      if (right.write !== null) one.append(line('may set it', formulaOf(right.write)));
      if (right.read !== null) one.append(line('may see it', formulaOf(right.read)));
      box.append(one);
      continue;
    }
    const one = make('div', 'props right-line');
    one.dataset.what = right.what;
    const id = `r-${idOf(state)}-${idOf(right.what)}`;
    const whom = right.what === '*' ? 'every variable' : right.label;
    one.append(
      formulaField(`${id}-write`, `May set ${whom}`, right.writeAs, `/rights/${state}/${right.what}/write`, (draft, formula) => setRight(draft, state, right.what, 'write', formula.trim()), ''),
      formulaField(`${id}-read`, `May see ${whom}`, right.readAs, `/rights/${state}/${right.what}/read`, (draft, formula) => setRight(draft, state, right.what, 'read', formula.trim()), ''),
    );
    const remove = make('button', 'button button-plain button-small', 'Remove this line');
    remove.id = `${id}-remove`;
    remove.setAttribute('type', 'button');
    remove.addEventListener('click', () => {
      flush();
      change((draft) => removeRightLine(draft, state, right.what));
      drawAbout();
      part('said').textContent = `Removed the line about ${whom} from the text. Undo puts it back.`;
    });
    one.append(remove);
    box.append(one);
  }
  if (changing) {
    const add = chooser(
      'Add a line',
      'What the new line is about',
      () => linesToAdd(definition, state),
      (what) => {
        flush();
        change((draft) => addRightLine(draft, state, what));
        drawAbout();
        const first = document.querySelector(`#r-${idOf(state)}-${idOf(what)}-write .cm-content`);
        if (first instanceof HTMLElement) first.focus();
        part('said').textContent = 'Added a line that lets nobody set it. Say who may.';
      },
    );
    add.dataset.addsRight = state;
    box.append(add);
  }
  return box;
}

/** The names in a list a person typed with commas between. */
const listed = (/** @type {string} */ typedList) =>
  typedList
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean);

/**
 * The rules about a state, or about none, as a block: what the class
 * does by itself. Where a designer changes them, a rule is chosen by
 * its first line, as a way out is, and one is added at the end.
 *
 * @param {string} state '' for the rules that are about no state
 * @param {string} title
 * @param {boolean} [changing]
 */
function rulesBlock(state, title, changing = false) {
  const rules = rulesAt(definition, state);
  if (rules.length === 0 && !changing) return null;
  const box = block(title, changing && rules.length > 0 ? 'What the class does by itself. Choose a rule to change it.' : 'What the class does by itself.');
  box.dataset.rules = state;
  if (rules.length === 0) box.append(make('p', 'card-about rule-none', state ? 'Nothing: no rule is about this state or a way out of it.' : 'Nothing: no rule is about a new document, a change of a value or a deletion.'));
  for (const rule of rules) {
    const one = make('div', 'rule');
    one.dataset.rule = String(rule.at);
    if (changing) {
      const head = make('button', 'rule-when way-pick', rule.when);
      head.setAttribute('type', 'button');
      head.addEventListener('click', () => chooseRule(rule.at));
      one.append(head);
    } else one.append(make('p', 'rule-when', rule.when));
    const lines = make('dl', 'right');
    if (rule.only) lines.append(line('only when', formulaOf(rule.only)));
    for (const does of rule.does) lines.append(line('it does', formulaOf(does)));
    one.append(lines);
    box.append(one);
  }
  if (changing) {
    const add = ruleAdder(state);
    if (add) box.append(add);
  }
  return box;
}

/**
 * Chooses a rule: the side of the page shows its card.
 *
 * @param {number} at its place in the list of the class
 */
function chooseRule(at) {
  flush();
  shownRule = at;
  variable = '';
  move = -1;
  shownSection = '';
  remember();
  drawAbout();
  showSide();
}

/**
 * A way to add a rule in one place of the lists: a button that becomes
 * a small form asking what sets the rule off and which value it sets.
 * A rule does at least one thing, so it begins with one. Null where
 * the class has no value a rule could set.
 *
 * @param {string} state '' for the whole class
 */
function ruleAdder(state) {
  const inputs = inputsOf(definition);
  if (inputs.length === 0) return null;
  const box = make('div', 'adder');
  box.dataset.addsRule = state;
  const open = make('button', 'button button-plain button-small', 'Add a rule');
  open.setAttribute('type', 'button');
  open.addEventListener('click', () => {
    const form = make('form', 'adder-form');
    form.setAttribute('novalidate', '');
    const when = /** @type {HTMLSelectElement} */ (make('select', 'input adder-whole'));
    when.setAttribute('aria-label', 'What sets the rule off');
    for (const one of eventsAt(definition, state)) {
      const option = /** @type {HTMLOptionElement} */ (make('option', '', `when ${one.words.charAt(0).toLowerCase()}${one.words.slice(1)}`));
      option.value = one.event;
      when.append(option);
    }
    const sets = /** @type {HTMLSelectElement} */ (make('select', 'input adder-whole'));
    sets.setAttribute('aria-label', 'The value the rule sets');
    for (const one of inputs) {
      const option = /** @type {HTMLOptionElement} */ (make('option', '', `it sets ${one.name}, ${one.label}`));
      option.value = one.name;
      sets.append(option);
    }
    const go = make('button', 'button button-small', 'Add');
    go.setAttribute('type', 'submit');
    const cancel = make('button', 'button button-plain button-small', 'Cancel');
    cancel.setAttribute('type', 'button');
    cancel.addEventListener('click', () => box.replaceChildren(open));
    form.addEventListener('submit', (sent) => {
      sent.preventDefault();
      flush();
      let at = -1;
      change((draft) => {
        at = addRule(draft, when.value, sets.value);
      });
      if (at < 0) return;
      shownRule = at;
      variable = '';
      move = -1;
      shownSection = '';
      remember();
      drawAbout();
      const first = document.querySelector(`#u-set-0-${sets.value} .cm-content`);
      if (first instanceof HTMLElement) first.focus();
      part('said').textContent = 'Added a rule. Say what the value is set to.';
    });
    form.append(when, sets, go, cancel);
    box.replaceChildren(form, make('p', 'field-about', 'A rule does at least one thing: it begins by setting one value, to a formula you then write.'));
    when.focus();
  });
  box.append(open);
  return box;
}

/**
 * A way to add an action to what a rule does: to set a value, or to
 * put one back to its first value.
 *
 * @param {number} at the place of the rule
 */
function actionAdder(at) {
  const box = make('div', 'adder');
  box.dataset.addsAction = String(at);
  const open = make('button', 'button button-plain button-small', 'Add an action');
  open.setAttribute('type', 'button');
  open.addEventListener('click', () => {
    const form = make('form', 'adder-form');
    form.setAttribute('novalidate', '');
    const kind = /** @type {HTMLSelectElement} */ (make('select', 'input adder-whole'));
    kind.setAttribute('aria-label', 'What the action does');
    for (const [value, words] of [
      ['set', 'Set a value'],
      ['reset', 'Put a value back to its first value'],
    ]) {
      const option = /** @type {HTMLOptionElement} */ (make('option', '', words));
      option.value = value;
      kind.append(option);
    }
    const which = /** @type {HTMLSelectElement} */ (make('select', 'input adder-whole'));
    which.setAttribute('aria-label', 'The value it is about');
    for (const one of inputsOf(definition)) {
      const option = /** @type {HTMLOptionElement} */ (make('option', '', `${one.name}, ${one.label}`));
      option.value = one.name;
      which.append(option);
    }
    const go = make('button', 'button button-small', 'Add');
    go.setAttribute('type', 'submit');
    const cancel = make('button', 'button button-plain button-small', 'Cancel');
    cancel.setAttribute('type', 'button');
    cancel.addEventListener('click', () => box.replaceChildren(open));
    form.addEventListener('submit', (sent) => {
      sent.preventDefault();
      flush();
      let place = -1;
      change((draft) => {
        place = kind.value === 'set' ? addSet(draft, at, which.value) : addReset(draft, at, which.value);
      });
      drawAbout();
      const first = document.querySelector(kind.value === 'set' ? `#u-set-${place}-${which.value} .cm-content` : `#u-reset-${place}`);
      if (first instanceof HTMLElement) first.focus();
      part('said').textContent = kind.value === 'set' ? 'Added an action. Say what the value is set to.' : 'Added an action.';
    });
    form.append(kind, which, go, cancel);
    box.replaceChildren(form);
    kind.focus();
  });
  box.append(open);
  return box;
}

/**
 * A rule, as fields: what sets it off, on what condition, and what it
 * does, one action after another. It is told by its place in the list
 * of the class. An action that sets a value or puts one back has
 * fields; any other is shown as the class writes it, and is changed in
 * the text.
 *
 * @param {number} at
 */
function drawRule(at) {
  const it = ruleAt(definition, at);
  if (!it) return;
  const box = part('about');
  part('about-title').textContent = it.when;
  part('about-what').textContent = 'A rule: what the class does by itself when something happens. What you change here goes into the text at once. Nothing is the server\'s until you save.';
  /** @param {string} state */
  const labelOf = (state) => (state ? (statesOf(definition).find((one) => one.name === state)?.label ?? state) : 'The whole class');

  const back = make('button', 'button button-plain button-small', `Back to ${labelOf(homeOfRule(definition, at, chosen))}`);
  back.id = 'u-back';
  back.setAttribute('type', 'button');
  back.addEventListener('click', () => {
    flush();
    chosen = homeOfRule(definition, at, chosen);
    shownRule = -1;
    remember();
    drawStates();
    drawAbout();
    showSide();
  });

  const props = make('div', 'props');
  const top = make('div', 'field');
  top.append(back);
  props.append(top);

  const when = /** @type {HTMLSelectElement} */ (make('select', 'input'));
  const events = eventsOf(definition);
  // What the text names and the class does not have is shown as it is written.
  if (!events.some((one) => one.event === it.event)) events.push({ event: it.event, words: `${it.when} (as the text writes it)` });
  for (const one of events) {
    const option = /** @type {HTMLOptionElement} */ (make('option', '', one.words));
    option.value = one.event;
    option.selected = one.event === it.event;
    when.append(option);
  }
  when.addEventListener('change', () => {
    flush();
    change((draft) => setRuleEvent(draft, at, when.value));
    // The rule may belong to another state now: the lists go with it.
    chosen = homeOfRule(definition, at, chosen);
    remember();
    drawStates();
    drawAbout();
  });
  props.append(field('u-when', 'When', when, 'What sets the rule off.'));
  if (it.event === 'values_change') {
    props.append(
      field(
        'u-variables',
        'Which values',
        typed(
          it.variables.join(', '),
          (t) => {
            change((draft) => setRuleVariables(draft, at, listed(t)));
            part('about-title').textContent = ruleAt(definition, at)?.when ?? '';
          },
          { mono: true },
        ),
        'The names of the variables, with commas between: net, vat_rate. The rule runs when one of them changes.',
      ),
    );
  }
  props.append(formulaField('u-if', 'Only when', it.condition, `/rules/${at}/if`, (draft, formula) => setRuleIf(draft, at, formula.trim()), 'A condition about the document: total > 1000. Empty: every time.'));
  box.append(props);

  const does = block('It does', 'One action after another, in this order. Earlier and Later change it.');
  does.id = 'u-does';
  const actions = actionsOf(definition, at);
  // A rule does at least one thing: the last thing it does is not taken away, the rule is.
  const things = actions.reduce((count, action) => count + (action.kind === 'set' ? action.values.length : 1), 0);
  /**
   * @param {string} id
   * @param {string} what for a screen reader: what is removed
   * @param {(draft: Record<string, any>) => void} take
   */
  const remover = (id, what, take) => {
    const remove = make('button', 'button button-plain button-small', 'Remove');
    remove.id = id;
    remove.setAttribute('type', 'button');
    remove.setAttribute('aria-label', `Remove: ${what}`);
    remove.addEventListener('click', () => {
      flush();
      change(take);
      drawAbout();
      part('said').textContent = 'Removed the action from the text. Undo puts it back.';
    });
    return remove;
  };
  /**
   * The place of an action among what the rule does, with two buttons
   * that move it a step. After a move the button that was pressed has
   * the cursor again, on the action that moved, for the next press.
   *
   * @param {number} place
   */
  const orderOf = (place) => {
    const row = make('div', 'place-row action-place');
    row.append(make('span', 'place-says', `Action ${place + 1} of ${actions.length}`));
    for (const [words, by] of /** @type {[string, -1 | 1][]} */ ([['Earlier', -1], ['Later', 1]])) {
      const button = make('button', 'button button-plain button-small', words);
      const which = by < 0 ? 'earlier' : 'later';
      button.id = `u-${which}-${place}`;
      button.setAttribute('type', 'button');
      button.setAttribute('aria-label', `${words}: action ${place + 1}`);
      button.setAttribute('aria-disabled', String(by < 0 ? place === 0 : place === actions.length - 1));
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-disabled') === 'true') {
          part('said').textContent = by < 0 ? 'It is the first already.' : 'It is the last already.';
          return;
        }
        flush();
        let to = place;
        change((draft) => {
          to = shiftAction(draft, at, place, by);
        });
        drawAbout();
        document.getElementById(`u-${which}-${to}`)?.focus();
        part('said').textContent = '';
      });
      row.append(button);
    }
    return row;
  };
  for (const action of actions) {
    if (action.kind === 'set') {
      for (const value of action.values) {
        const one = make('div', 'props rule-action');
        one.dataset.action = String(action.at);
        one.dataset.sets = value.variable;
        one.append(
          formulaField(`u-set-${action.at}-${value.variable}`, `Set ${value.label} to`, value.formula, `/rules/${at}/do/${action.at}/values/${value.variable}`, (draft, formula) =>
            setSetFormula(draft, at, action.at, value.variable, formula.trim()), ''),
        );
        if (things > 1) one.append(remover(`u-remove-${action.at}-${value.variable}`, `set ${value.label}`, (draft) => removeSetValue(draft, at, action.at, value.variable)));
        if (actions.length > 1 && value === action.values.at(-1)) one.append(orderOf(action.at));
        does.append(one);
      }
    } else if (action.kind === 'reset') {
      const one = make('div', 'props rule-action');
      one.dataset.action = String(action.at);
      one.append(
        field(
          `u-reset-${action.at}`,
          'Put back to its first value',
          typed(action.variables.join(', '), (t) => void change((draft) => setResetVariables(draft, at, action.at, listed(t))), { mono: true }),
          'The names of the variables, with commas between. Each goes back to the first value the class gives it.',
        ),
      );
      if (things > 1) one.append(remover(`u-remove-${action.at}`, 'put back to its first value', (draft) => removeAction(draft, at, action.at)));
      if (actions.length > 1) one.append(orderOf(action.at));
      does.append(one);
    } else {
      const one = make('div', 'props rule-action');
      one.dataset.action = String(action.at);
      const words = make('p', 'rule-other');
      words.append(formulaOf(action.words), ' ', make('span', 'tag', 'changed in the text'));
      one.append(words);
      if (things > 1) one.append(remover(`u-remove-${action.at}`, action.words, (draft) => removeAction(draft, at, action.at)));
      if (actions.length > 1) one.append(orderOf(action.at));
      does.append(one);
    }
  }
  if (things <= 1) does.append(make('p', 'field-about rule-last', 'A rule does at least one thing. To take this away, remove the rule.'));
  does.append(actionAdder(at));
  box.append(does);

  const remove = make('button', 'button button-plain', 'Remove this rule');
  remove.id = 'u-remove';
  remove.setAttribute('type', 'button');
  remove.addEventListener('click', () => {
    flush();
    const home = homeOfRule(definition, at, chosen);
    change((draft) => removeRule(draft, at));
    chosen = home;
    shownRule = -1;
    remember();
    drawStates();
    drawAbout();
    part('said').textContent = 'Removed the rule from the text. Undo puts it back.';
  });
  const end = block('', '');
  end.append(remove);
  box.append(end);
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
      formulaField('c-title', 'The title of a document', definition.title, '/title', (draft, formula) => setClassWord(draft, 'title', formula), 'A formula that names each document: what, or "Invoice " & number. Empty: its id.'),
    );
    box.append(words);
    const who = block('Who may', 'Each is a formula: INGROUP("everyone"), CREATEDBY() = USER(), FALSE. An empty line lets nobody through.');
    const lines = make('div', 'props');
    for (const { line: name, what, formula } of linesOf(definition)) {
      lines.append(formulaField(`c-${name}`, what, formula ?? '', `/access/${name}`, (draft, written) => setLine(draft, name, written.trim()), ''));
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
  const rights = rightsBlock(
    '*',
    'Single variables, in every state',
    designer && editable()
      ? 'Who may set and who may see single variables. This narrows what the lines above let through, and never widens it. A state that says something of its own comes first. An empty box says nothing of that; a line with both boxes empty is not kept.'
      : 'This narrows what the lines above let through, and never widens it. A state that says something of its own comes first.',
    designer && editable(),
  );
  if (rights) box.append(rights);
  const rules = rulesBlock('', 'By itself', designer && editable());
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
          // What the card says of the ways out depends on it.
          drawAbout();
        },
        'A document that reaches a final state is finished: its values change no more.',
      ),
    );
    box.append(props);
  }

  const ways = waysOut(definition, state.name);
  const places = placesOut(definition, state.name);
  const out = block('Ways out of this state', changing && ways.length > 0 ? 'Each is a transition. Choose one to change it.' : '');
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
        showSide();
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

  const here = rightsBlock(
    state.name,
    'Single variables, in this state',
    changing
      ? 'Who may set and who may see single variables while a document is here. This narrows what the whole class lets through, and never widens it. The most exact line is asked: a variable by its name, then its section, then every variable. An empty box says nothing of that; a line with both boxes empty is not kept.'
      : 'Who may set and see single variables while a document is here. This narrows what the whole class lets through, and never widens it.',
    changing,
  );
  if (here) box.append(here);
  const everywhere = rightsBlock('*', 'Single variables, in every state', changing ? 'Asked where this state says nothing of its own about a variable. A line here for every variable says something about each, so it comes before these. They are changed under The whole class.' : 'Asked where this state says nothing of its own about a variable.');
  if (everywhere) box.append(everywhere);
  if (!here && !everywhere) {
    const none = block('Single variables', '');
    none.append(make('p', 'card-about', 'The class keeps no line for single variables: whoever may change a document may set every value in it.'));
    box.append(none);
  }
  const rules = rulesBlock(state.name, 'By itself', changing);
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
    showSide();
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
      formulaField(
        'm-who',
        'Who may take it',
        definition.access?.transition?.[it.name],
        `/access/transition/${it.name}`,
        (draft, formula) => setMoveWho(draft, at, formula.trim()),
        'A formula asked for the person and the document: CREATEDBY() = USER(), INGROUP("accountants"). Empty: whoever may change the document.',
      ),
    );
  }
  props.append(formulaField('m-guard', 'Only when', it.guard, `/transitions/${at}/guard`, (draft, formula) => setMoveWord(draft, at, 'guard', formula), 'A condition about the document: total > 0. Empty: always.'));
  props.append(field('m-after', 'By itself, after', typed(it.after, (t) => set('after', t.trim()), { mono: true }), 'So long after the document entered the state: 30d, 12h, 90m. Empty: only when somebody takes it.'));
  props.append(formulaField('m-at', 'By itself, at', it.at, `/transitions/${at}/at`, (draft, formula) => setMoveWord(draft, at, 'at', formula), 'At a day or a moment the document holds: ADDDAYS(bought_on, 60). Empty: not by a date.'));

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
    // What is typed is work from the first letter: Save and Discard are there for it before the field is left.
    bar();
  });
  control.addEventListener('change', () => {
    pending = null;
    then(control.value);
    // What was typed may be what the class held already: the bar follows what is there now.
    bar();
  });
  // A field left with the words it had when the cursor came says nothing of a change, whatever was typed in between.
  control.addEventListener('blur', flush);
  return control;
}

/**
 * What may be written in a formula of the class as it stands: its
 * variables, and the functions the engine has.
 *
 * @returns {import('./text.js').Names}
 */
function names() {
  return {
    variables: Object.entries(definition.variables ?? {}).map(([name, it]) => ({ name, label: String(it?.label ?? ''), kind: kindLine(it) })),
    functions,
  };
}

/**
 * A field that holds a formula, the formula editor.
 *
 * At once, from what the page knows: the pieces of the formula in
 * their colours, the names that may be written, offered as the person
 * types, and under the box the help for the function the cursor is
 * in. A moment after the typing stops, from the server: whether it
 * takes the formula, and where it does not, marked at its place. The
 * formula goes into the text of the class when the person is done with
 * the box, as one step.
 *
 * @param {string} id
 * @param {string} label
 * @param {unknown} value
 * @param {string} path where the formula is in the class, as the server names the place
 * @param {(draft: Record<string, any>, formula: string) => void} put puts a formula into a class
 * @param {string} help
 * @param {() => void} [after] what the page draws again after the class changed
 */
function formulaField(id, label, value, path, put, help, after) {
  const box = make('div', 'field');
  const head = make('div', 'formula-head');
  head.append(make('p', 'field-label', label));
  const offer = make('button', 'formula-names', 'Names');
  offer.setAttribute('type', 'button');
  offer.setAttribute('aria-label', `What may be written in ${label}`);
  head.append(offer);
  const holder = make('div', 'formula-box');
  holder.id = id;
  const helpLine = make('p', 'formula-call');
  helpLine.id = `${id}-call`;
  helpLine.setAttribute('aria-live', 'polite');
  const why = make('p', 'field-why');
  why.id = `${id}-why`;
  why.setAttribute('role', 'status');
  const about = make('p', 'field-about', help);
  about.id = `${id}-about`;

  /** The formula as the class holds it. */
  let written = value === undefined || value === null ? '' : String(value);
  /** Whether something was typed that the server was not asked about. */
  let unchecked = false;
  /** The number of the last question to the server: an older answer is left alone. */
  let asked = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let waiting;

  /** Asks the server about the class with this formula in it, and marks what it says of this formula. */
  const check = async () => {
    unchecked = false;
    const formula = fx.text();
    const mine = ++asked;
    const draft = read();
    if (!draft) return;
    put(draft, formula);
    /** @type {import('./fado.js').Finding[]} */
    let findings = [];
    try {
      const { diagnostics } = await call('validate_class', { definition: draft });
      if (Array.isArray(diagnostics)) findings = diagnostics;
    } catch {
      return;
    }
    if (mine !== asked) return;
    // The server may say one thing twice; once is enough.
    const said = new Set();
    const here = findings.filter((finding) => {
      const key = `${finding.pos} ${finding.message}`;
      if (finding.note === true || finding.path !== path || said.has(key)) return false;
      said.add(key);
      return true;
    });
    fx.mark(
      here.map((finding) => {
        const place = finding.pos >= 0 ? pieceAt(formula, fromBytes(formula, finding.pos)) : { from: 0, to: formula.length };
        return { ...place, message: finding.message };
      }),
    );
    why.textContent = here.map((finding) => (finding.hint ? `${finding.message}. ${finding.hint}` : finding.message)).join(' ');
    // The page says what it has asked about: a check waits for this.
    holder.dataset.checked = formula;
  };

  /** Puts the formula into the text of the class, where it differs from what the class holds. */
  const commit = () => {
    pending = null;
    const formula = fx.text();
    if (formula !== written) {
      written = formula;
      change((draft) => put(draft, formula));
      if (after) after();
    }
    // What was typed may be what the class held already: the bar follows what is there now.
    bar();
  };

  /** Shows the help for the function the cursor is in, under the box. */
  const showCall = () => {
    const at = callAt(fx.text(), fx.cursor());
    const told = at ? helpFor(at, functions) : null;
    helpLine.replaceChildren();
    if (!told) return;
    const call = make('code', 'formula-sig', `${told.name}(`);
    told.params.forEach((param, n) => {
      if (n > 0) call.append(', ');
      call.append(make(param.current ? 'strong' : 'span', param.current ? 'formula-arg' : '', param.words));
    });
    call.append(')');
    helpLine.append(call, ` ${told.description} Gives: ${told.returns}.`);
  };

  const fx = formulaBox(holder, {
    text: written,
    label,
    describedBy: `${helpLine.id} ${why.id} ${about.id}`,
    names,
    onType() {
      pending = commit;
      bar();
      unchecked = true;
      delete holder.dataset.checked;
      clearTimeout(waiting);
      waiting = setTimeout(check, 600);
    },
    onMove: showCall,
    onDone() {
      commit();
      helpLine.replaceChildren();
      if (unchecked) {
        clearTimeout(waiting);
        check();
      }
    },
  });
  offer.addEventListener('click', () => fx.offer());
  box.append(head, holder, helpLine, why, about);
  return box;
}

/**
 * Who may set a variable and who may see it, state by state: for each
 * state the line about single variables that is asked, where it is
 * written, and who it names. The lines themselves are changed under
 * the state, which each row leads to.
 *
 * @param {string} name
 */
function whoBlock(name) {
  const computed = definition.variables?.[name]?.formula !== undefined;
  const box = block(
    'Who may set it and see it, state by state',
    'Which line about single variables is asked for this one in each state: the most exact, and a state\'s own before one for every state. A line narrows who may change, or see, a document at all, and never widens it. Choose a state to change its lines.',
  );
  box.id = 'v-who';
  if (computed) box.append(make('p', 'card-about who-computed', 'The class works this value out: nobody sets it, in any state.'));
  for (const row of whoDecides(definition, name)) {
    const one = make('div', 'way who-row');
    one.dataset.state = row.state;
    const head = make('button', 'way-head way-pick');
    head.setAttribute('type', 'button');
    head.append(make('span', 'way-label', row.label), ' ', make('code', 'pick-name', row.state));
    if (row.final) head.append(' ', make('span', 'tag', 'final'));
    head.addEventListener('click', () => {
      chooseState(row.state);
      showSide();
    });
    one.append(head);
    const lines = make('dl', 'right');
    /** @param {NonNullable<typeof row.write>} found */
    const told = (found) => {
      const answer = document.createDocumentFragment();
      answer.append(formulaOf(found.formula), make('span', 'who-from', whereWords(definition, found)));
      return answer;
    };
    if (!computed) {
      const set = line(
        'may set it',
        row.final
          ? make('span', 'nobody', 'nobody: the state is final, and a document in it changes no more')
          : row.write
            ? told(row.write)
            : make('span', 'nobody', 'whoever may change the document: no line names it, its section or every variable'),
      );
      set.dataset.right = 'write';
      lines.append(set);
    }
    const see = line('may see it', row.read ? told(row.read) : make('span', 'nobody', 'whoever may see the document: no line says who may see it'));
    see.dataset.right = 'read';
    lines.append(see);
    one.append(lines);
    box.append(one);
  }
  return box;
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
    props.append(
      formulaField(
        'v-formula',
        'Formula',
        it.formula,
        `/variables/${name}/formula`,
        (draft, formula) => {
          // A variable the class works out keeps its formula, an empty one too: it stays of that kind.
          if (draft.variables?.[name]) draft.variables[name].formula = formula;
        },
        'As in a spreadsheet: net + vat, ROUND(net * vat_rate, 2).',
        () => redrawRow(name),
      ),
    );
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
    props.append(
      formulaField(
        'v-default',
        'First value',
        it.default,
        `/variables/${name}/default`,
        (draft, formula) => setWord(draft, name, 'default', formula),
        'A formula for what a new document gets when nobody gives a value: TODAY(), 0.23, "PLN".',
        () => redrawRow(name),
      ),
    );
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
      // The lines for a section are asked for what lies in it: another section, other lines.
      document.getElementById('v-who')?.replaceWith(whoBlock(name));
      document.getElementById('v-place-field')?.replaceWith(variablePlace());
    });
    props.append(field('v-section', 'Section', select, 'Which part of the document it belongs to. It goes to the end of that part.'));
  }
  /** The place of this variable among the variables beside it. */
  const variablePlace = () =>
    placeField(
      'v',
      () => placeOfVariable(definition, name),
      () => {
        const inside = sectionOfVariable(definition, name);
        return inside ? `in ${sectionWords(definition, inside)?.label || inside}` : sectionsOf(definition).length > 0 ? 'in no section' : 'in the class';
      },
      (by) => {
        change((draft) => shiftVariable(draft, name, by));
        drawVariables();
      },
      'The order a document shows its values in.',
    );
  props.append(variablePlace());

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
  box.append(props, whoBlock(name));
  const end = block('', '');
  end.append(last);
  box.append(end);
}

function drawAbout() {
  flush();
  part('about').replaceChildren();
  if (variable && designer && editable() && definition.variables?.[variable]) return drawVariable(variable);
  if (shownSection && designer && editable() && sectionWords(definition, shownSection)) return drawSection(shownSection);
  if (shownRule >= 0 && designer && editable() && ruleAt(definition, shownRule)) return drawRule(shownRule);
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
  if (shownSection && !sectionWords(definition, shownSection)) shownSection = '';
  if (shownRule >= 0 && !ruleAt(definition, shownRule)) shownRule = -1;
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

/**
 * Brings the bar up to date: whether the work differs from what the
 * server holds, and what may be done about it.
 *
 * What is typed in a field and not given to the class yet is work too,
 * or Save would stay out of reach until the cursor left the field.
 *
 * The bar stands still while a press is under way, and is brought up
 * to date when the press is over. A field gives its text when a press
 * on a button makes the cursor leave it; a button that changed then,
 * went out of reach or got other words and another width, would no
 * longer be under the mouse when it is released, and the press would
 * end on nothing or on the button beside it.
 */
function bar() {
  const draft = read();
  changed = draft === null || JSON.stringify(draft) !== JSON.stringify(saved) || pending !== null;
  if (pressing) return;
  // A class that is not made yet says so in place of its version.
  part('class-changed').hidden = making || !changed;
  /** @type {HTMLButtonElement} */ (part('discard')).disabled = !changed;
  /** @type {HTMLButtonElement} */ (part('save')).disabled = !making && !changed;
  say(part('save'), making ? 'Make the class' : changed ? `Save as version ${held.version + 1}` : 'Save');
}

/** Follows the text when it changed: the bar, and what was found in the text as it was. */
function follow() {
  bar();
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
  if (designer) {
    // What a formula can call, for the formula editor. A server that
    // does not know the command leaves the editor with the variables.
    functions = await call('list_functions').then(
      (answer) => (Array.isArray(answer?.functions) ? answer.functions : []),
      () => [],
    );
  }
  await drawHeld();

  const states = statesOf(definition);
  const wanted = asked.get('state');
  // The page opens on the state a new document starts in, where the
  // flow begins; a class with no states opens on the whole class.
  chosen = wanted !== null && (wanted === '' || states.some((s) => s.name === wanted)) ? wanted : (states.find((s) => s.initial)?.name ?? '');
  const wantedVariable = asked.get('variable') ?? '';
  variable = designer && definition.variables?.[wantedVariable] ? wantedVariable : '';
  const wantedSection = asked.get('section') ?? '';
  shownSection = designer && !variable && sectionWords(definition, wantedSection) ? wantedSection : '';
  const wantedMove = /^\d+$/.test(asked.get('move') ?? '') ? Number(asked.get('move')) : -1;
  const wantedRule = /^\d+$/.test(asked.get('rule') ?? '') ? Number(asked.get('rule')) : -1;
  shownRule = designer && !variable && !shownSection && ruleAt(definition, wantedRule) ? wantedRule : -1;
  // The state at the side of a rule is the one it belongs to.
  if (shownRule >= 0 && homeOfRule(definition, shownRule, chosen)) chosen = homeOfRule(definition, shownRule, chosen);
  move = designer && !variable && !shownSection && shownRule < 0 && definition.transitions?.[wantedMove] ? wantedMove : -1;
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
