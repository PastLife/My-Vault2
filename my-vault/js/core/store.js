// ตัวกลางเก็บ-อ่านข้อมูล — ทุกโมดูลเข้าถึงข้อมูลผ่านไฟล์นี้เท่านั้น
// ข้างในรวม: กุญแจ (crypto.js) + ที่เก็บ (adapter) โดยส่งแต่ข้อมูลที่เข้ารหัสแล้วลงที่เก็บ
import {
  KDF_ITERATIONS, randomBytes, deriveKek, generateDek, wrapDek, unwrapDek,
  encryptBytes, decryptBytes, encryptJSON, decryptJSON,
  makeRecoveryCode, normalizeRecoveryCode, WrongKeyError, toB64, fromB64,
} from './crypto.js';

export class BadBackupError extends Error {
  constructor() { super('ไฟล์สำรองไม่ถูกต้อง หรือไฟล์เสียหาย'); this.name = 'BadBackupError'; }
}

const BACKUP_FORMAT = 'my-vault-backup';

// แปลงไบต์ <-> ข้อความ b64 เฉพาะช่องที่กำหนด (ช่องที่เป็น null คงเป็น null)
const pickB64 = (obj, fields) => {
  const out = { ...obj };
  for (const f of fields) out[f] = obj[f] == null ? null : toB64(obj[f]);
  return out;
};
const pickBytes = (obj, fields) => {
  const out = { ...obj };
  for (const f of fields) out[f] = obj[f] == null ? null : fromB64(obj[f]);
  return out;
};
const SLOT = ['salt', 'iv', 'wrapped'];
const CIPHER = ['iv', 'ct'];

function parseBackup(text) {
  let b;
  try { b = JSON.parse(text); } catch { throw new BadBackupError(); }
  const ok = b && typeof b === 'object' && !Array.isArray(b)
    && b.format === BACKUP_FORMAT && b.v === 1
    && b.keys?.pw && b.keys?.kdf?.iter
    && Array.isArray(b.records) && Array.isArray(b.blobs);
  if (!ok) throw new BadBackupError();
  try {
    return {
      iter: b.keys.kdf.iter,
      pw: pickBytes(b.keys.pw, SLOT),
      records: b.records.map(r => pickBytes(r, CIPHER)),
      blobs: b.blobs.map(x => pickBytes(x, CIPHER)),
    };
  } catch { throw new BadBackupError(); } // b64 เสีย
}

export class WrongPasswordError extends Error {
  constructor() { super('รหัสไม่ถูกต้อง'); this.name = 'WrongPasswordError'; }
}
export class LockedError extends Error {
  constructor() { super('สมุดถูกล็อกอยู่'); this.name = 'LockedError'; }
}
export class StorageFullError extends Error {
  constructor() { super('พื้นที่เต็ม ลองลบรูปที่ไม่ใช้ หรือสำรองข้อมูลแล้วล้างบางส่วน'); this.name = 'StorageFullError'; }
}

const newId = () => globalThis.crypto.randomUUID();

export function createStore(adapter, { kdfIterations = KDF_ITERATIONS, now = Date.now } = {}) {
  let dek = null;

  const requireDek = () => { if (!dek) throw new LockedError(); return dek; };

  // แปลง error พื้นที่เต็มของเบราว์เซอร์ ให้เป็น error ของแอป
  const guard = async fn => {
    try { return await fn(); } catch (e) {
      if (e?.name === 'QuotaExceededError') throw new StorageFullError();
      throw e;
    }
  };

  async function wrapWith(secret) {
    const salt = randomBytes(16);
    const { iv, wrapped } = await wrapDek(dek, await deriveKek(secret, salt, kdfIterations));
    return { salt, iv, wrapped };
  }

  async function unlockWith(slot, secret) {
    const keys = await adapter.getMeta('keys');
    if (!keys) throw new Error('ยังไม่มีสมุด');
    try {
      const k = keys[slot];
      dek = await unwrapDek({ iv: k.iv, wrapped: k.wrapped }, await deriveKek(secret, k.salt, keys.kdf.iter));
    } catch (e) {
      if (e instanceof WrongKeyError) throw new WrongPasswordError();
      throw e;
    }
  }

  async function updateKeys(patch) {
    const keys = await adapter.getMeta('keys');
    await guard(() => adapter.setMeta('keys', { ...keys, ...patch }));
  }

  async function readSettings() {
    const key = requireDek(); // เช็กก่อนอ่าน แม้ยังไม่เคยมีการตั้งค่า
    const s = await adapter.getMeta('settings');
    return s ? decryptJSON(key, s.iv, s.ct) : {};
  }

  return {
    async hasVault() {
      return (await adapter.getMeta('keys')) !== undefined;
    },

    async create(password) {
      if (await this.hasVault()) throw new Error('มีสมุดอยู่แล้ว');
      dek = await generateDek();
      const recoveryCode = makeRecoveryCode();
      const keys = {
        v: 1,
        kdf: { iter: kdfIterations },
        pw: await wrapWith(password),
        rec: await wrapWith(normalizeRecoveryCode(recoveryCode)),
        createdAt: now(),
      };
      await guard(() => adapter.setMeta('keys', keys));
      return { recoveryCode };
    },

    unlock(password) { return unlockWith('pw', password); },
    unlockWithRecovery(code) { return unlockWith('rec', normalizeRecoveryCode(code)); },

    async changePassword(newPassword) {
      requireDek();
      await updateKeys({ pw: await wrapWith(newPassword) });
    },

    async regenerateRecovery() {
      requireDek();
      const code = makeRecoveryCode();
      await updateKeys({ rec: await wrapWith(normalizeRecoveryCode(code)) });
      return code;
    },

    lock() { dek = null; },
    isUnlocked() { return dek !== null; },

    async list(module) {
      const key = requireDek();
      const out = [];
      for (const r of await adapter.listRecords(module)) {
        if (r.deleted) continue;
        try {
          out.push({ id: r.id, updatedAt: r.updatedAt, data: await decryptJSON(key, r.iv, r.ct) });
        } catch {
          out.push({ id: r.id, updatedAt: r.updatedAt, corrupt: true });
        }
      }
      return out;
    },

    async get(id) {
      const key = requireDek();
      const r = await adapter.getRecord(id);
      if (!r || r.deleted) return null;
      return { id: r.id, module: r.module, updatedAt: r.updatedAt, data: await decryptJSON(key, r.iv, r.ct) };
    },

    async put(module, data, id = newId()) {
      const { iv, ct } = await encryptJSON(requireDek(), data);
      await guard(() => adapter.putRecord({ id, module, updatedAt: now(), deleted: false, iv, ct }));
      return id;
    },

    async remove(id) {
      requireDek();
      const r = await adapter.getRecord(id);
      if (!r) return;
      await adapter.putRecord({ ...r, deleted: true, updatedAt: now(), iv: null, ct: null });
      await adapter.deleteBlobsFor(id);
    },

    async putImage(recordId, full, thumb) {
      const key = requireDek();
      const fullId = newId();
      const thumbId = newId();
      await guard(async () => adapter.putBlob({ id: fullId, recordId, ...(await encryptBytes(key, full)) }));
      try {
        await guard(async () => adapter.putBlob({ id: thumbId, recordId, ...(await encryptBytes(key, thumb)) }));
      } catch (e) {
        await adapter.deleteBlob(fullId); // ไม่ทิ้งรูปเต็มไว้ครึ่งชุด
        throw e;
      }
      return { fullId, thumbId };
    },

    async getImage(blobId) {
      const key = requireDek();
      const b = await adapter.getBlob(blobId);
      if (!b) throw new Error('ไม่พบรูป');
      return new Blob([await decryptBytes(key, b.iv, b.ct)], { type: 'image/jpeg' });
    },

    async deleteImage(blobId) {
      requireDek();
      await adapter.deleteBlob(blobId);
    },

    async getSetting(key) {
      return (await readSettings())[key];
    },

    async setSetting(key, value) {
      const settings = { ...(await readSettings()), [key]: value };
      const { iv, ct } = await encryptJSON(requireDek(), settings);
      await guard(() => adapter.setMeta('settings', { iv, ct }));
    },

    // ไฟล์สำรองยังเข้ารหัสอยู่ทั้งก้อน: เปิดได้ด้วยรหัสผ่านของสมุด ณ ตอนสำรองเท่านั้น
    async exportBackup() {
      requireDek();
      const keys = await adapter.getMeta('keys');
      const records = await adapter.listRecords();
      const blobs = [];
      for (const r of records) blobs.push(...(await adapter.listBlobsFor(r.id)));
      const text = JSON.stringify({
        format: BACKUP_FORMAT,
        v: 1,
        exportedAt: now(),
        keys: { v: keys.v, kdf: keys.kdf, createdAt: keys.createdAt, pw: pickB64(keys.pw, SLOT) },
        records: records.map(r => pickB64(r, CIPHER)),
        blobs: blobs.map(b => pickB64(b, CIPHER)),
      });
      await this.setSetting('lastBackupAt', now());
      return text;
    },

    // รวมข้อมูลจากไฟล์สำรอง: รายการที่ใหม่กว่าชนะ, เท่ากัน = ข้าม
    async importBackup(text, password) {
      const key = requireDek();
      const backup = parseBackup(text);
      let backupDek;
      try {
        backupDek = await unwrapDek(backup.pw, await deriveKek(password, backup.pw.salt, backup.iter));
      } catch (e) {
        if (e instanceof WrongKeyError) throw new WrongPasswordError();
        throw e;
      }

      const blobsOf = new Map();
      for (const b of backup.blobs) {
        if (!blobsOf.has(b.recordId)) blobsOf.set(b.recordId, []);
        blobsOf.get(b.recordId).push(b);
      }

      const result = { added: 0, updated: 0, skipped: 0 };
      for (const r of backup.records) {
        const local = await adapter.getRecord(r.id);
        if (local && local.updatedAt >= r.updatedAt) { result.skipped++; continue; }

        if (r.deleted) {
          await guard(() => adapter.putRecord({ ...r, iv: null, ct: null }));
          await adapter.deleteBlobsFor(r.id);
          if (local && !local.deleted) result.updated++; else result.skipped++;
          continue;
        }

        let fresh;
        try {
          fresh = await encryptJSON(key, await decryptJSON(backupDek, r.iv, r.ct));
        } catch { result.skipped++; continue; } // รายการในไฟล์เสีย ข้ามไป

        // เปลี่ยนรูปทั้งชุดของรายการนี้ โดยใช้ id เดิม (ข้อมูลรายการอ้างถึง id เหล่านี้)
        await adapter.deleteBlobsFor(r.id);
        for (const b of blobsOf.get(r.id) ?? []) {
          const bytes = await decryptBytes(backupDek, b.iv, b.ct);
          const c = await encryptBytes(key, bytes);
          await guard(() => adapter.putBlob({ id: b.id, recordId: r.id, ...c }));
        }
        await guard(() => adapter.putRecord({
          id: r.id, module: r.module, updatedAt: r.updatedAt, deleted: false, ...fresh,
        }));
        if (local && !local.deleted) result.updated++; else result.added++;
      }
      return result;
    },

    async wipe() {
      await adapter.clearAll();
      dek = null;
    },
  };
}
