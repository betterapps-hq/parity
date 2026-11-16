# Proposal: one project per window, its lenses down the left

Status: draft for discussion, 2026-11-16, with a clickable exploration in Storybook, Parity/Explorations/Lenses, laid
out by Dockview (PAR-1237). Nothing in the app is built. Andrew asked for routes, components and stories to have
canvases and panels of their own, as the database's ERD, the API and the other lenses of [app-lenses.md](app-lenses.md)
arrive, listed down the left as VS Code lists its views, and for a lens to move into a window on another monitor. He
also asked that Parity have one project open at a time, so the window's project tabs go. This changes app-lenses.md's
third decision, "each lens as its own canvas page, with links jumping between pages and the design canvas staying the
main view".

## In one line

A window holds one project. Its lenses are listed down the window's left edge, and each opens as a tab over its own
canvas, as VS Code opens files: tabs drag to split, to another group, or off the window into one of their own.

## The exploration

| Story        | What it shows                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Pages        | The project on Pages, Billing selected                                                               |
| Tabs         | Screens, Pages and Data as tabs of one group, Screens in front with the asset tabs in the left panel |
| Components   | Components on their boards, each state side by side                                                  |
| Side by side | Pages and Data side by side: the inspector says Billing reads the plans table, and a click opens it  |

It's built from the app's own parts: the title bar and its menus, the left panel and inspector with their tabs, the
canvas's colors, group titles and floating bars, the asset panels, Modes and the status bar. Everything in it can be
used: opening a lens as a tab, dragging tabs to split, popping a tab out into a real window and back, dragging a tab off
the window, dragging a lens in from the lens bar, the project's menu, closing the project to Home, and following a link
in the inspector, in place or beside.

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
  selected row, and the other lenses are dimmed; one open in another tab or window has a dot. Clicking the lens already
  shown hides or shows the left panel. A lens with nothing to read from, such as API without an OpenAPI document, sits
  at the bottom, dimmed, and its canvas says what's missing.
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

## Tabs, side by side and in windows

| Action                                                        | Result                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| Click a lens, or press Ctrl and its number                    | Brings its tab forward, else opens it in the group in focus |
| Drag a tab onto another group's tabs                          | Moves it into that group                                    |
| Drag a tab, or a lens from the lens bar, onto a canvas's side | Splits that side into a new group with it                   |
| The button at the end of a group's tabs                       | Its tab in a window of its own, beside the main window      |
| Drag a tab off the window                                     | A window of its own where it's let go                       |
| In that window, the same button                               | Back into the main window                                   |
| Right-click a lens                                            | Split right, Move to new window, Close                      |

**Each lens opens as a tab** with its name and a close button, in the shape today's project tabs have: rounded at the
top, on the title bar's color. The strip lines up with the side panels' tab rows, the tab in front takes its canvas's
color and joins it, and the tab in front in the group in focus has the selection's blue along its top. A group holds as
many lens tabs as you like, and each lens is open once, so showing it elsewhere moves it. Dragging a tab works as in VS
Code and a browser: onto tabs to join them, onto a canvas's side to split, and off the window to open it in a window of
its own where it's let go, so dropping it on another monitor puts it there. The button at the end of each group's tabs
does that in one click; the window is then moved like any other.

**A lens's own window holds its tabs, not the panels.** The lens bar, the left panel and the inspector stay in the main
window and follow the tab in focus, in any window, as VS Code's side bars follow its editors in their own windows.
Closing every tab leaves the main window's canvas empty, saying how to open a lens.

## Why it helps loading

[loading.md](loading.md) found that opening Copacker draws everything at once: 433 frames and 41 page iframes, holding
the window for 14 to 35 seconds. With a canvas per lens, opening a project draws only the lens shown. Pages draws its
pages and Components its boards, each when it first shows. With one project open, nothing is spent on others in the
background.

## What it needs

- **One project per window,** and no tab bar: the workspace's open projects become one, and opening another replaces it.
- **A canvas per lens.** Today there's one tldraw canvas per project. A lens's canvas mounts when it first shows, and
  keeps its camera and selection after.
- **Docking from Dockview** for the tabs, groups, splits, drag and drop, pop-out windows and saving the layout; see
  [On Dockview](#on-dockview).
- **A project in more than one window, in one renderer.** A lens's own window is a child window the main window opens
  (`window.open`, same origin), which Electron runs in the main window's process, so it shares the open project, its
  store and its instance of the project's code. Nothing has to be kept in sync between windows, and no second renderer
  edits through `@parity-app/multiplayer`.
- **Main's window list knows lens windows,** for closing the project, quitting, and putting them back on their screen.
- **Lenses as extensions' contributions,** so the ERD and API lenses come from their extensions as the router's pages
  do: an id, a name, an icon, a source, a left panel, a canvas and an inspector section.

## On Dockview

The spike (PAR-1237) rebuilt the exploration's canvases and windows on Dockview 8.9 (`dockview-react`, MIT, no
dependencies beyond React). It replaced the hand-built layout model, drag and drop, drop targets and simulated monitors:
the exploration lost 750 lines and gained 470.

| What                                | Dockview                                                              |
| ----------------------------------- | --------------------------------------------------------------------- |
| Tabs, groups, splits, drop overlays | Built in, themed with CSS variables                                   |
| Pop-out windows and docking back    | Built in (`addPopoutGroup`), free; copies the page's stylesheets over |
| Saving and restoring the layout     | Built in (`toJSON`, `fromJSON`)                                       |
| Tabs by keyboard                    | Tabs are `tab` elements, and arrow keys move between them             |
| Keyboard docking, layout history    | Paid, in `dockview-enterprise`                                        |
| Size                                | About 94 KB gzipped, plus its stylesheet                              |

What we'd build on top, each found in the spike:

- **Opening a window where a tab is let go.** Dockview doesn't open one for a tab dropped outside the window; the
  exploration does it on the drag's end, about 20 lines.
- **Menus and tooltips in a lens's own window.** They render into the main window's document, so a tooltip for a button
  in that window shows in the main one. Each window needs its own portal container for Base UI.
- **Shortcuts in a lens's own window.** Ctrl and a number pressed there does nothing; the app's shortcuts listen on the
  main window only.
- **The theme on a lens's own window.** Its page starts blank, so the app copies its root's classes over once the group
  is in.
- **Electron allowing the window.** The main window's `setWindowOpenHandler` denies every `window.open` today; it would
  allow the pop-out page and set the window's frame and title bar.
- **The real canvas in a lens's own window.** Not tried: tldraw listens on `window` and `document`, which in a pop-out
  are the main window's.

## Open questions

- **Asset tabs on Components too?** Components are drawn with the same icons, media and tokens as screens.
- **Two projects side by side,** to compare or copy between them: is a second Parity window on another project ever
  wanted, or is one project for the whole app the rule?
