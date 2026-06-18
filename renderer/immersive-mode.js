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
}
