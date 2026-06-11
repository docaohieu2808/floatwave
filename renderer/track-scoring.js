// Listening-behavior scoring → smarter radio suggestions, no AI involved.
// Counts per track: full/80%+ listens (+), early skips (−), dislikes (kill).
// rankUpNext() then filters/reorders InnerTube's up-next candidates so the
// radio queue drifts toward the user's actual taste over time.
import * as player from './playback-router.js'; // web-backend listens count too
import { isFavorite } from './favorites-ui.js';

const PLAYED_RATIO = 0.8; // listened ≥80% counts as a real play
const EARLY_SKIP_S = 10; // skipped in the first 10s — strong "not my thing"
const SKIP_S = 30; // skipped before 30s — mild negative
const SCORE_FLOOR = -5; // candidates at/below this never get suggested
const MAX_ENTRIES = 500; // stats map pruned by least-recently-touched
const PERSIST_DEBOUNCE_MS = 800;

let stats = {}; // id → {plays, skips, earlySkips, disliked, artist, lastAt}
// the in-progress listen: position/duration sampled from player ticks
let session = null; // {id, artist, position, duration, started}
let persistTimer = null;

export async function initScoring() {
  const stored = await window.api.getStore('trackStats');
  stats = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  // player ticks keep the session's last known position fresh
  player.on('tick', ({ current, duration }) => {
    if (!session) return;
    session.position = current;
    session.duration = duration;
    if (current >= 1) session.started = true; // actually played, not just cued
  });
  // app closing mid-song: finalize + flush immediately (best effort — the
  // debounced write may not survive teardown), else every session's last
  // track is systematically dropped from the stats
  window.addEventListener('pagehide', () => {
    finalizeSession();
    session = null;
    clearTimeout(persistTimer);
    window.api.setStore('trackStats', stats);
  });
}

function entryOf(id, artist) {
  if (!stats[id]) {
    stats[id] = { plays: 0, skips: 0, earlySkips: 0, disliked: false, artist: artist ?? '' };
  }
  if (artist && !stats[id].artist) stats[id].artist = artist;
  return stats[id];
}

function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    pruneOldEntries();
    window.api.setStore('trackStats', stats);
  }, PERSIST_DEBOUNCE_MS);
}

function pruneOldEntries() {
  const ids = Object.keys(stats);
  if (ids.length <= MAX_ENTRIES) return;
  ids
    .sort((a, b) => (stats[a].lastAt ?? 0) - (stats[b].lastAt ?? 0))
    .slice(0, ids.length - MAX_ENTRIES)
    .forEach((id) => delete stats[id]);
}

// Close the previous track's listen and classify it. Natural track end gives
// ratio ≈ 1, so ended/auto-advanced tracks count as plays without the caller
// distinguishing manual skips from auto-advance.
function finalizeSession() {
  if (!session?.started) return; // cued but never played → no signal either way
  const { id, artist, position, duration } = session;
  const entry = entryOf(id, artist);
  const ratio = duration > 0 ? position / duration : 0;
  if (ratio >= PLAYED_RATIO) entry.plays += 1;
  else if (position <= EARLY_SKIP_S) entry.earlySkips += 1;
  else if (position <= SKIP_S) entry.skips += 1;
  // abandoning mid-song (30s..80%) is ambiguous — counts as neither
  entry.lastAt = Date.now();
  persistSoon();
}

// Call from the queue's onTrackChange — closes the old listen, opens the new.
export function noteTrackChange(track) {
  finalizeSession();
  session = track
    ? { id: track.id, artist: track.channel ?? '', position: 0, duration: 0, started: false }
    : null;
}

export function isDisliked(id) {
  return !!stats[id]?.disliked;
}

// 👎 toggle. Returns the new disliked state.
export function toggleDisliked(track) {
  if (!track?.id) return false;
  const entry = entryOf(track.id, track.channel);
  entry.disliked = !entry.disliked;
  entry.lastAt = Date.now();
  persistSoon();
  return entry.disliked;
}

export function scoreOf(id) {
  const entry = stats[id];
  if (!entry) return 0;
  if (entry.disliked) return -Infinity;
  return (
    entry.plays * 2 +
    (isFavorite(id) ? 10 : 0) -
    entry.earlySkips * 5 -
    entry.skips * 2
  );
}

// How much the user likes this artist overall (sum of positive track scores).
// Stats stay small (≤500) so a linear scan per call is fine.
function artistAffinity(artist) {
  if (!artist) return 0;
  let total = 0;
  for (const [id, entry] of Object.entries(stats)) {
    if (entry.artist === artist) total += Math.max(0, scoreOf(id));
  }
  return total;
}

// Re-rank radio/up-next candidates: drop disliked & heavily-skipped tracks,
// float known-liked tracks/artists up. InnerTube's own order is the tiebreak
// so unknown tracks keep their relevance ordering.
export function rankUpNext(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  return list
    .filter((t) => t?.id && scoreOf(t.id) > SCORE_FLOOR)
    .map((track, position) => ({
      track,
      position,
      key: scoreOf(track.id) + Math.min(10, artistAffinity(track.channel)) * 0.5,
    }))
    .sort((a, b) => b.key - a.key || a.position - b.position)
    .map((item) => item.track);
}
