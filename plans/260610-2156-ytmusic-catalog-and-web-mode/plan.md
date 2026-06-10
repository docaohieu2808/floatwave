---
title: "YT Music catalog search + embedded web mode"
status: completed
created: 2026-06-10
---

# YT Music Catalog Search + Web Mode

Extends 260610-2027-youtube-music-miniplayer (completed v1).

## Phase 1 — Music catalog search (youtubei.js InnerTube)
- Add `youtubei.js` dep. `main/youtube-search.js`: primary = `yt.music.search(q, {type:'song'})`
  (lazy Innertube singleton), map to existing record shape {id,title,channel=artists,duration,thumbnail}.
  Fallback on failure = current youtube-sr general search. Renderer unchanged.
- Status: completed — first result for "chờ người hạnh nguyên" = exact song; e2e search suite ALL PASS.

## Phase 2 — Embedded music.youtube.com mode
- IMPLEMENTED DIFFERENTLY than planned: WebContentsView + dynamic window resize ABANDONED —
  Windows frameless quirks (setSize ignored on non-resizable windows; toggling resizable shifts
  thickFrame insets irreversibly, 314→327px drift). Final: SECOND BrowserWindow (native frame,
  960x640, alwaysOnTop, show/hide toggle vs mini window). Same session/security plan kept:
  partition `persist:ytmusic`, Chrome UA, sandbox+contextIsolation, no preload, deny
  permissions, popups → shell.openExternal.
- IPC `mode:set` + `mode:exited` push event (resyncs ♪ button when web window closed via X or
  destroyed externally). Renderer pauses mini player before entering; web `<video>` paused on exit.
- Status: completed — full cycle verified via CDP (enter/exit/button-resync/external-destroy);
  playback + search e2e suites regression: ALL PASS.

## Verification
- node prototype dump of music search results; e2e-search-test still passes (results now songs);
- manual: toggle web mode → music.youtube.com loads, login persists after relaunch, toggle back
  pauses web audio and restores mini layout.

## Risks
- youtubei.js result shape drift → defensive mapping + youtube-sr fallback.
- Google login may still balk in embedded view → UA spoof; if blocked, document login via
  "open in browser" alternative (out of scope v1 of this feature).
