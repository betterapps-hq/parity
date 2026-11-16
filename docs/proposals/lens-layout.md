# Proposal: one project per window, its lenses down the left

Status: draft for discussion, 2026-11-16, with a clickable exploration in Storybook, Parity/Explorations/Lenses. Nothing
in the app is built. Andrew asked for routes, components and stories to have canvases and panels of their own, as the
database's ERD, the API and the other lenses of [app-lenses.md](app-lenses.md) arrive, listed down the left as VS Code
lists its views, and for a lens to move into a window on another monitor. He also asked that Parity have one project
open at a time, so the window's project tabs go. This changes app-lenses.md's third decision, "each lens as its own
canvas page, with links jumping between pages and the design canvas staying the main view".

## In one line

A window holds one project. Its lenses are listed down the window's left edge; each has its own canvas, left panel and
selection, and can show beside another lens or in a window of its own.

## The exploration

| Story        | What it shows                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Pages        | The project on Pages, Billing selected                                                              |
| Side by side | Pages and Data side by side: the inspector says Billing reads the plans table, and a click opens it |
| Own window   | Data in a window of its own on a second screen, beside the main window                              |
| Stories      | Stories on their own canvas, grouped by component in the left panel                                 |

Everything in it can be used: showing a lens, splitting it, moving it to its own window and back, dragging a lens onto a
canvas, the project's menu, and following a link in the inspector, in place or to the side.

## One project at a time

- **No project tabs.** The window's bar shows the menu and the project's name. The name opens the project's menu: Open
  project, recent projects and Close project. Opening one closes the open one, asking to save first as closing a tab
  does today.
- **Home is what a window shows with no project,** in place of its pinned tab.
- **Windows of one project.** A lens moved to a window of its own is the same project, so the rule holds: the app has
  one project open, in as many windows as its lenses need.

What goes: the tab bar (`TabBar`), new tabs and their page, and the workspace's several open projects with their
restore. The project service still could hold more than one project; the window would only ever ask for one.

## Lenses down the left

- **The lens bar** is a column of icons at the window's left edge, as VS Code's activity bar is. Each lens's name is its
  tooltip. The lens shown in the canvas in focus is marked; one shown in another canvas of the window has a dot. A lens
  with nothing to read from, such as API without an OpenAPI document, is listed apart, dimmed, and its tooltip says
  what's missing.
- **The left panel is the lens's,** headed by its name: Pages' route tree, Components' components, Stories' stories by
  component, Data's tables. It follows the canvas in focus.
- **Each lens keeps its own canvas, camera and selection,** so moving between Pages and Data and back leaves both as
  they were.
- **The inspector follows the canvas in focus.** Links in it show their lens with the item selected: in the canvas in
  focus, or to the side with the button beside each link.

## Side by side and in windows

| Action                                                                  | Result                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------- |
| Click a lens                                                            | Shows it where it is, else in the canvas in focus |
| Right-click a lens, Split right, or drag it onto a canvas's right       | Shows it in a new canvas to the right             |
| Drag a lens onto a canvas                                               | Shows it there, in place of what it showed        |
| Right-click a lens, Move to new window, or drag it to the window's edge | A window of its own, with that lens               |
| In that window, right-click the lens, Move to main window               | Back into the main window, to the right           |

Each lens shows in one place at most, so showing it elsewhere moves it. With two or more canvases, each has a slim
header with its lens and a close button. The main window always keeps one canvas; a lens's own window closes with its
last. Windows and their canvases are kept with the project and come back as they were.

## Why it helps loading

[loading.md](loading.md) found that opening Copacker draws everything at once: 433 frames and 41 page iframes, holding
the window for 14 to 35 seconds. With a canvas per lens, opening a project draws only the lens shown. Pages draws its
pages and Components its boards, each when it first shows. With one project open, nothing is spent on others in the
background.

## What it needs

- **One project per window,** and no tab bar: the workspace's open projects become one, and opening another replaces it.
- **A canvas per lens.** Today there's one tldraw canvas per project. A lens's canvas mounts when it first shows, and
  keeps its camera and selection after.
- **A project in more than one window.** A moved lens's window is another renderer with the same project open. It edits
  the same project document as a second person would, through `@parity-app/multiplayer`
  ([multiplayer.md](multiplayer.md)). Each window has its own instance of the project's code
  ([shared-app-instance.md](shared-app-instance.md)).
- **Main's window list knows lens windows,** for closing the project, quitting, and putting them back on their screen.
- **Lenses as extensions' contributions,** so the ERD and API lenses come from their extensions as the router's pages
  do: an id, a name, an icon, a source, a left panel, a canvas and an inspector section.

## Open questions

- **Designs:** today's `.par` screens and frames. A lens of their own, Screens, or on the Pages canvas beside the pages
  they stand for?
- **Layers:** inside each lens's left panel, or a lens of its own?
- **The panels in today's left panel,** Icons, Media and Tokens: lenses of their own, or kept as panels within the
  canvases that use them?
- **Two projects side by side,** to compare or copy between them: is a second Parity window on another project ever
  wanted, or is one project for the whole app the rule?
