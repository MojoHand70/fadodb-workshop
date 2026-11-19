# FadoDB Workshop

The open face of [FadoDB](https://github.com/MojoHand70/fadodb): a web
application for people to use, and to design, what runs on a FadoDB
server.

**Status: a first page works, in development only.** A person signs in
on the FadoDB server's own page and sees their name and the classes on
the server. There are no lists, no documents and no design mode yet,
and Workshop cannot be installed for people to use: that waits for the
server to hand out Workshop's folder. This page will say so until it
can.

## What is planned

- Workshop is a face: a separate application that talks to a FadoDB
  server. It uses only the server's public commands, as any other face
  does.
- A use mode, for the people who work: apps, lists and documents.
- A design mode, for a designer: classes, flows and faces, by hand or
  beside an agent.
- Its pages are plain files that a FadoDB server hands out at its own
  address.

The decisions and the reasons for them are in
[docs/adr](docs/adr/README.md).

## What is here

| | |
|---|---|
| `pages/` | The files a server hands out. Today: the first page and Workshop's door to the server, `fado.js`. |
| `tools/serve.mjs` | A helper for development: it hands out `pages/` on your own machine and stands in front of a FadoDB server, so that both answer at one address. |
| `tests/` | The checks: each page is opened in a real browser, in front of a real FadoDB server. |
| `docs/adr/` | The decision records. |

## See it work

You need Node 22 or newer, Go, and a FadoDB server newer than the
release 0.6.0, which has no page to sign in on. `package.json` names
the commit of the engine this Workshop is checked against, under
`config.engine`:

```
go install github.com/MojoHand70/fadodb/cmd/fadodb@924871edfb22471153d0929103187b3cbd445f32
```

Make a database with one person, and a link that lets her set her
password:

```
fadodb init acme.db
fadodb user add ann --kind person --name "Ann Kowalska" --db acme.db
fadodb user password ann --db acme.db --url http://127.0.0.1:8717
```

Serve the database, and put Workshop in front of it:

```
fadodb serve acme.db
npm run serve -- --server http://127.0.0.1:8080
```

Open the link the third command printed and set a password. Then open
`http://127.0.0.1:8717/` and sign in as `ann`.

If something else on your machine already listens at 8080, the server
says so. Give it another address, `fadodb serve acme.db --listen
127.0.0.1:8791`, and name that address to the helper.

## Run the checks

```
npm ci
npx playwright install chromium
FADODB_BIN="$(go env GOPATH)/bin/fadodb" npm run check
```

The tests start the program `FADODB_BIN` names, with a database of
their own that they throw away.

## Licence

Apache 2.0, as FadoDB itself. See [LICENSE](LICENSE).
