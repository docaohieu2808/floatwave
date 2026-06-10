// All ipcMain handlers — window controls, search, store get/set, open-external.
import { ipcMain, shell } from 'electron';
import { searchYouTube, findAlternativeVideos, getUpNextTracks } from './youtube-search.js';
import { getStore, STORE_KEYS } from './store-manager.js';
import { enterWebMode, exitWebMode } from './web-mode-manager.js';

// Only allow opening canonical YouTube watch URLs externally
const YT_WATCH_RE = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;

export function registerIpc(win) {
  ipcMain.handle('app:ping', () => 'pong');

  ipcMain.handle('win:minimize', () => {
    if (!win.isDestroyed()) win.minimize();
  });

  ipcMain.handle('win:close', () => {
    if (!win.isDestroyed()) win.close();
  });

  ipcMain.handle('search:youtube', (_event, query) => searchYouTube(query));

  ipcMain.handle('search:alternative', (_event, query, excludeIds) =>
    findAlternativeVideos(query, excludeIds)
  );

  ipcMain.handle('radio:up-next', (_event, videoId) => getUpNextTracks(videoId));

  ipcMain.handle('store:get', (_event, key) => {
    if (!STORE_KEYS.has(key)) return undefined;
    return getStore().get(key);
  });

  ipcMain.handle('store:set', (_event, key, value) => {
    if (!STORE_KEYS.has(key)) return false;
    getStore().set(key, value);
    return true;
  });

  ipcMain.handle('mode:set', (_event, mode) => {
    if (mode === 'web') enterWebMode(win);
    else if (mode === 'mini') exitWebMode(win);
    else return false;
    return true;
  });

  ipcMain.handle('app:open-external', (_event, url) => {
    if (typeof url === 'string' && YT_WATCH_RE.test(url)) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });
}
