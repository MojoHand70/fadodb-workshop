// The control a person sets a value with, by the kind of the value: a
// text, a choice among values, a tick, a day, a moment, a number, an
// amount with its currency. It reads what the person typed into the
// value the server takes, or says why it cannot.
//
// The page of a document uses it, and so does the design mode, where a
// class is tried on a document before it is saved: a value is typed
// the same way wherever it is typed.

import { kindOf } from './format.js';
import { editable, readNumber, shift } from './input.js';
import { make } from './shell.js';

/** Whether a format shows a number as a percentage. */
export const isPercent = (/** @type {unknown} */ format) => String(format ?? '').replace(/"[^"]*"/g, '').includes('%');

/**
 * The control a person sets a variable with, by its kind. Null for a
 * kind the pages do not set yet: a list, rows, an object.
 *
 * @param {object} how
 * @param {string} how.id the id of the control; a money has a second one, `<id>-currency`
 * @param {Record<string, any>} how.variable the variable as the class writes it
 * @param {string | null | undefined} how.type its type, declared or calculated
 * @param {unknown} how.value the value it holds now
 * @param {string} how.locale the person's language, for a number as they write it
 * @param {string} how.label its label, for the name of the currency field
 * @param {() => string} how.currency the currency a money begins with when it has none
 * @returns {{ parts: HTMLElement[], read: () => { wire: any } | { why: string } } | null}
 */
export function control({ id, variable, type, value, locale, label, currency }) {
  const kind = kindOf(type);
  const box = make('input', 'input');
  box.id = id;
  const input = /** @type {HTMLInputElement} */ (box);
  if (variable.required) input.required = true;

  if (kind === 'text' && Array.isArray(variable.values)) {
    const select = /** @type {HTMLSelectElement} */ (make('select', 'input'));
    select.id = id;
    for (const choice of ['', ...variable.values]) {
      const option = /** @type {HTMLOptionElement} */ (make('option', '', choice === '' ? '—' : String(choice)));
      option.value = String(choice);
      select.append(option);
    }
    select.value = String(value ?? '');
    return { parts: [select], read: () => ({ wire: select.value === '' ? null : select.value }) };
  }
  if (kind === 'text') {
    input.type = 'text';
    input.value = String(value ?? '');
    return { parts: [input], read: () => ({ wire: input.value === '' ? null : input.value }) };
  }
  if (kind === 'bool') {
    input.type = 'checkbox';
    input.className = 'check';
    input.checked = value === true;
    return { parts: [input], read: () => ({ wire: input.checked }) };
  }
  if (kind === 'date') {
    input.type = 'date';
    input.value = String(value ?? '');
    return { parts: [input], read: () => ({ wire: input.value === '' ? null : input.value }) };
  }
  if (kind === 'datetime') {
    input.type = 'datetime-local';
    if (typeof value === 'number') {
      const at = new Date(value * 1000);
      const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
      input.value = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}T${two(at.getHours())}:${two(at.getMinutes())}`;
    }
    return {
      parts: [input],
      read: () => {
        if (input.value === '') return { wire: null };
        const at = new Date(input.value).getTime();
        return Number.isNaN(at) ? { why: 'This is not a day and an hour.' } : { wire: Math.floor(at / 1000) };
      },
    };
  }
  if (kind === 'number' || kind === 'int' || kind === 'decimal') {
    const percent = kind !== 'int' && isPercent(variable.format);
    input.type = 'text';
    input.inputMode = kind === 'int' ? 'numeric' : 'decimal';
    input.className = 'input input-number';
    const written = value === null || value === undefined ? '' : editable(value, 'en');
    input.value = written === '' ? '' : editable(percent ? shift(written, 2) : written, locale);
    const parts = percent ? [input, make('span', 'input-unit', '%')] : [input];
    return {
      parts,
      read: () => {
        let read = readNumber(input.value, locale);
        if (read === null) return { why: 'This is not a number.' };
        if (read === '') return { wire: null };
        if (kind === 'int' && !/^-?\d+$/.test(read)) return { why: 'This is a whole number: it has no decimals.' };
        if (percent) read = shift(read, -2);
        return { wire: kind === 'number' ? Number(read) : read };
      },
    };
  }
  if (kind === 'money') {
    const [amount = '', code = ''] = String(value ?? '').split(' ');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.className = 'input input-number';
    input.value = amount === '' ? '' : editable(amount, locale);
    const unit = /** @type {HTMLInputElement} */ (make('input', 'input input-currency'));
    unit.type = 'text';
    unit.id = `${id}-currency`;
    unit.maxLength = 3;
    unit.setAttribute('aria-label', `Currency of ${label}`);
    unit.setAttribute('autocapitalize', 'characters');
    unit.value = code || currency();
    return {
      parts: [input, unit],
      read: () => {
        const read = readNumber(input.value, locale);
        if (read === null) return { why: 'This is not a number.' };
        if (read === '') return { wire: null };
        const given = unit.value.trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(given)) return { why: 'Give the currency beside it, as three letters: PLN, EUR.' };
        return { wire: `${read} ${given}` };
      },
    };
  }
  return null;
}
