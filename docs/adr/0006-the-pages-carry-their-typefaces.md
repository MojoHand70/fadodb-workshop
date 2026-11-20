# ADR-0006: The pages carry their typefaces

- Status: Accepted
- Date: 2026-11-20

## Context

Workshop looks like a sibling of fadodb.org (ADR-0001, item 6): its
colours, and its two typefaces, Inter for words and JetBrains Mono for
names and numbers written as a program reads them. The owner approved
that look on a drawing on 2026-11-18.

Until now the pages only named the two typefaces and shipped neither.
On a machine that has them a page looked as drawn. On a machine that
does not, which is most machines, Windows among them, the browser took
whatever it had. The owner opened the built pages on 2026-11-20 and
did not find the look he had approved.

Both typefaces are free to ship: the SIL Open Font License 1.1 lets a
copy be handed out with a program, with its licence beside it. The npm
packages `@fontsource-variable/inter` and
`@fontsource-variable/jetbrains-mono` hold each as files a browser
reads, one file for all weights. fadodb.org ships the same files.

A FadoDB server hands out font files of the kind `.woff2` and its
header lets a page load them from its own folder (the engine's
ADR-0073).

## Decision

1. **The pages carry Inter and JetBrains Mono.** The style sheet names
   the files; no page asks another site for a typeface.
2. **Two files a typeface**: the letters of western Europe, and the
   rest of the Latin alphabet (Polish, Czech, Turkish and others). A
   browser fetches the second only for a page that has such a letter.
   Together 189 KB, fetched once and kept by the browser.
3. **They come from npm at fixed versions**, as everything from
   outside does: `npm run vendor` copies them into
   `pages/vendor/fonts/`, each with its licence, and they are not kept
   in the repository.
4. **A script other than Latin** (Greek, Cyrillic, and so on) is shown
   in what the machine has, as before. Its files are added when a
   user needs them.

## The owner's ruling

"Agreed with your proposal, a sibling" (2026-11-18), of the look of
fadodb.org with its two typefaces. The other way on the table that
day was a look of Workshop's own.

Settled by me, his to veto: that the files are shipped with the pages
rather than left to the machine; items 2 to 4.

Accepted by him on 2026-11-20, after the pull request that built it
was merged: "Mark ADR's as accepted."

## Consequences

A page looks the same on every machine. The first visit fetches up to
189 KB more. `docs/dependencies.md` has two more rows, and a release
has two more licences to carry, which the vendor step writes.

## Not tested

How the pages read in a script other than Latin.
