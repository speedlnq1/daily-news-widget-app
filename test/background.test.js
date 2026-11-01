// Background picture: file checks (pure) and the main-process flow with a stubbed Electron.
const assert = require('assert'), path = require('path'), os = require('os'), fs = require('fs');
const B = require('../src/background');
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);

assert.ok(B.isImage(png) && B.isImage(jpg), 'real PNG and JPEG are accepted');
assert.ok(!B.isImage(Buffer.from('<svg onload=alert(1)></svg>')) && !B.isImage(Buffer.from('GIF89a......')) && !B.isImage(Buffer.alloc(3)) && !B.isImage('text'), 'anything else is refused');
const ihdr = (w, h) => { const b = Buffer.alloc(33); png.copy(b, 0, 0, 8); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const sof = (w, h) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255]), Buffer.alloc(8)]);
assert.deepStrictEqual(B.size(ihdr(4000, 3000)), { width: 4000, height: 3000 }, 'PNG size from the header');
assert.deepStrictEqual(B.size(sof(1920, 1080)), { width: 1920, height: 1080 }, 'JPEG size from the frame header');
assert.strictEqual(B.size(jpg), null, 'JPEG without a frame header: unreadable');
assert.ok(B.sane({ width: 6000, height: 4000 }) && !B.sane({ width: 30000, height: 30000 }) && !B.sane({ width: 0, height: 10 }) && !B.sane(null), 'pixel cap');
// shrink to cover 720x1080, then cut the middle out, so no shape stays big
assert.deepStrictEqual(B.fit(4000, 3000), { resize: { width: 1440, height: 1080 }, crop: { x: 360, y: 0, width: 720, height: 1080 } });
assert.deepStrictEqual(B.fit(20000, 2000), { resize: { width: 10800, height: 1080 }, crop: { x: 5040, y: 0, width: 720, height: 1080 } }, 'very wide picture ends at 720x1080');
assert.deepStrictEqual(B.fit(600, 900), { resize: null, crop: { x: 0, y: 0, width: 600, height: 900 } }, 'small picture is kept as it is');
assert.strictEqual(B.tone(Buffer.alloc(16, 250)), 'light');
assert.strictEqual(B.tone(Buffer.alloc(16, 10)), 'dark');
assert.strictEqual(B.tone(Buffer.alloc(0)), 'dark');

const W = path.resolve(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-'));
const file = path.join(userData, 'pic.png');
let picked = [file], image;
const fake = (w, h, shade) => ({ isEmpty: () => !w, crop: () => fake(w, h, shade), resize: () => fake(8, 8, shade), toJPEG: () => Buffer.from('JPEGDATA'), toBitmap: () => Buffer.alloc(256, shade) });
const H = require('./support/harness')(W, { userData, image: () => image, dialog: () => ({ canceled: !picked, filePaths: picked || [] }) });
(async () => {
  await H.ready; await H.flush();
  const look = H.handlers['set-look'], pick = H.handlers['pick-background'], clear = H.handlers['clear-background'], set = H.handlers['set-settings'];
  const saved = () => JSON.parse(fs.readFileSync(path.join(userData, 'state.json'), 'utf8')).settings;
  assert.strictEqual(H.lastOpts.transparent, true); assert.strictEqual(H.lastOpts.width, 360); assert.strictEqual(H.lastOpts.height, 540);

  // defaults: black glass, auto text, blur 24, no picture
  let v = await look({}, {});
  assert.deepStrictEqual([v.theme, v.textColor, v.blur, v.bg], ['dark', 'auto', 24, '']); assert.ok(!('bgUrl' in v), 'set-look does not resend the picture');
  // look settings are validated
  v = await look({}, { theme: 'light', textColor: 'dark', blur: 99 });
  assert.deepStrictEqual([v.theme, v.textColor, v.blur], ['light', 'dark', 40]);
  v = await look({}, { theme: 'red', textColor: 'pink', blur: -5 });
  assert.deepStrictEqual([v.theme, v.textColor, v.blur], ['dark', 'auto', 24], 'junk falls back to the defaults');
  assert.strictEqual(v.configured, false, 'changing the look in first-run setup does not finish setup');
  await look({}, { theme: 'light', blur: 10 });
  // finishing setup keeps the look
  v = await set({}, { country: 'US', state: '', alerts: false, startup: false, topics: ['sports'] });
  assert.deepStrictEqual([v.theme, v.blur, v.configured], ['light', 10, true], 'saving news settings keeps the look');

  // upload: wrong files are refused, nothing is stored
  fs.writeFileSync(file, '<svg/>'); image = fake(100, 100, 250);
  v = await pick({}); assert.ok(v.error && !v.settings, 'SVG renamed to .png is refused');
  fs.writeFileSync(file, ihdr(100, 100)); image = fake(0, 0, 0);
  v = await pick({}); assert.ok(v.error, 'undecodable picture is refused');
  fs.writeFileSync(file, ihdr(30000, 30000)); image = fake(100, 100, 250);
  v = await pick({}); assert.ok(/too large/.test(v.error), 'a picture that unpacks to something huge is refused before decoding');
  fs.writeFileSync(file, Buffer.concat([png, Buffer.alloc(B.MAX_BYTES)]));
  v = await pick({}); assert.ok(/too big/.test(v.error), 'oversized file is refused');
  assert.ok(!fs.existsSync(path.join(userData, 'background.jpg')), 'refused pictures leave nothing on disk');
  picked = null; v = await pick({}); assert.deepStrictEqual(v, {}, 'cancel changes nothing'); picked = [file];

  // upload: a bright picture
  fs.writeFileSync(file, ihdr(4000, 3000)); image = fake(4000, 3000, 250);
  v = await pick({});
  assert.strictEqual(v.settings.bg, 'light'); assert.strictEqual(v.settings.bgUrl, 'data:image/jpeg;base64,' + Buffer.from('JPEGDATA').toString('base64'));
  assert.strictEqual(saved().bg, 'light'); assert.ok(!('bgUrl' in saved()), 'the picture itself is not stored in settings');
  assert.strictEqual(fs.readFileSync(path.join(userData, 'background.jpg'), 'utf8'), 'JPEGDATA');
  await look({}, { blur: 5 }); assert.strictEqual(saved().bg, 'light', 'look changes keep the picture');
  assert.ok((await H.handlers['get-settings']({})).bgUrl.startsWith('data:image/jpeg'), 'the picture is read from disk when asked for');
  // dark picture
  fs.writeFileSync(file, ihdr(800, 1200)); image = fake(800, 1200, 5); v = await pick({}); assert.strictEqual(v.settings.bg, 'dark');
  // remove
  v = await clear({}); assert.deepStrictEqual([v.bg, v.bgUrl], ['', '']); assert.ok(!fs.existsSync(path.join(userData, 'background.jpg')));
  // small screen (768p at 150% zoom): the widget shrinks to fit
  const H2 = require('./support/harness')(W, { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'bg2-')), image: () => image, dialog: () => ({ canceled: true }), screenHeight: 480 });
  await H2.ready; await H2.flush(); assert.strictEqual(H2.lastOpts.height, 440);
  console.log('background tests passed');
  process.exit(0);
})();
