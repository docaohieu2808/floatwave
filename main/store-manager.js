// Lazy singleton around electron-store v10 (pure ESM — main process only).
import Store from 'electron-store';

const DEFAULTS = {
  favorites: [], // [{id,title,channel,thumbnail}]
  queue: [], // [{id,title,channel,thumbnail}]
  queueIndex: -1,
  volume: 50, // 0-100
  repeat: 'off', // 'off' | 'one' | 'all'
  playlists: [], // [{name, tracks:[{id,title,channel,duration,thumbnail}]}]
  alwaysOnTop: false, // pin window above others (titlebar 📌 toggle)
};

// Keys the renderer is allowed to read/write over IPC
export const STORE_KEYS = new Set(Object.keys(DEFAULTS));

let store = null;

export function getStore() {
  if (!store) store = new Store({ defaults: DEFAULTS });
  return store;
}
