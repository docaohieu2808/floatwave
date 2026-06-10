// Cached DOM refs + small render helpers. No business logic here (DRY DOM access).
import { formatTime } from './format-utils.js';

const $ = (id) => document.getElementById(id);

export const els = {
  trackTitle: $('track-title'),
  trackArtist: $('track-artist'),
  btnPanel: $('btn-panel'),
  btnMinimize: $('btn-minimize'),
  btnClose: $('btn-close'),
  searchInput: $('search-input'),
  fallback: $('player-fallback'),
  fallbackMessage: $('fallback-message'),
  btnOpenYoutube: $('btn-open-youtube'),
  panel: $('panel'),
  panelTabs: $('panel-tabs'),
  btnPanelClose: $('btn-panel-close'),
  panelMessage: $('panel-message'),
  listResults: $('list-results'),
  listQueue: $('list-queue'),
  listFavorites: $('list-favorites'),
  timeCurrent: $('time-current'),
  timeTotal: $('time-total'),
  seek: $('seek'),
  btnRepeat: $('btn-repeat'),
  btnPrev: $('btn-prev'),
  btnPlay: $('btn-play'),
  btnNext: $('btn-next'),
  volume: $('volume'),
  btnFavorite: $('btn-favorite'),
};

export function setTrackInfo(title, artist) {
  els.trackTitle.textContent = title || 'No track';
  els.trackArtist.textContent = artist || '—';
}

export function setPlayIcon(isPlaying) {
  els.btnPlay.innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
}

export function setTimes(current, duration) {
  els.timeCurrent.textContent = formatTime(current);
  els.timeTotal.textContent = formatTime(duration);
  els.seek.value = duration > 0 ? String((current / duration) * 100) : '0';
}

export function setRepeatIcon(mode) {
  els.btnRepeat.innerHTML = mode === 'one' ? '&#128258;' : '&#128257;';
  els.btnRepeat.classList.toggle('active', mode !== 'off');
  els.btnRepeat.title = `Repeat: ${mode}`;
}

export function setFavoriteIcon(isFavorite) {
  els.btnFavorite.innerHTML = isFavorite ? '&#9829;' : '&#9825;';
  els.btnFavorite.classList.toggle('active', isFavorite);
}

const TAB_LISTS = { results: 'listResults', queue: 'listQueue', favorites: 'listFavorites' };

export function showPanel(tab) {
  els.panel.classList.remove('hidden');
  for (const button of els.panelTabs.querySelectorAll('.tab')) {
    button.classList.toggle('active', button.dataset.tab === tab);
  }
  for (const [name, key] of Object.entries(TAB_LISTS)) {
    els[key].classList.toggle('hidden', name !== tab);
  }
}

export function hidePanel() {
  els.panel.classList.add('hidden');
}

export function isPanelOpen() {
  return !els.panel.classList.contains('hidden');
}

export function setPanelMessage(text) {
  els.panelMessage.textContent = text ?? '';
  els.panelMessage.classList.toggle('hidden', !text);
}

// Generic track-list renderer used by results / queue / favorites.
// opts: { currentId, onPlay(track, index), actionLabel, actionTitle, onAction(track, index) }
export function renderTrackList(listEl, tracks, opts = {}) {
  listEl.textContent = '';
  tracks.forEach((track, index) => {
    const li = document.createElement('li');
    if (opts.currentId && track.id === opts.currentId) li.classList.add('current');

    if (track.thumbnail) {
      const img = document.createElement('img');
      img.src = track.thumbnail;
      img.alt = '';
      li.appendChild(img);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    const title = document.createElement('div');
    title.className = 't';
    title.textContent = track.title || track.id;
    const channel = document.createElement('div');
    channel.className = 'c';
    channel.textContent = [track.channel, track.duration].filter(Boolean).join(' · ');
    meta.append(title, channel);
    li.appendChild(meta);

    if (opts.actionLabel && opts.onAction) {
      const action = document.createElement('button');
      action.className = 'row-action';
      action.textContent = opts.actionLabel;
      action.title = opts.actionTitle ?? '';
      action.addEventListener('click', (event) => {
        event.stopPropagation(); // row click would also fire onPlay
        opts.onAction(track, index);
      });
      li.appendChild(action);
    }

    if (opts.onPlay) li.addEventListener('click', () => opts.onPlay(track, index));
    listEl.appendChild(li);
  });
}
