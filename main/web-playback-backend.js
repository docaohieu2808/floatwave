// Backend B: plays embed-blocked tracks through the REAL music.youtube.com in
// the (hidden) web-mode window — what's blocked is *embedding*, youtube.com
// itself always plays the same video. Unlike a hidden IFrame embed (which
// never starts — Chromium/YouTube gate embedded playback on visibility), the
// full YT Music app is built for background playback, so a hidden BrowserWindow
// plays fine (backgroundThrottling off). The mini renderer stays the single UI:
// it gets a 1s 'webplay:status' stream and sends transport commands; the
// playback-router maps both onto the same player interface.
let miniWin = null;
// injected — avoids a module cycle with web-mode-manager
let ensureWebWindow = null; // creates the hidden window when missing (load path)
let getWebWindow = null; // existing window or null (control path — never creates)
let active = false;
let targetId = null;
let desiredVolume = 1; // mini player's slider, 0..1, pinned onto the <video>
let pollTimer = null;
let nudges = 0;

// 500ms: snappy enough to mute/skip an ad within ~half a second of it starting,
// cheap enough for one hidden window. The nearEnd pre-empt margin (1.2s) stays
// safely above this.
const POLL_MS = 500;

// Status poll: transport state + the watch-page video id (if YT Music
// auto-advances to ITS next song, vid changes — that's our "ended").
// Video ads stream from the same domains as music, so the network ad-blocker
// can't fully stop them — the poll detects the player's ad state and kills the
// ad IN-PAGE the instant it's seen: MUTE first (no ad audio leaks while we
// skip), then fast-forward to its end + click any Skip button. A fast poll
// keeps the leak window tiny.
const STATUS_JS = `(() => {
  const v = document.querySelector('video');
  if (!v) return null;
  // ONLY ad-active markers — .ad-showing is on the html5 player while an ad
  // plays; .ytp-ad-player-overlay is the ad's click overlay. (Containers like
  // .video-ads / .ytp-ad-module are always present and must NOT be used.)
  const ad = !!document.querySelector('.ad-showing, .ytp-ad-player-overlay');
  if (ad) {
    v.muted = true; // silence the ad immediately, before fast-forward/skip
    if (Number.isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
    document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern')?.click();
  }
  return { ad, t: v.currentTime, d: v.duration || 0, paused: v.paused, ended: v.ended,
           muted: v.muted, vol: v.volume, vid: new URLSearchParams(location.search).get('v') };
})()`;

export function initWebPlayback(win, { ensure, getExisting }) {
  miniWin = win;
  ensureWebWindow = ensure;
  getWebWindow = getExisting;
}

export function isWebPlaybackActive() {
  return active;
}

function send(payload) {
  if (miniWin && !miniWin.isDestroyed()) miniWin.webContents.send('webplay:status', payload);
}

export function webPlayLoad(videoId, volume) {
  const id = String(videoId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return false;
  if (!miniWin || miniWin.isDestroyed() || !ensureWebWindow) return false;
  if (Number.isFinite(Number(volume))) desiredVolume = Math.min(1, Math.max(0, Number(volume)));
  const webWin = ensureWebWindow(miniWin); // created hidden, never shown here
  targetId = id;
  active = true;
  nudges = 0;
  webWin.loadURL(`https://music.youtube.com/watch?v=${id}`);
  startPolling(webWin);
  return true;
}

function startPolling(webWin) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!active || webWin.isDestroyed()) return stopWebPlayback();
    const s = await webWin.webContents.executeJavaScript(STATUS_JS, true).catch(() => null);
    if (!s) return; // still navigating — keep waiting
    // ad being skipped: its <video> hitting ended must NOT count as track end,
    // and its bogus times must not reach the UI — wait for the real song
    if (s.ad) return;
    // End handling. The KEY fix for "the background sings a different song":
    // YT Music auto-advances to ITS OWN radio the instant a song's <video>
    // fires 'ended', and a 1s poll lets ~1s of that wrong song leak out before
    // we can react. So we PRE-EMPT: treat "within ~1.2s of the end" as ended
    // and pause now, before YTM gets to auto-advance. (margin > poll interval
    // so it reliably lands before the real end.) `s.ended` and a vid change
    // (YTM already jumped) remain backups for anything that slips through.
    const nearEnd = s.d > 0 && s.t >= s.d - 1.2;
    if (s.ended || nearEnd || (s.vid && s.vid !== targetId)) {
      stopWebPlayback(); // pauses + stops polling BEFORE the renderer advances
      send({ ended: true });
      return;
    }
    // real song (no ad): hidden windows sometimes need a kick to start, and the
    // volume must follow the slider. Also un-mute here — the ad path muted the
    // element, so the real song must be explicitly restored to the user volume.
    const v = 'document.querySelector("video")';
    if (s.paused && s.t < 0.5 && nudges < 6) {
      nudges += 1;
      webWin.webContents.executeJavaScript(`${v}?.play()`, true).catch(() => {});
    }
    if (s.muted || Math.abs(s.vol - desiredVolume) > 0.01) {
      webWin.webContents
        .executeJavaScript(`(() => { const x = ${v}; if (x) { x.muted = false; x.volume = ${desiredVolume}; } })()`, true)
        .catch(() => {});
    }
    send({ t: s.t, d: s.d, paused: s.paused });
  }, POLL_MS);
}

export function webPlayControl(action, value) {
  if (action === 'volume') {
    // remembered even while inactive — applied on the next poll/load
    desiredVolume = Math.min(1, Math.max(0, Number(value) || 0));
    return true;
  }
  if (!active) return false;
  const webWin = getWebWindow?.(); // controls never create a window
  if (!webWin) return false;
  const v = 'document.querySelector("video")';
  const js = {
    play: `${v}?.play()`,
    pause: `${v}?.pause()`,
    toggle: `(() => { const x = ${v}; if (x) x.paused ? x.play() : x.pause(); })()`,
    seek: `(() => { const x = ${v}; if (x) x.currentTime = ${Number(value) || 0}; })()`,
  }[action];
  if (!js) return false;
  webWin.webContents.executeJavaScript(js, true).catch(() => {});
  return true;
}

export function stopWebPlayback() {
  clearInterval(pollTimer);
  pollTimer = null;
  if (active) webPlayControl('pause'); // no-op when the window is already gone
  active = false;
  targetId = null;
}

// Web mode shows the SAME hidden window that's already sounding. Suspend ONLY
// the poll (which drives the mini queue and pre-empts a pause near the track
// end) so the user's now-visible video plays through untouched — active,
// targetId and the window stay, so the audio never stops.
export function suspendWebPlayback() {
  clearInterval(pollTimer);
  pollTimer = null;
}

// Back to the mini player: re-attach the poll on the still-playing window so
// ticks + end-detection resume mid-song with no reload (position preserved).
// Returns false when there's nothing live to resume (e.g. the hidden window
// died while in web mode) — the caller then falls back to reload-on-Play.
export function resumeWebPlayback() {
  if (!active || !targetId) return false;
  const webWin = getWebWindow?.(); // existing window only — never created here
  if (!webWin) return false;
  startPolling(webWin);
  return true;
}
