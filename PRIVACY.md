# Privacy

FloatWave is a local desktop app. It does not run a custom backend and does not
collect analytics.

## What Stays Local

FloatWave stores app preferences locally through `electron-store`, including:

- queue and current queue position
- favorites
- playlists
- volume and repeat mode
- focus mode and pin-on-top preference
- search history
- listening stats used for local suggestions

## Third-Party Services

FloatWave loads YouTube and YouTube Music content in Electron. Search,
playback, recommendations, sign-in, ads, cookies, account state, and media
delivery are handled by YouTube, YouTube Music, Google, and the Electron
Chromium runtime.

Web mode uses a persistent Electron session so Google sign-in can survive app
restarts. That session is stored on the user's machine by Electron.

## No Project Analytics

FloatWave does not send telemetry, crash reports, usage analytics, account data,
or listening history to a FloatWave-owned server.

## Clearing Data

Users can clear FloatWave data by deleting the app's Electron user data
directory for FloatWave from their Windows profile. Uninstalling the app may not
remove all user data, depending on the installer and Windows settings.
