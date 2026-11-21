# ADR-0007: Workshop has colours of its own: light pastel, and a colour for each app

- Status: Proposed; amends ADR-0001 (item 6: the colours are no longer those of fadodb.org; the typefaces still are)
- Date: 2026-11-20

## Context

ADR-0001, item 6, made Workshop "a sibling of fadodb.org: the same
colours and type, its own layout": steel blue on warm white and beige.
That fits a site a person reads once. Workshop is where a person works
all day.

The owner saw the first screen running with those colours on
2026-11-20: "Everything is so sad and rough. Maybe we should change
colors to more light pastel, merry." He was shown three sets of colours
on the running page, switched on the page itself, beside the colours of
that day: a pastel set, a cool one and a warm one.

## Decision

1. **Workshop's colours are its own**: a near-white ground with a
   breath of lilac, white surfaces, a violet for what is pressed and
   for where the person is, and ink of a soft dark blue. The style
   sheet names them once, as `--bg`, `--surface`, `--ink`, `--accent`
   and the like; nothing else names a colour of the look.
2. **Each app has a colour**, one of six pastel grounds, each with an
   ink that is read on it: mint, peach, sky, lilac, butter, rose. An
   app takes the colour of its place among the apps, the first the
   first colour, the seventh the first again. Its tile, its lists, its
   square in the rail and in the box that finds an app carry it.
3. **Corners are rounder and shadows softer**; a tile and a button
   rise a little under the pointer, unless the person asked their
   machine for less motion.
4. **The typefaces stay those of fadodb.org** (ADR-0006), and so does
   FadoDB's mark.
5. **What is read keeps its contrast.** Words and the ink of every app
   colour are at least 4.5 to 1 against their ground; the edge of a
   field a person types in is 3 to 1 against white.

## The owner's ruling

"I think we can stay with pastel version and search on the top bar"
(2026-11-20), after he had tried the three sets on the running page.

Settled by me, his to veto: the values of the colours; that an app's
colour follows its place; item 5.

## Consequences

- Workshop no longer looks like fadodb.org at a glance. It shares the
  typefaces and the mark with it.
- An app keeps its colour as long as the apps before it stay. The
  engine's definition of an app has a member `color` (the engine's
  ADR-0077); Workshop does not read it yet.
- The colours of the text inside a formula and inside the class as
  text (ADR-0003) are as they were.

## What this record leaves out

- A dark look.
- A colour a designer chooses for an app.
- A picture for an app: its square holds its first letter.

## Not tested

That the colours are told apart by a person who sees colours
differently. No word or state on a page is said by colour alone: an
app's colour stands beside its name.
