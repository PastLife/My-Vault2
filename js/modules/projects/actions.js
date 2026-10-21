// การกระทำของโปรเจคที่แตะที่เก็บข้อมูล — ไม่แตะ DOM เพื่อทดสอบได้
import { emptyProject, reassignToPersonal } from '../../domain/projects.js';

const MODULE = 'projects';
const MAX_IMAGES = 6;
const newId = () => globalThis.crypto.randomUUID();

export class TooManyImagesError extends Error {
  constructor() { super(`แนบรูปได้สูงสุด ${MAX_IMAGES} รูปต่อโปรเจค`); this.name = 'TooManyImagesError'; }
}

/**
 * บันทึกโปรเจคพร้อมรูป โดยไม่ทิ้งรูปกำพร้า (หลักเดียวกับสมุด)
 * ใส่รูปใหม่ → บันทึกโปรเจค → ลบรูปที่เอาออก · พังก่อนบันทึกสำเร็จ = ลบรูปใหม่ที่เพิ่งใส่
 */
export async function saveProject(store, { id = newId(), data, newImages = [], removed = [] }) {
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

// ติ๊กงาน — คงสถานะ "ตัวอย่าง" ไว้ (แค่ลองกดไม่นับว่าเป็นข้อมูลของผู้ใช้)
export async function toggleTask(store, id, taskId) {
  const rec = await store.get(id);
  if (!rec) throw new Error('ไม่พบโปรเจค');
  const data = { ...rec.data, tasks: rec.data.tasks.map(t => (t.id === taskId ? { ...t, done: !t.done } : t)) };
  await store.put(MODULE, data, id);
  return data;
}

// ย้ายเงินของโปรเจคเป็น "ส่วนตัว" ก่อน แล้วค่อยลบโปรเจค — ย้ายพังกลางทาง โปรเจคยังอยู่ ลองใหม่ได้
export async function deleteProject(store, id) {
  const moves = reassignToPersonal(await store.list('money'), id);
  for (const t of moves) await store.put('money', t.data, t.id);
  await store.remove(id);
  return { moved: moves.length };
}

const task = (text, done) => ({ id: newId(), text, done });

export async function seedProjects(store) {
  const game = {
    ...emptyProject('hobby'), name: 'เกม Roblox (ตัวอย่าง)', status: 'active', goalMonthly: 500000, example: true,
    note: 'ตัวอย่าง: ลองติ๊กงาน หรือกด + เพื่อบันทึกรายรับของโปรเจคนี้',
    tasks: [task('ทำระบบฟักไข่', true), task('ระบบจัดทีม', true), task('บอสด่าน 2', false), task('โหมด PvP 6 คน', false)],
  };
  const english = {
    ...emptyProject('study'), name: 'เรียนภาษาอังกฤษ (ตัวอย่าง)', status: 'plan', example: true,
    tasks: [task('หาคอร์สออนไลน์', false), task('ฝึกพูดวันละ 15 นาที', false)],
  };
  return [await store.put(MODULE, game), await store.put(MODULE, english)];
}

export async function clearProjectExamples(store) {
  let n = 0;
  for (const p of await store.list(MODULE)) {
    if (p.data?.example) { await deleteProject(store, p.id); n++; }
  }
  return n;
}
