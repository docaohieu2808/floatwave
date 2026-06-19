// "About" dialog — shows the app version / author / license / repo link. The
// version comes from MAIN (app.getVersion()) so it's always the real packaged
// number, not a hardcoded string that drifts out of date.
import { els } from './ui-elements.js';

function open() {
  els.aboutDialog.classList.remove('hidden');
}
function close() {
  els.aboutDialog.classList.add('hidden');
}
function isOpen() {
  return !els.aboutDialog.classList.contains('hidden');
}

export async function initAbout() {
  let repoUrl = '';
  try {
    const info = await window.api.getInfo();
    els.aboutVersion.textContent = `v${info.version}`;
    els.aboutAuthor.textContent = info.author;
    els.aboutLicense.textContent = info.license;
    repoUrl = info.repo || '';
  } catch {
    els.aboutVersion.textContent = '';
  }

  els.btnInfo.addEventListener('click', open);
  els.aboutClose.addEventListener('click', close);
  // click the dimmed backdrop (but not the box) dismisses
  els.aboutDialog.addEventListener('click', (event) => {
    if (event.target === els.aboutDialog) close();
  });
  // repo link → system browser (main allowlists this exact URL)
  els.aboutRepo.addEventListener('click', (event) => {
    event.preventDefault();
    if (repoUrl) window.api.openExternal(repoUrl);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) close();
  });
}
