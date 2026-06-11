# Review: "mini hiển thị một đường, YTM nền hát một nẻo"

User report: mini player + hidden YTM backend seem to run independently.

## Investigation (empirical, CDP)

1. **Raw backend B isolated** (empty queue, direct webPlay.load(PkgYe)): vid stays
   MATCH=PkgYe the full 30s, t advances 0→29, d=202, no ads, no autoplay drift.
   → backend B playing a SINGLE track is correct & stable. Not the bug.

2. **Full flow monitor** (queue + router): caught a transition frame where mini still
   showed song A while the hidden window was on vid `r8W_GDzHW7c` (a THIRD song),
   paused. → root cause identified below. After transition, mini+web re-synced and
   tracked together (times matched) — so steady-state is fine; the SEAM is broken.

## Root cause

YouTube Music is autonomous: the instant a song's `<video>` fires `ended`, YTM
**auto-advances to its OWN radio** (a song the mini queue never chose). Our status
poll is 1s, so up to ~1s of that wrong song leaks out (audible) before we detect
the vid change, pause it, and advance the mini queue to ITS next track. That ~1s of
YTM-radio = "the background sings a different song."

(The `r8W` seen earlier was YTM's autoplay pick, caught mid-pause — the system was
recovering, but the leak window was real.)

## Fix

web-playback-backend poll: **pre-empt the end**. Treat `t >= duration - 1.2s` as
ended → pause + emit ended BEFORE the video fires `ended`, so YTM never gets to
auto-advance. Margin > poll interval (1s) so it reliably lands before the real end.
`video.ended` and vid-change kept as backups. Costs ~1.2s off the tail of a
backend-B track — acceptable vs. chaotic radio leak.

## Verification

- End-transition test (5/5): seek blocked song to ~98% → hidden window stays on the
  SAME id, PAUSED at t=201 (NOT jumped to radio); mini advances to its next queue
  track on the iframe; iframe PLAYING while web paused → no double audio.
- e2e-playback regression: (pending/at end of run).

## Remaining architectural risk (not fixed this round)

- **Shared window**: web mode (♪, user-facing) and backend B (hidden playback) drive
  the SAME BrowserWindow. Using both in one session can still collide (open ♪ while a
  backend-B song plays → same window surfaces mid-song). Lower frequency than the
  autoplay leak; recommend decoupling (separate window or explicit hand-off) if the
  user still sees oddness here.
- Backend B is inherently DOM/poll puppeteering of a live YTM app — robust for the
  common path now, but each YTM redesign (player-bar classes, ad markers, watch URL)
  is a maintenance touchpoint.

## Unresolved questions
- Should ♪ web mode and backend B share a window at all, or get separate ones?
- Acceptable to trim ~1.2s off the end of backend-B tracks (the autoplay pre-empt)?
