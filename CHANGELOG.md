# Changelog

What a user of Workshop would see, newest first.

## Unreleased

- Design mode: a designer changes the sections of a class through the
  lists. A section is chosen by its title, and the card at the side
  shows it as fields: its label, what it is for, and where it lies, at
  the top or inside another section. How deep sections may nest is the
  server's to say, and the page says it in the server's words. "Add a
  section" asks its name and the variable it begins with: a section
  holds at least one variable. "Remove this section" leaves its
  variables in the class, in no section, and the sections inside it
  take its place.
- Fixed: the line at the top of the design page still said that the
  rights of single variables are changed in the text.
- Design mode: the card of a variable says who may set it and who may
  see it, state by state, and which line about single variables says
  so: its own line, the line for its section or the line for every
  variable, in that state or for every state. A state's own line comes
  before one for every state, as the server asks them. A final state
  says that nobody sets a value there, and a value the class works out
  says that nobody sets it at all. Each row leads to its state, where
  the lines are changed.
- Design mode: a designer says who may set and who may see single
  variables, state by state, through the lists. Under a state, and for
  every state under "The whole class", each line is about a variable,
  a section or every variable, and each half of it is a formula in a
  formula box. A line the class writes the short way, as a list of
  groups, is shown as the formula it means and stays as written until
  that half is changed. "Add a line" offers what the class has and the
  state has no line for; the new line lets nobody set it, until the
  designer says who may. "Remove this line" takes a line out, and so
  does emptying both its boxes.
- Fixed: on a class nobody had changed yet, Save and Discard stayed
  out of reach while something was typed in a field, until the cursor
  left it, so the first press on Save did nothing. What is typed is
  work from the first letter.
- Design mode: the formula editor. Wherever the lists have a formula,
  it is written in a box that helps: what the class works out, a first
  value, the title of a document, the four lines that say who may, who
  may take a transition, its condition and its date.
  - The pieces of the formula are coloured: functions, the variables
    of the class, numbers, texts and the words of the language.
  - As the designer types, the names that may be written are offered:
    the variables of the class with their labels, and the functions
    the engine has, with their arguments. "Names" opens the whole
    list. A function the engine has not built is not offered.
  - Under the box stands the function the cursor is in: its arguments,
    the one being written, what it does and what it gives.
  - A moment after the typing stops the server is asked about the
    formula, and what it finds is said under the box and marked at its
    place. The check writes nothing.
  - Enter, or leaving the box, puts the formula into the class, as one
    step that Undo takes back.
- Workshop is checked against an engine that hands out its list of
  functions, with the command `list_functions`: what the formula
  editor will offer names from.
- Design mode: a designer changes the states of a class, the
  transitions between them and the class's own lines through the
  lists. A state has fields for its label and for what a document
  waits for there, "Start new documents here", and Final. A way out of
  a state is chosen as a variable is, and the card shows the
  transition: its label, the state it leaves and the one it leads to,
  what taking it means, who may take it, on what condition, and
  whether the engine takes it by itself after a time or at a date.
  "Add a state" and "Add a way out" ask a name, which the server is
  asked about. Removing a transition takes the line that says who may
  take it with it; removing a state takes its label, its description
  and its rights, and the check names the transitions that still lead
  to it. "The whole class" has fields for the label, the label for
  many, what the class is for, the title of a document, and who may
  see, make, change and delete one.
- Design mode: a designer changes the variables of a class through the
  list. Choosing a variable shows its properties as fields in the card
  at the side: label, what it is for, whether people give it or the
  class works it out by a formula, type, required, first value, the
  values it may take, range, decimal places, whether The List shows
  it, how it is shown, and its section. A change goes into the text at
  once; nothing is the server's until Save. "Add a variable" at the
  end of a section asks its name, which the server is asked about, and
  opens it at the side. "Remove this variable" takes it out, and the
  check says what still reads it. Undo takes back one change at a
  time, whether it was made in the lists or in the text.
- Beside a long list the card at the side stays in view.
- Design mode: a designer makes a new class. The first page offers
  "New class" to a designer. The class gets a name, which the server is
  asked about at once, and begins as a small class that works: a
  subject, Draft and Done, and each document its author's alone. The
  designer changes it and makes it; nothing is the server's until then.
  A name the server has is never put over.
- Fixed: what the server only notes was shown as refusing a class. A
  check of a class whose new variable had no description said "the
  server would refuse this class", though the server takes it. Notes
  are now told apart: "the server takes it, with one note", in a quiet
  box, and the place in the text is not marked as wrong.
- Fixed: the first page still said that a class cannot be changed in
  the design mode.
- Design mode: a designer changes a class as text. The text is in a
  box with colours, line numbers, find and undo. Check asks the server
  and writes nothing; what the server finds is listed, and each finding
  leads to its place in the text, down to the word inside a formula.
  "Save as version N" makes the next version of the class. The lists
  follow the text as it stands. A text that is not JSON is said at its
  place and never sent. A text that names another class is not saved.
  When somebody else saved meanwhile, the designer is told and chooses.
  Discard puts the text back, and leaving with a change asks first. A
  person who is no designer reads the text and cannot change it.
- The text box stands on CodeMirror 6, the first thing from outside
  that the design mode loads; the use mode does not load it.
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
- Workshop is checked against an engine whose own pages, where a
  person signs in, name an empty icon too: Firefox no longer writes a
  refusal in its console there.
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
