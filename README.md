# FadoDB Workshop

The open face of [FadoDB](https://github.com/MojoHand70/fadodb): a web
application for people to use, and to design, what runs on a FadoDB
server.

**Status: the first pages work, in development only.** A person signs
in on the FadoDB server's own page, sees the classes on the server,
opens the list of a class, and opens a document. There they read it by
the sections of its class, change the values the class lets them
change, with what the class calculates following as they type, save,
and move the document along its flow. A new document cannot be made
here yet, and there is no design mode. Workshop cannot be installed
for people to use: that waits for the server to hand out Workshop's
folder. This page will say so until it can.

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
| `pages/` | The files a server hands out. Today: the first page, the list of a class, one document, Workshop's door to the server (`fado.js`), the live document (`live.js`), and how a value is shown to a person and read from their typing (`format.js`, `input.js`). |
| `pages/vendor/` | Made by `npm run vendor`, not kept here: the engine's file for the browser. |
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

Make a database with two people: Olga, who designs, and Ann, who
approves expenses. Olga gets a key, and Ann a link that lets her set
her password:

```
fadodb init acme.db
fadodb user add olga --kind person --name "Olga Nowak" --system designers --db acme.db
fadodb user add ann --kind person --name "Ann Kowalska" --group expense_approvers --db acme.db
fadodb key new olga --db acme.db
fadodb user password ann --db acme.db --url http://127.0.0.1:8717
```

Serve the database, and put Workshop in front of it:

```
fadodb serve acme.db
npm run serve -- --server http://127.0.0.1:8080
```

Give the database a class and a document, with Olga's key:

```
export FADODB_KEY=<the key the fourth command printed>
fadodb exec define_class --from definition=tests/fixtures/expense.json
fadodb exec create '{"class": "Expense", "values": {"what": "Train tickets to Gdańsk", "net": "4200.00 PLN"}}'
```

Open the link the fifth command printed and set a password. Then open
`http://127.0.0.1:8717/`, sign in as `ann`, choose Expense, and open the
document.

If something else on your machine already listens at 8080, the server
says so. Give it another address, `fadodb serve acme.db --listen
127.0.0.1:8791`, and name that address to the helper and, as
`FADODB_URL`, to `fadodb exec`.

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
