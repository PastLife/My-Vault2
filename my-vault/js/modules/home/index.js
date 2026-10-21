// ลงทะเบียนหน้าแรก (ศูนย์ควบคุม) — อ่านอย่างเดียว ไม่มีข้อมูลของตัวเอง
import { registerModule } from '../../ui/shell.js';
import { createHomeView } from './view.js';

let view = null;

registerModule({
  id: 'home',
  label: 'หน้าแรก',
  icon: 'home',
  mount(container, ctx, params) { view = createHomeView(container, ctx, params); },
  unmount() { view?.destroy(); view = null; },
});
