// Minimal loopback static server. The app page must live on a real http://
// origin — YouTube rejects embeds hosted on file:// (player errors 152/153).
// Binds 127.0.0.1 with an ephemeral port; serves only the app shell files.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Strict allowlist — never expose package.json, node_modules, store data, etc.
const ALLOWED_PATH_RE = /^\/(index\.html|renderer\/[\w.-]+\.(?:js|css))$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

let server = null;

export function startLocalServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
        const requested = urlPath === '/' ? '/index.html' : urlPath;
        if (req.method !== 'GET' || !ALLOWED_PATH_RE.test(requested)) {
          res.writeHead(404);
          res.end();
          return;
        }
        const filePath = path.join(ROOT, requested);
        const info = await stat(filePath);
        if (!info.isFile()) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] });
        createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${server.address().port}/index.html`);
    });
  });
}
