# Code Review — Feature Pack (hotkeys, scoring, lyrics, focus mode, history, queue DnD)

Reviewer: code-reviewer agent (260611). Scope: 5 new files + 13 modified, ~340 LOC.
Verdict: DONE_WITH_CONCERNS → all concerns fixed same session (see Resolution).

## Findings

### High
- **H1** Media keys dead in web mode: globalShortcut preempts Chromium MediaSession;
  renderer ignores hotkeys in web mode; nothing forwarded to web window.
  → **FIXED**: global-shortcuts routes to `sendWebMediaCommand()` when
  `isWebModeActive()` (web-mode-manager.js: video element for play/pause,
  ytmusic-player-bar .next/.previous-button clicks for next/prev).

### Medium
- **M1** Dislike at end of queue didn't skip (next() returns false, ignored).
  → **FIXED**: `if (disliked && !queueManager.next()) extendQueueWithRadio()` (app.js).
- **M2** Lyrics button active-but-invisible in focus mode (overlay inside hidden #content).
  → **FIXED**: `body.focus-mode #btn-lyrics { display:none }` (styles.css).
- **M3** In-progress listen lost on quit (finalize only on track change + 800ms debounce).
  → **FIXED**: pagehide handler finalizes + flushes immediately (track-scoring.js).

### Low (accepted, no action)
- L1 lyrics stale-response guard id-based not sequence-based (same-id content, impact ≈ 0)
- L2 boot init micro-races on stats/history hydration (ms window)
- L3 repeat-one counts a play per loop (intentional signal: looping = liking)
- L4 resize cursor shows on frameless edges, drag no-ops (documented tradeoff)
- L5 focusMode in STORE_KEYS lets renderer desync flag vs size (self-corrects)
- L6 moveTrack accepts non-integers (internal forEach indices only; same as playAt)
- L7 privacy: title/artist/duration sent to lrclib.net on explicit lyrics open

### Verified clean
moveTrack pointer math (all branches traced); DnD index staleness (per-render closure,
mid-drag re-render → no-op); search history XSS (createTextNode only, innerHTML limited
to ICONS constants); lyrics IPC input handling (String coercion, searchParams encoding,
fixed host, 8s timeout, never-throws); globalShortcut lifecycle (mini window never
recreated, will-quit unregisterAll); IPC boolean coercion + renderer-side action allowlist.

## Accepted tradeoffs (user-visible)
- Media keys are captured system-wide while the app runs (steals from Spotify/browser) —
  standard for a music app; keys now control whichever mode is active.

## Unresolved questions
- None blocking. L-items above documented as accepted.
