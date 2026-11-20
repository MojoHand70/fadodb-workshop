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
 * The lines of the rights table under one state: `*` for every state.
 * Each line names a variable, a section or `*`, every variable, and
 * says who may write it, who may see it, or both.
 *
 * @param {Definition} definition
 * @param {string} state
 * @returns {{ what: string, label: string, about: 'every variable' | 'variable' | 'section' | 'unknown', write: string | null, read: string | null }[]}
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
 * are written as the values they set; any other is written as its
 * action and what the class gives it.
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
 *
 * @param {Definition} definition
 * @param {string} state '' for the rules that are about no state
 * @returns {{ when: string, only: string, does: string[] }[]}
 */
export function rulesAbout(definition, state) {
  /** @type {any[]} */
  const rules = Array.isArray(definition.rules) ? definition.rules : [];
  const out = new Set(waysOut(definition, state).map((way) => way.name));
  return rules
    .filter((rule) => {
      const on = text(rule?.on);
      if (on === 'enter' || on === 'exit') return state !== '' && text(rule.state) === state;
      if (on === 'transition') return state !== '' && out.has(text(rule.name));
      return state === '';
    })
    .map((rule) => ruleWords(definition, rule));
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
 * @returns {Definition}
 */
export function starter(name, label) {
  return {
    name,
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
