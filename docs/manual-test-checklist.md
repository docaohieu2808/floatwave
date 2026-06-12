# Manual Test Checklist — YouTube Music Mini-Player

Run with `npm start`. Automated coverage: `npm run check`, `scripts/verify-app.cjs`,
`scripts/e2e-playback-test.cjs` (need `npm run dev`).

## Window shell
- [ ] Launch: 340x420 frameless dark window, always-on-top over other apps
- [ ] Empty queue ("No track"): heart + dislike icons still render (not blank buttons)
- [ ] Titlebar drags the window; close (X) quits the app
- [ ] Minimize button HIDES the window to the system tray (no taskbar button);
      clicking the tray icon (or its "Show" menu) brings it back; tray "Quit" exits
- [ ] Single instance: launching FloatWave again (while open OR hidden in tray)
      surfaces the existing window — never a second window
- [ ] Queue toggle (☰) opens/closes panel; Esc closes panel
- [ ] Focus mode button (⊟ icon) collapses window to 340×116 (titlebar + controls only); click again to expand
- [ ] Focus mode state persists across app relaunch

## Playback
- [ ] Paste valid YouTube URL → video plays, real title/artist appear in titlebar
- [ ] Paste invalid URL (e.g. `https://example.com/x`) → "Not a valid YouTube link", no crash
- [ ] Play/pause toggles and icon flips
- [ ] Seek drag jumps position; time renders `m:ss`; total duration correct
- [ ] Volume slider changes loudness; 0 = muted
- [ ] Restart app while a track is loaded → click play → audio plays immediately (NOT silent;
      no need to touch the volume slider first)
- [ ] After first volume adjustment, quiet-mastered tracks are boosted to normal loudness
- [ ] Loud-mastered track is NOT over-boosted (no clipping/pumping)
- [ ] Repeat cycles off → one → all (icon + tooltip update)

## Search & queue
- [ ] Keyword search → results list with thumbnail/title/channel/duration
- [ ] Music/Video toggle (🎵/🎬 left of search): Music → YT Music songs (album art, no video
      for art-tracks); Video → real MV/video that plays 16:9 video in the embed; persists across relaunch
- [ ] Video search returns results for hard queries (e.g. "rồi em sẽ gặp chàng trai khác") —
      no "search failed" (youtubei.js video search, youtube-sr removed)
- [ ] Click result → plays now; "+" → appends to queue without interrupting
- [ ] Search history: focus empty search input → dropdown shows last 10 queries; click to search
- [ ] Queue tab: current highlighted; ✕ removes row; index stays correct
- [ ] Drag & drop reorder works in ALL four tabs: queue (persists, current-track pointer follows), favorites (persists), playlists (both playlist order and tracks inside, persist), results (display order only)
- [ ] Track end auto-advances; repeat `one` repeats; repeat `all` wraps at end
- [ ] Prev within first 3s goes to previous track; later restarts current
- [ ] Search with network down / youtube-sr broken → "Search failed" message, app usable

## Favorites & smart suggestions
- [ ] ♥ toggles favorite; Favorites tab lists and plays them
- [ ] 👎 dislike button: skips track + marks for never-suggest again
- [ ] Radio/up-next ranks after dislike/heavy-skip: disliked tracks dropped, heavily-skipped deprioritized, liked artists boosted
- [ ] Relaunch app: queue, position, favorites, volume, repeat, focus mode all restored
- [ ] Restored track is cued (no auto-blasting audio on launch)

## Global hotkeys
- [ ] Media keys (play/pause, next, prev) work system-wide while app window is not focused
- [ ] Ctrl+Alt+Space toggles play/pause globally
- [ ] Ctrl+Alt+Right advances to next track globally
- [ ] Ctrl+Alt+Left goes to previous track globally
- [ ] While web mode window is showing, media keys control music.youtube.com (play/pause/next/prev)
- [ ] Hotkeys work correctly after switching windows and coming back to mini-player

## Waveform & seek bar
- [ ] Seek bar shows song-structure envelope (visual audio visualization)
- [ ] Waveform appearance is consistent per track (deterministic, not random)
- [ ] Dragging seek bar jumps to position accurately
- [ ] Time display updates in real-time as track plays

## Error handling
- [ ] Embed-blocked song (e.g. "Bình Yên" - Vũ) → "finding a playable upload…" → SAME song
      plays from an alternative upload within ~5-15s (title keeps the picked song)
- [ ] Song with NO embeddable upload at all → "Playing via YouTube Music" notice + audio
      from the hidden web window; mini seek/volume/play-pause/next still control it
- [ ] Web-backend track: time ticks in mini UI; track end advances the mini queue
- [ ] Web-backend track: player area shows the track artwork (blurred backdrop + cover +
      "Playing via YouTube Music"), not a blank black box; hides when a normal track plays
- [ ] Opening web mode (♪) while a web-backend track plays shows it; closing the web
      window does NOT silence playback
- [ ] Ad blocking: web mode (logged out) shows no banner ads; a video ad in web mode is
      muted instantly and skipped within ~1s (in-page ad killer), not just on the backend
- [ ] Backend-B track with a pre-roll ad: ad is MUTED ~instantly and skipped within <1s
      (no audible ad), then the real song plays at the set volume — NOT muted/stuck
- [ ] Queue of all-blocked videos → stops after 3 consecutive skips with message (no infinite loop)
- [ ] Successful playback resets the skip counter and hides fallback
- [ ] Pick a blocked song, let it give up, pick another song minutes later → app still TRIES
      (no instant "playback stopped" from stale counters)
