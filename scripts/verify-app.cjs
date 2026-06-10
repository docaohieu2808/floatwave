// Dev-only smoke check: connects to the running app (npm run dev, CDP :9222),
// collects console errors, verifies the IPC bridge, exercises search, screenshots.
const puppeteer = require('puppeteer-core');
const path = require('node:path');

(async () => {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null,
  });
  const pages = await browser.pages();
  const page = pages.find((p) => /^(file|http):\/\/(127\.0\.0\.1)?/.test(p.url()) && p.url().includes('index.html'));
  if (!page) {
    console.error('FAIL: app page not found');
    process.exit(1);
  }

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // 1. IPC bridge round-trip
  const ping = await page.evaluate(() => window.api.ping());
  console.log('IPC ping:', ping);

  // 2. Store round-trip
  const volume = await page.evaluate(() => window.api.getStore('volume'));
  console.log('store volume:', volume);

  // 3. Search via youtube-sr (real network call)
  const search = await page.evaluate(() => window.api.search('hanh nguyen cho nguoi'));
  console.log('search ok:', search.ok, '| results:', search.results?.length ?? 0);
  if (search.ok && search.results.length) {
    const first = search.results[0];
    console.log('first result:', JSON.stringify({ id: first.id, title: first.title, channel: first.channel, duration: first.duration }));
  }

  // 4. Player iframe exists
  const hasPlayerIframe = await page.evaluate(
    () => !!document.querySelector('#player-wrap iframe')
  );
  console.log('player iframe mounted:', hasPlayerIframe);

  // 5. Screenshot
  const shot = path.join(__dirname, '..', 'plans', 'reports', 'app-screenshot.png');
  await page.screenshot({ path: shot });
  console.log('screenshot:', shot);

  await new Promise((r) => setTimeout(r, 500));
  console.log('console errors:', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
  await browser.disconnect();
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
