// Roon-style pseudo-waveform for the seek bar: a deterministic random-walk
// of vertical bars seeded by the video id (each track gets its own stable
// shape), applied as a CSS mask over the seek input's progress gradient.

// FNV-1a hash → tiny xorshift-style PRNG, stable per id
function seededRandom(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const BAR_COUNT = 72;
const VIEW_W = 288;
const VIEW_H = 24;
const BAR_W = 2.6;

export function applyWaveformMask(rangeEl, seedId) {
  const random = seededRandom(seedId ?? 'no-track');
  const step = VIEW_W / BAR_COUNT;
  let level = 0.5; // random walk keeps neighboring bars related, like audio
  let rects = '';
  for (let i = 0; i < BAR_COUNT; i++) {
    level = Math.max(0.12, Math.min(1, level + (random() - 0.5) * 0.55));
    const barH = level * VIEW_H;
    const y = (VIEW_H - barH) / 2;
    rects += `<rect x='${(i * step).toFixed(1)}' y='${y.toFixed(1)}' width='${BAR_W}' height='${barH.toFixed(1)}' rx='1'/>`;
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${VIEW_W} ${VIEW_H}' preserveAspectRatio='none'>${rects}</svg>`;
  const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  rangeEl.style.webkitMaskImage = uri;
  rangeEl.style.maskImage = uri;
  rangeEl.style.webkitMaskSize = '100% 100%';
  rangeEl.style.maskSize = '100% 100%';
}
