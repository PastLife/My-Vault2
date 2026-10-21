// ดูแลสถานะล็อก: ล็อกอัตโนมัติเมื่อไม่ใช้งาน/พับแอป และหน่วงเวลาเมื่อใส่รหัสผิดหลายครั้ง
// ไม่แตะ DOM — main.js เป็นคนต่อเข้ากับ event ของหน้าเว็บ
import { WrongPasswordError } from './store.js';

export function createSession(store, {
  now = Date.now,
  idleMs = 300000,
  hiddenMs = 60000,
  maxAttempts = 5,
  lockoutMs = 30000,
} = {}) {
  let lastActive = now();
  let hiddenAt = null;
  let failures = 0;
  let lockedUntil = 0;
  const listeners = new Set();

  function lockNow() {
    if (!store.isUnlocked()) return; // ล็อกอยู่แล้ว ไม่แจ้งซ้ำ
    store.lock();
    hiddenAt = null;
    for (const fn of listeners) fn();
  }

  return {
    touch() { lastActive = now(); },

    hidden() { hiddenAt = now(); },

    visible() {
      const wasHiddenFor = hiddenAt === null ? 0 : now() - hiddenAt;
      hiddenAt = null;
      if (wasHiddenFor > hiddenMs) lockNow();
      else lastActive = now();
    },

    tick() {
      if (store.isUnlocked() && now() - lastActive >= idleMs) lockNow();
    },

    lockNow,

    onLock(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async tryUnlock(secret, { recovery = false } = {}) {
      const wait = lockedUntil - now();
      if (wait > 0) return { ok: false, waitMs: wait, attemptsLeft: 0 };
      try {
        await (recovery ? store.unlockWithRecovery(secret) : store.unlock(secret));
      } catch (e) {
        if (!(e instanceof WrongPasswordError)) throw e;
        failures++;
        // ครบจำนวนแล้ว: ผิดทุกครั้งต่อจากนี้ต้องรออีก lockoutMs จนกว่าจะใส่ถูก
        if (failures >= maxAttempts) {
          lockedUntil = now() + lockoutMs;
          return { ok: false, waitMs: lockoutMs, attemptsLeft: 0 };
        }
        return { ok: false, waitMs: 0, attemptsLeft: maxAttempts - failures };
      }
      failures = 0;
      lockedUntil = 0;
      lastActive = now();
      return { ok: true };
    },
  };
}
