# CLAUDE.md

Guidance for AI-assisted development sessions in this repository.

## What Workshop is

The open face of [FadoDB](https://github.com/MojoHand70/fadodb): a web
application that talks to a FadoDB server, for people to use, and to
design, what runs on it. It is a separate application; the engine does
not depend on it. Read `docs/adr/` before changing anything.

## Commands

```
npm ci                                   # the development tools
npx playwright install chromium firefox webkit   # the browsers the pages are checked in
npm run vendor                           # the engine's file for the browser, into pages/vendor/
fadodb serve acme.db --pages pages       # Workshop, handed out by a FadoDB server
npm run serve                            # pages/ alone at http://127.0.0.1:8717/, no server behind
FADODB_BIN=/path/to/fadodb npm run check # the types, then the pages in the browser
SLOW=6 npm test                          # the same tests with the page six times slower (Chromium)
TEST_BROWSER=firefox npm test            # the same tests in Firefox; webkit is the engine of Safari
```

## Invariants

1. **Only the server's public commands.** Workshop does nothing that
   another face could not do (ADR-0001). What it lacks is asked of the
   engine as a command for everybody.
2. **Plain files.** `pages/` is what a FadoDB server hands out, with
   `fadodb serve --pages` (the engine's ADR-0073). Our own code runs as
   it is written, without a bundler. A built file is made at a release
   and never committed. A page is written for the one header the
   server sends: every script and style is a file of the folder, and a
   page calls the server alone.
3. **No new dependency** without a row in `docs/dependencies.md`; one
   that reaches the browser needs a decision record too.
4. **Decisions are records.** A record under `docs/adr/` goes in as
   Proposed and is Accepted on the owner's word.
5. **Honest status.** The README and the pages say what works today.
   Planned behaviour is marked as planned.
6. **Checked in a real browser, against a real server.** Every page
   has a test that opens it under the security header, with nothing
   refused, at a phone's width and by the keyboard. What a page shows
   of a database comes from a FadoDB server the test starts, built from
   the commit `package.json` names under `config.engine`; nothing is
   faked. What comes from a database is put on a page as text, never as
   markup, and a test tries it. A test waits for what the page itself
   says it has done, never for a moment in between; before a push the
   tests are run slowed too, `SLOW=6 npm test`, which shows a test that
   read too early. The same tests run in Chromium, Firefox and WebKit;
   a test that cannot run in one of them says why, and is not left out
   silently.
7. **A public repository.** Nothing private belongs here.

## Style

- Plain JavaScript modules with their types in comments; `tsc` checks
  them and builds nothing. No framework.
- Styles in style sheets. No `style` attribute and no inline script:
  the security header refuses both.
- Imperative commit subjects under 72 characters.
- Update `CHANGELOG.md` under *Unreleased* for what a user would see.
