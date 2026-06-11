# Two UX bugs: silent-on-play, and ad leak in web mode

## Bug 1 — click play after restart = silent until you touch the volume slider

Cause: the embed loudness normalizer (embed-loudness.js) routes the YouTube
`<video>` through a Web Audio graph via `createMediaElementSource`. That reroute
makes ALL element audio flow through the graph — and an AudioContext that has not
been unlocked by a REAL user gesture outputs nothing. The play button lives in
the parent frame, so its gesture never unlocks the cross-origin embed frame's
context → silent. Dragging the volume slider was the only thing that unlocked it
(its handler hit the audio path within a genuine gesture). The earlier
autoplay-policy switch + `userGesture:true` were not sufficient for the
cross-origin frame.

Repro note: puppeteer trusted clicks auto-grant activation, so the bug can't be
reproduced there (audio always flows). Confirmed mechanism instead: video element
itself is never muted on cue (muted:false, vol 0.7, plays) — the sound is trapped
in the un-unlocked Web Audio graph.

Fix: build the Web Audio graph ONLY on an explicit volume interaction
(`applyElementGain(true)` from the slider `input` handler). Boot/PLAYING calls pass
`build=false` → no reroute, the element plays normally (audible). Loudness engages
after the first volume touch and persists for the session. Playback is therefore
never silent on play.
Threaded `build` through: app.js → preload setGain(value,build) → ipc
player:set-gain → embed-loudness applyEmbedLoudness/injected.

Verify (6/6): play w/o volume → no graph, video playing, not muted, audible;
volume input → graph built (running ctx), makeup 1.72 applied, v.volume=slider.

## Bug 2 — web mode (♪) plays ~1-2s of ads despite the ad-blocker

Cause: self-inflicted. When fixing the earlier ad-blocker "second handler" crash I
disabled cosmetic filtering entirely. But cosmetic filtering = CSS hiding +
SCRIPTLET injection, and the scriptlets are what actually neutralize YouTube's
VIDEO ads (they stream from the music domains, so network filtering can't touch
them). Web mode has no in-player ad skipper (only backend B's poll does), so it
relied on the scriptlets → ads leaked once cosmetic was off.

Fix: enable cosmetic filtering for the `persist:ytmusic` session only (web mode +
backend), network-only for the default session. The "second handler" crash is
avoided by toggling `config.loadCosmeticFilters` true→false between the two
`enableBlockingInSession` calls, so the global cosmetic ipcMain handler is
registered exactly once.

Verify: no init error in main log; ytmusic session blocks doubleclick ad server +
IMA SDK. Core playback regression ALL PASS.

## Unresolved
- Loudness boost now only applies after the first volume interaction of a session
  (a track played on launch is audible but un-boosted until the slider is touched).
  Accepted trade-off vs. the silence bug.
