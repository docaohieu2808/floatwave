# Research Report: Electron YouTube Mini-Player Desktop App (Windows 10)

**Date:** 2026-06-10  
**Status:** Greenfield project  
**Environment:** Windows 10, Node.js, Electron 41 (Chromium 146)

---

## 1. Playing YouTube Videos in Electron

### YouTube IFrame Player API Compatibility

**Finding:** YouTube IFrame Player API works reliably in Electron renderer processes via standard `<iframe>` embedding (recommended) or WebContentsView (advanced).

**Key Technical Details:**
- **postMessage Support:** Electron uses Chromium, so postMessage is fully supported. YouTube requires `enablejsapi=1` query parameter on iframe src.
- **Origin & CORS:** Unlike browser-based embedding, Electron apps have two main strategies:
  1. **iframe route (RECOMMENDED for mini-player):** Direct youtube.com/embed/{videoId}?enablejsapi=1 embedding. No custom protocol needed; YouTube accepts Electron's Chromium origin.
  2. **WebContentsView route:** Main process controls a separate Chromium context for YouTube content. More overhead but provides stronger isolation.
  3. ~~Custom protocol (e.g., `app://`)~~ **Not needed.** YouTube IFrame Player doesn't work across custom schemes due to postMessage origin validation.

**Status quo (Electron 41/Chromium 146):**
- YouTube IFrame Player API fully functional in iframe embeds
- postMessage origin checks: YouTube allows `file://` protocol in development but production embeds require valid origins. Electron's standard scheme registration (`registerSchemesAsPrivileged` with `standard: true`) works.
- **Autoplay Policy:** YouTube blocks unmuted autoplay without user interaction. If autoplay is desired, mute video first via `setVolume(0)` or use `onAutoplayBlocked` event to detect browser blocks.
- **User-Agent:** No special tricks needed; Electron's default Chromium user-agent is accepted by YouTube.

### "Video Unavailable / Embed Disabled" Handling

**Root Cause:** Video owner disabled embedding in YouTube video settings (not privacy/licensing issue).

**Detection & Mitigation:**
- YouTube returns `onError` event with error code `150` (iframe disabled by owner).
- **Handler Strategy:** Listen to `onError` callback; when code 150 fires, display fallback UI: "Video owner disabled embedding. [Open on YouTube →]" link with `https://www.youtube.com/watch?v={videoId}`.
- No programmatic workaround exists (by design).

### Recommended Implementation Approach

**Architecture:** Plain `<iframe>` with YouTube IFrame API library wrapper.

```html
<iframe id="player" 
  width="320" height="400"
  src="https://www.youtube.com/embed/{videoId}?enablejsapi=1"
  allow="autoplay"
  frameborder="0"></iframe>
```

**Why:** Minimal dependencies, native YouTube compatibility, no custom protocol overhead. WebContentsView adds complexity without benefit for a mini-player.

---

## 2. YouTube Search Without Official API Key

### Library Evaluation (as of June 2026)

| Library | Version | Last Update | Status | Notes |
|---------|---------|-------------|--------|-------|
| **youtube-sr** | 4.3.12 | ~10 months ago | **ACTIVE** | Scraper-based, simple, maintained regularly |
| **ytsr** | 3.8.4 | 3+ years ago | ❌ **ABANDONED** | Do not use |
| **yt-search** | ~2.x | Varies | ⚠️ Uncertain | Fragmented package ecosystem |
| **youtubei.js** | 17.0.1 | ~3 months ago (Mar 2026) | **ACTIVELY MAINTAINED** | Full InnerTube API wrapper, YouTube Music support, most feature-rich |
| **ytmusic-api** | — | — | ⚠️ Music-only | Overkill if search-only needed |

### Primary Recommendation: `youtube-sr`

**Why youtube-sr:**
- **Pros:** Simple, scraper-based (no API key), last updated 10 months ago, small surface area, low maintenance risk.
- **Cons:** Scraper fragility (YouTube HTML changes can break parsing); no official support for all content types.
- **Install:** `npm install youtube-sr`
- **Usage:** `const sr = require('youtube-sr'); const results = await sr.search('query');`

### Fallback Recommendation: `youtubei.js`

**Why as fallback:**
- **Pros:** Uses YouTube's private InnerTube API (more stable than scrapers), actively maintained (last update Mar 2026), supports YouTube, YouTube Music, YouTube Kids.
- **Cons:** Larger bundle, steeper learning curve, InnerTube API can change without notice (but community monitors).
- **Install:** `npm install youtubei.js`
- **Usage:** Via `Innertube` client; search returns metadata directly.

### Architectural Decision: Run in Main Process

**Location:** YouTube search (IPC call from renderer → main process via `ipcRenderer.invoke()`)

**Why:**
- youtube-sr is Node.js-only (uses `fetch` under the hood or npm http libraries).
- Renderer process ≠ Node.js environment; no native module access.
- Main process can fetch without CORS restrictions (server context).
- IPC overhead negligible for search (few invocations per session).

**Pattern:**
```javascript
// main.js
ipcMain.handle('search-youtube', (event, query) => {
  const sr = require('youtube-sr');
  return sr.search(query);
});

// renderer.js
const results = await window.ipcRenderer.invoke('search-youtube', 'query');
```

---

## 3. Electron App Shell Specifics

### Frameless Window + Custom Titlebar

**Frameless Configuration:**
```javascript
const win = new BrowserWindow({
  frame: false,
  width: 340,
  height: 420,
  minWidth: 280,
  minHeight: 350,
  webPreferences: { preload: 'preload.js' }
});
```

**Custom Titlebar Drag Region:**
```css
#titlebar {
  -webkit-app-region: drag;
  user-select: none;
}
#titlebar button {
  -webkit-app-region: no-drag;
}
```

**Windows 10 Notes:**
- Frameless + transparent = flashing on tray open (issue #22691). **Solution:** Set `transparent: false` or add background color in HTML.
- Frameless windows on Windows 10 respect native drag from any `-webkit-app-region: drag` area; no special tricks needed.

### Window Constraints for Mini-Player (340x420)

**Electron 41 Behavior:**
- Min/max constraints now enforced at window creation time.
- Set both `minWidth`/`maxWidth` and `minHeight`/`maxHeight` to lock aspect ratio if desired.
- For a fixed mini-player, use `resizable: false` to prevent user resizing entirely.

```javascript
const win = new BrowserWindow({
  frame: false,
  width: 340,
  height: 420,
  resizable: false, // Recommended for fixed mini-player
  webPreferences: { ... }
});
```

### alwaysOnTop for Windows 10

```javascript
win.setAlwaysOnTop(true);
```

**Behavior:** Window floats above all others, including when unfocused. Suitable for mini-player overlay.

### System Tray Integration

**Basic Pattern:**
```javascript
const tray = new Tray('icon.png');
tray.on('click', () => {
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
  }
});
```

**Library:** Use `electron-tray-window` (npm) for pre-built tray window positioning near tray icon if building a more complex tray UX.

### electron-store (Data Persistence)

**Current State (June 2026):**
- **Version 10.x:** Pure ESM (no CommonJS export).
- **Electron Compatibility:** Electron 28+ supports ESM in main process. Set `"type": "module"` in package.json.
- **Renderer Process:** electron-store v10 does NOT work in renderer (no Node.js context). Use IPC to access settings from main process.

**Recommendation:**
```javascript
// main.js (type: "module")
import Store from 'electron-store';
const store = new Store();

ipcMain.handle('get-setting', (event, key) => store.get(key));
ipcMain.handle('set-setting', (event, key, value) => store.set(key, value));

// renderer.js
await window.ipcRenderer.invoke('set-setting', 'volume', 50);
```

**Alternative (if CJS required):** electron-store v9.x (CommonJS) but v10 is recommended for new projects.

### Scaffolding Recommendation: Plain Electron (KISS Principle)

**Evaluated Options:**

| Option | Complexity | Build Setup | Recommendation |
|--------|-----------|-------------|-----------------|
| **Plain Electron + Vanilla JS** | Minimal | Manual vite.config.js | ✅ **CHOOSE THIS** |
| **electron-vite** | Low-Medium | Pre-configured Vite | Good if team knows Vite |
| **Electron Forge + Vite** | Medium | Full scaffolding + packaging | Over-engineered for mini-player |

**Why Plain Electron:**
- Mini-player is small (~500-1000 LOC total).
- Vite overkill for single HTML file + few JS modules.
- Vite adds 5+ dependency layers; plain Electron is 1 layer.
- YAGNI: Packaging/distribution comes later (phase 2).
- **Setup:** Create git repo, add `electron` + `youtube-sr` + `electron-store` to package.json, write main.js + index.html + preload.js. Done.

**Minimal package.json:**
```json
{
  "type": "module",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --remote-debugging-port=9222"
  },
  "dependencies": {
    "youtube-sr": "^4.3.12",
    "electron-store": "^10.0.0"
  },
  "devDependencies": {
    "electron": "^41.0.0"
  }
}
```

**No Vite needed** for development. Use Chrome DevTools via remote debugging port if needed.

---

## 4. YouTube IFrame API Control Surface

### Available Methods (Verified from Official Docs)

**Playback Control:**
- `playVideo()` — Start playback of cued video.
- `pauseVideo()` — Pause current video.
- `stopVideo()` — Stop and unload video.

**Seeking:**
- `seekTo(seconds, allowSeekAhead)` — Jump to timestamp. `allowSeekAhead=true` allows seeking past buffered range.

**Volume:**
- `setVolume(0-100)` — Set volume as integer.
- `getVolume()` — Get current volume.
- `mute()` / `unMute()` — Toggle mute.

**Time & Duration:**
- `getCurrentTime()` — Elapsed seconds (number). Returns 0 if not started.
- `getDuration()` — Total video duration in seconds (number). Returns 0 if metadata not loaded.

**State Monitoring:**
- `onStateChange` — Event fired when player state changes. Values:
  - `-1` = unstarted
  - `0` = **ended** ← Use this to detect track-end and advance queue
  - `1` = playing
  - `2` = paused
  - `3` = buffering
  - `5` = video cued

**Load Video:**
- `loadVideoById(videoId, startSeconds)` — Load and play video from queue.

### Autoplay Behavior in Electron

**Default:** Autoplay works in Electron **without user gesture** due to Chromium's autoplay policy:
- Electron runs with `--autoplay-policy=user-gesture-required` by default.
- **Workaround:** Pass `--autoplay-policy=no-user-gesture-required` app flag if autoplay on load is required.

```javascript
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
```

**Better Approach:** Mute video on load if autoplay desired (follows browser best practices):
```javascript
player.setVolume(0);
player.playVideo(); // Works without user gesture when muted
```

### Queue Implementation Pattern

```javascript
let currentQueueIndex = 0;
const queue = []; // Array of videoIds

function onPlayerStateChange(event) {
  if (event.data === 0) { // 0 = ended
    currentQueueIndex++;
    if (currentQueueIndex < queue.length) {
      player.loadVideoById(queue[currentQueueIndex]);
    }
  }
}

player.addEventListener('onStateChange', onPlayerStateChange);
```

---

## Summary: Recommended Architecture

### Tech Stack
- **Framework:** Plain Electron 41 (no Vite/Forge)
- **Search:** youtube-sr (primary), youtubei.js (fallback)
- **Playback:** YouTube IFrame Player API in `<iframe>`
- **Storage:** electron-store v10 (ESM, main process)
- **Window Shell:** Frameless, custom titlebar via CSS `-webkit-app-region`
- **IPC Pattern:** Main ↔ Renderer via ipcMain/ipcRenderer

### File Structure
```
youtube-miniplayer/
├── main.js                 # Main process, IPC handlers, store
├── preload.js             # Context bridge (ipcRenderer)
├── index.html             # UI + iframe player
├── renderer/
│   ├── player.js          # Player state machine
│   ├── search.js          # Search input + results
│   └── styles.css         # Titlebar drag regions
├── package.json
└── .eslintrc.json         # Optional
```

### Development Workflow
```bash
npm install
npm start                 # Run with Electron
# For debugging: npm run dev (opens remote DevTools port)
```

### Build Phase (Later)
Use Electron Forge when packaging for distribution (phase 2).

---

## Unresolved Questions / Edge Cases

1. **YouTube Music vs YouTube Videos:** Project uses `youtube.com/embed`. YouTube Music requires music.youtube.com domain and different API. **Decision needed:** Music-only or general YouTube? (Affects library choice: ytmusic-api vs youtube-sr.)

2. **Referrer Policy & Geographic Restrictions:** Some videos block embedding from certain regions or require specific Referer headers. **Current approach:** Direct embed accepts Electron's Chromium origin; may need testing with regional content.

3. **Offline Search History:** Should search history (recent queries) be stored locally? **Requires:** electron-store key for history array; IPC getter. Currently assumed no offline search needed.

4. **User Authentication / Liked Videos:** YouTube login is out of scope for embed-only player, but "like" functionality requires YouTube API. **Current approach:** Playback-only, no user features. Confirm scope.

5. **Update Strategy:** Plain Electron requires manual update implementation (electron-updater library). **Decision pending:** Do you need auto-updates for desktop distribution?

---

## Sources Consulted

- [YouTube IFrame Player API Reference](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube Embedded Players and Player Parameters](https://developers.google.com/youtube/player_parameters)
- [youtube-sr npm package](https://www.npmjs.com/package/youtube-sr)
- [youtubei.js npm package](https://www.npmjs.com/package/youtubei.js)
- [Electron Releases](https://releases.electronjs.org/)
- [Electron Window Customization](https://www.electronjs.org/docs/latest/tutorial/window-customization)
- [Electron Web Embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds)
- [Electron IPC Documentation](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron Protocol API](https://www.electronjs.org/docs/api/protocol)
- [Electron 41 Release Notes](https://www.electronjs.org/blog/electron-41-0)
- [electron-store npm package](https://www.npmjs.com/package/electron-store)
- [electron-vite GitHub](https://github.com/electron-vite)
- [Electron Forge Documentation](https://www.electronforge.io/)
