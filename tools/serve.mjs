// Hands out the folder pages/ on this machine with no FadoDB server
// behind it: to look at a page as it is drawn, and for the check of what
// a page says when no server answers.
//
// To use Workshop, a FadoDB server hands out the folder itself:
//
//   fadodb serve acme.db --pages pages
//
// This helper sends the header such a server sends with every page, so
// that a page that loads here loads there.
//
//   node tools/serve.mjs            pages/ at http://127.0.0.1:8717/
//   node tools/serve.mjs --port 9000

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The header a FadoDB server sends with every page of a face (the
 * engine's ADR-0073, item 7). A page loads script, style, pictures and
 * fonts from the server alone, calls the server alone, and is shown
 * inside no other page. A test holds this text to what a real server
 * sends.
 */
export const POLICY = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

/** The headers every answer carries. */
export const HEADERS = {
  'Content-Security-Policy': POLICY,
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

  const listener = createServer(async (req, res) => {
    /** @param {number} status @param {string} text */
    const plain = (status, text) => {
      res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : text + '\n');
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, 'Only GET and HEAD.');

    /** @type {string} */
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
      const type = TYPES[extname(file)];
      if (!info.isFile() || !type) return plain(404, 'Nothing here.');
      res.writeHead(200, { ...HEADERS, 'Content-Type': type, 'Content-Length': info.size });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
    } catch {
      plain(404, 'Nothing here.');
    }
  });

  await new Promise((done, failed) => {
    listener.once('error', failed);
    listener.listen(port, host, () => done(undefined));
  });
  const at = listener.address();
  const listening = at && typeof at === 'object' ? at.port : port;
  return {
    url: `http://${host}:${listening}/`,
    close: () =>
      new Promise((done) => {
        listener.close(() => done());
        listener.closeAllConnections();
      }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--port');
  const port = at > 0 ? Number(process.argv[at + 1]) : 8717;
  const pages = fileURLToPath(new URL('../pages/', import.meta.url));
  try {
    const site = await serve({ dir: pages, port });
    console.log(`Workshop's pages are at ${site.url}, with no FadoDB server behind them.`);
    console.log('To use Workshop:  fadodb serve acme.db --pages pages');
  } catch (error) {
    const busy = error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
    console.error(busy ? `Something already listens at port ${port}. Give another with --port.` : String(error));
    process.exit(1);
  }
}
