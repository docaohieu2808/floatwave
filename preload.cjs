// Preload bridge — sandboxed, so CommonJS (.cjs) is required (ESM preload
// is unsupported under sandbox:true). Exposes a fixed allowlist only.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('app:ping'),
  search: (query) => ipcRenderer.invoke('search:youtube', query),
  searchAlternative: (query, excludeIds) =>
    ipcRenderer.invoke('search:alternative', query, excludeIds),
  getUpNext: (videoId) => ipcRenderer.invoke('radio:up-next', videoId),
  getStore: (key) => ipcRenderer.invoke('store:get', key),
  setStore: (key, value) => ipcRenderer.invoke('store:set', key, value),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  setMode: (mode) => ipcRenderer.invoke('mode:set', mode),
  // fired when web mode ends from the main side (web window's own X button)
  onModeExited: (callback) => ipcRenderer.on('mode:exited', () => callback()),
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    close: () => ipcRenderer.invoke('win:close'),
  },
});
