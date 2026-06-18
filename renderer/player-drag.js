// Transparent layer over the video (#player-drag). It covers YouTube's own click
// target, so here we restore the natural gestures:
//   - a plain CLICK (no real movement) → toggle play/pause
//   - DOUBLE-click → toggle cinema mode (so you can exit cinema, where the
//     titlebar button is hidden)
//   - press-and-DRAG (moved past a small threshold) → move the whole window
// The renderer only signals drag start/end; MAIN follows the OS cursor and moves
// the window (avoids HiDPI screenX/DIP mismatches). Pointer capture keeps the up
// event coming even as the window slides under the cursor.
import * as player from './playback-router.js';
import { toggleImmersive } from './immersive-mode.js';

const DRAG_THRESHOLD = 4; // px before a press counts as a drag rather than a click
const DOUBLE_MS = 320; // two clicks within this = double-click

let lastClickAt = 0;

export function initPlayerDrag() {
  const layer = document.getElementById('player-drag');
  if (!layer) return;

  layer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return; // left button only
    event.preventDefault();
    layer.setPointerCapture(event.pointerId);
    const startX = event.screenX;
    const startY = event.screenY;
    let dragging = false;
    window.api.win.dragStart(); // main starts following the cursor

    const onMove = (moveEvent) => {
      if (
        !dragging &&
        Math.hypot(moveEvent.screenX - startX, moveEvent.screenY - startY) > DRAG_THRESHOLD
      ) {
        dragging = true;
      }
    };
    const onEnd = (endEvent) => {
      layer.removeEventListener('pointermove', onMove);
      layer.removeEventListener('pointerup', onEnd);
      layer.removeEventListener('pointercancel', onEnd);
      try {
        layer.releasePointerCapture(endEvent.pointerId);
      } catch (_err) {
        /* capture already gone */
      }
      window.api.win.dragEnd();
      if (dragging) return; // it was a drag, not a click
      player.toggle(); // a click → play/pause
      const now = endEvent.timeStamp;
      if (now - lastClickAt < DOUBLE_MS) {
        toggleImmersive(); // double-click → enter/exit cinema (the play toggles cancel out)
        lastClickAt = 0;
      } else {
        lastClickAt = now;
      }
    };

    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onEnd);
    layer.addEventListener('pointercancel', onEnd);
  });
}
