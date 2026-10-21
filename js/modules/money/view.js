// หน้าเงิน: เลือกเดือน · สรุป · ตัวกรอง (ประเภท + โปรเจค) · รายการจัดกลุ่มตามวัน · แตะเพื่อแก้
import { formatBaht, categoryName, repeatLabel, monthKey, shiftMonth, summarizeMonth } from '../../domain/money.js';
import { sortForPicker } from '../../domain/projects.js';
import { categoryIcon, emptyArt } from '../../ui/art.js';
import { enLabel, clear } from '../../ui/dom.js';
import { openMoneySheet } from './sheet.js';

const pad = n => String(n).padStart(2, '0');
const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthName = m => new Date(`${m}-01T00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const dayName = iso => new Date(`${iso}T00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });

export function createMoneyView(container, ctx, params = {}) {
  const { store, h, icon, navigate } = ctx;
  const month = params.month ?? monthKey(todayISO());
  const kindFilter = params.kind ?? 'all';               // all | in | out
  const projectFilter = params.project ?? 'all';         // all | personal | <projectId>
  let alive = true;
  const go = patch => navigate('money', { month, kind: kindFilter, project: projectFilter, ...patch });

  async function render() {
    const [money, projects] = await Promise.all([store.list('money'), store.list('projects')]);
    if (!alive) return;
    const names = new Map(projects.filter(p => p.data).map(p => [p.id, p.data.name]));
    const corrupt = money.filter(t => !t.data).length;
    const inMonth = money.filter(t => t.data && monthKey(t.data.date) === month);
    const s = summarizeMonth(inMonth, month);
    const projOf = t => (t.data.projectId && names.has(t.data.projectId) ? t.data.projectId : null);
    const shown = inMonth.filter(t => (kindFilter === 'all' || t.data.kind === kindFilter)
      && (projectFilter === 'all' || (projectFilter === 'personal' ? projOf(t) === null : projOf(t) === projectFilter)));

    // จัดกลุ่มตามวัน ใหม่สุดก่อน
    const days = new Map();
    for (const t of shown.sort((a, b) => b.data.date.localeCompare(a.data.date) || b.updatedAt - a.updatedAt)) {
      if (!days.has(t.data.date)) days.set(t.data.date, []);
      days.get(t.data.date).push(t);
    }

    const projectSelect = h('select', {
      id: 'money-project', class: 'input', 'aria-label': 'กรองตามโปรเจค',
      onchange: e => go({ project: e.target.value }),
    },
      h('option', { value: 'all', selected: projectFilter === 'all' }, 'ทุกโปรเจค'),
      h('option', { value: 'personal', selected: projectFilter === 'personal' }, 'ส่วนตัว'),
      sortForPicker(projects).map(p => h('option', { value: p.id, selected: projectFilter === p.id }, p.data.name)));

    const dayGroups = [...days].map(([date, items]) => {
      const net = items.reduce((sum, t) => sum + (t.data.kind === 'in' ? t.data.amount : -t.data.amount), 0);
      return h('section', { class: 'day-group panel' },
        h('div', { class: 'split day-head' }, h('span', {}, dayName(date)),
          h('span', { class: `num ${net >= 0 ? 'money-in' : 'money-out'}` }, formatBaht(net, { sign: true }))),
        h('ul', { class: 'tx-list' }, items.map(t => {
          const cName = categoryName(t.data);
          const amt = t.data.kind === 'in' ? t.data.amount : -t.data.amount;
          const pid = projOf(t);
          return h('li', {}, h('button', {
            type: 'button', class: 'tx tx-btn', 'data-id': t.id,
            onclick: async () => { if (await openMoneySheet(ctx, { txId: t.id })) render(); },
          },
            h('span', { class: `icon-tile ${t.data.kind === 'in' ? 'money-in' : 'money-out'}` }, categoryIcon(t.data.kind, t.data.category)),
            h('span', { class: 'tx-main' },
              h('span', {}, t.data.note || cName,
                t.data.example ? h('span', { class: 'tag ex' }, 'ตัวอย่าง') : null,
                t.data.repeat ? h('span', { class: 'tag rep' }, `↻ ${repeatLabel(t.data.repeat)}`) : null,
                t.data.fromRepeat ? h('span', { class: 'tag ex', title: 'สร้างอัตโนมัติจากรายการทำซ้ำ' }, '↻ อัตโนมัติ') : null),
              h('span', { class: 'muted small' }, `${cName} · ${pid ? names.get(pid) : 'ส่วนตัว'}`)),
            h('span', { class: `num ${amt > 0 ? 'money-in' : 'money-out'}` }, formatBaht(amt, { sign: true }))));
        })));
    });

    clear(container,
      h('div', { class: 'month-bar' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'เดือนก่อน', onclick: () => go({ month: shiftMonth(month, -1) }) }, icon('chevronLeft')),
        h('div', { class: 'month-name' }, enLabel('Ledger'), h('h2', {}, monthName(month))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'เดือนถัดไป', onclick: () => go({ month: shiftMonth(month, 1) }) }, icon('chevronRight'))),
      h('div', { class: 'stat-grid three' },
        h('div', { class: 'stat' }, h('span', { class: 'label' }, '▲ รายรับ'), h('span', { class: 'num money-in', 'data-total': 'in' }, formatBaht(s.income))),
        h('div', { class: 'stat' }, h('span', { class: 'label' }, '▼ รายจ่าย'), h('span', { class: 'num money-out', 'data-total': 'out' }, formatBaht(s.expense))),
        h('div', { class: 'stat' }, h('span', { class: 'label' }, 'คงเหลือ'),
          h('span', { class: `num ${s.net >= 0 ? 'money-in' : 'money-out'}`, 'data-total': 'net' }, formatBaht(s.net, { sign: true })))),
      corrupt ? h('p', { class: 'alert gone' }, `มี ${corrupt} รายการอ่านไม่ได้ ยอดอาจไม่ครบ`) : null,
      h('div', { class: 'filters' },
        h('div', { class: 'seg small', role: 'group', 'aria-label': 'กรองประเภท' },
          [['all', 'ทั้งหมด'], ['in', 'รายรับ'], ['out', 'รายจ่าย']].map(([k, label]) => h('button', {
            type: 'button', class: `seg-btn ${k}`, 'aria-pressed': String(kindFilter === k), 'data-filter': k,
            onclick: () => go({ kind: k }),
          }, label))),
        projectSelect),
      dayGroups.length
        ? h('div', { class: 'day-list' }, dayGroups)
        : h('div', { class: 'empty' }, emptyArt('money'),
          h('p', {}, inMonth.length ? 'ไม่มีรายการตามตัวกรองนี้' : `ยังไม่มีรายการเงินใน${monthName(month)}`),
          h('button', {
            class: 'btn', type: 'button',
            onclick: async () => { if (await openMoneySheet(ctx, {})) render(); },
          }, icon('plus'), 'เพิ่มรายการ')),
    );
  }

  render();
  return { destroy() { alive = false; container.replaceChildren(); } };
}
