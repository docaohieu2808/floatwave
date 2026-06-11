// Focus mode: 340×116 corner widget — titlebar + transport controls only,
// search and player hidden. The window itself is resized by main
// (win:set-compact); this module owns the toggle button + the CSS class that
// hides the sections. Audio keeps playing: the YouTube iframe stays in the
// DOM, only display:none'd.
import { els } from './ui-elements.js';

let focused = false;

function apply() {
  document.body.classList.toggle('focus-mode', focused);
  els.btnFocusMode.classList.toggle('active', focused);
  els.btnFocusMode.title = focused ? 'Exit focus mode' : 'Focus mode (compact bar)';
}

export async function initFocusMode() {
  focused = !!(await window.api.getStore('focusMode'));
  apply(); // window was already created at the matching size by main
  els.btnFocusMode.addEventListener('click', async () => {
    focused = await window.api.win.setCompact(!focused);
    apply();
  });
}
