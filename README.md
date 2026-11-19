# FadoDB Workshop

The open face of [FadoDB](https://github.com/MojoHand70/fadodb): a web
application for people to use, and to design, what runs on a FadoDB
server.

**Status: nothing works yet.** This repository was opened on
2026-11-18. It holds a first page, the decisions made so far and the
checks. There is nothing to use, and this page will say so until there
is.

## What is planned

- Workshop is a face: a separate application that talks to a FadoDB
  server. It uses only the server's public commands, as any other face
  does.
- A use mode, for the people who work: apps, lists and documents.
- A design mode, for a designer: classes, flows and faces, by hand or
  beside an agent.
- Its pages are plain files that a FadoDB server, or any web server,
  hands out.

The decisions and the reasons for them are in
[docs/adr](docs/adr/README.md).

## What is here

| | |
|---|---|
| `pages/` | The files a server hands out. Today: one page that says nothing works yet. |
| `tools/serve.mjs` | A helper that hands out `pages/` on your own machine, with the security header the pages are held to. |
| `tests/` | The checks: each page is opened in a real browser. |
| `docs/adr/` | The decision records. |

## Run the checks

You need Node 22 or newer.

```
npm ci
npx playwright install chromium
npm run check
```

`npm run serve` hands out the first page at `http://127.0.0.1:8717/`.

## Licence

Apache 2.0, as FadoDB itself. See [LICENSE](LICENSE).
