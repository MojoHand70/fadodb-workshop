# Dependencies

A new dependency needs a row here, with its licence and the reason for
it. One that reaches the browser also needs a decision record.

## What reaches the browser

Nothing yet. Workshop's pages are its own files.

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
