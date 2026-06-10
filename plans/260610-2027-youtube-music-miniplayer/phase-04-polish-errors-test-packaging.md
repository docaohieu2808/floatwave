# Phase 04 — Polish: Error Handling + Manual Test + Packaging Note

## Context Links
- Research: `../reports/researcher-260610-2027-electron-youtube-miniplayer.md` (section 1 error 150 embed-disabled; section 3 packaging-later note)
- Depends on: `phase-02-player-core-controls.md`, `phase-03-search-queue-favorites.md`
- Overview plan: `plan.md`

## Overview
- **Priority:** P2
- **Status:** completed
- **Description:** Harden the app: handle embed-blocked videos (onError 150/101) with fallback UI + auto-skip in queue, handle search failures and empty states gracefully, add a manual smoke-test checklist, and document optional electron-builder packaging. No new features — robustness + verification + docs.

## Key Insights
- `onError` codes: `150`/`101` = owner disabled embedding; `100` = video not found/removed; `2` = invalid param. All should resolve to a clear fallback, not a silent dead player.
- Embed-blocked is unrecoverable by design → offer "Open on YouTube" (`https://www.youtube.com/watch?v={id}`) via `shell.openExternal` (IPC `app:open-external`, allowlist youtube URLs only) AND auto-skip to next queue item after a short delay so playback continues.
- Auto-skip must guard against infinite loops (a queue of all-blocked videos) — cap consecutive auto-skips, then stop with a message.
- No test framework v1 (KISS): rely on `node --check` (syntax) + pure-function spot checks (parseVideoId/formatTime via a tiny `node` REPL snippet) + the manual checklist. A real test harness is deferred (YAGNI).
- Packaging is optional for v1: `electron-builder` is the lighter path for a Windows portable/NSIS build; document but do not implement unless distribution is requested.

## Requirements
**Functional**
- Embed-blocked video → fallback panel ("Embedding disabled — Open on YouTube") + auto-skip to next.
- Search failure / no results → clear inline message; app remains usable.
- Invalid pasted URL → inline "Not a valid YouTube link" (no crash).
- Consecutive-blocked guard stops auto-skip after N (e.g., 3) and shows "Couldn't play queued items".

**Non-functional**
- Error paths never leave app in a stuck state. All new code < 200 lines; reuse ui-elements/format-utils (DRY).

## Architecture
- **renderer/error-handler.js** — maps player error codes → user message + action; renders fallback panel; triggers `queue-manager.next()` auto-skip with the consecutive-skip counter; resets counter on successful `playing`.
- **main/ipc-handlers.js (modify)** — add `app:open-external` → validate URL is `https://www.youtube.com/watch?v=...` then `shell.openExternal`.
- **preload.js (modify)** — expose `openExternal(url)`.
- **renderer/app.js (modify)** — subscribe player `error`→error-handler; reset skip counter on `statechange playing`.
- **renderer/search-ui.js (modify)** — already has states from Phase 3; confirm error/empty wired to error messaging helper.
- **docs / README** — `README.md` quick start; `docs/manual-test-checklist.md`; `docs/packaging-note.md`.

**Data flow (blocked video):** player onError(150) → controller emits `error` → error-handler shows fallback + `queue-manager.next()` (counter++) → if counter>3 stop+message; successful `playing`→counter=0.

## Related Code Files
**Create**
- `renderer/error-handler.js`
- `README.md`
- `docs/manual-test-checklist.md`
- `docs/packaging-note.md`

**Modify**
- `main/ipc-handlers.js` (`app:open-external` with URL allowlist)
- `preload.js` (`openExternal`)
- `renderer/app.js` (error subscription + counter reset)
- `renderer/search-ui.js` (confirm error/empty states)

**Delete** — none

## Implementation Steps
1. `renderer/error-handler.js` — code→message map; render fallback (Open on YouTube button→`window.api.openExternal`); auto-skip via queue-manager with consecutive counter + cap.
2. Modify `ipc-handlers.js` — `app:open-external` validating youtube watch URL before `shell.openExternal`.
3. Modify `preload.js` — `openExternal(url)`.
4. Modify `app.js` — subscribe `error`→error-handler; on `playing` reset skip counter.
5. Confirm `search-ui.js` empty/error states render via shared helper.
6. Write `README.md` (install, `npm start`, dev port), `docs/manual-test-checklist.md`, `docs/packaging-note.md`.
7. `node --check` all; run full manual checklist incl. a known embed-disabled video.

## Todo List
- [x] error-handler.js (code map, fallback panel, auto-skip + cap)
- [x] ipc-handlers.js app:open-external (youtube URL allowlist)
- [x] preload.cjs openExternal
- [x] app.js error subscription + skip-counter reset
- [x] search-ui empty/error states confirmed
- [x] README.md
- [x] docs/manual-test-checklist.md
- [x] docs/packaging-note.md
- [x] full manual checklist run (incl. blocked video)

## Manual Test Checklist (the deliverable)
- [ ] Launch: window 340x420, frameless, always-on-top, dark, draggable.
- [ ] Titlebar: minimize, close, queue-toggle work.
- [ ] Paste valid URL → plays; paste invalid → inline error, no crash.
- [ ] Play/pause toggles; seek drag works; time shows m:ss; volume changes; mute at 0.
- [ ] Repeat cycles off/one/all and affects auto-advance correctly.
- [ ] Search keyword → results; click plays; "+" enqueues.
- [ ] Queue: auto-advance on end; prev/next; remove; current highlighted.
- [ ] Favorite toggle persists; favorites playable.
- [ ] Embed-disabled video → fallback + Open on YouTube + auto-skip to next.
- [ ] All-blocked queue → stops after cap with message (no infinite loop).
- [ ] Relaunch restores favorites, queue+index, volume, repeat (current cued, not auto-blasting).
- [ ] `node --check` clean on every JS file.

## Success Criteria
- Every checklist item passes.
- No unhandled error leaves the player stuck; blocked videos skip and inform.
- README lets a fresh clone run in <3 commands. Packaging note documents the electron-builder path.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Auto-skip infinite loop (all blocked) | M×H | Consecutive-skip cap (3) then stop+message; reset on successful play |
| openExternal abused for arbitrary URL | L×H | Validate URL is youtube watch link before `shell.openExternal` |
| Error states inconsistent across UI | M×L | Single error-messaging helper reused (DRY) |
| Packaging scope creep | M×M | Document only; implement electron-builder solely if distribution requested (YAGNI) |

## Security Considerations
- `app:open-external` strictly allowlists `https://www.youtube.com/watch?v=` URLs; reject everything else (prevents arbitrary external launches).
- Reaffirm CSP `script-src` limited to youtube IFrame API origin; no inline-eval.
- No secrets/keys in repo (`.gitignore` covers env/logs); search is keyless.

## Next Steps (post-v1, out of scope)
- System tray show/hide; auto-update (electron-updater); YouTube login/likes; search history; drag-reorder queue; real test harness (vitest) if app grows.
