# Feature Pack: Hotkeys, Recommendations, Lyrics, Focus Mode, QoL

Status: COMPLETE. Implemented, e2e verified, code-reviewed (H1/M1/M2/M3 found & fixed
same session — see plans/reports/code-reviewer-260611-1054-feature-pack.md), docs updated.
Scope agreed with user; audio-only mode & Tauri migration explicitly excluded.

## Features & TODO

- [x] 1. Waveform realism — `renderer/waveform.js`: mean-reverting jitter + song-structure
      envelope (intro/chorus/outro) so bars stop hugging floor/ceiling
- [x] 2. Global hotkeys — new `main/global-shortcuts.js`: MediaPlayPause/Next/Prev +
      Ctrl+Alt+Space/Right/Left → IPC `hotkey` → renderer maps to player/queue.
      Ignored while web mode is active (two players must never fight)
- [x] 3. Focus mode — compact 340×116 window (titlebar + controls only).
      FINAL APPROACH (min=max clamp drifted −6px/toggle, measured): window created
      `useContentSize:true, resizable:true`, user resize blocked via `will-resize`
      preventDefault, toggle via `setContentSize`. Verified 116 ⇄ 420 exact.
      New `renderer/focus-mode.js`, IPC `win:set-compact`, store key `focusMode`
- [x] 4. Search history — store key `searchHistory` (10 entries, MRU). Dropdown under
      search input when focused+empty; saved on successful search. In `search-ui.js`
- [x] 5. Queue drag & drop — `queue-manager.moveTrack(from,to)` (index-pointer fixups),
      `renderTrackList` gains `onReorder` opt (HTML5 DnD), queue list only
- [x] 6. Listening stats + smart re-rank + dislike — new `renderer/track-scoring.js`:
      plays/skips/earlySkips per track (ended or >80% = play; <10s = early skip −5;
      <30s = skip −2; favorite +10). Store key `trackStats` (pruned at 500).
      `rankUpNext()` filters disliked/negative + boosts liked artists; wired into
      `radio-autoplay.js`. 👎 button in controls row (mark + auto-next)
- [x] 7. Lyrics — new `main/lyrics-fetch.js` (LRCLIB, keyless, fetch in main since page
      CSP blocks renderer connect). Synced LRC parsed to [{t,text}]. New
      `renderer/lyrics-ui.js`: overlay over player, highlight + autoscroll on tick,
      click line to seek. Button in controls row. Verified: 93 synced lines fetched
- [x] 8. Wiring: store keys, preload allowlist, ipc-handlers, icons, index.html, styles,
      package.json check script
- [x] 9. Verify: `npm run check` PASS, verify-app.cjs PASS (no console errors),
      e2e-playback-test.cjs ALL PASS, feature-check (lyrics/focus/history/els) PASS
- [x] 10. code-reviewer (DONE_WITH_CONCERNS → all fixed: H1 web-mode media keys routed
      to web window; M1 dislike-at-queue-end extends radio; M2 lyrics btn hidden in
      focus mode; M3 pagehide flush for scoring). docs-manager updated README,
      codebase-summary, manual-test-checklist

## Post-release user feedback round (260611-1131)

- [x] REMOVED lyrics feature entirely (user: app too small, reading lyrics hurts eyes) —
      deleted main/lyrics-fetch.js + renderer/lyrics-ui.js, stripped IPC/preload/HTML/CSS/
      icons/docs. Controls row decluttered
- [x] FIXED empty-state heart: favorite icon only rendered on track change → blank circle
      with empty queue. Default ICONS.heart now set in applyStaticIcons
- [x] Drag & drop extended to ALL tabs: favorites (persisted), playlists (playlist order +
      tracks inside, persisted), results (display-order only). Shared moveItem() in
      format-utils.js; queue keeps its own moveTrack (current-pointer fixups)

## Full-feature e2e suite (260611-1144)

- [x] NEW scripts/e2e-feature-suite.cjs — 2-phase CDP suite, backs up + restores user store.
      Phase `run`: 21/21 PASS (boot icons, waveform per-track, search+history+dropdown,
      radio queue 31 tracks, earlySkip scoring, dislike flag+advance, favorites ♥+DnD,
      queue DnD+pointer, playlist create/add/DnD, results DnD, repeat persist, web mode
      window, focus mode 116⇄420). Phase `verify-restore` after app restart: 4/4 PASS
      (queue/index/repeat intact, track cued no-autoplay). 0 console errors.
- Manual-only items (docs/manual-test-checklist.md): hardware media keys + Ctrl+Alt
  combos, real-mouse drag feel, pin-on-top over other apps, web-mode Google login
  persistence, hotkeys→web-mode routing.

## Bugfix round (260611-1211): "playback stopped" instantly on song pick

- [x] ROOT CAUSE: error-handler loop guards (consecutiveSkips, altAttempts/altSongKey)
      are module state, only reset on successful PLAYING or end-of-queue. A blocked song
      that never plays leaves them maxed forever → next pick inherits maxed counters →
      instant "playback stopped", nothing tried. Confirmed via double-repro on one instance.
- [x] FIX: resetGuards() extracted (DRY w/ clearPlayerError); handlePlayerError resets when
      now − lastFailureAt > EPISODE_GAP_MS (10s) = fresh episode. Intra-storm errors ~4–6s
      apart still accumulate (loop guard intact). MAX_ALTERNATIVE_TRIES 2→3.
- [x] VERIFIED: RUN2 (the bug trigger) now recovers to a playable track instead of
      dead-ending. See plans/reports/debugger-260611-1211-binh-yen-playback-stopped.md
- [x] FOLLOW-UP (user: "bài tôi muốn nghe thì không nghe được à?"): probe-then-pick
      implemented. NEW renderer/embed-probe.js — veto probe (hidden players never reach
      PLAYING, but blocked ones still fire 150 in ~1-2s → error=blocked, silence=playable;
      validated vs control). tryAlternativeVersion: up to 3 rounds × search-excl-duds →
      parallel veto-probe 5 → swap to first survivor. VERIFIED: "Bình Yên" now plays the
      picked song (~5s probing, swapped to playable compilation, id persisted). e2e ALL PASS.
      Limitation: survivor may be a compilation video (continues past the song).

## Dual playback backend (260611-1251): blocked songs ALWAYS play

- [x] User proposal: hidden web mode as backend B. Architecture: renderer/playback-router.js
      (player-controller's exact API; queue/app/scoring import it) routes per track —
      iframe embed (A, default) vs hidden music.youtube.com window (B, store webOnlyIds).
      main/web-playback-backend.js: navigate watch?v=, 1s executeJavaScript poll →
      webplay:status stream; ended = video.ended OR ytmusic auto-advanced (vid changed);
      transport via webplay:control; volume pinned to mini slider; paused-at-0 nudge.
- [x] Critical enabler: backgroundThrottling:false on the web window — pins page
      visibilityState 'visible', so YT Music plays in a never-shown window (the same
      visibility gating that broke hidden IFRAME embeds does not apply).
- [x] error-handler: probe-exhausted blocked tracks → forceWeb (id persisted) instead of
      skip. Mini player area shows "Playing via YouTube Music" notice while B is active.
- [x] exitWebMode playbackGuard: closing the visible web window must not pause backend B.
- [x] e2e (temp test-web-backend.cjs): 7/7 PASS — hidden window plays (t advances),
      mini clock ticks, notice shown, mini play/pause + seek control the hidden video.
      verify-app smoke clean after final restart; user store restored from snapshot.
- Caveats: logged-out web playback can include ads (Premium login in web mode removes);
  if backend B's load never produces status (offline), playback stalls without auto-skip.

## Ad blocking (260611-1305)

- [x] uBlock Origin itself can't run in Electron (no chrome.webRequest for extensions) —
      used @ghostery/adblocker-electron (same uBO/EasyList lists, session.webRequest).
      NEW main/ad-blocker.js: armed on persist:ytmusic + default session; lists cached in
      userData; init failure non-fatal (fire-and-forget at startup).
- [x] YouTube VIDEO ads (same domains as music) killed in-page: web-playback-backend poll
      detects .ad-showing → currentTime=duration + click Skip; ad gates ended/ticks so an
      ad's <video> end can't advance the queue.
- [x] VERIFIED: doubleclick ad server BLOCKED, IMA ads SDK BLOCKED, music.youtube.com
      ALLOWED (fetch probes from the ytmusic session); web-backend e2e still 7/7 PASS.

## Loudness match: embed too quiet vs web (260611-1543)

- [x] User: embed nghe nhỏ, web to. MEASURED: set-gain already forced video.volume=1
      (old fix won) but still quiet → cause is YouTube embed "stable volume", applied
      UPSTREAM of element volume. Embed exposes per-track
      getPlayerResponse().playerConfig.audioConfig.loudnessDb (e.g. -4.71) +
      getStatsForNerds volume_text "cont.-19.1dB tgt.-14.0dB". YouTube only attenuates
      loud tracks to -14 target, never lifts quiet ones → soft masters stay soft.
- [x] FIX: NEW main/embed-loudness.js — inject Web Audio makeup-gain (10^(-loudnessDb/20),
      clamp 1..3.5) + DynamicsCompressor limiter into the embed frame, lifting each track
      UP to target (never down — YT handles loud). Replaced player:set-gain body. Idempotent
      per <video>; try/catch falls back to element volume (never silent).
- [x] VERIFIED (6/6): loudnessDb -4.71 → makeup 1.720 EXACT; ctx running (audible);
      slider rides element volume (100→1.0, 50→0.5) with makeup constant; analyser tap on
      app gain node shows real post-makeup signal. createMediaElementSource confirmed
      same-origin OK inside embed frame.

## Backend B visual: artwork in player area (260611-1556)

- [x] User: backend B (YTM ẩn) khung player trống, embed thì có video. Decision (AskUser):
      "ảnh trước, video sau" — làm artwork ngay (gọn, bền), tách video overlay thành việc sau.
- [x] #web-art overlay (z6, dưới panel z10): blurred cover backdrop + centered art +
      "Playing via YouTube Music" caption. app.js updateWebArt() shown when isWebPlayback()
      (incl. boot-cued web tracks, no blank gap), hidden when iframe owns playback.
- [x] VERIFIED (6/6): web-art shown w/ real album art (loaded) + backdrop + caption for
      webOnly track; hidden when switching to embeddable track. Screenshot: bình yên cover.
- DEFERRED: real video overlay (WebContentsView) — own sub-project; fragility + panel
  z-coordination not worth bundling now.
- Known minor: a URL-pasted web-backend track shows raw id in titlebar (web backend has no
  metadata channel); search/queue-sourced tracks carry their title so unaffected.

## Remove alternative-upload probe — blocked → exact song via YTM (260611-1606)

- [x] User: "tìm nhạc một đường, phát một nẻo" — blocked song was searching OTHER uploads
      (title+channel general search) → landed on covers/tutorials/compilations (wrong song,
      e.g. "Lối Nhỏ guitar tutorial" for Bình Yên). The probe/alternative path predated
      backend B; once backend B is bulletproof it's not just redundant but HARMFUL.
- [x] FIX: blocked embed (101/150) → forceWeb(SAME id) immediately. No alt-search, no probe.
      100/2/5 (dead video) still skip. DELETED renderer/embed-probe.js, tryAlternativeVersion
      + alt-state + songQueryOf in error-handler, queue-manager.replaceCurrentTrack,
      youtube-search.findAlternativeVideos, search:alternative IPC + preload.searchAlternative.
      error-handler 159→~110 lines.
- [x] VERIFIED (6/6): blocked PkgYe-QMXIo → backend B plays watch?v=PkgYe-QMXIo (SAME id);
      queue id unchanged; webOnlyIds remembers it; artwork = correct bình yên cover; hidden
      video advancing. Faster too (no ~5s probe). Net deletion this round.

## Key decisions

- Double-click-titlebar pin toggle DROPPED: Electron drag regions swallow mouse events;
  📌 button already covers it
- Hotkeys steal media keys system-wide while app runs — acceptable for a music app
- Scoring needs no AI: local counters + InnerTube up-next as candidate source
- Lyrics matching: strip (…)/[…]/"| …" noise from titles, " - Topic" from channels;
  /api/get with duration first, /api/search fallback

## Files

Create: main/global-shortcuts.js, main/lyrics-fetch.js, renderer/track-scoring.js,
renderer/lyrics-ui.js, renderer/focus-mode.js
Modify: waveform.js, search-ui.js, queue-manager.js, ui-elements.js, radio-autoplay.js,
app.js, icons.js, index.html, styles.css, store-manager.js, ipc-handlers.js,
window-manager.js, preload.cjs, package.json, README.md
