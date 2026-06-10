# Phase 01 â€” Scaffold + Window Shell + IPC Skeleton

## Context Links
- Research: `../reports/researcher-260610-2027-electron-youtube-miniplayer.md` (sections 3, scaffolding + window shell)
- Overview plan: `plan.md`

## Overview
- **Priority:** P1 (blocks all other phases)
- **Status:** completed
- **Description:** Stand up the Electron project: package.json, main process split into modules, frameless always-on-top fixed window, preload contextBridge with allowlisted IPC, empty index.html shell with custom titlebar (title/artist placeholder, queue toggle, minimize, close). No player logic yet â€” just the working window + IPC round-trip proof.

## Key Insights
- electron-store v10 is **pure ESM** â†’ main process MUST use `"type":"module"` and `import Store from 'electron-store'`. Never import in renderer (no Node context).
- Frameless + `transparent:true` flickers on Windows 10 (issue #22691). Use opaque `backgroundColor:'#0f0f0f'` instead.
- `-webkit-app-region: drag` on titlebar, `no-drag` on every button inside it, else buttons unclickable.
- contextIsolation must stay ON; renderer reaches Node only through preload allowlist (`window.api`).
- Window controls (minimize/close) need IPC â€” frameless has no native buttons. Wire `win:minimize` / `win:close` now.
- **Preload MUST be CJS** (`preload.cjs`): ESM preload with sandbox:true causes contextBridge failures. Use CommonJS syntax.
- **App served via loopback HTTP** (`http://127.0.0.1:<ephemeral port>`): YouTube rejects file:// embeds with player errors 152/153. Use `local-server.js` to serve app instead of `loadFile()`.

## Requirements
**Functional**
- `npm start` launches a 340x420 frameless, non-resizable, always-on-top window showing dark titlebar + empty body.
- Titlebar shows placeholder "No track" / "â€”", a queue-toggle button, minimize, close. Minimize and close work.
- A proof IPC channel (`app:ping` â†’ returns `"pong"`) verifies preloadâ†’mainâ†’preload round-trip from DevTools.

**Non-functional**
- Every JS file < 200 lines, kebab-case. contextIsolation:true, nodeIntegration:false, sandbox:true.

## Architecture
- **main.js** â€” app lifecycle (`whenReady`, `window-all-closed`, `activate`); calls window-manager + registers ipc-handlers + store-manager init.
- **main/window-manager.js** â€” `createMainWindow()` returns BrowserWindow with frameless/fixed/alwaysOnTop config; exports getter for the singleton win.
- **main/ipc-handlers.js** â€” `registerIpc(win)` wires `app:ping`, `win:minimize`, `win:close`. Search/store handlers added in later phases (stub file now).
- **main/store-manager.js** â€” lazy `getStore()` singleton wrapping electron-store with defaults `{favorites:[], queue:[], volume:50, repeat:'off'}`. Exposed but unused until phase 3.
- **preload.js** â€” `contextBridge.exposeInMainWorld('api', {...})`: `ping`, `win:{minimize,close}`. Adds `search`, `getStore`, `setStore` placeholders that invoke channels (handlers come later).
- **index.html** â€” shell: `<div id="titlebar">` (drag) + body container `<main id="app">`. Links styles.css + app.js (type=module).
- **renderer/styles.css** â€” dark theme vars, titlebar drag regions, button reset, fixed layout grid (titlebar / player area / controls placeholders).
- **renderer/app.js** â€” bootstrap: wires titlebar buttons to `window.api.win.*`; logs ping result. Stub mount points for later modules.

**Data flow (this phase):** button click â†’ app.js â†’ `window.api.win.minimize()` â†’ preload `ipcRenderer.invoke('win:minimize')` â†’ ipc-handlers calls `win.minimize()`.

## Related Code Files
**Create**
- `package.json`, `.gitignore`
- `main.js`
- `main/window-manager.js`, `main/ipc-handlers.js`, `main/store-manager.js`
- `preload.js`
- `index.html`
- `renderer/styles.css`, `renderer/app.js`

**Modify** â€” none (greenfield)
**Delete** â€” none

## Implementation Steps
1. `npm init -y`; set `"type":"module"`, `"main":"main.js"`, scripts `start`/`dev` (`electron . --remote-debugging-port=9222`).
2. `npm i electron-store@^10 youtube-sr@^4.3.12` ; `npm i -D electron@^41`.
3. `.gitignore`: `node_modules/`, `dist/`, `*.log`.
4. Write `main/window-manager.js` â€” BrowserWindow {frame:false,width:340,height:420,resizable:false,alwaysOnTop:true,backgroundColor:'#0f0f0f',webPreferences:{preload, contextIsolation:true,nodeIntegration:false,sandbox:true}}. Load `index.html`.
5. Write `main/store-manager.js` â€” `getStore()` returns memoized `new Store({defaults})`.
6. Write `main/ipc-handlers.js` â€” `registerIpc(win)` handles `app:ping`, `win:minimize`â†’win.minimize(), `win:close`â†’win.close().
7. Write `main.js` â€” on `whenReady`: create window, register IPC, init store. Standard quit handlers.
8. Write `preload.js` â€” expose `window.api` allowlist (ping, win.minimize, win.close; placeholder search/getStore/setStore).
9. Write `index.html` + `renderer/styles.css` â€” titlebar (drag) with no-drag buttons; empty player + controls placeholders.
10. Write `renderer/app.js` â€” wire titlebar buttons; `await window.api.ping()` log to console.
11. `node --check` each .js file. `npm start`; verify window, drag, minimize, close, and ping=pong in DevTools.

## Todo List
- [x] package.json (ESM, scripts) + deps installed
- [x] .gitignore
- [x] main/window-manager.js (frameless fixed alwaysOnTop window)
- [x] main/store-manager.js (defaults)
- [x] main/ipc-handlers.js (ping, win:minimize, win:close)
- [x] main.js lifecycle
- [x] preload.cjs contextBridge allowlist (CJS, not ESM, due to sandbox)
- [x] index.html titlebar shell + placeholders
- [x] renderer/styles.css dark theme + drag regions
- [x] renderer/app.js bootstrap + button wiring
- [x] node --check all + manual launch verify
- [x] main/local-server.js (loopback HTTP server for YouTube embed compatibility)

## Success Criteria
- `npm start` opens correct-size frameless always-on-top dark window; titlebar draggable.
- Minimize and close buttons function. No console errors.
- `await window.api.ping()` returns `"pong"` in DevTools (IPC round-trip proven).
- `node --check` passes on every JS file.

## Risk Assessment
| Risk | LÃ—I | Mitigation |
|------|-----|-----------|
| electron-store ESM import fails in main | MÃ—H | Confirm `"type":"module"`; if blocked, pin v9 CJS (fallback noted in research) |
| Titlebar buttons unclickable (drag region) | MÃ—M | Apply `-webkit-app-region:no-drag` to all titlebar buttons; test click |
| Transparent flicker on Win10 | LÃ—M | Use opaque backgroundColor, never `transparent:true` |
| sandbox:true breaks preload require | LÃ—M | Preload uses only `electron` (contextBridge/ipcRenderer), allowed under sandbox |

## Security Considerations
- contextIsolation:true, nodeIntegration:false, sandbox:true â€” renderer has no direct Node/IPC; only allowlisted `window.api`.
- Preload exposes a fixed verb list; no generic `invoke(channel)` passthrough.

## Next Steps
- Unblocks Phase 2 (player core) and Phase 3 (search/queue/favorites). Phase 2 fills the player-area placeholder; Phase 3 wires store handlers stubbed here.
