// Maps YouTube player error codes to user-facing fallback UI + queue auto-skip.
// Guards against infinite skip loops when many queued videos are unplayable.
import { els } from './ui-elements.js';
import * as queueManager from './queue-manager.js';

const MAX_CONSECUTIVE_SKIPS = 3;
const SKIP_DELAY_MS = 1500;

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

export function initErrorHandler() {
  els.btnOpenYoutube.addEventListener('click', () => {
    if (failedVideoId) {
      window.api.openExternal(`https://www.youtube.com/watch?v=${failedVideoId}`);
    }
  });
}

export function handlePlayerError(code, currentTrack) {
  const message = MESSAGES[code] ?? `Playback error (code ${code})`;
  failedVideoId = currentTrack?.id ?? null;
  els.fallbackMessage.textContent = message;
  els.fallback.classList.remove('hidden');
  els.btnOpenYoutube.classList.toggle('hidden', !failedVideoId);

  if (consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
    els.fallbackMessage.textContent = `${message} — several queued videos failed, playback stopped.`;
    return;
  }
  consecutiveSkips += 1;
  clearTimeout(skipTimer);
  skipTimer = setTimeout(() => {
    const advanced = queueManager.next();
    if (!advanced) consecutiveSkips = 0; // end of queue — nothing more to skip
  }, SKIP_DELAY_MS);
}

// Call on successful playback — clears fallback and resets the skip guard.
export function clearPlayerError() {
  consecutiveSkips = 0;
  failedVideoId = null;
  clearTimeout(skipTimer);
  els.fallback.classList.add('hidden');
}

// Call on any manual track change — a pending auto-skip must not fire on top
// of a track the user just picked. (No-op when the timer already fired.)
export function cancelPendingSkip() {
  clearTimeout(skipTimer);
}
