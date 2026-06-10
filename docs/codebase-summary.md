# Codebase Summary

Plain Electron 41 mini-player: vanilla JS, no bundler, ~600 LOC split across main process (ESM), preload (CJS), and renderer (ESM).

## Architecture Overview

```
main process (ESM)               preload (CJS)               renderer (ESM)
├── main.js (lifecycle)          ├── contextBridge           ├── app.js (bootstrap)
├── window-manager.js            │   └── window.api.*        ├── player-controller.js (iframe)
├── ipc-handlers.js              └── allowlisted IPC         ├── queue-manager.js
├── youtube-search.js                                        ├── search-ui.js
├── local-server.js                                          ├── favorites-ui.js
└── store-manager.js                                         ├── error-handler.js
                                                             ├── ui-elements.js
                                                             └── format-utils.js
```

## Module Map

### Main Process

**main.js** — Entrypoint wiring only. Boots store, starts loopback server, creates window, registers IPC.

**window-manager.js** — BrowserWindow creation. Fixed 340×420 frameless, always-on-top, no-resize, dark bg (#0f0f0f). Security: contextIsolation=true, sandbox=true, nodeIntegration=false, preload enabled.

**ipc-handlers.js** — All IPC routes: `app:ping`, `win:minimize`, `win:close`, `search:youtube`, `store:get`, `store:set`, `app:open-external`. Guards: store keys checked against allowlist (STORE_KEYS Set); external URLs regex-checked (YouTube watch only).

**youtube-search.js** — `searchYouTube(query)` calls youtube-sr v4.3.12 (keyless search). Returns array of {id, title, channel, duration, thumbnail}. Errors return {error: message}.

**store-manager.js** — Thin electron-store v10 (ESM, main-only) wrapper. Keys: volume, repeat, queue, queueIndex, favorites. On error, returns empty defaults.

**local-server.js** — http.createServer on 127.0.0.1 random port. Serves index.html + static assets. Reason: YouTube IFrame API rejects file:// embeds (player errors 152/153). Returns page URL to main.js.

### Preload (CJS)

**preload.cjs** — CommonJS required under sandbox=true (ESM preload unsupported). contextBridge exposes:
- `window.api.search(query)` → ipcRenderer.invoke('search:youtube')
- `window.api.getStore(key)` → store:get
- `window.api.setStore(key, value)` → store:set
- `window.api.openExternal(url)` → app:open-external (YouTube-only regex check)
- `window.api.win.minimize()`, `window.api.win.close()` → window IPC

### Renderer (ESM + vanilla JS)

**app.js** — Bootstrap: wires all modules, hydrates persisted state (volume, repeat, queue, favorites), binds UI, boots player. Handles player events (statechange, tick, error) and syncs queue auto-advance, metadata, UI updates.

**player-controller.js** — Wraps YouTube IFrame Player API in isolated module. Exposes load(videoId, opts), play(), pause(), toggle(), seek(seconds), setVolume(0–100). Emits statechange, tick, error events. Provides getTimes() and getVideoData().

**queue-manager.js** — Track queue + playback state. Tracks currentIndex, repeat mode (off/one/all), auto-advance on ended. Persists queue snapshot on every change via callback.

**search-ui.js** — Renders search results in side panel. Calls window.api.search(), displays videos, handles click-to-queue.

**favorites-ui.js** — Heart toggle + persisted favorites list via store. Reads/writes store:favorites array.

**error-handler.js** — Maps player error codes (2, 5, 100, 101, 150) to user messages. Guards against infinite skip loops: max 3 consecutive auto-skips. Falls back to manual "Open on YouTube" button.

**ui-elements.js** — DOM element refs (getElementById). Helpers: setTrackInfo(), setTimes(), renderTrackList(), showPanel(), hidePanel(), etc. Rule: textContent-only (no .innerHTML).

**format-utils.js** — formatTime(seconds) → "M:SS" display.

## Data Flow

```
user input (search)           user input (play)
        ↓                             ↓
  search-ui.js              queue-manager.js
        ↓                             ↓
  window.api.search()        player-controller.js
        ↓                             ↓
 ipcRenderer.invoke     YouTube IFrame Player API
        ↓                             ↓
 ipcMain.handle             player event (statechange, error)
        ↓                             ↓
youtube-search (main)     error-handler.js / queue advance
        ↓                             ↓
    result → IPC           [persist + UI update]
        ↓
  [render in panel]
```

Persisted state: volume, repeat, queue, queueIndex, favorites. Stored via electron-store, restored on boot in app.js.

## Key Architectural Decisions (Locked)

**Loopback HTTP Server** — YouTube IFrame API rejects `file://` protocol; player errors 152/153. Solution: Node.js http server on 127.0.0.1:random port serves index.html + assets. Benefits: no CORS headers needed, localhost trust implicit, single-page flow.

**ESM Main + CJS Preload** — package.json `"type":"module"` for main.js and renderer (cleaner imports). Preload must be CommonJS because ESM preload is unsupported under sandbox=true. electron-store v10 is pure ESM; CJS preload cannot import it, so store lives in main and is accessed via IPC.

**Contextual Isolation + Sandbox + No Node** — Best practice: renderer has zero Node.js access. All system calls (store, search, open-external, window control) go through preload bridge, which validates inputs. window.api allowlist is exhaustive; nothing else is exposed.

**textContent-Only DOM Rendering** — No .innerHTML anywhere. All text via textContent to prevent XSS. videoId and search results are user-controlled but rendered safely.

**Error Masking for Player** — YouTube error codes 152/153 (embed blocked) are caught by loopback server test on launch; error codes 2/5/100/101/150 are caught by player.onError. Guard: max 3 auto-skips before fallback "queue stalled" message, preventing silent loops.

**Fixed Window + No Tray (v1)** — Always-on-top, frameless 340×420, non-resizable. Closing the window quits app (no background agent). Simplifies lifecycle; tray is out-of-scope for v1.

## Verification Commands

```bash
npm run check                      # JS syntax check all files
npm run dev                        # Launch with cdp debugging (port 9222)
node scripts/verify-app.cjs        # IPC smoke test (requires npm run dev in another terminal)
node scripts/e2e-playback-test.cjs # Live playback e2e over CDP
npm start                          # Production launch
```

Scripts invoke the app via Electron API or Node debugging protocol; they do not bundle or transpile.
