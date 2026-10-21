// โครงหลักของแอป: หน้าต้อนรับ/ตั้งรหัส, หน้าล็อก, หัวจอ, แถบล่างสลับโมดูล, ตั้งค่า
import { WrongPasswordError, BadBackupError, StorageFullError } from '../core/store.js';
import {
  h, clear, icon, openModal, closeAllModals, confirmModal, toast, copyText, objectUrl, revokeAllUrls,
} from './dom.js';
import { passwordCheck, backupFileName, backupOverdue, formatWait, recoveryTailMatches } from './rules.js';

const APP_VERSION = '1.0.0';
const modules = [];

// โมดูลลงทะเบียนตัวเองก่อนเรียก startShell
// { id, label, icon, mount(container, ctx), unmount(), seed?(ctx), settingsActions?: [{label, run(ctx)}] }
export function registerModule(mod) {
  modules.push(mod);
}

export function showUnsupported(root, reason = 'เบราว์เซอร์นี้ไม่รองรับการเข้ารหัสหรือการเก็บข้อมูลที่แอปต้องใช้') {
  clear(root, h('main', { class: 'screen' }, h('div', { class: 'card stack' },
    h('div', { class: 'seal', 'aria-hidden': 'true' }, '!'),
    h('h1', {}, 'เปิดสมุดไม่ได้'),
    h('p', {}, reason),
    h('p', { class: 'muted' }, 'ลองเปิดด้วย Safari หรือ Chrome รุ่นล่าสุด และไม่ใช้โหมดส่วนตัว (Private) แอปจะไม่ยอมเก็บข้อมูลแบบไม่เข้ารหัส'),
  )));
}

export async function startShell({ store, session, root }) {
  let current = null; // โมดูลที่เปิดอยู่
  let currentId = modules[0]?.id ?? null;

  const ctx = { store, session, toast, openModal, confirmModal, copyText, objectUrl, h, icon };

  session.onLock(() => {
    closeAllModals();
    unmountCurrent();
    revokeAllUrls();
    showLock();
  });

  function unmountCurrent() {
    if (current) { try { current.unmount(); } catch (e) { console.error(e); } }
    current = null;
  }

  // ---------- ช่องกรอกรหัสพร้อมปุ่มแสดง/ซ่อน ----------
  function passwordField(id, label, attrs = {}) {
    const input = h('input', { id, type: 'password', class: 'input', autocomplete: 'off', ...attrs });
    const toggle = h('button', {
      type: 'button', class: 'icon-btn', 'aria-label': 'แสดงรหัส',
      onclick: () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        clear(toggle, icon(show ? 'eyeOff' : 'eye'));
        toggle.setAttribute('aria-label', show ? 'ซ่อนรหัส' : 'แสดงรหัส');
      },
    }, icon('eye'));
    const el = h('label', { class: 'field', for: id }, h('span', { class: 'label' }, label),
      h('span', { class: 'input-row' }, input, toggle));
    return { el, input };
  }

  // ---------- 1. ต้อนรับ + ตั้งรหัส ----------
  function showWelcome() {
    const pw = passwordField('setup-pw', 'ตั้งรหัสผ่าน', { autocomplete: 'new-password', autofocus: true });
    const pw2 = passwordField('setup-pw2', 'พิมพ์รหัสผ่านอีกครั้ง', { autocomplete: 'new-password' });
    const msg = h('div', { class: 'hints', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'สร้างสมุด');

    const update = () => {
      const r = passwordCheck(pw.input.value, pw2.input.value);
      const showError = pw2.input.value.length > 0 || pw.input.value.length >= 6;
      clear(msg,
        showError && r.error ? h('p', { class: 'error' }, r.error) : null,
        r.warnings.map(w => h('p', { class: 'warn' }, w)),
      );
    };
    pw.input.addEventListener('input', update);
    pw2.input.addEventListener('input', update);

    const form = h('form', {
      class: 'card stack',
      onsubmit: async e => {
        e.preventDefault();
        const r = passwordCheck(pw.input.value, pw2.input.value);
        if (r.error) { clear(msg, h('p', { class: 'error' }, r.error)); return; }
        btn.disabled = true;
        btn.textContent = 'กำลังสร้างกุญแจ…';
        try {
          const { recoveryCode } = await store.create(pw.input.value);
          showRecoveryStep(recoveryCode);
        } catch (err) {
          console.error(err);
          btn.disabled = false;
          btn.textContent = 'สร้างสมุด';
          clear(msg, h('p', { class: 'error' }, err instanceof StorageFullError ? err.message : 'สร้างสมุดไม่สำเร็จ ลองใหม่อีกครั้ง'));
        }
      },
    },
      h('div', { class: 'seal', 'aria-hidden': 'true' }, 'MV'),
      h('h1', {}, 'สมุดข้อมูลส่วนตัว'),
      h('ul', { class: 'facts' },
        h('li', {}, 'ข้อมูลเก็บในเครื่องนี้เท่านั้น ไม่ส่งไปที่ไหน'),
        h('li', {}, 'ทุกรายการและทุกรูปถูกเข้ารหัสด้วยรหัสผ่านของคุณ'),
        h('li', {}, 'ถ้าลืมทั้งรหัสผ่านและรหัสกู้คืน จะเปิดข้อมูลไม่ได้อีกเลย'),
      ),
      pw.el, pw2.el, msg, btn,
    );
    clear(root, h('main', { class: 'screen' }, form));
  }

  // แผงแสดงรหัสกู้คืน + ให้พิมพ์ 4 ตัวท้ายยืนยัน (ใช้ทั้งตอนเริ่มและตอนสร้างใหม่ในตั้งค่า)
  function recoveryPanel(code, onConfirmed, confirmLabel) {
    const tail = h('input', {
      id: 'recovery-tail', class: 'input mono center', maxlength: 6, autocomplete: 'off',
      autocapitalize: 'characters', spellcheck: 'false', inputmode: 'text',
    });
    const btn = h('button', { class: 'btn primary block', type: 'button', disabled: true, onclick: onConfirmed }, confirmLabel);
    tail.addEventListener('input', () => { btn.disabled = !recoveryTailMatches(code, tail.value); });
    return h('div', { class: 'stack' },
      h('h2', {}, 'รหัสกู้คืนของคุณ'),
      h('p', {}, 'ใช้เปิดสมุดแทนรหัสผ่านเมื่อลืม จดเก็บไว้นอกมือถือ เช่น เขียนลงกระดาษ แอปจะแสดงรหัสนี้ครั้งเดียว'),
      h('div', { class: 'recovery-code mono', 'aria-label': 'รหัสกู้คืน' }, code.split('-').map(g => h('span', {}, g))),
      h('button', { class: 'btn', type: 'button', onclick: () => copyText(code) }, icon('copy'), 'คัดลอกรหัสกู้คืน'),
      h('label', { class: 'field', for: 'recovery-tail' },
        h('span', { class: 'label' }, 'พิมพ์ 4 ตัวสุดท้ายของรหัสกู้คืน เพื่อยืนยันว่าจดแล้ว'), tail),
      btn,
    );
  }

  function showRecoveryStep(code) {
    clear(root, h('main', { class: 'screen' }, h('div', { class: 'card' },
      recoveryPanel(code, finishSetup, 'จดแล้ว เข้าสู่สมุด'))));
  }

  async function finishSetup() {
    try { await navigator.storage?.persist?.(); } catch { /* ไม่รองรับก็ไม่เป็นไร */ }
    for (const m of modules) {
      try { await m.seed?.(ctx); } catch (e) { console.error(e); }
    }
    session.touch();
    showApp();
  }

  // ---------- 2. หน้าล็อก ----------
  function showLock() {
    let recovery = false;
    let timer = 0;
    const pw = passwordField('unlock-pw', 'รหัสผ่าน', { autocomplete: 'current-password', autofocus: true });
    const msg = h('p', { class: 'error', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'ปลดล็อก');
    const modeLink = h('button', { class: 'link', type: 'button', onclick: () => setMode(!recovery) });
    const title = h('h1', {});

    function setMode(r) {
      recovery = r;
      title.textContent = r ? 'ใช้รหัสกู้คืน' : 'สมุดถูกล็อกอยู่';
      pw.el.querySelector('.label').textContent = r ? 'รหัสกู้คืน (20 ตัว)' : 'รหัสผ่าน';
      pw.input.value = '';
      pw.input.classList.toggle('mono', r);
      pw.input.autocapitalize = r ? 'characters' : 'off';
      modeLink.textContent = r ? 'กลับไปใช้รหัสผ่าน' : 'ลืมรหัสผ่าน? ใช้รหัสกู้คืน';
      msg.textContent = '';
      pw.input.focus();
    }

    function countdown(until) {
      clearInterval(timer);
      btn.disabled = true;
      const step = () => {
        const left = until - Date.now();
        if (left <= 0) { clearInterval(timer); btn.disabled = false; msg.textContent = ''; return; }
        msg.textContent = formatWait(left);
      };
      step();
      timer = setInterval(step, 250);
    }

    const form = h('form', {
      class: 'card stack',
      onsubmit: async e => {
        e.preventDefault();
        if (!pw.input.value) return;
        btn.disabled = true;
        btn.textContent = 'กำลังตรวจ…';
        const r = await session.tryUnlock(pw.input.value, { recovery });
        btn.textContent = 'ปลดล็อก';
        if (r.ok) {
          clearInterval(timer);
          if (recovery) setTimeout(() => toast('เปิดด้วยรหัสกู้คืนแล้ว แนะนำให้ตั้งรหัสผ่านใหม่ในหน้าตั้งค่า'), 300);
          showApp();
          return;
        }
        pw.input.select();
        if (r.waitMs > 0) countdown(Date.now() + r.waitMs);
        else {
          btn.disabled = false;
          msg.textContent = `${recovery ? 'รหัสกู้คืน' : 'รหัสผ่าน'}ไม่ถูกต้อง (ลองได้อีก ${r.attemptsLeft} ครั้ง ก่อนต้องรอ)`;
        }
      },
    },
      h('div', { class: 'seal', 'aria-hidden': 'true' }, icon('lock')),
      title, pw.el, msg, btn, modeLink,
      h('button', { class: 'link danger', type: 'button', onclick: () => wipeDialog() }, 'ลืมทั้งสองอย่าง? เริ่มสมุดใหม่'),
    );
    setMode(false);
    clear(root, h('main', { class: 'screen' }, form));
    pw.input.focus();
  }

  // ---------- 3. ตัวแอป ----------
  let backupBar = null;
  let moduleTitle = null;
  let container = null;

  async function refreshBackupBar() {
    if (!backupBar || !store.isUnlocked()) return;
    const last = await store.getSetting('lastBackupAt');
    if (!backupOverdue(last, Date.now())) { backupBar.hidden = true; return; }
    clear(backupBar,
      h('span', {}, last === undefined ? 'ยังไม่เคยสำรองข้อมูล' : 'ไม่ได้สำรองข้อมูลมาเกิน 30 วัน'),
      h('button', { class: 'btn small', type: 'button', onclick: exportBackup }, 'สำรองตอนนี้'),
    );
    backupBar.hidden = false;
  }

  function mountModule(id) {
    unmountCurrent();
    revokeAllUrls();
    currentId = id;
    const mod = modules.find(m => m.id === id);
    for (const tab of root.querySelectorAll('.tabbar button')) {
      if (tab.dataset.id === id) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    if (!mod) {
      clear(container, h('p', { class: 'empty' }, 'ยังไม่มีโมดูลให้ใช้งาน'));
      return;
    }
    moduleTitle.textContent = mod.label;
    clear(container);
    current = mod;
    mod.mount(container, ctx);
  }

  function showApp() {
    backupBar = h('div', { class: 'backup-bar', hidden: true, role: 'status' });
    moduleTitle = h('h1', { class: 'module-title' });
    container = h('main', { class: 'module', id: 'module' });
    const header = h('header', { class: 'appbar' },
      h('div', { class: 'appbar-inner' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-name' }, 'My Vault'), moduleTitle),
        h('button', { class: 'icon-btn labelled', type: 'button', onclick: openSettings, 'aria-label': 'ตั้งค่า' }, icon('gear'), h('span', {}, 'ตั้งค่า')),
        h('button', { class: 'icon-btn labelled', type: 'button', onclick: () => session.lockNow(), 'aria-label': 'ล็อก' }, icon('lock'), h('span', {}, 'ล็อก')),
      ),
      backupBar,
    );
    const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'โมดูล' },
      h('div', { class: 'tabbar-inner' },
        modules.map(m => h('button', { type: 'button', 'data-id': m.id, onclick: () => mountModule(m.id) },
          icon(m.icon), h('span', {}, m.label))),
      ),
    );
    clear(root, header, container, tabbar);
    mountModule(currentId ?? modules[0]?.id);
    refreshBackupBar();
  }

  // ---------- 4. สำรอง / กู้คืน ----------
  async function exportBackup() {
    try {
      const text = await store.exportBackup();
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = h('a', { href: url, download: backupFileName(new Date()), class: 'offscreen' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('ส่งออกไฟล์สำรองแล้ว เก็บไฟล์ไว้นอกมือถือด้วยนะ');
      refreshBackupBar();
    } catch (e) {
      console.error(e);
      toast('ส่งออกไฟล์สำรองไม่สำเร็จ');
    }
  }

  // ---------- 5. ตั้งค่า ----------
  function openSettings() {
    let modal;
    const lastLine = h('p', { class: 'muted' });
    store.getSetting('lastBackupAt').then(t => {
      lastLine.textContent = t === undefined
        ? 'ยังไม่เคยสำรองข้อมูล'
        : `สำรองล่าสุด ${new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`;
    });

    // เปลี่ยนรหัสผ่าน
    const cur = passwordField('set-cur', 'รหัสผ่านปัจจุบัน', { autocomplete: 'current-password' });
    const np = passwordField('set-new', 'รหัสผ่านใหม่', { autocomplete: 'new-password' });
    const np2 = passwordField('set-new2', 'พิมพ์รหัสผ่านใหม่อีกครั้ง', { autocomplete: 'new-password' });
    const pwMsg = h('div', { class: 'hints', 'aria-live': 'polite' });
    const pwForm = h('form', {
      class: 'stack',
      onsubmit: async e => {
        e.preventDefault();
        const check = passwordCheck(np.input.value, np2.input.value);
        if (check.error) { clear(pwMsg, h('p', { class: 'error' }, check.error)); return; }
        if (!(await verifyCurrent(cur.input.value, pwMsg))) return;
        await store.changePassword(np.input.value);
        for (const f of [cur, np, np2]) f.input.value = '';
        clear(pwMsg, h('p', { class: 'ok' }, 'เปลี่ยนรหัสผ่านแล้ว'),
          h('p', { class: 'muted' }, 'ไฟล์สำรองที่ส่งออกก่อนหน้านี้ ยังเปิดด้วยรหัสผ่านเดิม'));
      },
    }, cur.el, np.el, np2.el, pwMsg, h('button', { class: 'btn primary', type: 'submit' }, 'เปลี่ยนรหัสผ่าน'));

    // สร้างรหัสกู้คืนใหม่
    const recCur = passwordField('set-rec-cur', 'รหัสผ่านปัจจุบัน', { autocomplete: 'current-password' });
    const recMsg = h('div', { class: 'hints', 'aria-live': 'polite' });
    const recBox = h('div', { class: 'stack' });
    const recForm = h('form', {
      class: 'stack',
      onsubmit: async e => {
        e.preventDefault();
        if (!(await verifyCurrent(recCur.input.value, recMsg))) return;
        const code = await store.regenerateRecovery();
        recCur.input.value = '';
        clear(recMsg, h('p', { class: 'warn' }, 'รหัสกู้คืนเดิมใช้ไม่ได้แล้ว'));
        clear(recBox, recoveryPanel(code, () => { clear(recBox); clear(recMsg, h('p', { class: 'ok' }, 'บันทึกรหัสกู้คืนใหม่แล้ว')); }, 'จดแล้ว'));
      },
    }, h('p', { class: 'muted' }, 'ใช้เมื่อทำรหัสกู้คืนหาย รหัสเดิมจะใช้ไม่ได้ทันที'),
    recCur.el, recMsg, h('button', { class: 'btn', type: 'submit' }, 'สร้างรหัสกู้คืนใหม่'), recBox);

    // นำเข้าไฟล์สำรอง
    const file = h('input', { id: 'import-file', type: 'file', accept: '.myvault,.json,application/json', class: 'input' });
    const impPw = passwordField('import-pw', 'รหัสผ่านของไฟล์สำรอง (รหัส ณ ตอนที่ส่งออก)', { autocomplete: 'off' });
    const impMsg = h('div', { class: 'hints', 'aria-live': 'polite' });
    const impForm = h('form', {
      class: 'stack',
      onsubmit: async e => {
        e.preventDefault();
        const f = file.files?.[0];
        if (!f) { clear(impMsg, h('p', { class: 'error' }, 'เลือกไฟล์สำรองก่อน')); return; }
        clear(impMsg, h('p', { class: 'muted' }, 'กำลังนำเข้า…'));
        try {
          const r = await store.importBackup(await f.text(), impPw.input.value);
          impPw.input.value = '';
          clear(impMsg, h('p', { class: 'ok' }, `นำเข้าแล้ว: เพิ่ม ${r.added} · อัปเดต ${r.updated} · ข้าม ${r.skipped} รายการ`));
          mountModule(currentId);
        } catch (err) {
          const text = err instanceof WrongPasswordError ? 'รหัสผ่านของไฟล์สำรองไม่ถูกต้อง'
            : err instanceof BadBackupError || err instanceof StorageFullError ? err.message
              : 'นำเข้าไม่สำเร็จ';
          if (!(err instanceof WrongPasswordError || err instanceof BadBackupError)) console.error(err);
          clear(impMsg, h('p', { class: 'error' }, text));
        }
      },
    }, h('label', { class: 'field', for: 'import-file' }, h('span', { class: 'label' }, 'ไฟล์สำรอง (.myvault)'), file),
    impPw.el, impMsg, h('button', { class: 'btn', type: 'submit' }, 'นำเข้า'));

    const moduleActions = modules.flatMap(m => (m.settingsActions ?? []).map(a =>
      h('button', { class: 'btn', type: 'button', onclick: () => { modal.close(); a.run(ctx); } }, a.label)));

    const content = h('div', { class: 'settings' },
      h('div', { class: 'sheet-head' },
        h('h2', {}, 'ตั้งค่า'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ปิด', onclick: () => modal.close() }, icon('close')),
      ),
      h('section', { class: 'stack' }, h('h3', {}, 'สำรองข้อมูล'), lastLine,
        h('p', { class: 'muted' }, 'ไฟล์สำรองยังเข้ารหัสอยู่ เปิดได้ด้วยรหัสผ่านปัจจุบันเท่านั้น'),
        h('button', { class: 'btn primary', type: 'button', onclick: exportBackup }, 'ส่งออกไฟล์สำรอง')),
      h('section', { class: 'stack' }, h('h3', {}, 'กู้คืนจากไฟล์สำรอง'), impForm),
      h('section', { class: 'stack' }, h('h3', {}, 'เปลี่ยนรหัสผ่าน'), pwForm),
      h('section', { class: 'stack' }, h('h3', {}, 'รหัสกู้คืน'), recForm),
      moduleActions.length ? h('section', { class: 'stack' }, h('h3', {}, 'อื่นๆ'), moduleActions) : null,
      h('section', { class: 'stack danger-zone' }, h('h3', {}, 'ลบสมุด'),
        h('p', { class: 'muted' }, 'ลบข้อมูลและรูปทั้งหมดในเครื่องนี้ ย้อนกลับไม่ได้'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => wipeDialog() }, 'ลบสมุดทั้งหมด')),
      h('p', { class: 'muted center small' }, `My Vault ${APP_VERSION}`),
    );
    modal = openModal(content, { label: 'ตั้งค่า', onClose: refreshBackupBar });
  }

  // ตรวจรหัสปัจจุบันผ่าน session (นับครั้งผิดร่วมกับหน้าล็อก)
  async function verifyCurrent(password, msgEl) {
    if (!password) { clear(msgEl, h('p', { class: 'error' }, 'ใส่รหัสผ่านปัจจุบันก่อน')); return false; }
    const r = await session.tryUnlock(password);
    if (r.ok) return true;
    clear(msgEl, h('p', { class: 'error' }, r.waitMs > 0 ? formatWait(r.waitMs) : 'รหัสผ่านปัจจุบันไม่ถูกต้อง'));
    return false;
  }

  function wipeDialog() {
    const word = 'ลบทั้งหมด';
    const input = h('input', { id: 'wipe-confirm', class: 'input', autocomplete: 'off', autofocus: true });
    const btn = h('button', { class: 'btn danger', type: 'submit', disabled: true }, 'ลบสมุดทั้งหมด');
    input.addEventListener('input', () => { btn.disabled = input.value.trim() !== word; });
    const m = openModal(h('form', {
      class: 'stack',
      onsubmit: async e => {
        e.preventDefault();
        if (input.value.trim() !== word) return;
        closeAllModals();
        unmountCurrent();
        revokeAllUrls();
        await store.wipe();
        showWelcome();
        toast('ลบสมุดแล้ว');
      },
    },
      h('h2', {}, 'ลบสมุดทั้งหมด?'),
      h('p', {}, 'ข้อมูลและรูปทั้งหมดในเครื่องนี้จะหายถาวร ถ้ามีไฟล์สำรองไว้ จะนำเข้ากลับได้หลังสร้างสมุดใหม่'),
      h('label', { class: 'field', for: 'wipe-confirm' }, h('span', { class: 'label' }, `พิมพ์คำว่า "${word}" เพื่อยืนยัน`), input),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'ยกเลิก'), btn),
    ), { label: 'ลบสมุด' });
  }

  // ---------- เริ่ม ----------
  if (await store.hasVault()) showLock();
  else showWelcome();
}
