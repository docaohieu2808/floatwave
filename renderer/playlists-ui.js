// User-created playlists: persistent named lists built song-by-song from
// search/favorites via the "Add to…" chooser. Playing a playlist replaces the
// play queue with it (standard player semantics).
import { els, renderTrackList, showPanel } from './ui-elements.js';
import * as queueManager from './queue-manager.js';
import { ICONS } from './icons.js';

let playlists = []; // [{name, tracks:[{id,title,channel,duration,thumbnail}]}]
let viewingIndex = -1; // -1 = playlist list view, otherwise detail view
let chooserTrack = null; // track pending in the "Add to…" chooser

function persist() {
  window.api.setStore('playlists', playlists);
}

export async function initPlaylists() {
  playlists = (await window.api.getStore('playlists')) ?? [];
  if (!Array.isArray(playlists)) playlists = [];
  bindChooser();
}

// ---------- "Add to…" chooser ----------

export function openAddChooser(track) {
  chooserTrack = track;
  renderChooserOptions();
  els.chooserNewName.value = '';
  els.playlistChooser.classList.remove('hidden');
}

function closeChooser() {
  chooserTrack = null;
  els.playlistChooser.classList.add('hidden');
}

function addChooserOption(label, onClick, icon = null) {
  const li = document.createElement('li');
  if (icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    iconSpan.innerHTML = icon; // trusted SVG constant — never user data
    li.appendChild(iconSpan);
  }
  li.appendChild(document.createTextNode(label));
  li.addEventListener('click', onClick);
  els.chooserOptions.appendChild(li);
}

function renderChooserOptions() {
  els.chooserOptions.textContent = '';
  addChooserOption('Current queue', () => {
    queueManager.add(chooserTrack);
    closeChooser();
  }, ICONS.play);
  playlists.forEach((playlist, index) => {
    addChooserOption(`${playlist.name} (${playlist.tracks.length})`, () => {
      addTrackToPlaylist(index, chooserTrack);
      closeChooser();
    });
  });
}

function bindChooser() {
  // click on the dimmed backdrop (not the box) closes
  els.playlistChooser.addEventListener('click', (event) => {
    if (event.target === els.playlistChooser) closeChooser();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeChooser();
  });
  const createFromInput = () => {
    const name = els.chooserNewName.value.trim();
    if (!name || !chooserTrack) return;
    let index = playlists.findIndex((p) => p.name === name);
    if (index === -1) {
      playlists.push({ name, tracks: [] });
      index = playlists.length - 1;
    }
    addTrackToPlaylist(index, chooserTrack);
    closeChooser();
  };
  els.chooserCreate.addEventListener('click', createFromInput);
  els.chooserNewName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') createFromInput();
  });
}

function addTrackToPlaylist(playlistIndex, track) {
  const playlist = playlists[playlistIndex];
  if (!playlist || !track?.id) return;
  if (!playlist.tracks.some((t) => t.id === track.id)) playlist.tracks.push({ ...track });
  persist();
  if (viewingIndex !== -1) renderPlaylistsTab();
}

// ---------- Playlists tab (list view ⇄ detail view) ----------

export function renderPlaylistsTab() {
  if (viewingIndex >= 0 && !playlists[viewingIndex]) viewingIndex = -1;
  if (viewingIndex === -1) renderListView();
  else renderDetailView();
}

function headerRow(label, onClick, className = 'list-header') {
  const li = document.createElement('li');
  li.className = className;
  li.textContent = label;
  if (onClick) li.addEventListener('click', onClick);
  return li;
}

function renderListView() {
  const ul = els.listPlaylists;
  ul.textContent = '';
  if (!playlists.length) {
    ul.appendChild(headerRow('No playlists yet — use a song’s + button to create one.', null));
    return;
  }
  playlists.forEach((playlist, index) => {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const title = document.createElement('div');
    title.className = 't';
    title.textContent = playlist.name;
    const count = document.createElement('div');
    count.className = 'c';
    count.textContent = `${playlist.tracks.length} song${playlist.tracks.length === 1 ? '' : 's'}`;
    meta.append(title, count);
    li.appendChild(meta);

    const remove = document.createElement('button');
    remove.className = 'row-action';
    remove.innerHTML = ICONS.close;
    remove.title = 'Delete playlist';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      playlists.splice(index, 1);
      persist();
      renderPlaylistsTab();
    });
    li.appendChild(remove);

    li.addEventListener('click', () => {
      viewingIndex = index;
      renderPlaylistsTab();
    });
    ul.appendChild(li);
  });
}

function renderDetailView() {
  const playlist = playlists[viewingIndex];
  const ul = els.listPlaylists;
  renderTrackList(ul, playlist.tracks, {
    currentId: queueManager.getCurrent()?.id,
    // playlist-as-queue: clicking a song loads the playlist from that song on
    onPlay: (_track, index) => {
      queueManager.setQueue(playlist.tracks, index);
      queueManager.playAt(index);
    },
    actions: [
      {
        icon: ICONS.close,
        title: 'Remove from playlist',
        onClick: (_track, index) => {
          playlist.tracks.splice(index, 1);
          persist();
          renderPlaylistsTab();
        },
      },
    ],
  });
  // header goes on top after renderTrackList cleared the list
  const back = headerRow(playlist.name, () => {
    viewingIndex = -1;
    renderPlaylistsTab();
  });
  const backIcon = document.createElement('span');
  backIcon.className = 'icon';
  backIcon.innerHTML = ICONS.back;
  back.insertBefore(backIcon, back.firstChild);
  const play = document.createElement('button');
  play.className = 'row-action';
  play.innerHTML = ICONS.play;
  play.title = 'Play this playlist';
  play.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!playlist.tracks.length) return;
    queueManager.setQueue(playlist.tracks, 0);
    queueManager.playAt(0);
    showPanel('queue');
  });
  back.appendChild(play);
  ul.insertBefore(back, ul.firstChild);
}
