# Phase 02 — Player Core: IFrame API + Controls + Seek/Volume

## Context Links
- Research: `../reports/researcher-260610-2027-electron-youtube-miniplayer.md` (sections 1, 4 — IFrame API control surface, autoplay, error 150)
- Depends on: `phase-01-scaffold-window-ipc.md`
- Overview plan: `plan.md`

## Overview
- **Priority:** P1
- **Status:** completed
- **Description:** Wrap the YouTube IFrame Player API in a renderer controller. Render the player area + controls bar (repeat toggle, prev, play/pause, seek with current/total time, volume, favorite button shell). Implement play/pause, seek, volume, and the 1s time-tick loop. Wire URL paste → extract videoId → load. Prev/next buttons present but their queue wiring lands in Phase 3.

## Key Insights
- IFrame API loads async: inject `https://www.youtube.com/iframe_api`; YouTube calls global `onYouTubeIframeAPIReady`. Build a Promise so app.js can `await playerReady` before issuing commands.
- Player needs a container `<div id="player">` that the API **replaces** with an iframe. Pass `playerVars:{enablejsapi:1, controls:0, rel:0, origin: location.origin}` — `origin` matters for postMessage when not on file://; with file:// it's tolerated, set it defensively.
- Time/duration are pull-based (`getCurrentTime()`/`getDuration()`), no event. Use a 1s `setInterval` while playing; clear on pause/ended to avoid drift and wasted cycles.
- Autoplay: muted autoplay always allowed; for unmuted, set the app switch `autoplay-policy=no-user-gesture-required` in main (Phase 1 main.js can host it, or add here). Decision: load via user action (search/paste click) = real user gesture, so unmuted playback works without the switch. Prefer that (KISS).
- Seek: `seekTo(sec, true)`. Update seek bar from tick loop, but while user is dragging the slider, suspend tick-driven updates (flag) to prevent fighting the thumb.
- `onError` 150/101 = embedding disabled → surface fallback (full handling in Phase 4, but controller must emit the error event now).
- volume 0–100 integer; persist on change (debounced) via store — store wiring is Phase 3, expose a callback hook now.

## Requirements
**Functional**
- Player area shows the video; play/pause toggles and reflects state.
- Seek bar shows progress; dragging seeks; current/total time render as `m:ss`.
- Volume slider sets player volume; mute at 0.
- Repeat toggle cycles `off → one → all` (visual + state only; queue effect in Phase 3).
- Paste a YouTube URL in the search/URL field → parses videoId → loads & plays.

**Non-functional**
- player-controller.js and each module < 200 lines. No blocking on API load (await readiness).

## Architecture
- **renderer/player-controller.js** — owns the YT.Player instance. Exports: `initPlayer()`→Promise, `load(videoId)`, `play()/pause()/toggle()`, `seek(sec)`, `setVolume(n)`, and an event emitter for `statechange`/`error`/`tick({current,duration})`. Holds the tick interval lifecycle.
- **renderer/format-utils.js** — `formatTime(sec)`→`m:ss`; `parseVideoId(input)` handling `watch?v=`, `youtu.be/`, `embed/`, and raw 11-char IDs. Pure functions (unit-checkable).
- **renderer/ui-elements.js** — cached DOM refs + small render helpers (set title/artist, set play icon, set times, set seek %, set volume). DRY DOM access; no business logic.
- **index.html / styles.css (modify)** — add `<div id="player">` and controls bar markup (repeat, prev, play/pause, seek input[type=range], times, volume input[type=range], favorite button).
- **renderer/app.js (modify)** — `await initPlayer()`; bind control buttons/sliders to controller; subscribe to `tick`→ui-elements; subscribe to `error`→placeholder handler (Phase 4 expands).

**Data flow:** URL paste → app.js → `parseVideoId` → `player.load(id)`; tick loop → emit `tick` → ui-elements updates seek+time; slider input → `player.seek/ setVolume`.

## Related Code Files
**Create**
- `renderer/player-controller.js`
- `renderer/format-utils.js`
- `renderer/ui-elements.js`

**Modify**
- `index.html` (player div + controls markup)
- `renderer/styles.css` (controls bar layout, range slider styling)
- `renderer/app.js` (init + bindings)

**Delete** — none

## Implementation Steps
1. Add IFrame API loader: inject script tag; create `playerReady` Promise resolved in global `onYouTubeIframeAPIReady`.
2. Write `format-utils.js` — `formatTime`, `parseVideoId` (regex set + raw-id guard). `node --check`.
3. Write `ui-elements.js` — query+cache controls; render helpers (icons, times, slider values, title/artist).
4. Write `player-controller.js` — construct `YT.Player('player', {playerVars, events:{onReady,onStateChange,onError}})`; implement load/play/pause/toggle/seek/setVolume; tick interval start on playing(1) / clear on paused(2)/ended(0); emit events.
5. Modify `index.html` — add player div + full controls bar; `styles.css` — layout + slider theming (dark).
6. Modify `app.js` — await init; bind play/pause, seek (with dragging flag), volume, repeat toggle (cycles state), URL paste→load; subscribe tick→ui.
7. `node --check` all; `npm start`; manual: paste a known-embeddable URL, verify play/pause/seek/volume/time render.

## Todo List
- [x] IFrame API loader + playerReady Promise
- [x] format-utils.js (formatTime, parseVideoId) + node --check
- [x] ui-elements.js render helpers
- [x] player-controller.js (instance, methods, tick loop, event emitter)
- [x] index.html controls bar + player div
- [x] styles.css controls + range sliders (dark)
- [x] app.js init + bindings (incl. seek dragging flag, repeat cycle)
- [x] manual: play/pause/seek/volume/time verified with pasted URL

## Success Criteria
- Pasting a YouTube URL plays the video in the embedded area.
- Play/pause button toggles playback and icon.
- Seek bar advances ~1s/s; dragging it seeks; current/total time show `m:ss`.
- Volume slider changes loudness; 0 = silent.
- Repeat toggle visibly cycles off/one/all (state only).
- No uncaught errors; `node --check` clean.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| IFrame API not ready when commands fire | M×H | Gate all calls behind `playerReady` Promise; queue load until onReady |
| postMessage origin rejection | L×H | Pass `origin: location.origin` in playerVars; file:// tolerated; Phase 4 documents custom-scheme option if needed |
| Seek tick fights user dragging | M×M | `isDragging` flag suspends tick-driven seek updates during drag |
| Autoplay blocked (unmuted) | L×M | Load only on user action (search/paste click) = valid gesture; else mute-then-play |
| getDuration()=0 before metadata | M×L | Guard divide-by-zero in seek %; re-read duration in tick until >0 |

## Security Considerations
- Only `https://www.youtube.com` content loaded in iframe; no arbitrary URL navigation in main window.
- `parseVideoId` validates/normalizes input → prevents injecting non-YouTube embeds. Reject malformed input (no load).
- IFrame API script is the only remote script; consider CSP `script-src` allowing youtube domains (note for Phase 4 hardening).

## Next Steps
- Unblocks Phase 3: queue auto-advance subscribes to controller `statechange` (ended=0); favorite button writes via store; volume/repeat persistence hooks here get wired to store.
