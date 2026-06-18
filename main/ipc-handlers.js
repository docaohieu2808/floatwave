// All ipcMain handlers — window controls, search, store get/set, open-external.
import { ipcMain, shell } from 'electron';
import { searchYouTube, getSuggestions, getUpNextTracks } from './youtube-search.js';
import { getStore, STORE_KEYS } from './store-manager.js';
import {
  enterWebMode, exitWebMode, setWebAlwaysOnTop,
  ensureWebWindow, getExistingWebWindow, setPlaybackGuard,
} from './web-mode-manager.js';
import {
  initWebPlayback, isWebPlaybackActive, webPlayLoad, webPlayControl, stopWebPlayback,
} from './web-playback-backend.js';
import { setCompactMode, resetSize, resizeVideo } from './window-manager.js';
import { applyEmbedLoudness } from './embed-loudness.js';

// Only allow opening canonical YouTube watch URLs externally
const YT_WATCH_RE = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;

export function registerIpc(win) {
  // backend B (hidden music.youtube.com playback for embed-blocked tracks)
  initWebPlayback(win, { ensure: ensureWebWindow, getExisting: getExistingWebWindow });
  setPlaybackGuard(isWebPlaybackActive); // exiting web mode must not silence it

  ipcMain.handle('app:ping', () => 'pong');

  ipcMain.handle('webplay:load', (_event, videoId, volume) => webPlayLoad(videoId, volume));
  ipcMain.handle('webplay:control', (_event, action, value) => webPlayControl(action, value));
  ipcMain.handle('webplay:stop', () => {
    stopWebPlayback();
    return true;
  });

  ipcMain.handle('win:minimize', () => {
    // Minimize-to-tray: hide the window (removes its taskbar button) and let the
    // tray icon (main/tray-manager.js) bring it back. hide() keeps the window's
    // pin/alwaysOnTop + size, so show() restores it exactly.
    if (!win.isDestroyed()) win.hide();
  });

  ipcMain.handle('win:close', () => {
    if (!win.isDestroyed()) win.close();
  });

  ipcMain.handle('search:youtube', (_event, query, mode) => searchYouTube(query, mode));

  ipcMain.handle('search:suggest', (_event, query) => getSuggestions(query));

  ipcMain.handle('radio:up-next', (_event, videoId) => getUpNextTracks(videoId));

  // Focus mode: renderer hides search+player via CSS; window shrinks to match
  ipcMain.handle('win:set-compact', (_event, compact) => {
    const flag = !!compact;
    setCompactMode(flag);
    getStore().set('focusMode', flag);
    return flag;
  });

  // Snap the window back to the default mini-player size (also exits focus mode)
  ipcMain.handle('win:reset-size', () => {
    resetSize();
    return true;
  });

  // Corner-grip drag → ratio-locked resize (fire-and-forget, high frequency)
  ipcMain.on('win:resize-video', (_event, width, anchorRight) => resizeVideo(width, anchorRight));

  ipcMain.handle('store:get', (_event, key) => {
    if (!STORE_KEYS.has(key)) return undefined;
    return getStore().get(key);
  });

  ipcMain.handle('store:set', (_event, key, value) => {
    if (!STORE_KEYS.has(key)) return false;
    getStore().set(key, value);
    return true;
  });

  // Match the embed's loudness to the web backend: undo YouTube's embed
  // "stable volume" by boosting each track up to its −14 dB target via a Web
  // Audio makeup-gain injected into the cross-origin embed frame (the renderer
  // can't reach it; main can). Also carries the user's volume onto the element.
  ipcMain.handle('player:set-gain', (_event, value, build) => {
    if (win.isDestroyed()) return false;
    applyEmbedLoudness(win, value, build);
    return true;
  });

  ipcMain.handle('win:set-pin', (_event, pinned) => {
    const flag = !!pinned;
    if (!win.isDestroyed()) win.setAlwaysOnTop(flag);
    setWebAlwaysOnTop(flag);
    getStore().set('alwaysOnTop', flag);
    return flag;
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
