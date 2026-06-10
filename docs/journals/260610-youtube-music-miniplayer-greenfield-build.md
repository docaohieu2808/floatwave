# YouTube Music Mini-Player: Greenfield Build — HTTP Static Server Saves YouTube Embed

**Date**: 2026-06-10 18:35  
**Severity**: Resolved  
**Component**: Electron app, YouTube IFrame API, youtube-sr search, e2e testing pipeline  
**Status**: Resolved + documented (all 10 issues fixed same-session)

## What Happened

Built a frameless 340×420 always-on-top Electron desktop mini-player (AHA Music style) from scratch in one session. Four-phase plan (researcher → planner → implementation → tester → code-reviewer → fixes). Total: 4 conventional commits (eb1f9e9..cc6bb39), 10 code-review findings (1 critical, 2 high, 3 medium, 4 low—all fixed same-session). E2E testing pipeline went from 3/6 playback failures to 6/6 pass, search 5/5 pass.

## The Brutal Truth

The research phase sold us a lie: "YouTube IFrame API works from file:// protocol." It doesn't. YouTube enforces real HTTP origin+Referer for embeds (2025+ policy). We spent 2 hours iterating Referer headers, CSP tweaks, trying X-Frame-Options workarounds—all dead ends. The real fix was humbling: spin up a loopback HTTP static server (`127.0.0.1:<ephemeral port>`). One line in main.js changed everything. Tester agent died mid-run from API overload; respawned post-review-fixes. All green after.

## Technical Details

- **Player error 153, then 152**: YouTube rejects file:// embeds. Error messages from console: `"player error 153"` (initial), then `"player error 152"` after Referer injection attempt (told us the origin was still wrong).
- **youtube-sr CJS/ESM interop**: Default import gave `"YouTube.search is not a function"`. Fixed with named import `{ YouTube }`.
- **Sandbox + preload interop**: Sandboxed Electron requires CommonJS preload (`preload.cjs`), not ESM. ContextBridge failed silently with ESM syntax.
- **Code review critical (C1)**: Missing `setWindowOpenHandler` allowed embed popups to inherit preload, exposing `window.api` to remote content. Fixed with explicit window-open denial + nav blocking.
- **High issue (H1)**: `removeAt()` on playing track desynced player state. Fixed with track reload or explicit `player.stop()` + queue-empty notification.

## What We Tried

1. CSP tweaks (`frame-ancestors 'self'`, `connect-src https:`).
2. X-Frame-Options headers manipulation.
3. Referer header injection (`Referer: http://localhost`).
4. youtube-sr default import (failed with CJS/ESM mismatch).
5. ESM preload syntax (silent contextBridge failure).

All but #4 were for the embed problem. Only the loopback HTTP server solved it.

## Root Cause Analysis

**Research underestimated YouTube's 2025 security posture.** File:// is sandbox-hostile for embedded resources now. We assumed outdated docs applied. The HTTP server was the *only* way to give YouTube a legitimate origin to trust.

**CJS/ESM bleed** happened because we didn't test the integration early—ESM preload silently failed contextBridge, leaving window.api undefined at runtime.

## Lessons Learned

1. **YouTube embeds from file:// are dead.** Always test against real protocol (http/https) immediately. Don't iterate headers blindly.
2. **Electron sandbox is strict.** CJS preload is non-negotiable for contextBridge. Test preload module syntax early.
3. **Run e2e tests post-code-review.** Code review found the security gap that tester caught during playback runs.
4. **Ephemeral HTTP servers are cheap.** Loopback static server (30 lines) is simpler than fighting YouTube's origin validation.

## Next Steps

- ✅ All 10 issues fixed (same-session).
- ✅ E2E tests 11/11 pass.
- ✅ Security verified (CSP, IPC allowlisting, contextIsolation, sandbox on, path traversal check, XSS-safe rendering).
- ✅ Docs complete (README, codebase summary, plan, phase docs, reports).
- Out-of-scope for v1: system tray, auto-update, YouTube login, search history, multi-window.

---

**Status:** DONE  
**Summary:** Built YouTube Music mini-player Electron app (340×420 frameless always-on-top); fixed player error 152/153 by routing app through loopback HTTP server instead of file:// protocol; fixed 10 code-review findings (1 critical security gap, 2 high desync issues, 3 medium race conditions); all e2e tests pass (11/11).
