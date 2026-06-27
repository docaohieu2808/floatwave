// Routes playback between two backends behind player-controller's exact API,
// so queue/UI/scoring code never knows which one is sounding:
//   A 'iframe' — YouTube IFrame embed in the mini window (default, ~all tracks)
//   B 'web'    — hidden music.youtube.com window (main/web-playback-backend),
//                for tracks PROVEN unplayable in embeds: what's blocked is
//                embedding, youtube.com itself always plays.
// Track ids land on backend B via forceWeb() (error-handler, after probing
// found no embeddable upload) and stay there (store key webOnlyIds) so future
// plays skip the whole error/probe dance.
import * as iframePlayer from './player-controller.js';

export const STATE = iframePlayer.STATE;

const listeners = { statechange: [], error: [], tick: [] };
let mode = 'iframe'; // backend that owns the CURRENT track
let webOnlyIds = new Set();
let webStatus = { current: 0, duration: 0 }; // last poll from the hidden window
let lastWebState = null; // dedupe statechange emissions from the 1s status stream
let webCuedId = null; // web track restored on boot — only starts on explicit play
let webPlayingId = null; // id currently routed to backend B — lets play()/toggle()
                         // re-arm it after a park or idle-free tore the backend down
let lastVolume = 50; // mini slider 0-100; web backend wants 0..1 at load time

export function on(event, handler) {
  listeners[event]?.push(handler);
}

function emit(event, payload) {
  for (const handler of listeners[event]) handler(payload);
}

// iframe events pass through ONLY while the iframe owns the track — a stopped
// iframe still emits CUED/PAUSED that would corrupt web-backend state.
for (const event of ['statechange', 'tick', 'error']) {
  iframePlayer.on(event, (payload) => {
    if (mode === 'iframe') emit(event, payload);
  });
}

export async function initRouter() {
  const stored = await window.api.getStore('webOnlyIds');
  webOnlyIds = new Set(Array.isArray(stored) ? stored : []);
  window.api.onWebPlayStatus(onWebStatus);
}

function onWebStatus(status) {
  if (mode !== 'web') return;
  if (status.ended) {
    lastWebState = STATE.ENDED;
    emit('statechange', STATE.ENDED); // queue advances exactly like an iframe end
    return;
  }
  webStatus = { current: status.t, duration: status.d };
  emit('tick', webStatus);
  const state = status.paused ? STATE.PAUSED : STATE.PLAYING;
  if (state !== lastWebState) {
    lastWebState = state;
    emit('statechange', state);
  }
}

function startWeb(videoId, { autoplay = true } = {}) {
  iframePlayer.stop(); // exactly one backend may ever sound
  mode = 'web';
  lastWebState = null;
  webStatus = { current: 0, duration: 0 };
  webPlayingId = videoId; // remember which track backend B owns (for re-arm)
  if (autoplay) {
    webCuedId = null;
    window.api.webPlay.load(videoId, lastVolume / 100);
  } else {
    webCuedId = videoId; // boot restore: no surprise audio from a hidden window
  }
}

export function load(videoId, { autoplay = true } = {}) {
  if (webOnlyIds.has(videoId)) return startWeb(videoId, { autoplay });
  if (mode === 'web') window.api.webPlay.stop();
  mode = 'iframe';
  webCuedId = null;
  webPlayingId = null;
  iframePlayer.load(videoId, { autoplay });
}

// Embed-probing exhausted every upload — remember the id and play via web.
export function forceWeb(videoId) {
  if (!videoId) return;
  webOnlyIds.add(videoId);
  window.api.setStore('webOnlyIds', [...webOnlyIds].slice(-200));
  startWeb(videoId);
}

export function isWebPlayback() {
  return mode === 'web';
}

// Entering the visible web-mode window: the mini player must step aside. If
// backend B owns the current track it plays through the SAME window we're about
// to show, so STOP its poll — left running it keeps advancing the mini queue
// behind the user and can reload this very page on the next embed-blocked track.
// If the iframe owns it, just pause it (it's in the mini window we hide).
export function parkForWebMode() {
  if (mode === 'web') {
    window.api.webPlay.stop(); // stop poll + pause + deactivate backend B
    // Backend B is now torn down, but leaving web mode must NOT leave the mini
    // Play button dead: re-cue this track so play()/toggle() reloads it (the
    // hidden window may also be idle-freed by the time the user comes back).
    webCuedId = webPlayingId;
  } else {
    iframePlayer.pause();
  }
}

export function play() {
  if (mode !== 'web') return iframePlayer.play();
  if (webCuedId) {
    const id = webCuedId;
    webCuedId = null;
    window.api.webPlay.load(id, lastVolume / 100);
  } else {
    window.api.webPlay.control('play');
  }
}

export function pause() {
  if (mode === 'web') window.api.webPlay.control('pause');
  else iframePlayer.pause();
}

export function toggle() {
  if (mode !== 'web') return iframePlayer.toggle();
  if (webCuedId) play();
  else window.api.webPlay.control('toggle');
}

export function seek(seconds) {
  if (mode === 'web') window.api.webPlay.control('seek', seconds);
  else iframePlayer.seek(seconds);
}

export function setVolume(value) {
  lastVolume = value;
  iframePlayer.setVolume(value); // keep both in sync — backend may switch any time
  window.api.webPlay.control('volume', value / 100);
}

export function stop() {
  if (mode === 'web') window.api.webPlay.stop();
  iframePlayer.stop();
}

export function getTimes() {
  return mode === 'web' ? { ...webStatus } : iframePlayer.getTimes();
}

export function getVideoData() {
  // web backend has no metadata channel; queue entries already carry titles
  return mode === 'web' ? { title: '', author: '' } : iframePlayer.getVideoData();
}

export function initPlayer() {
  return iframePlayer.initPlayer();
}

// Re-suggest HD to the iframe embed (web backend has no quality control)
export function nudgeQuality() {
  if (mode === 'iframe') iframePlayer.nudgeQuality();
}
