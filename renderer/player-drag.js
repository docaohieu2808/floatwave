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
    let ended = false; // onEnd must run exactly once (pointerup + lostpointercapture both fire)
    // A pure click must touch NO window API: repeatedly moving a frameless
    // window drifts its content size, so we hand off to main ONLY once the
    // pointer crosses the drag threshold — a real drag, never a click.

    const onMove = (moveEvent) => {
      if (
        !dragging &&
        Math.hypot(moveEvent.screenX - startX, moveEvent.screenY - startY) > DRAG_THRESHOLD
      ) {
        dragging = true;
        window.api.win.dragStart(); // real drag begins — main follows the cursor
      }
    };
    const onEnd = (endEvent) => {
      if (ended) return;
      ended = true;
      layer.removeEventListener('pointermove', onMove);
      layer.removeEventListener('pointerup', onEnd);
      layer.removeEventListener('pointercancel', onEnd);
      layer.removeEventListener('lostpointercapture', onEnd);
      try {
        layer.releasePointerCapture(endEvent.pointerId);
      } catch (_err) {
        /* capture already gone */
      }
      if (dragging) {
        window.api.win.dragEnd(); // stop the window-follow we started on first move
        return; // it was a drag, not a click
      }
      // A pure click — no window API was touched, so it can't drift the size.
      // A stale player ref must NOT throw past here: it would skip the
      // double-click cinema toggle below.
      try {
        player.toggle(); // a click → play/pause
      } catch (_err) {
        /* player not ready / reloaded — ignore, the gesture still counts */
      }
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
    // If capture is lost without a pointerup/cancel (window slid away, element
    // re-laid-out, focus stolen), still end the drag — otherwise main keeps
    // dragging the window under the cursor forever (feels frozen).
    layer.addEventListener('lostpointercapture', onEnd);
  });
}
