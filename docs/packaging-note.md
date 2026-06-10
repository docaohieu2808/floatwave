# Packaging Note (optional, not yet implemented)

v1 runs from source (`npm start`). To distribute a Windows build, use electron-builder:

```powershell
npm i -D electron-builder
```

`package.json` additions:

```json
{
  "scripts": { "dist": "electron-builder --win" },
  "build": {
    "appId": "com.hieudc.youtube-music-miniplayer",
    "files": ["main.js", "main/**", "preload.cjs", "index.html", "renderer/**"],
    "win": { "target": ["nsis", "portable"] }
  }
}
```

Then `npm run dist` → installer + portable exe in `dist/`.

Notes:
- `scripts/` (dev verification) and `plans/`/`docs/` should stay excluded from `files`.
- No code signing configured — Windows SmartScreen will warn on first run.
- electron-store data lives in `%APPDATA%/youtube-music-miniplayer/config.json` and
  survives app updates.
