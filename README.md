# FadoDB Workshop

The open face of [FadoDB](https://github.com/MojoHand70/fadodb): a web
application for people to use, and to design, what runs on a FadoDB
server.

**Status: the use mode works for a class of plain values.** A FadoDB
server hands out Workshop's pages. A person signs in on the server's
own page, sees the classes on the server, opens the list of a class,
makes a new document, and opens one. There they read it by the
sections of its class, change the values the class lets them change,
with what the class calculates following as they type, save, and move
the document along its flow. The buttons that move it follow the
typing too, and a move takes what was typed with it, in one step.

**The design mode has begun: it shows a class and does not change one
yet.** A designer opens a class as lists: its variables by section,
each with its kind in a line; its states; and, for the state they
choose, the ways out of it, who may take each, and who may set what
there. Every formula is shown whole. The same class is there as text,
word for word as the server keeps it.

What is not there yet: a value that is a list, rows or an object is
shown and cannot be set; a class cannot be changed in the design mode,
by text or through the lists, and there is no formula editor; and
Workshop has no packaged release, so it is run from this repository,
with a FadoDB server built from the engine's source, newer than its
release 0.6.0. This page will say so until that changes.

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
| `pages/` | The files a server hands out. Today: the first page, the list of a class, one document, the design of a class, Workshop's door to the server (`fado.js`), the live document (`live.js`), how a value is shown to a person and read from their typing (`format.js`, `input.js`), and how a class is read for the designer's lists (`class.js`). |
| `pages/vendor/` | Made by `npm run vendor`, not kept here: the engine's file for the browser. |
| `tools/serve.mjs` | A helper that hands out `pages/` with no FadoDB server behind them, to look at a page as it is drawn. |
| `tests/` | The checks: each page is opened in a real browser, in front of a real FadoDB server, in Chromium, Firefox and WebKit. |
| `docs/adr/` | The decision records. |

## See it work

You need Go, Node 22 or newer, and a FadoDB server newer than the
release 0.6.0, which does not hand out pages yet. `package.json` names
the commit of the engine this Workshop is checked against, under
`config.engine`:

```
go install github.com/MojoHand70/fadodb/cmd/fadodb@9a02ce8e5bd461925631cbffa94b703ad1bcf7ca
```

Get Workshop's pages ready. The second command puts the engine's file
for the browser into `pages/vendor/`:

```
npm ci
npm run vendor
```

Make a database with two people: Olga, who designs, and Ann, who
approves expenses. Olga gets a key, and Ann a link that lets her set
her password:

```
fadodb init acme.db
fadodb user add olga --kind person --name "Olga Nowak" --system designers --db acme.db
fadodb user add ann --kind person --name "Ann Kowalska" --group expense_approvers --db acme.db
fadodb key new olga --db acme.db
fadodb user password ann --db acme.db --url http://127.0.0.1:8080
```

Start the server with Workshop's pages:

```
fadodb serve acme.db --pages pages
```

In another terminal, give the database a class and a document, with
Olga's key:

```
export FADODB_KEY=<the key the fourth command printed>
fadodb exec define_class --from definition=tests/fixtures/expense.json
fadodb exec create '{"class": "Expense", "values": {"what": "Train tickets to Gdańsk", "net": "4200.00 PLN"}}'
```

Open the link the fifth command printed and set a password. Then open
`http://127.0.0.1:8080/`, sign in as `ann`, choose Expense, and open
the document.

If something else on your machine already listens at 8080, the server
says so. Give it another address, `fadodb serve acme.db --pages pages
--listen 127.0.0.1:8791`, and name that address in `--url` above and,
as `FADODB_URL`, to `fadodb exec`.

The folder is yours to answer for: a script in it acts as whoever is
signed in. The engine's chapter on
[serving a database](https://github.com/MojoHand70/fadodb/blob/main/docs/manual/serving-a-database.md#the-pages-of-a-face)
says what a server hands out from it and under which header.

## Run the checks

```
npm ci
npx playwright install chromium firefox webkit
FADODB_BIN="$(go env GOPATH)/bin/fadodb" npm run check
TEST_BROWSER=firefox npm test
TEST_BROWSER=webkit npm test
```

The tests start the program `FADODB_BIN` names, with a database of
their own that they throw away.

The pages are checked in three browsers: Chromium, which Chrome and
Edge are built on, Firefox, and WebKit, which Safari is built on.
`npm run check` opens them in Chromium; `TEST_BROWSER` names another.
Every pull request runs all three. WebKit here is the build the test
tool brings, on Linux: the pages have not been opened in Safari
itself, on a Mac or a phone.

## Licence

Apache 2.0, as FadoDB itself. See [LICENSE](LICENSE).
