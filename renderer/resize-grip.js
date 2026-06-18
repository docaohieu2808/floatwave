// Bottom-corner resize grips (left + right). Native edge-resize is blocked in
// main, so these are the ONLY way to resize. Dragging a grip streams the desired
// content WIDTH to main (throttled to one message per frame); main derives the
// height to keep the video area locked at 16:9. The left grip pins the window's
// right edge (grows leftward); the right grip pins the left edge. Hidden in
// focus mode (CSS).
import { els } from './ui-elements.js';

// anchorRight=true → left grip (drag left to grow); false → right grip
function wireGrip(grip, anchorRight) {
  if (!grip) return;
  grip.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return; // left mouse button only
    event.preventDefault();
    const startX = event.screenX;
    const startWidth = window.innerWidth; // current content width
    let pendingWidth = null;
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      if (pendingWidth != null) window.api.win.resizeVideo(pendingWidth, anchorRight);
      pendingWidth = null;
    };
    const onMove = (moveEvent) => {
      const dx = moveEvent.screenX - startX;
      // right grip grows when dragged right (+dx); left grip when dragged left (-dx)
      pendingWidth = startWidth + (anchorRight ? -dx : dx);
      if (!rafId) rafId = requestAnimationFrame(flush);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (rafId) cancelAnimationFrame(rafId);
      flush(); // apply the final width
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // double-click a grip → back to the default mini size (replaces the old
  // titlebar reset button). Grips are hidden in focus mode, so no focus sync.
  grip.addEventListener('dblclick', () => window.api.win.resetSize());
}

export function initResizeGrip() {
  wireGrip(els.resizeGripRight, false);
  wireGrip(els.resizeGripLeft, true);
}
