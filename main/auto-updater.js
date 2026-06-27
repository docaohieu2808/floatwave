// Auto-update via electron-updater + the GitHub releases provider. On launch
// (and every few hours) it checks the repo's latest release, downloads a newer
// build in the background, and streams status to the renderer's update toast;
// the user clicks "Restart & update" -> quitAndInstall (silent in-place + relaunch).
//
// electron-updater is CommonJS — under "type":"module" it's a default import we
// destructure. The real updater only runs in a PACKAGED build (a dev run has no
// app-update.yml and checkForUpdates would throw), so we no-op when not packaged.
import { app, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // re-check every 6 hours

let mainWin = null;

function send(payload) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update:status', payload);
}

// Network / parse failures must never surface — a missed check is silent.
function check() {
  autoUpdater.checkForUpdates().catch(() => {});
}

export function initAutoUpdater(win) {
  mainWin = win;

  // Renderer-driven controls. Safe to wire in any build: install no-ops when
  // nothing has been downloaded; check no-ops in dev (guarded below).
  ipcMain.handle('update:install', () => {
    // Silent in-place install + relaunch — the user already chose to update.
    autoUpdater.quitAndInstall(true, true);
  });
  ipcMain.handle('update:check', () => { check(); return true; });

  if (!app.isPackaged) return; // dev: no app-update.yml — skip the real updater

  autoUpdater.autoDownload = true;         // pull a newer build as soon as it's seen
  autoUpdater.autoInstallOnAppQuit = true; // ignored toast -> still updates on next quit

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info?.version }));
  autoUpdater.on('update-not-available', () => send({ state: 'none' }));
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round(p?.percent ?? 0) }));
  autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info?.version }));
  autoUpdater.on('error', (err) => send({ state: 'error', message: String(err?.message ?? err) }));

  setTimeout(check, 4000);               // let startup settle, then check once
  setInterval(check, CHECK_INTERVAL_MS); // and periodically while the app runs
}
