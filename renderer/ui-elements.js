// Cached DOM refs + small render helpers. No business logic here (DRY DOM access).
import { formatTime } from './format-utils.js';
import { ICONS } from './icons.js';

const $ = (id) => document.getElementById(id);

export const els = {
  artworkBg: $('artwork-bg'),
  trackTitle: $('track-title'),
  trackArtist: $('track-artist'),
  btnPin: $('btn-pin'),
  btnWebMode: $('btn-web-mode'),
  btnPanel: $('btn-panel'),
  btnMinimize: $('btn-minimize'),
  btnClose: $('btn-close'),
  btnFocusMode: $('btn-focus-mode'),
  btnSearchMode: $('btn-search-mode'),
  searchInput: $('search-input'),
  searchHistory: $('search-history'),
  fallback: $('player-fallback'),
  brandSplash: $('brand-splash'),
  webArt: $('web-art'),
  webArtImg: $('web-art-img'),
  webArtBg: $('web-art-bg'),
  fallbackMessage: $('fallback-message'),
  btnOpenYoutube: $('btn-open-youtube'),
  panel: $('panel'),
  panelTabs: $('panel-tabs'),
  btnPanelClose: $('btn-panel-close'),
  panelMessage: $('panel-message'),
  listResults: $('list-results'),
  listQueue: $('list-queue'),
  listFavorites: $('list-favorites'),
  listPlaylists: $('list-playlists'),
  playlistChooser: $('playlist-chooser'),
  chooserOptions: $('chooser-options'),
  chooserNewName: $('chooser-new-name'),
  chooserCreate: $('chooser-create'),
  timeCurrent: $('time-current'),
  timeTotal: $('time-total'),
  seek: $('seek'),
  btnRepeat: $('btn-repeat'),
  btnPrev: $('btn-prev'),
  btnPlay: $('btn-play'),
  btnNext: $('btn-next'),
  volume: $('volume'),
  btnFavorite: $('btn-favorite'),
  btnDislike: $('btn-dislike'),
};

export function setTrackInfo(title, artist) {
  els.trackTitle.textContent = title || 'No track';
  els.trackArtist.textContent = artist || '—';
}

// Roon-style backdrop: the whole window is washed with the current artwork
export function setArtworkBackground(url) {
  els.artworkBg.style.backgroundImage = url ? `url("${url}")` : 'none';
}

// Filled progress portion for range inputs. Fill color comes from the
// element's --fill-color (seek = dark waveform fill, volume = accent).
export function setRangeFill(rangeEl, percent) {
  const clamped = Math.min(100, Math.max(0, percent));
  rangeEl.style.background =
    `linear-gradient(to right, var(--fill-color, var(--accent)) ${clamped}%, var(--range-track) ${clamped}%)`;
}

// Fixed icons for buttons whose glyph never changes (called once at boot)
export function applyStaticIcons() {
  els.btnPin.innerHTML = ICONS.pin;
  els.btnFocusMode.innerHTML = ICONS.collapse;
  els.btnWebMode.innerHTML = ICONS.musicNote;
  els.btnPanel.innerHTML = ICONS.queueList;
  els.btnMinimize.innerHTML = ICONS.minimize;
  els.btnClose.innerHTML = ICONS.close;
  els.btnPanelClose.innerHTML = ICONS.close;
  els.btnPrev.innerHTML = ICONS.prev;
  els.btnNext.innerHTML = ICONS.next;
  els.btnDislike.innerHTML = ICONS.thumbDown;
  // empty-state default — without this the heart only appears once a track
  // loads, leaving a blank circle on a fresh/cleared queue
  els.btnFavorite.innerHTML = ICONS.heart;
}

export function setPlayIcon(isPlaying) {
  els.btnPlay.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
}

export function setTimes(current, duration) {
  els.timeCurrent.textContent = formatTime(current);
  els.timeTotal.textContent = formatTime(duration);
  const percent = duration > 0 ? (current / duration) * 100 : 0;
  els.seek.value = String(percent);
  setRangeFill(els.seek, percent);
}

export function setRepeatIcon(mode) {
  els.btnRepeat.innerHTML = mode === 'one' ? ICONS.repeatOne : ICONS.repeat;
  els.btnRepeat.classList.toggle('active', mode !== 'off');
  els.btnRepeat.title = `Repeat: ${mode}`;
}

export function setFavoriteIcon(isFavorite) {
  els.btnFavorite.innerHTML = isFavorite ? ICONS.heartFilled : ICONS.heart;
  els.btnFavorite.classList.toggle('active', isFavorite);
}

export function setDislikeIcon(isDisliked) {
  els.btnDislike.classList.toggle('active', isDisliked);
  els.btnDislike.title = isDisliked
    ? 'Disliked — excluded from suggestions (click to undo)'
    : 'Dislike: skip & stop suggesting this';
}

const TAB_LISTS = {
  results: 'listResults',
  queue: 'listQueue',
  favorites: 'listFavorites',
  playlists: 'listPlaylists',
};

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

// Generic track-list renderer used by results / queue / favorites / playlists.
// opts: { currentId, onPlay(track, index), actions: [{icon|label, title, onClick(track, index)}],
//         onReorder(fromIndex, toIndex) } — onReorder enables drag & drop (queue tab).
// action.icon = trusted SVG constant from icons.js; label = plain text fallback.
export function renderTrackList(listEl, tracks, opts = {}) {
  listEl.textContent = '';
  let dragFromIndex = -1; // shared across this render's rows
  tracks.forEach((track, index) => {
    const li = document.createElement('li');
    if (opts.currentId && track.id === opts.currentId) li.classList.add('current');

    if (opts.onReorder) {
      li.draggable = true;
      li.addEventListener('dragstart', (event) => {
        dragFromIndex = index;
        li.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index)); // required to start a drag
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (event) => {
        event.preventDefault(); // makes the row a valid drop target
        if (dragFromIndex >= 0 && dragFromIndex !== index) li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', (event) => {
        event.preventDefault();
        li.classList.remove('drag-over');
        if (dragFromIndex >= 0 && dragFromIndex !== index) opts.onReorder(dragFromIndex, index);
        dragFromIndex = -1;
      });
    }

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

    for (const action of opts.actions ?? []) {
      const button = document.createElement('button');
      button.className = 'row-action';
      if (action.icon) button.innerHTML = action.icon;
      else button.textContent = action.label ?? '';
      button.title = action.title ?? '';
      button.addEventListener('click', (event) => {
        event.stopPropagation(); // row click would also fire onPlay
        action.onClick(track, index);
      });
      li.appendChild(button);
    }

    if (opts.onPlay) li.addEventListener('click', () => opts.onPlay(track, index));
    listEl.appendChild(li);
  });
}
