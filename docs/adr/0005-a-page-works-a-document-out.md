# ADR-0005: A page works a document out with the engine's own file for the browser

- Status: Accepted
- Date: 2026-11-19

## Context

When a person changes a value of a document, what the class calculates
from it should follow at once: Jan types a net amount, and the VAT, the
total and whether it needs a director are there before he saves.

The engine was built for this. Its formulas are compiled once, and a
small file for the browser, `fadodb-vm`, runs them as the server does
(the engine's ADR-0029). A page is handed the compiled formulas of a
class with its bundle, with the rules that say what a person may set in
each state (the engine's ADR-0070). The engine's own test of the bundle
holds a small page that does this, compares each answer with the
server's, and says of itself that "every face's logic is held to it".

The file is one ES module of 35 KB with no dependency, Apache 2.0 as
the engine, published on npm. Its major version is the format of the
compiled formulas: 4.x runs what a server of format 4 writes.

## Decision

1. **Workshop's pages work a document out in the browser**, with
   `fadodb-vm`: the calculated variables and the title as the person
   types, and what the person may set and read in the document's state.
2. **The live document is one module**, `pages/live.js`, which follows
   the engine's own small page. Every page of Workshop that changes a
   document goes through it.
3. **The server stays the authority.**
   - Nothing is the server's until the person saves, and what the
     server answers is the document from then on.
   - What a page cannot work out, a formula that reads other documents
     or a table, is asked of the server with `preview`.
   - Where the page cannot tell whether a rule lets the person through,
     the field is open and the server's answer counts.
   - A change the server refuses is shown in its words, at its field.
4. **The file comes from npm at a fixed version**, the one that runs
   the format of the engine Workshop is checked against. It is copied
   into `pages/vendor/` when Workshop is built or tested, and is not
   kept in the repository.
5. **A test compares the page with the server**: for a set of typed
   values, each calculated value the page shows is the one the server's
   `preview` answers.

## The owner's ruling

None of his own yet on this record. It follows what he ruled for the
engine: on 2026-11-17 he kept the engine's file for the browser as it
is, written in TypeScript, over a build of the Go engine for the
browser that measured 4.5 MB.

Settled by me, his to veto: everything in the decision; that the live
document is written in Workshop for now; and that a page reads a
person's typing strictly, so that "4200,50" typed in an English browser
is said to be no number, and is not taken for 420050.

Accepted by him on 2026-11-19, with the other records from ADR-0001 to
ADR-0005: "merged and approved". Asked what that covered, he said
these five records.

## Consequences

- A person sees what the class makes of a change before saving it, and
  the page asks the server nothing while they type, unless a value is
  the server's to work out.
- The first file from outside reaches the browser. It is the engine's
  own, and it is small.
- Workshop is tied to the format of the server's compiled formulas. A
  server of another format is refused by the page with a plain message,
  and Workshop moves to the file's next major version with the engine.
- The live document now exists twice: in the engine's test and in
  Workshop. Another face would write it a third time. It may belong
  with the engine's file for the browser, as a file every face takes.

## Not tested

Firefox and Safari. A class with rows, lists or objects: a page does
not set those yet, and shows them as they come.

## Not decided here

- What a face written as code is given to reach a document. The live
  document is Workshop's own for now and promises nothing to a face.
- Whether a save should be refused when somebody else changed the
  document meanwhile. The server's command for a change takes no
  version to check against today.
