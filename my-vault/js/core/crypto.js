// การเข้ารหัสทั้งหมดของแอป — ใช้ WebCrypto ล้วน ไม่แตะ DOM
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 600000;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class WrongKeyError extends Error {
  constructor(message = 'กุญแจไม่ถูกต้อง') { super(message); this.name = 'WrongKeyError'; }
}

export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKek(secret, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  );
}

export function generateDek() {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapDek(dek, kek) {
  const iv = randomBytes(12);
  const wrapped = new Uint8Array(await subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv }));
  return { iv, wrapped };
}

export async function unwrapDek({ iv, wrapped }, kek) {
  try {
    return await subtle.unwrapKey('raw', wrapped, kek, { name: 'AES-GCM', iv },
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  } catch (e) {
    if (e && e.name === 'OperationError') throw new WrongKeyError();
    throw e;
  }
}

export async function encryptBytes(dek, bytes) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, dek, bytes));
  return { iv, ct };
}

export async function decryptBytes(dek, iv, ct) {
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, dek, ct));
}

export function encryptJSON(dek, value) {
  return encryptBytes(dek, enc.encode(JSON.stringify(value)));
}

export async function decryptJSON(dek, iv, ct) {
  return JSON.parse(dec.decode(await decryptBytes(dek, iv, ct)));
}

// สุ่มแบบ rejection sampling: ทิ้งไบต์ที่ทำให้กระจายไม่เท่ากัน (256 ไม่ลงตัวกับ 32 พอดี แต่เขียนเผื่ออักษรชุดอื่น)
function randomChars(count) {
  const n = RECOVERY_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < count) {
    for (const b of randomBytes(count * 2)) {
      if (b < limit) out += RECOVERY_ALPHABET[b % n];
      if (out.length === count) break;
    }
  }
  return out;
}

export function makeRecoveryCode() {
  return randomChars(20).match(/.{4}/g).join('-');
}

export function normalizeRecoveryCode(input) {
  return String(input).toUpperCase().replace(/[-\s]/g, '');
}

export function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
