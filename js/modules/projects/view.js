// หน้าโปรเจค: รายการแยกแท็บประเภท · หน้าโปรเจคเดียว · ฟอร์มแก้ไข
import { StorageFullError } from '../../core/store.js';
import { prepareImage, ImageDecodeError } from '../../core/images.js';
import {
  PROJECT_TYPES, PROJECT_STATUSES, typeOf, statusOf, emptyProject, progress, projectMonth, goalPercent,
} from '../../domain/projects.js';
import { parseAmount, AmountError, formatBaht, categoryName, monthKey } from '../../domain/money.js';
import { saveProject, toggleTask, deleteProject, TooManyImagesError } from './actions.js';
import { typeIcon, categoryIcon, emptyArt } from '../../ui/art.js';
import { enLabel, clear } from '../../ui/dom.js';

const MAX_IMAGES = 6;
const pad = n => String(n).padStart(2, '0');
const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')
  ? new Date(`${iso}T00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const satangToText = s => (s ? String(s / 100) : '');
const newId = () => globalThis.crypto.randomUUID();

function errorText(e) {
  if (e instanceof StorageFullError || e instanceof ImageDecodeError || e instanceof TooManyImagesError || e instanceof AmountError) return e.message;
  console.error(e);
  return 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
}

export function createProjectsView(container, ctx, params = {}) {
  const { store, h, icon, toast, openModal, confirmModal, objectUrl, navigate, runAction } = ctx;
  const month = monthKey(todayISO());
  let alive = true;
  const urls = new Map();
  const imageUrl = id => {
    if (!urls.has(id)) urls.set(id, store.getImage(id).then(objectUrl));
    return urls.get(id);
  };

  async function load() {
    const [projects, money] = await Promise.all([store.list('projects'), store.list('money')]);
    return { projects, money };
  }

  // ---------- ส่วนประกอบ ----------
  const statusLine = p => h('span', { class: 'proj-status' },
    h('span', { class: 'status-dot', 'data-status': p.status }), statusOf(p.status).name);

  function progressBar(pct, cls = '') {
    return h('div', { class: `progress ${cls}`, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
      h('i', { style: `width:${pct}%` }));
  }

  const netText = net => h('span', { class: `num ${net > 0 ? 'money-in' : net < 0 ? 'money-out' : 'muted'}` },
    net ? formatBaht(net, { sign: true }) : '฿0');

  // ---------- รายการ ----------
  async function renderList() {
    const { projects, money } = await load();
    if (!alive) return;
    const tab = params.tab ?? 'all';
    const ok = projects.filter(p => p.data);
    const count = id => ok.filter(p => id === 'all' || p.data.type === id).length;
    // กำลังทำ → วางแผน → พักไว้ → เสร็จแล้ว · ในกลุ่มเดียวกัน แก้ล่าสุดขึ้นก่อน
    const ORDER = ['active', 'plan', 'paused', 'done'];
    const rank = s => (ORDER.indexOf(s) + 5) % 5;
    const visible = ok.filter(p => tab === 'all' || p.data.type === tab)
      .sort((a, b) => rank(a.data.status) - rank(b.data.status) || b.updatedAt - a.updatedAt);

    const tabs = h('div', { class: 'chips', role: 'group', 'aria-label': 'ประเภทโปรเจค' },
      [{ id: 'all', name: 'ทั้งหมด' }, ...PROJECT_TYPES].map(t => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(tab === t.id), 'data-type': t.id,
        onclick: () => navigate('projects', { tab: t.id }),
      }, t.name, h('span', { class: 'chip-count' }, count(t.id)))));

    const cards = visible.map(p => {
      const d = p.data;
      const pct = progress(d);
      const { net } = projectMonth(p.id, money, month);
      return h('button', {
        type: 'button', class: 'proj-card panel', 'data-id': p.id,
        onclick: () => navigate('projects', { projectId: p.id, tab }),
      },
        h('span', { class: 'icon-tile', 'data-status': d.status }, typeIcon(d.type)),
        h('span', { class: 'proj-main' },
          h('span', { class: 'proj-name' }, d.name || '(ไม่มีชื่อ)', d.example ? h('span', { class: 'tag ex' }, 'ตัวอย่าง') : null),
          h('span', { class: 'proj-meta' }, statusLine(d), ` · ${typeOf(d.type).name}`,
            pct === null ? null : ` · งาน ${d.tasks.filter(t => t.done).length}/${d.tasks.length}`),
          pct === null ? null : progressBar(pct)),
        h('span', { class: 'proj-net' }, h('span', { class: 'label small' }, 'เดือนนี้'), netText(net)),
      );
    });

    clear(container,
      h('div', { class: 'module-tools' },
        h('span', { class: 'en' }, `Operations · ${ok.length}`),
        h('button', { class: 'btn primary', type: 'button', onclick: () => openEditor(null, tab) }, icon('plus'), 'โปรเจคใหม่')),
      tabs,
      cards.length
        ? h('div', { class: 'proj-list' }, cards)
        : h('div', { class: 'empty' }, emptyArt('projects'),
          h('p', {}, tab === 'all' ? 'ยังไม่มีโปรเจค เริ่มบันทึกสิ่งที่กำลังทำอยู่ได้เลย' : 'ยังไม่มีโปรเจคประเภทนี้'),
          h('button', { class: 'btn', type: 'button', onclick: () => openEditor(null, tab) }, icon('plus'), 'เพิ่มโปรเจคแรก')),
    );
  }

  // ---------- หน้าโปรเจคเดียว ----------
  async function renderDetail(id) {
    const [{ money }, rec] = await Promise.all([load(), store.get(id).catch(() => null)]);
    if (!alive) return;
    if (!rec) { navigate('projects', { tab: params.tab }); return; }
    const d = rec.data;
    const pct = progress(d);
    const m = projectMonth(id, money, month);
    const goal = goalPercent(m.net, d.goalMonthly);
    const txs = money.filter(t => t.data?.projectId === id)
      .sort((a, b) => b.data.date.localeCompare(a.data.date) || b.updatedAt - a.updatedAt);

    const taskList = h('ul', { class: 'tasks' }, d.tasks.map(t => h('li', {},
      h('label', { class: `task ${t.done ? 'done' : ''}` },
        h('input', {
          type: 'checkbox', checked: t.done, 'data-task': t.id,
          onchange: async () => { await toggleTask(store, id, t.id); renderDetail(id); },
        }),
        h('span', {}, t.text)))));
    const newTask = h('input', { id: 'new-task', class: 'input', placeholder: 'เพิ่มงานใหม่ แล้วกด Enter', autocomplete: 'off' });
    const addTaskForm = h('form', {
      class: 'add-task',
      onsubmit: async e => {
        e.preventDefault();
        const text = newTask.value.trim();
        if (!text) return;
        const fresh = await store.get(id);
        await store.put('projects', { ...fresh.data, tasks: [...fresh.data.tasks, { id: newId(), text, done: false }] }, id);
        renderDetail(id).then(() => container.querySelector('#new-task')?.focus());
      },
    }, newTask, h('button', { class: 'btn small', type: 'submit' }, 'เพิ่ม'));

    const thumbs = d.images.length ? h('div', { class: 'thumbs' }, d.images.map((im, i) => {
      const imgEl = h('img', { alt: `รูปที่ ${i + 1}`, width: 64, height: 64 });
      imageUrl(im.thumbId).then(u => { imgEl.src = u; }).catch(() => {});
      return h('button', { type: 'button', class: 'thumb', 'aria-label': `ดูรูปที่ ${i + 1}`, onclick: () => openImage(im) }, imgEl);
    })) : null;

    clear(container,
      h('div', { class: 'proj-head' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'กลับไปรายการโปรเจค', onclick: () => navigate('projects', { tab: params.tab }) }, icon('chevronLeft')),
        h('span', { class: 'icon-tile', 'data-status': d.status }, typeIcon(d.type)),
        h('div', { class: 'proj-title' },
          enLabel('Op', typeOf(d.type).name),
          h('h2', {}, d.name || '(ไม่มีชื่อ)', d.example ? h('span', { class: 'tag ex' }, 'ตัวอย่าง') : null)),
        h('button', { class: 'btn small', type: 'button', onclick: () => openEditor(rec) }, 'แก้ไข')),
      h('section', { class: 'panel stack' },
        h('div', { class: 'split' }, statusLine(d), d.startDate ? h('span', { class: 'muted' }, `เริ่ม ${fmtDate(d.startDate)}`) : null),
        h('div', { class: 'stat-grid' },
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'กำไรเดือนนี้'), netText(m.net)),
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'ความคืบหน้า'),
            h('span', { class: 'num amber' }, pct === null ? '—' : `${pct}%`))),
        d.goalMonthly ? h('div', { class: 'stack tight' },
          h('span', { class: 'label' }, `เป้ารายได้ ${formatBaht(d.goalMonthly)} / เดือน · ได้ ${goal}%`),
          progressBar(goal, 'in')) : null),
      h('section', { class: 'panel stack' },
        enLabel('Tasks', 'งานที่ต้องทำ'),
        d.tasks.length ? taskList : h('p', { class: 'muted' }, 'ยังไม่มีงาน เพิ่มงานย่อยเพื่อดูความคืบหน้า'),
        addTaskForm),
      h('section', { class: 'panel stack' },
        h('div', { class: 'split' }, enLabel('Ledger', 'เงินของโปรเจค'),
          h('button', {
            class: 'btn small', type: 'button', 'data-add-money': '',
            onclick: () => runAction('add-money', { projectId: id }),
          }, icon('plus'), 'เพิ่มรายการเงิน')),
        txs.length ? h('ul', { class: 'tx-list' }, txs.slice(0, 20).map(t => {
          const amt = t.data.kind === 'in' ? t.data.amount : -t.data.amount;
          return h('li', { class: 'tx' },
            h('span', { class: `icon-tile ${t.data.kind === 'in' ? 'money-in' : 'money-out'}` }, categoryIcon(t.data.kind, t.data.category)),
            h('span', { class: 'tx-main' }, h('span', {}, t.data.note || categoryName(t.data)), h('span', { class: 'muted small' }, fmtDate(t.data.date))),
            h('span', { class: `num ${amt > 0 ? 'money-in' : 'money-out'}` }, formatBaht(amt, { sign: true })));
        })) : h('p', { class: 'muted' }, 'ยังไม่มีรายการเงินของโปรเจคนี้')),
      d.note || thumbs ? h('section', { class: 'panel stack' },
        enLabel('Notes', 'โน้ตและรูป'),
        d.note ? h('p', { class: 'note' }, d.note) : null, thumbs) : null,
    );
  }

  function openImage(im) {
    const imgEl = h('img', { class: 'viewer-img', alt: 'รูปโปรเจค' });
    imageUrl(im.fullId).then(u => { imgEl.src = u; }).catch(() => toast('เปิดรูปนี้ไม่ได้'));
    const m = openModal(h('div', { class: 'viewer' },
      h('div', { class: 'viewer-bar' }, h('span', {}, 'รูปโปรเจค'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ปิด', onclick: () => m.close() }, icon('close'))),
      h('div', { class: 'viewer-stage' }, imgEl)), { label: 'ดูรูป' });
    m.sheet.classList.add('sheet-viewer');
  }

  // ---------- ฟอร์มเพิ่ม/แก้ไข ----------
  function openEditor(existing, tab = 'all') {
    const isNew = !existing;
    const d = isNew ? emptyProject(tab !== 'all' ? tab : 'other') : structuredClone(existing.data);
    const kept = [...d.images];
    const removed = [];
    const fresh = [];
    let tasks = d.tasks.map(t => ({ ...t }));
    let busy = false;

    const select = (id, list, value) => h('select', { id, class: 'input' },
      list.map(x => h('option', { value: x.id, selected: x.id === value }, x.name)));
    const name = h('input', { id: 'pj-name', class: 'input', value: d.name, placeholder: 'เช่น เกม Roblox, เรียนเทรด, ฟิตหุ่น', autocomplete: 'off' });
    const type = select('pj-type', PROJECT_TYPES, d.type);
    const status = select('pj-status', PROJECT_STATUSES, d.status);
    const start = h('input', { id: 'pj-start', class: 'input', type: 'date', value: d.startDate });
    const goal = h('input', { id: 'pj-goal', class: 'input num', inputmode: 'decimal', value: satangToText(d.goalMonthly), placeholder: 'ไม่ใส่ก็ได้ เช่น 5,000', autocomplete: 'off' });
    const note = h('textarea', { id: 'pj-note', class: 'input', rows: 3 });
    note.value = d.note;
    const taskBox = h('div', { class: 'stack tight' });
    const imgStrip = h('div', { class: 'img-strip' });
    const msg = h('p', { class: 'error', 'aria-live': 'polite' });
    const fileInput = h('input', { id: 'pj-images', type: 'file', accept: 'image/*', multiple: true, class: 'offscreen', tabindex: '-1' });

    function renderTasks() {
      taskBox.replaceChildren(...tasks.map((t, i) => h('div', { class: 'input-row' },
        h('input', { class: 'input', value: t.text, 'aria-label': `งานที่ ${i + 1}`, oninput: e => { t.text = e.target.value; } }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'ลบงานนี้', onclick: () => { tasks.splice(i, 1); renderTasks(); } }, icon('close')))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { tasks.push({ id: newId(), text: '', done: false }); renderTasks(); taskBox.querySelector('.input-row:last-of-type input')?.focus(); } },
        icon('plus'), 'เพิ่มงาน'));
    }

    function renderImages() {
      const total = kept.length + fresh.length;
      clear(imgStrip,
        ...kept.map((im, i) => {
          const el = h('img', { alt: `รูปที่ ${i + 1}` });
          imageUrl(im.thumbId).then(u => { el.src = u; }).catch(() => {});
          return h('div', { class: 'img-tile' }, el, h('button', { type: 'button', class: 'img-remove', 'aria-label': `เอารูปที่ ${i + 1} ออก`, onclick: () => { removed.push(...kept.splice(i, 1)); renderImages(); } }, icon('close')));
        }),
        ...fresh.map((im, i) => h('div', { class: 'img-tile new' }, h('img', { alt: 'รูปใหม่', src: im.url }),
          h('button', { type: 'button', class: 'img-remove', 'aria-label': 'เอารูปใหม่ออก', onclick: () => { fresh.splice(i, 1); renderImages(); } }, icon('close')))),
        total < MAX_IMAGES ? h('button', { type: 'button', class: 'img-add', disabled: busy, onclick: () => fileInput.click() }, icon('image'), busy ? 'กำลังเตรียม…' : 'แนบรูป') : null,
        h('span', { class: 'muted small img-count' }, `${total}/${MAX_IMAGES} รูป`));
    }

    fileInput.addEventListener('change', async () => {
      const files = [...fileInput.files];
      fileInput.value = '';
      const room = MAX_IMAGES - kept.length - fresh.length;
      busy = true; renderImages();
      for (const file of files.slice(0, room)) {
        try {
          const p = await prepareImage(file);
          fresh.push({ ...p, url: objectUrl(new Blob([p.thumb], { type: 'image/jpeg' })) });
        } catch (e) { msg.textContent = errorText(e); }
        renderImages();
      }
      busy = false; renderImages();
    });

    renderTasks();
    renderImages();
    const saveBtn = h('button', { class: 'btn primary', type: 'submit' }, 'บันทึก');

    const form = h('form', {
      class: 'stack',
      onsubmit: async e => {
        e.preventDefault();
        msg.textContent = '';
        if (busy) { msg.textContent = 'รอให้รูปเตรียมเสร็จก่อน'; return; }
        if (!name.value.trim()) { msg.textContent = 'ใส่ชื่อโปรเจคก่อน'; name.focus(); return; }
        let goalMonthly = null;
        try { if (goal.value.trim()) goalMonthly = parseAmount(goal.value); } catch (err) { msg.textContent = `เป้ารายได้: ${err.message}`; goal.focus(); return; }
        saveBtn.disabled = true;
        try {
          const id = await saveProject(store, {
            id: existing?.id,
            data: {
              ...d, name: name.value.trim(), type: type.value, status: status.value, startDate: start.value,
              goalMonthly, note: note.value.trim(), tasks: tasks.filter(t => t.text.trim()).map(t => ({ ...t, text: t.text.trim() })), images: kept,
            },
            newImages: fresh, removed,
          });
          modal.close();
          toast('บันทึกแล้ว');
          navigate('projects', { projectId: id, tab: params.tab });
        } catch (err) {
          msg.textContent = errorText(err);
          saveBtn.disabled = false;
        }
      },
    },
      h('div', { class: 'sheet-head' }, h('h2', {}, isNew ? 'โปรเจคใหม่' : 'แก้ไขโปรเจค'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ปิด', onclick: () => modal.close() }, icon('close'))),
      h('label', { class: 'field', for: 'pj-name' }, h('span', { class: 'label' }, 'ชื่อโปรเจค'), name),
      h('div', { class: 'two-col' },
        h('label', { class: 'field', for: 'pj-type' }, h('span', { class: 'label' }, 'ประเภท'), type),
        h('label', { class: 'field', for: 'pj-status' }, h('span', { class: 'label' }, 'สถานะ'), status)),
      h('div', { class: 'two-col' },
        h('label', { class: 'field', for: 'pj-start' }, h('span', { class: 'label' }, 'วันเริ่ม'), start),
        h('label', { class: 'field', for: 'pj-goal' }, h('span', { class: 'label' }, 'เป้ารายได้ต่อเดือน (บาท)'), goal)),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'งานที่ต้องทำ'), taskBox),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'รูป'), imgStrip, fileInput),
      h('label', { class: 'field', for: 'pj-note' }, h('span', { class: 'label' }, 'โน้ต'), note),
      msg,
      h('div', { class: 'actions' },
        isNew ? null : h('button', {
          class: 'btn danger', type: 'button', style: 'margin-right:auto',
          onclick: async () => {
            const linked = (await store.list('money')).filter(t => t.data?.projectId === existing.id).length;
            const text = linked
              ? `ลบ "${d.name}"? รายการเงิน ${linked} รายการของโปรเจคนี้จะย้ายไป "ส่วนตัว" (ยอดเงินรวมไม่เปลี่ยน)`
              : `ลบ "${d.name}"?`;
            if (!(await confirmModal(text, 'ลบโปรเจค'))) return;
            try {
              const { moved } = await deleteProject(store, existing.id);
              modal.close();
              toast(moved ? `ลบแล้ว · ย้ายเงิน ${moved} รายการไป "ส่วนตัว"` : 'ลบแล้ว');
              navigate('projects', { tab: params.tab });
            } catch (err) { msg.textContent = errorText(err); }
          },
        }, 'ลบโปรเจค'),
        h('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'ยกเลิก'),
        saveBtn),
    );
    const modal = openModal(form, { label: isNew ? 'โปรเจคใหม่' : 'แก้ไขโปรเจค' });
    name.focus();
  }

  if (params.projectId) renderDetail(params.projectId); else renderList();

  return { destroy() { alive = false; urls.clear(); container.replaceChildren(); } };
}
