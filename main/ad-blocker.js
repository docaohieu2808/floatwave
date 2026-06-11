// Network-level ad/tracker blocking with uBO-style filter lists. uBlock
// Origin itself cannot run in Electron (the chrome.webRequest extension API
// isn't supported), so @ghostery/adblocker consumes the same EasyList/uBO
// lists through Electron's session.webRequest instead. Blocks ad/tracker
// REQUESTS; YouTube VIDEO ads stream from the same domains as the music and
// are handled separately by the auto-skipper in web-playback-backend.js.
import { app, session } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ElectronBlocker } from '@ghostery/adblocker-electron';

export async function initAdBlocker() {
  try {
    // filter lists are fetched once and cached; later launches load offline
    const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: path.join(app.getPath('userData'), 'adblock-engine.bin'),
      read: fs.readFile,
      write: fs.writeFile,
    });
    // Cosmetic filtering (CSS hiding + scriptlet injection) is what actually
    // kills YouTube's VIDEO ads — network filtering only blocks ad REQUESTS, and
    // YT video ads stream from the music domains. But cosmetic registers GLOBAL
    // ipcMain handlers that THROW if enabled for a 2nd session. So enable
    // cosmetic ONLY for the ytmusic session (web mode + backend — where ads
    // play), and network-only for the default session. Toggling the shared
    // config between the two enable() calls means the cosmetic handler is
    // registered exactly once → no "second handler" crash, ads still blocked.
    blocker.config.loadCosmeticFilters = true;
    blocker.enableBlockingInSession(session.fromPartition('persist:ytmusic'));
    blocker.config.loadCosmeticFilters = false; // default session: network only
    blocker.enableBlockingInSession(session.defaultSession);
    return true;
  } catch (err) {
    // first run offline / list endpoint down — the app must work without it
    console.error('ad-blocker init failed:', err?.message ?? err);
    return false;
  }
}
