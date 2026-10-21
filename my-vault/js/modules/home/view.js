// หน้าแรก (ศูนย์ควบคุม): คงเหลือของเดือน · กราฟรายวัน · แถบเตือน · โปรเจคที่กำลังทำ · ปุ่มเพิ่มเงินด่วน
import { formatBaht, monthKey, shiftMonth, summarizeMonth, dailyBars } from '../../domain/money.js';
import { activeOps, statusOf } from '../../domain/projects.js';
import { expiryAlerts } from '../vault/model.js';
import { typeIcon, emptyArt } from '../../ui/art.js';
import { enLabel, clear } from '../../ui/dom.js';

const pad = n => String(n).padStart(2, '0');
const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthName = m => new Date(`${m}-01T00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const shortMonth = m => new Date(`${m}-01T00:00`).toLocaleDateString('th-TH', { month: 'short' });

function expiryText(days) {
  if (days < 0) return `หมดอายุแล้ว ${-days} วัน`;
  if (days === 0) return 'หมดอายุวันนี้';
  return `หมดอายุในอีก ${days} วัน`;
}

export function createHomeView(container, ctx, params = {}) {
  const { store, h, icon, navigate, runAction } = ctx;
  const thisMonth = monthKey(todayISO());
  const month = params.month ?? thisMonth;
  let alive = true;

  async function render() {
    const [money, projects, vault] = await Promise.all(['money', 'projects', 'vault'].map(m => store.list(m)));
    if (!alive) return;
    const s = summarizeMonth(money, month);
    const { max, bars } = dailyBars(s.days);
    const ops = activeOps(projects, money, month);
    const corrupt = [...money, ...projects, ...vault].filter(r => !r.data).length;
    const expiries = expiryAlerts(vault, todayISO());

    // ---------- แผงคงเหลือ ----------
    const balance = h('section', { class: 'panel stack balance', 'data-month': month },
      h('div', { class: 'month-bar compact' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'เดือนก่อน', onclick: () => navigate('home', { month: shiftMonth(month, -1) }) },
          icon('chevronLeft'), h('span', { class: 'small' }, shortMonth(shiftMonth(month, -1)))),
        h('div', { class: 'month-name' }, enLabel('Ops center', month === thisMonth ? 'เดือนนี้' : null), h('h2', {}, monthName(month))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'เดือนถัดไป', onclick: () => navigate('home', { month: shiftMonth(month, 1) }) },
          h('span', { class: 'small' }, shortMonth(shiftMonth(month, 1))), icon('chevronRight'))),
      h('div', { class: 'net-big' },
        h('span', { class: 'label' }, 'คงเหลือ'),
        h('span', { class: `num ${s.net >= 0 ? 'money-in glow-in' : 'money-out glow-out'}`, 'data-total': 'net' },
          s.net ? formatBaht(s.net, { sign: true }) : '฿0')),
      h('div', { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('span', { class: 'label money-in' }, '▲ รายรับ'), h('span', { class: 'num money-in', 'data-total': 'in' }, formatBaht(s.income))),
        h('div', { class: 'stat' }, h('span', { class: 'label money-out' }, '▼ รายจ่าย'), h('span', { class: 'num money-out', 'data-total': 'out' }, formatBaht(s.expense)))),
      s.count
        ? h('figure', { class: 'chart', 'aria-label': `กราฟรายวัน สูงสุด ${formatBaht(max)}` },
          h('figcaption', { class: 'chart-max' }, h('span', { class: 'muted small' }, 'สูงสุดต่อวัน'), h('span', { class: 'num small' }, formatBaht(max))),
          h('div', { class: 'bars' }, bars.map(b => h('div', {
            class: 'bar-day', title: `วันที่ ${b.day}`, 'data-day': b.day,
          }, h('i', { class: 'in', style: `height:${b.inPct}%` }), h('i', { class: 'out', style: `height:${b.outPct}%` })))),
          h('div', { class: 'bar-axis num small' }, h('span', {}, '1'), h('span', {}, '15'), h('span', {}, String(bars.length))))
        : h('div', { class: 'empty compact' }, emptyArt('money'),
          h('p', {}, month === thisMonth ? 'ยังไม่มีรายการเงินเดือนนี้' : `ไม่มีรายการเงินใน${monthName(month)}`),
          h('button', { class: 'btn', type: 'button', onclick: () => runAction('add-money', {}) }, icon('plus'), 'เพิ่มรายการแรก')),
      h('div', { class: 'quick' },
        h('button', { class: 'btn quick-in', type: 'button', onclick: () => runAction('add-money', { kind: 'in' }) }, '＋ รายรับ'),
        h('button', { class: 'btn quick-out', type: 'button', onclick: () => runAction('add-money', { kind: 'out' }) }, '－ รายจ่าย')),
    );

    // ---------- แถบเตือน ----------
    const alerts = [
      ...expiries.map(a => h('button', {
        type: 'button', class: `alert ${a.days < 0 ? 'gone' : 'soon'}`, onclick: () => navigate('vault'),
      }, h('span', { class: 'blink', 'aria-hidden': 'true' }), h('strong', {}, a.title), ` ${expiryText(a.days)}`)),
      corrupt ? h('p', { class: 'alert gone' }, `มี ${corrupt} รายการอ่านไม่ได้ ยอดอาจไม่ครบ`) : null,
    ].filter(Boolean);

    // ---------- โปรเจคที่กำลังทำ ----------
    const opsPanel = h('section', { class: 'panel stack ops' },
      h('div', { class: 'split' }, enLabel('Active ops', 'โปรเจคที่กำลังทำ'),
        h('button', { class: 'link small', type: 'button', onclick: () => navigate('projects') }, 'ทั้งหมด ▸')),
      ops.length
        ? h('ul', { class: 'op-list' }, ops.map(o => h('li', {}, h('button', {
          type: 'button', class: 'op', 'data-id': o.id, onclick: () => navigate('projects', { projectId: o.id }),
        },
          h('span', { class: 'icon-tile', 'data-status': 'active' }, typeIcon(o.project.type)),
          h('span', { class: 'proj-main' },
            h('span', { class: 'proj-name' }, o.project.name),
            h('span', { class: 'proj-meta' }, h('span', { class: 'status-dot', 'data-status': 'active' }), ` ${statusOf('active').name}`,
              o.progress === null ? null : ` · งาน ${o.project.tasks.filter(t => t.done).length}/${o.project.tasks.length}`),
            o.progress === null ? null : h('div', { class: 'progress' }, h('i', { style: `width:${o.progress}%` }))),
          h('span', { class: `num ${o.net > 0 ? 'money-in' : o.net < 0 ? 'money-out' : 'muted'}` },
            o.net ? formatBaht(o.net, { sign: true }) : '฿0')))))
        : h('div', { class: 'empty compact' }, emptyArt('projects'),
          h('p', {}, 'ยังไม่มีโปรเจคที่กำลังทำ'),
          h('button', { class: 'btn', type: 'button', onclick: () => navigate('projects') }, 'ไปหน้าโปรเจค')),
    );

    clear(container, h('div', { class: 'home-grid' },
      h('div', { class: 'home-col' }, balance),
      h('div', { class: 'home-col' }, alerts.length ? h('div', { class: 'alerts' }, alerts) : null, opsPanel)));
  }

  render();
  return { destroy() { alive = false; container.replaceChildren(); } };
}
