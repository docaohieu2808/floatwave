// Music-first search: primary = YouTube Music catalog via youtubei.js
// (InnerTube, keyless) so results are SONGS (artist/album), not random videos.
// Fallback = youtube-sr general video search when the music path fails.
// Returns minimal serializable records; never throws (structured error instead).
import { Innertube } from 'youtubei.js';
import { YouTube } from 'youtube-sr'; // CJS — class lives on the named export

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

async function searchVideosFallback(query) {
  const videos = await YouTube.search(query, { limit: RESULT_LIMIT, type: 'video' });
  return (videos ?? [])
    .filter((v) => v && v.id)
    .map((v) => ({
      id: v.id,
      title: v.title ?? 'Untitled',
      channel: v.channel?.name ?? '',
      duration: v.durationFormatted ?? '',
      thumbnail: v.thumbnail?.url ?? '',
    }));
}

// Finds alternative uploads of a song (MV / lyric video) when its YT Music
// "song" version turns out embed-blocked at play time. Label ATV tracks often
// block embeds even though playability APIs claim OK — only general-video
// uploads of the same song are reliably embeddable. Candidates are tried in
// order by the renderer; excludeIds = versions that already failed.
export async function findAlternativeVideos(query, excludeIds = []) {
  const q = String(query ?? '').trim();
  if (!q) return { ok: true, results: [] };
  const excluded = new Set(Array.isArray(excludeIds) ? excludeIds : []);
  try {
    const results = (await searchVideosFallback(q)).filter((v) => !excluded.has(v.id));
    return { ok: true, results: results.slice(0, 5) };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export async function searchYouTube(query) {
  const q = String(query ?? '').trim();
  if (!q) return { ok: true, results: [] };
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
