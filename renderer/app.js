// Bootstrap: wires modules together, hydrates persisted state, binds controls.
import * as player from './player-controller.js';
import * as queueManager from './queue-manager.js';
import { initSearch, renderResults } from './search-ui.js';
import * as favorites from './favorites-ui.js';
import {
  initErrorHandler, handlePlayerError, clearPlayerError, cancelPendingSkip,
} from './error-handler.js';
import { extendQueueWithRadio } from './radio-autoplay.js';
import { formatTime } from './format-utils.js';
import {
  els, setTrackInfo, setPlayIcon, setTimes, setRepeatIcon,
  showPanel, hidePanel, isPanelOpen, setPanelMessage, renderTrackList,
} from './ui-elements.js';

const REPEAT_CYCLE = { off: 'one', one: 'all', all: 'off' };
const PLAYER_LOAD_TIMEOUT_MS = 12000;

let repeatMode = 'off';
let isDraggingSeek = false;
let volumePersistTimer = null;

function renderQueueList() {
  renderTrackList(els.listQueue, queueManager.getQueue(), {
    currentId: queueManager.getCurrent()?.id,
    onPlay: (track) => queueManager.playNow(track),
    actionLabel: '✕',
    actionTitle: 'Remove from queue',
    onAction: (_track, index) => queueManager.removeAt(index),
  });
}

let webMode = false;

function bindTitlebar() {
  els.btnMinimize.addEventListener('click', () => window.api.win.minimize());
  els.btnClose.addEventListener('click', () => window.api.win.close());
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

  // Seek: while dragging, preview time only; commit on release ('change')
  els.seek.addEventListener('input', () => {
    isDraggingSeek = true;
    const { duration } = player.getTimes();
    els.timeCurrent.textContent = formatTime((Number(els.seek.value) / 100) * duration);
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
    clearTimeout(volumePersistTimer);
    volumePersistTimer = setTimeout(() => window.api.setStore('volume', value), 300);
  });
}

function bindPlayerEvents() {
  player.on('statechange', (state) => {
    setPlayIcon(state === player.STATE.PLAYING);
    if (state === player.STATE.PLAYING) {
      clearPlayerError();
      syncMetadataFromPlayer();
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
  const [volume, repeat, storedQueue, storedIndex] = await Promise.all([
    window.api.getStore('volume'),
    window.api.getStore('repeat'),
    window.api.getStore('queue'),
    window.api.getStore('queueIndex'),
  ]);

  repeatMode = ['off', 'one', 'all'].includes(repeat) ? repeat : 'off';
  setRepeatIcon(repeatMode);

  const volumeValue = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 50;
  els.volume.value = String(volumeValue);

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
    },
  });
  queueManager.setRepeat(repeatMode);
  await favorites.initFavorites();

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
  bindTitlebar();
  bindPanel();
  bindControls();
  bindPlayerEvents();
  initSearch();
  initErrorHandler();
  hydrateAndStart();
}

boot();
