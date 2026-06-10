// Diagnostic: reproduce a reported "song won't play" case end-to-end.
// Searches the given query in the real UI, clicks result #N, then samples
// app UI state AND the <video> element inside the YouTube embed iframe
// every 2s. Usage: node scripts/diag-track-playback.cjs "query" [resultIndex]
const puppeteer = require('puppeteer-core');

const QUERY = process.argv[2] ?? 'chờ người hạnh nguyên';
const RESULT_INDEX = Number(process.argv[3] ?? 0);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null,
  });
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes('index.html'));
  if (!page) throw new Error('app page not found — run npm run dev first');

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  // snapshot user state; restored by caller via diag-restore (printed below)
  const snapshot = await page.evaluate(async () => ({
    queue: await window.api.getStore('queue'),
    queueIndex: await window.api.getStore('queueIndex'),
  }));
  console.log('snapshot queue len:', snapshot.queue?.length ?? 0);

  // run the search through the real UI
  await page.evaluate((q) => {
    const input = document.getElementById('search-input');
    input.value = q;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }, QUERY);
  await wait(5000);

  const rows = await page.$$eval('#list-results li', (lis) =>
    lis.map((li) => li.querySelector('.t')?.textContent)
  );
  console.log('results:', JSON.stringify(rows.slice(0, 5)));
  if (!rows.length) throw new Error('no results rendered');

  // click the requested row (JS click works even when window unfocused)
  await page.evaluate((i) => {
    document.querySelectorAll('#list-results li')[i]?.click();
  }, RESULT_INDEX);
  console.log(`clicked result #${RESULT_INDEX}: ${rows[RESULT_INDEX]}`);

  // sample for 24s: app UI + embed iframe <video> element
  for (let t = 0; t <= 24; t += 3) {
    const ui = await page.evaluate(() => ({
      title: document.getElementById('track-title').textContent,
      cur: document.getElementById('time-current').textContent,
      tot: document.getElementById('time-total').textContent,
      fb: !document.getElementById('player-fallback').classList.contains('hidden'),
      fbMsg: document.getElementById('fallback-message').textContent,
    }));
    // the embed iframe is a separate frame on the same page
    const frame = page.frames().find((f) => f.url().includes('youtube.com/embed'));
    let video = null;
    if (frame) {
      video = await frame
        .evaluate(() => {
          const v = document.querySelector('video');
          if (!v) return { exists: false };
          return {
            exists: true,
            paused: v.paused,
            muted: v.muted,
            volume: Math.round(v.volume * 100) / 100,
            currentTime: Math.round(v.currentTime * 10) / 10,
            duration: Math.round(v.duration * 10) / 10 || 0,
            readyState: v.readyState,
            ended: v.ended,
            error: v.error ? { code: v.error.code, msg: v.error.message } : null,
          };
        })
        .catch((e) => ({ evalError: String(e.message).slice(0, 60) }));
    }
    console.log(
      `t+${String(t).padStart(2)}s ui=${JSON.stringify(ui)} video=${JSON.stringify(video)}`
    );
    if (t < 24) await wait(3000);
  }

  console.log('console errors:', consoleErrors.length ? JSON.stringify(consoleErrors) : 'none');

  // restore user queue
  await page.evaluate(async (snap) => {
    await window.api.setStore('queue', snap.queue ?? []);
    await window.api.setStore('queueIndex', snap.queueIndex ?? -1);
  }, snapshot);
  console.log('user queue store restored');
  await browser.disconnect();
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
