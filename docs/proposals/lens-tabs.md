# Proposal: a tab for each lens, in any window

Status: draft for discussion, 2026-11-16, with a clickable exploration in Storybook, Parity/Explorations/Lenses. Nothing
in the app is built. Andrew asked for routes, components and stories to have canvases and panels of their own, as the
database's ERD, the API and the other lenses of [app-lenses.md](app-lenses.md) arrive, and for tabs that can be pulled
out into a window on another monitor, as VS Code's can. This changes that proposal's third decision, "each lens as its
own canvas page, with links jumping between pages and the design canvas staying the main view".

## In one line

Each lens is a tab inside the project, with its own canvas, left panel and selection. Lens tabs move like VS Code's
editor tabs: along their row, side by side in the window, or out into a window of their own.

## The exploration

| Story        | What it shows                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Pages        | The project on Pages, Billing selected; Components, Stories and Data a tab away                      |
| Side by side | Pages and Data in two groups: the inspector says Billing reads the plans table, and a click opens it |
| Own window   | Data in a window of its own on a second screen, beside the main window                               |
| Stories      | Stories on their own canvas, grouped by component in the left panel                                  |

Everything in it can be used: switching lenses, reordering and dragging tabs into a split or to the window's edge, the
tab's menu (Split right, Move to new window, Move to main window, Close), opening a lens with +, and following a link in
the inspector to its lens.

## The window

- **Project tabs stay where they are,** in the window's own bar. A project's lenses are a second row, under it.
- **A lens tab** has the lens's icon and name, and closes. + lists the lenses the project has, with where each is read
  from: TanStack Router, the app's code, Storybook, Drizzle. A lens with nothing to read from, such as API without an
  OpenAPI document, is listed but can't be opened.
- **Each lens keeps its own canvas, camera and selection,** so moving between Pages and Data and back leaves both as
  they were.
- **The left panel and the inspector follow the lens in focus.** Pages shows its route tree, Components its components,
  Stories its stories by component, Data its tables. With two lenses side by side, clicking in one moves both panels to
  it, as VS Code's sidebar follows the editor in focus.
- **Links between lenses are in the inspector.** A page lists the components it uses and the tables it reads; following
  one opens its lens with it selected, in the group in focus if it isn't open yet.

## Moving tabs

| Action                                                  | Result                                   |
| ------------------------------------------------------- | ---------------------------------------- |
| Drag along the row, or onto another group's row         | Reorders it, or moves it into that group |
| Drag onto the right of a canvas, or choose Split right  | A new group to the right, with that lens |
| Drag to the window's edge, or choose Move to new window | A window of its own, with that lens      |
| In that window, choose Move to main window              | Back into the main window's last group   |

A group with no tabs left closes, and so does a window with no groups. Each lens is open once, so opening one that's
open elsewhere moves it. Windows, groups and their tabs are kept with the project and come back as they were.

## Why it helps loading

[loading.md](loading.md) found that opening Copacker draws everything at once: 433 frames and 41 page iframes, holding
the window for 14 to 35 seconds. With a canvas per lens, opening a project draws only the lens shown. Pages draws 43
routes and Components its boards, each when its tab first shows.

## What it needs

- **A canvas per lens.** Today there's one tldraw canvas per project. A lens's canvas mounts when its tab first shows
  and keeps its camera and selection after.
- **A project in more than one window.** A moved lens's window is another renderer with the same project open. It edits
  the same project document as a second person would, through `@parity-app/multiplayer`
  ([multiplayer.md](multiplayer.md)). Each window has its own instance of the project's code
  ([shared-app-instance.md](shared-app-instance.md)).
- **Main's window list knows lens windows,** for closing a project, quitting, and restoring them on their screen.
- **Lenses as extensions' contributions,** so the ERD and API lenses come from their extensions as the router's pages
  do. The lens model: an id, a name, an icon, a source, a left panel, a canvas and an inspector section.

## Open questions

- **Designs:** today's `.par` screens and frames. Their own lens, Screens, or on the Pages canvas beside the pages they
  stand for?
- **Layers:** inside a lens's left panel, or a tab of its own in each?
- **Where a lens opens from the menu and from search,** and whether a link can open its lens to the side rather than in
  the group in focus.
