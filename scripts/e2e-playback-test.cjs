// Dev-only e2e: drives the real UI over CDP — paste URL → playback starts →
// metadata syncs → favorite toggles → queue persists. Requires `npm run dev`.
const puppeteer = require('puppeteer-core');
const path = require('node:path');

const TEST_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'; // Big Buck Bunny (embeddable)
const TEST_ID = 'aqz-KE-bpKQ';

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

  // Reset queue so the test is deterministic — reload so the renderer's
  // in-memory queue re-hydrates from the cleared store (otherwise the old
  // queue re-persists itself on the next mutation)
  await page.evaluate(async () => {
    await window.api.setStore('queue', []);
    await window.api.setStore('queueIndex', -1);
    await window.api.setStore('favorites', []);
  });
  await page.reload({ waitUntil: 'load' });
  await wait(4000); // player re-init

  // 1. Paste URL → Enter → track loads and plays
  await page.click('#search-input');
  await page.evaluate(() => { document.getElementById('search-input').value = ''; });
  await page.type('#search-input', TEST_URL);
  await page.keyboard.press('Enter');
  await wait(6000); // player load + metadata

  const title = await page.$eval('#track-title', (el) => el.textContent);
  check('URL paste loads track metadata', !!title && title !== 'No track' && title !== TEST_ID, `title="${title}"`);

  const timeTotal = await page.$eval('#time-total', (el) => el.textContent);
  check('duration rendered', timeTotal !== '0:00', `total=${timeTotal}`);

  // 2. Queue persisted with real metadata
  const queue = await page.evaluate(() => window.api.getStore('queue'));
  check('queue persisted', Array.isArray(queue) && queue.length === 1 && queue[0].id === TEST_ID,
    JSON.stringify(queue));

  // 3. Favorite toggle persists
  await page.click('#btn-favorite');
  await wait(300);
  const favorites = await page.evaluate(() => window.api.getStore('favorites'));
  check('favorite persisted', Array.isArray(favorites) && favorites.some((t) => t.id === TEST_ID),
    `count=${favorites.length}`);

  // 4. Play/pause toggle flips the icon
  const iconBefore = await page.$eval('#btn-play', (el) => el.textContent);
  await page.click('#btn-play');
  await wait(1500);
  const iconAfter = await page.$eval('#btn-play', (el) => el.textContent);
  check('play/pause toggles', iconBefore !== iconAfter, `${iconBefore} -> ${iconAfter}`);

  // 5. Panel opens with queue list rendered
  await page.click('#btn-panel');
  await wait(300);
  const queueRows = await page.$$eval('#list-queue li', (rows) => rows.length);
  check('queue panel renders', queueRows === 1, `rows=${queueRows}`);

  const shot = path.join(__dirname, '..', 'plans', 'reports', 'e2e-screenshot.png');
  await page.screenshot({ path: shot });
  console.log('screenshot:', shot);

  await browser.disconnect();
  console.log(failures === 0 ? 'E2E: ALL PASS' : `E2E: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
