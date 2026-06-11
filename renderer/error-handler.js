// Maps YouTube player error codes to fallback UI + recovery.
//
// Embed-disabled songs (codes 101/150 — label/ATV tracks error at PLAY time
// even when playability APIs say OK) play the EXACT same video through the
// hidden YouTube Music backend: only *embedding* is blocked, youtube.com always
// plays it. We deliberately do NOT hunt for other uploads of the song — a
// general search can substitute a cover / tutorial / compilation (wrong song),
// and backend B already plays the real track, so there's nothing to gain.
//
// Genuinely dead videos (2 invalid, 5 player error, 100 removed/private) can't
// be rescued by the web backend either, so those auto-skip (capped).
import { els } from './ui-elements.js';
import * as queueManager from './queue-manager.js';
import { forceWeb } from './playback-router.js';

const MAX_CONSECUTIVE_SKIPS = 3;
const SKIP_DELAY_MS = 1500;
// A failure this long after the previous one starts a FRESH episode: within a
// skip storm errors arrive every ~1.5–4s, so a longer gap means the user moved
// on (re-picked a song, came back later). Must exceed intra-storm spacing.
const EPISODE_GAP_MS = 10000;
// Embedding disabled by the owner → playable on youtube.com via backend B.
const EMBED_BLOCKED_CODES = new Set([101, 150]);

const MESSAGES = {
  2: 'Invalid video reference',
  5: 'Playback error in the player',
  100: 'Video not found or removed',
  101: 'Embedding disabled by the video owner',
  150: 'Embedding disabled by the video owner',
};

let consecutiveSkips = 0;
let failedVideoId = null;
let skipTimer = null;
let lastFailureAt = 0; // timestamp of the previous error, for episode detection

// The skip counter bounds a SINGLE stuck episode; if it leaks into the next one
// (e.g. the user re-picks after an earlier give-up) the app would refuse to even
// try. Reset on success (clearPlayerError) and at the start of a fresh episode.
function resetGuards() {
  consecutiveSkips = 0;
}

export function initErrorHandler() {
  els.btnOpenYoutube.addEventListener('click', () => {
    if (failedVideoId) {
      window.api.openExternal(`https://www.youtube.com/watch?v=${failedVideoId}`);
    }
  });
}

function showFallback(message, withOpenButton) {
  els.fallbackMessage.textContent = message;
  els.btnOpenYoutube.classList.toggle('hidden', !withOpenButton);
  els.fallback.classList.remove('hidden');
}

function scheduleSkip(message) {
  if (consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
    showFallback(`${message} — several queued videos failed, playback stopped.`, !!failedVideoId);
    return;
  }
  consecutiveSkips += 1;
  clearTimeout(skipTimer);
  skipTimer = setTimeout(() => {
    const advanced = queueManager.next();
    if (!advanced) consecutiveSkips = 0; // end of queue — nothing more to skip
  }, SKIP_DELAY_MS);
}

export function handlePlayerError(code, currentTrack) {
  // A failure long after the last one is a new episode — don't inherit a
  // maxed-out skip budget from a previous stuck song.
  const now = Date.now();
  if (now - lastFailureAt > EPISODE_GAP_MS) resetGuards();
  lastFailureAt = now;

  const message = MESSAGES[code] ?? `Playback error (code ${code})`;
  failedVideoId = currentTrack?.id ?? null;

  if (EMBED_BLOCKED_CODES.has(code) && currentTrack) {
    // Same song, real video, via YouTube Music. The id is remembered
    // (webOnlyIds) so future plays route straight to the web backend.
    showFallback('Playing via YouTube Music — this song blocks embedding', false);
    forceWeb(currentTrack.id);
    return;
  }

  showFallback(message, !!failedVideoId);
  scheduleSkip(message);
}

// Call on successful playback — clears fallback and resets all guards.
export function clearPlayerError() {
  resetGuards();
  failedVideoId = null;
  clearTimeout(skipTimer);
  els.fallback.classList.add('hidden');
}

// Call on any manual track change — a pending auto-skip must not fire on top
// of a track the user just picked. (No-op when the timer already fired.)
export function cancelPendingSkip() {
  clearTimeout(skipTimer);
}
