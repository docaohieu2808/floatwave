// Cinema mode. A double-click on the video hides the chrome (titlebar + search +
// controls) so the video owns the window; main tightens the window to the video
// and keeps it in place (see setImmersive). Double-click again to bring the bars
// back — no auto-hide, no hover surprises. There's no titlebar button: the
// double-click IS the toggle, with Esc as a guaranteed escape.
import { els } from './ui-elements.js';

let active = false;

export function isImmersive() {
  return active;
}

export function toggleImmersive() {
  if (document.body.classList.contains('focus-mode')) return; // not in the compact bar
  active = !active;
  document.body.classList.toggle('immersive', active);
  window.api.win.setImmersive(active);
}

export function initImmersive() {
  // The double-click-to-toggle gesture lives on #player-drag (z3) — which ANY
  // overlay covers (brand-splash z4 / fallback z5 / web-art z6). When such an
  // overlay appears mid-session (web-mode track, embed error, paused) the gesture
  // is swallowed, so cinema would have no way out. These two escapes do NOT
  // depend on the video layer, so cinema is never a dead end:
  //   • Esc   — keyboard, beats every overlay
  //   • a double-click that lands on an overlay (not #player-drag) — keeps the
  //     "double-click to toggle" muscle memory working even when covered
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) toggleImmersive();
  });
  document.addEventListener('dblclick', (event) => {
    if (active && !event.target.closest('#player-drag')) toggleImmersive();
  });
}
