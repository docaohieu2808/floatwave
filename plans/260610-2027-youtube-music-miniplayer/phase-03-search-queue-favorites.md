# Phase 03 — Search + Queue + Favorites + Persistence

## Context Links
- Research: `../reports/researcher-260610-2027-electron-youtube-miniplayer.md` (section 2 search libs/IPC, section 3 electron-store, section 4 queue pattern)
- Depends on: `phase-01-scaffold-window-ipc.md`, `phase-02-player-core-controls.md`
- Overview plan: `plan.md`

## Overview
- **Priority:** P1
- **Status:** completed
- **Description:** Implement keyword search (youtube-sr in main via IPC) with a results list; "+" add-to-queue; play-from-results; auto-advance on track end; prev/next traversal; favorites (toggle + list); and full persistence (favorites, queue snapshot, current index, volume, repeat) via electron-store. Hydrate all state on boot.

## Key Insights
- youtube-sr is Node-only → runs in main; renderer calls `window.api.search(query)`→`ipcMain.handle('search-youtube')`. Return trimmed records `{id,title,channel,duration,thumbnail}` — do NOT pass full library objects over IPC (serialization bloat).
- Auto-advance: subscribe to player-controller `statechange`; on `ended(0)` consult repeat state: `one`→reload same; `all`→next or wrap to 0; `off`→next or stop at end. Single source of truth in queue-manager.
- Persistence is async over IPC; treat store as eventually-consistent. Write-through on every mutation (add/remove/reorder/favorite/volume/repeat) but **debounce** volume (slider fires rapidly).
- Store schema (defaults set Phase 1): `favorites:[{id,title,channel,thumbnail}]`, `queue:[{id,title,channel}]`, `queueIndex:int`, `volume:0-100`, `repeat:'off'|'one'|'all'`. Keep records minimal.
- Hydration order on boot: read store → restore volume/repeat into player+UI → render queue list & favorites → optionally cue (not autoplay) `queue[queueIndex]` so user resumes where they left off without surprise audio.
- youtube-sr scraper can break (YouTube HTML drift). Wrap in try/catch; on failure return structured error → search-ui shows "Search failed, try again". Fallback youtubei.js is **lazy** (only install/wire if youtube-sr proves broken — YAGNI now).

## Requirements
**Functional**
- Type keyword → Enter/search button → results list (thumb, title, channel, duration).
- Each result: click→play now; "+"→append to queue.
- Queue panel toggles from titlebar button; shows ordered list, highlights current, allows remove.
- Auto-advance on track end per repeat mode; prev/next move through queue.
- Favorite button toggles current track in favorites; favorites list viewable & playable.
- Favorites, queue (+index), volume, repeat persist and restore on relaunch.

**Non-functional**
- Each module < 200 lines. IPC payloads minimal. No blocking UI on search (async + loading state).

## Architecture
- **main/youtube-search.js** — `searchYouTube(query)`: calls youtube-sr, maps to minimal records, try/catch→`{ok:false,error}`. Exports for ipc-handlers.
- **main/ipc-handlers.js (modify)** — add `search-youtube`→youtube-search; `store:get(key)`→store, `store:set(key,value)`→store. (Channels stubbed in Phase 1.)
- **preload.js (modify)** — flesh out `search(query)`, `getStore(key)`, `setStore(key,value)` to real invokes.
- **renderer/queue-manager.js** — in-memory queue array + index; `add/removeAt/playNow/next/prev/onEnded(repeat)`; emits `change` for UI; calls `setStore('queue'/'queueIndex')` write-through; tells player-controller to `load(id)`.
- **renderer/search-ui.js** — input handling, calls `window.api.search`, renders results, loading/empty/error states; wires result click→`queue-manager.playNow`, "+"→`queue-manager.add`.
- **renderer/favorites-ui.js** — toggle current track favorite via `getStore/setStore('favorites')`; render list; click→play; reflect favorite button active state.
- **renderer/app.js (modify)** — boot hydration (read store→restore volume/repeat/queue/favorites→cue current); subscribe player `statechange`(ended)→`queue-manager.onEnded`; wire prev/next/queue-toggle/favorite buttons; debounce volume persist; persist repeat on toggle.

**Data flow (search→play→persist):** keyword → search-ui → `window.api.search` → ipc → youtube-search(youtube-sr) → minimal records → render → click → queue-manager.playNow → player-controller.load + `setStore('queue')`. **Auto-advance:** player ended → app.js → queue-manager.onEnded(repeat) → player.load(next) + setStore('queueIndex').

## Related Code Files
**Create**
- `main/youtube-search.js`
- `renderer/queue-manager.js`, `renderer/search-ui.js`, `renderer/favorites-ui.js`

**Modify**
- `main/ipc-handlers.js` (search + store handlers)
- `preload.js` (real search/getStore/setStore)
- `index.html` (search input, results list, queue panel, favorites panel markup)
- `renderer/styles.css` (lists, panels, toggle visibility)
- `renderer/app.js` (hydration, subscriptions, button wiring, debounce)

**Delete** — none

## Implementation Steps
1. `main/youtube-search.js` — `searchYouTube(q)` via youtube-sr, map to `{id,title,channel,duration,thumbnail}`, try/catch.
2. Modify `ipc-handlers.js` — register `search-youtube`, `store:get`, `store:set`.
3. Modify `preload.js` — implement `search/getStore/setStore` invokes.
4. `renderer/queue-manager.js` — queue state, mutations, `onEnded(repeat)` logic, write-through persistence, emit `change`.
5. `renderer/search-ui.js` — search box + results render + states; wire play/add.
6. `renderer/favorites-ui.js` — favorite toggle + list render + play.
7. Modify `index.html`/`styles.css` — search/results/queue/favorites panels + queue-toggle show/hide.
8. Modify `app.js` — hydrate from store on boot; subscribe ended→onEnded; wire prev/next/favorite/queue-toggle; debounce volume persist; persist repeat.
9. `node --check` all; manual: search→add→auto-advance→prev/next→favorite→relaunch persists.

## Todo List
- [x] main/youtube-search.js (youtube-sr, minimal records, try/catch)
- [x] ipc-handlers.js: search-youtube + store:get/set
- [x] preload.cjs: real search/getStore/setStore (CJS syntax)
- [x] queue-manager.js (state, onEnded(repeat), write-through)
- [x] search-ui.js (results, states, play/add)
- [x] favorites-ui.js (toggle, list, play)
- [x] index.html/styles.css panels + toggle
- [x] app.js hydration + subscriptions + debounce
- [x] manual: search→queue→auto-advance→favorites→persistence verified

## Success Criteria
- Search returns a results list; clicking plays; "+" enqueues.
- Track end auto-advances per repeat mode; prev/next work; current highlighted.
- Favorite toggles and persists; favorites playable.
- Relaunch restores favorites, queue (+position), volume, repeat. Current track cued (not blasting audio).
- youtube-sr failure shows graceful "search failed" message, app stays usable.
- `node --check` clean.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| youtube-sr breaks (HTML drift) | M×H | try/catch→structured error+UI message; lazy youtubei.js fallback documented (install only if needed) |
| Over-fat IPC payloads | M×M | Map to minimal record shape in main before returning |
| Volume slider spams store writes | H×L | Debounce (~300ms) before `setStore('volume')` |
| Restored autoplay surprises user | M×M | Cue (load+pause/cueVideoById), do not auto-play on boot |
| Queue/index desync after remove | M×M | queue-manager single source; recompute index on removeAt; persist atomically |
| Async store race on rapid mutations | L×M | Sequence writes per-key; last-write-wins acceptable for these keys |

## Security Considerations
- Search query passed as plain string to youtube-sr (no shell, no eval) — injection-safe.
- Store handlers are key/value over an allowlisted channel; consider validating `key` against known schema keys to prevent arbitrary store writes.
- Result thumbnails are remote images (img src) — safe; no remote script execution.

## Next Steps
- Unblocks Phase 4: error UI for embed-blocked tracks integrates with queue auto-skip; manual test checklist exercises this full flow; packaging note.
