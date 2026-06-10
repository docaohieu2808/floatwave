---
title: "YouTube Music Mini-Player (Electron Desktop App)"
description: "Frameless always-on-top floating YouTube mini-player with search, queue, favorites, persistence"
status: completed
priority: P2
effort: 14h
branch: main
tags: [electron, youtube, vanilla-js, desktop, mini-player]
created: 2026-06-10
---

# YouTube Music Mini-Player â€” Implementation Plan

Frameless 340x420 always-on-top Electron mini-player (AHA Music style). Plain Electron 41,
vanilla JS, no bundler. YouTube IFrame API in iframe; youtube-sr search via IPC; electron-store
v10 (ESM, main-process only) for favorites/queue/settings.

## Architecture (one glance)

```
main process (ESM)                preload (contextBridge)        renderer (vanilla JS)
  main.js  â”€â”€ window-manager      preload.js exposes:              app.js (bootstrap)
           â”€â”€ ipc-handlers          window.api.search()            player-controller.js (iframe API)
           â”€â”€ youtube-search        window.api.getStore()          queue-manager.js
           â”€â”€ store-manager         window.api.setStore()          search-ui.js
                                     window.api.win.{min,close}     favorites-ui.js
                                                                    ui-elements.js / format-utils.js
```

Data flow: user input â†’ renderer module â†’ `window.api.*` (preload) â†’ `ipcRenderer.invoke` â†’
`ipcMain.handle` â†’ search/store â†’ result back to renderer. Player state lives in renderer
(IFrame API). Persisted state (favorites, queue snapshot, volume, repeat) lives in main via store.

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Scaffold + window shell + IPC skeleton | completed | 3h | [phase-01-scaffold-window-ipc.md](phase-01-scaffold-window-ipc.md) |
| 2 | Player core: iframe API + controls + seek/volume | completed | 4h | [phase-02-player-core-controls.md](phase-02-player-core-controls.md) |
| 3 | Search + queue + favorites + persistence | completed | 5h | [phase-03-search-queue-favorites.md](phase-03-search-queue-favorites.md) |
| 4 | Polish: error handling + manual test + packaging note | completed | 2h | [phase-04-polish-errors-test-packaging.md](phase-04-polish-errors-test-packaging.md) |

## Key dependencies

- **Phase 1 blocks all** â€” IPC skeleton + preload bridge + window shell are foundation.
- **Phase 2 depends on 1** â€” needs preload bridge + index.html shell + titlebar.
- **Phase 3 depends on 2** â€” queue auto-advance hooks into player `onStateChange`; search loads videos into player.
- **Phase 4 depends on 2 & 3** â€” error UI wraps player `onError`; test checklist exercises full flow.
- **External:** electron@^41, youtube-sr@^4.3.12, electron-store@^10, youtubei.js (fallback, lazy-installed only if youtube-sr breaks).

## Cross-cutting decisions (locked)

- ESM everywhere in main (`"type":"module"` in package.json). electron-store v10 is pure ESM â†’ import only in main.
- contextIsolation: true, nodeIntegration: false, sandbox: true. All Node access via preload allowlist.
- Single fixed window, `resizable:false`, `alwaysOnTop:true`, `frame:false`, `backgroundColor:'#0f0f0f'` (avoid transparent flicker).
- Persisted state is source of truth on boot; renderer hydrates from store on app.js init.
- No test framework v1 â€” `node --check` per JS file + manual smoke checklist (phase 4).

## Architecture Deviations from Plan

- **App Served via Loopback HTTP Server** (new `main/local-server.js`): YouTube rejects file:// protocol embeds with player errors 152/153. App runs on `http://127.0.0.1:<ephemeral port>` instead of loadFile().
- **Preload is CJS (`preload.cjs`)**: Sandbox context requires CommonJS syntax; ESM preload causes contextBridge failures.
- **youtube-sr Import Syntax**: Package uses named imports `{ YouTube }` from youtube-sr, not default export.

## Out of scope (YAGNI for v1)

System tray, auto-update, YouTube login/likes, search history, multi-window. Noted in phase-04 Next Steps.
