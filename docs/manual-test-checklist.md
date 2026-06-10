# Manual Test Checklist — YouTube Music Mini-Player

Run with `npm start`. Automated coverage: `npm run check`, `scripts/verify-app.cjs`,
`scripts/e2e-playback-test.cjs` (need `npm run dev`).

## Window shell
- [ ] Launch: 340x420 frameless dark window, always-on-top over other apps
- [ ] Titlebar drags the window; minimize + close buttons work
- [ ] Queue toggle (☰) opens/closes panel; Esc closes panel

## Playback
- [ ] Paste valid YouTube URL → video plays, real title/artist appear in titlebar
- [ ] Paste invalid URL (e.g. `https://example.com/x`) → "Not a valid YouTube link", no crash
- [ ] Play/pause toggles and icon flips
- [ ] Seek drag jumps position; time renders `m:ss`; total duration correct
- [ ] Volume slider changes loudness; 0 = muted
- [ ] Repeat cycles off → one → all (icon + tooltip update)

## Search & queue
- [ ] Keyword search → results list with thumbnail/title/channel/duration
- [ ] Click result → plays now; "+" → appends to queue without interrupting
- [ ] Queue tab: current highlighted; ✕ removes row; index stays correct
- [ ] Track end auto-advances; repeat `one` repeats; repeat `all` wraps at end
- [ ] Prev within first 3s goes to previous track; later restarts current
- [ ] Search with network down / youtube-sr broken → "Search failed" message, app usable

## Favorites & persistence
- [ ] ♥ toggles favorite; Favorites tab lists and plays them
- [ ] Relaunch app: queue, position, favorites, volume, repeat all restored
- [ ] Restored track is cued (no auto-blasting audio on launch)

## Error handling
- [ ] Embed-disabled video → fallback message + "Open on YouTube" button (opens browser) + auto-skips after ~1.5s
- [ ] Queue of all-blocked videos → stops after 3 consecutive skips with message (no infinite loop)
- [ ] Successful playback resets the skip counter and hides fallback
