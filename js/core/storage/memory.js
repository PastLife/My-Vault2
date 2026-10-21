// ที่เก็บในหน่วยความจำ — ใช้ในเทสต์ มี interface เดียวกับ idb.js
// maxBytes (ถ้ากำหนด) จำลองพื้นที่เต็ม โดยนับขนาด iv + ct ของ record และ blob

const sizeOf = v => (v?.iv?.byteLength ?? 0) + (v?.ct?.byteLength ?? 0);

function quotaError() {
  const e = new Error('พื้นที่เก็บข้อมูลเต็ม');
  e.name = 'QuotaExceededError';
  return e;
}

export function createMemoryAdapter({ maxBytes = Infinity } = {}) {
  const meta = new Map();
  const records = new Map();
  const blobs = new Map();
  let used = 0;

  const put = (map, value) => {
    const next = used - sizeOf(map.get(value.id)) + sizeOf(value);
    if (next > maxBytes) throw quotaError();
    map.set(value.id, structuredClone(value));
    used = next;
  };
  const del = (map, id) => {
    used -= sizeOf(map.get(id));
    map.delete(id);
  };
  const get = (map, id) => (map.has(id) ? structuredClone(map.get(id)) : undefined);

  return {
    async getMeta(key) { return get(meta, key); },
    async setMeta(key, value) { meta.set(key, structuredClone(value)); },

    async getRecord(id) { return get(records, id); },
    async putRecord(rec) { put(records, rec); },
    // ไม่ระบุ module = คืนทุกรายการ (ใช้ตอนสำรองข้อมูล)
    async listRecords(module) {
      return [...records.values()]
        .filter(r => module === undefined || r.module === module)
        .map(r => structuredClone(r));
    },

    async getBlob(id) { return get(blobs, id); },
    async listBlobsFor(recordId) {
      return [...blobs.values()].filter(b => b.recordId === recordId).map(b => structuredClone(b));
    },
    async putBlob(b) { put(blobs, b); },
    async deleteBlob(id) { del(blobs, id); },
    async deleteBlobsFor(recordId) {
      for (const b of [...blobs.values()]) if (b.recordId === recordId) del(blobs, b.id);
    },

    async clearAll() { meta.clear(); records.clear(); blobs.clear(); used = 0; },
  };
}
