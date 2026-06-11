// Creates the single fixed-size frameless always-on-top mini-player window.
import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from './store-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Full mini-player vs focus mode (titlebar + controls only, player hidden)
const SIZES = {
  full: { width: 340, height: 420 },
  compact: { width: 340, height: 116 }, // titlebar 36 + controls 80
};

let mainWindow = null;
let lastPageUrl = null;

export function createMainWindow(pageUrl = lastPageUrl) {
  lastPageUrl = pageUrl;
  const size = getStore().get('focusMode') ? SIZES.compact : SIZES.full;
  mainWindow = new BrowserWindow({
    ...size,
    // Focus-mode resizing on a frameless Win10 window is a minefield:
    // resizable:false makes setSize unreliable, and outer-size math drifts by
    // the invisible thickFrame inset (~6px per toggle, measured). So: sizes
    // are CONTENT sizes (useContentSize + setContentSize = exact, inset-free),
    // resizable stays true for programmatic resize, and user drag-resizing is
    // blocked via the will-resize event instead of min/max clamps.
    useContentSize: true,
    title: 'FloatWave',
    // .ico = rounded, transparent-corner, multi-size — taskbar shows a proper
    // app tile, not a hard white square (the .png is a square card)
    icon: path.join(ROOT, 'assets', 'floatwave.ico'),
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    // pin state is a user preference (titlebar 📌), persisted across launches
    alwaysOnTop: !!getStore().get('alwaysOnTop'),
    // Opaque background — transparent:true flickers on Windows 10 (electron#22691)
    backgroundColor: '#ffffff', // matches the flat white Roon-light theme
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

  // resizable:true is only for setContentSize — the user must not drag-resize
  mainWindow.on('will-resize', (event) => event.preventDefault());

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

// Focus-mode toggle. Content size, not outer size — see the creation comment.
export function setCompactMode(compact) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const size = compact ? SIZES.compact : SIZES.full;
  mainWindow.setContentSize(size.width, size.height);
}
