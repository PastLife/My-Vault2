// ภาพวาดของแอป — SVG คงที่ทั้งหมด (ไม่มีข้อมูลผู้ใช้ปน) ฝังในไฟล์ ใช้ออฟไลน์ได้
// สีใช้ currentColor / ค่าคงที่ของธีมบังเกอร์

const svg = (viewBox, body, cls = 'art') => {
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return span;
};

// ---------- ประตูนิรภัย (หน้าล็อก / ต้อนรับ) ----------
const DOOR = `
  <defs><radialGradient id="mv-door-g" cx="50%" cy="40%"><stop offset="0" stop-color="#3B4636"/><stop offset="1" stop-color="#1A2018"/></radialGradient></defs>
  <rect x="8" y="8" width="234" height="234" rx="18" fill="#141912" stroke="#2C3628" stroke-width="2"/>
  <g fill="#46523F" stroke="none"><circle cx="24" cy="24" r="4"/><circle cx="226" cy="24" r="4"/><circle cx="24" cy="226" r="4"/><circle cx="226" cy="226" r="4"/></g>
  <rect x="8" y="104" width="20" height="42" rx="4" fill="#3A4436" stroke="none"/>
  <rect x="222" y="104" width="20" height="42" rx="4" fill="#3A4436" stroke="none"/>
  <circle cx="125" cy="125" r="96" fill="url(#mv-door-g)" stroke="#556150" stroke-width="5"/>
  <circle cx="125" cy="125" r="80" stroke="#2C3628" stroke-width="10" stroke-dasharray="6 9"/>
  <g class="dial">
    <g stroke="#7F8C77" stroke-width="10">
      <line x1="125" y1="58" x2="125" y2="88"/><line x1="125" y1="162" x2="125" y2="192"/>
      <line x1="58" y1="125" x2="88" y2="125"/><line x1="162" y1="125" x2="192" y2="125"/>
    </g>
    <circle cx="125" cy="125" r="37" fill="#0E110D" stroke="currentColor" stroke-width="3"/>
    <circle class="core-glow" cx="125" cy="125" r="37" stroke="currentColor" stroke-width="12"/>
    <g stroke="currentColor" stroke-width="3"><line x1="125" y1="92" x2="125" y2="100"/></g>
  </g>
  <g transform="translate(125 125)" stroke="none" fill="currentColor">
    <rect x="-11" y="-1" width="22" height="16" rx="3"/>
  </g>
  <path d="M118 124v-6a7 7 0 0 1 14 0v6" stroke="currentColor" stroke-width="3.5"/>`;

export function vaultDoor() {
  const el = svg('0 0 250 250', DOOR, 'art door');
  return el;
}

// ---------- ไอคอนประเภทโปรเจค ----------
const TYPE_ICONS = {
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
  study: '<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
  hobby: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r="1"/><circle cx="18" cy="13.5" r="1"/>',
  business: '<path d="M3 20h18M5 16l4-5 4 3 6-8"/><path d="M15 6h4v4"/>',
  health: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z"/><path d="M6 12h3l1.5-2.5 2 5L14 12h4"/>',
  other: '<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>',
};

export function typeIcon(typeId) {
  return svg('0 0 24 24', TYPE_ICONS[typeId] ?? TYPE_ICONS.other, 'art icon-art');
}

// ---------- ไอคอนหมวดเงิน ----------
const DOTS = '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>';
const CATEGORY_ICONS = {
  out: {
    food: '<path d="M3 11h18a9 9 0 0 1-18 0zM7 8c0-2 2-2 2-4M12 8c0-2 2-2 2-4M17 8c0-2 2-2 2-4"/>',
    transport: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16M8 21l1-4M16 21l-1-4"/><circle cx="8" cy="14" r=".8"/><circle cx="16" cy="14" r=".8"/>',
    bills: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    shopping: '<path d="M3 4h2l2.5 11h11L21 7H6.5"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    gear: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    health: TYPE_ICONS.health,
    fun: '<path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3z"/><path d="M14 4v12" stroke-dasharray="2 2"/>',
    edu: TYPE_ICONS.study,
    other: DOTS,
  },
  in: {
    salary: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M16 12.5h2M2 10h20M6 6V4h12v2"/>',
    sales: '<path d="M20 12 12 20l-8-8V4h8z"/><circle cx="8" cy="8" r="1.5"/>',
    freelance: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    invest: TYPE_ICONS.business,
    gift: '<rect x="3" y="8" width="18" height="5"/><path d="M5 13v8h14v-8M12 8v13M12 8C10 4 6 4 7 7s5 1 5 1 4 2 5-1-3-3-5 1"/>',
    other: DOTS,
  },
};

export function categoryIcon(kind, catId) {
  const set = CATEGORY_ICONS[kind === 'in' ? 'in' : 'out'];
  return svg('0 0 24 24', set[catId] ?? set.other, 'art icon-art');
}

// ---------- ภาพหน้าว่าง ----------
const EMPTY = {
  money: `
    <path d="M20 96h120" stroke-width="2.5"/>
    <rect x="34" y="52" width="56" height="44" rx="4"/>
    <path d="M34 66h56M48 52v44M76 52v44" opacity=".5"/>
    <ellipse cx="114" cy="90" rx="16" ry="5"/><path d="M98 90v-8c0 2.8 7 5 16 5s16-2.2 16-5v8"/>
    <ellipse cx="114" cy="78" rx="16" ry="5"/><path d="M98 78v-8c0 2.8 7 5 16 5s16-2.2 16-5v8"/>
    <ellipse cx="114" cy="66" rx="16" ry="5" stroke="#F2A93B"/>
    <path d="M110 66h8" stroke="#F2A93B"/>`,
  projects: `
    <circle cx="80" cy="60" r="44" opacity=".35"/><circle cx="80" cy="60" r="30" opacity=".5"/><circle cx="80" cy="60" r="16"/>
    <path d="M80 16v88M36 60h88" opacity=".3"/>
    <path d="M80 60 112 30" stroke="#F2A93B" stroke-width="2.5"/>
    <circle cx="104" cy="44" r="3.5" fill="#7CF07A" stroke="none"/>
    <circle cx="58" cy="78" r="3" fill="#F2A93B" stroke="none"/>`,
  vault: `
    <rect x="44" y="18" width="72" height="88" rx="6"/>
    <path d="M44 48h72M44 78h72"/>
    <path d="M72 33h16M72 63h16M72 93h16" stroke="#F2A93B" stroke-width="2.5"/>
    <path d="M30 106h100" stroke-width="2.5"/>`,
};

export function emptyArt(name) {
  return svg('0 0 160 120', EMPTY[name] ?? EMPTY.projects, 'art empty-art');
}
