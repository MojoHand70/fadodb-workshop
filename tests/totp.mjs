// The six digits an authenticator app shows for a key: what a person
// reads off their phone at the server's second step (RFC 6238, as the
// apps do it: SHA-1, a new number every 30 seconds).

import { createHmac } from 'node:crypto';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * @param {string} key the key as the server's page shows it, in base 32
 * @param {number} [now] the moment, in milliseconds
 * @returns {string} six digits
 */
export function digits(key, now = Date.now()) {
  let bits = '';
  for (const letter of key.toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += LETTERS.indexOf(letter).toString(2).padStart(5, '0');
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const mac = createHmac('sha1', bytes).update(counter).digest();
  const at = mac[mac.length - 1] & 15;
  const number = ((mac[at] & 127) << 24) | (mac[at + 1] << 16) | (mac[at + 2] << 8) | mac[at + 3];
  return String(number % 1000000).padStart(6, '0');
}
