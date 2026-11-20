// The class as the text stands, tried on a document: a new one, or one
// the server holds.
//
// A designer gives the document values, and the server answers what
// would come of it: what the class works out, the state the document
// is in, the ways out then open, what the class does by itself, and
// what it would refuse. On a document the server holds he may take a
// way out too, and see where the document goes and what the class does
// on the way. The server writes nothing: the command is preview_draft,
// which takes a definition that is not stored.
//
// The page judges nothing here either. It sends what was typed, as a
// document's own page would, and shows the answer.

import { outline, ruleAt, statesOf } from './class.js';
import { Refused, call } from './fado.js';
import { control } from './fields.js';
import { show } from './format.js';
import { make } from './shell.js';

/**
 * Why a way out is closed, in words, by the code the server gives.
 *
 * @param {string} code
 */
function whyClosed(code) {
  if (code === 'guard_false') return 'its condition does not hold';
  if (code === 'forbidden') return 'you may not take it';
  return code || 'the server does not say why';
}

/**
 * The type a worked-out value is shown by, where the class does not
 * declare one: an amount with its currency is a money, a yes or no is
 * a bool. Anything else is shown as the server writes it.
 *
 * @param {unknown} value
 * @param {Record<string, any>} variable
 */
function typeToShow(value, variable) {
  if (typeof variable.type === 'string') return variable.type;
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)? [A-Z]{3}$/.test(value)) return 'money';
  return undefined;
}

/**
 * What one action of a rule did, in a line, with the values the server
 * worked out for it.
 *
 * @param {{ action?: string, args?: Record<string, any> }} step
 */
function didWords(step) {
  const args = step.args ?? {};
  if (step.action === 'set' && args.values && typeof args.values === 'object') {
    return `set ${Object.entries(args.values)
      .map(([name, value]) => `${name} to ${value === null ? 'nothing' : String(value)}`)
      .join(', ')}`;
  }
  if (step.action === 'reset' && Array.isArray(args.variables)) return `put ${args.variables.join(', ')} back`;
  const rest = Object.entries(args)
    .map(([name, value]) => `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');
  return rest ? `${String(step.action)} (${rest})` : String(step.action);
}

/**
 * Makes the view. It is drawn each time it is shown, from the class as
 * the text then stands; what was typed stays while the page is open.
 *
 * @param {object} how
 * @param {HTMLElement} how.root the view; the page says on it what it has asked the server about
 * @param {HTMLElement} how.form where the fields of the document go
 * @param {HTMLElement} how.result where the answer goes
 * @param {HTMLElement} how.said one line: what came of the last try
 * @param {() => Record<string, any> | null} how.draft the class as the text stands, null when it cannot be read
 * @param {() => Promise<any[]>} how.documents the documents of the class the server holds that the person may see, the last made first; none for a class that is not stored
 * @param {{ locale: string, yes?: string, no?: string }} how.person
 * @returns {{ draw: () => void }}
 */
export function tryView({ root, form, result, said, draft, documents, person }) {
  /** The document the class is tried on: the id of one the server holds, or '' for a new one. */
  let on = '';
  /** The way out taken in the try, by the name of its transition, or '' for none. */
  let taking = '';
  /** The documents the person may choose from, as the server last listed them. */
  /** @type {any[]} */
  let known = [];
  /** What the person gave each document, by variable, as the wire carries it: kept apart for a new document and for each the server holds. */
  /** @type {Map<string, Record<string, any>>} */
  const typedFor = new Map();
  /** What the person gave the document the class is tried on now. */
  let tried = /** @type {Record<string, any>} */ ({});
  /** The number of the last drawing: a list of documents that comes back for an older one is left alone. */
  let drawn = 0;

  /** What the document holds before the person gives it anything: the values of one the server holds, nothing for a new one. */
  const base = () => /** @type {Record<string, any>} */ (known.find((one) => one?.id === on)?.values ?? {});
  /** The fields the page cannot read, each with why. */
  /** @type {Map<string, string>} */
  const unread = new Map();
  /** Where a value the class works out is shown, by variable. */
  /** @type {Map<string, HTMLElement>} */
  const cells = new Map();
  /** Under a field, the first value the class gives it when the person gives none. */
  /** @type {Map<string, HTMLElement>} */
  const firsts = new Map();
  /** Under a field, why what was typed is not taken. */
  /** @type {Map<string, HTMLElement>} */
  const whys = new Map();
  /** The number of the last question to the server: an older answer is left alone. */
  let asked = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let waiting;

  /** @param {Record<string, any>} definition @param {string} name */
  const labelOf = (definition, name) => String(definition.variables?.[name]?.label || name);

  /** The currency another amount of the document already has, for an amount that has none yet. */
  const currency = () => {
    for (const value of [...Object.values(tried), ...Object.values(base())]) {
      const found = /^-?\d+(?:\.\d+)? ([A-Z]{3})$/.exec(String(value));
      if (found) return found[1];
    }
    return '';
  };

  /**
   * Says under a field why it is not taken, or takes that away.
   *
   * @param {string} name
   * @param {string} why
   */
  function tell(name, why) {
    const line = whys.get(name);
    if (!line) return;
    line.textContent = why;
    line.hidden = why === '';
    const box = line.closest('.field');
    box?.classList.toggle('field-wrong', why !== '');
    for (const one of box?.querySelectorAll('input, select') ?? []) one.setAttribute('aria-invalid', String(why !== ''));
  }

  /**
   * One variable of the document: a field for a value people give, the
   * value itself for one the class works out.
   *
   * @param {Record<string, any>} definition
   * @param {string} name
   */
  function field(definition, name) {
    const variable = definition.variables?.[name] ?? {};
    const box = make('div', 'field');
    box.dataset.variable = name;
    const label = make('dt', 'field-label');
    const computed = variable.formula !== undefined;
    const set = computed ? null : control({ id: `t-${name}`, variable, type: variable.type, value: Object.hasOwn(tried, name) ? tried[name] : (base()[name] ?? null), locale: person.locale, label: labelOf(definition, name), currency });
    if (computed) {
      const mark = make('span', 'fx', 'fx');
      mark.setAttribute('title', 'Worked out by the class');
      label.append(mark, labelOf(definition, name));
    } else if (set) {
      const forField = make('label', '', labelOf(definition, name));
      forField.setAttribute('for', `t-${name}`);
      label.append(forField);
      if (variable.required) label.append(make('span', 'field-must', ' needed'));
    } else label.append(labelOf(definition, name));
    box.append(label);

    if (set) {
      const holder = make('dd', 'field-input');
      holder.append(...set.parts);
      const why = make('dd', 'field-why');
      why.id = `t-${name}-why`;
      why.hidden = true;
      whys.set(name, why);
      const first = make('dd', 'field-about try-first');
      first.id = `t-${name}-first`;
      firsts.set(name, first);
      for (const one of set.parts) {
        one.setAttribute('aria-describedby', `${why.id} ${first.id}`);
        const typed = () => {
          const read = set.read();
          if ('why' in read) {
            unread.set(name, read.why);
            tell(name, read.why);
          } else {
            unread.delete(name);
            tell(name, '');
            // What is as the document holds it already is no value given. For a new document that is
            // a field left empty, and the class gives its own first value again.
            if (JSON.stringify(read.wire) === JSON.stringify(base()[name] ?? null)) delete tried[name];
            else tried[name] = read.wire;
          }
          delete root.dataset.tried;
          clearTimeout(waiting);
          waiting = setTimeout(ask, 500);
        };
        one.addEventListener('input', typed);
        one.addEventListener('change', typed);
      }
      box.append(holder, why, first);
    } else {
      const value = make('dd', 'field-value field-empty', computed ? '—' : 'A list, rows or an object: not set here yet.');
      value.id = `t-${name}-value`;
      if (computed) cells.set(name, value);
      box.append(value);
    }
    return box;
  }

  /**
   * A part of the outline: its title, its variables, the parts inside it.
   *
   * @param {Record<string, any>} definition
   * @param {import('./class.js').Part} part
   * @param {number} depth
   */
  function partOf(definition, part, depth) {
    const box = make('section', 'inner try-part');
    if (part.name) {
      box.dataset.section = part.name;
      box.append(make(depth === 0 ? 'h3' : 'h4', '', part.label));
    }
    if (part.variables.length > 0) {
      const list = make('dl', 'fields');
      for (const name of part.variables) list.append(field(definition, name));
      box.append(list);
    }
    for (const inner of part.parts) box.append(partOf(definition, inner, depth + 1));
    return box;
  }

  /**
   * Shows what the server answered.
   *
   * @param {Record<string, any>} definition
   * @param {any} preview
   */
  function render(definition, preview) {
    const values = preview?.document?.values ?? {};
    for (const [name, cell] of cells) {
      const variable = definition.variables?.[name] ?? {};
      const shown = show(values[name], { type: typeToShow(values[name], variable), format: variable.format }, person);
      cell.textContent = shown === '' ? '—' : shown;
      cell.classList.toggle('field-empty', shown === '');
    }
    for (const [name, first] of firsts) {
      const variable = definition.variables?.[name] ?? {};
      // A field of a new document that is left empty begins as the class makes it; one the server holds has what it holds.
      const given = on !== '' || Object.hasOwn(tried, name);
      const shown = given ? '' : show(values[name], { type: variable.type, format: variable.format }, person);
      first.textContent = shown === '' ? '' : `Left empty, it begins as ${shown}.`;
      tell(name, '');
    }

    result.replaceChildren();
    /** @param {string} id @param {string} title */
    const block = (id, title) => {
      const box = make('section', 'inner');
      box.id = id;
      box.append(make('h3', '', title));
      result.append(box);
      return box;
    };
    const states = statesOf(definition);
    /** @param {unknown} name */
    const stateLabel = (name) => states.find((one) => one.name === name)?.label ?? String(name ?? '');
    /** @type {any[]} */
    const transitions = Array.isArray(definition.transitions) ? definition.transitions : [];
    /** @param {unknown} name */
    const wayLabel = (name) => String(transitions.find((one) => one?.name === name)?.label || name || 'with no name');

    if (taking) {
      const taken = block('try-taken', 'The way taken');
      taken.append(make('p', 'card-about', `${wayLabel(taking)}. What follows is the document after it.`), untake());
    }

    /** @type {any[]} */
    const errors = Array.isArray(preview?.errors) ? preview.errors : [];
    if (errors.length > 0) {
      const missing = block('try-missing', 'What stands in the way');
      const list = make('ul', 'plain');
      for (const error of errors) {
        const one = make('li', '', String(error?.message ?? error?.code ?? ''));
        if (error?.variable) one.dataset.variable = String(error.variable);
        // Where the server says which line decided, a designer reads it here: it is the line to change.
        if (error?.hint) one.append(make('span', 'try-hint', String(error.hint)));
        list.append(one);
        // A value that is needed is said here alone; a value that is refused is said at its field too.
        if (error?.variable && error?.code !== 'required') tell(String(error.variable), String(error?.message ?? ''));
      }
      missing.append(make('p', 'card-about', 'The server would not keep the document as it is.'), list);
    }

    const facts = block('try-facts', 'The document');
    const lines = make('dl', 'right');
    /** @param {string} id @param {string} what @param {string} answer */
    const line = (id, what, answer) => {
      const row = make('div', 'line');
      const value = make('dd', 'line-answer', answer);
      value.id = id;
      row.append(make('dt', 'line-what', what), value);
      lines.append(row);
    };
    line('try-title', 'its title', String(preview?.document?.title ?? '') || '—');
    line('try-state', 'its state', stateLabel(preview?.document?.state) || '—');
    /** @type {unknown[]} */
    const path = Array.isArray(preview?.path) ? preview.path : [];
    if (path.length > 1) line('try-path', 'it went', path.map(stateLabel).join(', then '));
    facts.append(lines);

    /** @type {any[]} */
    const open = Array.isArray(preview?.transitions) ? preview.transitions : [];
    const ways = block('try-ways', taking ? 'Ways out after it, for you' : 'Ways out, for you, now');
    if (open.length === 0) ways.append(make('p', 'card-about', 'None.'));
    else {
      const list = make('ul', 'plain');
      for (const way of open) {
        const one = make('li', 'try-way', `${wayLabel(way?.name)}, to ${stateLabel(way?.to)}: `);
        one.dataset.transition = String(way?.name ?? '');
        one.dataset.open = String(way?.enabled === true);
        one.append(make('span', way?.enabled === true ? 'try-open' : 'nobody', way?.enabled === true ? 'open' : `closed, ${whyClosed(String(way?.code ?? ''))}`));
        // A way out is taken by a document the server holds, one way a try.
        if (on !== '' && !taking && way?.enabled === true && way?.name) {
          const take = make('button', 'button button-plain button-small try-take', 'Take it');
          take.setAttribute('type', 'button');
          take.setAttribute('aria-label', `Take ${wayLabel(way.name)}`);
          take.addEventListener('click', () => {
            taking = String(way.name);
            delete root.dataset.tried;
            void ask();
          });
          one.append(' ', take);
        }
        list.append(one);
      }
      ways.append(list);
      if (on === '') ways.append(make('p', 'card-about try-no-taking', 'A way out is taken by a document the server holds: choose one above to try it.'));
      else if (taking) ways.append(make('p', 'card-about', 'One way out a try: these are shown, not taken.'));
    }

    /** @type {any[]} */
    const rules = Array.isArray(preview?.rules) ? preview.rules : [];
    const ran = rules.filter((rule) => rule?.ran === true);
    if (ran.length > 0) {
      const did = block('try-rules', 'By itself');
      did.append(make('p', 'card-about', 'What the class did by itself, with the values it worked out.'));
      for (const rule of ran) {
        const at = Number(/^\/rules\/(\d+)$/.exec(String(rule?.path ?? ''))?.[1] ?? -1);
        const one = make('div', 'rule');
        one.dataset.rule = String(at);
        one.append(make('p', 'rule-when', ruleAt(definition, at)?.when ?? 'A rule'));
        const steps = make('ul', 'plain');
        for (const step of Array.isArray(rule?.actions) ? rule.actions : []) steps.append(make('li', '', didWords(step)));
        one.append(steps);
        did.append(one);
      }
    }
    if (taking) said.textContent = errors.length > 0 ? `Tried, with ${wayLabel(taking)} taken. The server would not keep the document so; it wrote nothing.` : `Tried: ${wayLabel(taking)} would be taken. The server wrote nothing.`;
    else said.textContent = errors.length > 0 ? 'Tried. The server would not keep this document yet; it wrote nothing.' : 'Tried: the server would take this document. It wrote nothing.';
  }

  /** A button that takes the way out back: the document is tried again as it stood before it. */
  function untake() {
    const back = make('button', 'button button-plain button-small', 'Try it without');
    back.id = 'try-untake';
    back.setAttribute('type', 'button');
    back.addEventListener('click', () => {
      taking = '';
      delete root.dataset.tried;
      void ask();
    });
    return back;
  }

  /** Takes away what an earlier try answered: it is not what would come of the document as it stands now. */
  function blank() {
    result.replaceChildren();
    for (const cell of cells.values()) {
      cell.textContent = '—';
      cell.classList.add('field-empty');
    }
  }

  /**
   * Shows that the server did not try the document, and why.
   *
   * @param {unknown} refusal
   */
  function refused(refusal) {
    blank();
    if (refusal instanceof Refused && refusal.code === 'bad_definition') {
      said.textContent = 'Not tried: the server refuses this class as it stands. Check says what to put right.';
      return;
    }
    const message = refusal instanceof Error ? refusal.message : String(refusal);
    if (taking) {
      // The way out is not one the server lets this document take, as things stand: said, with the way back.
      const taken = make('section', 'inner');
      taken.id = 'try-taken';
      taken.append(make('h3', '', 'The way not taken'), make('p', 'card-about', refusal instanceof Refused && refusal.hint ? `${message}. ${refusal.hint}` : message), untake());
      result.append(taken);
      said.textContent = 'Not taken: the server would not let the document go this way.';
      return;
    }
    if (refusal instanceof Refused && refusal.variable && whys.has(refusal.variable)) {
      tell(refusal.variable, refusal.hint ? `${message}. ${refusal.hint}` : message);
      said.textContent = 'Not tried: the server does not take one of the values.';
      return;
    }
    said.textContent = `Not tried. The server said: ${message}`;
  }

  /** Asks the server what would come of the document, and shows it. */
  async function ask() {
    const mine = ++asked;
    const definition = draft();
    if (!definition) return;
    // What the page asks about: the values given, the document, and the way out taken.
    const sent = `${JSON.stringify(tried)}${on ? ` on ${on}` : ''}${taking ? ` taking ${taking}` : ''}`;
    if (unread.size > 0) {
      blank();
      said.textContent = `Not tried: ${unread.size === 1 ? 'one field' : `${unread.size} fields`} cannot be read.`;
      root.dataset.tried = sent;
      return;
    }
    try {
      /** @type {Record<string, any>} */
      const what = { definition, values: { ...tried } };
      if (on) what.id = on;
      if (taking) what.transition = taking;
      const { preview } = await call('preview_draft', what);
      if (mine !== asked) return;
      render(definition, preview);
    } catch (refusal) {
      if (mine !== asked) return;
      refused(refusal);
    }
    // The page says what it has asked about: a check waits for this.
    root.dataset.tried = sent;
  }

  /**
   * The choice of the document the class is tried on.
   *
   * @param {Record<string, any>} definition
   */
  function chooser(definition) {
    const box = make('div', 'field try-on');
    const label = make('p', 'field-label');
    const forField = make('label', '', 'Try it on');
    forField.setAttribute('for', 'try-on');
    label.append(forField);
    const select = /** @type {HTMLSelectElement} */ (make('select', 'input'));
    select.id = 'try-on';
    const states = statesOf(definition);
    const first = /** @type {HTMLOptionElement} */ (make('option', '', 'A new document'));
    first.value = '';
    select.append(first);
    for (const one of known) {
      const state = states.find((it) => it.name === one?.state)?.label ?? String(one?.state ?? '');
      const option = /** @type {HTMLOptionElement} */ (make('option', '', `${String(one?.title || one?.id)}, ${state}${one?.created_by ? `, made by ${one.created_by}` : ''}`));
      option.value = String(one?.id ?? '');
      select.append(option);
    }
    select.value = on;
    select.addEventListener('change', () => {
      on = select.value;
      taking = '';
      build();
    });
    box.append(
      label,
      select,
      make(
        'p',
        'field-about',
        known.length > 0
          ? 'A new document, or one of the last made that the server holds and you may see. It is tried as you: what you may set and take is what the class lets you.'
          : 'A new document, tried as you. The server holds no document of this class that you may see.',
      ),
    );
    return box;
  }

  /** Draws the fields for the document the class is tried on, and asks the server about it. */
  function build() {
    clearTimeout(waiting);
    delete root.dataset.tried;
    cells.clear();
    firsts.clear();
    whys.clear();
    unread.clear();
    form.replaceChildren();
    result.replaceChildren();
    const definition = draft();
    if (!definition) {
      said.textContent = 'The text cannot be read as a class just now. Put it right under Text first.';
      return;
    }
    if (on !== '' && !known.some((one) => one?.id === on)) on = '';
    if (on === '') taking = '';
    if (!typedFor.has(on)) typedFor.set(on, {});
    tried = /** @type {Record<string, any>} */ (typedFor.get(on));
    // What was typed for a variable the class no longer has, or now works out, is no value to give.
    for (const name of Object.keys(tried)) {
      const variable = definition.variables?.[name];
      if (!variable || variable.formula !== undefined) delete tried[name];
    }
    said.textContent = '';
    form.append(chooser(definition));
    for (const part of outline(definition)) form.append(partOf(definition, part, 0));
    if (Object.keys(definition.variables ?? {}).length === 0) form.append(make('p', 'card-about', 'This class has no variable.'));
    void ask();
  }

  return {
    draw() {
      const mine = ++drawn;
      delete root.dataset.tried;
      // A text that cannot be read is said at once: there is nothing to ask the server about.
      if (!draft()) return build();
      // The documents to choose from are asked for each time the view is shown: one may have been made since.
      documents()
        .catch(() => [])
        .then((all) => {
          if (mine !== drawn) return;
          known = Array.isArray(all) ? all : [];
          build();
        });
    },
  };
}
