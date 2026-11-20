// What a class says, read for the lists of the designer.
//
// Nothing here asks the server and nothing here judges. A definition is
// read as the server handed it out and put into a designer's words:
// which variables it has and of what kind, which states, which ways
// lead out of a state, and who may do what there. Whether a class is
// right is the server's to say, with validate_class.

/** A class as it is written: the engine's own format. */
/** @typedef {Record<string, any>} Definition */

/**
 * A part of the outline of a class: a section with its variables and
 * the sections inside it. The first part of an outline has no name: it
 * holds the variables that are in no section.
 *
 * @typedef {{ name: string, label: string, description: string, variables: string[], parts: Part[] }} Part
 */

/** @param {unknown} value */
const text = (value) => (value === undefined || value === null ? '' : String(value));

/** @param {unknown} value @returns {string[]} */
const texts = (value) => (Array.isArray(value) ? value.map(text) : value === undefined || value === null ? [] : [text(value)]);

/**
 * The type of an input in words: the engine's own name for it, and what
 * it points at or is made of.
 *
 * @param {Record<string, any>} variable
 */
function typeWords(variable) {
  const type = text(variable.type);
  if (type === 'ref' && variable.class) return `ref to ${variable.class}`;
  if ((type === 'rows' || type === 'object') && typeof variable.schema === 'string') return `${type} of ${variable.schema}`;
  if (type === 'rows' && variable.schema && typeof variable.schema === 'object') return `rows with ${Object.keys(variable.schema).join(', ')}`;
  return type;
}

/**
 * The kind of a variable in one line, as a designer reads it:
 * "text, required", "date, at first TODAY()", "fx net + vat".
 *
 * @param {Record<string, any> | undefined} variable
 */
export function kindLine(variable) {
  const v = variable ?? {};
  /** @type {string[]} */
  const said = [];
  const computed = v.formula !== undefined;
  if (computed) said.push(`fx ${text(v.formula)}`);
  if (v.type) said.push(typeWords(v));
  else if (!computed) said.push('no type');
  if (v.scale !== undefined && Number(v.scale) !== 2) said.push(`${v.scale} places`);
  if (v.required) said.push('required');
  if (Array.isArray(v.values)) said.push(`one of ${v.values.map(text).join(', ')}`);
  const least = v.min !== undefined;
  const most = v.max !== undefined;
  if (least && most) said.push(`${v.min} to ${v.max}`);
  else if (least) said.push(`at least ${v.min}`);
  else if (most) said.push(`at most ${v.max}`);
  if (v.default !== undefined) said.push(`at first ${text(v.default)}`);
  if (v.mode === 'triggered') said.push(`worked out at ${texts(v.on).join(', ') || 'chosen moments'}`);
  return said.join(', ');
}

/**
 * What else a class says of a variable, each in a word or two.
 *
 * @param {Record<string, any> | undefined} variable
 */
export function marksOf(variable) {
  const v = variable ?? {};
  /** @type {string[]} */
  const marks = [];
  if (v.list === true) marks.push('in The List');
  if (v.index === true) marks.push('indexed');
  if (v.format) marks.push(`shown as ${v.format}`);
  return marks;
}

/**
 * The outline of a class: first the variables that are in no section,
 * then its sections as they are written and as they nest.
 *
 * @param {Definition} definition
 * @returns {Part[]}
 */
export function outline(definition) {
  const all = Object.keys(definition.variables ?? {});
  const placed = new Set();
  /** @param {Record<string, any>} sections @returns {Part[]} */
  const read = (sections) =>
    Object.entries(sections ?? {}).map(([name, section]) => {
      const variables = texts(section?.variables);
      for (const variable of variables) placed.add(variable);
      return { name, label: text(section?.label) || name, description: text(section?.description), variables, parts: read(section?.sections) };
    });
  const parts = read(definition.sections);
  const loose = all.filter((name) => !placed.has(name));
  return loose.length > 0 || parts.length === 0 ? [{ name: '', label: '', description: '', variables: loose, parts: [] }, ...parts] : parts;
}

/**
 * The states of a class, in the order they are written.
 *
 * @param {Definition} definition
 * @returns {{ name: string, label: string, description: string, initial: boolean, final: boolean }[]}
 */
export function statesOf(definition) {
  const states = definition.states ?? {};
  const final = new Set(texts(states.final));
  return texts(states.list).map((name) => ({
    name,
    label: text(states.labels?.[name]) || name,
    description: text(states.descriptions?.[name]),
    initial: name === states.initial,
    final: final.has(name),
  }));
}

/**
 * @param {Definition} definition
 * @param {string} state
 */
const labelOfState = (definition, state) => text(definition.states?.labels?.[state]) || state;

/**
 * The ways out of a state: every transition that leaves it, in the
 * order they are written, each with who may take it and when.
 *
 * `who` is the line the class keeps for that transition. Where it
 * keeps none, the transition asks the line "update" of the class, and
 * `who` is null.
 *
 * @param {Definition} definition
 * @param {string} state
 * @returns {{ name: string, label: string, description: string, to: string, toLabel: string, guard: string, after: string, at: string, who: string | null }[]}
 */
export function waysOut(definition, state) {
  /** @type {any[]} */
  const transitions = Array.isArray(definition.transitions) ? definition.transitions : [];
  const lines = definition.access?.transition ?? {};
  return transitions
    .filter((t) => texts(t?.from).includes(state))
    .map((t) => ({
      name: text(t.name),
      label: text(t.label) || text(t.name) || 'with no name',
      description: text(t.description),
      to: text(t.to),
      toLabel: labelOfState(definition, text(t.to)),
      guard: text(t.guard),
      after: text(t.after),
      at: text(t.at),
      who: t.name !== undefined && lines[t.name] !== undefined ? text(lines[t.name]) : null,
    }));
}

/**
 * The ways into a state: every transition that enters it, each with the
 * states it comes from.
 *
 * @param {Definition} definition
 * @param {string} state
 * @returns {{ name: string, label: string, from: string[] }[]}
 */
export function waysIn(definition, state) {
  /** @type {any[]} */
  const transitions = Array.isArray(definition.transitions) ? definition.transitions : [];
  return transitions
    .filter((t) => text(t?.to) === state)
    .map((t) => ({ name: text(t.name), label: text(t.label) || text(t.name) || 'with no name', from: texts(t.from).map((from) => labelOfState(definition, from)) }));
}

/**
 * Who a right names, in words: a formula as it is written, or "anybody
 * in" a list of groups, which is the short way the class format has.
 *
 * @param {unknown} right
 */
export function whoMay(right) {
  if (Array.isArray(right)) return right.length > 0 ? `anybody in ${right.map(text).join(' or ')}` : 'nobody';
  return text(right);
}

/**
 * A right as the formula it means. The class format has a short way to
 * write "anybody in one of these groups", a list of their names; as a
 * formula that is INGROUP of each, joined by OR.
 *
 * @param {unknown} right
 */
export function asFormula(right) {
  if (!Array.isArray(right)) return text(right);
  if (right.length === 0) return 'FALSE';
  return right.map((group) => `INGROUP("${text(group).replaceAll('"', '""')}")`).join(' OR ');
}

/**
 * The lines of the rights table under one state: `*` for every state.
 * Each line names a variable, a section or `*`, every variable, and
 * says who may write it, who may see it, or both.
 *
 * `write` and `read` are in words, for reading; `writeAs` and `readAs`
 * are the same as a formula, for a box that holds one.
 *
 * @param {Definition} definition
 * @param {string} state
 * @returns {{ what: string, label: string, about: 'every variable' | 'variable' | 'section' | 'unknown', write: string | null, read: string | null, writeAs: string, readAs: string }[]}
 */
export function rightsIn(definition, state) {
  const lines = definition.rights?.[state] ?? {};
  const sections = new Map();
  /** @param {Part[]} parts */
  const gather = (parts) => {
    for (const part of parts) {
      if (part.name) sections.set(part.name, part.label);
      gather(part.parts);
    }
  };
  gather(outline(definition));
  return Object.entries(lines).map(([what, right]) => {
    const variable = definition.variables?.[what];
    /** @type {'every variable' | 'variable' | 'section' | 'unknown'} */
    const about = what === '*' ? 'every variable' : variable ? 'variable' : sections.has(what) ? 'section' : 'unknown';
    const label = what === '*' ? 'Every variable' : variable ? text(variable.label) || what : sections.get(what) || what;
    return {
      what,
      label,
      about,
      write: right?.write !== undefined ? whoMay(right.write) : null,
      read: right?.read !== undefined ? whoMay(right.read) : null,
      writeAs: right?.write !== undefined ? asFormula(right.write) : '',
      readAs: right?.read !== undefined ? asFormula(right.read) : '',
    };
  });
}

/**
 * The four lines of a class that say who may do what with a document
 * as a whole. A line the class leaves out lets nobody through, and its
 * formula is null.
 *
 * @param {Definition} definition
 * @returns {{ line: string, what: string, formula: string | null }[]}
 */
export function linesOf(definition) {
  const access = definition.access ?? {};
  return [
    { line: 'read', what: 'See a document' },
    { line: 'create', what: 'Make a new one' },
    { line: 'update', what: 'Change its values' },
    { line: 'delete', what: 'Delete it' },
  ].map(({ line, what }) => ({ line, what, formula: access[line] !== undefined ? text(access[line]) : null }));
}

/**
 * What one step of a rule does, in a line. The steps that set values
 * are written as the values they set, those that put values back as
 * the values they put back; any other is written as its action and
 * what the class gives it.
 *
 * @param {Record<string, any>} step
 */
function stepWords(step) {
  const { action, ...given } = step ?? {};
  if (action === 'set' && given.values && typeof given.values === 'object') {
    return `set ${Object.entries(given.values)
      .map(([name, formula]) => `${name} = ${text(formula)}`)
      .join(', ')}`;
  }
  if (action === 'reset' && Array.isArray(given.variables) && given.variables.length > 0) {
    return `put ${texts(given.variables).join(', ')} back to ${given.variables.length === 1 ? 'its first value' : 'their first values'}`;
  }
  const rest = Object.entries(given)
    .map(([name, value]) => `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');
  return rest ? `${text(action)} (${rest})` : text(action);
}

/**
 * A rule in words: when it runs, the condition it asks, what it does.
 *
 * @param {Definition} definition
 * @param {Record<string, any>} rule
 * @returns {{ when: string, only: string, does: string[] }}
 */
function ruleWords(definition, rule) {
  /** @type {any[]} */
  const transitions = Array.isArray(definition.transitions) ? definition.transitions : [];
  const on = text(rule?.on);
  let when = `On ${on}`;
  if (on === 'create') when = 'When a document is made';
  else if (on === 'delete') when = 'When a document is deleted';
  else if (on === 'values_change') when = `When ${texts(rule.variables).join(' or ') || 'a value'} changes`;
  else if (on === 'enter') when = `When a document enters ${labelOfState(definition, text(rule.state))}`;
  else if (on === 'exit') when = `When a document leaves ${labelOfState(definition, text(rule.state))}`;
  else if (on === 'transition') {
    const taken = transitions.find((t) => t?.name === rule.name);
    when = `When ${text(taken?.label) || text(rule.name)} is taken`;
  }
  /** @type {any[]} */
  const steps = Array.isArray(rule?.do) ? rule.do : [];
  return { when, only: text(rule?.if), does: steps.map(stepWords) };
}

/**
 * The rules of a class that are about one state: those that run when a
 * document enters or leaves it, and those that run when a transition
 * out of it is taken. With no state, the rules that are about none:
 * those of a new document, of a change of a value and of a deletion.
 * Each with its place in the list of the class, by which it is told:
 * a rule has no name.
 *
 * @param {Definition} definition
 * @param {string} state '' for the rules that are about no state
 * @returns {{ at: number, when: string, only: string, does: string[] }[]}
 */
export function rulesAt(definition, state) {
  /** @type {any[]} */
  const rules = Array.isArray(definition.rules) ? definition.rules : [];
  const out = new Set(waysOut(definition, state).map((way) => way.name));
  return rules
    .map((rule, at) => ({ rule, at }))
    .filter(({ rule }) => {
      const on = text(rule?.on);
      if (on === 'enter' || on === 'exit') return state !== '' && text(rule.state) === state;
      if (on === 'transition') return state !== '' && out.has(text(rule.name));
      return state === '';
    })
    .map(({ rule, at }) => ({ at, ...ruleWords(definition, rule) }));
}

/**
 * The same rules in words alone.
 *
 * @param {Definition} definition
 * @param {string} state '' for the rules that are about no state
 * @returns {{ when: string, only: string, does: string[] }[]}
 */
export function rulesAbout(definition, state) {
  return rulesAt(definition, state).map(({ when, only, does }) => ({ when, only, does }));
}

/**
 * What a new class begins as: a small class that works, for a designer
 * to change. A document of it has a subject, goes from Draft to Done,
 * and is its author's: its author sees it, changes it while it is a
 * draft and finishes it. Nobody deletes one.
 *
 * It opens nothing to anybody but the author, so a class made in a
 * hurry shows no document to the wrong person; a designer widens it.
 *
 * @param {string} name
 * @param {string} label
 * @param {string} [app] the app the class belongs to, when it is made inside one
 * @returns {Definition}
 */
export function starter(name, label, app = '') {
  return {
    name,
    ...(app ? { app } : {}),
    label: label || name,
    description: '',
    title: 'subject',
    variables: {
      subject: { type: 'text', required: true, label: 'Subject', description: 'What it is about, in a few words.', list: true },
    },
    states: {
      initial: 'draft',
      list: ['draft', 'done'],
      final: ['done'],
      labels: { draft: 'Draft', done: 'Done' },
      descriptions: { draft: 'Its author writes it and may change it.', done: 'Finished. It changes no more.' },
    },
    transitions: [{ name: 'finish', from: 'draft', to: 'done', label: 'Finish', description: 'Its author says it is done.' }],
    access: {
      read: 'CREATEDBY() = USER()',
      create: 'INGROUP("everyone")',
      update: 'CREATEDBY() = USER() AND STATE() = "draft"',
      delete: 'FALSE',
      transition: { finish: 'CREATEDBY() = USER()' },
    },
  };
}

// Changing a class through the lists. Each of these takes a class as
// it is read from its text and changes it in place; the page then
// writes the text again. None of them judges: whether the class is
// still right is the server's to say.

/** The types the lists offer for a value people give. Any other is written in the text. */
export const TYPES = ['text', 'number', 'int', 'decimal', 'money', 'bool', 'date', 'datetime'];

/**
 * Every section of a class, those inside others after them, each with
 * how deep it lies.
 *
 * @param {Definition} definition
 * @returns {{ name: string, label: string, depth: number }[]}
 */
export function sectionsOf(definition) {
  /** @type {{ name: string, label: string, depth: number }[]} */
  const all = [];
  /** @param {Part[]} parts @param {number} depth */
  const walk = (parts, depth) => {
    for (const part of parts) {
      if (part.name) all.push({ name: part.name, label: part.label, depth });
      walk(part.parts, part.name ? depth + 1 : depth);
    }
  };
  walk(outline(definition), 0);
  return all;
}

/**
 * Does something with every section of a class as it is written, the
 * ones inside others too.
 *
 * @param {Record<string, any> | undefined} sections
 * @param {(name: string, section: Record<string, any>) => void} visit
 */
function eachSection(sections, visit) {
  for (const [name, section] of Object.entries(sections ?? {})) {
    if (!section || typeof section !== 'object') continue;
    visit(name, section);
    eachSection(section.sections, visit);
  }
}

/**
 * The section a variable is in, or '' when it is in none.
 *
 * @param {Definition} definition
 * @param {string} variable
 */
export function sectionOfVariable(definition, variable) {
  let found = '';
  eachSection(definition.sections, (name, section) => {
    if (!found && texts(section.variables).includes(variable)) found = name;
  });
  return found;
}

/**
 * Sets one word of a variable, or takes it out: an empty text, false,
 * an empty list and nothing at all take it out, so that the text of
 * the class says only what is so.
 *
 * @param {Definition} definition
 * @param {string} variable
 * @param {string} word label, description, type, required, default and so on
 * @param {unknown} value
 */
export function setWord(definition, variable, word, value) {
  const it = definition.variables?.[variable];
  if (!it || typeof it !== 'object') return;
  const empty = value === undefined || value === null || value === false || value === '' || (Array.isArray(value) && value.length === 0);
  if (empty) delete it[word];
  else it[word] = value;
}

/**
 * Makes a variable one the class works out by a formula, or one that
 * people give a value. The words that belong to the other kind are
 * taken out: a worked-out variable is not required and has no first
 * value, and a given one has no formula.
 *
 * @param {Definition} definition
 * @param {string} variable
 * @param {boolean} computed
 */
export function setComputed(definition, variable, computed) {
  const it = definition.variables?.[variable];
  if (!it || typeof it !== 'object') return;
  if (computed) {
    if (it.formula === undefined) it.formula = '';
    for (const word of ['type', 'required', 'default', 'values', 'min', 'max', 'scale']) delete it[word];
  } else {
    for (const word of ['formula', 'mode', 'on']) delete it[word];
    if (!it.type) it.type = 'text';
  }
}

/**
 * Adds a variable to a class: a text, for the designer to change. In a
 * section, it goes to the end of that section.
 *
 * @param {Definition} definition
 * @param {string} name
 * @param {string} section '' for no section
 */
export function addVariable(definition, name, section) {
  if (!definition.variables || typeof definition.variables !== 'object') definition.variables = {};
  definition.variables[name] = { type: 'text' };
  if (section) moveVariable(definition, name, section);
}

/**
 * Takes a variable out of a class and out of its sections. What still
 * reads it, a formula or a right, is left as it is: the server says so
 * when the class is checked.
 *
 * @param {Definition} definition
 * @param {string} name
 */
export function removeVariable(definition, name) {
  if (definition.variables) delete definition.variables[name];
  eachSection(definition.sections, (_, section) => {
    if (Array.isArray(section.variables)) section.variables = section.variables.filter((/** @type {unknown} */ one) => one !== name);
  });
}

/**
 * Puts a variable into a section, at its end, or into none.
 *
 * @param {Definition} definition
 * @param {string} name
 * @param {string} section '' for no section
 */
export function moveVariable(definition, name, section) {
  eachSection(definition.sections, (at, it) => {
    if (Array.isArray(it.variables)) it.variables = it.variables.filter((/** @type {unknown} */ one) => one !== name);
    if (at === section) it.variables = [...texts(it.variables), name];
  });
}

/**
 * A range end as the class writes it: a number for a number and an
 * int, and the digits as text for a decimal and a money, which are
 * exact. What is no number is kept as typed, for the server to refuse
 * in its words.
 *
 * @param {string} typed
 * @param {string} type
 */
export function asRangeEnd(typed, type) {
  const written = typed.trim();
  if (written === '') return '';
  if ((type === 'number' || type === 'int') && /^-?\d+(\.\d+)?$/.test(written)) return Number(written);
  return written;
}

/**
 * Whether a value is nothing to write: an empty text, false, an empty
 * list, or nothing at all.
 *
 * @param {unknown} value
 */
const nothing = (value) => value === undefined || value === null || value === false || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * Sets one word of the class itself, label, plural, description or
 * title, or takes it out when it is empty.
 *
 * @param {Definition} definition
 * @param {string} word
 * @param {unknown} value
 */
export function setClassWord(definition, word, value) {
  if (nothing(value)) delete definition[word];
  else definition[word] = value;
}

/**
 * Sets one of the four lines that say who may do what with a document
 * as a whole, read, create, update or delete, or takes it out: a line
 * left out lets nobody through.
 *
 * @param {Definition} definition
 * @param {string} line
 * @param {string} formula
 */
export function setLine(definition, line, formula) {
  if (!definition.access || typeof definition.access !== 'object') {
    if (nothing(formula)) return;
    definition.access = {};
  }
  if (nothing(formula)) delete definition.access[line];
  else definition.access[line] = formula;
}

/**
 * Sets the label or the description of a state, or takes it out. The
 * class keeps both by the name of the state.
 *
 * @param {Definition} definition
 * @param {string} state
 * @param {'label' | 'description'} word
 * @param {string} value
 */
export function setStateWord(definition, state, word, value) {
  if (!definition.states || typeof definition.states !== 'object') return;
  const where = word === 'label' ? 'labels' : 'descriptions';
  const words = definition.states[where];
  if (nothing(value)) {
    if (words && typeof words === 'object') {
      delete words[state];
      if (Object.keys(words).length === 0) delete definition.states[where];
    }
    return;
  }
  if (!words || typeof words !== 'object') definition.states[where] = {};
  definition.states[where][state] = value;
}

/**
 * Makes a state the one a new document starts in.
 *
 * @param {Definition} definition
 * @param {string} state
 */
export function setInitial(definition, state) {
  if (definition.states && typeof definition.states === 'object') definition.states.initial = state;
}

/**
 * Makes a state final, one in which a document is finished, or not.
 * The final states are kept in the order of the states.
 *
 * @param {Definition} definition
 * @param {string} state
 * @param {boolean} final
 */
export function setFinal(definition, state, final) {
  if (!definition.states || typeof definition.states !== 'object') return;
  const now = new Set(texts(definition.states.final));
  if (final) now.add(state);
  else now.delete(state);
  const ordered = texts(definition.states.list).filter((one) => now.has(one));
  if (ordered.length > 0) definition.states.final = ordered;
  else delete definition.states.final;
}

/**
 * Adds a state, after the others. The first state of a class is the
 * one a new document starts in.
 *
 * @param {Definition} definition
 * @param {string} name
 */
export function addState(definition, name) {
  if (!definition.states || typeof definition.states !== 'object') definition.states = { initial: name, list: [] };
  definition.states.list = [...texts(definition.states.list), name];
}

/**
 * Takes a state out of a class, with what is the state's own: its
 * label, its description, its place among the final states and the
 * rights written for it. A transition that leaves it or leads to it is
 * left as it is: where such a move should go now is the designer's to
 * say, and the server names each when the class is checked.
 *
 * @param {Definition} definition
 * @param {string} name
 */
export function removeState(definition, name) {
  const states = definition.states;
  if (!states || typeof states !== 'object') return;
  states.list = texts(states.list).filter((one) => one !== name);
  setFinal(definition, name, false);
  setStateWord(definition, name, 'label', '');
  setStateWord(definition, name, 'description', '');
  if (definition.rights && typeof definition.rights === 'object') {
    delete definition.rights[name];
    if (Object.keys(definition.rights).length === 0) delete definition.rights;
  }
}

/**
 * The transitions of a class as they are written, each with its place
 * in the list. A transition is told by its place: one made by the
 * engine itself may have no name.
 *
 * @param {Definition} definition
 * @returns {Record<string, any>[]}
 */
const moves = (definition) => (Array.isArray(definition.transitions) ? definition.transitions : []);

/**
 * Sets one word of a transition, label, description, to, guard, after
 * or at, or takes it out when it is empty.
 *
 * @param {Definition} definition
 * @param {number} at its place in the list
 * @param {string} word
 * @param {unknown} value
 */
export function setMoveWord(definition, at, word, value) {
  const move = moves(definition)[at];
  if (!move || typeof move !== 'object') return;
  if (nothing(value)) delete move[word];
  else move[word] = value;
}

/**
 * Sets who may take a transition: the line the class keeps for it. An
 * empty one takes the line out, and the transition then asks the line
 * of the class for changing a document.
 *
 * @param {Definition} definition
 * @param {number} at its place in the list
 * @param {string} formula
 */
export function setMoveWho(definition, at, formula) {
  const name = moves(definition)[at]?.name;
  if (name === undefined) return;
  if (nothing(formula)) {
    const lines = definition.access?.transition;
    if (lines && typeof lines === 'object') {
      delete lines[name];
      if (Object.keys(lines).length === 0) delete definition.access.transition;
    }
    return;
  }
  if (!definition.access || typeof definition.access !== 'object') definition.access = {};
  if (!definition.access.transition || typeof definition.access.transition !== 'object') definition.access.transition = {};
  definition.access.transition[name] = formula;
}

/**
 * Adds a transition out of a state, after the others, and answers its
 * place in the list.
 *
 * @param {Definition} definition
 * @param {string} name
 * @param {string} from the state it leaves
 * @param {string} to the state it enters
 * @returns {number}
 */
export function addMove(definition, name, from, to) {
  if (!Array.isArray(definition.transitions)) definition.transitions = [];
  definition.transitions.push({ name, from, to });
  return definition.transitions.length - 1;
}

/**
 * Takes a transition out of a class, with the line that says who may
 * take it.
 *
 * @param {Definition} definition
 * @param {number} at its place in the list
 */
export function removeMove(definition, at) {
  if (!moves(definition)[at]) return;
  setMoveWho(definition, at, '');
  definition.transitions.splice(at, 1);
  if (definition.transitions.length === 0) delete definition.transitions;
}

/**
 * The ways out of a state with the place of each in the list of
 * transitions, for the lists that change them.
 *
 * @param {Definition} definition
 * @param {string} state
 * @returns {number[]}
 */
export function placesOut(definition, state) {
  /** @type {number[]} */
  const places = [];
  moves(definition).forEach((move, at) => {
    if (texts(move?.from).includes(state)) places.push(at);
  });
  return places;
}

/**
 * What a line about single variables may be about, in one state, and
 * has no line yet: every variable, each section, each variable.
 *
 * @param {Definition} definition
 * @param {string} state the name of a state, or `*` for every state
 * @returns {{ what: string, words: string }[]}
 */
export function linesToAdd(definition, state) {
  const has = new Set(Object.keys(definition.rights?.[state] ?? {}));
  /** @type {{ what: string, words: string }[]} */
  const all = [{ what: '*', words: 'Every variable' }];
  /** @param {Part[]} parts */
  const gather = (parts) => {
    for (const part of parts) {
      if (part.name) all.push({ what: part.name, words: `The section ${part.label || part.name}` });
      gather(part.parts);
    }
  };
  gather(outline(definition));
  for (const [name, variable] of Object.entries(definition.variables ?? {})) {
    all.push({ what: name, words: text(variable?.label) ? `${name}, ${text(variable.label)}` : name });
  }
  return all.filter((one) => !has.has(one.what));
}

/**
 * Adds a line about single variables under a state, where there is
 * none. It begins by letting nobody set them, FALSE: a line narrows,
 * and the designer then says who may.
 *
 * @param {Definition} definition
 * @param {string} state the name of a state, or `*` for every state
 * @param {string} what a variable, a section, or `*` for every variable
 */
export function addRightLine(definition, state, what) {
  if (!definition.rights || typeof definition.rights !== 'object') definition.rights = {};
  if (!definition.rights[state] || typeof definition.rights[state] !== 'object') definition.rights[state] = {};
  if (definition.rights[state][what] === undefined) definition.rights[state][what] = { write: 'FALSE' };
}

/**
 * Takes a line about single variables out. A state left with no line,
 * and a table left with no state, go with it.
 *
 * @param {Definition} definition
 * @param {string} state
 * @param {string} what
 */
export function removeRightLine(definition, state, what) {
  const lines = definition.rights?.[state];
  if (!lines || typeof lines !== 'object') return;
  delete lines[what];
  if (Object.keys(lines).length === 0) delete definition.rights[state];
  if (Object.keys(definition.rights).length === 0) delete definition.rights;
}

/**
 * Says who may set, or who may see, what a line is about, as a
 * formula. An empty formula takes that half of the line out, and a
 * line with neither half goes: the server takes no line that says
 * nothing.
 *
 * @param {Definition} definition
 * @param {string} state
 * @param {string} what
 * @param {'write' | 'read'} right
 * @param {string} formula
 */
export function setRight(definition, state, what, right, formula) {
  if (nothing(formula)) {
    const line = definition.rights?.[state]?.[what];
    if (!line || typeof line !== 'object') return;
    delete line[right];
    if (Object.keys(line).length === 0) removeRightLine(definition, state, what);
    return;
  }
  if (!definition.rights || typeof definition.rights !== 'object') definition.rights = {};
  if (!definition.rights[state] || typeof definition.rights[state] !== 'object') definition.rights[state] = {};
  if (!definition.rights[state][what] || typeof definition.rights[state][what] !== 'object') definition.rights[state][what] = {};
  definition.rights[state][what][right] = formula;
}

/**
 * The sections a variable lies in: its own first, then each one
 * around that one, outwards. Empty for a variable in no section.
 *
 * @param {Definition} definition
 * @param {string} variable
 * @returns {string[]}
 */
export function sectionsAround(definition, variable) {
  /** @type {string[]} */
  let found = [];
  /** @param {Record<string, any> | undefined} sections @param {string[]} around */
  const look = (sections, around) => {
    for (const [name, section] of Object.entries(sections ?? {})) {
      if (!section || typeof section !== 'object') continue;
      const here = [name, ...around];
      if (found.length === 0 && texts(section.variables).includes(variable)) found = here;
      look(section.sections, here);
    }
  };
  look(definition.sections, []);
  return found;
}

/**
 * The line about single variables that is asked for one variable in
 * one state, for who may set it or for who may see it. Null where no
 * line says anything: the lines of the whole class decide alone.
 *
 * The engine looks in this order and takes the first line that says
 * something about the right in question (its chapter "Who may"): the
 * state of the document and the variable by its name; that state and
 * the variable's section, then each section around it, outwards; that
 * state and every variable; then the same three for every state. So a
 * state's own line comes before a line for every state, even one that
 * names the variable.
 *
 * @param {Definition} definition
 * @param {string} state the name of a state
 * @param {string} variable
 * @param {'write' | 'read'} right
 * @returns {{ state: string, what: string, about: 'variable' | 'section' | 'every variable', formula: string } | null}
 *   the line: under which state it is written, `*` for every state; what it is about; and who it names, as a formula
 */
export function decides(definition, state, variable, right) {
  const names = [variable, ...sectionsAround(definition, variable), '*'];
  for (const under of [state, '*']) {
    const lines = definition.rights?.[under];
    if (!lines || typeof lines !== 'object') continue;
    for (const what of names) {
      const said = lines[what]?.[right];
      if (said !== undefined) return { state: under, what, about: what === '*' ? 'every variable' : what === variable ? 'variable' : 'section', formula: asFormula(said) };
    }
  }
  return null;
}

/**
 * Who may set and who may see one variable, state by state: for each
 * state of the class, the line that is asked for each right, or null
 * where none is. A final state is told as such, for nobody sets a
 * value of a document that is finished.
 *
 * @param {Definition} definition
 * @param {string} variable
 * @returns {{ state: string, label: string, final: boolean, write: ReturnType<typeof decides>, read: ReturnType<typeof decides> }[]}
 */
export function whoDecides(definition, variable) {
  return statesOf(definition).map((state) => ({
    state: state.name,
    label: state.label,
    final: state.final,
    write: decides(definition, state.name, variable, 'write'),
    read: decides(definition, state.name, variable, 'read'),
  }));
}

/**
 * Where a line is, in words: what it is about, and whether it is
 * written under the state or for every state.
 *
 * @param {Definition} definition
 * @param {NonNullable<ReturnType<typeof decides>>} line
 */
export function whereWords(definition, line) {
  const section = line.about === 'section' ? sectionsOf(definition).find((one) => one.name === line.what) : undefined;
  const about = line.about === 'every variable' ? 'the line for every variable' : line.about === 'variable' ? 'its own line' : `the line for the section ${section?.label || line.what}`;
  return `${about}, ${line.state === '*' ? 'for every state' : 'in this state'}`;
}

/**
 * Where a section is written: the list of sections that holds it,
 * what holds that list, the class itself or a section, and the names
 * of the sections around it, the nearest first. Null where the class
 * has no section of that name.
 *
 * @param {Definition} definition
 * @param {string} name
 * @returns {{ section: Record<string, any>, holder: Record<string, any>, around: string[] } | null}
 */
function whereSection(definition, name) {
  /** @type {{ section: Record<string, any>, holder: Record<string, any>, around: string[] } | null} */
  let found = null;
  /** @param {Record<string, any>} holder @param {string[]} around */
  const look = (holder, around) => {
    for (const [at, section] of Object.entries(holder.sections ?? {})) {
      if (!section || typeof section !== 'object') continue;
      if (!found && at === name) found = { section, holder, around };
      look(section, [at, ...around]);
    }
  };
  look(definition, []);
  return found;
}

/**
 * A section as its card shows it: its words, the section it lies in,
 * '' at the top, and what it holds. Null where the class has no
 * section of that name.
 *
 * @param {Definition} definition
 * @param {string} name
 * @returns {{ name: string, label: string, description: string, inside: string, variables: string[], sections: string[] } | null}
 */
export function sectionWords(definition, name) {
  const at = whereSection(definition, name);
  if (!at) return null;
  return {
    name,
    label: text(at.section.label),
    description: text(at.section.description),
    inside: at.around[0] ?? '',
    variables: texts(at.section.variables),
    sections: Object.keys(at.section.sections ?? {}),
  };
}

/**
 * Sets the label or the description of a section, or takes it out.
 *
 * @param {Definition} definition
 * @param {string} name
 * @param {'label' | 'description'} word
 * @param {string} value
 */
export function setSectionWord(definition, name, word, value) {
  const at = whereSection(definition, name);
  if (!at) return;
  if (nothing(value)) delete at.section[word];
  else at.section[word] = value;
}

/**
 * Adds a section at the end of the top level, holding one variable,
 * which leaves the section it was in: the server takes no section
 * with nothing in it, so a section begins with what it is for.
 *
 * @param {Definition} definition
 * @param {string} name
 * @param {string} first the variable it begins with
 */
export function addSection(definition, name, first) {
  if (!definition.sections || typeof definition.sections !== 'object') definition.sections = {};
  if (definition.sections[name] === undefined) definition.sections[name] = { variables: [] };
  moveVariable(definition, first, name);
}

/**
 * Takes a section out. Its variables stay in the class, in no section,
 * and the sections inside it take its place, in their order. A line
 * about single variables that names it is left as it is: the server
 * says so when the class is checked.
 *
 * @param {Definition} definition
 * @param {string} name
 */
export function removeSection(definition, name) {
  const at = whereSection(definition, name);
  if (!at) return;
  /** @type {Record<string, any>} */
  const next = {};
  for (const [one, section] of Object.entries(at.holder.sections)) {
    if (one === name) Object.assign(next, section.sections ?? {});
    else next[one] = section;
  }
  if (Object.keys(next).length > 0) at.holder.sections = next;
  else delete at.holder.sections;
}

/**
 * The sections a section may be moved into: the top, and every section
 * that is not the section itself and does not lie inside it.
 *
 * @param {Definition} definition
 * @param {string} name
 * @returns {{ name: string, label: string, depth: number }[]}
 */
export function placesFor(definition, name) {
  /** @type {Set<string>} */
  const own = new Set([name]);
  /** @param {Record<string, any> | undefined} sections */
  const gather = (sections) => {
    for (const [one, section] of Object.entries(sections ?? {})) {
      own.add(one);
      gather(section?.sections);
    }
  };
  gather(whereSection(definition, name)?.section.sections);
  return [{ name: '', label: 'At the top', depth: 0 }, ...sectionsOf(definition).filter((one) => !own.has(one.name))];
}

/**
 * Moves a section, with all it holds, into another section or to the
 * top, to the end of the sections there. A section is not moved into
 * itself or into one that lies inside it.
 *
 * @param {Definition} definition
 * @param {string} name
 * @param {string} into the section it goes into, '' for the top
 */
export function moveSection(definition, name, into) {
  const at = whereSection(definition, name);
  if (!at || !placesFor(definition, name).some((place) => place.name === into)) return;
  if ((at.around[0] ?? '') === into) return;
  const to = into ? whereSection(definition, into)?.section : definition;
  if (!to) return;
  delete at.holder.sections[name];
  if (Object.keys(at.holder.sections).length === 0) delete at.holder.sections;
  if (!to.sections || typeof to.sections !== 'object') to.sections = {};
  to.sections[name] = at.section;
}

/**
 * Where a section is written, as the server names the place: a JSON
 * pointer. '' where the class has no section of that name.
 *
 * @param {Definition} definition
 * @param {string} name
 */
export function pathOfSection(definition, name) {
  const at = whereSection(definition, name);
  return at ? [...at.around].reverse().concat(name).map((one) => `/sections/${one}`).join('') : '';
}

/**
 * Puts one name of a list a step earlier or later, among the names of
 * that list that are given as its neighbours, and answers the list in
 * its new order. The other names keep their places.
 *
 * @param {string[]} all every name, in order
 * @param {string[]} beside the names it moves among, in order; `name` is one of them
 * @param {string} name
 * @param {-1 | 1} by
 */
function shifted(all, beside, name, by) {
  const other = beside[beside.indexOf(name) + by];
  if (other === undefined || !beside.includes(name)) return all;
  return all.map((one) => (one === name ? other : one === other ? name : one));
}

/**
 * The place of a variable among the variables beside it: those of its
 * section, or those in no section. Counted from 1; `of` is how many
 * they are.
 *
 * @param {Definition} definition
 * @param {string} name
 * @returns {{ at: number, of: number }}
 */
export function placeOfVariable(definition, name) {
  /** @param {Part[]} parts @returns {Part | undefined} */
  const find = (parts) => {
    for (const part of parts) {
      const found = part.variables.includes(name) ? part : find(part.parts);
      if (found) return found;
    }
    return undefined;
  };
  const part = find(outline(definition));
  return part ? { at: part.variables.indexOf(name) + 1, of: part.variables.length } : { at: 0, of: 0 };
}

/**
 * Moves a variable a step earlier or later among the variables beside
 * it: the order a document shows its values in. In a section that is
 * the order its list is written in; in no section it is the order the
 * class writes its variables in.
 *
 * @param {Definition} definition
 * @param {string} name
 * @param {-1 | 1} by
 */
export function shiftVariable(definition, name, by) {
  const section = sectionOfVariable(definition, name);
  if (section) {
    eachSection(definition.sections, (at, it) => {
      if (at === section) it.variables = shifted(texts(it.variables), texts(it.variables), name, by);
    });
    return;
  }
  const loose = outline(definition).find((part) => part.name === '')?.variables ?? [];
  const variables = definition.variables ?? {};
  definition.variables = Object.fromEntries(shifted(Object.keys(variables), loose, name, by).map((one) => [one, variables[one]]));
}

/**
 * The place of a section among the sections beside it, at the top or
 * inside the same section. Counted from 1; `of` is how many they are.
 *
 * @param {Definition} definition
 * @param {string} name
 * @returns {{ at: number, of: number }}
 */
export function placeOfSection(definition, name) {
  const at = whereSection(definition, name);
  if (!at) return { at: 0, of: 0 };
  const beside = Object.keys(at.holder.sections);
  return { at: beside.indexOf(name) + 1, of: beside.length };
}

/**
 * Moves a section a step earlier or later among the sections beside
 * it, with all it holds.
 *
 * @param {Definition} definition
 * @param {string} name
 * @param {-1 | 1} by
 */
export function shiftSection(definition, name, by) {
  const at = whereSection(definition, name);
  if (!at) return;
  const sections = at.holder.sections;
  const beside = Object.keys(sections);
  at.holder.sections = Object.fromEntries(shifted(beside, beside, name, by).map((one) => [one, sections[one]]));
}

// What a class does by itself: its rules. A rule says when it runs,
// on what condition, and what it does, one action after another. It
// has no name: it is told by its place in the list of the class.

/**
 * The variables people give: those the class does not work out. A
 * rule sets these, and puts these back, and no other.
 *
 * @param {Definition} definition
 * @returns {{ name: string, label: string }[]}
 */
export function inputsOf(definition) {
  return Object.entries(definition.variables ?? {})
    .filter(([, variable]) => variable?.formula === undefined)
    .map(([name, variable]) => ({ name, label: text(variable?.label) || name }));
}

/** @param {Definition} definition @returns {any[]} */
const rulesOf = (definition) => (Array.isArray(definition.rules) ? definition.rules : []);

/**
 * A rule with its words in the order a class writes them: when, about
 * what, on what condition, what it does. Whatever else it holds comes
 * after, as it was.
 *
 * @param {Record<string, any>} rule
 */
function tidy(rule) {
  const { on, state, name, variables, if: only, do: does, ...rest } = rule;
  /** @type {Record<string, any>} */
  const next = { on };
  if (state !== undefined) next.state = state;
  if (name !== undefined) next.name = name;
  if (variables !== undefined) next.variables = variables;
  if (only !== undefined) next.if = only;
  next.do = does ?? [];
  return { ...next, ...rest };
}

/**
 * What sets a rule off, in one word of the lists: `create`, `delete`,
 * `values_change`, `enter:<state>`, `exit:<state>` or
 * `transition:<name>`.
 *
 * @param {Record<string, any> | undefined} rule
 */
export function eventOf(rule) {
  const on = text(rule?.on);
  if (on === 'enter' || on === 'exit') return `${on}:${text(rule?.state)}`;
  if (on === 'transition') return `transition:${text(rule?.name)}`;
  return on;
}

/**
 * Everything that can set a rule of this class off, each with its
 * words: for the list a rule's card chooses from.
 *
 * @param {Definition} definition
 * @returns {{ event: string, words: string }[]}
 */
export function eventsOf(definition) {
  const states = statesOf(definition);
  /** @type {Map<string, string>} */
  const taken = new Map();
  for (const move of moves(definition)) if (text(move?.name) && !taken.has(text(move.name))) taken.set(text(move.name), text(move.label) || text(move.name));
  return [
    { event: 'create', words: 'A document is made' },
    { event: 'values_change', words: 'A value changes' },
    ...states.map((state) => ({ event: `enter:${state.name}`, words: `A document enters ${state.label}` })),
    ...states.map((state) => ({ event: `exit:${state.name}`, words: `A document leaves ${state.label}` })),
    ...[...taken].map(([name, label]) => ({ event: `transition:${name}`, words: `${label} is taken` })),
    { event: 'delete', words: 'A document is deleted' },
  ];
}

/**
 * What can set a rule off in one place of the lists: under a state,
 * a document entering or leaving it and each transition out of it;
 * under the whole class, a new document, a deletion, and a change of
 * each value people give, written `values_change:<variable>`.
 *
 * @param {Definition} definition
 * @param {string} state '' for the whole class
 * @returns {{ event: string, words: string }[]}
 */
export function eventsAt(definition, state) {
  if (state === '') {
    return [
      { event: 'create', words: 'A document is made' },
      ...inputsOf(definition).map((one) => ({ event: `values_change:${one.name}`, words: `${one.label} changes` })),
      { event: 'delete', words: 'A document is deleted' },
    ];
  }
  const label = labelOfState(definition, state);
  return [
    { event: `enter:${state}`, words: `A document enters ${label}` },
    { event: `exit:${state}`, words: `A document leaves ${label}` },
    ...waysOut(definition, state)
      .filter((way) => way.name)
      .map((way) => ({ event: `transition:${way.name}`, words: `${way.label} is taken` })),
  ];
}

/**
 * Says what sets a rule off. What the old event named and the new one
 * does not, a state, a transition or variables, is taken out.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {string} event as `eventOf` writes it; `values_change:<variable>` names the first variable
 */
export function setRuleEvent(definition, at, event) {
  const rule = rulesOf(definition)[at];
  if (!rule || typeof rule !== 'object') return;
  const [on, about = ''] = event.split(':');
  const { state: _state, name: _name, variables, ...rest } = rule;
  /** @type {Record<string, any>} */
  const next = { ...rest, on };
  if (on === 'enter' || on === 'exit') next.state = about;
  if (on === 'transition') next.name = about;
  if (on === 'values_change') next.variables = about ? [about] : Array.isArray(variables) ? variables : [];
  definition.rules[at] = tidy(next);
}

/**
 * Adds a rule at the end of the list, and answers its place. A rule
 * does at least one thing, so it begins by setting one variable, to a
 * formula the designer then writes.
 *
 * @param {Definition} definition
 * @param {string} event what sets it off, as `eventsAt` writes it
 * @param {string} variable the variable it begins by setting
 * @returns {number}
 */
export function addRule(definition, event, variable) {
  if (!Array.isArray(definition.rules)) definition.rules = [];
  definition.rules.push({ on: '', do: [{ action: 'set', values: { [variable]: '' } }] });
  const at = definition.rules.length - 1;
  setRuleEvent(definition, at, event);
  return at;
}

/**
 * Takes a rule out. A class left with no rule keeps no list of them.
 *
 * @param {Definition} definition
 * @param {number} at
 */
export function removeRule(definition, at) {
  if (!Array.isArray(definition.rules) || !definition.rules[at]) return;
  definition.rules.splice(at, 1);
  if (definition.rules.length === 0) delete definition.rules;
}

/**
 * Sets the condition of a rule, a formula, or takes it out: with no
 * condition a rule runs every time.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {string} formula
 */
export function setRuleIf(definition, at, formula) {
  const rule = rulesOf(definition)[at];
  if (!rule || typeof rule !== 'object') return;
  const { if: _only, ...rest } = rule;
  definition.rules[at] = tidy(nothing(formula) ? rest : { ...rest, if: formula });
}

/**
 * Names the variables a rule on a change of values is about.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {string[]} names
 */
export function setRuleVariables(definition, at, names) {
  const rule = rulesOf(definition)[at];
  if (!rule || typeof rule !== 'object') return;
  definition.rules[at] = tidy({ ...rule, variables: names });
}

/**
 * What a rule does, action by action, as its card shows it. An action
 * that sets values is told with each value and its formula; one that
 * puts values back with their names; any other in a line of words,
 * for it is changed in the text.
 *
 * @param {Definition} definition
 * @param {number} at
 * @returns {({ at: number, kind: 'set', values: { variable: string, label: string, formula: string }[] } | { at: number, kind: 'reset', variables: string[] } | { at: number, kind: 'other', words: string })[]}
 */
export function actionsOf(definition, at) {
  /** @type {any[]} */
  const steps = Array.isArray(rulesOf(definition)[at]?.do) ? rulesOf(definition)[at].do : [];
  return steps.map((step, place) => {
    if (step?.action === 'set' && step.values && typeof step.values === 'object') {
      return {
        at: place,
        kind: /** @type {const} */ ('set'),
        values: Object.entries(step.values).map(([variable, formula]) => ({ variable, label: text(definition.variables?.[variable]?.label) || variable, formula: text(formula) })),
      };
    }
    if (step?.action === 'reset') return { at: place, kind: /** @type {const} */ ('reset'), variables: texts(step.variables) };
    return { at: place, kind: /** @type {const} */ ('other'), words: stepWords(step) };
  });
}

/** @param {Definition} definition @param {number} at @returns {any[] | null} the actions of a rule, as the class holds them */
function stepsOf(definition, at) {
  const rule = rulesOf(definition)[at];
  if (!rule || typeof rule !== 'object') return null;
  if (!Array.isArray(rule.do)) rule.do = [];
  return rule.do;
}

/**
 * Adds an action that sets one variable, at the end of what a rule
 * does, and answers its place. The formula is the designer's to write.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {string} variable
 * @returns {number}
 */
export function addSet(definition, at, variable) {
  const steps = stepsOf(definition, at);
  if (!steps) return -1;
  steps.push({ action: 'set', values: { [variable]: '' } });
  return steps.length - 1;
}

/**
 * Says what a variable is set to, in an action that sets values.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {number} place the place of the action in what the rule does
 * @param {string} variable
 * @param {string} formula
 */
export function setSetFormula(definition, at, place, variable, formula) {
  const step = stepsOf(definition, at)?.[place];
  if (!step || step.action !== 'set') return;
  if (!step.values || typeof step.values !== 'object') step.values = {};
  step.values[variable] = formula;
}

/**
 * Takes one variable out of an action that sets values. An action left
 * setting nothing goes with it.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {number} place
 * @param {string} variable
 */
export function removeSetValue(definition, at, place, variable) {
  const steps = stepsOf(definition, at);
  const step = steps?.[place];
  if (!steps || !step || step.action !== 'set' || !step.values) return;
  delete step.values[variable];
  if (Object.keys(step.values).length === 0) steps.splice(place, 1);
}

/**
 * Adds an action that puts one variable back to its first value, at
 * the end of what a rule does, and answers its place.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {string} variable
 * @returns {number}
 */
export function addReset(definition, at, variable) {
  const steps = stepsOf(definition, at);
  if (!steps) return -1;
  steps.push({ action: 'reset', variables: [variable] });
  return steps.length - 1;
}

/**
 * Names the variables an action puts back to their first values.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {number} place
 * @param {string[]} names
 */
export function setResetVariables(definition, at, place, names) {
  const step = stepsOf(definition, at)?.[place];
  if (!step || step.action !== 'reset') return;
  step.variables = names;
}

/**
 * Takes an action out of what a rule does.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {number} place
 */
export function removeAction(definition, at, place) {
  const steps = stepsOf(definition, at);
  if (steps?.[place] !== undefined) steps.splice(place, 1);
}

/**
 * Moves an action of a rule a step earlier or later in what the rule
 * does, and answers its new place: the actions run in their order.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {number} place
 * @param {-1 | 1} by
 * @returns {number}
 */
export function shiftAction(definition, at, place, by) {
  const steps = stepsOf(definition, at);
  const to = place + by;
  if (!steps || steps[place] === undefined || steps[to] === undefined) return place;
  [steps[place], steps[to]] = [steps[to], steps[place]];
  return to;
}

/**
 * The state a rule belongs to in the lists: the one it enters or
 * leaves, or one its transition leaves, the given one when it is among
 * them. '' for a rule that is about no state, and so stands under the
 * whole class.
 *
 * @param {Definition} definition
 * @param {number} at
 * @param {string} [preferred] the state the lists show now
 */
export function homeOfRule(definition, at, preferred = '') {
  const rule = rulesOf(definition)[at];
  const on = text(rule?.on);
  if (on === 'enter' || on === 'exit') return text(rule.state);
  if (on !== 'transition') return '';
  const from = moves(definition)
    .filter((move) => text(move?.name) === text(rule.name))
    .flatMap((move) => texts(move.from));
  return from.includes(preferred) ? preferred : (from[0] ?? '');
}

/**
 * A rule in words, by its place: when it runs, on what condition, and
 * what it does. Null where the class has no rule there.
 *
 * @param {Definition} definition
 * @param {number} at
 */
export function ruleAt(definition, at) {
  const rule = rulesOf(definition)[at];
  return rule && typeof rule === 'object' ? { ...ruleWords(definition, rule), event: eventOf(rule), variables: texts(rule.variables), condition: text(rule.if) } : null;
}

