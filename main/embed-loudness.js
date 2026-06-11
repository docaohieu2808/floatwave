// Matches the embed's loudness to the (louder) web backend. The YouTube embed
// applies "stable volume": it attenuates tracks LOUDER than its −14 dB target
// but never lifts quieter ones, so soft masters play soft — while real
// music.youtube.com normalizes everything UP to target and sounds consistently
// loud. The embed exposes each track's figure at
// getPlayerResponse().playerConfig.audioConfig.loudnessDb, so we route the
// <video> through a Web Audio makeup-gain + limiter and boost each track up to
// target (never down — YouTube already handles loud ones). Renderer can't reach
// the cross-origin iframe; main injects the script into the embed frame.

// ~+11 dB ceiling so a near-silent track can't detonate; limiter catches peaks.
const MAX_BOOST = 3.5;

// Runs INSIDE the embed frame. Always pins v.volume to the slider; builds the
// Web Audio loudness graph ONLY when `build` is true.
//
// CRITICAL: createMediaElementSource REROUTES the element's audio into the Web
// Audio graph — and a context that hasn't been unlocked by a REAL user gesture
// outputs NOTHING (silent until you touch the slider). The play button is in
// the parent frame, so its gesture never unlocks this cross-origin frame's
// context. So we build the graph ONLY on an explicit volume interaction (which
// IS proven to unlock audio). Until then the element plays normally (audible,
// just un-boosted) — playback is never silent. Once built, the graph persists
// and the per-track makeup applies on every call.
function injected(sliderGain, maxBoost, build) {
  const v = document.querySelector('video');
  if (!v) return false;

  // per-track target compensation: 10^(-loudnessDb/20), clamped to boost-only
  let makeup = 1;
  try {
    const mp = document.getElementById('movie_player');
    const ld = mp && mp.getPlayerResponse
      ? mp.getPlayerResponse()?.playerConfig?.audioConfig?.loudnessDb
      : undefined;
    if (typeof ld === 'number' && Number.isFinite(ld)) {
      makeup = Math.min(maxBoost, Math.max(1, Math.pow(10, -ld / 20)));
    }
  } catch {
    // stats shape drift — leave makeup at 1 (no boost), still safe
  }

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    let g = window.__miniLoud;
    if (build) {
      if (!g) g = window.__miniLoud = { ctx: new Ctx(), gain: null, el: null };
      if (g.ctx.state === 'suspended') g.ctx.resume();
      if (g.ctx.state === 'running' && g.el !== v) {
        const src = g.ctx.createMediaElementSource(v); // once per element
        const gain = g.ctx.createGain();
        const limiter = g.ctx.createDynamicsCompressor(); // brickwall-ish safety
        limiter.threshold.value = -1.5;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.25;
        src.connect(gain);
        gain.connect(limiter);
        limiter.connect(g.ctx.destination);
        g.gain = gain;
        g.el = v;
      }
    }
    if (g && g.gain && g.el === v) g.gain.gain.value = makeup; // routed → boost applies
    v.volume = sliderGain; // user volume rides on the element either way
    return makeup;
  } catch {
    v.volume = sliderGain; // graph unavailable — never let audio drop out
    return false;
  }
}

// build=true only on a real volume interaction (see injected()).
export function applyEmbedLoudness(win, sliderGain, build = false) {
  if (!win || win.isDestroyed()) return;
  const gain = Math.min(1, Math.max(0, Number(sliderGain)));
  if (Number.isNaN(gain)) return;
  const frame = win.webContents.mainFrame.framesInSubtree.find((f) =>
    f.url.includes('youtube.com/embed')
  );
  frame
    ?.executeJavaScript(`(${injected.toString()})(${gain}, ${MAX_BOOST}, ${!!build})`, true)
    .catch(() => {});
}
