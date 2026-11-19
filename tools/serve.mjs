// Hands out the folder pages/ on this machine, for development and for
// the checks, with the security header Workshop's pages are held to.
// It is a helper. It is not a server to put in front of people.
//
//   node tools/serve.mjs            pages/ at http://127.0.0.1:8717/
//   node tools/serve.mjs --port 9000

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The headers every answer carries. A page may load script, style,
 * pictures and fonts from its own address only, may call its own address
 * only, and may not be shown inside another page.
 */
export const HEADERS = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-cache',
};

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Starts the helper.
 *
 * @param {{ dir: string, port?: number, host?: string }} options
 *   dir is the folder to hand out; port 0 asks the system for a free one.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serve({ dir, port = 0, host = '127.0.0.1' }) {
  const root = resolve(dir);

  const server = createServer(async (req, res) => {
    /** @param {number} status @param {string} text */
    const plain = (status, text) => {
      res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : text + '\n');
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, 'Only GET and HEAD.');

    let path;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://helper').pathname);
    } catch {
      return plain(400, 'The address cannot be read.');
    }
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + sep)) return plain(404, 'Nothing here.');

    try {
      const info = await stat(file);
      if (!info.isFile()) return plain(404, 'Nothing here.');
      res.writeHead(200, {
        ...HEADERS,
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Content-Length': info.size,
      });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
    } catch {
      plain(404, 'Nothing here.');
    }
  });

  await new Promise((done, failed) => {
    server.once('error', failed);
    server.listen(port, host, () => done(undefined));
  });
  const at = server.address();
  const listening = at && typeof at === 'object' ? at.port : port;
  return {
    url: `http://${host}:${listening}/`,
    close: () => new Promise((done) => server.close(() => done())),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf('--port');
  const port = flag > 0 ? Number(process.argv[flag + 1]) : 8717;
  const pages = fileURLToPath(new URL('../pages/', import.meta.url));
  const site = await serve({ dir: pages, port });
  console.log(`Workshop's pages are at ${site.url}`);
}
