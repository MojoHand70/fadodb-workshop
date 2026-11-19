// How a value is shown to a person: the patterns a class may give a
// number, a money, a day and a moment, in two languages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, show, showDate, showNumber } from '../pages/format.js';

const EN = 'en-GB';
const PL = 'pl-PL';
/** The space Polish puts between thousands, and the one before a currency. */
const NB = '\u00a0';

test('a number by a pattern, in English', () => {
  assert.equal(showNumber('5166.00', '#,##0.00', EN), '5,166.00');
  assert.equal(showNumber('93.42', '#,##0.00', EN), '93.42');
  assert.equal(showNumber('0', '#,##0.00', EN), '0.00');
  assert.equal(showNumber('999', '#,##0', EN), '999');
  assert.equal(showNumber('1234567', '#,##0', EN), '1,234,567');
  assert.equal(showNumber(1234567.891, '#,##0.0', EN), '1,234,567.9');
  assert.equal(showNumber('42', '000000', EN), '000042');
  assert.equal(showNumber('42', '0', EN), '42');
});

test('a number by a pattern, in Polish: the language gives the separators', () => {
  assert.equal(showNumber('5166.00', '#,##0.00', PL), `5${NB}166,00`);
  assert.equal(showNumber('12345.67', '#,##0.00', PL), `12${NB}345,67`);
  assert.equal(showNumber('1000', '#,##0', PL), `1${NB}000`, 'a pattern with a separator groups four digits too');
  assert.equal(showNumber('0.5', '0.00', PL), '0,50');
});

test('rounding is a half away from zero, on the digits as they came', () => {
  assert.equal(showNumber('1234.5', '0', EN), '1235');
  assert.equal(showNumber('2.5', '0', EN), '3');
  assert.equal(showNumber('-2.5', '0', EN), '-3');
  assert.equal(showNumber('1.005', '0.00', EN), '1.01', 'a browser\'s own number would give 1.00');
  assert.equal(showNumber('0.125', '0.00', EN), '0.13');
  assert.equal(showNumber('999.995', '#,##0.00', EN), '1,000.00', 'the carry runs through');
  assert.equal(showNumber('12345678901234567890.125', '#,##0.00', EN), '12,345,678,901,234,567,890.13', 'no digit is lost');
});

test('a percentage', () => {
  assert.equal(showNumber('0.23', '0%', EN), '23%');
  assert.equal(showNumber('0.08', '0%', EN), '8%');
  assert.equal(showNumber('0.085', '0.0%', EN), '8.5%');
  assert.equal(showNumber('1', '0%', EN), '100%');
  assert.equal(showNumber('0.085', '0.0%', PL), '8,5%');
});

test('digits that may be left out', () => {
  assert.equal(showNumber('12.5', '0.0#', EN), '12.5');
  assert.equal(showNumber('12.345', '0.0#', EN), '12.35');
  assert.equal(showNumber('12', '0.0#', EN), '12.0');
  assert.equal(showNumber('0.5', '.00', EN), '.50');
  assert.equal(showNumber('12.5', '.00', EN), '12.50');
  assert.equal(showNumber('12', '0.##', EN), '12', 'a point with nothing after it is left out');
});

test('a negative number, and the sections for negative and zero', () => {
  assert.equal(showNumber('-1234.5', '#,##0.00', EN), '-1,234.50');
  assert.equal(showNumber('-5', '0.00;(0.00)', EN), '(5.00)');
  assert.equal(showNumber('5', '0.00;(0.00)', EN), '5.00');
  assert.equal(showNumber('0', '0.00;-0.00;"nil"', EN), 'nil');
  assert.equal(showNumber('-0.001', '0.00', EN), '0.00', 'what rounds to zero has no minus');
});

test('text in a pattern is shown as it is', () => {
  assert.equal(showNumber('5', '0 "pcs"', EN), '5 pcs');
  assert.equal(showNumber('1234.5', '$#,##0.00', EN), '$1,234.50');
  assert.equal(showNumber('7', '0 "a;b"', EN), '7 a;b', 'a ; inside quotes splits nothing');
});

test('what is not a number is shown as it came', () => {
  assert.equal(showNumber('n/a', '0.00', EN), 'n/a');
  assert.equal(showNumber('', '0.00', EN), '');
});

test('a day by a pattern, in English and in Polish', () => {
  assert.equal(showDate('2026-12-05', 'd mmm yyyy', EN), '5 Dec 2026');
  assert.equal(showDate('2026-12-05', 'd mmm yyyy', PL), '5 gru 2026');
  assert.equal(showDate('2026-12-05', 'dd.mm.yyyy', PL), '05.12.2026');
  assert.equal(showDate('2026-12-05', 'yyyy-mm-dd', EN), '2026-12-05');
  assert.equal(showDate('2026-12-05', 'd/m/yy', EN), '5/12/26');
  assert.equal(showDate('2026-12-05', 'dddd, d mmmm yyyy', EN), 'Saturday, 5 December 2026');
  assert.equal(showDate('2026-12-05', 'dddd, d mmmm yyyy', PL), 'sobota, 5 grudnia 2026', 'beside a day the month bends');
  assert.equal(showDate('2026-12-05', 'mmmm yyyy', PL), 'grudzień 2026');
  assert.equal(showDate('2026-12-05', 'ddd', EN), 'Sat');
  assert.equal(showDate('2026-12-05', '"day" d', EN), 'day 5', 'a d inside quotes is text');
});

test('a day is the same day everywhere', () => {
  // A day has no hour, so no time zone moves it.
  assert.equal(showDate('2026-01-01', 'd mmm yyyy', EN), '1 Jan 2026');
  assert.equal(showDate('2026-12-31', 'd mmm yyyy', EN), '31 Dec 2026');
});

test('a moment by a pattern, at a place', () => {
  const at = 1796479629; // 2026-12-05 14:07:09 UTC
  assert.equal(showDate(at, 'yyyy-mm-dd hh:mm', EN, 'UTC'), '2026-12-05 14:07');
  assert.equal(showDate(at, 'yyyy-mm-dd hh:mm', EN, 'Europe/Warsaw'), '2026-12-05 15:07');
  assert.equal(showDate(at, 'hh:mm:ss', EN, 'UTC'), '14:07:09');
  assert.equal(showDate(at, 'h:mm AM/PM', EN, 'UTC'), '2:07 PM');
  assert.equal(showDate(at, 'd mmm yyyy, h:mm', PL, 'UTC'), '5 gru 2026, 14:07');
  assert.equal(showDate(at, 'mm/dd hh:mm', EN, 'UTC'), '12/05 14:07', 'mm is the month before an hour and the minutes after one');
});

test('the kind of a value comes from its type', () => {
  assert.equal(kindOf('money(2)'), 'money');
  assert.equal(kindOf('decimal(4)'), 'decimal');
  assert.equal(kindOf('text'), 'text');
  assert.equal(kindOf(undefined), '');
});

test('any value of a document, as the server sends it', () => {
  const en = { locale: EN, place: 'UTC' };
  const pl = { locale: PL, place: 'UTC' };
  assert.equal(show('5166.00 PLN', { type: 'money(2)', format: '#,##0.00' }, en), `5,166.00${NB}PLN`);
  assert.equal(show('5166.00 PLN', { type: 'money(2)', format: '#,##0.00' }, pl), `5${NB}166,00${NB}PLN`);
  assert.equal(show('-1234.50 EUR', { type: 'money' }, en), `-1,234.50${NB}EUR`);
  assert.equal(show('0.23', { type: 'decimal(2)', format: '0%' }, en), '23%');
  assert.equal(show('0.1250', { type: 'decimal(4)' }, pl), '0,1250', 'with no pattern every digit is kept');
  assert.equal(show('42', { type: 'int' }, en), '42');
  assert.equal(show(1234567.891, { type: 'number' }, en), '1,234,567.891');
  assert.equal(show('2026-11-19', { type: 'date', format: 'd mmm yyyy' }, en), '19 Nov 2026');
  assert.equal(show('2026-11-19', { type: 'date' }, en), '19 Nov 2026');
  assert.equal(show('2026-11-19', { type: 'date' }, pl), '19 lis 2026');
  assert.equal(show(1796479629, { type: 'datetime', format: 'yyyy-mm-dd hh:mm' }, en), '2026-12-05 14:07');
  assert.equal(show(true, { type: 'bool' }, en), 'Yes');
  assert.equal(show(false, { type: 'bool' }, { locale: PL, yes: 'Tak', no: 'Nie' }), 'Nie');
  assert.equal(show('Train tickets', { type: 'text' }, en), 'Train tickets');
  assert.equal(show('12 PLN', { type: 'text' }, en), '12 PLN', 'a text is never taken for money');
  assert.equal(show(null, { type: 'money(2)' }, en), '');
  assert.equal(show('', { type: 'date' }, en), '');
});
