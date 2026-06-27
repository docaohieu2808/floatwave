// App entrypoint — lifecycle wiring only; window/IPC/store live in main/ modules.
import { app } from 'electron';
import { createMainWindow, getMainWindow } from './main/window-manager.js';
import { registerIpc } from './main/ipc-handlers.js';
import { registerGlobalShortcuts } from './main/global-shortcuts.js';
import { initAdBlocker } from './main/ad-blocker.js';
import { initTray } from './main/tray-manager.js';
import { getStore } from './main/store-manager.js';
import { startLocalServer } from './main/local-server.js';
import { initAutoUpdater } from './main/auto-updater.js';

// Audio must start without a user gesture: the embed-loudness Web Audio graph
// creates an AudioContext in the iframe via executeJavaScript (no gesture), and
// a gesture-gated context starts SUSPENDED — which silences all audio until the
// user pokes the volume slider. This switch makes contexts start running and
// lets media autoplay. Must be set before app is ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Windows black-chrome glitch (rare): Chromium's native window-occlusion
// detection sometimes wrongly marks this frameless always-on-top window as
// occluded — on a focus change, or when another window briefly overlaps — and
// stops compositing the PAGE surface, so the title/search/control bars render
// solid BLACK while the video (on its own hardware overlay) keeps showing.
// Disabling the occlusion calculation is the documented fix. Before app ready.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// ...and that switch wasn't enough. On some GPUs the video gets promoted to a
// hardware overlay plane while the window's own frameless surface stops
// compositing, leaving the title/search/control bars solid BLACK even while the
// video keeps playing (persistent, not just a flash). Compositing the WHOLE
// window in software — one path, no hardware overlays — makes that class of
// glitch impossible. Trade-off: video decodes on the CPU, which is fine for a
// mostly-music mini-player. Must be set before app is ready.
app.disableHardwareAcceleration();

// Single instance: relaunching the exe (common when it's hidden in the tray)
// must surface the existing window instead of spawning a second FloatWave.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible()) win.show(); // was hidden to the tray
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    getStore(); // ensure store file exists before renderer hydrates
    initAdBlocker(); // fire-and-forget — must never delay or break startup
    const pageUrl = await startLocalServer();
    const win = createMainWindow(pageUrl);
    registerIpc(win);
    registerGlobalShortcuts(win);
    initTray(win); // minimize hides to the tray; tray icon restores
    initAutoUpdater(win); // background check/download of newer GitHub releases
  });

  app.on('window-all-closed', () => {
    // The mini-player's X button quits. (Minimize HIDES to tray — that doesn't
    // close the window, so this won't fire and the app keeps running in the tray.)
    app.quit();
  });
}
