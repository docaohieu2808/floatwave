// Cinema mode (manual toggle). A titlebar button OR a double-click on the video
// hides the chrome (titlebar + search + controls) so the video owns the window;
// main tightens the window to the video and keeps it in place (see setImmersive).
// It stays put until you toggle it back — no auto-hide, no hover surprises. Since
// the titlebar button is hidden while in cinema, double-clicking the video is the
// way back out.
import { els } from './ui-elements.js';

let active = false;

export function isImmersive() {
  return active;
}

export function toggleImmersive() {
  if (document.body.classList.contains('focus-mode')) return; // not in the compact bar
  active = !active;
  document.body.classList.toggle('immersive', active);
  els.btnCinema.classList.toggle('active', active);
  window.api.win.setImmersive(active);
}

export function initImmersive() {
  els.btnCinema.addEventListener('click', toggleImmersive);

  // GUARANTEED escapes from cinema. The titlebar button is hidden while immersive,
  // and the double-click-to-exit gesture lives on #player-drag (z3) — which ANY
  // overlay covers (brand-splash z4 / fallback z5 / web-art z6). When such an
  // overlay appears mid-session (web-mode track, embed error, paused) the gesture
  // is swallowed and the user is trapped with no visible way out. These two exits
  // do NOT depend on the video layer, so cinema is never a dead end:
  //   • Esc   — keyboard, beats every overlay
  //   • a double-click that lands on an overlay (not #player-drag) — keeps the
  //     "double-click the video to exit" muscle memory working even when covered
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) toggleImmersive();
  });
  document.addEventListener('dblclick', (event) => {
    if (active && !event.target.closest('#player-drag')) toggleImmersive();
  });
}
