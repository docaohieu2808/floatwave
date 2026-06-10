// Keyless YouTube search via youtube-sr (scraper, Node-only — runs in main).
// Returns minimal serializable records; never throws (structured error instead).
// NOTE: youtube-sr is CJS — the class lives on the named export, not default.
import { YouTube } from 'youtube-sr';

const RESULT_LIMIT = 15;

export async function searchYouTube(query) {
  const q = String(query ?? '').trim();
  if (!q) return { ok: true, results: [] };
  try {
    const videos = await YouTube.search(q, { limit: RESULT_LIMIT, type: 'video' });
    const results = (videos ?? [])
      .filter((v) => v && v.id)
      .map((v) => ({
        id: v.id,
        title: v.title ?? 'Untitled',
        channel: v.channel?.name ?? '',
        duration: v.durationFormatted ?? '',
        thumbnail: v.thumbnail?.url ?? '',
      }));
    return { ok: true, results };
  } catch (err) {
    // youtube-sr can break on YouTube HTML drift — keep app usable
    return { ok: false, error: String(err?.message ?? err) };
  }
}
