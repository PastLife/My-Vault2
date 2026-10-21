// ที่เก็บจริงในเบราว์เซอร์ (IndexedDB) — interface เดียวกับ memory.js
// เก็บแต่ข้อมูลที่เข้ารหัสแล้วเสมอ (store.js เป็นคนเข้ารหัสก่อนส่งมา)

const VERSION = 1;

const done = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const finished = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
});

export function openIdbAdapter(name = 'my-vault') {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('records')) {
        db.createObjectStore('records', { keyPath: 'id' }).createIndex('module', 'module');
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' }).createIndex('recordId', 'recordId');
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(wrap(req.result));
  });
}

function wrap(db) {
  // อ่าน: คืนค่าจาก request เดียว
  const read = (store, fn) => done(fn(db.transaction(store, 'readonly').objectStore(store)));
  // เขียน: รอให้ transaction จบจริง (QuotaExceededError มักโผล่ตอน commit)
  const write = async (stores, fn) => {
    const tx = db.transaction(stores, 'readwrite');
    await fn(tx);
    await finished(tx);
  };

  return {
    getMeta: key => read('meta', s => s.get(key)),
    setMeta: (key, value) => write('meta', tx => { tx.objectStore('meta').put(value, key); }),

    getRecord: id => read('records', s => s.get(id)),
    putRecord: rec => write('records', tx => { tx.objectStore('records').put(rec); }),
    // ไม่ระบุ module = คืนทุกรายการ (ใช้ตอนสำรองข้อมูล)
    listRecords: module => read('records', s => (module === undefined ? s.getAll() : s.index('module').getAll(module))),

    getBlob: id => read('blobs', s => s.get(id)),
    listBlobsFor: recordId => read('blobs', s => s.index('recordId').getAll(recordId)),
    putBlob: b => write('blobs', tx => { tx.objectStore('blobs').put(b); }),
    deleteBlob: id => write('blobs', tx => { tx.objectStore('blobs').delete(id); }),
    deleteBlobsFor: recordId => write('blobs', tx => {
      const store = tx.objectStore('blobs');
      // ลบใน callback ของ request เลย เพื่อให้ยังอยู่ใน transaction เดิมแน่นอน
      store.index('recordId').getAllKeys(recordId).onsuccess = e => {
        for (const k of e.target.result) store.delete(k);
      };
    }),

    clearAll: () => write(['meta', 'records', 'blobs'], tx => {
      for (const s of ['meta', 'records', 'blobs']) tx.objectStore(s).clear();
    }),
  };
}
