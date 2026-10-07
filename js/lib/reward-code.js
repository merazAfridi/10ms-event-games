/**
 * Reward codes for the Shape Challenge win screen.
 *
 * Format: HHMM-RRRCC   e.g. 1432-7KQX3
 *   HHMM = time the challenge was won (24h clock) so staff can see it is fresh
 *   RRR  = random characters, so two winners in the same minute get different codes
 *   CC   = checksum made from the date, time, random part and the secret in config.json
 *
 * Staff can open  …/#/verify  and type a code to check it was produced by this app today.
 * (There is no server, so this is a deterrent against made-up codes, not bank-grade security.)
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function checksum(secret, day, hhmm, rand) {
  const x = fnv1a(`${secret}|${day}|${hhmm}|${rand}`);
  return ALPHABET[x & 31] + ALPHABET[(x >>> 5) & 31];
}

export function makeRewardCode(secret, date = new Date()) {
  const hhmm = pad(date.getHours()) + pad(date.getMinutes());
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => ALPHABET[b & 31]).join('');
  return `${hhmm}-${rand}${checksum(secret, dayKey(date), hhmm, rand)}`;
}

/** Returns { valid, time?, today?, code? }. Accepts codes typed with spaces, dashes or lower case. */
export function verifyRewardCode(secret, input, now = new Date()) {
  const s = String(input || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  const m = s.match(/^([01]\d|2[0-3])([0-5]\d)([0-9A-Z]{3})([0-9A-Z]{2})$/);
  if (!m) return { valid: false };
  const hhmm = m[1] + m[2];
  for (const offset of [0, -1]) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    if (checksum(secret, dayKey(d), hhmm, m[3]) === m[4]) {
      return { valid: true, time: `${m[1]}:${m[2]}`, today: offset === 0, code: `${hhmm}-${m[3]}${m[4]}` };
    }
  }
  return { valid: false };
}
