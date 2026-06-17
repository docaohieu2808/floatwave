// Search input handling + results rendering. URL paste routes straight to playback.
// Recent searches (MRU, max 10, persisted) drop down when the empty input is focused.
import { els, renderTrackList, setPanelMessage, showPanel } from './ui-elements.js';
import { parseVideoId, isLikelyUrl, moveItem } from './format-utils.js';
import * as queueManager from './queue-manager.js';
import { playWithRadio } from './radio-autoplay.js';
import { openAddChooser } from './playlists-ui.js';
import { ICONS } from './icons.js';

const HISTORY_LIMIT = 10;
const SUGGEST_DEBOUNCE_MS = 220;

let lastResults = [];
let history = []; // recent query strings, most recent first
let searchMode = 'music'; // 'music' (YT Music songs) | 'video' (real videos)
let suggestTimer = null;

function renderSearchModeButton() {
  const isVideo = searchMode === 'video';
  els.btnSearchMode.innerHTML = isVideo ? ICONS.video : ICONS.musicNote;
  els.btnSearchMode.classList.toggle('active', isVideo);
  els.btnSearchMode.title = isVideo
    ? 'Video — real YouTube videos (click for Music)'
    : 'Music — YT Music songs, mostly audio (click for Video)';
  els.searchInput.placeholder = isVideo
    ? 'Search videos or paste a link…'
    : 'Search music or paste a link…';
}

export async function initSearch() {
  els.btnSearchMode.addEventListener('click', () => {
    searchMode = searchMode === 'video' ? 'music' : 'video';
    window.api.setStore('searchMode', searchMode);
    renderSearchModeButton();
    // re-run the active search in the new mode so the switch is immediate
    const text = els.searchInput.value.trim();
    if (text && !parseVideoId(text) && !isLikelyUrl(text)) runSearch(text);
  });

  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideHistory();
    if (event.key !== 'Enter') return;
    hideHistory();
    handleSubmit(els.searchInput.value);
  });

  // dropdown: recent searches when empty, live suggestions while typing
  els.searchInput.addEventListener('focus', () => updateDropdown());
  els.searchInput.addEventListener('input', () => updateDropdown());
  // blur fires before the row's click — let the click land first
  els.searchInput.addEventListener('blur', () => setTimeout(hideHistory, 150));

  const [stored, mode] = await Promise.all([
    window.api.getStore('searchHistory'),
    window.api.getStore('searchMode'),
  ]);
  history = Array.isArray(stored) ? stored.filter((q) => typeof q === 'string') : [];
  searchMode = mode === 'video' ? 'video' : 'music';
  renderSearchModeButton();
}

function hideHistory() {
  clearTimeout(suggestTimer);
  els.searchHistory.classList.add('hidden');
}

// Empty input → recent searches; typed text → debounced live suggestions.
// (URL/ID pastes get no dropdown — they play directly on Enter.)
function updateDropdown() {
  const text = els.searchInput.value.trim();
  clearTimeout(suggestTimer);
  if (!text) return renderHistory();
  if (parseVideoId(text) || isLikelyUrl(text)) return hideHistory();
  suggestTimer = setTimeout(async () => {
    const res = await window.api.searchSuggest(text).catch(() => null);
    // ignore stale responses — the box may have changed while we waited
    if (els.searchInput.value.trim() !== text) return;
    if (res?.ok && res.suggestions.length) renderSuggestions(res.suggestions);
    else hideHistory();
  }, SUGGEST_DEBOUNCE_MS);
}

// One clickable row (icon + text). onPick runs the search; onRemove (optional)
// adds a ✕ that deletes the entry without closing the dropdown.
function dropdownRow(icon, text, onPick, onRemove) {
  const row = document.createElement('div');
  row.className = 'history-row';
  const pick = document.createElement('button');
  pick.className = 'history-pick';
  pick.innerHTML = icon; // trusted SVG constant from icons.js
  pick.appendChild(document.createTextNode(text));
  pick.addEventListener('click', () => onPick());
  row.appendChild(pick);
  if (onRemove) {
    const remove = document.createElement('button');
    remove.className = 'history-remove';
    remove.innerHTML = ICONS.close;
    remove.title = 'Remove from recent searches';
    // keep focus so the blur-hide doesn't fire — delete several in a row
    remove.addEventListener('mousedown', (event) => event.preventDefault());
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      onRemove();
    });
    row.appendChild(remove);
  }
  return row;
}

function renderSuggestions(suggestions) {
  els.searchHistory.textContent = '';
  for (const s of suggestions) {
    els.searchHistory.appendChild(
      dropdownRow(ICONS.search, s, () => {
        els.searchInput.value = s;
        hideHistory();
        runSearch(s);
      })
    );
  }
  els.searchHistory.classList.remove('hidden');
}

function renderHistory() {
  if (!history.length || els.searchInput.value.trim()) return hideHistory();
  els.searchHistory.textContent = '';
  for (const query of history) {
    els.searchHistory.appendChild(
      dropdownRow(
        ICONS.history,
        query,
        () => {
          els.searchInput.value = query;
          hideHistory();
          runSearch(query);
        },
        () => removeFromHistory(query) // ✕ removes just this recent search
      )
    );
  }
  els.searchHistory.classList.remove('hidden');
}

// MRU update, persisted; case-insensitive dedupe
function rememberQuery(query) {
  const lower = query.toLowerCase();
  history = [query, ...history.filter((q) => q.toLowerCase() !== lower)].slice(0, HISTORY_LIMIT);
  window.api.setStore('searchHistory', history);
}

function removeFromHistory(query) {
  history = history.filter((q) => q !== query);
  window.api.setStore('searchHistory', history);
  renderHistory(); // re-render in place (hides itself if now empty)
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
  setPanelMessage(searchMode === 'video' ? 'Searching videos…' : 'Searching…');
  try {
    const response = await window.api.search(query, searchMode);
    if (!response?.ok) {
      setPanelMessage('Search failed — try again');
      return;
    }
    if (!response.results.length) {
      setPanelMessage('No results');
      return;
    }
    rememberQuery(query); // only searches that actually returned songs
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
    // playlist behavior: clicking a song plays it AND builds its radio queue
    onPlay: (track) => playWithRadio(track),
    // display-order only (not persisted) — consistent drag UX across all tabs
    onReorder: (from, to) => {
      moveItem(lastResults, from, to);
      renderResults();
    },
    actions: [
      { icon: ICONS.plus, title: 'Add to queue / playlist', onClick: (track) => openAddChooser(track) },
    ],
  });
}
