// Full-feature e2e suite over CDP (needs `npm run dev` running).
// Drives the real UI: search → radio queue → scoring/dislike → favorites →
// drag&drop on every tab → playlists → repeat → web mode → focus mode.
// Two phases (the app must be RESTARTED between them to test session restore):
//   node scripts/e2e-feature-suite.cjs run             # backup store, run all tests
//   node scripts/e2e-feature-suite.cjs verify-restore  # check hydration, restore store
// The user's store keys are snapshotted to %TEMP% in phase 1 and fully
// restored at the end of phase 2 — the suite leaves no test data behind.
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SNAPSHOT = path.join(os.tmpdir(), 'miniplayer-e2e-snapshot.json');
const KEYS = ['queue', 'queueIndex', 'volume', 'repeat', 'favorites', 'playlists',
  'searchHistory', 'trackStats', 'focusMode', 'alwaysOnTop'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;
function assert(name, ok, detail = '') {
  if (ok) passCount += 1;
  else failCount += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function connect() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const page = (await browser.pages()).find((p) => p.url().includes('index.html'));
  if (!page) throw new Error('app page not found — is `npm run dev` running?');
  return { browser, page };
}

// Synthetic HTML5 drag&drop inside the page (handlers use real DnD events)
const dragInPage = (listSelector, from, to) => `(() => {
  const rows = [...document.querySelectorAll('${listSelector} li')].filter(li => !li.classList.contains('list-header'));
  if (rows.length <= Math.max(${from}, ${to})) return false;
  const dt = new DataTransfer();
  rows[${from}].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  rows[${to}].dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
  rows[${to}].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  rows[${from}].dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  return true;
})()`;

const getStore = (page, key) => page.evaluate((k) => window.api.getStore(k), key);
const currentTrack = (page) =>
  page.evaluate(async () => {
    const [queue, index] = await Promise.all([
      window.api.getStore('queue'), window.api.getStore('queueIndex'),
    ]);
    return queue?.[index] ?? null;
  });

async function phaseRun() {
  const { browser, page } = await connect();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  // ----- backup the user's real store before touching anything -----
  const backup = {};
  for (const key of KEYS) backup[key] = await getStore(page, key);
  fs.writeFileSync(SNAPSHOT, JSON.stringify({ backup }, null, 1));
  console.log('store backed up →', SNAPSHOT);

  // mute during the whole suite — tests play real audio
  await page.evaluate(() => {
    const v = document.getElementById('volume');
    v.value = '0';
    v.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // ----- 1. boot state -----
  const boot = await page.evaluate(() => ({
    heart: document.getElementById('btn-favorite').innerHTML.includes('<svg'),
    dislike: document.getElementById('btn-dislike').innerHTML.includes('<svg'),
    mask: document.getElementById('seek').style.webkitMaskImage.includes('svg'),
  }));
  assert('boot: heart/dislike icons render', boot.heart && boot.dislike);
  assert('boot: waveform mask applied', boot.mask);

  // ----- 2. search + history -----
  await page.evaluate(() => {
    const input = document.getElementById('search-input');
    input.value = 'den vau';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await sleep(4000);
  const resultRows = await page.evaluate(() => document.querySelectorAll('#list-results li').length);
  assert('search: results render', resultRows > 0, `${resultRows} rows`);
  const history = await getStore(page, 'searchHistory');
  assert('search history: query saved MRU-first', history?.[0] === 'den vau');
  const dropdown = await page.evaluate(() => {
    const input = document.getElementById('search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    const el = document.getElementById('search-history');
    return !el.classList.contains('hidden') && el.children.length > 0;
  });
  assert('search history: dropdown on focused empty input', dropdown);
  await page.evaluate(() => document.getElementById('search-input').blur());

  // ----- 3. play result → radio queue builds -----
  const maskBefore = await page.evaluate(() => document.getElementById('seek').style.webkitMaskImage);
  await page.evaluate(() => document.querySelector('#list-results li').click());
  let queueLen = 0;
  for (let i = 0; i < 12 && queueLen < 4; i++) { await sleep(1000); queueLen = (await getStore(page, 'queue'))?.length ?? 0; }
  assert('radio: clicking a result builds an up-next queue', queueLen >= 4, `queue=${queueLen}`);
  const maskAfter = await page.evaluate(() => document.getElementById('seek').style.webkitMaskImage);
  assert('waveform: per-track shape changed on load', maskAfter !== maskBefore);

  // ----- 4. early-skip scoring (needs ≥1s of actual playback for ticks) -----
  await sleep(4000);
  await page.evaluate(() => document.getElementById('btn-next').click());
  await sleep(1500); // persist debounce
  const statsAfterSkip = (await getStore(page, 'trackStats')) ?? {};
  const earlySkipped = Object.values(statsAfterSkip).some((e) => e.earlySkips >= 1);
  assert('scoring: skip in first 10s recorded as earlySkip', earlySkipped);

  // ----- 5. dislike: marks + advances -----
  const beforeDislike = await currentTrack(page);
  await page.evaluate(() => document.getElementById('btn-dislike').click());
  await sleep(1500);
  const statsAfterDislike = (await getStore(page, 'trackStats')) ?? {};
  assert('dislike: trackStats flag set', !!statsAfterDislike[beforeDislike?.id]?.disliked);
  const afterDislike = await currentTrack(page);
  assert('dislike: auto-advanced to next track', afterDislike?.id !== beforeDislike?.id);

  // ----- 6. favorites: toggle two, reorder via DnD -----
  await page.evaluate(() => document.getElementById('btn-favorite').click());
  await page.evaluate(() => document.getElementById('btn-next').click());
  await sleep(800);
  await page.evaluate(() => document.getElementById('btn-favorite').click());
  await sleep(300);
  let favorites = (await getStore(page, 'favorites')) ?? [];
  assert('favorites: ♥ persists (2 added)', favorites.length >= 2, `count=${favorites.length}`);
  const favOrderBefore = favorites.map((t) => t.id).join();
  const favDragged = await page.evaluate(dragInPage('#list-favorites', 0, 1));
  await sleep(300);
  favorites = (await getStore(page, 'favorites')) ?? [];
  assert('favorites: drag & drop reorder persists', favDragged && favorites.map((t) => t.id).join() !== favOrderBefore);

  // ----- 7. queue DnD: order changes, current pointer follows -----
  const currentBefore = await currentTrack(page);
  const queueBefore = ((await getStore(page, 'queue')) ?? []).map((t) => t.id).join();
  const queueDragged = await page.evaluate(dragInPage('#list-queue', 1, 2));
  await sleep(300);
  const queueAfter = ((await getStore(page, 'queue')) ?? []).map((t) => t.id).join();
  const currentAfter = await currentTrack(page);
  assert('queue: drag & drop reorder persists', queueDragged && queueAfter !== queueBefore);
  assert('queue: current-track pointer survives reorder', currentAfter?.id === currentBefore?.id);

  // ----- 8. playlists: create via chooser, add 2nd, reorder tracks -----
  await page.evaluate(() => {
    document.querySelectorAll('#list-results li .row-action')[0].click(); // + on result row 0
  });
  await page.evaluate(() => {
    document.getElementById('chooser-new-name').value = 'e2e suite test';
    document.getElementById('chooser-create').click();
  });
  await page.evaluate(() => {
    document.querySelectorAll('#list-results li .row-action')[1].click(); // + on result row 1
  });
  await page.evaluate(() => {
    const option = [...document.querySelectorAll('#chooser-options li')]
      .find((li) => li.textContent.includes('e2e suite test'));
    option?.click();
  });
  await sleep(300);
  let playlists = (await getStore(page, 'playlists')) ?? [];
  const testList = playlists.find((p) => p.name === 'e2e suite test');
  assert('playlists: create + add via chooser', testList?.tracks.length === 2,
    `tracks=${testList?.tracks.length ?? 0}`);
  // open detail view, reorder its tracks
  await page.evaluate(() => {
    document.querySelector('#panel-tabs .tab[data-tab="playlists"]').click();
    const row = [...document.querySelectorAll('#list-playlists li')]
      .find((li) => li.textContent.includes('e2e suite test'));
    row?.click();
  });
  await sleep(200);
  const plOrderBefore = testList.tracks.map((t) => t.id).join();
  const plDragged = await page.evaluate(dragInPage('#list-playlists', 0, 1));
  await sleep(300);
  playlists = (await getStore(page, 'playlists')) ?? [];
  const plOrderAfter = playlists.find((p) => p.name === 'e2e suite test')?.tracks.map((t) => t.id).join();
  assert('playlists: drag & drop track reorder persists', plDragged && plOrderAfter !== plOrderBefore);

  // ----- 9. results DnD (display-order only) -----
  const resOrderBefore = await page.evaluate(() => {
    document.querySelector('#panel-tabs .tab[data-tab="results"]').click();
    return [...document.querySelectorAll('#list-results li .t')].map((t) => t.textContent).join();
  });
  await page.evaluate(dragInPage('#list-results', 0, 2));
  await sleep(200);
  const resOrderAfter = await page.evaluate(() =>
    [...document.querySelectorAll('#list-results li .t')].map((t) => t.textContent).join());
  assert('results: drag & drop reorders display', resOrderAfter !== resOrderBefore);
  await page.evaluate(() => document.getElementById('btn-panel-close').click());

  // ----- 10. repeat cycle persists -----
  await page.evaluate(() => document.getElementById('btn-repeat').click());
  await sleep(200);
  assert('repeat: off → one persisted', (await getStore(page, 'repeat')) === 'one');

  // ----- 11. web mode round-trip -----
  await page.evaluate(() => document.getElementById('btn-web-mode').click());
  await sleep(4000);
  const hasWebTarget = (await browser.pages()).some((p) => p.url().includes('music.youtube.com'));
  assert('web mode: music.youtube.com window opens', hasWebTarget);
  await page.evaluate(() => document.getElementById('btn-web-mode').click());
  await sleep(800);

  // ----- 12. focus mode: exact resize both ways -----
  await page.evaluate(() => document.getElementById('btn-focus-mode').click());
  await sleep(500);
  const compact = await page.evaluate(() => ({
    h: window.innerHeight, cls: document.body.classList.contains('focus-mode'),
  }));
  assert('focus mode: collapses to 116 content px', compact.h === 116 && compact.cls, `h=${compact.h}`);
  await page.evaluate(() => document.getElementById('btn-focus-mode').click());
  await sleep(500);
  const full = await page.evaluate(() => window.innerHeight);
  assert('focus mode: restores to 420 exactly', full === 420, `h=${full}`);

  // leave test state in store for the restore phase; record what to expect
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  snapshot.expect = {
    queueIds: ((await getStore(page, 'queue')) ?? []).map((t) => t.id),
    queueIndex: await getStore(page, 'queueIndex'),
    currentId: (await currentTrack(page))?.id ?? null,
    repeat: await getStore(page, 'repeat'),
  };
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1));

  console.log('console errors during suite:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
  console.log(`\nphase RUN done: ${passCount} pass, ${failCount} fail`);
  console.log('NOW: restart the app, then run `node scripts/e2e-feature-suite.cjs verify-restore`');
  await browser.disconnect();
  process.exit(failCount ? 1 : 0);
}

async function phaseVerifyRestore() {
  const { browser, page } = await connect();
  const { backup, expect } = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));

  await sleep(1500); // let hydration finish
  const queueIds = ((await getStore(page, 'queue')) ?? []).map((t) => t.id);
  assert('restore: queue intact after relaunch', queueIds.join() === expect.queueIds.join(),
    `${queueIds.length} tracks`);
  assert('restore: queue position intact', (await getStore(page, 'queueIndex')) === expect.queueIndex);
  assert('restore: repeat mode intact', (await getStore(page, 'repeat')) === expect.repeat);
  const title = await page.evaluate(() => document.getElementById('track-title').textContent);
  assert('restore: current track cued in titlebar (no autoplay)', !!title && title !== 'No track', title);

  // ----- put the user's real data back -----
  for (const key of KEYS) {
    await page.evaluate((k, v) => window.api.setStore(k, v), key, backup[key] ?? null);
  }
  console.log('original store restored (restart the app once more to rehydrate UI)');
  console.log(`\nphase VERIFY-RESTORE done: ${passCount} pass, ${failCount} fail`);
  await browser.disconnect();
  process.exit(failCount ? 1 : 0);
}

const phase = process.argv[2];
(phase === 'verify-restore' ? phaseVerifyRestore() : phaseRun()).catch((err) => {
  console.error('SUITE FAIL:', err.message);
  process.exit(1);
});
