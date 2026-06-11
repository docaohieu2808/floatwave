// Single source of truth for the play queue + repeat behavior.
// Persists queue/queueIndex write-through via injected persist function.
// Playback goes through the router: embed-blocked tracks transparently play
// on the hidden web backend instead of the iframe.
import * as player from './playback-router.js';

let queue = []; // [{id,title,channel,thumbnail}]
let index = -1;
let repeat = 'off'; // 'off' | 'one' | 'all'

let persist = () => {};
let notifyChange = () => {};
let notifyTrackChange = () => {};

export function init({ initialQueue, initialIndex, onPersist, onChange, onTrackChange }) {
  queue = Array.isArray(initialQueue) ? initialQueue.filter((t) => t && t.id) : [];
  index = Number.isInteger(initialIndex) && initialIndex >= 0 && initialIndex < queue.length
    ? initialIndex
    : queue.length
      ? 0
      : -1;
  if (onPersist) persist = onPersist;
  if (onChange) notifyChange = onChange;
  if (onTrackChange) notifyTrackChange = onTrackChange;
}

export function getQueue() {
  return queue;
}

export function getCurrent() {
  return queue[index] ?? null;
}

export function setRepeat(mode) {
  repeat = mode;
}

function changed() {
  persist(queue, index);
  notifyChange();
}

function loadCurrent({ autoplay = true } = {}) {
  const track = getCurrent();
  if (!track) return;
  player.load(track.id, { autoplay });
  notifyTrackChange(track);
  changed();
}

export function add(track) {
  if (!track?.id || queue.some((t) => t.id === track.id)) return;
  queue.push({ ...track });
  if (index === -1) {
    // first track in an empty queue: cue it (no surprise audio) so the
    // titlebar and play button immediately work
    index = 0;
    loadCurrent({ autoplay: false });
    return; // loadCurrent already persisted + notified
  }
  changed();
}

// Jump to a specific queue position (panel click, playlist play). Index-based
// so duplicate ids in the queue can't send playback to the wrong row.
export function playAt(targetIndex) {
  if (targetIndex < 0 || targetIndex >= queue.length) return;
  index = targetIndex;
  loadCurrent();
}

export function playNow(track) {
  if (!track?.id) return;
  const existing = queue.findIndex((t) => t.id === track.id);
  if (existing >= 0) {
    index = existing;
  } else {
    queue.push({ ...track });
    index = queue.length - 1;
  }
  loadCurrent();
}

// Replace the whole queue (radio mode: clicked song + its up-next list).
// Does NOT load — caller already started playback of the current track.
export function setQueue(tracks, startIndex = 0) {
  queue = (Array.isArray(tracks) ? tracks : []).filter((t) => t?.id).map((t) => ({ ...t }));
  index = queue.length ? Math.min(Math.max(0, startIndex), queue.length - 1) : -1;
  changed();
}

// Bulk append (queue auto-extension), deduplicated by id.
export function appendTracks(tracks) {
  const known = new Set(queue.map((t) => t.id));
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (track?.id && !known.has(track.id)) {
      queue.push({ ...track });
      known.add(track.id);
    }
  }
  if (index === -1 && queue.length) index = 0;
  changed();
}

// Reorder (drag & drop): move the track at `from` so it sits at `to`.
// The current-track pointer follows the song it points at, never the slot.
export function moveTrack(from, to) {
  if (from === to) return;
  if (from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
  const [moved] = queue.splice(from, 1);
  queue.splice(to, 0, moved);
  if (index === from) index = to;
  else if (from < index && to >= index) index -= 1;
  else if (from > index && to <= index) index += 1;
  changed();
}

export function removeAt(removeIndex) {
  if (removeIndex < 0 || removeIndex >= queue.length) return;
  const removedCurrent = removeIndex === index;
  queue.splice(removeIndex, 1);
  if (removeIndex < index) index -= 1;
  else if (removedCurrent) index = Math.min(index, queue.length - 1);

  if (removedCurrent) {
    // player still holds the removed video — switch to the new current
    // track or stop entirely so queue state and playback never desync
    if (queue.length) {
      loadCurrent();
      return; // loadCurrent already persisted + notified
    }
    player.stop();
    notifyTrackChange(null);
  }
  changed();
}

export function next({ autoplay = true } = {}) {
  if (!queue.length) return false;
  if (index + 1 < queue.length) {
    index += 1;
  } else if (repeat === 'all') {
    index = 0;
  } else {
    return false; // end of queue, no wrap
  }
  loadCurrent({ autoplay });
  return true;
}

export function prev() {
  if (!queue.length) return;
  // standard player behavior: restart track unless near its start
  if (player.getTimes().current > 3 || index <= 0) {
    player.seek(0);
    player.play();
    return;
  }
  index -= 1;
  loadCurrent();
}

// Called when the player reports ENDED — advance per repeat mode.
// Returns false when nothing advanced (end of queue, repeat off) so the
// caller can extend the queue with radio suggestions and keep playing.
export function onEnded() {
  if (!getCurrent()) return false;
  if (repeat === 'one') {
    loadCurrent();
    return true;
  }
  return next(); // handles 'all' wrap; 'off' stops at end
}

// Fill in title/channel for tracks added via pasted URL (metadata arrives
// from the player once the video loads).
export function updateCurrentMeta(title, channel) {
  const track = getCurrent();
  if (!track || !title) return;
  const needsTitle = !track.title || track.title === track.id;
  const needsChannel = !track.channel && !!channel;
  if (!needsTitle && !needsChannel) return; // already has real metadata
  if (needsTitle) track.title = title;
  if (needsChannel) track.channel = channel;
  changed();
}
