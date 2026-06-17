// One-off build asset: renders scripts/render-hero.html to assets/hero.png
// using a hidden Electron window + CDP Page.captureScreenshot (the same path
// Puppeteer uses). capturePage() is bound to the physical screen size, so we
// drive Chromium's DevTools Protocol directly to render the full 1500x860
// design at 2x DPI (-> 3000x1720), regardless of monitor resolution.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const W = 1500;
const H = 860;
const DSF = 2; // crisp 2x -> 3000x1720

app.disableHardwareAcceleration(); // deterministic software raster for blur/gradients

// watchdog: never let a stuck capture leave a hung electron.exe behind
const watchdog = setTimeout(() => {
  console.error('TIMEOUT: capture took too long, exiting');
  process.exit(2);
}, 30000);

app.whenReady().then(async () => {
  try {
    // Must be shown: Page.captureScreenshot hangs on a hidden window (no
    // composited frames under software rendering). A brief flash is fine here.
    const win = new BrowserWindow({
      width: 820,
      height: 560,
      show: true,
      webPreferences: { backgroundThrottling: false },
    });
    await win.loadFile(path.join(__dirname, 'render-hero.html'));
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    await new Promise((r) => setTimeout(r, 600));

    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Page.enable');
    // Make the viewport itself exactly W x H at 2x DPI, then capture the whole
    // viewport. This avoids captureBeyondViewport + clip, which hangs under
    // software rendering. Output = (W*DSF) x (H*DSF).
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: W,
      height: H,
      deviceScaleFactor: DSF,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 500)); // let metrics settle + repaint

    const { data } = await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });

    const out = path.join(__dirname, '..', 'assets', 'hero.png');
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`wrote ${out} (${W * DSF}x${H * DSF})`);

    dbg.detach();
    win.destroy();
  } catch (err) {
    console.error('ERROR:', err && err.message ? err.message : err);
  } finally {
    clearTimeout(watchdog);
    process.exit(0); // hard exit — app.quit() can hang with an attached debugger
  }
});
