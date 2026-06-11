// Pure helpers: time formatting + YouTube URL/ID parsing. No DOM, no state.

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Accepts watch?v=, youtu.be/, /embed/, /shorts/, /live/ URLs or a raw 11-char ID.
// Returns the videoId or null if input is not a recognizable YouTube reference.
export function parseVideoId(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  if (VIDEO_ID_RE.test(text)) return text; // raw ID

  let url;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be') return null;

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') ?? '';
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Heuristic: does the input look like a URL (vs a search keyword)?
export function isLikelyUrl(input) {
  return /^(https?:\/\/|www\.|youtu\.be\/|youtube\.com\/|music\.youtube\.com\/)/i.test(
    String(input ?? '').trim()
  );
}

// In-place array reorder (drag & drop lists: favorites, playlists, results).
// The queue has its own moveTrack — it must also fix its current-index pointer.
export function moveItem(array, from, to) {
  if (from === to) return;
  if (from < 0 || to < 0 || from >= array.length || to >= array.length) return;
  const [moved] = array.splice(from, 1);
  array.splice(to, 0, moved);
}
