# Codebase Summary

**FloatWave** ("Stream video, float music") — plain Electron 41 mini-player: vanilla JS, no bundler, split across main process (ESM), preload (CJS), and renderer (ESM). Logo at `assets/floatwave.png` (square card, used by the splash/favicon via CSS rounding); `assets/floatwave.ico` is the rounded, transparent-corner, multi-size taskbar/window icon (generated from the png).

## Architecture Overview

```
main process (ESM)               preload (CJS)               renderer (ESM)
├── main.js (lifecycle)          ├── contextBridge           ├── app.js (bootstrap)
├── window-manager.js            │   └── window.api.*        ├── player-controller.js (iframe)
├── ipc-handlers.js              └── allowlisted IPC         ├── queue-manager.js
├── youtube-search.js                                        ├── playback-router.js
├── web-mode-manager.js                                      ├── search-ui.js
├── web-playback-backend.js                                  ├── favorites-ui.js
├── global-shortcuts.js                                      ├── error-handler.js
├── ad-blocker.js                                            ├── focus-mode.js
├── embed-loudness.js                                        ├── track-scoring.js
├── local-server.js                                          ├── playlists-ui.js
├── store-manager.js                                         ├── radio-autoplay.js
                                                             ├── ui-elements.js
                                                             └── format-utils.js
```

## Module Map

### Main Process

**main.js** — Entrypoint wiring only. Sets `autoplay-policy=no-user-gesture-required` (so AudioContexts/media start without a gesture). Enforces a SINGLE INSTANCE (`requestSingleInstanceLock`): a second launch (common when the app is hidden in the tray) surfaces the existing window via `second-instance` → show/restore/focus, instead of opening another FloatWave. Then boots store, ad-blocker, loopback server, window, IPC, global shortcuts, and the system tray.

**tray-manager.js** — System-tray icon (floatwave.ico). The titlebar minimize button hides the window to the tray (`win.hide()` — no taskbar button) instead of minimizing to the taskbar; clicking the tray icon or its "Show" menu item calls `win.show()` to bring it back (pin/size preserved); "Quit" exits. Tray destroyed on `before-quit`.

**window-manager.js** — BrowserWindow creation & management. Default 340×420 frameless, dark bg (#0f0f0f). Always-on-top is a persisted user preference (store key `alwaysOnTop`, default false) toggled by the titlebar 📌 via `win:set-pin` IPC — applies to both mini and web windows. Focus mode (store key `focusMode`) collapses to 340×116 (titlebar + controls only) using `useContentSize=true` + `setContentSize` with will-resize event blocking (prevents Win10 frameless resize drift). Security: contextIsolation=true, sandbox=true, nodeIntegration=false, preload enabled.

**ipc-handlers.js** — All IPC routes: `app:ping`, `win:minimize`, `win:close`, `win:set-pin`, `win:set-compact`, `search:youtube`, `search:alternative`, `radio:up-next`, `store:get`, `store:set`, `app:open-external`, `mode:set`, `player:set-gain`, `webplay:load/control/stop`. Guards: store keys checked against allowlist (STORE_KEYS Set); external URLs regex-checked (YouTube watch only). `player:set-gain` → embed-loudness.js (renderer re-applies on every PLAYING + volume change). `win:set-compact` calls window-manager.setCompactMode() + persists `focusMode`. Also inits the web-playback backend + sets web-mode's playbackGuard.

**embed-loudness.js** — Matches the embed's loudness to the louder web backend. The YouTube embed applies "stable volume" (attenuates tracks above its −14 dB target, never lifts quieter ones → soft masters stay soft); real music.youtube.com normalizes everything up. Reads each track's `getPlayerResponse().playerConfig.audioConfig.loudnessDb` inside the embed frame, routes the `<video>` through a Web Audio makeup-gain (`10^(-loudnessDb/20)`, clamped 1..3.5) + limiter, lifting every track to target. Injected via `framesInSubtree` executeJavaScript. FAIL-SAFE against silence: `createMediaElementSource` reroutes element audio into the graph, and a context not unlocked by a REAL user gesture outputs nothing (the play button lives in the parent frame, so its gesture never unlocks this cross-origin frame). So the graph is built ONLY on an explicit volume interaction (`applyElementGain(true)` from the slider's `input` handler — a gesture that does unlock audio); boot/PLAYING calls pass `build=false` and just set `v.volume`, leaving the element's own (audible) output. Result: playback is never silent on play; loudness engages after the first volume touch and persists for the session.

**youtube-search.js** — `searchYouTube(query, mode='music')` via youtubei.js (one library, lazy Innertube singleton): mode `music` = `yt.music.search(q, {type:'song'})` → songs (artist/album), but Art Tracks (audio + square album art, no real video); mode `video` = `yt.search(q, {type:'video'})` → real video uploads (filtered to 11-char video ids). Music mode falls back to video search if the song path returns nothing. (youtube-sr was removed — it crashed on YouTube format changes, "undefined browseId".) Returns array of {id, title, channel, duration, thumbnail}. Errors return {ok:false, error}. `getSuggestions(query)` powers search-as-you-type via the YT MUSIC suggestion endpoint (`music.getSearchSuggestions`) — chosen over the legacy `complete/search` one because that mangles some UTF-8 (e.g. "â" → U+FFFD); returns up to 10 deduped query strings + real song titles.

**web-mode-manager.js** — Embedded music.youtube.com mode: a SECOND always-on-top BrowserWindow (native frame, 960×640) toggled show/hide against the mini window via IPC `mode:set`. An in-page ad killer (`AD_SKIPPER_JS`, re-armed on every `did-finish-load`) runs a 500ms loop INSIDE this window for BOTH web mode and the hidden backend — mutes an ad the moment it appears, fast-forwards it, clicks Skip, restores audio after (the network ad-blocker can't stop same-domain video ads). Separate window avoids Windows frameless setSize/resizable quirks. Session `persist:ytmusic` keeps Google login across restarts; Chrome UA spoof (Google blocks Electron UA sign-in); permission requests denied; popups → shell.openExternal; backgroundThrottling disabled (hidden-backend playback). Closing the web window (X) hides it, pauses its `<video>` UNLESS web-playback-backend is active (playbackGuard), reshows mini, emits `mode:exited`. Exports `ensureWebWindow`/`getExistingWebWindow` for the backend.

**web-playback-backend.js** — Backend B: plays embed-blocked tracks through the REAL music.youtube.com in the hidden web window (embedding is blocked; youtube.com isn't). Navigates to `watch?v=`, polls the `<video>` 1×/s via executeJavaScript → streams `webplay:status` {t,d,paused} to the mini renderer; detects end (video ended OR YT Music auto-advanced to a different vid) → `{ended:true}` so the mini queue advances. Transport IPC `webplay:load/control/stop` (play/pause/toggle/seek/volume); pins element volume to the mini slider; nudges paused-at-0 playback (≤6 tries). Ad handling: the 500ms poll detects `.ad-showing`/`.ytp-ad-player-overlay` (ad-ACTIVE markers only — never persistent containers) → MUTES the element immediately (no ad audio leaks), fast-forwards to the ad's end, clicks Skip; the next non-ad poll un-mutes back to the user volume. backgroundThrottling:false keeps the never-shown window playing (it also pins page visibilityState to 'visible' — that's what convinces YT Music).

**store-manager.js** — Thin electron-store v10 (ESM, main-only) wrapper. Keys: volume, repeat, queue, queueIndex, favorites, alwaysOnTop, focusMode, searchHistory, trackStats. On error, returns empty defaults.

**global-shortcuts.js** — System-wide hotkey registration via `globalShortcut`. Binds MediaPlayPause/Next/Prev (media keys) and Ctrl+Alt+Space/Right/Left. Routes to whichever side owns playback: web-mode window showing → `sendWebMediaCommand` (drives music.youtube.com's `<video>`/player-bar buttons via executeJavaScript), else `hotkey` IPC to the mini renderer. Unregisters all shortcuts on app quit.

**ad-blocker.js** — Network-level ad/tracker blocking via @ghostery/adblocker-electron (uBlock Origin itself can't run in Electron — no chrome.webRequest for extensions; this engine consumes the same EasyList/uBO filter lists through session.webRequest). Armed on both the `persist:ytmusic` partition (web mode + hidden backend) and the default session (mini embed). Cosmetic filtering (CSS hiding + scriptlet injection — what actually kills YouTube's VIDEO ads, since they stream from the music domains) is enabled for the `persist:ytmusic` session only; the default session gets network-only. Cosmetic registers GLOBAL ipcMain handlers that throw ("second handler") if enabled for two sessions, so `config.loadCosmeticFilters` is toggled true→false between the two `enableBlockingInSession` calls (registered exactly once). Without cosmetic on ytmusic, web mode leaked ~1-2s of ads (it has no in-player skipper — only backend B does). Lists fetched once, cached in userData (`adblock-engine.bin`); init failure is non-fatal. YouTube VIDEO ads stream from the music domains and are instead killed by the auto-skipper inside web-playback-backend's poll (detect `.ad-showing` → fast-forward + click Skip; ad status gates ended-detection and ticks).

**local-server.js** — http.createServer on 127.0.0.1 random port. Serves index.html + static assets. Reason: YouTube IFrame API rejects file:// embeds (player errors 152/153). Returns page URL to main.js.

### Preload (CJS)

**preload.cjs** — CommonJS required under sandbox=true (ESM preload unsupported). contextBridge exposes:
- `window.api.search(query)` → ipcRenderer.invoke('search:youtube')
- `window.api.getStore(key)` → store:get
- `window.api.setStore(key, value)` → store:set
- `window.api.openExternal(url)` → app:open-external (YouTube-only regex check)
- `window.api.setMode('web'|'mini')` → mode:set (web-mode-manager toggle)
- `window.api.onModeExited(cb)` ← mode:exited push event (♪ button resync)
- `window.api.win.minimize()`, `window.api.win.close()` → window IPC

### Renderer (ESM + vanilla JS)

**app.js** — Bootstrap: wires all modules, hydrates persisted state (volume, repeat, queue, favorites), binds UI, boots player. Handles player events (statechange, tick, error) and syncs queue auto-advance, metadata, UI updates.

**player-controller.js** — Wraps YouTube IFrame Player API in isolated module. Exposes load(videoId, opts), play(), pause(), toggle(), seek(seconds), setVolume(0–100). Emits statechange, tick, error events. Provides getTimes() and getVideoData().

**queue-manager.js** — Track queue + playback state. Tracks currentIndex, repeat mode (off/one/all), auto-advance on ended. `moveTrack(from, to)` for drag-and-drop reorder (renderer-only, fixes the current-track pointer). Persists queue snapshot on every change via callback.

**search-ui.js** — Renders search results in side panel. Calls window.api.search(query, mode), displays results, handles click-to-queue. Music ⇄ Video mode toggle (🎵/🎬 button left of the input, store key `searchMode`): Music = YT Music songs (clean artist/album, but mostly Art Tracks = audio + square album art, no real video); Video = real YouTube video uploads (MV/lyric/live) that play actual 16:9 video in the embed. Toggling re-runs the active query. Dropdown below the input: when EMPTY → recent searches (last 10, store key `searchHistory`, each row has a ✕ remove); when TYPING → live search suggestions (debounced ~220ms via `search:suggest`). Shared `dropdownRow(icon,text,onPick,onRemove)` builds both; stale async suggestions are ignored if the box changed.

**favorites-ui.js** — Heart toggle + persisted favorites list via store. Reads/writes store:favorites array. Drag & drop reorder (persisted).

**error-handler.js** — Maps player error codes (2, 5, 100, 101, 150) to user messages. Embed-disabled tracks (101/150 — label/ATV "song" versions error AT PLAY TIME even though oEmbed/WEB_EMBEDDED playability APIs report OK) route the EXACT same video to backend B (`playback-router.forceWeb` → hidden music.youtube.com; only embedding is blocked, youtube.com always plays it). It deliberately does NOT search for other uploads — a general search can substitute a cover/tutorial/compilation (wrong song), and backend B already plays the real track. Genuinely dead videos (2/5/100) can't be rescued by the web backend either, so they auto-skip (max 3 consecutive) with "Open on YouTube" fallback. Guards: skip timer cancelled on manual navigation; skip counter resets when a failure starts a fresh episode (>10s since the previous one) so a past stuck song can't dead-end a new pick.

**playback-router.js** — Dual-backend façade exposing player-controller's exact API (queue/UI/scoring import THIS, never a backend directly). Backend A = iframe embed (default). Backend B = hidden music.youtube.com window for embed-disabled tracks (store key `webOnlyIds`, set via `forceWeb()` from error-handler; persisted so future plays route straight there — no re-error). Translates the main-side `webplay:status` stream into the same tick/statechange events; transport (play/pause/seek/volume) routes by mode. Boot-restored web tracks are cued, not auto-started (no surprise audio from a hidden window). Backend B has no visible video in the mini window, so app.js fills the player area with the track artwork (`#web-art`: blurred cover backdrop + centered art + "Playing via YouTube Music" caption) via `isWebPlayback()`; hidden whenever the iframe owns playback.

**focus-mode.js** — Compact view toggle. Titlebar button triggers `window.api.win.setCompact(bool)` IPC → window-manager resizes to 340×116 content (titlebar + controls only; search + player display:none'd via `body.focus-mode`). Persisted in store key `focusMode`; window is created at the matching size on boot.

**track-scoring.js** — Tracks listening behavior per-track: plays (ended or ≥80% listened), skips (≤30s), early-skips (≤10s), dislikes. Stored under store key `trackStats` (pruned to 500 by last-touched, pagehide flush). `rankUpNext(tracks)` re-ranks radio candidates: disliked + score ≤ −5 dropped, liked tracks/artists boosted, InnerTube order as tiebreak. `noteTrackChange(track)` called from app.js on every track change; `toggleDisliked(track)` backs the 👎 button (app.js controls row: mark + skip).

**playlists-ui.js** — User-created playlists persisted under store key `playlists` ([{name, tracks[]}]). Row `+` buttons (search results, favorites) open an "Add to…" chooser overlay: current queue / existing playlist / create-new-by-name. Playlists panel tab: list view (✕ delete, drag to reorder playlists) ⇄ detail view (▶ play-all, ✕ remove track, drag to reorder tracks, click track = load playlist as queue from that position via `queue-manager.setQueue` + `playAt`).

**radio-autoplay.js** — Playlist-like behavior (YT Music style). `playWithRadio(track)`: clicking a search result plays it immediately, then replaces the queue with [song, ...up-next radio] via `radio:up-next` IPC (`yt.music.getUpNext`, ~30 related tracks). `extendQueueWithRadio()`: when the queue's last track ends (repeat off), fetches the last track's radio, appends (deduped) and keeps playing — autoplay never dead-ends. Race guards: object identity check survives blocked-version id swaps.

**ui-elements.js** — DOM element refs (getElementById). Helpers: setTrackInfo(), setTimes(), renderTrackList() (incl. optional onReorder drag & drop), showPanel(), hidePanel(), etc. Rule: user data via textContent only; innerHTML allowed solely for trusted SVG constants from icons.js.

**format-utils.js** — formatTime(seconds) → "M:SS" display; parseVideoId/isLikelyUrl; moveItem(array, from, to) shared by drag & drop lists.

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

**Fixed Window + Tray** — Always-on-top (optional), frameless 340×420, non-resizable. The X button quits; the minimize button hides to a system-tray icon (tray-manager.js) and keeps the app running in the background.

## Verification Commands

```bash
npm run check                      # JS syntax check all files
npm run dev                        # Launch with cdp debugging (port 9222)
node scripts/verify-app.cjs        # IPC smoke test (requires npm run dev in another terminal)
node scripts/e2e-playback-test.cjs # Live playback e2e over CDP
npm start                          # Production launch
```

Scripts invoke the app via Electron API or Node debugging protocol; they do not bundle or transpile.
