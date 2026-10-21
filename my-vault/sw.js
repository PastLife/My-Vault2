// Service worker: เก็บไฟล์ของแอปไว้ในเครื่องเพื่อให้เปิดได้ตอนไม่มีเน็ต
// ไม่เคยแตะข้อมูลผู้ใช้ (ข้อมูลอยู่ใน IndexedDB ซึ่งไฟล์นี้ไม่ได้เปิด)
//
// ออกเวอร์ชันใหม่: เปลี่ยน VERSION → เบราว์เซอร์เห็นว่า sw.js เปลี่ยน → ดาวน์โหลดไฟล์ชุดใหม่ทั้งชุด
// → แอปแสดงแถบ "มีเวอร์ชันใหม่" → ผู้ใช้แตะ → สลับไปชุดใหม่พร้อมกันทุกไฟล์
const VERSION = 'v1';
const CACHE = `my-vault-${VERSION}`;

const ASSETS = [
  // ASSETS:start
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/fonts.css',
  'js/main.js',
  'js/core/crypto.js',
  'js/core/images.js',
  'js/core/session.js',
  'js/core/store.js',
  'js/core/storage/idb.js',
  'js/core/storage/memory.js',
  'js/ui/dom.js',
  'js/ui/rules.js',
  'js/ui/shell.js',
  'js/modules/vault/actions.js',
  'js/modules/vault/index.js',
  'js/modules/vault/model.js',
  'js/modules/vault/view.js',
  'fonts/bai-jamjuree-latin-600-normal.woff2',
  'fonts/bai-jamjuree-latin-700-normal.woff2',
  'fonts/bai-jamjuree-thai-600-normal.woff2',
  'fonts/bai-jamjuree-thai-700-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2',
  'fonts/ibm-plex-sans-thai-latin-400-normal.woff2',
  'fonts/ibm-plex-sans-thai-latin-600-normal.woff2',
  'fonts/ibm-plex-sans-thai-thai-400-normal.woff2',
  'fonts/ibm-plex-sans-thai-thai-600-normal.woff2',
  'icons/apple-touch-icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  // ASSETS:end
];

self.addEventListener('install', event => {
  // cache: 'reload' = ข้ามแคชของเบราว์เซอร์ ให้ได้ไฟล์ล่าสุดจากเซิร์ฟเวอร์จริง
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
  // ไม่ skipWaiting เอง: รอผู้ใช้แตะ "อัปเดต" เพื่อไม่ให้ไฟล์ต่างเวอร์ชันปนกันระหว่างใช้งาน
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('my-vault-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // เปิดหน้าแอป (รวมลิงก์ที่มี #) → ใช้หน้าเริ่มต้นจากแคช
    const hit = req.mode === 'navigate'
      ? await cache.match('./')
      : await cache.match(req, { ignoreSearch: true });
    return hit ?? fetch(req);
  })());
});
