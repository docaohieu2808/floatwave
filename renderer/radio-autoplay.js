// Radio/autoplay behavior (YouTube Music style): clicking a song builds an
// up-next queue of related tracks, and an exhausted queue extends itself so
// playback keeps going instead of stopping at the last item.
import * as queueManager from './queue-manager.js';

// Play a searched song now and replace the queue with [song, ...its radio].
export async function playWithRadio(track) {
  queueManager.playNow(track); // instant playback first, radio fills in after
  const queued = queueManager.getCurrent(); // the queue's own copy of the track
  const response = await window.api.getUpNext(track.id).catch(() => null);
  // user may have picked another song, or the blocked-version handler may
  // have swapped ids meanwhile — `queued` object identity survives id swaps
  if (queueManager.getCurrent() !== queued) return;
  if (!response?.ok || !response.results.length) return;
  queueManager.setQueue([{ ...queued }, ...response.results], 0);
}

// Queue ran out (repeat off, last track ended) — fetch the last track's radio,
// append, and keep playing. Self-limiting: if everything returned is already
// queued, nothing is appended and playback simply stops.
export async function extendQueueWithRadio() {
  const last = queueManager.getCurrent();
  if (!last) return;
  const before = queueManager.getQueue().length;
  const response = await window.api.getUpNext(last.id).catch(() => null);
  if (!response?.ok || !response.results.length) return;
  if (queueManager.getCurrent() !== last) return; // user moved on meanwhile
  queueManager.appendTracks(response.results);
  if (queueManager.getQueue().length > before) queueManager.next();
}
