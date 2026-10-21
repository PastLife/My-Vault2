// การกระทำของรายการเงินที่แตะที่เก็บข้อมูล — ไม่แตะ DOM เพื่อทดสอบได้
import { parseAmount, categoryOf, dueDates, REPEAT_UNITS, MAX_REPEAT_EVERY, MAX_CAT_LABEL } from '../../domain/money.js';

const MODULE = 'money';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * บันทึก/แก้รายการเงิน · ตรวจทุกอย่างก่อนเขียน (ยอดผิด/วันที่ผิด = ไม่เขียนอะไรเลย)
 * หมวดว่างหรือไม่ตรงกับประเภท → "อื่นๆ" ของประเภทนั้น
 * catLabel = ชื่อที่พิมพ์เองเมื่อเลือก "อื่นๆ" · repeat = { every, unit } หรือ null (ครั้งเดียว)
 */
export async function saveTx(store, { id, kind, amountText, date, category, projectId = null, note = '', catLabel = '', repeat = null }) {
  if (kind !== 'in' && kind !== 'out') throw new Error('เลือกรายรับหรือรายจ่าย');
  const amount = parseAmount(amountText);
  if (!DATE.test(date ?? '') || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error('วันที่ไม่ถูกต้อง');
  const cat = categoryOf(kind, category).id;
  const data = {
    kind, amount, date,
    category: cat,
    projectId: projectId || null,
    note: String(note ?? '').trim(),
    example: false,
  };
  const label = String(catLabel ?? '').trim().slice(0, MAX_CAT_LABEL);
  if (cat === 'other' && label) data.catLabel = label;

  const old = id ? (await store.get(id))?.data : null;
  if (old?.fromRepeat) data.fromRepeat = old.fromRepeat;
  if (repeat) {
    const every = Number(repeat.every);
    if (!Number.isInteger(every) || every < 1 || every > MAX_REPEAT_EVERY) throw new Error('ใส่รอบทำซ้ำเป็นตัวเลข 1–365');
    if (!REPEAT_UNITS.some(u => u.id === repeat.unit)) throw new Error('เลือกหน่วยของรอบทำซ้ำ');
    // ไม่สร้างรอบที่เคยสร้างไปแล้วซ้ำอีก (เช่น แก้ยอดของรายการประจำเดิม)
    const prevLast = old?.repeat?.last;
    data.repeat = { every, unit: repeat.unit, last: prevLast && prevLast > date ? prevLast : date };
  }
  return store.put(MODULE, data, id);
}

/**
 * สร้างรายการของรายการทำซ้ำที่ถึงกำหนดแล้ว (ถึงวันนี้) · เรียกตอนเปิดสมุดและหลังบันทึก
 * id ของรอบ = "<id ต้นแบบ>~<วันที่>" เพื่อให้ย้ายข้อมูลข้ามเครื่องแล้วไม่ซ้ำกัน
 * คืนจำนวนรายการที่สร้างใหม่
 */
export async function runRepeats(store, today) {
  let made = 0;
  for (const t of await store.list(MODULE)) {
    const d = t.data;
    if (!d?.repeat || !DATE.test(d.date ?? '')) continue;
    const dates = dueDates(d.date, d.repeat, today);
    if (!dates.length) continue;
    const { repeat, example, ...base } = d;
    for (const date of dates) {
      await store.put(MODULE, { ...base, date, example: false, fromRepeat: t.id }, `${t.id}~${date}`);
      made++;
    }
    await store.put(MODULE, { ...d, repeat: { ...repeat, last: dates[dates.length - 1] } }, t.id);
  }
  return made;
}

export function deleteTx(store, id) {
  return store.remove(id);
}

// ตัวอย่าง 4 รายการในเดือนของ todayISO · ผูกโปรเจคแรก (ถ้ามี)
export async function seedMoney(store, projectIds, todayISO) {
  const first = projectIds[0] ?? null;
  const day1 = `${todayISO.slice(0, 7)}-01`;
  const ex = (kind, amount, category, projectId, date, note) =>
    ({ kind, amount, date, category, projectId, note, example: true });
  const items = [
    ex('in', 350000, 'salary', null, day1, 'เงินเดือน (ตัวอย่าง)'),
    ex('in', 350000, 'sales', first, todayISO, 'ขายไอเท็มในเกม (ตัวอย่าง)'),
    ex('out', 50000, 'gear', first, todayISO, 'ค่าเซิร์ฟเวอร์ (ตัวอย่าง)'),
    ex('out', 12000, 'food', null, todayISO, 'ข้าวกลางวัน (ตัวอย่าง)'),
  ];
  for (const it of items) await store.put(MODULE, it);
  return items.length;
}

export async function clearMoneyExamples(store) {
  let n = 0;
  for (const t of await store.list(MODULE)) {
    if (t.data?.example) { await store.remove(t.id); n++; }
  }
  return n;
}
