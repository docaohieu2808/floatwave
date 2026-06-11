// App entrypoint — lifecycle wiring only; window/IPC/store live in main/ modules.
import { app } from 'electron';
import { createMainWindow } from './main/window-manager.js';
import { registerIpc } from './main/ipc-handlers.js';
import { registerGlobalShortcuts } from './main/global-shortcuts.js';
import { initAdBlocker } from './main/ad-blocker.js';
import { getStore } from './main/store-manager.js';
import { startLocalServer } from './main/local-server.js';

// Audio must start without a user gesture: the embed-loudness Web Audio graph
// creates an AudioContext in the iframe via executeJavaScript (no gesture), and
// a gesture-gated context starts SUSPENDED — which silences all audio until the
// user pokes the volume slider. This switch makes contexts start running and
// lets media autoplay. Must be set before app is ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  getStore(); // ensure store file exists before renderer hydrates
  initAdBlocker(); // fire-and-forget — must never delay or break startup
  const pageUrl = await startLocalServer();
  const win = createMainWindow(pageUrl);
  registerIpc(win);
  registerGlobalShortcuts(win);
});

app.on('window-all-closed', () => {
  // Windows target: closing the mini-player quits the app (no tray in v1)
  app.quit();
});
