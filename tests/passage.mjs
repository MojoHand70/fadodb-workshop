// A passage for a browser to a server that people reach by a name, over
// plain http, as a server on an office network is reached.
//
// The server of a test listens on this machine. The browser is told to
// send everything through this passage, so it believes it talks to
// http://workshop.test:PORT, an address it does not hold for secure,
// and the passage hands each request to the server as it came. The
// same works in every browser, which a rule for names would not.

import { createServer, request } from 'node:http';

/** The name the server is reached by in such a test. */
export const NAME = 'workshop.test';

/**
 * Opens the passage to a server.
 *
 * @param {{ url: string }} server where the server listens on this machine
 * @returns {Promise<{ proxy: { server: string }, close: () => Promise<void> }>}
 *   proxy is what a browser's context is given
 */
export async function passage(server) {
  const to = new URL(server.url);
  const listener = createServer((asked, answer) => {
    // A browser asks a passage with the whole address.
    const address = new URL(asked.url ?? '/', 'http://nowhere');
    if (address.hostname !== NAME) {
      answer.writeHead(502).end();
      return;
    }
    const passed = request(
      { host: to.hostname, port: to.port, method: asked.method, path: address.pathname + address.search, headers: asked.headers },
      (got) => {
        answer.writeHead(got.statusCode ?? 502, got.headers);
        got.pipe(answer);
      },
    );
    passed.on('error', () => answer.writeHead(502).end());
    asked.pipe(passed);
  });
  await new Promise((done, failed) => {
    listener.once('error', failed);
    listener.listen(0, '127.0.0.1', () => done(undefined));
  });
  const at = listener.address();
  const port = at && typeof at === 'object' ? at.port : 0;
  return {
    proxy: { server: `http://127.0.0.1:${port}` },
    close: () =>
      new Promise((done) => {
        listener.close(() => done());
        listener.closeAllConnections();
      }),
  };
}
