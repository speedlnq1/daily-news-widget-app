const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  onData: f => ipcRenderer.on('data', (_e, d) => f(d)),
  onNotice: f => ipcRenderer.on('notice', (_e, d) => f(d)),
  onSettings: f => ipcRenderer.on('settings', (_e, d) => f(d)),
  setSettings: s => ipcRenderer.invoke('set-settings', s),
  setLook: s => ipcRenderer.invoke('set-look', s),
  pickBackground: () => ipcRenderer.invoke('pick-background'),
  clearBackground: () => ipcRenderer.invoke('clear-background'),
  redditComment: link => ipcRenderer.invoke('reddit-comment', link),
  refresh: () => ipcRenderer.invoke('refresh'),
  open: u => ipcRenderer.send('open', u),
  hide: () => ipcRenderer.send('hide')
});
