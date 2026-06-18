// Creates the single fixed-size frameless always-on-top mini-player window.
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from './store-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Full mini-player vs focus mode (titlebar + controls only, player hidden)
const SIZES = {
  full: { width: 340, height: 420 }, // default normal size (first launch)
  compact: { width: 340, height: 116 }, // titlebar 36 + controls 80
};
// Floor for free drag-resize. Kept BELOW the compact content height so focus
// mode's setContentSize is never clamped by it.
const MIN = { width: 300, height: 110 };
// Non-video chrome rows (titlebar 36 + search 44 + controls 80). Excluded from
// the 16:9 aspect lock so the VIDEO area — not the whole window — keeps ratio.
const CHROME_H = 36 + 44 + 80;

let mainWindow = null;
let lastPageUrl = null;
let isCompact = false; // true while in focus mode (compact bar)
let normalSize = { ...SIZES.full }; // last non-compact size, restored on focus exit
let persistTimer = null;
let programmaticResize = false; // true only while WE setContentSize (focus/reset/grip)

export function createMainWindow(pageUrl = lastPageUrl) {
  lastPageUrl = pageUrl;
  const store = getStore();
  isCompact = !!store.get('focusMode');
  // restore the user's last free-resized size (default = full on first launch)
  const saved = store.get('windowSize');
  normalSize =
    saved && saved.width && saved.height
      ? { width: saved.width, height: saved.height }
      : { ...SIZES.full };
  const size = isCompact ? SIZES.compact : normalSize;
  mainWindow = new BrowserWindow({
    ...size,
    // Sizes are CONTENT sizes (useContentSize + setContentSize = exact, free of
    // the frameless Win10 thickFrame inset that makes outer-size math drift).
    // The window is freely user-resizable (drag any edge); focus mode just
    // toggles between the compact bar and the remembered normal size.
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

  // Floor so a resize can't collapse the layout. Below the compact height so
  // focus mode's setContentSize is never clamped.
  mainWindow.setMinimumSize(MIN.width, MIN.height);

  // setAspectRatio is ignored on frameless Windows windows, and native edge drag
  // would stretch the video flat. So block ALL native resizing and resize ONLY
  // through the bottom-right grip (win:resize-video → setContentSize, locked to
  // 16:9). Our own programmatic setContentSize is allowed via the flag.
  mainWindow.on('will-resize', (event) => {
    if (!programmaticResize) event.preventDefault();
  });

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

// Programmatic content-resize that the will-resize guard lets through.
function applyContentSize(width, height) {
  programmaticResize = true;
  mainWindow.setContentSize(width, height);
  setImmediate(() => {
    programmaticResize = false;
  });
}

function persistNormalSize() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) getStore().set('windowSize', normalSize);
  }, 400);
}

// Focus-mode toggle: collapse to the compact bar and back to the user's
// remembered normal size. Content sizes, not outer — see the creation comment.
export function setCompactMode(compact) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (compact) {
    if (!isCompact) {
      // capture the current size so exiting focus restores exactly this
      const [width, height] = mainWindow.getContentSize();
      normalSize = { width, height };
      getStore().set('windowSize', normalSize);
    }
    isCompact = true;
    applyContentSize(SIZES.compact.width, SIZES.compact.height);
  } else {
    isCompact = false;
    applyContentSize(normalSize.width, normalSize.height);
  }
}

// Snap back to the default mini-player size (340×420), exiting focus mode and
// making that the new remembered size. Wired to the titlebar's reset button.
export function resetSize() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isCompact = false;
  normalSize = { ...SIZES.full };
  getStore().set('windowSize', normalSize);
  getStore().set('focusMode', false);
  applyContentSize(SIZES.full.width, SIZES.full.height);
}

// Corner-grip resize (driven by the renderer): caller passes the desired content
// WIDTH; height is derived so the video area stays 16:9. Clamped to the work area
// so it can't grow off-screen. anchorRight=true (bottom-LEFT grip) keeps the
// top-right corner fixed and grows leftward; otherwise the top-left stays put.
// No-op in focus mode.
export function resizeVideo(width, anchorRight = false) {
  if (!mainWindow || mainWindow.isDestroyed() || isCompact) return;
  const area = screen.getPrimaryDisplay().workAreaSize;
  const maxByHeight = ((area.height - CHROME_H) * 16) / 9;
  const w = Math.round(Math.max(MIN.width, Math.min(Number(width) || 0, area.width, maxByHeight)));
  const h = Math.round((w * 9) / 16 + CHROME_H);
  if (anchorRight) {
    const b = mainWindow.getContentBounds();
    const right = b.x + b.width; // pin the right edge; left edge follows the cursor
    programmaticResize = true;
    mainWindow.setContentBounds({ x: Math.round(right - w), y: b.y, width: w, height: h });
    setImmediate(() => {
      programmaticResize = false;
    });
  } else {
    applyContentSize(w, h); // top-left anchored, grows right + down
  }
  normalSize = { width: w, height: h };
  persistNormalSize();
}
