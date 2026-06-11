// System-wide media hotkeys: hardware media keys + Ctrl+Alt combos work while
// the app is unfocused (the whole point of a coder's mini-player). Actions go
// to whichever side owns playback: the web-mode window when it's showing
// (registering media keys preempts Chromium's MediaSession there), otherwise
// the mini-player renderer over the 'hotkey' channel.
import { app, globalShortcut } from 'electron';
import { isWebModeActive, sendWebMediaCommand } from './web-mode-manager.js';

const BINDINGS = [
  ['MediaPlayPause', 'play-pause'],
  ['MediaNextTrack', 'next'],
  ['MediaPreviousTrack', 'prev'],
  ['Control+Alt+Space', 'play-pause'],
  ['Control+Alt+Right', 'next'],
  ['Control+Alt+Left', 'prev'],
];

export function registerGlobalShortcuts(win) {
  for (const [accelerator, action] of BINDINGS) {
    try {
      // register() returns false when another app owns the key — fine, skip
      globalShortcut.register(accelerator, () => {
        if (isWebModeActive()) sendWebMediaCommand(action);
        else if (!win.isDestroyed()) win.webContents.send('hotkey', action);
      });
    } catch {
      // invalid accelerator on this platform — never fatal for the app
    }
  }
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
