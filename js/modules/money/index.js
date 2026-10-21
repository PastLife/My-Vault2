// ลงทะเบียนโมดูลเงิน + งาน 'add-money' ของปุ่ม + กลางแถบล่าง
import { registerModule, registerAction } from '../../ui/shell.js';
import { createMoneyView } from './view.js';
import { openMoneySheet } from './sheet.js';
import { seedMoney, clearMoneyExamples, runRepeats } from './actions.js';

let view = null;
const pad = n => String(n).padStart(2, '0');
const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

registerModule({
  id: 'money',
  label: 'เงิน',
  icon: 'baht',
  mount(container, ctx, params) { view = createMoneyView(container, ctx, params); },
  unmount() { view?.destroy(); view = null; },
  // ผูกตัวอย่างกับโปรเจคตัวอย่างที่ "กำลังทำ" (โมดูลโปรเจค seed ก่อนแล้ว)
  async seed(ctx) {
    const examples = (await ctx.store.list('projects')).filter(p => p.data?.example);
    const first = examples.find(p => p.data.status === 'active') ?? examples[0];
    return seedMoney(ctx.store, first ? [first.id] : [], todayISO());
  },
  clearExamples(ctx) { return clearMoneyExamples(ctx.store); },
  // ทุกครั้งที่เปิดสมุด/กลับมาเปิดแอป: เติมรายการทำซ้ำที่ถึงกำหนด · คืน true ถ้ามีข้อมูลเพิ่ม
  async onOpen(ctx) { return (await runRepeats(ctx.store, todayISO())) > 0; },
});

registerAction({ id: 'add-money', label: 'เพิ่มรายการเงิน', run: (ctx, params) => openMoneySheet(ctx, params) });
