// Bootstrap: wires modules together, hydrates persisted state, binds controls.
// `player` is the backend router — iframe embed normally, hidden web window
// for embed-blocked tracks; this file never needs to know which is sounding.
import * as player from './playback-router.js';
import * as queueManager from './queue-manager.js';
import { initSearch, renderResults } from './search-ui.js';
import * as favorites from './favorites-ui.js';
import {
  initErrorHandler, handlePlayerError, clearPlayerError, cancelPendingSkip,
} from './error-handler.js';
import { extendQueueWithRadio } from './radio-autoplay.js';
import { initPlaylists, renderPlaylistsTab } from './playlists-ui.js';
import { initScoring, noteTrackChange, toggleDisliked, isDisliked } from './track-scoring.js';
import { initFocusMode } from './focus-mode.js';
import { initResizeGrip } from './resize-grip.js';
import { initImmersive } from './immersive-mode.js';
import { initPlayerDrag } from './player-drag.js';
import { applyWaveformMask } from './waveform.js';
import { formatTime } from './format-utils.js';
import {
  els, setTrackInfo, setPlayIcon, setTimes, setRepeatIcon, applyStaticIcons,
  showPanel, hidePanel, isPanelOpen, setPanelMessage, renderTrackList,
  setArtworkBackground, setRangeFill, setDislikeIcon,
} from './ui-elements.js';
import { ICONS } from './icons.js';

const REPEAT_CYCLE = { off: 'one', one: 'all', all: 'off' };

// Embed loudness normalization caps the <video> gain below the user's slider
// (no opt-out in embeds) — force the element gain to match the slider via main.
// build=true engages the Web Audio loudness graph — only pass it on a real
// volume interaction (a genuine user gesture unlocks the embed's audio context;
// boot/autoplay calls must NOT build it or playback can be silent until the
// slider is touched). See main/embed-loudness.js.
function applyElementGain(build = false) {
  window.api.setGain(Number(els.volume.value) / 100, build);
}

function artworkUrl(track) {
  return track ? track.thumbnail || `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg` : null;
}

// Backend B has no visible video in the mini window — fill the player area with
// the track artwork instead of leaving it blank. Shown for web-routed tracks,
// hidden whenever the iframe owns playback.
function updateWebArt(track) {
  const url = player.isWebPlayback() ? artworkUrl(track) : null;
  if (url) {
    els.webArtImg.src = url;
    els.webArtBg.style.backgroundImage = `url("${url}")`;
    els.webArt.classList.remove('hidden');
  } else {
    els.webArt.classList.add('hidden');
  }
}

// Per-track visuals: artwork backdrop (hidden in the flat Roon-light theme,
// kept for a future dark theme) + the seek bar's per-track waveform shape +
// the backend-B artwork panel + the empty-state brand splash.
function updateArtwork(track) {
  setArtworkBackground(artworkUrl(track));
  applyWaveformMask(els.seek, track?.id);
  updateWebArt(track);
  els.brandSplash.classList.toggle('hidden', !!track); // shown only when idle
}
const PLAYER_LOAD_TIMEOUT_MS = 12000;

let repeatMode = 'off';
let isDraggingSeek = false;
let volumePersistTimer = null;

function renderQueueList() {
  renderTrackList(els.listQueue, queueManager.getQueue(), {
    currentId: queueManager.getCurrent()?.id,
    // index-based jump — duplicate ids in a radio queue must not mis-target
    onPlay: (_track, index) => queueManager.playAt(index),
    onReorder: (from, to) => queueManager.moveTrack(from, to), // drag & drop
    actions: [
      { icon: ICONS.close, title: 'Remove from queue', onClick: (_track, index) => queueManager.removeAt(index) },
    ],
  });
}

let webMode = false;
let pinned = false;

function renderPinButton() {
  els.btnPin.classList.toggle('active', pinned);
  els.btnPin.title = pinned ? 'Unpin (stop floating on top)' : 'Pin on top';
}

function bindTitlebar() {
  els.btnMinimize.addEventListener('click', () => window.api.win.minimize());
  els.btnClose.addEventListener('click', () => window.api.win.close());
  els.btnPin.addEventListener('click', async () => {
    pinned = await window.api.win.setPin(!pinned);
    renderPinButton();
  });
  const renderWebModeButton = () => {
    els.btnWebMode.classList.toggle('active', webMode);
    els.btnWebMode.title = webMode ? 'Back to mini player' : 'YouTube Music (web)';
  };
  els.btnWebMode.addEventListener('click', async () => {
    webMode = !webMode;
    if (webMode) player.pause(); // two players must never sound at once
    await window.api.setMode(webMode ? 'web' : 'mini');
    renderWebModeButton();
  });
  window.api.onModeExited(() => {
    webMode = false;
    renderWebModeButton();
  });
  els.btnPanel.addEventListener('click', () => {
    if (isPanelOpen()) hidePanel();
    else {
      renderQueueList();
      setPanelMessage(null);
      showPanel('queue');
    }
  });
}

function bindPanel() {
  els.panelTabs.addEventListener('click', (event) => {
    const tab = event.target?.dataset?.tab;
    if (!tab) return;
    if (tab !== 'results') setPanelMessage(null);
    if (tab === 'queue') renderQueueList();
    if (tab === 'favorites') favorites.renderFavorites();
    if (tab === 'playlists') renderPlaylistsTab();
    showPanel(tab);
  });
  els.btnPanelClose.addEventListener('click', hidePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hidePanel();
  });
}

function bindControls() {
  els.btnPlay.addEventListener('click', () => player.toggle());
  els.btnNext.addEventListener('click', () => queueManager.next());
  els.btnPrev.addEventListener('click', () => queueManager.prev());

  els.btnRepeat.addEventListener('click', () => {
    repeatMode = REPEAT_CYCLE[repeatMode];
    queueManager.setRepeat(repeatMode);
    setRepeatIcon(repeatMode);
    window.api.setStore('repeat', repeatMode);
  });

  els.btnFavorite.addEventListener('click', () => {
    const current = queueManager.getCurrent();
    if (current) favorites.toggleFavorite(current);
  });

  // 👎 = "stop suggesting this": mark + skip. Un-disliking doesn't skip.
  // At the end of the queue next() can't advance — extend with radio instead
  // (same fallback the ENDED handler uses) so the disliked song never lingers.
  els.btnDislike.addEventListener('click', () => {
    const current = queueManager.getCurrent();
    if (!current) return;
    const disliked = toggleDisliked(current);
    setDislikeIcon(disliked);
    if (disliked && !queueManager.next()) extendQueueWithRadio();
  });

  // Seek: while dragging, preview time only; commit on release ('change')
  els.seek.addEventListener('input', () => {
    isDraggingSeek = true;
    const { duration } = player.getTimes();
    const percent = Number(els.seek.value);
    els.timeCurrent.textContent = formatTime((percent / 100) * duration);
    setRangeFill(els.seek, percent);
  });
  els.seek.addEventListener('change', () => {
    const { duration } = player.getTimes();
    if (duration > 0) player.seek((Number(els.seek.value) / 100) * duration);
    isDraggingSeek = false;
  });

  // Volume: apply live, persist debounced (slider fires rapidly)
  els.volume.addEventListener('input', () => {
    const value = Number(els.volume.value);
    player.setVolume(value);
    setRangeFill(els.volume, value);
    applyElementGain(true); // real user gesture — safe to build the loudness graph
    clearTimeout(volumePersistTimer);
    volumePersistTimer = setTimeout(() => window.api.setStore('volume', value), 300);
  });
}

function bindPlayerEvents() {
  player.on('statechange', (state) => {
    setPlayIcon(state === player.STATE.PLAYING);
    if (state === player.STATE.PLAYING) {
      clearPlayerError();
      // backend B sounds from the hidden web window; show the track artwork in
      // the player area so it isn't blank (clearPlayerError hid the fallback)
      if (player.isWebPlayback()) updateWebArt(queueManager.getCurrent());
      syncMetadataFromPlayer();
      applyElementGain(); // YT re-applies its normalized gain on every load
    }
    if (state === player.STATE.CUED) syncMetadataFromPlayer();
    if (state === player.STATE.ENDED) {
      // queue exhausted (repeat off) → extend with radio and keep playing
      if (!queueManager.onEnded()) extendQueueWithRadio();
    }
  });

  player.on('tick', ({ current, duration }) => {
    if (!isDraggingSeek) setTimes(current, duration);
  });

  player.on('error', (code) => handlePlayerError(code, queueManager.getCurrent()));
}

// Global hotkeys (media keys / Ctrl+Alt combos) — forwarded from main.
// Ignored in web mode: music.youtube.com owns playback there and unpausing
// the hidden mini player would have two players sounding at once.
function bindHotkeys() {
  const ACTIONS = {
    'play-pause': () => player.toggle(),
    next: () => queueManager.next(),
    prev: () => queueManager.prev(),
  };
  window.api.onHotkey((action) => {
    if (webMode) return;
    ACTIONS[action]?.();
  });
}

// Pasted URLs enter the queue with only an ID — pull real title/channel
// from the player once the video is loaded.
function syncMetadataFromPlayer() {
  const { title, author } = player.getVideoData();
  queueManager.updateCurrentMeta(title, author);
  const current = queueManager.getCurrent();
  if (current) {
    setTrackInfo(current.title, current.channel);
    favorites.refreshFavoriteIcon(current);
  }
}

async function hydrateAndStart() {
  await player.initRouter(); // webOnlyIds must be known before any load() routes
  const [volume, repeat, storedQueue, storedIndex, storedPin] = await Promise.all([
    window.api.getStore('volume'),
    window.api.getStore('repeat'),
    window.api.getStore('queue'),
    window.api.getStore('queueIndex'),
    window.api.getStore('alwaysOnTop'),
  ]);

  pinned = !!storedPin; // window itself was created with this state
  renderPinButton();

  repeatMode = ['off', 'one', 'all'].includes(repeat) ? repeat : 'off';
  setRepeatIcon(repeatMode);

  const volumeValue = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 50;
  els.volume.value = String(volumeValue);
  setRangeFill(els.volume, volumeValue);
  setRangeFill(els.seek, 0);
  applyWaveformMask(els.seek, queueManager.getCurrent()?.id); // empty state still shows a waveform

  queueManager.init({
    initialQueue: storedQueue,
    initialIndex: storedIndex,
    onPersist: (queue, index) => {
      window.api.setStore('queue', queue);
      window.api.setStore('queueIndex', index);
    },
    onChange: () => {
      renderQueueList();
      renderResults();
      favorites.renderFavorites();
    },
    onTrackChange: (track) => {
      cancelPendingSkip(); // user-picked track must not be auto-skipped over
      setTrackInfo(track?.title, track?.channel); // null = queue emptied
      favorites.refreshFavoriteIcon(track);
      updateArtwork(track);
      noteTrackChange(track); // close previous listen, start tracking this one
      setDislikeIcon(track ? isDisliked(track.id) : false);
    },
  });
  queueManager.setRepeat(repeatMode);
  // brand splash shows when the queue is empty (onTrackChange won't fire at boot)
  els.brandSplash.classList.toggle('hidden', !!queueManager.getCurrent());
  await favorites.initFavorites();
  await initPlaylists();
  await initScoring(); // after favorites: scoring reads isFavorite()
  await initFocusMode();

  // Player init needs network (YouTube IFrame API). Show a notice if slow,
  // but COMPLETE init whenever it does resolve — a late ready must not leave
  // a dead overlay or skip the volume/cue restore.
  let playerIsReady = false;
  const finishPlayerInit = () => {
    playerIsReady = true;
    els.fallback.classList.add('hidden');
    player.setVolume(volumeValue);
    // Resume where the user left off: cue (no surprise audio on launch)
    const current = queueManager.getCurrent();
    if (current) {
      player.load(current.id, { autoplay: false });
      setTrackInfo(current.title, current.channel);
      favorites.refreshFavoriteIcon(current);
      updateArtwork(current);
      noteTrackChange(current); // boot-cued track gets listen-tracking too
      setDislikeIcon(isDisliked(current.id));
    }
  };
  await Promise.race([
    player.initPlayer().then(finishPlayerInit),
    new Promise((resolve) => setTimeout(resolve, PLAYER_LOAD_TIMEOUT_MS)),
  ]);
  if (!playerIsReady) {
    els.fallbackMessage.textContent =
      'YouTube player is taking long to load — check your internet connection.';
    els.btnOpenYoutube.classList.add('hidden');
    els.fallback.classList.remove('hidden');
  }
}

function boot() {
  applyStaticIcons();
  setPlayIcon(false);
  bindTitlebar();
  bindPanel();
  bindControls();
  bindPlayerEvents();
  bindHotkeys();
  initSearch();
  initErrorHandler();
  initResizeGrip();
  initImmersive();
  initPlayerDrag();
  // re-render the waveform at the new pitch when the window is resized so the
  // bars stay fine/even at any size (mask would otherwise just stretch)
  let waveRaf = 0;
  window.addEventListener('resize', () => {
    if (waveRaf) return;
    waveRaf = requestAnimationFrame(() => {
      waveRaf = 0;
      applyWaveformMask(els.seek, queueManager.getCurrent()?.id);
      player.nudgeQuality(); // bigger window → ask the embed for HD
    });
  });
  hydrateAndStart();
}

boot();
