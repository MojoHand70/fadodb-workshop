# ADR-0002: The designer's panel is our own

- Status: Accepted
- Date: 2026-11-19

## Context

Most builders of business applications make a screen from a fixed set
of components. Workshop is to go further: a face may be made of ready
pieces, of code, or of both on one page, and an agent will usually
write it as code. A designer still has to change it by hand: select an
element, see its properties, change one, and see the page's code.

That gives one test. An agent writes a page. A designer changes one
thing in the panel. The agent's page comes back with only that one
thing changed: its script, its pieces and its named values untouched.

On 2026-11-18 the open-source editors of this kind were read, their
sources, their documentation and their lists of issues. Two can be put
into plain pages under a licence that fits ours, and neither passes the
test:

- GrapesJS (BSD-3) reads a page into a model of its own and writes a
  new page out. It moves the look of an element away from the element
  and drops scripts unless told to keep them.
- VvvebJs (Apache 2.0) changes the page itself, but saves it after the
  page's script has run, so a named value would be saved as whatever it
  showed at that moment.

The rest are whole applications, are tied to a framework, or carry a
licence that would bind ours.

## Decision

1. **The design mode has a panel** for the selected element of a face:
   the list of the page's elements, the element's properties, and the
   page's code.
2. **The panel is our own.** It stands on no editor from outside.
3. **The page's text is the truth.** A change made in the panel is a
   small patch to that text, at the one place it concerns. Nothing else
   in the text is rewritten.
4. **A small core first.** The page shown by itself, a frame around
   the selected element, the list of elements kept in step with the
   selection, typed inputs for a short list of properties, a text
   changed in place, undo and redo, and the code beside it. Moving an
   element with the mouse comes later; "move up" and "move down" come
   first.

## The owner's ruling

Of 2026-11-18, on what a face is made of: "I would like to go one or
even two steps further and allow building faces as either components or
CODE". On the panel, beside a picture of a design tool's panel of
properties and code: "I think we need this panel of code and properties
like on this screenshot". On its size: "I would say small core in
workshop."

Of 2026-11-19, to the offer of a trial of the two editors beside a
first cut of our own: "No we don't need trials. This is enough proof we
already have."

The other way was to stand on GrapesJS or on VvvebJs and work against
the one's model or the other's way of saving.

Settled by me, his to veto: the list of item 4.

Accepted by him on 2026-11-19, with the other records from ADR-0001 to
ADR-0005: "merged and approved". Asked what that covered, he said
these five records.

## Consequences

- The part Workshop's idea stands on, a save that touches only what
  changed, is ours to write and ours to keep right.
- What a finished editor gives for nothing we write ourselves: my
  estimate is a few thousand lines.
- A page can be changed in the panel only where it keeps to a
  discipline: where its layout, its looks and its values are written in
  ways the panel can read. What the panel cannot read stays code, shown
  as code.

## Not tested

The findings about the two editors come from reading, on the owner's
ruling that no trial was needed. Nothing of the panel is built.

## Not decided here

The form of a face's page: its pieces, how a value of the document is
named in it, and where a face is kept. Each is planned and needs a
record of its own.
