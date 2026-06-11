# FloatWave

**Stream video, float music.** A frameless, always-on-top floating YouTube mini-player
for Windows. Plain Electron + vanilla JS — no bundler, no framework, no API key.

<img src="assets/floatwave.png" alt="FloatWave" width="96" />

![mini-player](plans/reports/e2e-screenshot.png)

## Features

- 340x420 frameless window, draggable titlebar, optional pin-on-top (📌 toggle, persisted)
- **Minimize to system tray:** the minimize button hides to a tray icon (click to restore); X quits
- **Focus mode:** compact titlebar-only view (340×116) — one-click collapse/expand, persisted
- **Music ⇄ Video search toggle** (🎵/🎬 left of the search box): Music = YouTube Music
  catalog (clean songs, mostly audio art-tracks); Video = real YouTube videos (MVs that
  actually play video). Persists. Or paste any YouTube link.
- **Web mode (♪):** embedded music.youtube.com in a floating window — sign in with your Google account, personal playlists/recommendations, login persists
- Play queue: add (`+`), remove, prev/next, auto-advance on track end
- Drag & drop reorder in every list — queue, favorites, playlists (tracks + playlist order), results
- Repeat modes: off / one / all
- Favorites with one-click toggle (♥) — dislike (👎) button skips + blocks re-suggestions
- **Global hotkeys:** media keys (MediaPlayPause/Next/Prev) + Ctrl+Alt+Space/Right/Left work system-wide
- **Smart suggestions:** radio/up-next re-ranks candidates — disliked/heavily-skipped dropped, liked artists boosted
- **Search history:** last 10 queries accessible in dropdown when input is empty
- **Waveform seek bar:** song-structure envelope + deterministic jitter for visual feedback
- Seek bar, current/total time, volume slider
- **Loudness matched:** embed playback is normalized up to YouTube's −14 dB target
  (per-track Web Audio makeup gain) so quiet masters aren't quiet — matches the web backend
- Everything persists across launches (queue, position, favorites, volume, repeat, focus mode, search history)
- **Embed-blocked songs still play:** when the owner disables embedding, the **exact same
  video** plays through a hidden music.youtube.com window (dual playback backend) — same
  mini-player UI, queue, and hotkeys throughout (no substituting a different upload)
- **Ad blocking:** uBO/EasyList filter lists at the network level (@ghostery/adblocker)
  plus an in-player video-ad auto-skipper for the web backend

## Quick start

```powershell
npm install
npm start
```

Dev mode (CDP debugging on port 9222):

```powershell
npm run dev
```

## How it works

- **Main process (ESM):** [main.js](main.js) boots a loopback static server
  ([main/local-server.js](main/local-server.js)) — YouTube rejects embeds from
  `file://` origins (player errors 152/153), so the shell is served over
  `http://127.0.0.1:<random port>`. Search runs in main via
  [main/youtube-search.js](main/youtube-search.js); persistence via
  `electron-store` in [main/store-manager.js](main/store-manager.js).
- **Preload:** [preload.cjs](preload.cjs) exposes an allowlisted `window.api`
  bridge (contextIsolation + sandbox enabled).
- **Renderer (vanilla JS):** [renderer/app.js](renderer/app.js) bootstraps;
  [renderer/player-controller.js](renderer/player-controller.js) wraps the
  YouTube IFrame Player API; queue/search/favorites/error modules are isolated.

## Verification

```powershell
npm run check                      # syntax-check every JS file
npm run dev                        # then, in another terminal:
node scripts/verify-app.cjs        # IPC + store + search + player smoke test
node scripts/e2e-playback-test.cjs # real playback e2e over CDP
node scripts/e2e-feature-suite.cjs run  # full feature suite (backs up + restores your store);
                                        # then restart the app and run:
node scripts/e2e-feature-suite.cjs verify-restore  # session-restore check + store restore
```

Manual checklist: [docs/manual-test-checklist.md](docs/manual-test-checklist.md)
Packaging (optional): [docs/packaging-note.md](docs/packaging-note.md)
