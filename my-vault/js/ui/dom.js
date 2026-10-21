// เครื่องมือสร้างหน้าจอ — ข้อความผู้ใช้ใส่เป็น textNode เสมอ ไม่ผ่าน innerHTML

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

// ไอคอน (SVG คงที่ ไม่มีข้อมูลผู้ใช้ปน)
const ICONS = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h2M2 10h20M6 6V4h12v2"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.9 17.9A10.8 10.8 0 0 1 12 19c-7 0-11-7-11-7a19.7 19.7 0 0 1 5.1-5.9M9.9 5.2A10 10 0 0 1 12 5c7 0 11 7 11 7a19.8 19.8 0 0 1-2.2 3.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
};

export function icon(name) {
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
  return wrap;
}

// ---------- object URL ของรูป: จดไว้ทั้งหมด เพื่อยกเลิกทิ้งตอนล็อก ----------
const urls = new Set();
export function objectUrl(blob) {
  const u = URL.createObjectURL(blob);
  urls.add(u);
  return u;
}
export function revokeAllUrls() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}

// ---------- modal ----------
const modals = [];

export function openModal(content, { onClose, label = 'หน้าต่าง' } = {}) {
  const previousFocus = document.activeElement;
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, content);
  const overlay = h('div', { class: 'overlay' }, sheet);
  const entry = { overlay, closed: false, close };
  function close() {
    if (entry.closed) return;
    entry.closed = true;
    overlay.remove();
    modals.splice(modals.indexOf(entry), 1);
    onClose?.();
    if (previousFocus?.isConnected) previousFocus.focus?.();
  }
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
  modals.push(entry);
  document.body.append(overlay);
  (sheet.querySelector('[autofocus]') ?? sheet.querySelector('input, button, textarea, select'))?.focus();
  return { close, sheet };
}

export function closeAllModals() {
  for (const m of [...modals].reverse()) m.close();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modals.length) modals[modals.length - 1].close();
});

export function confirmModal(message, okLabel = 'ยืนยัน', { danger = true } = {}) {
  return new Promise(resolve => {
    let answered = false;
    const done = v => { answered = true; m.close(); resolve(v); };
    const m = openModal(h('div', { class: 'stack' },
      h('p', { class: 'confirm-text' }, message),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'ยกเลิก'),
        h('button', { class: danger ? 'btn danger' : 'btn primary', type: 'button', onclick: () => done(true) }, okLabel),
      ),
    ), { label: 'ยืนยัน', onClose: () => { if (!answered) resolve(false); } });
  });
}

// ---------- toast ----------
let toastEl = null;
let toastTimer = 0;
export function toast(message) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
}

// ---------- คัดลอก ----------
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { class: 'offscreen', readonly: true, value: text });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ไม่รองรับ */ }
    ta.remove();
    if (!ok) { toast('คัดลอกไม่ได้ ลองกดค้างที่ข้อความแทน'); return false; }
  }
  toast('คัดลอกแล้ว');
  return true;
}
