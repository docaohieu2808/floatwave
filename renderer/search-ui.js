// Search input handling + results rendering. URL paste routes straight to playback.
import { els, renderTrackList, setPanelMessage, showPanel } from './ui-elements.js';
import { parseVideoId, isLikelyUrl } from './format-utils.js';
import * as queueManager from './queue-manager.js';

let lastResults = [];

export function initSearch() {
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    handleSubmit(els.searchInput.value);
  });
}

async function handleSubmit(rawInput) {
  const text = String(rawInput ?? '').trim();
  if (!text) return;

  // Pasted link or raw ID → play directly (track title filled by player later)
  const videoId = parseVideoId(text);
  if (videoId) {
    queueManager.playNow({ id: videoId, title: videoId, channel: '' });
    els.searchInput.value = '';
    return;
  }
  if (isLikelyUrl(text)) {
    showPanel('results');
    renderTrackList(els.listResults, []);
    setPanelMessage('Not a valid YouTube link');
    return;
  }
  await runSearch(text);
}

async function runSearch(query) {
  showPanel('results');
  renderTrackList(els.listResults, []);
  setPanelMessage('Searching…');
  try {
    const response = await window.api.search(query);
    if (!response?.ok) {
      setPanelMessage('Search failed — try again');
      return;
    }
    if (!response.results.length) {
      setPanelMessage('No results');
      return;
    }
    setPanelMessage(null);
    lastResults = response.results;
    renderResults();
  } catch {
    setPanelMessage('Search failed — try again');
  }
}

export function renderResults() {
  renderTrackList(els.listResults, lastResults, {
    currentId: queueManager.getCurrent()?.id,
    onPlay: (track) => queueManager.playNow(track),
    actionLabel: '+',
    actionTitle: 'Add to queue',
    onAction: (track) => queueManager.add(track),
  });
}
