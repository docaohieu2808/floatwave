# Bug: "Embedding disabled — playback stopped" instantly on picking a song

## Symptom
User picks "Bình Yên" (Vũ) → instant "Embedding disabled by the video owner —
several queued videos failed, playback stopped." Nothing tried, nothing plays.

## Root cause — stale loop-guard state across episodes
[error-handler.js](../../renderer/error-handler.js) loop guards are module-level
and only reset on (a) successful PLAYING (`clearPlayerError`) or (b) end of queue:
- `consecutiveSkips` (max 3)
- `altAttempts` / `altSongKey` / `altTriedIds` (max 2 alt-version tries)

A blocked song that never reaches PLAYING leaves these maxed out FOREVER. The
next pick — even minutes later, even a different song — inherits the maxed
counters: `tryAlternativeVersion` early-returns (altAttempts≥MAX), `scheduleSkip`
sees consecutiveSkips≥MAX → prints "playback stopped" without trying anything.

## Reproduction (CDP, confirmed)
- Fresh app instance: pick "Bình Yên" → tries original (blocked 150) → tries 1–2
  alternatives (official MV/audio also embed-blocked) → skips through radio →
  recovers on a playable track. Correct.
- Same instance, 2nd pick of a blocked song: error in <400ms, queueIndex never
  moves, no "trying another upload" shown — instant give-up. Matches user report.
- Diagnosis: counters inherited from the 1st attempt (altAttempts=2,
  consecutiveSkips=3, same altSongKey → no reset).

Note: "Bình Yên" itself is genuinely embed-blocked at PLAY time (both Vũ Official
uploads). oEmbed/cue probe reports embeddable — misleading; 150 fires on play.

## Fix
1. Extract `resetGuards()`; call from `clearPlayerError` (DRY).
2. `handlePlayerError`: if `now - lastFailureAt > EPISODE_GAP_MS (10s)` →
   `resetGuards()` before processing. A failure long after the last one is a new
   episode (user re-picked / came back), not a continuation of a skip storm.
   Intra-storm errors arrive ~4–6s apart (< 10s) so the counter still accumulates
   correctly and the loop guard still stops a genuinely all-blocked queue.
3. `MAX_ALTERNATIVE_TRIES` 2 → 3: gives a user's chosen song one more shot at a
   playable non-official upload (cover/lyric) before skipping away.

## Verification
- Double-repro on ONE instance (the exact bug trigger): RUN 1 recovers to "Vì Anh
  Đâu Có Biết"; RUN 2 (previously instant-stop) now runs full try→skip→recover →
  "Nơi Này Có Anh" playing, idx 3. No dead-end.
- `npm run check` PASS. Intra-storm loop guard intact (3 skips then stop).

## Follow-up fix (same day): probe-then-pick — the picked song now PLAYS

User: "thế bài tôi muốn nghe thì lại không nghe được à?" → implemented
renderer/embed-probe.js + multi-round tryAlternativeVersion.

Key discoveries (the hard part):
1. Playability APIs lie (known). 2. NEW: a hidden/offscreen YT player NEVER starts
   playing (Chromium/YT gate playback on visibility — stuck UNSTARTED) so a naive
   "wait for PLAYING" probe reports everything blocked. BUT blocked videos still
   fire onError 150 ~1-2s after playVideo() even hidden. → VETO probe: error in 5s
   window = blocked; silence after onReady = playable. Validated against control
   (Big Buck Bunny = playable; 9 known-blocked uploads = blocked(150)).
3. For "bình yên"(Vũ): ALL solo uploads blocked (official, lyric, live, claimed
   re-uploads — Content ID). Only compilations (TPT Music For Life) embeddable.

Flow now: blocked song → up to 3 rounds × (searchAlternative excl. duds → veto-probe
5 in parallel → swap to first survivor). Verified: picking "bình yên" → ~5s probing →
SAME song playing (swapped to Ftm-SWdVgpg compilation, starts with the song; id
persisted so future plays are instant). e2e-playback regression ALL PASS.

## Unresolved
- Playable upload may be a compilation (video continues past the song; queue only
  advances at video end). Mitigation candidate: prefer duration≈original. YAGNI now.
