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
| Screens      | Today's designs, each in the project's modes, with the asset tabs in the left panel                 |
| Components   | Components on their boards, each state side by side                                                 |
| Side by side | Pages and Data side by side: the inspector says Billing reads the plans table, and a click opens it |
| Own window   | Data in a window of its own on a second screen, beside the main window                              |

It's built from the app's own parts: the title bar and its menus, the left panel and inspector with their tabs, the
canvas's colors, group titles and floating bars, the asset panels, Modes and the status bar. Everything in it can be
used: showing a lens, splitting it, moving it to its own window and back, dragging a lens onto a canvas, the project's
menu, closing the project to Home, and following a link in the inspector, in place or beside.

## One project at a time

- **No project tabs.** The title bar keeps the menus on the left and the account menu on the right, and shows the
  project's name in the middle. The name opens the project's menu: Open project folder, recent projects and Close
  project. Opening one closes the open one, asking to save first as closing a tab does today.
- **Home is what a window shows with no project,** in place of its pinned tab: today's Home page under the title bar.
- **Windows of one project.** A lens moved to a window of its own is the same project, so the rule holds: the app has
  one project open, in as many windows as its lenses need.

What goes: the tab bar (`TabBar`), new tabs and their page, and the workspace's several open projects with their
restore. The project service still could hold more than one project; the window would only ever ask for one.

## Lenses down the left

- **The lenses are today's Layers groups,** each made a canvas: Pages for the app's routes, Screens for its designs,
  Components, Stories, Data for its database, and API.
- **The lens bar** is a column of icons at the window's left edge, as VS Code's activity bar is, on the title bar's
  surface so the two frame the panels. Each lens's name and shortcut, Ctrl+1 to Ctrl+6, is its tooltip. The lens shown
  in the canvas in focus is drawn as the open tab is today, with a blue bar at the window's edge as Layers marks its
  selected row, and the other lenses are dimmed; one shown in another canvas of the window has a dot. Clicking the lens
  already shown hides or shows the left panel. A lens with nothing to read from, such as API without an OpenAPI
  document, sits at the bottom, dimmed, and its canvas says what's missing.
- **The left panel is the lens's,** with today's tab row along its top. Its first tab lists what the lens draws, as
  Layers does: Pages' routes, Screens' screens and frames, Components, Stories by file, Data's tables. Screens adds the
  asset tabs, Components, Icons, Media and Tokens, since that's where they're dropped. It follows the canvas in focus.
- **Each lens keeps its own canvas, camera and selection,** so moving between Pages and Data and back leaves both as
  they were. Each canvas is today's: its colors, group titles that scale with zoom, the zoom bar, and the drawing
  toolbar on the lenses that hold designs.
- **The inspector follows the canvas in focus,** with Modes beside it for the lenses that hold designs. Links in it show
  their lens with the item selected: where that lens already shows, else in the canvas in focus, or beside with the
  button at the end of each link. Hovering a link outlines the item wherever its lens shows.
- **The View menu lists the lenses,** with Split right and Move to new window for the lens in focus.

## Side by side and in windows

| Action                                                            | Result                                            |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| Click a lens                                                      | Shows it where it is, else in the canvas in focus |
| Right-click a lens, Split right, or drag it onto a canvas's right | Shows it in a new canvas to the right             |
| Drag a lens onto a canvas                                         | Shows it there, in place of what it showed        |
| The button on a canvas's tab, or drag the tab off the window      | A window of its own where it's dropped            |
| Right-click a lens, Move to new window, or drag it off the window | The same                                          |
| In that window, right-click the lens, Move to main window         | Back into the main window, to the right           |

**Each canvas has a tab** with its lens's name, drawn as the side panels draw their open tab, so the three line up along
the top. A button at the tab's end, Move to new window, opens the lens in a window of its own, which is then moved like
any window, by its title bar; in that window the same button takes it back. Dragging the tab off the window works as
dragging a tab out of a browser does: the window opens where it's let go, so dropping it on another monitor puts it
there. While it's dragged, an outline of the window it would open follows the pointer outside the window. Lenses drag
from the lens bar the same way.

Each lens shows in one place at most, so showing it elsewhere moves it. With two or more canvases, each tab has a close
button, and the one in focus has a blue top edge. The main window always keeps a canvas: moving its only lens out leaves
the next free lens in its place. A lens's own window closes with its last canvas. Windows and their canvases are kept
with the project and come back as they were.

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

- **Asset tabs on Components too?** Components are drawn with the same icons, media and tokens as screens.
- **Two projects side by side,** to compare or copy between them: is a second Parity window on another project ever
  wanted, or is one project for the whole app the rule?
