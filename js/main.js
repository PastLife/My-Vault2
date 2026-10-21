// จุดเริ่มต้นของแอป: ตรวจว่าเบราว์เซอร์รองรับ, เปิดที่เก็บ, ต่อ session เข้ากับหน้าเว็บ, เริ่ม shell
import { createStore } from './core/store.js';
import { openIdbAdapter } from './core/storage/idb.js';
import { createSession } from './core/session.js';
import { startShell, showUnsupported } from './ui/shell.js';
// โมดูลลงทะเบียนตัวเองตอน import — ลำดับ import = ลำดับในแถบล่าง
import './modules/home/index.js';
import './modules/projects/index.js';
import './modules/money/index.js';
import './modules/vault/index.js';

const root = document.getElementById('app');

// ---------- ใช้ออฟไลน์ + อัปเดตเวอร์ชัน ----------
function registerServiceWorker() {
  // แบบไฟล์เดียว (เปิดจากเครื่อง / ลิงก์ Claude) ไม่มี sw.js ให้ลงทะเบียน
  if (globalThis.MY_VAULT_SINGLE_FILE || !('serviceWorker' in navigator)) return;
  let userAskedUpdate = false;

  // เปลี่ยนตัวควบคุมได้ 2 กรณี: ติดตั้งครั้งแรก (ไม่ต้องทำอะไร) หรือผู้ใช้แตะอัปเดต (โหลดหน้าใหม่)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userAskedUpdate) location.reload();
  });

  function offerUpdate(worker) {
    if (!worker || !navigator.serviceWorker.controller || document.querySelector('.update-bar')) return;
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'update-bar';
    bar.textContent = 'มีเวอร์ชันใหม่ แตะเพื่ออัปเดต (สมุดจะล็อกหลังอัปเดต)';
    bar.addEventListener('click', () => {
      userAskedUpdate = true;
      bar.disabled = true;
      bar.textContent = 'กำลังอัปเดต…';
      worker.postMessage('skipWaiting');
    });
    document.body.append(bar);
  }

  navigator.serviceWorker.register('sw.js').then(reg => {
    offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offerUpdate(w); });
    });
    // เช็กเวอร์ชันใหม่เมื่อกลับมาเปิดแอป
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(e => console.warn('service worker:', e));
}

registerServiceWorker();

async function main() {
  const supported = globalThis.crypto?.subtle && typeof crypto.randomUUID === 'function' && 'indexedDB' in globalThis;
  if (!supported) { showUnsupported(root); return; }

  let adapter;
  try {
    adapter = await openIdbAdapter();
  } catch (e) {
    console.error(e);
    showUnsupported(root, 'เปิดที่เก็บข้อมูลในเครื่องไม่ได้ (อาจกำลังใช้โหมดส่วนตัวของเบราว์เซอร์)');
    return;
  }

  const store = createStore(adapter);
  const session = createSession(store);

  // นับการแตะ/พิมพ์เป็นการใช้งาน
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    addEventListener(type, () => session.touch(), { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') session.hidden();
    else session.visible();
  });
  setInterval(() => session.tick(), 15000);

  await startShell({ store, session, root });
}

main().catch(e => {
  console.error(e);
  showUnsupported(root, 'แอปเริ่มทำงานไม่สำเร็จ ลองปิดแล้วเปิดใหม่');
});
