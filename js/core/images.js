// ย่อรูปในหน่วยความจำก่อนส่งให้ store เข้ารหัส — ไฟล์นี้ไม่เขียนอะไรลงที่เก็บเลย
// ใช้ได้ในเบราว์เซอร์เท่านั้น (ยกเว้น fitSize ซึ่งเป็นตรรกะล้วน)

export const FULL_MAX = 1600;
export const THUMB_MAX = 320;
export const JPEG_QUALITY = 0.82;

export class ImageDecodeError extends Error {
  constructor() { super('เปิดรูปนี้ไม่ได้ ลองถ่ายหน้าจอแล้วแนบแทน'); this.name = 'ImageDecodeError'; }
}

// ขนาดใหม่ที่ด้านยาวไม่เกิน max โดยไม่ขยายรูปเล็ก
export function fitSize(w, h, max) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

// ถอดรูป: ลอง createImageBitmap ก่อน (หมุนตาม EXIF) ถ้าไม่ได้ค่อยใช้ <img>
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, w: bmp.width, h: bmp.height, release: () => bmp.close?.() };
    } catch { /* ลองวิธีถัดไป */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth) throw new Error('empty');
    return { source: img, w: img.naturalWidth, h: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageDecodeError();
  }
}

async function toJpeg(source, srcW, srcH, max) {
  const { w, h } = fitSize(srcW, srcH, max);
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // JPEG ไม่มีพื้นใส: รูปพื้นใสจะได้พื้นขาวแทนพื้นดำ
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
    : await new Promise(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new ImageDecodeError();
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

export async function prepareImage(file) {
  const img = await decode(file);
  try {
    const full = await toJpeg(img.source, img.w, img.h, FULL_MAX);
    const thumb = await toJpeg(img.source, img.w, img.h, THUMB_MAX);
    return { full: full.bytes, thumb: thumb.bytes, w: full.w, h: full.h };
  } finally {
    img.release();
  }
}
