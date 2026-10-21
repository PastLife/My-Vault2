// กติกาของหน้าจอที่ไม่แตะ DOM — แยกไว้เพื่อทดสอบได้
import { normalizeRecoveryCode } from '../core/crypto.js';

export const BACKUP_REMIND_DAYS = 30;
const DAY_MS = 86400000;

export function passwordCheck(password, confirm) {
  const len = [...password].length; // นับเป็นตัวอักษร ไม่ใช่ไบต์
  if (len < 6) return { error: 'รหัสต้องยาวอย่างน้อย 6 ตัว', warnings: [] };
  if (password !== confirm) return { error: 'รหัสสองช่องไม่ตรงกัน', warnings: [] };
  const warnings = [];
  if (len < 8) warnings.push('สั้นกว่า 8 ตัว เดาได้ง่ายขึ้น');
  if (/^\d+$/.test(password)) warnings.push('ตัวเลขล้วนเดาได้ง่ายกว่ารหัสที่มีตัวอักษรปน');
  return { error: null, warnings };
}

export function backupFileName(date) {
  const p = n => String(n).padStart(2, '0');
  return `my-vault-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.myvault`;
}

export function backupOverdue(lastBackupAt, now) {
  return lastBackupAt === undefined || now - lastBackupAt > BACKUP_REMIND_DAYS * DAY_MS;
}

export function formatWait(ms) {
  return `ใส่รหัสผิดหลายครั้ง รออีก ${Math.ceil(ms / 1000)} วินาที`;
}

export function recoveryTailMatches(code, input) {
  const typed = normalizeRecoveryCode(input);
  return typed.length === 4 && normalizeRecoveryCode(code).endsWith(typed);
}
