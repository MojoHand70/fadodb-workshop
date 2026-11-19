# ADR-0004: Workshop answers at the server's own address, and a person signs in on the server's page

- Status: Proposed
- Date: 2026-11-19

## Context

Workshop's pages need to know who is looking and to send commands as
that person. The engine has settled how a person proves who they are
(the engine's ADR-0071):

- A person signs in on the server's own page, `/auth/signin`, with a
  password or the company's sign-on. A password is typed only where it
  is checked.
- The browser then holds a session, a cookie that no script can read
  and that the browser sends to the server alone.
- A command sent with a session is taken only from a page at the
  server's own address. A page at another address is another kind of
  client: an administrator adds it, and it carries a pass it was given.

Tried on 2026-11-19 against a server built from the engine's commit
`924871e`, with Workshop's pages at the same address as the server:
Ann set her password on the server's page, signed in, came back to
Workshop's page, and the page's commands `whoami`, `list_classes` and
`get_class` were answered as Ann. Nothing in the engine was changed.

The engine does not hand out a folder of pages yet.

## Decision

1. **Workshop's pages answer at the address of the FadoDB server they
   work with.** The commands are at `/v1/` of the same address, and the
   server's own pages at `/auth/`.
2. **A person signs in on the server's own page and comes back.**
   Workshop has no sign-in form of its own and never sees a password.
3. **Workshop holds no credential.** The session is the browser's; no
   script of Workshop reads it, keeps it or sends it by hand.
4. **Signing out ends the session on the server**, and the person
   stays in Workshop, signed out.
5. **Until a server hands out the folder itself, a helper stands in
   front of the server**, `tools/serve.mjs`: it hands out `pages/` and
   passes `/v1/`, `/auth/` and `/.well-known/` through. It is for
   development and for the tests, on one's own machine.

## The owner's ruling

Of 2026-11-18, to the proposal that a FadoDB server be pointed at a
folder of pages and hand it out: "Agreed with your proposal, FadoDB
server pointed at a folder". And on the two ways to run a face: "Can
we have both options? Like an embedded small http server for less
technical users and as a folder for more advanced users who know how
to set a server up."

The other way is a face at an address of its own, which an
administrator adds to the server and which carries a pass. The engine
allows it today for a program; for a page in a browser it waits for
the engine to answer a page of another site.

Settled by me, his to veto: that the first way built is the one
address; items 3 and 4; and the helper of item 5.

## Consequences

- Signing in costs Workshop nothing to build, and every way the server
  learns to sign people in works in Workshop the same day.
- A script that runs on Workshop's page can send any command the
  person may send. Workshop's own scripts are held to the security
  header; a face that carries code somebody else wrote needs a room of
  its own, which a later record settles.
- Until the engine hands out a folder, nobody can install Workshop for
  people to use. That step is the engine's and needs its own record
  there.

## Not tested

Firefox and Safari. The company's sign-on and the second step of a
password, which are the server's pages and are tested in the engine.

## Not decided here

A Workshop at an address of its own, away from the server. It is
planned, and waits for the engine.
