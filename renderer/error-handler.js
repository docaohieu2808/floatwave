// Maps YouTube player error codes to fallback UI + recovery. For embed-blocked
// songs (label ATV tracks error at PLAY time even when playability APIs say
// OK) it first tries alternative uploads of the same song (MV/lyric video)
// before giving up and auto-skipping. Guards against infinite loops both ways.
import { els } from './ui-elements.js';
import * as queueManager from './queue-manager.js';

const MAX_CONSECUTIVE_SKIPS = 3;
const MAX_ALTERNATIVE_TRIES = 2;
const SKIP_DELAY_MS = 1500;
const BLOCKED_CODES = new Set([100, 101, 150]);

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
// alternative-version attempt state, keyed by the song's title identity
let altSongKey = null;
let altTriedIds = [];
let altAttempts = 0;

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

// A track has a searchable identity only if it carries a real title
// (URL-pasted tracks that never loaded still have the raw 11-char id).
function songQueryOf(track) {
  if (!track?.title || track.title === track.id) return null;
  return [track.title, track.channel].filter(Boolean).join(' ');
}

async function tryAlternativeVersion(track) {
  const query = songQueryOf(track);
  if (!query) return false;
  if (altSongKey !== query) {
    altSongKey = query;
    altTriedIds = [];
    altAttempts = 0;
  }
  if (altAttempts >= MAX_ALTERNATIVE_TRIES) return false;
  altTriedIds.push(track.id);
  altAttempts += 1;

  showFallback('This version blocks embedding — trying another upload…', false);
  const response = await window.api.searchAlternative(query, altTriedIds).catch(() => null);
  // user may have picked another track while we were searching — don't
  // overwrite their choice (report handled so no skip fires either).
  // Compare by id: radio-queue replacement recreates track objects but a
  // genuinely different user pick always means a different id.
  if (queueManager.getCurrent()?.id !== track.id) return true;
  const candidate = response?.ok ? response.results[0] : null;
  if (!candidate) return false;
  queueManager.replaceCurrentTrack(candidate); // loads + persists the playable id
  return true;
}

export function handlePlayerError(code, currentTrack) {
  const message = MESSAGES[code] ?? `Playback error (code ${code})`;
  failedVideoId = currentTrack?.id ?? null;
  showFallback(message, !!failedVideoId);

  if (BLOCKED_CODES.has(code) && currentTrack) {
    tryAlternativeVersion(currentTrack).then((swapped) => {
      if (!swapped) scheduleSkip(message);
    });
    return;
  }
  scheduleSkip(message);
}

// Call on successful playback — clears fallback and resets all guards.
export function clearPlayerError() {
  consecutiveSkips = 0;
  failedVideoId = null;
  altSongKey = null;
  altTriedIds = [];
  altAttempts = 0;
  clearTimeout(skipTimer);
  els.fallback.classList.add('hidden');
}

// Call on any manual track change — a pending auto-skip must not fire on top
// of a track the user just picked. (No-op when the timer already fired.)
export function cancelPendingSkip() {
  clearTimeout(skipTimer);
}
