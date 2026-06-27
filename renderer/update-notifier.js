// Auto-update toast: listens to the 'update:status' stream from main and shows
// an unobtrusive pill. Silent while checking / up-to-date / on error — it only
// surfaces once a newer build is actually downloading or ready, so a normal
// launch shows nothing. "Restart & update" -> quitAndInstall via main.
import { els } from './ui-elements.js';
import { ICONS } from './icons.js';

function show(text, withInstall) {
  els.updateText.textContent = text;
  els.updateInstall.classList.toggle('hidden', !withInstall);
  els.updateToast.classList.remove('hidden');
}

function hide() {
  els.updateToast.classList.add('hidden');
}

function render(status) {
  switch (status?.state) {
    case 'available':
      show('New version found — downloading…', false);
      break;
    case 'downloading':
      show(`Downloading update… ${status.percent ?? 0}%`, false);
      break;
    case 'ready':
      show(`FloatWave ${status.version ?? ''} ready`.trim(), true);
      break;
    // checking / none / error -> stay quiet (no nagging on a normal launch)
    default:
      break;
  }
}

export function initUpdateNotifier() {
  els.updateDismiss.innerHTML = ICONS.close;
  // Dismiss only hides the pill — autoInstallOnAppQuit still applies it on quit.
  els.updateDismiss.addEventListener('click', hide);
  els.updateInstall.addEventListener('click', () => {
    show('Updating…', false); // brief feedback before the app quits to install
    window.api.update.install();
  });
  window.api.update.onStatus(render);
}
