// Bottom-corner resize grips (left + right). Native edge-resize is blocked in
// main, so these are the ONLY way to resize. Dragging a grip streams the desired
// content WIDTH to main (throttled to one message per frame); main derives the
// height to keep the video area locked at 16:9. The left grip pins the window's
// right edge (grows leftward); the right grip pins the left edge.
//
// Uses POINTER CAPTURE: while resizing, the window edge moves out from under the
// cursor, so plain mouseup on the document is unreliable (the pointer leaves the
// window and the release is lost → the drag "sticks" and the window keeps
// growing/shrinking as the mouse moves). Capturing the pointer to the grip
// guarantees we receive pointermove/pointerup until release. Hidden in focus
// mode (CSS).
import { els } from './ui-elements.js';

const DOUBLE_MS = 350; // two presses within this = double-click → reset

// anchorRight=true → left grip (drag left to grow); false → right grip
function wireGrip(grip, anchorRight) {
  if (!grip) return;
  let lastDownAt = 0;

  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return; // left button only
    event.preventDefault();

    // double-press → snap back to the default mini size (manual detection so it
    // doesn't depend on the synthetic dblclick, which pointer capture can eat)
    if (event.timeStamp - lastDownAt < DOUBLE_MS) {
      lastDownAt = 0;
      window.api.win.resetSize();
      return;
    }
    lastDownAt = event.timeStamp;

    grip.setPointerCapture(event.pointerId);
    const startX = event.screenX; // absolute → unaffected by the window moving
    const startWidth = window.innerWidth;
    let pendingWidth = null;
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      if (pendingWidth != null) window.api.win.resizeVideo(pendingWidth, anchorRight);
      pendingWidth = null;
    };
    const onMove = (moveEvent) => {
      const dx = moveEvent.screenX - startX;
      pendingWidth = startWidth + (anchorRight ? -dx : dx);
      if (!rafId) rafId = requestAnimationFrame(flush);
    };
    const onEnd = (endEvent) => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onEnd);
      grip.removeEventListener('pointercancel', onEnd);
      try {
        grip.releasePointerCapture(endEvent.pointerId);
      } catch (_err) {
        /* capture already gone */
      }
      if (rafId) cancelAnimationFrame(rafId);
      flush(); // apply the final width
    };

    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onEnd);
    grip.addEventListener('pointercancel', onEnd);
  });
}

export function initResizeGrip() {
  wireGrip(els.resizeGripRight, false);
  wireGrip(els.resizeGripLeft, true);
}
