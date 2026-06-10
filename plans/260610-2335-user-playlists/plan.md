---
title: "User-created playlists"
status: in-progress
created: 2026-06-10
---

# User Playlists

Search song-by-song, add each into named persistent playlists. Extends queue/favorites model.

## Design
- Store: `playlists: [{name, tracks:[{id,title,channel,duration,thumbnail}]}]` (electron-store, new key).
- Row `+` button now opens an "Add to…" chooser overlay: Current queue / each playlist / create-new-name input.
  Unifies add-to-queue and add-to-playlist behind one affordance.
- 4th panel tab **Playlists**: list view (name + track count, ✕ delete) → detail view (back header,
  play-all, track rows with ✕ remove). Clicking a playlist track replaces the play queue with that
  playlist starting at the clicked song (playlist-as-queue, standard player semantics).
- `renderTrackList` opts migrate from single action to `actions: [{label,title,onClick}]` (all call sites).
- queue-manager adds `playAt(index)` (also fixes queue-panel click with duplicate ids — was playNow/id-dedup).
- New module renderer/playlists-ui.js (state, chooser, tab renders). app.js wires tab + init.

## Files
Create: renderer/playlists-ui.js. Modify: main/store-manager.js, renderer/ui-elements.js,
renderer/search-ui.js, renderer/favorites-ui.js, renderer/queue-manager.js, renderer/app.js,
index.html, renderer/styles.css, package.json (check).

## Verification
- CDP diag: create playlist via chooser, add 2 searched tracks, switch tab, play-all, remove track,
  relaunch-persistence (store check). Regression: e2e playback + search suites.

## Status
- completed — diag-playlists.cjs ALL PASS (chooser create/add, tab views, play-all-as-queue,
  remove, delete, persistence); regression playback + search e2e ALL PASS.
