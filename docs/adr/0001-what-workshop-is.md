# ADR-0001: What Workshop is

- Status: Proposed
- Date: 2026-11-19

## Context

FadoDB is an engine. A database of FadoDB carries no application, as a
database of PostgreSQL or MariaDB carries none: it holds classes,
documents and their rules, and answers commands. What people see is a
face, a separate program that calls those commands, and the engine
leaves the screen to the face (the engine's ADR-0069).

Somebody who has just installed FadoDB wants to see it work at once.
Somebody who designs with it wants to keep building when no agent is at
hand. Both need a face that is there on the first day, free, and open
to read.

## Decision

1. **Workshop is a face**: a separate application that talks to a
   FadoDB server. It is not part of the engine, and the engine does not
   depend on it.
2. **It uses only the server's public commands.** Workshop does nothing
   that another face could not do. What it needs and the server lacks
   is added to the engine as a command for everybody.
3. **It has two modes.** In the use mode people work: apps, lists,
   documents. In the design mode a designer designs and tests classes,
   flows, faces and what else an app needs. The use mode is held to the
   standard of a finished product.
4. **The same shovels.** A person can build in the design mode
   everything an agent can build through the commands. The design mode
   is an equal way to build, not only a way to look at what an agent
   made and correct it.
5. **Workshop is plain files.** The folder `pages/` is what a server
   hands out. Our own code runs as it is written, without a bundler.
6. **It looks like a sibling of fadodb.org**: the same colours and
   type, its own layout.
7. **It is open from the first day**: this public repository, Apache
   2.0 as the engine, every change a pull request merged on the owner's
   word.

## The owner's ruling

Of 2026-11-18, on where an application belongs: "The whole 'app'
process does not belong to database. Does MariaDB offer applications.
Does Postgres offer applications." And, made exact the same day: "I
meant 'frontend app building process' does not belong to engine."

On the licence: "Sample face is open source like engine."

On the two modes: "1. for designer to design and test apps, documents,
flows, tables, integrations with external world and 2. The Runtime -
the Workshop as it is seen by normal users, a very nice app environment
- high class".

On the shovels: "If Agent fails there must an equal way to keep
building." And: "we need to give a humans same shovels as Agent has."

On the look, to the proposal that Workshop be a sibling of fadodb.org:
"Agreed with your proposal, a sibling."

On the repository: "fadodb-workshop, public from the first day". On the
flow: "Use the engine's flow: pull request, merged on my word".

The other way was the one first planned in the engine: a few plain
pages built into `fadodb serve` itself.

Settled by me, his to veto: item 2 as a rule that a pull request is
held to; item 5, that our own code is not bundled, and the name of the
folder.

## Consequences

- The engine stays an engine. Its size budget does not count Workshop.
- Workshop proves the commands: what it cannot do through them, no
  other face can do either, and the gap shows early.
- The design mode is more work than a viewer would be: every thing an
  agent can define needs a way to define it by hand.
- Without a bundler, what is in the repository is what runs, and a
  browser loads many small files. If that becomes slow, a later record
  answers it.

## Not decided here

Each of these is planned and needs a record of its own:

- how a server hands out the folder, and how a face on another address
  reaches a server (the engine's side);
- the app, a named collection of classes, and its export and import
  (the engine's side);
- how a face is built from pieces and from code (ADR-0002 settles the
  panel only);
- the languages of Workshop's own words, and a dark look.
