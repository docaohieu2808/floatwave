# Code Review — YouTube Music Mini-Player (260610)

**Score:** 7.5/10 (pre-fix) | All critical/high/medium findings fixed same-session.

## Findings → Resolutions

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| C1 | Critical | No `setWindowOpenHandler`/`will-navigate` guard — embed popups inherit preload, exposing `window.api` to remote content | ✅ deny window-open + block navigation + `setPermissionRequestHandler(false)` in window-manager.js |
| H1 | High | `removeAt()` on playing track desyncs player/queue, skips next track on ENDED | ✅ reload new current or `player.stop()` + `notifyTrackChange(null)` when queue empties |
| H2 | High | Player-ready timeout race: late resolve left dead overlay, skipped volume/cue restore | ✅ `finishPlayerInit` continuation runs on (even late) resolve; overlay self-clears |
| M1 | Med | Error auto-skip timer fires over manually-picked track | ✅ `cancelPendingSkip()` called from onTrackChange |
| M2 | Med | `loadVideoById` unguarded pre-ready → TypeError on early URL paste | ✅ optional-chained; added `stop()` |
| M3 | Med | Favorite heart repainted from toggled track, not current track | ✅ `refreshFavoriteIcon(getCurrent())` |
| L | Low | `add()` to empty queue half-activates track | ✅ cues first track (autoplay:false) |
| L | Low | Dead `activate` path (window-all-closed always quits) | ✅ removed |
| L | Low | `stopLocalServer` dead export | ✅ removed |
| L | Low | Stale search race (rapid Enter) | Deferred — low likelihood |
| L | Low | Skip-cap stickiness after manual jump to bad video | Deferred — acceptable behavior |
| Info | — | CSP could tighten img-src to i.ytimg.com; store:set value-shape validation | Deferred |

## Security verification (passed)
IPC allowlisting, preload surface, local-server path traversal (decode-before-regex,
`[\w.-]` excludes separators), open-external exact-match regex, CSP present,
contextIsolation+sandbox on, XSS-safe rendering (textContent only; innerHTML only for
hardcoded entity constants).

## Standards
All JS < 200 lines, kebab-case, comments explain *why* (file:// embed errors 152/153,
Win10 transparent flicker, CJS preload under sandbox). YAGNI/KISS/DRY pass.

Full findings returned inline by code-reviewer agent ac60d289d9e7b617b.
