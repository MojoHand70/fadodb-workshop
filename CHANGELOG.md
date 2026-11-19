# Changelog

What a user of Workshop would see, newest first.

## Unreleased

- Design mode, its first step: a designer reads a class. The first
  page and the list of a class offer Design to a person in the
  server's group of designers. The class is shown as lists: its
  variables by section, each with its kind in a line (`text,
  required`, `fx net + vat`); its states; and for the state the
  designer chooses, the ways out of it with who may take each and on
  what condition, who may set and see single variables there, and
  what the class does by itself. "The whole class" shows who may see,
  make, change and delete a document. Every formula is shown whole, as
  the class writes it. The same class is there as text, word for word
  as the server keeps it. Nothing can be changed there yet.
- The pages are checked in Firefox and in WebKit, the engine of Safari,
  as they are in Chromium: every test, on every pull request.
- Fixed: at a server reached by a name over plain http, as on an
  office network with no certificate, the page of a document did not
  load at all. It asked the browser for something a browser gives only
  at a secure address.
- A page names an empty icon, so that a browser no longer asks the
  server for `/favicon.ico` on every page. Workshop has no icon of its
  own yet.
- The buttons that move a document follow what the person types, by
  the class's own rules and guards: Submit lights up when the total is
  above zero, before anything is saved. Where a condition is the
  server's to work out, the page asks the server. A move takes what was
  typed with it, in one step: the server takes the change and the move,
  or neither. A move the server refuses keeps the typing.
- Discard reads the document again, as somebody else may have left it.
- Fixed: a button pressed right after typing into a field did nothing,
  because the page drew its buttons again when the field was left.
- A FadoDB server hands out Workshop's pages itself: `fadodb serve
  acme.db --pages pages`, with an engine newer than its release 0.6.0.
  The helper that stood in front of a server is gone; what is left of
  it hands out the pages with no server behind them. Workshop's tests
  start a real server that way.
- A new document: the list of a class offers New to whoever the class
  lets make one. The page begins with what the class gives a new
  document, its defaults, and what the class calculates follows as the
  person types. Create makes it on the server and opens it; what is
  needed and missing is said at its field. Pressing Create twice makes
  one document.
- Changing a document: a value the person may set, as the document
  stands, is a field. As they type, what the class calculates follows
  at once, worked out in the browser as the server works it out, and
  the title with it. Nothing is the server's until they save. A change
  the server refuses is shown at its field, in its words, and nothing
  typed is lost. A number is typed in the browser's language and read
  strictly; a rate the class shows as a percentage is typed as one.
  While something is not saved the document cannot be moved, and
  leaving the page asks first.
- A value the person may not read says so, where an empty one shows a
  dash.
- One document: a row of a list opens it. The page shows its values by
  the sections of its class, each with its label, its format and what
  the class says it is for; the state and what the class says of it;
  who made it and when; and its history, newest first. The transitions
  the person may take are buttons that work; one whose condition does
  not hold yet is shown and says so; one that is somebody else's is not
  shown. A refusal is shown in the server's words.
- The List of a class: its documents, newest first, fifty at a time,
  with the title, the columns the class marks for its list, the state,
  who made each and when it last changed. A number, a money, a day and
  a moment are shown by the format the class gives them, with the
  separators and the month names of the browser's language. The list
  is narrowed to one state, and the address keeps the choice. On a
  phone each document is a card.
- The classes on the first page lead to their lists.
- The first page: a person signs in on the FadoDB server's own page,
  comes back, and sees their name and the classes on the server, each
  with the words its class says to people. Signing out ends the session
  on the server. In development only, behind the helper.
- The foundations: the first decision records, a first page that says
  nothing works yet, a helper that hands out the pages on one's own
  machine, and the checks every pull request is held to.
