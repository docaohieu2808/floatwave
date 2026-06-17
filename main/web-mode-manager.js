// Embedded music.youtube.com mode — a SEPARATE always-on-top window with a
// native frame, toggled show/hide against the mini-player window. A second
// window avoids Windows frameless-resize quirks entirely (setSize is
// unreliable on non-resizable frameless windows; toggling resizable shifts
// thickFrame insets). The window + its persist: session stay alive across
// toggles so Google login and playback position survive.
import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from './store-manager.js';

const APP_ICON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'floatwave.ico');
const WEB_SIZE = { width: 960, height: 640 };

// In-page ad killer for the YT Music window — runs in BOTH web mode (visible,
// user-facing) and the hidden backend. The network ad-blocker can't stop video
// ads (same domains as music); this 500ms in-page loop mutes an ad the instant
// it appears, fast-forwards it, and clicks Skip, then restores audio. Survives
// the SPA's internal navigation; re-injected on full reloads (guard prevents
// duplicate intervals within one document).
const AD_SKIPPER_JS = `(() => {
  if (window.__fwAdSkip) return;
  let mutedByAd = false;
  window.__fwAdSkip = setInterval(() => {
    const v = document.querySelector('video');
    if (!v) return;
    if (document.querySelector('.ad-showing, .ytp-ad-player-overlay')) {
      if (!v.muted) { v.muted = true; mutedByAd = true; }
      if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
      document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern')?.click();
    } else if (mutedByAd && v.muted) {
      v.muted = false; mutedByAd = false;
    }
  }, 500);
})()`;
// Google blocks sign-in from Electron-flavored user agents — present plain Chrome
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

let webWindow = null;
let miniWindow = null;
// web-playback-backend installs this: true while the HIDDEN window is the
// active audio backend — exiting web mode must then NOT pause the video.
let playbackGuard = () => false;

export function setPlaybackGuard(fn) {
  playbackGuard = fn;
}

// ---------- Idle reclaim of the hidden music.youtube.com window ----------
// That window costs ~145MB. When it is NEITHER showing (web mode) NOR playing
// audio (backend B), free it after a grace period and recreate on demand:
//   - login + disk cache survive via the persist:ytmusic partition, and
//   - the network ad-blocker is bound to that SESSION, not the window,
// so reclaiming then recreating loses neither (ad-skippers re-arm per load).
// The grace window is well above a track-to-track gap, so back-to-back
// backend-B songs keep the window warm exactly like before — only a genuinely
// unused window is released.
const IDLE_FREE_MS = 60000; // must exceed any normal gap between backend-B tracks
const IDLE_CHECK_MS = 15000;
let idleSince = null; // ms timestamp the window went idle, or null
let idleMonitor = null; // single low-frequency interval
let freeingIdle = false; // true only while WE destroy the idle window

function webWindowIdle() {
  return (
    !!webWindow &&
    !webWindow.isDestroyed() &&
    !webWindow.isVisible() && // not in web mode
    !playbackGuard() // backend B is not the active audio
  );
}

function startIdleMonitor() {
  if (idleMonitor) return;
  idleMonitor = setInterval(() => {
    if (!webWindowIdle()) {
      idleSince = null; // gone, shown, or playing — keep it alive
      return;
    }
    if (idleSince === null) {
      idleSince = Date.now(); // start the clock
      return;
    }
    if (Date.now() - idleSince < IDLE_FREE_MS) return; // not idle long enough yet
    idleSince = null;
    freeingIdle = true;
    webWindow.destroy(); // 'closed' clears the ref; freeingIdle skips the resurface
  }, IDLE_CHECK_MS);
}

function pauseWebPlayback() {
  webWindow?.webContents
    .executeJavaScript('document.querySelector("video")?.pause()', true)
    .catch(() => {});
}

// The window without showing it — web-playback-backend plays through it hidden.
export function ensureWebWindow(miniWin) {
  return getWebWindow(miniWin);
}

export function getExistingWebWindow() {
  return webWindow && !webWindow.isDestroyed() ? webWindow : null;
}

function getWebWindow(miniWin) {
  if (webWindow && !webWindow.isDestroyed()) return webWindow;
  miniWindow = miniWin;

  webWindow = new BrowserWindow({
    width: WEB_SIZE.width,
    height: WEB_SIZE.height,
    title: 'FloatWave — YouTube Music',
    icon: APP_ICON,
    alwaysOnTop: !!getStore().get('alwaysOnTop'), // follows the 📌 preference
    autoHideMenuBar: true,
    backgroundColor: '#0f0f0f',
    show: false,
    webPreferences: {
      partition: 'persist:ytmusic', // login survives app restarts
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // hidden-backend playback: polling + media must keep running unthrottled
      backgroundThrottling: false,
    },
  });

  const session = webWindow.webContents.session;
  session.setUserAgent(CHROME_UA);
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  // target=_blank links inside YT Music go to the system browser, never new windows
  webWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  webWindow.webContents.loadURL('https://music.youtube.com');
  // arm the in-page ad killer on every full page load
  webWindow.webContents.on('did-finish-load', () => {
    webWindow?.webContents.executeJavaScript(AD_SKIPPER_JS, true).catch(() => {});
  });

  // Closing the web window = back to mini mode (window survives, hidden)
  webWindow.on('close', (event) => {
    event.preventDefault();
    exitWebMode(miniWindow);
  });
  // Destroyed externally (devtools, crash) OR by our idle reclaim — drop the ref.
  webWindow.on('closed', () => {
    webWindow = null;
    // Idle reclaim: we deliberately freed an unused HIDDEN window — the mini
    // player is already the live UI, so do NOT show()/resync it (that would
    // yank it out of the tray). Only an external death should resurface mini.
    if (freeingIdle) {
      freeingIdle = false;
      return;
    }
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.show();
      miniWindow.webContents.send('mode:exited');
    }
  });
  // Mini window closed = app quitting → release the web window for real
  miniWin.once('closed', () => {
    clearInterval(idleMonitor);
    idleMonitor = null;
    webWindow?.destroy();
    webWindow = null;
  });

  idleSince = null; // fresh window: clear any stale idle countdown
  startIdleMonitor(); // begin watching this window for reclaim eligibility
  return webWindow;
}

// Pin toggle applies to whichever window exists (mini handled by ipc-handlers)
export function setWebAlwaysOnTop(flag) {
  if (webWindow && !webWindow.isDestroyed()) webWindow.setAlwaysOnTop(flag);
}

// Web mode owns playback while its window is showing — global hotkeys are
// routed here instead of the (hidden, paused) mini player.
export function isWebModeActive() {
  return !!webWindow && !webWindow.isDestroyed() && webWindow.isVisible();
}

// Drive music.youtube.com playback from global hotkeys. play/pause goes
// through the <video> element (stable); next/prev click the player-bar
// buttons (ytmusic class names — stable for years, but YouTube-owned).
const WEB_MEDIA_JS = {
  'play-pause':
    "(() => { const v = document.querySelector('video'); if (v) v.paused ? v.play() : v.pause(); })()",
  next: "document.querySelector('ytmusic-player-bar .next-button')?.click()",
  prev: "document.querySelector('ytmusic-player-bar .previous-button')?.click()",
};

export function sendWebMediaCommand(action) {
  const js = WEB_MEDIA_JS[action];
  if (!js || !isWebModeActive()) return;
  webWindow.webContents.executeJavaScript(js, true).catch(() => {});
}

export function enterWebMode(miniWin) {
  if (!miniWin || miniWin.isDestroyed()) return;
  const win = getWebWindow(miniWin);
  win.show();
  miniWin.hide();
}

export function exitWebMode(miniWin) {
  if (!webWindow) return;
  // closing the visible window must not silence the hidden audio backend
  if (!playbackGuard()) pauseWebPlayback();
  webWindow.hide();
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.show();
    // user may have toggled from the web window's own X button — let the
    // renderer resync its mode button state
    miniWin.webContents.send('mode:exited');
  }
}
