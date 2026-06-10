// Single source of truth for the play queue + repeat behavior.
// Persists queue/queueIndex write-through via injected persist function.
import * as player from './player-controller.js';

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
export function onEnded() {
  if (!getCurrent()) return;
  if (repeat === 'one') {
    loadCurrent();
    return;
  }
  next(); // handles 'all' wrap; 'off' stops at end
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
