// Favorites: toggle current track, persisted list, playable from panel.
import { els, renderTrackList, setFavoriteIcon } from './ui-elements.js';
import * as queueManager from './queue-manager.js';
import { openAddChooser } from './playlists-ui.js';
import { ICONS } from './icons.js';

let favorites = []; // [{id,title,channel,thumbnail}]

export async function initFavorites() {
  favorites = (await window.api.getStore('favorites')) ?? [];
  if (!Array.isArray(favorites)) favorites = [];
  renderFavorites();
}

export function isFavorite(id) {
  return favorites.some((t) => t.id === id);
}

export function toggleFavorite(track) {
  if (!track?.id) return false;
  const existing = favorites.findIndex((t) => t.id === track.id);
  if (existing >= 0) favorites.splice(existing, 1);
  else favorites.push({ ...track });
  window.api.setStore('favorites', favorites);
  renderFavorites();
  // heart reflects the CURRENT track — toggling another track from the
  // favorites panel must not repaint the icon for the wrong song
  refreshFavoriteIcon(queueManager.getCurrent());
  return existing < 0;
}

export function refreshFavoriteIcon(currentTrack) {
  setFavoriteIcon(currentTrack ? isFavorite(currentTrack.id) : false);
}

export function renderFavorites() {
  renderTrackList(els.listFavorites, favorites, {
    currentId: queueManager.getCurrent()?.id,
    onPlay: (track) => queueManager.playNow(track),
    actions: [
      { icon: ICONS.plus, title: 'Add to queue / playlist', onClick: (track) => openAddChooser(track) },
      { icon: ICONS.close, title: 'Remove from favorites', onClick: (track) => toggleFavorite(track) },
    ],
  });
}
