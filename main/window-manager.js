// Creates the single fixed-size frameless always-on-top mini-player window.
import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let mainWindow = null;
let lastPageUrl = null;

export function createMainWindow(pageUrl = lastPageUrl) {
  lastPageUrl = pageUrl;
  mainWindow = new BrowserWindow({
    width: 340,
    height: 420,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    // Opaque background — transparent:true flickers on Windows 10 (electron#22691)
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(ROOT, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Embed links (YouTube logo, share…) must never spawn child windows that
  // would inherit this window's preload bridge; external opening goes through
  // the validated app:open-external IPC instead.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== pageUrl) event.preventDefault();
  });
  // The YouTube iframe gets no device/notification permissions
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  );

  mainWindow.setMenuBarVisibility(false);
  // Served over the loopback http origin — YouTube rejects file:// embeds
  // (player errors 152/153), so loading the html file directly won't work.
  mainWindow.loadURL(pageUrl);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

export function getMainWindow() {
  return mainWindow;
}
