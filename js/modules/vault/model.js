// กติกาของสมุด — logic ล้วน ไม่แตะ DOM และไม่แตะที่เก็บข้อมูล

export const MAX_IMAGES = 6;
export const EXPIRY_WARN_DAYS = 60;

// หมวดและช่องสำเร็จรูป (ยกมาจากเวอร์ชันแรก)
export const CATEGORIES = [
  { id: 'me', name: 'ข้อมูลส่วนตัว', code: 'ME', tpl: [['ชื่อ-นามสกุล', 'text'], ['วันเกิด', 'date'], ['ที่อยู่', 'text'], ['เบอร์โทร', 'text']] },
  { id: 'doc', name: 'เอกสารสำคัญ', code: 'DOC', tpl: [['เลขที่เอกสาร', 'secret'], ['วันออกบัตร', 'date'], ['วันหมดอายุ', 'date']] },
  { id: 'acc', name: 'บัญชีออนไลน์', code: 'WEB', tpl: [['เว็บไซต์/แอป', 'text'], ['ชื่อผู้ใช้', 'text'], ['รหัสผ่าน', 'secret']] },
  { id: 'money', name: 'การเงิน', code: 'FIN', tpl: [['ธนาคาร', 'text'], ['ชื่อบัญชี', 'text'], ['เลขบัญชี', 'secret']] },
  { id: 'health', name: 'สุขภาพ', code: 'MED', tpl: [['กรุ๊ปเลือด', 'text'], ['แพ้ยา/อาหาร', 'text'], ['โรงพยาบาลประจำ', 'text']] },
  { id: 'contact', name: 'ผู้ติดต่อ', code: 'TEL', tpl: [['ความสัมพันธ์', 'text'], ['เบอร์โทร', 'text'], ['อีเมล', 'text']] },
  { id: 'note', name: 'โน้ต', code: 'TXT', tpl: [] },
];

const FIELD_TYPES = ['text', 'date', 'secret'];
const EXPIRY_LABEL = /หมดอายุ|ครบกำหนด/;
const DAY_MS = 86400000;

export const categoryOf = id => CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export function emptyEntry(cat) {
  const c = categoryOf(cat);
  return {
    cat: c.id, title: '', note: '', images: [], example: false,
    fields: c.tpl.map(([k, t]) => ({ k, v: '', t })),
  };
}

// แปลง 'YYYY-MM-DD' เป็นเลขวัน (นับแบบ UTC จึงไม่เพี้ยนช่วงเปลี่ยนเวลาฤดูร้อน)
function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(t) ? null : t / DAY_MS;
}

// ช่องวันที่ที่ชื่อมี "หมดอายุ/ครบกำหนด" — ถ้ามีหลายช่อง ใช้วันที่ใกล้สุด
export function expiryDays(entry, todayISO) {
  const today = dayNumber(todayISO);
  let soonest = null;
  for (const f of entry?.fields ?? []) {
    if (f.t !== 'date' || !EXPIRY_LABEL.test(f.k)) continue;
    const d = dayNumber(f.v);
    if (d === null) continue;
    const diff = d - today;
    if (soonest === null || diff < soonest) soonest = diff;
  }
  return soonest;
}

export function expiryAlerts(entries, todayISO) {
  const out = [];
  for (const { id, data } of entries) {
    if (!data) continue; // รายการเสียหาย
    const days = expiryDays(data, todayISO);
    if (days !== null && days <= EXPIRY_WARN_DAYS) out.push({ id, title: data.title || '(ไม่มีชื่อ)', days });
  }
  return out.sort((a, b) => a.days - b.days);
}

export function matches(entry, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const hay = [entry.title, entry.note, ...entry.fields.flatMap(f => [f.k, f.v])]
    .join('\n').toLowerCase();
  return hay.includes(q);
}

function addDays(iso, n) {
  return new Date((dayNumber(iso) + n) * DAY_MS).toISOString().slice(0, 10);
}

// ข้อมูลตัวอย่างตอนเปิดใช้ครั้งแรก (ชุดเดียวกับเวอร์ชันแรก)
export function sampleEntries(todayISO) {
  const ex = (cat, title, fields, note = '') => ({
    cat, title, note, images: [], example: true,
    fields: fields.map(([k, v, t]) => ({ k, v, t })),
  });
  return [
    ex('me', 'ข้อมูลของฉัน (ตัวอย่าง)', [
      ['ชื่อ-นามสกุล', 'สมชาย ใจดี', 'text'], ['วันเกิด', '1995-04-12', 'date'], ['เบอร์โทร', '081-234-5678', 'text'],
    ]),
    ex('doc', 'บัตรประชาชน (ตัวอย่าง)', [
      ['เลขที่เอกสาร', '1-2345-67890-12-3', 'secret'], ['วันออกบัตร', '2019-05-02', 'date'],
      ['วันหมดอายุ', addDays(todayISO, 40), 'date'],
    ], 'ต่ออายุที่สำนักงานเขต'),
    ex('acc', 'อีเมลหลัก (ตัวอย่าง)', [
      ['เว็บไซต์/แอป', 'gmail.com', 'text'], ['ชื่อผู้ใช้', 'somchai@example.com', 'text'],
      ['รหัสผ่าน', 'correct-horse-42', 'secret'],
    ]),
    ex('health', 'ข้อมูลสุขภาพ (ตัวอย่าง)', [['กรุ๊ปเลือด', 'O', 'text'], ['แพ้ยา/อาหาร', '—', 'text']]),
    ex('contact', 'ติดต่อฉุกเฉิน (ตัวอย่าง)', [['ความสัมพันธ์', 'พี่สาว', 'text'], ['เบอร์โทร', '089-111-2222', 'text']]),
  ];
}

// รับข้อความจากปุ่ม "คัดลอกข้อมูลสำรอง" ของเวอร์ชันแรก แล้วแปลงเป็นรูปแบบใหม่
// ค่าที่แปลกจะถูกซ่อมให้ใช้ได้ แทนที่จะทำให้การนำเข้าทั้งก้อนล้ม
export function fromLegacy(jsonText) {
  let arr;
  try { arr = JSON.parse(jsonText); } catch { throw new Error('รูปแบบไม่ถูกต้อง'); }
  if (!Array.isArray(arr)) throw new Error('รูปแบบไม่ถูกต้อง');
  return arr
    .filter(x => x && typeof x === 'object' && !Array.isArray(x))
    .map(x => ({
      cat: categoryOf(x.cat).id,
      title: String(x.title ?? ''),
      example: x.ex === true,
      images: [],
      note: String(x.note ?? ''),
      fields: (Array.isArray(x.fields) ? x.fields : [])
        .filter(f => f && typeof f === 'object')
        .map(f => ({
          k: String(f.k ?? ''),
          v: String(f.v ?? ''),
          t: FIELD_TYPES.includes(f.t) ? f.t : 'text',
        })),
    }));
}
