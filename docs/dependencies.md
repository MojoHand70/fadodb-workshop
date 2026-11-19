# Dependencies

A new dependency needs a row here, with its licence and the reason for
it. One that reaches the browser also needs a decision record.

## What reaches the browser

| Package | Version | Licence | Why |
|---|---|---|---|
| `fadodb-vm` | 4.0.0, fixed | Apache-2.0 | The engine's own formula machine for a page: one file of 35 KB with no dependency. A page works a document out with it as the server does ([ADR-0005](adr/0005-a-page-works-a-document-out.md)). `npm run vendor` copies it into `pages/vendor/`, which is not kept in the repository. Its major version is the format of the engine's compiled formulas. |

Planned: CodeMirror 6, for the two text boxes of the design mode
([ADR-0003](adr/0003-the-text-boxes-stand-on-codemirror-6.md)). Its
packages and their versions are listed here in the pull request that
adds it.

No font file is shipped yet. The pages name Inter and JetBrains Mono
and use them where the machine has them.

## Development tools

They check Workshop and never reach the browser.

| Package | Licence | Why |
|---|---|---|
| `typescript` | Apache-2.0 | Checks the types written in the comments of our plain JavaScript. It builds nothing. |
| `@types/node` | MIT | The types of Node, for the helper and the tests. |
| `playwright` | Apache-2.0 | Opens the pages in a real browser for the tests. |

## The engine

Workshop is checked against one commit of FadoDB, named in
`package.json` under `config.engine`. The tests build the server from
it and start it. Moving to a newer commit is a pull request of its own.
