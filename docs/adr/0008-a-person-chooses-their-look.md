# ADR-0008: A person chooses how Workshop looks to them: six schemes, each light and dark

- Status: Proposed; amends ADR-0007 (the colours of item 1 are those of one scheme, Fado Standard, in its light shade; items 2 to 5 hold in every scheme)
- Date: 2026-11-21

## Context

ADR-0007 gave Workshop one look: light and pastel, with a violet for
what is pressed. People work in it all day, in bright offices and at
night, and do not all like the same colours.

Asked on 2026-11-21 what an administrator would choose under "Themes",
the owner said: "user can choose its own, admin sets default. You could
think about 5 or 6 quality color schemes or maybe even styling themes,
one should be Fado Standard. And maybe a switch for Light, Dark and
System?"

## Decision

1. **Six schemes.** Fado Standard is the look of ADR-0007. Beside it:
   Ocean, Meadow, Sunset, Rose and Graphite. A scheme is the colour of
   the grounds, of the lines, of the words, and of what is pressed and
   of where the person is. The colours of the apps (ADR-0007, item 2),
   the typefaces, the corners and the shadows are the same in all.
2. **Each scheme has a light shade and a dark one.** A person chooses
   Light, Dark or System; System is the shade their machine is in, and
   follows it when it changes.
3. **One ladder of lightness for all.** A scheme is a hue for its
   grounds, a hue for what is pressed and how strong the two are. Its
   colours are worked out by `tools/schemes.mjs` from one ladder, once
   for each shade, so that what is read keeps its contrast in every
   scheme (ADR-0007, item 5): words at least 4.5 to 1 against their
   ground, the edge of a field 3 to 1. The style sheet holds the result
   as plain colours, between two marks; a test reads every pair in all
   twelve, and fails when the style sheet holds other colours than the
   tool works out. Fado Standard in the light shade is not worked out:
   it is the colours the owner chose by eye, written by hand.
4. **A person chooses in their own menu**, at the end of the top bar:
   a round swatch for each scheme, and the three shades in a row. A
   choice shows at once, on that page and on every other the browser
   has open. The same choice stands under Settings, Themes, where the
   owner looked for it: there each scheme has its name beside its
   swatch.
5. **The page is never drawn in another look first.** A small script,
   `pages/look-early.js`, says the scheme and the shade on the root of
   the page before the style sheet is read.
6. **Today the choice is kept in the person's browser.** What nobody
   chose is Fado Standard in the light shade, whatever shade the
   machine is in: nothing changes for a person who chooses nothing.

## The owner's ruling

"User can choose its own, admin sets default", five or six schemes of
which one is Fado Standard, and Light, Dark and System (2026-11-21).

Settled by me, his to veto: which five stand beside Fado Standard, their
names and their hues; that Fado Standard is the look he chose on
2026-11-20; that what nobody chose is Light and not System; that the
choice stands in the person's menu, as swatches.

## Consequences

- Every colour of a page is named once at the top of the style sheet. A
  rule that writes a colour of its own would not follow the scheme; a
  test of the text boxes' colours (ADR-0003) and of the style sheet
  holds that none does.
- The pages gain one small file that is no module, and each page names
  it before its style sheet.
- The server's own pages, where a person signs in and keeps their
  account, are the engine's and keep their own look.

## What is not here yet, and of what kind

- **The administrator's default, and a choice that follows a person to
  another browser.** Planned next. Both have to be kept by the server,
  which keeps nothing of the kind today: that is a record of the
  engine's first. Until then Themes under Settings hold the choice of
  the person who looks, as their menu does, and say so: "Your theme".
- **Themes of shape**, the owner's "maybe even styling themes": other
  corners, a tighter page. His thought, not decided.

## Not tested

That the schemes are told apart by a person who sees colours
differently: a scheme is chosen by its name too, which every swatch
says. A machine set to force its own colours.
