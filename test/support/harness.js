// Loads src/main.js with a stubbed electron. Usage: const H = require('./harness')(W, opts)
process.getSystemVersion = () => '10.0.22631';
const Module = require('module'), path = require('path'), fs = require('fs'), EE = require('events');
module.exports = function (W, opts = {}) {
  const ud = opts.userData;
  const H = { sent: [], notes: [], login: [], timers: [], handlers: {}, on: {}, wins: 0, idle: opts.idle || 0, battery: false, fetchImpl: null, opened: [] };
  const app = new EE();
  Object.assign(app, { isPackaged: opts.packaged ?? true, disableHardwareAcceleration(){}, commandLine: { appendSwitch(){} }, getSystemLocale: () => opts.locale || 'en-US',
    requestSingleInstanceLock: () => opts.lock ?? true, enableSandbox(){}, quit(){ H.quit = true; }, getPath: () => ud, setAppUserModelId(){},
    setLoginItemSettings: s => H.login.push(s), whenReady: () => (H.ready = Promise.resolve()) });
  class BW extends EE { constructor(o){ super(); H.wins++; H.lastOpts=o; this.d=false; const self=this; this.webContents = Object.assign(new EE(), { isDestroyed:()=>self.d, send:(c,p)=>H.sent.push([c, JSON.parse(JSON.stringify(p))]), setWindowOpenHandler(){} }); H.win=this; setImmediate(()=>this.webContents.emit('did-finish-load')); }
    loadFile(){} isDestroyed(){return this.d} show(){H.shown=(H.shown||0)+1} focus(){} close(){ this.d=true; this.emit('closed'); } }
  class Note extends EE { constructor(o){ super(); this.o=o; } show(){ H.notes.push(this.o); } }
  const pm = new EE(); pm.isOnBatteryPower = () => H.battery; pm.getSystemIdleTime = () => H.idle;
  const electron = { app, BrowserWindow: BW, Tray: class { setToolTip(){} setContextMenu(m){H.menu=m} on(e,f){H.trayClick=f} }, Menu: { buildFromTemplate: t => t },
    Notification: Note, ipcMain: { handle:(c,f)=>H.handlers[c]=f, on:(c,f)=>H.on[c]=f }, shell: { openExternal: u => H.opened.push(u) },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }), createFromBuffer: b => opts.image(b) }, screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: opts.screenHeight || 1080 } }) }, dialog: { showOpenDialog: async () => opts.dialog() }, session: { defaultSession: { setPermissionRequestHandler(){}, setPermissionCheckHandler(){} } },
    powerMonitor: pm, net: { fetch: (u, o) => H.fetchImpl(u, o) } };
  H.pm = pm; H.app = app;
  const realST = global.setTimeout, realSI = global.setInterval;
  global.setTimeout = (f, ms, ...a) => { if (ms >= 60000) { const t = { f, ms, unref(){}, cleared:false }; H.timers.push(t); return t; } return realST(f, ms, ...a); };
  global.clearTimeout = (t => x => { if (x && x.f) x.cleared = true; else t(x); })(global.clearTimeout);
  global.setInterval = (f, ms) => ({ unref(){} });
  const orig = Module._load;
  Module._load = function (req, parent, ...r) { if (req === 'electron') return electron; if (req === 'electron-updater') return { autoUpdater: { checkForUpdatesAndNotify: async()=>{}, checkForUpdates: async()=>{} } }; return orig.call(this, req, parent, ...r); };
  for (const k of Object.keys(require.cache)) if (k.startsWith(W)) delete require.cache[k];
  require(W + '/src/main.js');
  Module._load = orig;
  H.lastTimer = () => H.timers.filter(t => !t.cleared).slice(-1)[0];
  H.data = () => H.sent.filter(x => x[0] === 'data').slice(-1)[0]?.[1];
  H.flush = () => new Promise(r => realST(r, 50));
  return H;
};
