# Release Checklist

Use this before publishing a free GitHub Release.

## Before Build

- Confirm the README positions FloatWave as unofficial, lightweight, and free.
- Keep ad handling out of the headline and release title.
- Confirm `PRIVACY.md` is up to date.
- Confirm screenshots are current and do not show private account data.
- Run a short manual playback check on Windows.

## Build

```powershell
npm run release:win
```

Expected checks:

- `npm run check` passes.
- `npm run dist` creates the installer.
- `npm run checksum` creates `dist/checksums.sha256`.

## Verify Artifacts

```powershell
Get-ChildItem dist
Get-FileHash "dist\FloatWave Setup 1.0.0.exe" -Algorithm SHA256
Get-AuthenticodeSignature "dist\FloatWave Setup 1.0.0.exe"
```

If the signature status is `NotSigned`, say so in the release notes.

## GitHub Release Copy

Suggested title:

```text
FloatWave 1.0.0 - lightweight floating player for Windows
```

Suggested body:

```text
FloatWave is a free, unofficial, lightweight floating mini-player for YouTube
and YouTube Music on Windows.

Highlights:
- Small always-on-top mini-player
- Queue, favorites, playlists, focus mode, and global media hotkeys
- Typical memory use on my Windows test machine: around 200-300 MB

Notes:
- This project is not affiliated with YouTube, Google, or YouTube Music.
- This build is unsigned, so Windows SmartScreen may show a warning.
- Verify the installer with checksums.sha256.
```

Upload:

- `FloatWave Setup 1.0.0.exe`
- `FloatWave Setup 1.0.0.exe.blockmap`
- `latest.yml`
- `checksums.sha256`
