// Diagnostic: verify playlist-like radio behavior.
// (1) clicking a search result builds an up-next radio queue;
// (2) seeking to the end auto-advances to the next track;
// (3) ending the LAST queue item auto-extends the queue and keeps playing.
// Requires `npm run dev`.
const puppeteer = require('puppeteer-core');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null,
  });
  const page = (await browser.pages()).find((p) => p.url().includes('index.html'));
  if (!page) throw new Error('app page not found');
  let failures = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failures += 1;
  };
  const appState = () =>
    page.evaluate(async () => ({
      title: document.getElementById('track-title').textContent,
      cur: document.getElementById('time-current').textContent,
      queueLen: ((await window.api.getStore('queue')) ?? []).length,
      qi: await window.api.getStore('queueIndex'),
    }));
  const seekToEnd = () =>
    page.evaluate(() => {
      const seek = document.getElementById('seek');
      seek.value = '99.7';
      seek.dispatchEvent(new Event('change', { bubbles: true }));
    });

  const snapshot = await page.evaluate(async () => ({
    queue: await window.api.getStore('queue'),
    qi: await window.api.getStore('queueIndex'),
  }));

  // (1) search + click result 0 → radio queue builds
  await page.evaluate(() => {
    const input = document.getElementById('search-input');
    input.value = 'em của ngày hôm qua';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await wait(5000);
  await page.evaluate(() => document.querySelectorAll('#list-results li')[0]?.click());
  await wait(8000); // playback start + radio fetch + queue replace
  let s = await appState();
  // blocked tracks may auto-swap/skip a few positions — what matters is the
  // radio queue exists and SOMETHING is playing
  check('radio queue built from clicked song', s.queueLen >= 10,
    `queueLen=${s.queueLen} qi=${s.qi} playing="${s.title}"`);
  const qiBefore = s.qi;

  // (2) seek near end → must advance to a following track
  await seekToEnd();
  await wait(12000); // few seconds tail + next video load
  s = await appState();
  check('auto-advance to next track', s.qi > qiBefore,
    `qi ${qiBefore} -> ${s.qi}, now="${s.title}" cur=${s.cur}`);

  // (3) jump to LAST item, end it → queue must auto-extend and keep playing
  const lastIndex = s.queueLen - 1;
  await page.evaluate(async (i) => {
    // jump via queue panel click on the last row
    document.getElementById('btn-panel').click();
    await new Promise((r) => setTimeout(r, 300));
    document.querySelectorAll('#list-queue li')[i]?.click();
  }, lastIndex);
  await wait(6000);
  const lenBefore = (await appState()).queueLen;
  await seekToEnd();
  await wait(14000); // end + getUpNext fetch + append + advance
  s = await appState();
  check('queue auto-extends at the end (radio continues)',
    s.queueLen > lenBefore && s.qi >= lastIndex + 1,
    `len ${lenBefore} -> ${s.queueLen}, qi=${s.qi}, playing="${s.title}" cur=${s.cur}`);

  // restore user's queue
  await page.evaluate(async (snap) => {
    await window.api.setStore('queue', snap.queue ?? []);
    await window.api.setStore('queueIndex', snap.qi ?? -1);
  }, snapshot);
  console.log('user queue store restored');
  await browser.disconnect();
  console.log(failures === 0 ? 'RADIO DIAG: ALL PASS' : `RADIO DIAG: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
