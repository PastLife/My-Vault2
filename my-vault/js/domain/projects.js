// กติกาโปรเจคชีวิต — ฟังก์ชันล้วน ไม่แตะ DOM / ที่เก็บ
import { monthKey } from './money.js';

export const PROJECT_TYPES = [
  { id: 'work', name: 'งาน' }, { id: 'study', name: 'เรียน' }, { id: 'hobby', name: 'งานอดิเรก' },
  { id: 'business', name: 'ธุรกิจ' }, { id: 'health', name: 'สุขภาพ' }, { id: 'other', name: 'อื่นๆ' },
];

export const PROJECT_STATUSES = [
  { id: 'plan', name: 'วางแผน', color: '#5CC8FF' },
  { id: 'active', name: 'กำลังทำ', color: '#7CF07A' },
  { id: 'paused', name: 'พักไว้', color: '#F2A93B' },
  { id: 'done', name: 'เสร็จแล้ว', color: '#7F8C77' },
];

export const typeOf = id => PROJECT_TYPES.find(t => t.id === id) ?? PROJECT_TYPES[PROJECT_TYPES.length - 1];
export const statusOf = id => PROJECT_STATUSES.find(s => s.id === id) ?? PROJECT_STATUSES[0];

export function emptyProject(type = 'other') {
  return {
    name: '', type, status: 'active', tasks: [], goalMonthly: null,
    startDate: '', note: '', images: [], example: false,
  };
}

// % งานที่ติ๊กแล้ว ปัดลง · ไม่มีงาน → null (ไม่แสดง %)
export function progress(project) {
  const tasks = project?.tasks ?? [];
  if (!tasks.length) return null;
  return Math.floor((tasks.filter(t => t.done).length * 100) / tasks.length);
}

export function projectMonth(projectId, txs, month) {
  let income = 0;
  let expense = 0;
  for (const { data } of txs) {
    if (!data || data.projectId !== projectId || monthKey(data.date) !== month) continue;
    if (data.kind === 'in') income += data.amount; else expense += data.amount;
  }
  return { income, expense, net: income - expense };
}

export function goalPercent(net, goal) {
  if (!goal) return null;
  return Math.max(0, Math.min(100, Math.floor((net * 100) / goal)));
}

// รายการเงินของโปรเจคที่จะลบ → สำเนาที่ย้ายเป็น "ส่วนตัว" (ไม่แก้ของเดิม)
export function reassignToPersonal(txs, projectId) {
  return txs
    .filter(t => t.data?.projectId === projectId)
    .map(t => ({ ...t, data: { ...t.data, projectId: null } }));
}

const STATUS_ORDER = ['active', 'plan', 'paused', 'done'];
const rank = s => { const i = STATUS_ORDER.indexOf(s); return i < 0 ? STATUS_ORDER.length : i; };

// สำหรับตัวเลือกโปรเจค: กำลังทำขึ้นก่อน แล้วเรียงชื่อตามภาษาไทย · รายการเสียหายถูกตัดออก
export function sortForPicker(projects) {
  return projects
    .filter(p => p.data)
    .sort((a, b) => rank(a.data.status) - rank(b.data.status)
      || a.data.name.localeCompare(b.data.name, 'th'));
}

// โปรเจคที่ "กำลังทำ" สำหรับหน้าแรก: กำไรเดือนนี้มาก → น้อย
export function activeOps(projects, txs, month) {
  return projects
    .filter(p => p.data?.status === 'active')
    .map(p => ({ id: p.id, project: p.data, net: projectMonth(p.id, txs, month).net, progress: progress(p.data) }))
    .sort((a, b) => b.net - a.net || a.project.name.localeCompare(b.project.name, 'th'));
}
