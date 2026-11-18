# Proposal: frozen copies and a live pool for stories and components (PAR-1302)

Status: for Andrew to decide, 2026-11-18. Nothing here is built. It follows the measurements of route frames on copacker
under [route-frames.md](route-frames.md)'s Evidence, which asked whether Stories, Components and Frames should draw the
way route boards now do.

## In one line

Move stories and then components to pictures, frozen copies and one live page from a pool, each drawn from its own case
page. Keep design frames on the guest in Parity's window, where they're edited.

## What the numbers say

On copacker, in the same window and the same run:

| Canvas                                    | Pan       | Zoom      | Long tasks in 4 s of zoom          | Parity's window |
| ----------------------------------------- | --------- | --------- | ---------------------------------- | --------------- |
| Pages, 164 route boards                   | 60 fps    | 21–59 fps | none at fit or 20%; 3–12 at 45–60% | 650–900 MB      |
| Components, 390 boards drawn by the guest | 20–30 fps | 14–34 fps | 28–60                              | 1.3–1.5 GB      |

Going live on a route board takes about 30 ms from a press, since hover has already moved a spare to the route. Pages
draws 2 to 4 copies at a time and pictures for the rest, and its pages' code runs in a process of its own. Components
mounts a React root per board in Parity's window, with the project's code, its global styles and its providers there
too. Pages' slower zooms come from every board's labels and gutters, which Components pays as well (PAR-1314).

## Stories: move them first

A story's board is the closest thing to a page already: it draws one component under the project's decorators, from one
file, with nothing edited on the canvas but its args and the sizes tried on its layers.

- **Live:** a spare loads Parity's story page on the builder's origin, and moves to a story with a page module that
  takes a story id and args instead of a route. Changing args on the live page needs no reload.
- **Frozen and pictures:** the same snapshot, sanitizer, `buildCopy` and render pool as routes. A story's trace is its
  file's, as visual tests trace a case.
- **What it fixes:** decorators that need the whole page, such as MSW (PAR-109, PAR-112), run in a page of their own. A
  story's global styles and portals no longer reach Parity's window.
- **What gets slower:** an arg typed in the inspector shows at once only on the live page. Other boards of the story, in
  other modes or states, show it once they're frozen again, about 0.6 s a board on copacker, nearest the view first.
  Tried sizes are the same.

## Components: next, from the visual tests' case page

A component board draws a component's cases. Each case is already meant to be a page of its own for visual tests
([visual-tests.md](visual-tests.md), The case page, PAR-226), so the canvas, the visual tests and the pictures could all
load the same page.

- **Live and frozen** as for stories, with the case's props in place of args.
- **Instances in designs stay where they are.** A component placed in a design is drawn inside that design's frame, by
  the guest, since it's edited there.
- **What gets slower:** as for stories, a prop changed in the inspector reaches the other modes' boards after a
  refreeze.

## Design frames: keep the guest

Frames on Screens are Parity's own documents, edited directly: typing, dragging, resizing, other people's edits and
agents' change their DOM many times a second, and outlines and the overlay measure it live. A frozen copy would have to
be made again on every edit, and one live page can't hold a multi-board selection or two people editing at once. Frames
already sleep and show bitmaps when they're far or idle.

What frames can take from routes:

- skipping out-of-view boards' contents while zooming (PAR-1314);
- keeping Session Replay's cost flat over a long session (PAR-1315).

## What it would take

Most of route frames doesn't depend on routes. `@parity-app/frames` holds the tiers, the snapshot, the sanitizers and
`buildCopy`; `@parity-app/page-runtime` holds the channel. New pieces:

1. **A story page and a case page** the builders serve, with the page runtime first in them, rendering one story or case
   at a time and saying when it has drawn.
2. **A page module that moves between stories or cases,** beside `PageRouter`, so a spare changes what it draws without
   loading again.
3. **Traces for stories and cases,** from their files and what they import, as pictures' traces are.
4. **The pool and the freezer keyed by kind of page,** so a project's route and story spares don't take each other's
   places.

## Risks

- **Editing args and props gets less immediate** on boards other than the live one, as above.
- **Play functions and interactions** run only on the live page; a copy shows the state the story drew before them.
- **Memory:** each kind of page with spares adds a pool. With routes and stories both open, that's about four more
  copies of the app per project and window, at roughly 80 MB each in dev.
- **The case page isn't built** (PAR-226). Components would wait for it, or build it here.

## Decisions needed

1. Move stories to frozen copies and a live pool? Recommended: yes, first.
2. Move components the same way, through the visual tests' case page? Recommended: yes, after stories.
3. Keep design frames on the guest, taking only PAR-1314 and PAR-1315? Recommended: yes.
