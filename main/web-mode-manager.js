// Embedded music.youtube.com mode — a SEPARATE always-on-top window with a
// native frame, toggled show/hide against the mini-player window. A second
// window avoids Windows frameless-resize quirks entirely (setSize is
// unreliable on non-resizable frameless windows; toggling resizable shifts
// thickFrame insets). The window + its persist: session stay alive across
// toggles so Google login and playback position survive.
import { BrowserWindow, shell } from 'electron';

const WEB_SIZE = { width: 960, height: 640 };
// Google blocks sign-in from Electron-flavored user agents — present plain Chrome
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

let webWindow = null;
let miniWindow = null;

function pauseWebPlayback() {
  webWindow?.webContents
    .executeJavaScript('document.querySelector("video")?.pause()', true)
    .catch(() => {});
}

function getWebWindow(miniWin) {
  if (webWindow && !webWindow.isDestroyed()) return webWindow;
  miniWindow = miniWin;

  webWindow = new BrowserWindow({
    width: WEB_SIZE.width,
    height: WEB_SIZE.height,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f0f',
    show: false,
    webPreferences: {
      partition: 'persist:ytmusic', // login survives app restarts
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
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

  // Closing the web window = back to mini mode (window survives, hidden)
  webWindow.on('close', (event) => {
    event.preventDefault();
    exitWebMode(miniWindow);
  });
  // Destroyed externally (devtools, crash) — drop the ref and resurface mini
  webWindow.on('closed', () => {
    webWindow = null;
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.show();
      miniWindow.webContents.send('mode:exited');
    }
  });
  // Mini window closed = app quitting → release the web window for real
  miniWin.once('closed', () => {
    webWindow?.destroy();
    webWindow = null;
  });

  return webWindow;
}

export function enterWebMode(miniWin) {
  if (!miniWin || miniWin.isDestroyed()) return;
  const win = getWebWindow(miniWin);
  win.show();
  miniWin.hide();
}

export function exitWebMode(miniWin) {
  if (!webWindow) return;
  pauseWebPlayback();
  webWindow.hide();
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.show();
    // user may have toggled from the web window's own X button — let the
    // renderer resync its mode button state
    miniWin.webContents.send('mode:exited');
  }
}
