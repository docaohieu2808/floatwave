// Search via youtubei.js (InnerTube, keyless) for BOTH modes: music =
// `music.search(type:song)` (songs with artist/album); video = general
// `search(type:video)` (real video uploads). One library — youtube-sr was
// dropped: it breaks on YouTube response-format changes ("undefined browseId").
// Returns minimal serializable records; never throws (structured error instead).
import { Innertube } from 'youtubei.js';

const RESULT_LIMIT = 15;

let innertube = null;
async function getInnertube() {
  if (!innertube) innertube = await Innertube.create();
  return innertube;
}

function formatSeconds(total) {
  if (!Number.isFinite(total) || total < 0) return '';
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function searchMusicCatalog(query) {
  const yt = await getInnertube();
  const search = await yt.music.search(query, { type: 'song' });
  const items = search?.songs?.contents ?? [];
  return items
    .filter((item) => item?.id)
    .slice(0, RESULT_LIMIT)
    .map((item) => ({
      id: item.id,
      title: item.title?.toString?.() ?? 'Untitled',
      channel: (item.artists ?? []).map((a) => a.name).filter(Boolean).join(', '),
      duration: item.duration?.text ?? formatSeconds(item.duration?.seconds),
      thumbnail: item.thumbnail?.contents?.[0]?.url ?? '',
    }));
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

async function searchVideosFallback(query) {
  const yt = await getInnertube();
  const search = await yt.search(query, { type: 'video' });
  const items = search?.results ?? [];
  return items
    .map((v) => {
      const id = v.id ?? v.video_id ?? '';
      return {
        id,
        title: v.title?.toString?.() ?? v.title?.text ?? 'Untitled',
        channel: v.author?.name ?? '',
        duration: v.duration?.text ?? v.length_text?.text ?? '',
        thumbnail: v.thumbnails?.[0]?.url ?? v.thumbnail?.[0]?.url ?? '',
      };
    })
    .filter((v) => VIDEO_ID_RE.test(v.id)) // drop shelves/playlists/non-video rows
    .slice(0, RESULT_LIMIT);
}

// YouTube Music "up next" radio for a seed track — powers playlist-like
// auto-advance: clicking a song builds a related-songs queue, and when the
// queue runs out the app extends it with the last track's radio.
export async function getUpNextTracks(videoId) {
  const id = String(videoId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return { ok: false, error: 'invalid video id' };
  try {
    const yt = await getInnertube();
    const upNext = await yt.music.getUpNext(id);
    const results = (upNext?.contents ?? [])
      .map((item) => ({
        id: item.video_id ?? item.id,
        title: item.title?.toString?.() ?? 'Untitled',
        channel:
          (item.artists ?? []).map((a) => a.name).filter(Boolean).join(', ') ||
          (item.author?.name ?? ''),
        duration: item.duration?.text ?? '',
        thumbnail: item.thumbnail?.[0]?.url ?? item.thumbnail?.contents?.[0]?.url ?? '',
      }))
      .filter((t) => t.id && t.id !== id); // seed track comes back first — drop it
    return { ok: true, results: results.slice(0, 30) };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

// mode 'music' (default): YT Music catalog → clean songs (artist/album), but
// these are mostly Art Tracks (audio + square album art, no real video).
// mode 'video': YouTube video search → real video uploads (MV/lyric/live) that
// actually play video in the embed. The search bar's 🎵/🎬 toggle picks the mode.
export async function searchYouTube(query, mode = 'music') {
  const q = String(query ?? '').trim();
  if (!q) return { ok: true, results: [] };
  if (mode === 'video') {
    try {
      return { ok: true, results: await searchVideosFallback(q) };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  }
  try {
    const results = await searchMusicCatalog(q);
    if (results.length) return { ok: true, results };
  } catch {
    // InnerTube shape drift / network — fall through to general search
  }
  try {
    return { ok: true, results: await searchVideosFallback(q) };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}
