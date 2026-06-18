// Wraps the YouTube IFrame Player API. Owns the YT.Player instance and the
// 1s tick loop. Emits: 'statechange' (YT state int), 'error' (code), 'tick' ({current,duration}).

export const STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

const listeners = { statechange: [], error: [], tick: [] };
let player = null;
let readyPromise = null;
let tickTimer = null;

export function on(event, handler) {
  listeners[event]?.push(handler);
}

function emit(event, payload) {
  for (const handler of listeners[event]) handler(payload);
}

function emitTick() {
  if (!player) return;
  emit('tick', {
    current: player.getCurrentTime?.() ?? 0,
    duration: player.getDuration?.() ?? 0,
  });
}

function startTick() {
  if (tickTimer) return;
  emitTick();
  tickTimer = setInterval(emitTick, 1000);
}

function stopTick() {
  clearInterval(tickTimer);
  tickTimer = null;
}

// Loads the IFrame API script and resolves once the player is ready for commands.
export function initPlayer() {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => {
      // origin matters for postMessage on http(s); on file:// it must be omitted
      const playerVars = {
        enablejsapi: 1,
        controls: 0,
        rel: 0,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3,
      };
      if (location.protocol.startsWith('http')) playerVars.origin = location.origin;

      player = new YT.Player('player', {
        width: '100%',
        height: '100%',
        playerVars,
        events: {
          onReady: () => resolve(),
          onStateChange: (event) => {
            if (event.data === STATE.PLAYING) {
              startTick();
              player?.setPlaybackQuality?.(SUGGESTED_QUALITY); // nudge HD once playing
            } else stopTick();
            if (event.data === STATE.ENDED || event.data === STATE.CUED) emitTick();
            emit('statechange', event.data);
          },
          onError: (event) => {
            stopTick();
            emit('error', event.data);
          },
        },
      });
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return readyPromise;
}

// YouTube ultimately auto-selects quality, but suggestedQuality nudges the embed
// toward HD instead of the low default it tends to pick for a small player.
const SUGGESTED_QUALITY = 'hd1080';

export function load(videoId, { autoplay = true } = {}) {
  // optional-chained: methods don't exist until onReady fires
  if (autoplay) player?.loadVideoById?.({ videoId, suggestedQuality: SUGGESTED_QUALITY });
  else player?.cueVideoById?.({ videoId, suggestedQuality: SUGGESTED_QUALITY }); // boot: cue, no audio
}

// Re-suggest HD (e.g. after the window is enlarged). Deprecated by YouTube but
// harmless — a hint at worst.
export function nudgeQuality() {
  player?.setPlaybackQuality?.(SUGGESTED_QUALITY);
}

export function stop() {
  stopTick();
  player?.stopVideo?.();
}

export function play() {
  player?.playVideo?.();
}

export function pause() {
  player?.pauseVideo?.();
}

export function toggle() {
  if (!player) return;
  if (player.getPlayerState?.() === STATE.PLAYING) pause();
  else play();
}

export function seek(seconds) {
  player?.seekTo?.(seconds, true);
}

export function setVolume(value) {
  if (!player) return;
  player.setVolume?.(value);
  if (value === 0) player.mute?.();
  else player.unMute?.();
}

export function getTimes() {
  return {
    current: player?.getCurrentTime?.() ?? 0,
    duration: player?.getDuration?.() ?? 0,
  };
}

// {title, author} of the loaded video — used to fill metadata for pasted URLs
export function getVideoData() {
  const data = player?.getVideoData?.();
  return { title: data?.title ?? '', author: data?.author ?? '' };
}
