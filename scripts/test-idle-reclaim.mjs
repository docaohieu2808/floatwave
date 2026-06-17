// Throwaway runtime test for the hidden-window idle reclaim (web-mode-manager).
// Exercises the REAL module — no UI, no need for an actual embed-blocked song:
//   1. mini window starts HIDDEN (simulates minimized-to-tray)
//   2. ensureWebWindow() creates the hidden music.youtube.com window (what
//      backend B does for a blocked track)
//   3. playbackGuard = () => false  → backend B is "idle", window eligible
//   4. wait — production reclaims at 60s idle (monitor ticks every 15s, so the
//      window should be destroyed around t=75s)
// PASS = web window gets freed AND the (hidden) mini stays hidden, i.e. the
// freeingIdle guard kept the reclaim from yanking mini out of the tray.
//
// Run:  npx electron scripts/test-idle-reclaim.mjs   (close the real app first)
import { app, BrowserWindow } from 'electron';
import {
  ensureWebWindow, getExistingWebWindow, setPlaybackGuard,
} from '../main/web-mode-manager.js';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const log = (...a) => console.log('[idle-test]', ...a);

app.whenReady().then(async () => {
  const mini = new BrowserWindow({ width: 340, height: 420, show: false });
  await mini.loadURL('data:text/html,<h1>mini</h1>');
  mini.hide(); // minimized-to-tray state
  log('mini created — visible:', mini.isVisible());

  setPlaybackGuard(() => false); // backend B not the active audio → reclaim-eligible

  const web = ensureWebWindow(mini); // create hidden web window, like backend B
  log('web window created — exists:', !!getExistingWebWindow(), 'visible:', web.isVisible());

  let reclaimed = false;
  web.on('closed', () => { reclaimed = true; log('>>> web window CLOSED (reclaimed) <<<'); });

  const start = Date.now();
  const iv = setInterval(() => {
    const secs = Math.round((Date.now() - start) / 1000);
    log(`t=${secs}s  webWindowExists=${!!getExistingWebWindow()}  miniVisible=${mini.isVisible()}`);
    if (reclaimed || secs >= 100) {
      clearInterval(iv);
      const miniStillHidden = !mini.isVisible();
      log('================ RESULT ================');
      log('web window reclaimed :', reclaimed);
      log('mini still hidden    :', miniStillHidden, '(false = BUG: yanked out of tray)');
      log(reclaimed && miniStillHidden ? 'PASS ✅' : 'FAIL ❌');
      log('========================================');
      setTimeout(() => process.exit(0), 200);
    }
  }, 5000);

  // hard safety net
  setTimeout(() => { log('watchdog exit'); process.exit(2); }, 120000);
});
