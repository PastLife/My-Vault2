// แผ่นเพิ่ม/แก้รายการเงิน (เปิดจากปุ่ม + กลางแถบล่าง และจากหน้าโปรเจค)
// เส้นทางสั้นสุด 4 แตะ: พิมพ์ยอด → แตะหมวด → แตะโปรเจค → บันทึก
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, categoryOf, AmountError, formatBaht, REPEAT_UNITS, MAX_CAT_LABEL } from '../../domain/money.js';
import { sortForPicker } from '../../domain/projects.js';
import { categoryIcon, typeIcon } from '../../ui/art.js';
import { saveTx, deleteTx, runRepeats } from './actions.js';

const pad = n => String(n).padStart(2, '0');
const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const amountToText = s => {
  const baht = Math.floor(s / 100);
  const st = s % 100;
  return `${baht.toLocaleString('en-US')}${st ? `.${pad(st)}` : ''}`;
};

export async function openMoneySheet(ctx, { txId, kind: kindParam, projectId: projectParam } = {}) {
  const { store, h, icon, openModal, toast, confirmModal } = ctx;
  const existing = txId ? await store.get(txId) : null;
  const projects = sortForPicker(await store.list('projects'));
  // ชื่อหมวด "อื่นๆ" ที่เคยพิมพ์ไว้ ไว้แนะนำให้เลือกซ้ำ
  const pastLabels = [...new Set((await store.list('money')).map(t => t.data?.catLabel).filter(Boolean))];
  const d = existing?.data;

  let kind = d?.kind ?? kindParam ?? 'out';
  let category = d?.category ?? '';
  let projectId = d ? d.projectId : (projectParam ?? null);
  // ทำซ้ำ: once | day | month | custom (ทุก N หน่วย)
  const r = d?.repeat;
  let repeatMode = !r ? 'once' : (r.every === 1 && (r.unit === 'day' || r.unit === 'month') ? r.unit : 'custom');

  return new Promise(resolve => {
    let saved = false;

    const amount = h('input', {
      id: 'tx-amount', class: 'input amount-input num', inputmode: 'decimal', autocomplete: 'off',
      placeholder: '0', 'aria-label': 'จำนวนเงิน (บาท)', value: d ? amountToText(d.amount) : '',
    });
    const date = h('input', { id: 'tx-date', class: 'input', type: 'date', value: d?.date ?? todayISO(), 'aria-label': 'วันที่' });
    const note = h('textarea', { id: 'tx-note', class: 'input', rows: 2, placeholder: 'เช่น ค่าเซิร์ฟเวอร์เกม' });
    note.value = d?.note ?? '';
    const noteBox = h('label', { class: 'field', for: 'tx-note', hidden: !note.value }, h('span', { class: 'label' }, 'โน้ต'), note);
    const noteToggle = h('button', {
      type: 'button', class: 'link', hidden: !!note.value,
      onclick: () => { noteBox.hidden = false; noteToggle.hidden = true; note.focus(); },
    }, '＋ เพิ่มโน้ต');
    const msg = h('p', { class: 'error', 'aria-live': 'polite' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'ประเภทรายการ' });
    const catBox = h('div', { class: 'chips wrap', role: 'group', 'aria-label': 'หมวด' });
    const projBox = h('div', { class: 'chips wrap', role: 'group', 'aria-label': 'ของโปรเจค' });
    const sheetEl = h('div');

    // หมวด "อื่นๆ" → พิมพ์ชื่อหมวดเองได้
    const catLabel = h('input', {
      id: 'tx-catlabel', class: 'input', maxlength: MAX_CAT_LABEL, autocomplete: 'off',
      placeholder: 'พิมพ์ชื่อหมวด เช่น ค่าเลี้ยงแมว', list: 'tx-catlabel-list', value: d?.catLabel ?? '',
    });
    const catLabelBox = h('label', { class: 'field', for: 'tx-catlabel' },
      h('span', { class: 'label' }, 'ชื่อหมวด (ไม่ใส่ก็ได้)'), catLabel,
      h('datalist', { id: 'tx-catlabel-list' }, pastLabels.map(v => h('option', { value: v }))));

    // ทำซ้ำ → "อื่นๆ" พิมพ์รอบเองได้: ทุก [N] [วัน/สัปดาห์/เดือน/ปี]
    const repEvery = h('input', {
      id: 'tx-rep-every', class: 'input num rep-every', inputmode: 'numeric', autocomplete: 'off',
      'aria-label': 'ทุกกี่หน่วย', value: r && repeatMode === 'custom' ? String(r.every) : '2',
    });
    const repUnit = h('select', { id: 'tx-rep-unit', class: 'input', 'aria-label': 'หน่วย' },
      REPEAT_UNITS.map(u => h('option', { value: u.id, selected: (r && repeatMode === 'custom' ? r.unit : 'week') === u.id }, u.name)));
    const repCustom = h('div', { class: 'input-row rep-custom' }, h('span', {}, 'ทุก'), repEvery, repUnit);
    const repHint = h('p', { class: 'muted small' });
    const repBox = h('div', { class: 'chips wrap', role: 'group', 'aria-label': 'ทำซ้ำ' });

    function renderRepeat() {
      repBox.replaceChildren(...[['once', 'ครั้งเดียว'], ['day', 'ทุกวัน'], ['month', 'ทุกเดือน'], ['custom', 'อื่นๆ']].map(([k, label]) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(repeatMode === k), 'data-repeat': k,
        onclick: () => { repeatMode = k; renderRepeat(); if (k === 'custom') repEvery.focus(); },
      }, label)));
      repCustom.hidden = repeatMode !== 'custom';
      repHint.hidden = repeatMode === 'once';
      repHint.textContent = 'แอปจะเพิ่มรายการนี้ให้เองเมื่อถึงรอบ (นับจากวันที่ที่เลือก) · เลือก "ครั้งเดียว" เพื่อหยุด';
    }

    function readRepeat() {
      if (repeatMode === 'once') return null;
      if (repeatMode === 'day' || repeatMode === 'month') return { every: 1, unit: repeatMode };
      const n = String(repEvery.value).replace(/[๐-๙]/g, x => String(x.charCodeAt(0) - 0x0E50)).trim();
      return { every: /^\d+$/.test(n) ? Number(n) : NaN, unit: repUnit.value };
    }

    function renderSeg() {
      seg.replaceChildren(...[['in', '▲ รายรับ'], ['out', '▼ รายจ่าย']].map(([k, label]) => h('button', {
        type: 'button', class: `seg-btn ${k}`, 'aria-pressed': String(kind === k), 'data-kind': k,
        onclick: () => {
          kind = k;
          if (category && categoryOf(kind, category).id !== category) category = '';
          renderSeg(); renderCats();
        },
      }, label)));
      sheetEl.dataset.kind = kind;
    }

    function renderCats() {
      const list = kind === 'in' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      catBox.replaceChildren(...list.map(c => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(category === c.id), 'data-cat': c.id,
        onclick: () => { category = c.id; renderCats(); if (c.id === 'other') catLabel.focus(); },
      }, categoryIcon(kind, c.id), c.name)));
      catLabelBox.hidden = category !== 'other';
    }

    function renderProjects() {
      // ซ่อนโปรเจคที่เสร็จแล้ว ยกเว้นตัวที่เลือกอยู่
      const shown = projects.filter(p => p.data.status !== 'done' || p.id === projectId);
      projBox.replaceChildren(
        h('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(projectId === null), 'data-project': 'personal',
          onclick: () => { projectId = null; renderProjects(); },
        }, icon('home'), 'ส่วนตัว'),
        ...shown.map(p => h('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(projectId === p.id), 'data-project': p.id,
          onclick: () => { projectId = p.id; renderProjects(); },
        }, typeIcon(p.data.type), p.data.name)),
      );
    }

    renderSeg(); renderCats(); renderProjects(); renderRepeat();

    const saveBtn = h('button', { class: 'btn primary block', type: 'submit' }, 'บันทึก');
    const form = h('form', {
      class: 'stack money-sheet',
      onsubmit: async e => {
        e.preventDefault();
        msg.textContent = '';
        saveBtn.disabled = true;
        try {
          const repeat = readRepeat();
          await saveTx(store, {
            id: existing?.id, kind, amountText: amount.value, date: date.value, category, projectId, note: note.value,
            catLabel: catLabel.value, repeat,
          });
          // วันเริ่มอยู่ในอดีต → สร้างรอบที่ถึงกำหนดแล้วให้เลย
          const made = repeat ? await runRepeats(store, todayISO()) : 0;
          saved = true;
          m.close();
          toast(`${kind === 'in' ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย'}แล้ว${made ? ` · เพิ่มรอบที่ถึงกำหนด ${made} รายการ` : ''}`);
        } catch (err) {
          if (!(err instanceof AmountError) && !/วันที่|รายรับ|รอบทำซ้ำ/.test(err.message)) console.error(err);
          msg.textContent = err instanceof AmountError || /วันที่|รายรับ|รอบทำซ้ำ/.test(err.message) ? err.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
          saveBtn.disabled = false;
          if (err instanceof AmountError) amount.focus();
        }
      },
    },
      h('div', { class: 'sheet-head' },
        h('h2', {}, existing ? 'แก้รายการเงิน' : 'เพิ่มรายการเงิน'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ปิด', onclick: () => m.close() }, icon('close'))),
      seg,
      h('label', { class: 'amount-row', for: 'tx-amount' }, h('span', { class: 'amount-cur' }, '฿'), amount),
      msg,
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'หมวด'), catBox),
      catLabelBox,
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'ของโปรเจค'), projBox),
      h('div', { class: 'two-col' },
        h('label', { class: 'field', for: 'tx-date' }, h('span', { class: 'label' }, 'วันที่'), date),
        h('div', { class: 'field note-slot' }, noteToggle)),
      noteBox,
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'ทำซ้ำ'), repBox, repCustom, repHint),
      h('div', { class: 'actions' },
        existing ? h('button', {
          class: 'btn danger', type: 'button', style: 'margin-right:auto',
          onclick: async () => {
            if (!(await confirmModal(`ลบรายการ ${formatBaht(d.amount)} นี้?`, 'ลบ'))) return;
            await deleteTx(store, existing.id);
            saved = true;
            m.close();
            toast('ลบแล้ว');
          },
        }, 'ลบ') : null),
      saveBtn,
    );
    sheetEl.append(form);

    const m = openModal(sheetEl, { label: existing ? 'แก้รายการเงิน' : 'เพิ่มรายการเงิน', onClose: () => resolve(saved) });
    m.sheet.classList.add('sheet-money');
    amount.focus();
  });
}
