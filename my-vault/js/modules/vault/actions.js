// การกระทำของสมุดที่แตะที่เก็บข้อมูล — ไม่แตะ DOM เพื่อทดสอบได้
import { MAX_IMAGES, sampleEntries, fromLegacy } from './model.js';

const MODULE = 'vault';

export class TooManyImagesError extends Error {
  constructor() { super(`แนบรูปได้สูงสุด ${MAX_IMAGES} รูปต่อรายการ`); this.name = 'TooManyImagesError'; }
}

export function localToday(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * บันทึกรายการพร้อมรูป โดยไม่ทิ้งรูปกำพร้า
 * ลำดับ: ใส่รูปใหม่ → บันทึกรายการ → ลบรูปที่ผู้ใช้เอาออก
 * ถ้าพังก่อนบันทึกรายการสำเร็จ: ลบรูปใหม่ที่เพิ่งใส่ และไม่แตะรูปเดิม
 * @param data       ข้อมูลรายการ (data.images = รูปเดิมที่ยังเก็บไว้)
 * @param newImages  รูปที่ย่อแล้ว [{full, thumb, w, h}]
 * @param removed    รูปเดิมที่ผู้ใช้เอาออก [{fullId, thumbId}]
 */
export async function saveEntry(store, { id = globalThis.crypto.randomUUID(), data, newImages = [], removed = [] }) {
  const kept = data.images ?? [];
  if (kept.length + newImages.length > MAX_IMAGES) throw new TooManyImagesError();

  const added = [];
  try {
    for (const im of newImages) {
      const { fullId, thumbId } = await store.putImage(id, im.full, im.thumb);
      added.push({ fullId, thumbId, w: im.w, h: im.h });
    }
    await store.put(MODULE, { ...data, example: false, images: [...kept, ...added] }, id);
  } catch (e) {
    for (const a of added) {
      await store.deleteImage(a.fullId).catch(() => {});
      await store.deleteImage(a.thumbId).catch(() => {});
    }
    throw e;
  }

  for (const r of removed) {
    await store.deleteImage(r.fullId).catch(() => {});
    await store.deleteImage(r.thumbId).catch(() => {});
  }
  return id;
}

export async function seedSamples(store, todayISO) {
  const samples = sampleEntries(todayISO);
  for (const s of samples) await store.put(MODULE, s);
  return samples.length;
}

export async function removeExamples(store) {
  let n = 0;
  for (const r of await store.list(MODULE)) {
    if (r.data?.example) { await store.remove(r.id); n++; }
  }
  return n;
}

// แปลงก่อนทั้งก้อน ถ้ารูปแบบผิดจะไม่เขียนอะไรเลย
export async function importLegacyText(store, text) {
  const entries = fromLegacy(text);
  for (const e of entries) await store.put(MODULE, e);
  return entries.length;
}
