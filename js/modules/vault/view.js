// หน้าจอสมุด: รายการ, ค้นหา, หมวด, เตือนหมดอายุ, ฟอร์มแก้ไข, แนบรูป, ดูรูปเต็มจอ
import { StorageFullError } from '../../core/store.js';
import { prepareImage, ImageDecodeError } from '../../core/images.js';
import {
  CATEGORIES, MAX_IMAGES, categoryOf, emptyEntry, expiryDays, expiryAlerts, matches, EXPIRY_WARN_DAYS,
} from './model.js';
import { saveEntry, removeExamples, localToday, TooManyImagesError } from './actions.js';
import { emptyArt } from '../../ui/art.js';

const TYPE_LABELS = { text: 'ข้อความ', date: 'วันที่', secret: 'ลับ' };
const EXPIRY_LABEL = /หมดอายุ|ครบกำหนด/;

function fmtDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return iso;
  return new Date(`${iso}T00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function expiryText(days) {
  if (days < 0) return `หมดอายุแล้ว ${-days} วัน`;
  if (days === 0) return 'หมดอายุวันนี้';
  return `หมดอายุในอีก ${days} วัน`;
}

function errorText(e) {
  if (e instanceof StorageFullError || e instanceof ImageDecodeError || e instanceof TooManyImagesError) return e.message;
  console.error(e);
  return 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
}

export function createVaultView(container, ctx) {
  const { store, h, icon, toast, openModal, confirmModal, copyText, objectUrl } = ctx;
  let entries = []; // [{id, updatedAt, data} | {id, corrupt:true}]
  let cat = 'all';
  let query = '';
  const shown = new Set(); // ช่องลับที่กดดูอยู่ "id:index"
  const thumbCache = new Map(); // blobId -> objectURL
  let alive = true;

  async function imageUrl(blobId) {
    if (!thumbCache.has(blobId)) thumbCache.set(blobId, store.getImage(blobId).then(objectUrl));
    return thumbCache.get(blobId);
  }

  // ---------- โครงหน้า ----------
  const searchInput = h('input', {
    id: 'vault-search', type: 'search', class: 'input', placeholder: 'ค้นหา เช่น รหัสผ่าน, ธนาคาร, เบอร์', 'aria-label': 'ค้นหา',
    oninput: () => { query = searchInput.value; renderList(); },
  });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'หมวด' });
  const alertsBox = h('div', { class: 'alerts' });
  const exampleBar = h('div', { class: 'example-bar', hidden: true });
  const listBox = h('div', { class: 'entries' });

  container.append(
    h('div', { class: 'vault-tools' },
      h('label', { class: 'search' }, icon('search'), searchInput),
      h('button', { class: 'btn primary', type: 'button', onclick: () => openEditor(null) }, icon('plus'), 'เพิ่มข้อมูล'),
    ),
    chips, alertsBox, exampleBar, listBox,
  );

  async function reload() {
    entries = await store.list('vault');
    if (alive) render();
  }

  function render() {
    renderChips();
    renderAlerts();
    renderExampleBar();
    renderList();
  }

  function renderChips() {
    const count = id => entries.filter(e => !e.corrupt && (id === 'all' || e.data.cat === id)).length;
    const items = [{ id: 'all', name: 'ทั้งหมด' }, ...CATEGORIES];
    chips.replaceChildren(...items.map(c => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(cat === c.id),
      onclick: () => { cat = c.id; renderChips(); renderList(); },
    }, c.name, h('span', { class: 'chip-count' }, count(c.id)))));
  }

  function renderAlerts() {
    const alerts = expiryAlerts(entries, localToday());
    alertsBox.replaceChildren(...alerts.map(a => h('button', {
      type: 'button', class: `alert ${a.days < 0 ? 'gone' : 'soon'}`,
      onclick: () => openEditor(entries.find(e => e.id === a.id)),
    }, h('strong', {}, a.title), ` ${expiryText(a.days)}`)));
  }

  function renderExampleBar() {
    const has = entries.some(e => e.data?.example);
    exampleBar.hidden = !has;
    if (!has) return;
    exampleBar.replaceChildren(
      h('span', {}, 'ตอนนี้มีข้อมูลตัวอย่างอยู่ ลองกดดูได้เลย'),
      h('button', {
        class: 'btn small', type: 'button',
        onclick: async () => {
          if (!(await confirmModal('ลบข้อมูลตัวอย่างทั้งหมด? ข้อมูลที่คุณเพิ่มเองจะยังอยู่', 'ลบตัวอย่าง'))) return;
          const n = await removeExamples(store);
          toast(`ลบตัวอย่าง ${n} รายการแล้ว`);
          reload();
        },
      }, 'ลบตัวอย่างทั้งหมด'),
    );
  }

  function renderList() {
    const visible = entries
      .filter(e => e.corrupt || ((cat === 'all' || e.data.cat === cat) && matches(e.data, query)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (!visible.length) {
      listBox.replaceChildren(h('div', { class: 'empty' },
        emptyArt('vault'),
        query.trim() ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีข้อมูลในหมวดนี้',
        query.trim() ? null : h('button', { class: 'btn', type: 'button', onclick: () => openEditor(null) }, icon('plus'), 'เพิ่มข้อมูลแรก'),
      ));
      return;
    }
    listBox.replaceChildren(...visible.map(e => (e.corrupt ? corruptCard(e) : card(e))));
  }

  function corruptCard(e) {
    return h('article', { class: 'entry corrupt' },
      h('h3', {}, 'รายการนี้เสียหาย'),
      h('p', { class: 'muted' }, 'อ่านข้อมูลรายการนี้ไม่ได้ อาจเกิดจากไฟล์ในเครื่องเสีย ถ้ามีไฟล์สำรอง ลองนำเข้าใหม่'),
      h('div', { class: 'actions' }, h('button', {
        class: 'btn danger small', type: 'button',
        onclick: async () => {
          if (!(await confirmModal('ลบรายการที่เสียหายนี้?', 'ลบ'))) return;
          await store.remove(e.id);
          reload();
        },
      }, 'ลบรายการนี้')),
    );
  }

  function card(e) {
    const d = e.data;
    const c = categoryOf(d.cat);
    const thumbs = d.images?.length ? h('div', { class: 'thumbs' }, d.images.map((im, i) => {
      const img = h('img', { alt: `รูปที่ ${i + 1}`, width: 64, height: 64 });
      imageUrl(im.thumbId).then(u => { img.src = u; }).catch(() => img.classList.add('broken'));
      return h('button', { type: 'button', class: 'thumb', 'aria-label': `ดูรูปที่ ${i + 1}`, onclick: () => openViewer(d.images, i) }, img);
    })) : null;

    // การ์ดแสดงเฉพาะช่องที่กรอกแล้ว (ช่องว่างยังอยู่ในฟอร์มแก้ไข ให้กรอกทีหลังได้)
    const rows = d.fields.map((f, i) => [f, i]).filter(([f]) => f.v).map(([f, i]) => {
      const key = `${e.id}:${i}`;
      const hidden = f.t === 'secret' && !shown.has(key);
      let value = hidden ? '••••••••' : (f.t === 'date' ? fmtDate(f.v) : f.v);
      let badge = null;
      if (f.t === 'date' && EXPIRY_LABEL.test(f.k) && f.v) {
        const days = expiryDays({ fields: [f] }, localToday());
        if (days !== null && days < 0) badge = h('span', { class: 'badge gone' }, 'หมดแล้ว');
        else if (days !== null && days <= EXPIRY_WARN_DAYS) badge = h('span', { class: 'badge soon' }, `อีก ${days} วัน`);
      }
      return h('div', { class: 'row' },
        h('dt', {}, f.k),
        h('dd', { class: f.t === 'secret' ? 'secret' : '' }, value || '—', badge),
        h('span', { class: 'row-actions' },
          f.t === 'secret' && f.v ? h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': hidden ? `แสดง${f.k}` : `ซ่อน${f.k}`,
            onclick: () => { if (shown.has(key)) shown.delete(key); else shown.add(key); renderList(); },
          }, icon(hidden ? 'eye' : 'eyeOff')) : null,
          f.v ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': `คัดลอก${f.k}`, onclick: () => copyText(f.v) }, icon('copy')) : null,
        ),
      );
    });

    return h('article', { class: 'entry' },
      h('div', { class: 'entry-head' },
        h('h3', {}, d.title || '(ไม่มีชื่อ)'),
        d.example ? h('span', { class: 'tag ex' }, 'ตัวอย่าง') : null,
        h('span', { class: 'tag', title: c.name }, c.code),
      ),
      thumbs,
      rows.length ? h('dl', { class: 'rows' }, rows) : null,
      d.note ? h('p', { class: 'note' }, d.note) : null,
      h('div', { class: 'entry-foot' },
        h('span', {}, `แก้ไขล่าสุด ${new Date(e.updatedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`),
        h('button', { class: 'btn small', type: 'button', onclick: () => openEditor(e) }, 'แก้ไข'),
      ),
    );
  }

  // ---------- ดูรูปเต็มจอ ----------
  function openViewer(images, start) {
    let i = start;
    const img = h('img', { class: 'viewer-img', alt: '' });
    const counter = h('span', { class: 'viewer-count' });
    const show = async () => {
      counter.textContent = `${i + 1} / ${images.length}`;
      img.alt = `รูปที่ ${i + 1} จาก ${images.length}`;
      img.removeAttribute('src');
      try { img.src = await imageUrl(images[i].fullId); } catch { toast('เปิดรูปนี้ไม่ได้'); }
    };
    const go = step => { i = (i + step + images.length) % images.length; show(); };
    const many = images.length > 1;
    let startX = null;
    const stage = h('div', {
      class: 'viewer-stage',
      onpointerdown: ev => { startX = ev.clientX; },
      onpointerup: ev => {
        if (startX === null || !many) return;
        const dx = ev.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      },
    }, img);
    const m = openModal(h('div', { class: 'viewer' },
      h('div', { class: 'viewer-bar' }, counter,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ปิด', onclick: () => m.close() }, icon('close'))),
      stage,
      many ? h('div', { class: 'viewer-nav' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'รูปก่อนหน้า', onclick: () => go(-1) }, icon('chevronLeft')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'รูปถัดไป', onclick: () => go(1) }, icon('chevronRight')),
      ) : null,
    ), { label: 'ดูรูป' });
    m.sheet.classList.add('sheet-viewer');
    m.sheet.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowLeft') go(-1);
      if (ev.key === 'ArrowRight') go(1);
    });
    show();
  }

  // ---------- ฟอร์มเพิ่ม/แก้ไข ----------
  function openEditor(existing) {
    if (existing?.corrupt) return;
    const isNew = !existing;
    const draft = isNew
      ? emptyEntry(cat === 'all' ? 'me' : cat)
      : structuredClone(existing.data);
    const kept = [...(draft.images ?? [])];      // รูปเดิมที่ยังเก็บไว้
    const removed = [];                           // รูปเดิมที่เอาออก
    const fresh = [];                             // รูปใหม่ที่ย่อแล้ว (ยังไม่บันทึก)
    let busy = false;

    const catSelect = h('select', { id: 'ed-cat', class: 'input' },
      CATEGORIES.map(c => h('option', { value: c.id, selected: c.id === draft.cat }, c.name)));
    const titleInput = h('input', { id: 'ed-title', class: 'input', value: draft.title, placeholder: 'เช่น หนังสือเดินทาง, บัญชีกสิกร', autocomplete: 'off' });
    const noteInput = h('textarea', { id: 'ed-note', class: 'input', rows: 3 });
    noteInput.value = draft.note ?? '';
    const fieldsBox = h('div', { class: 'field-rows' });
    const imgStrip = h('div', { class: 'img-strip' });
    const imgMsg = h('p', { class: 'error', 'aria-live': 'polite' });
    const formMsg = h('p', { class: 'error', 'aria-live': 'polite' });
    const fileInput = h('input', { id: 'ed-images', type: 'file', accept: 'image/*', multiple: true, class: 'offscreen', tabindex: '-1' });
    let rows = [];

    function fieldRow(f) {
      const n = rows.length;
      const k = h('input', { id: `ed-k-${n}`, class: 'input', value: f.k, placeholder: 'หัวข้อ', 'aria-label': 'หัวข้อช่อง', autocomplete: 'off' });
      const v = h('input', { id: `ed-v-${n}`, class: 'input', value: f.v, placeholder: 'ข้อมูล', 'aria-label': 'ข้อมูล', autocomplete: 'off', type: f.t === 'date' ? 'date' : 'text' });
      const t = h('select', { id: `ed-t-${n}`, class: 'input', 'aria-label': 'ชนิดช่อง' },
        Object.entries(TYPE_LABELS).map(([val, label]) => h('option', { value: val, selected: val === f.t }, label)));
      const row = { k, v, t, el: null };
      t.addEventListener('change', () => {
        const wasDate = v.type === 'date';
        v.type = t.value === 'date' ? 'date' : 'text';
        if (wasDate !== (v.type === 'date')) v.value = '';
      });
      row.el = h('div', { class: 'field-row' }, k, v, t,
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': 'ลบช่องนี้',
          onclick: () => { row.el.remove(); rows = rows.filter(r => r !== row); },
        }, icon('close')));
      rows.push(row);
      return row.el;
    }

    function renderFields(fields) {
      rows = [];
      fieldsBox.replaceChildren(...fields.map(fieldRow));
    }

    function readFields() {
      return rows.map(r => ({ k: r.k.value.trim(), v: r.v.value.trim(), t: r.t.value }))
        .filter(f => f.k || f.v);
    }

    function renderImages() {
      const total = kept.length + fresh.length;
      const tiles = [
        ...kept.map((im, i) => {
          const img = h('img', { alt: `รูปที่ ${i + 1}` });
          imageUrl(im.thumbId).then(u => { img.src = u; }).catch(() => {});
          return h('div', { class: 'img-tile' }, img, h('button', {
            type: 'button', class: 'img-remove', 'aria-label': `เอารูปที่ ${i + 1} ออก`,
            onclick: () => { removed.push(...kept.splice(i, 1)); renderImages(); },
          }, icon('close')));
        }),
        ...fresh.map((im, i) => h('div', { class: 'img-tile new' },
          h('img', { alt: 'รูปใหม่', src: im.url }),
          h('button', {
            type: 'button', class: 'img-remove', 'aria-label': 'เอารูปใหม่ออก',
            onclick: () => { fresh.splice(i, 1); renderImages(); },
          }, icon('close')))),
      ];
      if (total < MAX_IMAGES) {
        tiles.push(h('button', {
          type: 'button', class: 'img-add', onclick: () => fileInput.click(), disabled: busy,
        }, icon('image'), busy ? 'กำลังเตรียม…' : 'แนบรูป'));
      }
      imgStrip.replaceChildren(...tiles, h('span', { class: 'muted small img-count' }, `${total}/${MAX_IMAGES} รูป`));
    }

    fileInput.addEventListener('change', async () => {
      const files = [...fileInput.files];
      fileInput.value = '';
      imgMsg.textContent = '';
      const room = MAX_IMAGES - kept.length - fresh.length;
      if (files.length > room) imgMsg.textContent = `แนบได้อีก ${room} รูป (สูงสุด ${MAX_IMAGES} รูปต่อรายการ)`;
      busy = true;
      renderImages();
      for (const file of files.slice(0, room)) {
        try {
          const p = await prepareImage(file);
          fresh.push({ ...p, url: objectUrl(new Blob([p.thumb], { type: 'image/jpeg' })) });
        } catch (e) {
          imgMsg.textContent = e instanceof ImageDecodeError ? e.message : 'เตรียมรูปไม่สำเร็จ';
          if (!(e instanceof ImageDecodeError)) console.error(e);
        }
        renderImages();
      }
      busy = false;
      renderImages();
    });

    catSelect.addEventListener('change', () => {
      // รายการใหม่ที่ยังไม่ได้กรอกอะไร: เปลี่ยนช่องตาม template ของหมวดใหม่
      if (isNew && !readFields().some(f => f.v)) renderFields(emptyEntry(catSelect.value).fields);
    });

    renderFields(draft.fields.length ? draft.fields : []);
    renderImages();

    const saveBtn = h('button', { class: 'btn primary', type: 'submit' }, 'บันทึก');
    const form = h('form', {
      class: 'editor stack',
      onsubmit: async e => {
        e.preventDefault();
        if (busy) { formMsg.textContent = 'รอให้รูปเตรียมเสร็จก่อน'; return; }
        const title = titleInput.value.trim();
        if (!title) { formMsg.textContent = 'ใส่ชื่อรายการก่อน'; titleInput.focus(); return; }
        saveBtn.disabled = true;
        saveBtn.textContent = 'กำลังบันทึก…';
        try {
          await saveEntry(store, {
            id: existing?.id,
            data: { ...draft, cat: catSelect.value, title, note: noteInput.value.trim(), fields: readFields(), images: kept },
            newImages: fresh,
            removed,
          });
          for (const r of removed) { thumbCache.delete(r.thumbId); thumbCache.delete(r.fullId); }
          modal.close();
          toast('บันทึกแล้ว');
          reload();
        } catch (err) {
          formMsg.textContent = errorText(err);
          saveBtn.disabled = false;
          saveBtn.textContent = 'บันทึก';
        }
      },
    },
      h('div', { class: 'sheet-head' },
        h('h2', {}, isNew ? 'เพิ่มข้อมูล' : 'แก้ไขข้อมูล'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ปิด', onclick: () => modal.close() }, icon('close'))),
      h('label', { class: 'field', for: 'ed-cat' }, h('span', { class: 'label' }, 'หมวด'), catSelect),
      h('label', { class: 'field', for: 'ed-title' }, h('span', { class: 'label' }, 'ชื่อรายการ'), titleInput),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'ช่องข้อมูล (เลือก "ลับ" เพื่อซ่อนไว้จนกว่าจะกดดู)'),
        fieldsBox,
        h('button', { class: 'btn small', type: 'button', onclick: () => fieldsBox.append(fieldRow({ k: '', v: '', t: 'text' })) }, icon('plus'), 'เพิ่มช่อง')),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'รูป (เช่น หน้าบัตร หลังบัตร)'), imgStrip, imgMsg, fileInput),
      h('label', { class: 'field', for: 'ed-note' }, h('span', { class: 'label' }, 'โน้ตเพิ่มเติม'), noteInput),
      formMsg,
      h('div', { class: 'actions' },
        isNew ? null : h('button', {
          class: 'btn danger', type: 'button', style: 'margin-right:auto',
          onclick: async () => {
            if (!(await confirmModal(`ลบ "${draft.title || 'รายการนี้'}" และรูปทั้งหมดของรายการนี้?`, 'ลบ'))) return;
            await store.remove(existing.id);
            modal.close();
            toast('ลบแล้ว');
            reload();
          },
        }, 'ลบรายการ'),
        h('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'ยกเลิก'),
        saveBtn,
      ),
    );
    const modal = openModal(form, { label: isNew ? 'เพิ่มข้อมูล' : 'แก้ไขข้อมูล' });
    titleInput.focus();
  }

  reload();

  return {
    reload,
    destroy() { alive = false; thumbCache.clear(); container.replaceChildren(); },
  };
}
