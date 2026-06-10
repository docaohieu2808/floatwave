// App entrypoint — lifecycle wiring only; window/IPC/store live in main/ modules.
import { app } from 'electron';
import { createMainWindow } from './main/window-manager.js';
import { registerIpc } from './main/ipc-handlers.js';
import { getStore } from './main/store-manager.js';
import { startLocalServer } from './main/local-server.js';

app.whenReady().then(async () => {
  getStore(); // ensure store file exists before renderer hydrates
  const pageUrl = await startLocalServer();
  const win = createMainWindow(pageUrl);
  registerIpc(win);
});

app.on('window-all-closed', () => {
  // Windows target: closing the mini-player quits the app (no tray in v1)
  app.quit();
});
