// System-tray icon: the titlebar minimize button HIDES the window to the tray
// (no taskbar button) instead of minimizing to the taskbar. Clicking the tray
// icon — or "Show" in its menu — brings the window back; "Quit" exits the app.
import { app, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICON_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'floatwave.ico'
);

let tray = null;

export function initTray(win) {
  if (tray) return tray;

  const show = () => {
    if (!win || win.isDestroyed()) return;
    win.show(); // restores from the hidden (tray) state; keeps pin/alwaysOnTop
    win.focus();
  };

  tray = new Tray(nativeImage.createFromPath(ICON_PATH));
  tray.setToolTip('FloatWave — Stream video, float music');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show FloatWave', click: show },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  // single click (Windows) / double click both resurface the window
  tray.on('click', show);
  tray.on('double-click', show);

  // tray must be released before the app fully exits
  app.on('before-quit', () => {
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = null;
  });

  return tray;
}
