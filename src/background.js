// Checks for the background picture. Pure functions, so they can be tested without Electron.
const MAX_BYTES = 10 * 1024 * 1024; // bigger files are refused before anything decodes them
const WIDTH = 720, HEIGHT = 1080;   // twice the widget size is plenty and keeps memory tiny
const MAX_PIXELS = 40e6;            // read from the file header, so a small file that unpacks to something huge is refused

// Real JPEG or PNG by the first bytes, whatever the file is called.
function isImage(buf) {
  return Buffer.isBuffer(buf) && buf.length > 8 &&
    ((buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) || buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
}
// Width and height from the file header, without decoding. null if it can't be read.
function size(buf) {
  if (buf[0] === 0x89) return buf.length >= 24 ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null; // PNG: IHDR
  let i = 2;
  while (i + 9 < buf.length) { // JPEG: walk the markers to the first frame header
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; } // padding
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) ? 2 : 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
const sane = s => !!s && s.width > 0 && s.height > 0 && s.width * s.height <= MAX_PIXELS;
// How to turn a w x h picture into at most WIDTH x HEIGHT that still covers the widget: shrink first, then cut the middle out.
function fit(w, h) {
  const k = Math.min(1, Math.max(WIDTH / w, HEIGHT / h));
  const rw = Math.max(1, Math.round(w * k)), rh = Math.max(1, Math.round(h * k)), cw = Math.min(rw, WIDTH), ch = Math.min(rh, HEIGHT);
  return { resize: k < 1 ? { width: rw, height: rh } : null, crop: { x: Math.floor((rw - cw) / 2), y: Math.floor((rh - ch) / 2), width: cw, height: ch } };
}
// 'light' or 'dark' from raw 4-bytes-per-pixel data (the order of the colour bytes doesn't matter for a plain average).
function tone(pixels) {
  let sum = 0, n = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) { sum += pixels[i] + pixels[i + 1] + pixels[i + 2]; n += 3; }
  return n && sum / n > 140 ? 'light' : 'dark';
}
module.exports = { MAX_BYTES, isImage, size, sane, fit, tone };
