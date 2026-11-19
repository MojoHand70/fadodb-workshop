# ADR-0003: The text boxes stand on CodeMirror 6

- Status: Proposed
- Date: 2026-11-19

## Context

The design mode has two boxes for text.

- **The formula editor.** A formula of a class is written with help:
  the names of functions and variables as one types, the argument one
  is in, and the engine's finding marked at its place with the engine's
  message and its hint.
- **The code view.** The text of a face's page or of a class, with
  colours, a search and undo. The panel of ADR-0002 changes the same
  text by small patches, and undo has to cover those too.

The engine checks a formula, not Workshop: the command
`validate_class` reports each finding with its place in the formula, a
message and a hint, and `preview_draft` tries a class that is not saved
on a document and writes nothing.

### Measured on 2026-11-19

In headless Chromium, with `@codemirror/view` 6.43.15, `monaco-editor`
0.57.0 and `ace-builds` 1.45.2.

| | A plain text box | CodeMirror 6 | Ace | Monaco |
|---|---|---|---|---|
| Names as one types, argument help, a mark at a place | all to write | built in 146 lines of our own, and it worked | names only (read) | all three (read) |
| Undo after the page changed the text | lost: Ctrl+Z does nothing | undoes that change, then the typing before it | not measured | not measured |
| Under `script-src 'self'`, no workers | yes | nothing refused, given a nonce for its styles or `style-src 'unsafe-inline'` (three runs) | refused as shipped: a worker from `blob:`, inline styles | refused as shipped: workers from `blob:`, inline styles |
| Both boxes, minified and gzipped | | 189 KB in one file | 222 KB | 1.4 MB for a JSON editor alone |

In the CodeMirror build a formula's functions, numbers and texts each
had a colour, a mark was a wavy line inside the text, and the code view
coloured tags, attributes and values.

### Read on the same day

- CodeMirror 6: MIT. One person wrote 204 of the 210 changes to its
  view package in twelve months, and sponsors fund it; 39 releases of
  that package in the same time. It says of itself that it uses "the
  platform's native selection and editing features on phones" and
  "works well with screen readers and keyboard-only users". It has to
  be bundled. Argument help is not built in; we build it from its
  tooltip.
- Monaco: MIT, Microsoft. Its README answers "No" to mobile browsers,
  and it needs a bundler.
- Ace: BSD-3. Ready files and a strict mode for the security header;
  no argument help, and marks by row only.
- A plain text box: Firefox drops undo on purpose when a script
  changes the text, and the one call that keeps undo,
  `document.execCommand`, is deprecated.

## Decision

1. **Both text boxes stand on CodeMirror 6.**
2. **Colours inside the text are required**, in the formula editor and
   in the code view.
3. **Only two functions of our own touch it**: one makes a formula
   box, one makes a code view. The rest of Workshop knows those two and
   nothing of CodeMirror.
4. **Only the design mode loads it.** The use mode stays as light as
   it is.
5. **It is built into one file at a release**, from versions that are
   fixed and listed in `docs/dependencies.md`. The built file is not
   kept in the repository.
6. **The formula editor shows the engine's findings.** It does not
   check a formula by itself.

## The owner's ruling

Of 2026-11-19. To the first recommendation, CodeMirror 6: "Do you
really think we need such advanced edit box? Our formula editor is a
very specialised thing. Wouldn't our own dev be lighter?" To a box of
our own without colours inside the text: "That is a no go." And then:
"My bad, I was thinking about formula editor only, I forgot code view.
I would now change my decision and go for CodeMirror 6."

The other way was a box of our own on the browser's plain text box:
lighter by far, with undo and the colours ours to write.

Settled by me, his to veto: that item 1 means both boxes, since the
code view loads CodeMirror anyway; and items 3 to 6.

## Consequences

- Workshop gets its first dependency that reaches the browser: 23
  small packages, 22 of them from one author, all MIT.
- Workshop gets a build step, for this one file only.
- The header a server sends with Workshop's pages has to let
  CodeMirror set its styles. That is settled with the record on how a
  server hands out the folder.
- It is one person's project. The releases are steady, the licence
  lets us keep our copy, and the two functions of item 3 are small
  enough to write again on something else.

## What building the code view showed

Added on 2026-11-19, when the first of the two boxes was built.

- The code view is built from 16 packages, not 23: the formula editor
  brings the rest. The file is some 360 KB, 120 KB compressed.
- Workshop's tests open it in Chromium, Firefox and WebKit, under the
  header a server sends with a page, and nothing is refused.
- A change the page puts into the text has to be marked as a step of
  its own in the history of the box. Unmarked, CodeMirror joins it
  with typing done less than half a second before, and one undo takes
  back both.
- The engine counts the place of a finding inside a formula in bytes.
  The box counts in characters, and a quote inside a formula is
  written in the text of a class as two. The function of item 3 that
  makes the code view does the counting.

## Not tested

On the day of the ruling: Firefox, Safari, a phone or a tablet with
its own keyboard, and a screen reader. Since the code view was built,
Firefox and WebKit are tested; a real phone, Safari itself and a
screen reader are not.

Nor what Ace and Monaco do once they are set up to pass the security
header.
