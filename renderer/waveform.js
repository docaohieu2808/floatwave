// Roon-style pseudo-waveform for the seek bar: a deterministic pseudo-random
// shape seeded by the video id (each track gets its own stable look), applied
// as a CSS mask over the seek input's progress gradient.
//
// Real audio data is unreachable — the sound lives inside YouTube's
// cross-origin iframe — so we fake a *musically plausible* shape instead:
// a slow "song structure" envelope (quiet intro → verses → loud choruses →
// fading outro) with mean-reverting bar-to-bar jitter on top. Mean reversion
// matters: a plain random walk drifts and hugs the floor/ceiling for long
// stretches, which reads as obviously fake.

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

// Slow envelope over the track's length: sum of two low-frequency sine waves
// (count + phases differ per track) shaped so it starts/ends quieter — the
// loud-chorus / quiet-verse alternation every real song has.
function structureEnvelope(random) {
  const sections = 2 + Math.floor(random() * 3); // 2–4 "choruses"
  const phase1 = random() * Math.PI * 2;
  const phase2 = random() * Math.PI * 2;
  return (t) => {
    // t in [0,1] across the song
    const wave =
      0.32 * Math.sin(t * Math.PI * 2 * sections + phase1) +
      0.16 * Math.sin(t * Math.PI * 2 * (sections * 2.7) + phase2);
    const fade = Math.min(1, t / 0.07, (1 - t) / 0.1); // intro/outro taper
    return (0.62 + wave) * (0.45 + 0.55 * Math.min(1, Math.max(0, fade)));
  };
}

export function applyWaveformMask(rangeEl, seedId) {
  const random = seededRandom(seedId ?? 'no-track');
  const envelope = structureEnvelope(random);
  const step = VIEW_W / BAR_COUNT;
  let jitter = 0; // mean-reverting detail on top of the envelope
  let rects = '';
  for (let i = 0; i < BAR_COUNT; i++) {
    // pull jitter back toward 0 each bar so it can't drift to an extreme
    jitter = jitter * 0.55 + (random() - 0.5) * 0.34;
    const level = Math.max(0.1, Math.min(1, envelope(i / (BAR_COUNT - 1)) + jitter));
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
