# Code Standards

Minimal, shipped vanilla Electron app. No bundler, no linting enforcement — focus on functionality + readability + correctness.

## Language & Module System

- **Main + Renderer:** ESM (import/export). package.json `"type":"module"`.
- **Preload:** CommonJS (.cjs). ESM preload unsupported under sandbox=true.
- **No transpilation:** Code runs as-is; Node 20+ required.

## File Organization

- **Naming:** kebab-case (e.g., `local-server.js`, `error-handler.js`).
- **Size:** Keep files <200 LOC. If exceeding, split by concern.
- **No bundler:** Files imported as-is; rely on Node.js/browser ESM resolution.

## Code Patterns

### IPC Error Contract

All IPC handlers return a normalized response:
```js
// Success
{ ok: true, data: ... }

// Error
{ error: 'message' }
```

Renderer checks response structure before use. Prevents silent failures.

### DOM Rendering: textContent Only

Never use `.innerHTML`. Always render via textContent:
```js
// Good
el.textContent = userInput;  // Safe, even if userInput contains <script>

// Bad
el.innerHTML = userInput;    // XSS risk
```

Applies to all renderer modules (search-ui, ui-elements, favorites-ui). DOM refs stored in ui-elements.js; other modules query via refs only.

### Error Handling Pattern

Try-catch in IPC handlers + main process modules:
```js
ipcMain.handle('search:youtube', async (_event, query) => {
  try {
    const results = await searchYouTube(query);
    return { ok: true, data: results };
  } catch (err) {
    return { error: err.message };
  }
});
```

Renderer logs errors to console + shows user-facing fallback in ui-elements.

### Player Event Binding

Player module exports event emitter with `.on(eventName, callback)`:
```js
player.on('statechange', (state) => { ... });
player.on('error', (code) => { ... });
```

App.js binds all events in `bindPlayerEvents()` to centralize player lifecycle.

## Security Guards

### Store Access
- STORE_KEYS Set in store-manager.js whitelist all allowed keys.
- ipcMain.handle('store:get/set') validates key membership before accessing.
- Invalid keys return undefined or false.

### External URL Opening
- Regex whitelist: only canonical YouTube watch URLs (`https://www.youtube.com/watch?v=[11-char-id]`).
- ipcMain.handle('app:open-external') tests URL before shell.openExternal().
- Non-matching URLs silently rejected (return false).

### Window Controls
- Only minimize/close allowed via IPC.
- isDestroyed() check before calling BrowserWindow methods.

### Preload Allowlist
- contextBridge.exposeInMainWorld('api', {...}) exports fixed API only.
- No direct ipcRenderer exposure; no dynamic property access.
- All IPC calls filtered through named functions.

## Testing & Verification

No test framework. Verification via:

1. **Syntax Check** — `npm run check` runs `node --check` on every .js/.cjs file. Catches parse errors.

2. **Smoke Test** — `node scripts/verify-app.cjs` (requires `npm run dev` running):
   - Pings app via IPC (verifies bridge + lifecycle).
   - Tests store get/set with valid/invalid keys.
   - Calls search with a real query (verifies youtube-sr integration).
   - Confirms responses match contract {ok/error}.

3. **E2E Playback** — `node scripts/e2e-playback-test.cjs` (requires `npm run dev`):
   - Attaches to app via Chrome DevTools Protocol (port 9222).
   - Plays a known-playable video (e.g., official YouTube test clip).
   - Waits for player state PLAYING; checks times advance.
   - Logs failures; does not fail CI (informational only).

4. **Manual Checklist** — [docs/manual-test-checklist.md](manual-test-checklist.md): UI interactions, queue, favorites, error fallback.

## Principles (YAGNI / KISS / DRY)

- **YAGNI:** No auto-update, tray icon, multi-window, login, search history. See plan.md "Out of Scope."
- **KISS:** Vanilla JS + minimal libraries (Electron + youtube-sr + electron-store). No abstractions until needed.
- **DRY:** Shared logic lives in modules (queue-manager, player-controller, ui-elements). No inline duplication.

## Import Resolution

- **Relative paths:** `./` for same directory, `../` to traverse.
- **Node built-ins:** `import { app } from 'electron'`, `import http from 'http'`.
- **No node_modules aliases:** Use explicit paths for clarity.

## Comments & Documentation

- Inline comments explain *why*, not *what*. Code should be self-documenting.
- Module headers (top of file) describe responsibility + public API.
- Example:
  ```js
  // queue-manager.js: Maintains playback queue + repeat mode. Persists on change.
  // Public: init(), add(), remove(), next(), prev(), getCurrent(), setRepeat()
  ```

## Performance Notes

- **Volume persistence:** Debounced 300ms on input event (prevents excessive store writes).
- **Player load timeout:** 12 seconds; fallback message if YouTube API slow.
- **Auto-skip guard:** max 3 consecutive failures before stopping (prevents loop).
- **No virtual scrolling:** Queue list <200 items expected; full rerender acceptable.

## Breaking Changes / Migration Path

None for v1 (initial release). Future store schema changes (v2+) should:
1. Version the store format in a meta key.
2. Provide migration logic in store-manager.js init().
3. Document in project-changelog.md.

## CI/CD Notes

- Pre-commit: `npm run check` must pass.
- Pre-push: Run scripts/verify-app.cjs + scripts/e2e-playback-test.cjs in dev mode.
- Do not ignore failing tests; fix root cause.
- Secrets (.env, keys) never committed to git.
