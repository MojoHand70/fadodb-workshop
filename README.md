# FadoDB Workshop

The open face of [FadoDB](https://github.com/MojoHand70/fadodb): a web
application for people to use, and to design, what runs on a FadoDB
server.

**Status: the use mode works for a class of plain values.** A FadoDB
server hands out Workshop's pages. A person signs in on the server's
own page and sees the apps of the server: each a tile with its name,
what it is for, and the lists a person opens in it, with the apps
again in a rail at the side, each in a colour of its own. A box in the
top bar of every page finds an app by a part of its name or of a
list's. The person stands at the end of that bar; a press there opens
their account and signing out, and how Workshop looks to them: one of
six schemes of colours, Fado Standard among them, in a light or a dark
shade or the shade of their machine. The choice is kept in their
browser; a default an administrator sets is planned. A database administrator has Settings
in the rail under the apps: the server's address and version, who
administers it, its users and their groups. There an administrator
makes a user and changes one (their name, e-mail, groups and system
groups, and whether they may sign in), makes the link by which a
person sets their password, and makes a group and changes who is in
it. From an app a person opens a list, makes a
new document, and opens one. Every page says where the person is: Home,
the app, the list. That a list has a class behind it is a designer's
to know: the pages say the word to a designer alone. A server with no
app yet asks a designer to create the first one. A designer makes an
app with a name and a sentence on what it is for, and makes a class
from the page of its app, so that the class belongs to it. The lists
that belong to no app stand together under "Unassigned", last in the
rail. A person reads a document by the sections of its class, changes
the values the class lets them change, with what the class calculates
following as they type, saves, and moves the document along its flow. The buttons that move it follow the
typing too, and a move takes what was typed with it, in one step.

**The design mode has begun: a designer reads a class as lists and
changes it as text.** The lists show its variables by section, each
with its kind in a line; its states; and, for the state the designer
chooses, the ways out of it, who may take each, and who may set what
there. Every formula is shown whole. The same class is there as text,
as an agent writes it. A designer changes the text, asks the server to
check it, and saves it as the next version. What the server finds is
listed, each finding leading to its place in the text, and the lists
follow the text as it stands. What the server only notes, such as a
variable that says nothing of what it is for, is told apart from what
refuses a class. A designer makes a new class too: it gets a name,
begins as a small class that works, and is the server's once the
designer makes it.

**A class is changed through the lists as well.** A designer chooses
a variable, a state or a way out of a state, and the card at the side
shows it as fields. For a variable: its label, what it is for, whether
people give it or the class works it out, its type, its first value,
its range, its section. For a state: its label, what a document waits
for there, whether a new document starts in it and whether it is
final. For a transition: its label, where it leads, who may take it,
on what condition, and whether the engine takes it by itself after a
time. "The whole class" holds the class's own words and the four lines
that say who may see, make, change and delete a document. Variables,
states and ways out are added and removed there too. A change goes
into the text at once, and Undo takes it back.

**Who may set and who may see single variables** is said state by
state, in the card of a state, and for every state under "The whole
class". Each line is about a variable, a section or every variable,
and each half of it is a formula. "Add a line" offers what the class
has; a new line lets nobody set what it is about, until the designer
says who may. The card of a variable then says, state by state, who
may set it and who may see it, and which line says so: the question a
designer asks most, answered as the server answers it.

**The sections of a class**, which variables belong together, are
changed there as well. A section is chosen by its title: its label,
what it is for, and where it lies, at the top or inside another
section. "Add a section" asks its name and the variable it begins
with, for the server takes no section with nothing in it. A section
removed leaves its variables in the class, in no section. The order a
document shows its values in is changed a step at a time: a variable
earlier or later within its section, a section among those beside it.

**What a class does by itself**, its rules, stands under "By itself"
in the card of the state it belongs to, and under "The whole class"
for a rule about no state. A rule is chosen there, and its card says
when it runs, the event that sets it off; only when, a condition; and
what it does, one action after another, in an order that "Earlier"
and "Later" change. "Add a rule" asks the event and the value the
rule sets, for a rule does at least one thing.

**A class is tried before it is saved**, under "Try", beside the lists
and the text. The view shows a document of the class as the text
stands, a new one or one the server holds: the designer gives it
values, as on the page of a document, and the server answers what the
class works out, the state the document is in, the ways out then
open, what the class does by itself, and what it would refuse, with
the line that decides. On a document the server holds he takes a way
out too, and sees where the document goes. The server writes nothing.

**A formula is written in the formula editor**, wherever the lists
have one: what the class works out, a first value, the title of a
document, who may, the condition of a transition. Its pieces are
coloured. As the designer types, the names that may be written are
offered: the variables of the class, and the functions of the engine,
which the server hands out itself. Under the box stands the function
the cursor is in, with its arguments and the one being written. A
moment after the typing stops the server is asked about the formula,
and what it finds is marked at its place.

What is not there yet: a value that is a list, rows or an object is
shown and cannot be set; in the design mode, of what a class does by
itself, only setting a value and putting one back have fields, and
every other action of a rule, such as calling another system, is
changed in the text; a class is tried as the designer himself, not
yet as another person, and with one transition a try; and Workshop
has no packaged release, so it is run from this
repository, with a FadoDB server built from the engine's source, newer
than its release 0.6.0. This page will say so until that changes.

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
| `pages/` | The files a server hands out. Today: the first page, the list of a class, one document, the design of a class, Workshop's door to the server (`fado.js`), the live document (`live.js`), how a value is shown to a person and read from their typing (`format.js`, `input.js`), how a thing is found by a part of its name (`find.js`), the apps of a server with their lists, and the rail at the side (`apps.js`), the page of an app, where a designer makes one too (`app.html`, `app.js`), the field a value is typed in (`fields.js`), how a class is read and changed for the designer's lists (`class.js`), how a formula is read for its editor (`formula.js`), the two text boxes of the design mode (`text.js`), and a class tried on a new document (`try.js`). |
| `pages/vendor/` | Made by `npm run vendor`, not kept here: the engine's file for the browser, the two typefaces of the pages with their licences, and CodeMirror, which stands under the text box, built into one file with its licences beside it. |
| `tools/vendor.mjs`, `tools/codemirror.entry.mjs` | What makes `pages/vendor/`, and the list of what Workshop takes from CodeMirror. |
| `tools/serve.mjs` | A helper that hands out `pages/` with no FadoDB server behind them, to look at a page as it is drawn. |
| `tests/` | The checks: each page is opened in a real browser, in front of a real FadoDB server, in Chromium, Firefox and WebKit. |
| `docs/adr/` | The decision records. |

## See it work

You need Go, Node 22 or newer, and a FadoDB server newer than the
release 0.6.0, which does not hand out pages yet. `package.json` names
the commit of the engine this Workshop is checked against, under
`config.engine`:

```
go install github.com/MojoHand70/fadodb/cmd/fadodb@ff1781837638e9704fa582d803c132c0f70e693c
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

One check is left out in WebKit, and says so when the tests run: that
closing a window with work not saved asks first. Asked to close a
window, WebKit waits 50 ms for the page's answer and closes it when
none came, whatever the page would have answered. Typing keeps a page
of Workshop busy for a few milliseconds; pasting a whole class at once
can take longer than the 50, and so can a slow machine. Leaving by a
link has no such clock, and is checked in all three.

## Licence

Apache 2.0, as FadoDB itself. See [LICENSE](LICENSE).

The mark of FadoDB, `pages/mark.png`, is not licensed with the code.
It is its owner's, who keeps every right in it. A copy of Workshop
shows it to say that it is Workshop; it is not for another product.
