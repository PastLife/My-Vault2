// ลงทะเบียนโมดูลสมุดกับโครงหลัก
import { registerModule } from '../../ui/shell.js';
import { createVaultView } from './view.js';
import { seedSamples, importLegacyText, localToday, removeExamples } from './actions.js';

let view = null;

function openLegacyImport(ctx) {
  const { h, openModal, toast } = ctx;
  const text = h('textarea', {
    id: 'legacy-text', class: 'input mono small', rows: 8, autofocus: true,
    placeholder: '[{"cat":"doc","title":"…"}]', spellcheck: 'false',
  });
  const msg = h('p', { class: 'error', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'นำเข้า');
  const m = openModal(h('form', {
    class: 'stack',
    onsubmit: async e => {
      e.preventDefault();
      btn.disabled = true;
      try {
        const n = await importLegacyText(ctx.store, text.value);
        m.close();
        toast(`นำเข้า ${n} รายการแล้ว`);
        view?.reload();
      } catch (err) {
        msg.textContent = err.message === 'รูปแบบไม่ถูกต้อง'
          ? 'ข้อความนี้ไม่ใช่ข้อมูลสำรองจากเวอร์ชันแรก ลองคัดลอกใหม่ทั้งก้อน'
          : 'นำเข้าไม่สำเร็จ';
        btn.disabled = false;
      }
    },
  },
    h('h2', {}, 'นำเข้าจากเวอร์ชันแรก'),
    h('p', {}, 'ในสมุดเวอร์ชันแรก กด "ตั้งค่า / สำรองข้อมูล" → "คัดลอกข้อมูลสำรอง" แล้ววางข้อความทั้งหมดที่นี่'),
    h('p', { class: 'warn' }, 'กดนำเข้าครั้งเดียวพอ ถ้ากดซ้ำ รายการจะเบิ้ล'),
    h('label', { class: 'field', for: 'legacy-text' }, h('span', { class: 'label' }, 'ข้อมูลสำรองจากเวอร์ชันแรก'), text),
    msg,
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'ยกเลิก'), btn),
  ), { label: 'นำเข้าจากเวอร์ชันแรก' });
}

registerModule({
  id: 'vault',
  label: 'สมุด',
  icon: 'book',
  mount(container, ctx) { view = createVaultView(container, ctx); },
  unmount() { view?.destroy(); view = null; },
  seed(ctx) { return seedSamples(ctx.store, localToday()); },
  clearExamples(ctx) { return removeExamples(ctx.store); },
  settingsActions: [{ label: 'นำเข้าจากเวอร์ชันแรก', run: openLegacyImport }],
});
