// Roon-style pseudo-waveform for the seek bar. Real audio is unreachable — it
// lives in YouTube's cross-origin iframe — so we synthesize a musically
// plausible shape: a slow "song structure" envelope (quiet intro → louder
// choruses → fading outro) with dense, spiky per-bar detail on top, the way a
// real RMS waveform looks. Deterministic per track (seeded by the video id) so a
// track always looks the same, and WIDTH-AWARE so the bar pitch stays fine at
// any window size. Rendered as a CSS mask over the seek input's played/unplayed
// gradient (played = accent, unplayed = grey).

const VIEW_H = 24;
const BAR_PITCH = 2.2; // viewBox units between bars; mask stretches ~1:1 to px
const BAR_W = 1.4; // bar thickness (→ ~1.4px wide bars, ~0.8px gaps at any size)
const MIN_LEVEL = 0.14; // floor: lets quiet bits get fairly narrow, but not to zero

// FNV-1a hash of the seed text → 32-bit base
function seedBase(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic [0,1) noise sampled at a quantized position. Keyed on position
// (not bar index) so the shape is STABLE as the window — and thus the bar count
// — changes on resize.
function noiseAt(base, t) {
  let h = (base ^ Math.floor(t * 9973)) >>> 0; // 9973 buckets = fine, width-free
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Slow loudness envelope: 2–4 "choruses" via summed sines, tapered at the ends.
function makeStructure(base) {
  const param = (n) => noiseAt(base, 1.5 + n * 0.017); // stable params from the seed
  const sections = 2 + Math.floor(param(0) * 3);
  const phase1 = param(1) * Math.PI * 2;
  const phase2 = param(2) * Math.PI * 2;
  return (t) => {
    // a couple of gentle "section" humps — present but not deep
    const wave =
      0.17 * Math.sin(t * Math.PI * 2 * sections + phase1) +
      0.09 * Math.sin(t * Math.PI * 2 * sections * 2.7 + phase2);
    // pronounced narrow intro (ramps over the first ~10%) + a short outro taper
    const fade = Math.min(1, t / 0.1, (1 - t) / 0.05);
    return (0.72 + wave) * (0.45 + 0.55 * Math.max(0, Math.min(1, fade)));
  };
}

export function applyWaveformMask(rangeEl, seedId) {
  const base = seedBase(seedId ?? 'no-track');
  const structure = makeStructure(base);
  // width-aware: derive the bar count from the seek bar's actual pixel width so
  // the bars stay fine and evenly pitched whatever the window size.
  const pxWidth = rangeEl.clientWidth || 288;
  const barCount = Math.max(40, Math.round(pxWidth / BAR_PITCH));
  const viewW = barCount * BAR_PITCH;

  let rects = '';
  for (let i = 0; i < barCount; i++) {
    const t = barCount > 1 ? i / (barCount - 1) : 0;
    const detail = 0.66 + 0.34 * noiseAt(base, t); // per-bar texture (a touch livelier)
    const level = Math.max(MIN_LEVEL, Math.min(1, structure(t) * detail));
    const barH = level * VIEW_H;
    const y = (VIEW_H - barH) / 2; // mirrored around the centre line
    rects += `<rect x='${(i * BAR_PITCH).toFixed(2)}' y='${y.toFixed(2)}' width='${BAR_W}' height='${barH.toFixed(2)}' rx='0.6'/>`;
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${viewW.toFixed(1)} ${VIEW_H}' preserveAspectRatio='none'>${rects}</svg>`;
  const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  rangeEl.style.webkitMaskImage = uri;
  rangeEl.style.maskImage = uri;
  rangeEl.style.webkitMaskSize = '100% 100%';
  rangeEl.style.maskSize = '100% 100%';
}
