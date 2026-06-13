# Packaging Note

FloatWave currently targets Windows through `electron-builder` and NSIS.

## Build

```powershell
npm install
npm run release:win
```

This runs:

1. `npm run check`
2. `npm run dist`
3. `npm run checksum`

Generated artifacts:

- `dist/FloatWave Setup <version>.exe`
- `dist/FloatWave Setup <version>.exe.blockmap`
- `dist/latest.yml`
- `dist/checksums.sha256`
- `dist/win-unpacked/`

## Code Signing

The current local build is not signed unless a signing certificate is configured
in the environment for `electron-builder`.

Unsigned Windows apps can trigger SmartScreen warnings. For public releases,
either:

- keep releases clearly marked as unsigned community builds, or
- configure Authenticode signing with a trusted certificate before publishing.

Verify signing status:

```powershell
Get-AuthenticodeSignature "dist\FloatWave Setup 1.0.0.exe"
Get-AuthenticodeSignature "dist\win-unpacked\FloatWave.exe"
```

## Release Notes

For GitHub Releases, include:

- short description: lightweight unofficial floating mini-player
- Windows version tested
- installer file
- `checksums.sha256`
- SmartScreen note if unsigned
- disclaimer that FloatWave is unofficial and not affiliated with YouTube,
  Google, or YouTube Music

Do not position the release as an official YouTube Music client.

## Data Location

`electron-store` writes app data under Electron's user data directory for
FloatWave. Existing queues, favorites, playlists, volume, repeat mode, search
history, and window preferences survive app updates.
