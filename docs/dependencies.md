# Dependencies

A new dependency needs a row here, with its licence and the reason for
it. One that reaches the browser also needs a decision record.

## What reaches the browser

| Package | Version | Licence | Why |
|---|---|---|---|
| `fadodb-vm` | 4.0.0, fixed | Apache-2.0 | The engine's own formula machine for a page: one file of 35 KB with no dependency. A page works a document out with it as the server does ([ADR-0005](adr/0005-a-page-works-a-document-out.md)). `npm run vendor` copies it into `pages/vendor/`, which is not kept in the repository. Its major version is the format of the engine's compiled formulas. |

### CodeMirror 6, under the text boxes of the design mode

The owner's ruling and the measurements are in
[ADR-0003](adr/0003-the-text-boxes-stand-on-codemirror-6.md). Only the
design mode loads it, and only `pages/text.js` knows it.
`npm run vendor` builds what `tools/codemirror.entry.mjs` lists into
one file, `pages/vendor/codemirror.js` (some 390 KB, 127 KB compressed,
for the code view and the formula box), and writes the licence of every package that went into
it beside it, `pages/vendor/codemirror.LICENSE.txt`. Neither is kept in
the repository.

| Package | Version | Licence | Why |
|---|---|---|---|
| `@codemirror/autocomplete` | 6.20.4, fixed | MIT | Offers the names that may be written in a formula, as a person types: the variables of the class and the engine's functions. |
| `@codemirror/commands` | 6.11.1, fixed | MIT | Undo and redo, and the usual keys of a text box. |
| `@codemirror/lang-json` | 6.0.2, fixed | MIT | Reads a class as JSON. |
| `@codemirror/language` | 6.13.1, fixed | MIT | Colours inside the text, and the tree of a text, by which a finding of the server is put at its place. |
| `@codemirror/lint` | 6.9.8, fixed | MIT | Marks a place in the text with what the server says of it. |
| `@codemirror/search` | 6.7.2, fixed | MIT | Find and replace in the text. |
| `@codemirror/state` | 6.7.6, fixed | MIT | The text of a box and every change to it. |
| `@codemirror/view` | 6.43.15, fixed | MIT | The box itself: what is drawn, the cursor, the keyboard. |
| `@lezer/highlight` | 1.2.5, fixed | MIT | The names of the kinds of text that get a colour. |

These bring 8 more with them, all MIT, at the versions
`package-lock.json` fixes: `@codemirror/streamparser` 6.0.0, `@lezer/common` 1.5.5, `@lezer/json` 1.0.3, `@lezer/lr` 1.4.12, `@marijn/find-cluster-break` 1.0.4, `crelt` 1.0.7, `style-mod` 4.1.5, `w3c-keyname` 2.2.8.
Sixteen of the seventeen name one author, Marijn Haverbeke;
`@lezer/json` names Arun Srinivasan.

No font file is shipped yet. The pages name Inter and JetBrains Mono
and use them where the machine has them.

## Development tools

They check Workshop and never reach the browser.

| Package | Licence | Why |
|---|---|---|
| `typescript` | Apache-2.0 | Checks the types written in the comments of our plain JavaScript. It builds nothing. |
| `@types/node` | MIT | The types of Node, for the helper and the tests. |
| `playwright` | Apache-2.0 | Opens the pages in a real browser for the tests. |
| `esbuild` | MIT | Builds CodeMirror's packages into the one file a page loads. It builds nothing of our own, which runs as it is written. |

## The engine

Workshop is checked against one commit of FadoDB, named in
`package.json` under `config.engine`. The tests build the server from
it and start it. Moving to a newer commit is a pull request of its own.
