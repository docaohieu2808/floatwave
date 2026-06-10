// Diagnostic: user-playlist flow — create via chooser, add tracks from search,
// view tab, play-all, remove track, delete playlist. Requires `npm run dev`.
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
  const getPlaylists = () => page.evaluate(() => window.api.getStore('playlists'));
  const search = async (q) => {
    await page.evaluate((query) => {
      const input = document.getElementById('search-input');
      input.value = query;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }, q);
    await wait(5000);
  };
  const clickRowPlus = (i) =>
    page.evaluate((index) => {
      document.querySelectorAll('#list-results li')[index]?.querySelector('.row-action')?.click();
    }, i);

  const snapshot = await page.evaluate(async () => ({
    playlists: await window.api.getStore('playlists'),
    queue: await window.api.getStore('queue'),
    qi: await window.api.getStore('queueIndex'),
  }));
  await page.evaluate(() => window.api.setStore('playlists', []));
  await page.reload({ waitUntil: 'load' });
  await wait(4000);

  // (1) create playlist via chooser from a search result
  await search('see tinh hoang thuy linh');
  await clickRowPlus(0);
  await wait(400);
  const chooserVisible = await page.evaluate(
    () => !document.getElementById('playlist-chooser').classList.contains('hidden')
  );
  check('chooser opens from + button', chooserVisible);
  await page.evaluate(() => {
    document.getElementById('chooser-new-name').value = 'Nhạc của tôi';
    document.getElementById('chooser-create').click();
  });
  await wait(500);
  let pls = await getPlaylists();
  check('playlist created with first track',
    pls.length === 1 && pls[0].name === 'Nhạc của tôi' && pls[0].tracks.length === 1,
    JSON.stringify(pls.map((p) => ({ name: p.name, n: p.tracks.length }))));

  // (2) add a second song from another search into the existing playlist
  await search('bac bling');
  await clickRowPlus(0);
  await wait(400);
  await page.evaluate(() => {
    const options = [...document.querySelectorAll('#chooser-options li')];
    options.find((li) => li.textContent.includes('Nhạc của tôi'))?.click();
  });
  await wait(500);
  pls = await getPlaylists();
  check('second track added to playlist', pls[0]?.tracks.length === 2,
    `tracks=${pls[0]?.tracks.length}`);

  // (3) playlists tab: open detail, play-all → queue becomes the playlist
  await page.evaluate(() => {
    document.querySelector('#panel-tabs [data-tab="playlists"]').click();
  });
  await wait(300);
  const listRows = await page.$$eval('#list-playlists li', (lis) => lis.map((l) => l.textContent));
  check('playlists tab lists the playlist', listRows.some((t) => t.includes('Nhạc của tôi')),
    JSON.stringify(listRows));
  await page.evaluate(() => {
    [...document.querySelectorAll('#list-playlists li')]
      .find((li) => li.textContent.includes('Nhạc của tôi'))?.click();
  });
  await wait(300);
  await page.evaluate(() => {
    document.querySelector('#list-playlists .list-header .row-action')?.click(); // ▶ play all
  });
  await wait(6000);
  const queueState = await page.evaluate(async () => ({
    len: ((await window.api.getStore('queue')) ?? []).length,
    qi: await window.api.getStore('queueIndex'),
    title: document.getElementById('track-title').textContent,
    cur: document.getElementById('time-current').textContent,
  }));
  check('play-all replaces queue with playlist', queueState.len === 2 && queueState.qi === 0,
    JSON.stringify(queueState));

  // (4) remove a track, then delete the playlist
  await page.evaluate(() => {
    document.querySelector('#panel-tabs [data-tab="playlists"]').click();
  });
  await wait(300);
  await page.evaluate(() => {
    // still in detail view — remove first track row (skip the header li)
    const rows = [...document.querySelectorAll('#list-playlists li:not(.list-header)')];
    rows[0]?.querySelector('.row-action')?.click();
  });
  await wait(400);
  pls = await getPlaylists();
  check('track removed from playlist', pls[0]?.tracks.length === 1, `tracks=${pls[0]?.tracks.length}`);
  await page.evaluate(() => {
    document.querySelector('#list-playlists .list-header')?.click(); // ← back
  });
  await wait(300);
  await page.evaluate(() => {
    [...document.querySelectorAll('#list-playlists li')]
      .find((li) => li.textContent.includes('Nhạc của tôi'))
      ?.querySelector('.row-action')?.click(); // ✕ delete
  });
  await wait(400);
  pls = await getPlaylists();
  check('playlist deleted', pls.length === 0, `count=${pls.length}`);

  // restore user state
  await page.evaluate(async (snap) => {
    await window.api.setStore('playlists', snap.playlists ?? []);
    await window.api.setStore('queue', snap.queue ?? []);
    await window.api.setStore('queueIndex', snap.qi ?? -1);
  }, snapshot);
  console.log('user store restored');
  await browser.disconnect();
  console.log(failures === 0 ? 'PLAYLIST DIAG: ALL PASS' : `PLAYLIST DIAG: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
