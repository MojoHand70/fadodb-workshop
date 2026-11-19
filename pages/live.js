// The live document: one document held in the page, worked out as the
// server works it out, while the person types.
//
// It follows the engine's own smallest page, the proof of the bundle
// (the engine's ADR-0070 and its test web/vm/test/bundle.mjs): the page
// is given the bundle of a class, the person from whoami and the
// document from get. From those it works out the calculated variables
// and the title in the order the engine does, with the engine's formula
// machine for a page, and it decides what the person may set and read by
// the rules the engine compiled.
//
// The server stays the authority. What the page cannot work out, a
// formula that reads other documents, is left as the server last said
// and named in `asks`, so that the page asks the server. A change
// counts only when the server has taken it.

import {
  BLANK, FORMAT_VERSION, Kind, VM,
  bool, date, datetime, decimal, decode, json, money, number, parseType, ref, render, text,
} from './vendor/fadodb-vm.js';

const DAY = 86400000;

/**
 * An exact number written as text, as a mantissa at a scale.
 *
 * @param {unknown} written
 */
function exact(written) {
  const found = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(written));
  if (!found) throw new Error(`not an exact number: ${written}`);
  const part = found[3] ?? '';
  return { mant: BigInt(found[1] + found[2] + part), scale: part.length };
}

/**
 * A value as the wire carries it, as the formula machine reads it.
 *
 * @param {any} wire
 * @param {import('./vendor/fadodb-vm.js').Type} type
 */
function fromWire(wire, type) {
  if (wire === null || wire === undefined || wire === '') return BLANK;
  switch (type.kind) {
    case Kind.Bool: return bool(wire);
    case Kind.Number: return number(wire);
    case Kind.Text: return text(wire);
    case Kind.Ref: return ref(wire);
    case Kind.JSON: return json(JSON.stringify(wire));
    case Kind.Date: {
      const [y, m, d] = String(wire).split('-').map(Number);
      return date(Date.UTC(y, m - 1, d) / DAY);
    }
    case Kind.DateTime: return datetime(wire);
    case Kind.Decimal: {
      const e = exact(wire);
      return decimal(e.mant, e.scale);
    }
    case Kind.Money: {
      const [amount, currency] = String(wire).split(' ');
      const e = exact(amount);
      return money(e.mant, e.scale, currency);
    }
  }
  throw new Error(`a value of kind ${type.kind} is not read by a page`);
}

/**
 * @param {bigint} mant
 * @param {number} scale
 */
function digits(mant, scale) {
  const negative = mant < 0n;
  let s = (negative ? -mant : mant).toString().padStart(scale + 1, '0');
  if (scale > 0) s = `${s.slice(0, s.length - scale)}.${s.slice(s.length - scale)}`;
  return (negative ? '-' : '') + s;
}

/**
 * A value of the formula machine, as the wire carries it.
 *
 * @param {import('./vendor/fadodb-vm.js').Value} value
 */
function toWire(value) {
  switch (value.kind) {
    case Kind.Blank: return null;
    case Kind.Bool: return value.num !== 0;
    case Kind.Number:
    case Kind.DateTime: return value.num;
    case Kind.Text:
    case Kind.Ref: return value.str;
    case Kind.Date: return render(value);
    case Kind.Decimal: return digits(value.mant, value.scale);
    case Kind.Money: return `${digits(value.mant, value.scale)} ${value.str}`;
  }
  throw new Error(`a value of kind ${value.kind} is not written by a page`);
}

/**
 * A worked-out value at the scale of its variable, as the server keeps
 * it. One that would need rounding is the server's to work out.
 *
 * @param {import('./vendor/fadodb-vm.js').Value} value
 * @param {string | undefined} type
 */
function fit(value, type) {
  if (!type || (value.kind !== Kind.Decimal && value.kind !== Kind.Money)) return value;
  const wanted = parseType(type);
  if (value.scale === wanted.scale) return value;
  if (value.scale > wanted.scale) throw new Error('the value needs rounding, which is the server\'s');
  const mant = value.mant * 10n ** BigInt(wanted.scale - value.scale);
  return value.kind === Kind.Money ? money(mant, wanted.scale, value.str) : decimal(mant, wanted.scale);
}

/**
 * One document, live in the page.
 */
export class Live {
  /**
   * @param {any} bundle the bundle of the class, from get_bundle
   * @param {{ id: string, kind?: string, groups?: string[], system_groups?: string[] }} user
   *   the person, from whoami
   */
  constructor(bundle, user) {
    if (bundle.bytecode !== FORMAT_VERSION) {
      throw new Error(`The server writes formulas in format ${bundle.bytecode}, and this Workshop reads format ${FORMAT_VERSION}.`);
    }
    this.bundle = bundle;
    this.definition = bundle.definition ?? {};
    this.compiled = bundle.compiled ?? {};
    this.user = user;
    this.vm = new VM();
    /** @type {Map<string, import('./vendor/fadodb-vm.js').Program>} */
    this.programs = new Map();
    /** The type of each calculated variable. */
    /** @type {Record<string, string>} */
    this.calculated = {};
    for (const one of this.compiled.computed ?? []) this.calculated[one.variable] = one.type;
    /** @type {any} */
    this.saved = { values: {} };
    /** @type {Record<string, any>} */
    this.values = {};
    /** The variables the person changed and the server has not taken yet. */
    /** @type {Set<string>} */
    this.changed = new Set();
    /** The calculated variables the page could not work out again. */
    /** @type {Set<string>} */
    this.asks = new Set();
    /** The changes the server's last answer was worked out for. */
    this.answered = '{}';
    this.title = '';
    /** True for a document that is not made yet. */
    this.fresh = false;
  }

  /**
   * Begins a document that is not made yet: it is in the first state of
   * its class, the person is its maker, and it holds what the class
   * gives a new document, its defaults.
   */
  begin() {
    this.fresh = true;
    this.saved = {
      id: '',
      state: this.definition.states?.initial,
      created_by: this.user.id,
      updated_by: this.user.id,
      state_entered_by: this.user.id,
      values: {},
    };
    this.values = {};
    this.changed.clear();
    this.asks.clear();
    this.answered = '';
    this.title = '';
    this.workOut();
  }

  /**
   * Takes the document as the server sent it: after reading it, and
   * after the server took a change.
   *
   * @param {any} document
   */
  take(document) {
    this.fresh = false;
    this.saved = document;
    this.values = { ...(document.values ?? {}) };
    this.changed.clear();
    this.asks.clear();
    this.answered = '{}';
    this.title = String(document.title || document.id || '');
  }

  /**
   * The type of a variable: the one it declares, or the one the engine
   * worked out for a calculated one.
   *
   * @param {string} name
   * @returns {string}
   */
  typeOf(name) {
    return String(this.definition.variables?.[name]?.type || this.calculated[name] || '');
  }

  /** What a formula knows besides the values: who, when and where the document stands. */
  context() {
    const d = this.saved;
    return {
      user: this.user.id,
      groups: this.user.groups ?? [],
      system: this.user.system_groups ?? [],
      kind: this.user.kind,
      now: Math.floor(Date.now() / 1000),
      state: d.state,
      id: d.id,
      doc: {
        version: d.version,
        created_at: d.created_at, created_by: d.created_by,
        updated_at: d.updated_at, updated_by: d.updated_by,
        entered_at: d.state_entered_at, entered_by: d.state_entered_by, entered_from: d.state_entered_from,
      },
    };
  }

  /**
   * Runs a compiled formula over values as the wire carries them.
   *
   * @param {string} compiled the formula, as the bundle carries it
   * @param {Record<string, any>} values
   */
  run(compiled, values) {
    let program = this.programs.get(compiled);
    if (!program) {
      program = decode(Uint8Array.from(atob(compiled), (c) => c.charCodeAt(0)));
      this.programs.set(compiled, program);
    }
    const given = program.slots.map((slot) => {
      /** @type {any} */
      let wire = values;
      for (const step of slot.name.split('.')) wire = wire?.[step];
      return fromWire(wire, slot.type);
    });
    return this.vm.run(program, given, this.context());
  }

  /**
   * Whether a compiled rule holds. Null when the page cannot tell: the
   * rule is the server's, and the server's answer counts.
   *
   * @param {unknown} compiled
   * @param {Record<string, any>} values
   * @returns {boolean | null}
   */
  holds(compiled, values) {
    if (compiled === undefined) return false;
    if (typeof compiled !== 'string') return null;
    try {
      return this.run(compiled, values).truth;
    } catch {
      return null;
    }
  }

  /**
   * A change the person makes. The calculated variables and the title
   * are worked out again; what the page cannot work out is named in
   * `asks`.
   *
   * @param {string} name
   * @param {any} wire the new value, as the wire carries it; null for none
   */
  set(name, wire) {
    this.values[name] = wire;
    const before = JSON.stringify(this.saved.values?.[name] ?? null);
    // In a new document whatever the person touched is theirs, an
    // emptied field too: the class's default no longer fills it.
    if (!this.fresh && JSON.stringify(wire ?? null) === before) this.changed.delete(name);
    else this.changed.add(name);
    this.workOut();
  }

  /** Works out the calculated variables and the title, in the engine's order. */
  workOut() {
    /** What changed since the server last answered, and what follows from it. */
    const moved = new Set(this.changed);
    // What the server works out is current while the changes are the
    // ones it last answered for.
    const current = this.answered === JSON.stringify(this.changes());
    this.asks.clear();
    if (this.fresh) {
      // A new document: the defaults first, in the engine's order, for
      // every variable the person has not set.
      for (const one of this.compiled.defaults ?? []) {
        if (this.changed.has(one.variable)) continue;
        if (typeof one.formula === 'string') {
          try {
            const worked = toWire(fit(this.run(one.formula, this.values), one.type));
            if (JSON.stringify(worked) !== JSON.stringify(this.values[one.variable] ?? null)) moved.add(one.variable);
            this.values[one.variable] = worked;
            continue;
          } catch {
            // Not for a page to work out: it is the server's.
          }
        }
        if (!current) this.asks.add(one.variable);
      }
    }
    for (const one of this.compiled.computed ?? []) {
      const follows = (one.reads ?? []).some((/** @type {string} */ read) => moved.has(read));
      if (typeof one.formula === 'string') {
        try {
          const worked = toWire(fit(this.run(one.formula, this.values), one.type));
          if (JSON.stringify(worked) !== JSON.stringify(this.values[one.variable] ?? null)) moved.add(one.variable);
          this.values[one.variable] = worked;
          continue;
        } catch {
          // Not for a page to work out: it is the server's.
        }
      }
      if (follows) {
        if (!current) this.asks.add(one.variable);
        moved.add(one.variable);
      }
    }
    const title = this.compiled.title;
    if (title && typeof title.formula === 'string') {
      try {
        this.title = render(this.run(title.formula, this.values)) || String(this.saved.id ?? '');
      } catch {
        // The title stays as the server last gave it.
      }
    }
  }

  /**
   * Takes the server's answer for what the page could not work out, and
   * works out again what reads it.
   *
   * @param {Record<string, any>} values the values of the document as the server's preview would have it
   */
  settle(values) {
    for (const name of this.asks) this.values[name] = values?.[name] ?? null;
    this.answered = JSON.stringify(this.changes());
    this.workOut();
  }

  /** Puts every value back as the server last sent it, or as a new document begins. */
  discard() {
    if (this.fresh) this.begin();
    else this.take(this.saved);
  }

  /**
   * Whether the person may make a document of the class. Null when the
   * page cannot tell, and the server's answer counts.
   *
   * @returns {boolean | null}
   */
  mayCreate() {
    const rule = this.compiled.access?.create;
    if (rule === undefined) return false;
    const was = this.saved;
    this.saved = { id: '', state: this.definition.states?.initial, created_by: this.user.id, values: {} };
    const holds = this.holds(rule, {});
    this.saved = was;
    return holds;
  }

  /** The changes the server has not taken yet, as the wire carries them. */
  changes() {
    /** @type {Record<string, any>} */
    const all = {};
    for (const name of this.changed) all[name] = this.values[name] ?? null;
    return all;
  }

  /**
   * Whether a rule of the rights lets the person through.
   *
   * @param {any} rule {groups: [...]} or {formula: "<compiled>"}
   * @returns {boolean | null}
   */
  allowed(rule) {
    if (Array.isArray(rule.groups)) {
      const mine = [...(this.user.groups ?? []), ...(this.user.system_groups ?? []), 'everyone'];
      return rule.groups.some((/** @type {string} */ g) => mine.includes(g));
    }
    return this.holds(rule.formula, this.saved.values ?? {});
  }

  /**
   * Whether the person may set a variable, as the document stands on the
   * server. A calculated variable is nobody's to set; a document in a
   * final state changes no more; then the class's rule for a change
   * and the rule of the variable in this state decide. Where the page
   * cannot tell, the field is open and the server's answer counts.
   *
   * @param {string} name
   */
  maySet(name) {
    const variable = this.definition.variables?.[name];
    if (!variable || variable.formula) return false;
    const state = this.saved.state;
    if ((this.definition.states?.final ?? []).includes(state)) return false;
    if (this.holds(this.compiled.access?.update, this.saved.values ?? {}) === false) return false;
    const rule = this.compiled.rights?.[state]?.[name]?.write;
    return rule ? this.allowed(rule) !== false : true;
  }

  /**
   * Whether the person may read a variable in this state. The server
   * sends no value the person may not read; this tells a value that is
   * hidden from one that is empty.
   *
   * @param {string} name
   */
  mayRead(name) {
    const rule = this.compiled.rights?.[this.saved.state]?.[name]?.read;
    return rule ? this.allowed(rule) !== false : true;
  }
}
