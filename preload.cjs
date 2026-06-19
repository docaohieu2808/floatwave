// Preload bridge — sandboxed, so CommonJS (.cjs) is required (ESM preload
// is unsupported under sandbox:true). Exposes a fixed allowlist only.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('app:ping'),
  search: (query, mode) => ipcRenderer.invoke('search:youtube', query, mode),
  searchSuggest: (query) => ipcRenderer.invoke('search:suggest', query),
  getUpNext: (videoId) => ipcRenderer.invoke('radio:up-next', videoId),
  setGain: (value, build) => ipcRenderer.invoke('player:set-gain', value, build),
  getStore: (key) => ipcRenderer.invoke('store:get', key),
  setStore: (key, value) => ipcRenderer.invoke('store:set', key, value),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getInfo: () => ipcRenderer.invoke('app:info'),
  setMode: (mode) => ipcRenderer.invoke('mode:set', mode),
  // fired when web mode ends from the main side (web window's own X button)
  onModeExited: (callback) => ipcRenderer.on('mode:exited', () => callback()),
  // global hotkeys (media keys / Ctrl+Alt combos) forwarded from main
  onHotkey: (callback) => ipcRenderer.on('hotkey', (_event, action) => callback(action)),
  // backend B: hidden music.youtube.com playback for embed-blocked tracks
  webPlay: {
    load: (videoId, volume) => ipcRenderer.invoke('webplay:load', videoId, volume),
    control: (action, value) => ipcRenderer.invoke('webplay:control', action, value),
    stop: () => ipcRenderer.invoke('webplay:stop'),
  },
  onWebPlayStatus: (callback) =>
    ipcRenderer.on('webplay:status', (_event, status) => callback(status)),
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    close: () => ipcRenderer.invoke('win:close'),
    setPin: (pinned) => ipcRenderer.invoke('win:set-pin', pinned),
    setCompact: (compact) => ipcRenderer.invoke('win:set-compact', compact),
    resetSize: () => ipcRenderer.invoke('win:reset-size'),
    // high-frequency during a grip drag → fire-and-forget send, not invoke
    resizeVideo: (width, anchorRight) => ipcRenderer.send('win:resize-video', width, anchorRight),
    setImmersive: (on) => ipcRenderer.send('win:immersive', on),
    // drag the window by the video (press-and-hold); main follows the cursor
    dragStart: () => ipcRenderer.send('win:drag-start'),
    dragEnd: () => ipcRenderer.send('win:drag-end'),
  },
});
