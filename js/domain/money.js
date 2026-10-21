// กติกาเงิน — ฟังก์ชันล้วน ไม่แตะ DOM / ที่เก็บ
// เงินทุกจำนวนเป็น "สตางค์" จำนวนเต็ม เพื่อให้บวกลบแล้วไม่เพี้ยนทศนิยม

export const MAX_SATANG = 99999999999; // 999,999,999.99 บาท
const AMOUNT_MESSAGE = 'ใส่จำนวนเงินให้ถูก เช่น 350 หรือ 1,250.50';

export class AmountError extends Error {
  constructor() { super(AMOUNT_MESSAGE); this.name = 'AmountError'; }
}

const cat = (id, name) => ({ id, name, icon: id });

export const EXPENSE_CATEGORIES = [
  cat('food', 'อาหาร'), cat('transport', 'เดินทาง'), cat('bills', 'บิล/ค่าบ้าน'), cat('shopping', 'ช้อปปิ้ง'),
  cat('gear', 'อุปกรณ์'), cat('health', 'สุขภาพ'), cat('fun', 'บันเทิง'), cat('edu', 'การศึกษา'), cat('other', 'อื่นๆ'),
];

export const INCOME_CATEGORIES = [
  cat('salary', 'เงินเดือน'), cat('sales', 'ขายของ'), cat('freelance', 'รับจ้าง'),
  cat('invest', 'ลงทุน'), cat('gift', 'ของขวัญ'), cat('other', 'อื่นๆ'),
];

export function categoryOf(kind, id) {
  const list = kind === 'in' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find(c => c.id === id) ?? list[list.length - 1];
}

// "1,250.50" → 125050  ·  คำนวณจากตัวอักษร ไม่ผ่านทศนิยมของเครื่อง
export function parseAmount(text) {
  const s = String(text ?? '')
    .replace(/[๐-๙]/g, d => String(d.charCodeAt(0) - 0x0E50)) // เลขไทย
    .replace(/[฿\s]/g, '');
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) throw new AmountError();
  const baht = m[1].replace(/,/g, '').replace(/^0+(?=\d)/, '');
  if (baht.length > 9) throw new AmountError();
  const satang = Number(baht) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (satang <= 0 || satang > MAX_SATANG) throw new AmountError();
  return satang;
}

// 125050 → "฿1,250.50" · 125000 → "฿1,250" · sign → "+฿…" / "−฿…"
export function formatBaht(satang, { sign = false } = {}) {
  const abs = Math.abs(satang);
  const baht = Math.floor(abs / 100).toLocaleString('en-US');
  const st = abs % 100;
  const body = `฿${baht}${st ? `.${String(st).padStart(2, '0')}` : ''}`;
  if (satang < 0) return `−${body}`;
  return sign && satang > 0 ? `+${body}` : body;
}

export const monthKey = isoDate => String(isoDate).slice(0, 7);

export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  return `${ny}-${String(idx - ny * 12 + 1).padStart(2, '0')}`;
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// สรุปรายการเงินของเดือน: ยอดรวม, รายวัน, แยกตามโปรเจค (null = ส่วนตัว)
export function summarizeMonth(txs, month) {
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => ({ day: i + 1, income: 0, expense: 0 }));
  const byProject = new Map();
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const { data } of txs) {
    if (!data || monthKey(data.date) !== month) continue;
    const day = days[Number(data.date.slice(8, 10)) - 1];
    const key = data.projectId ?? null;
    if (!byProject.has(key)) byProject.set(key, { income: 0, expense: 0, net: 0 });
    const p = byProject.get(key);
    if (data.kind === 'in') { income += data.amount; p.income += data.amount; if (day) day.income += data.amount; }
    else { expense += data.amount; p.expense += data.amount; if (day) day.expense += data.amount; }
    p.net = p.income - p.expense;
    count++;
  }
  return { income, expense, net: income - expense, count, days, byProject };
}

// ความสูงแท่งกราฟรายวัน (%) เทียบกับวันที่ยอดสูงสุดของเดือน · วันที่มียอดแต่น้อยมาก ได้อย่างน้อย 2% ให้ยังมองเห็น
export function dailyBars(days) {
  const max = days.reduce((m, d) => Math.max(m, d.income, d.expense), 0);
  const pct = v => (!v || !max ? 0 : Math.max(2, Math.round((v * 100) / max)));
  return { max, bars: days.map(d => ({ day: d.day, inPct: pct(d.income), outPct: pct(d.expense) })) };
}

// ---------- หมวด "อื่นๆ" ที่พิมพ์ชื่อเองได้ ----------
export const MAX_CAT_LABEL = 30;

// ชื่อหมวดที่จะแสดงของรายการ: หมวด "อื่นๆ" ที่พิมพ์ชื่อไว้ → ใช้ชื่อนั้น
export function categoryName(data) {
  const c = categoryOf(data?.kind, data?.category);
  return (c.id === 'other' && data?.catLabel) ? data.catLabel : c.name;
}

// ---------- รายการทำซ้ำ (ทุกวัน / ทุกเดือน / ทุก N หน่วย) ----------
// repeat = { every: จำนวนเต็ม ≥1, unit: 'day'|'week'|'month'|'year', last: วันที่ของรอบล่าสุดที่สร้างแล้ว }
export const REPEAT_UNITS = [
  { id: 'day', name: 'วัน' }, { id: 'week', name: 'สัปดาห์' },
  { id: 'month', name: 'เดือน' }, { id: 'year', name: 'ปี' },
];
export const MAX_REPEAT_EVERY = 365;

export function repeatLabel(repeat) {
  if (!repeat) return 'ครั้งเดียว';
  const u = REPEAT_UNITS.find(x => x.id === repeat.unit)?.name ?? repeat.unit;
  return repeat.every === 1 ? `ทุก${u}` : `ทุก ${repeat.every} ${u}`;
}

const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// วันที่รอบที่ n (n=0 คือวันเริ่ม) · รายเดือน/รายปียึดวันที่ของวันเริ่ม ถ้าเดือนนั้นไม่มีวันนั้น (เช่น 31) ใช้วันสุดท้ายของเดือน
export function nthDate(start, repeat, n) {
  const [y, m, d] = start.split('-').map(Number);
  const k = n * repeat.every;
  if (repeat.unit === 'day' || repeat.unit === 'week') {
    const t = new Date(Date.UTC(y, m - 1, d + k * (repeat.unit === 'week' ? 7 : 1)));
    return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const ym = shiftMonth(`${y}-${String(m).padStart(2, '0')}`, repeat.unit === 'year' ? k * 12 : k);
  return `${ym}-${String(Math.min(d, daysInMonth(ym))).padStart(2, '0')}`;
}

// วันที่ที่ต้องสร้างเพิ่ม: หลัง last จนถึง today (รวม today) · จำกัดจำนวนกันวนไม่จบ
export function dueDates(start, repeat, today, limit = 1000) {
  const out = [];
  const last = repeat.last ?? start;
  for (let n = 1; out.length < limit; n++) {
    const dt = nthDate(start, repeat, n);
    if (dt > today) break;
    if (dt > last) out.push(dt);
  }
  return out;
}
