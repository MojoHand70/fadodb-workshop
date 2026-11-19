// Hands out the folder pages/ on this machine, for development and for
// the checks, with the security header Workshop's pages are held to.
// Told where a FadoDB server is, it stands in front of it: the commands
// and the server's own pages pass through, so that Workshop's pages and
// the server answer at one address, as they will when a server hands
// out the folder itself.
// It is a helper. It is not a server to put in front of people.
//
//   node tools/serve.mjs                                  pages/ alone
//   node tools/serve.mjs --server http://127.0.0.1:8080   in front of a server
//   node tools/serve.mjs --port 9000

import { createServer, request } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The headers every answer of the helper's own carries. A page may load
 * script, style, pictures and fonts from its own address only, may call
 * its own address only, and may not be shown inside another page.
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

/**
 * What belongs to the FadoDB server: its commands, its own pages for
 * signing in, and what it publishes about itself.
 */
export const PASSED = ['/v1/', '/auth/', '/.well-known/'];

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
 * @param {{ dir: string, port?: number, host?: string, server?: string }} options
 *   dir is the folder to hand out; port 0 asks the system for a free one;
 *   server is the address of a FadoDB server on this machine to stand in
 *   front of.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serve({ dir, port = 0, host = '127.0.0.1', server }) {
  const root = resolve(dir);

  const listener = createServer(async (req, res) => {
    /** @param {number} status @param {string} text */
    const plain = (status, text) => {
      res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : text + '\n');
    };

    /** @type {string} */
    let path;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://helper').pathname);
    } catch {
      return plain(400, 'The address cannot be read.');
    }

    if (PASSED.some((prefix) => path.startsWith(prefix))) {
      if (!server) return plain(502, 'This helper was not told where a FadoDB server is.');
      // The request goes on as it came, with the address the browser
      // used: the server takes that address for its own, so a session's
      // command from Workshop's page is a command from the server's own
      // page. The answer comes back as the server gave it, its headers
      // too.
      const headers = { ...req.headers };
      delete headers.connection;
      const onward = request(new URL(req.url ?? '/', server), { method: req.method, headers }, (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      });
      onward.on('error', () => {
        if (!res.headersSent) plain(502, 'The FadoDB server does not answer.');
        else res.destroy();
      });
      res.on('close', () => onward.destroy());
      req.pipe(onward);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, 'Only GET and HEAD.');
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
  /** @param {string} name */
  const flag = (name) => {
    const at = process.argv.indexOf(name);
    return at > 0 ? process.argv[at + 1] : undefined;
  };
  const pages = fileURLToPath(new URL('../pages/', import.meta.url));
  const server = flag('--server');
  const port = Number(flag('--port') ?? 8717);
  try {
    const site = await serve({ dir: pages, port, server });
    console.log(`Workshop's pages are at ${site.url}`);
    console.log(server ? `in front of the FadoDB server at ${server}` : 'with no FadoDB server behind them');
  } catch (error) {
    const busy = error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
    console.error(busy ? `Something already listens at port ${port}. Give another with --port.` : String(error));
    process.exit(1);
  }
}
