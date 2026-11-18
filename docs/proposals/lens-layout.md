# Proposal: one project per window, its lenses down the left

Status: draft for discussion, 2026-11-16, with a clickable exploration in Storybook, Parity/Explorations/Lenses, laid
out by Dockview (PAR-1237). One project per window is built (PAR-1241), the layout's decisions are in
`@parity-app/lenses` (PAR-1239), the shell is in the app (PAR-1240), and the open project shows in it with today's
canvas as one lens, Screens (PAR-1243), and Pages has a lens of its own (PAR-1244); the rest isn't, and
[Building it into the app](#building-it-into-the-app) plans it as PAR-1242, PAR-1245 to PAR-1248 and PAR-1251. Andrew
asked for routes, components and stories to have canvases and panels of their own, as the database's ERD, the API and
the other lenses of [app-lenses.md](app-lenses.md) arrive, listed down the left as VS Code lists its views, and for a
lens to move into a window on another monitor. He also asked that Parity have one project open at a time, so the
window's project tabs go. This changes app-lenses.md's third decision, "each lens as its own canvas page, with links
jumping between pages and the design canvas staying the main view".

## In one line

A window holds one project. Its lenses are listed down the window's left edge and open as tabs over their canvases. The
lens bar works as links do in a browser: a click shows a lens in the tab in focus, and Ctrl+click or a drag opens it in
a new tab. Tabs drag to split, to another group, or off the window into one of their own.

## The exploration

| Story        | What it shows                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Pages        | The project on Pages, Billing selected                                                              |
| Tabs         | Screens, Pages and Data as tabs, Screens in front with the asset tabs in the left panel             |
| Components   | Components on their boards, each state side by side                                                 |
| Side by side | Pages and Data side by side: the inspector says Billing reads the plans table, and a click opens it |
| Empty        | Every tab closed: the window is empty until a lens is shown                                         |

It's built from the app's own parts: the title bar and its menus, the left panel and inspector with their tabs, the
canvas's colors, group titles and floating bars, the asset panels, Modes and the status bar. Everything in it can be
used: showing a lens from the lens bar and opening it in a new tab, dragging tabs to split, popping a tab out into a
real window and back, dragging a tab off the window, closing every tab, the project's menu, closing the project to Home,
and following a link in the inspector, in place or beside.

## One project at a time

- **No project tabs.** The title bar keeps the menus on the left and the account menu on the right, and shows the
  project's name in the middle. The name opens the project's menu: Open project folder, recent projects and Close
  project. Opening one closes the open one, asking to save first as closing it does.
- **Home is what a window shows with no project,** where it was a pinned tab before: Home's page under the title bar.
- **Windows of one project.** A lens moved to a window of its own is the same project, so the rule holds: the app has
  one project open, in as many windows as its lenses need.

What went, with PAR-1241: the tab bar (`TabBar`), new tabs and their page, and the workspace's several open projects
with their restore. The project service still could hold more than one project; the window only ever asks for one. Until
lenses arrive, an extension's page shows in the project's place, under the title bar, with a button that closes it and
shows the project again, since there's no tab for it to open in.

## Lenses down the left

- **The lenses are today's Layers groups,** each made a canvas: Pages for the app's routes, Screens for its designs,
  Components, Stories, Data for its database, and API.
- **The lens bar** is a column of icons at the window's left edge, as VS Code's activity bar is, on the title bar's
  surface so the two frame the panels. Each lens's name and shortcut, Ctrl+1 to Ctrl+6, is its tooltip. Its lenses work
  as links do in a browser: a click shows the lens in the tab in focus, in place of that tab's lens, and Ctrl+click or a
  middle click opens it in a new tab. The lens in the tab in focus is drawn raised, with a blue bar at the window's edge
  as Layers marks its selected row, and the other lenses are dimmed; one open in another tab or window has a dot, and
  clicking it goes there. Clicking the lens in focus hides or shows the left panel. A lens with nothing to read from,
  such as API without an OpenAPI document, sits at the bottom, dimmed, and its canvas says what's missing.
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

| Action                                                        | Result                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Click a lens, or press Ctrl and its number                    | Shows it where it's open, else in the tab in focus      |
| Ctrl+click or middle-click a lens                             | Shows it where it's open, else in a new tab             |
| Drag a lens from the lens bar onto a group's tabs or canvas   | Opens it in a new tab there                             |
| Drag a tab, or a lens from the lens bar, onto a canvas's side | Splits that side into a new group with it               |
| Drag a tab onto another group's tabs                          | Moves it into that group                                |
| The button at the end of a group's tabs                       | Its tab in a window of its own, beside the main window  |
| Drag a tab off the window                                     | A window of its own where it's let go                   |
| In that window, the same button                               | Back into the main window                               |
| A tab's close button, or a middle click on it                 | Closes it, the last one too                             |
| Right-click a lens                                            | Open in new tab, Split right, Move to new window, Close |

**The lens bar works as links do in a browser,** so the two lists of lenses agree: the lens bar lists every lens, the
tabs the ones you keep open. A click shows a lens in the tab you're on, as a link opens in the tab it's clicked in, and
Ctrl+click, a middle click or a drag onto the tabs opens it in a new one. A lens is open once, so clicking one open in
another tab goes there.

**Tabs are flat,** on the side panels' background and as tall as their tab rows, so the three read as one row across the
window. The open tab takes its canvas's color and runs on into it; the others are quieter, and so is the open tab of a
group out of focus. Dragging a tab works as in VS Code and a browser: onto tabs to join them, onto a canvas's side to
split, and off the window to open it in a window of its own where it's let go, so dropping it on another monitor puts it
there. The button at the end of each group's tabs does that in one click.

**A lens's own window holds its tabs, not the panels.** The lens bar, the left panel and the inspector stay in the main
window and follow the tab in focus, in any window, as VS Code's side bars follow its editors in their own windows.
Closing every tab empties the window: the left panel and the inspector go with the last lens, and the canvas says how to
show one.

## Why it helps loading

[loading.md](loading.md) found that opening Copacker draws everything at once: 433 frames and 41 page iframes, holding
the window for 14 to 35 seconds. With a canvas per lens, opening a project draws only the lens shown. Pages draws its
pages and Components its boards, each when it first shows. With one project open, nothing is spent on others in the
background.

## What it needs

- **One project per window,** and no tab bar: the workspace's open projects become one, and opening another replaces it.
  Built in PAR-1241.
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

## Building it into the app

The logic goes in a package and the views stay in the app, as [packages.md](packages.md) has it: a package takes data
and returns data, and the shell needs the app's own canvas, panels and kit, which a package can't import.

```text
packages/lenses/                   @parity-app/lenses: pure, tested in Vitest
  lens.ts      a lens as data: id, name, icon, order and shortcut, and why it's unavailable
  layout.ts    the layout as data: groups in the main window or their own, their tabs, focus
  decide.ts    show, open in a new tab, split, move to a window and back, close: dock operations
  state.ts     the lens in focus, the empty window, the lens bar's marks, the menus' enabled items
  saved.ts     a saved layout's schema, with lenses that are gone dropped, its splits and its windows' places

apps/desktop/src/renderer/lenses/  the shell, and the only place that imports Dockview
  LensWorkspace.tsx  dock-adapter.ts  LensBar.tsx  LensTab.tsx  GroupActions.tsx  dock.css
  shell.ts           what can be done with the lenses, which the title bar and a lens's views reach
  popout.ts          a lens window's theme, and whether a tab was let go outside its window
  registry.ts        each lens's icon, canvas, left panel and inspector
```

The package is built (PAR-1239), and so is the shell (PAR-1240), which the open project shows in (PAR-1243).
`dock-adapter.ts` is the one file that calls Dockview: it reads Dockview's state into the package's layout, makes the
operations the package returns, and tells the shell when a tab is let go outside its window. A lens is a `LensView`: the
package's data, an icon and its three views. The title bar's View menu and a lens's own views, such as the inspector's
links, act through `useLensWorkspace`. The exploration's story renders `LensWorkspace` with its test lenses, and a saved
layout's windows open in its main window, since it has no lens window page. The app renders it with `appLenses`, the
lenses that are built: Screens, today's canvas, Layers and inspector in `lenses/screens.tsx`, Pages in
`lenses/pages.tsx`, Components in `lenses/components.tsx`, and Stories in `lenses/stories.tsx`. Each lens's canvas is a
tldraw editor of its own (`lenses/project-canvas.tsx`), and the project holds the one in focus, which the panels, menus
and shortcuts act on. It passes the lens window page as `popoutUrl`, so lenses move to windows of their own (PAR-1247,
in [editor.md](../editor.md#lens-windows-par-1247-par-1242)).

**The lens registry is where the two meet.** A lens is its data from the package and three components: a canvas, a left
panel and an inspector. The exploration's lenses become test lenses for the same `LensWorkspace` the app renders, so its
story shows the real shell. Extensions can add lenses the same way later, as they add panel tabs and pages today.

The steps go in this order, each after the one before:

| Step                                                                     | Issue    |
| ------------------------------------------------------------------------ | -------- |
| One project per window, with Home when none is open (built)              | PAR-1241 |
| The decisions as data, with tests (built)                                | PAR-1239 |
| The shell in the app, behind a Dockview adapter and the registry (built) | PAR-1240 |
| The open project in the shell, with today's canvas as one lens (built)   | PAR-1243 |
| Pages as a lens of its own (built)                                       | PAR-1244 |
| Stories as a lens of its own (built)                                     | PAR-1246 |
| Screens holding only designs (built)                                     | PAR-1251 |
| Components as a lens of its own (built)                                  | PAR-1245 |
| Each project's layout saved and restored, its windows too (built)        | PAR-1248 |

Today's canvas has been tried in a lens's own window (PAR-1242, in [On Dockview](#on-dockview)), and lens windows are
built in the desktop app (PAR-1247), with the fixes the spike found. Each project's layout is saved with the window's
panel layout in `state.json` and restored as the project opens, its splits at their shares of the room and its lens
windows reopened where they were (PAR-1248, in [editor.md](../editor.md#each-projects-lens-layout-par-1248)). Data's
canvas, the ERD, comes with the Data lens's own work (PAR-40).

## On Dockview

The spike (PAR-1237) rebuilt the exploration's canvases and windows on Dockview 8.9 (`dockview-react`, MIT, no
dependencies beyond React). It replaced the hand-built layout model, drag and drop, drop targets and simulated monitors:
the exploration lost 750 lines and gained 470.

| What                                | Dockview                                                              |
| ----------------------------------- | --------------------------------------------------------------------- |
| Tabs, groups, splits, drop overlays | Built in, themed with CSS variables                                   |
| Tabs by keyboard                    | Tabs are `tab` elements, and arrow keys move between them             |
| Pop-out windows and docking back    | Built in (`addPopoutGroup`), free; copies the page's stylesheets over |
| Saving and restoring the layout     | Built in (`toJSON`, `fromJSON`)                                       |
| Keyboard docking, layout history    | Paid, in `dockview-enterprise`                                        |
| Size                                | About 94 KB gzipped, plus its stylesheet                              |

What we'd build on top, each found in the spike:

- **Opening a window where a tab is let go.** Dockview doesn't open one for a tab dropped outside the window; the
  exploration does it on the drag's end, about 20 lines.
- **Showing a lens in the tab in focus.** Dockview opens panels as new tabs; the exploration adds the lens beside the
  tab in focus and closes that tab's lens.
- **Menus and tooltips in a lens's own window.** They render into the main window's document, so a tooltip for a button
  in that window shows in the main one. Each window needs its own portal container for Base UI.
- **Shortcuts in a lens's own window.** Ctrl and a number pressed there does nothing; the app's shortcuts listen on the
  main window only.
- **The theme on a lens's own window.** Its page starts blank, so the app copies its root's classes over once the group
  is in.
- **Electron allowing the window.** The main window's `setWindowOpenHandler` denies every `window.open` today; it would
  allow the pop-out page and set the window's frame and title bar.
- **The real canvas in a lens's own window.** Tried in PAR-1242, below: tldraw follows it, and what breaks is Parity's.

PAR-1247 built each of these in the desktop app, as editor.md's Lens windows describes.

### Today's canvas in a lens's own window

PAR-1242 moved Screens and Pages, each with today's canvas, into a Dockview pop-out: a same-origin `window.open` child,
as the shell makes one. Each action was tried first in the main window, then in the lens's own window, in two places:

- **The desktop app,** driven over its DevTools port, with two changes kept out of the commit: the main window's
  `setWindowOpenHandler` allowing `lenses/popout/popout.html`, and `OpenProject` passing it to the shell as `popoutUrl`.
  Only the app draws Pages' routes live, in iframes.
- **Storybook,** in Parity/Explorations/Lenses/Canvas window, with Playwright driving Chrome. The built-in browser pane
  opens `window.open` in its own tab, so it can't show a lens window.

Dockview moves the group's elements into the new window rather than drawing them again. The React tree and the tldraw
editor carry on with the same camera and selection. tldraw 5.6 reads its container's document and window when it uses
them (`getContainerDocument`, `getOwnerWindow`), so it follows the canvas there and measures it again.

| In the lens's own window                                         | Result  | Why                                                                                                |
| ---------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Scrolling, Shift+wheel, Ctrl+wheel zoom, the zoom buttons        | Works   | tldraw listens on its container                                                                    |
| Resizing the window                                              | Works   | tldraw watches its container's size                                                                |
| Hovering, clicking and Shift-clicking layers, brushing           | Works   | tldraw and the overlays take pointer events on the canvas                                          |
| Picking a tool on the toolbar, dragging with Hand                | Works   | the toolbar's buttons and tldraw's own drag are on the canvas                                      |
| Double-clicking into a design and editing its text               | Works   | the text editor is in the window, and takes the focus and the typing                               |
| Interact: typing into a design's field                           | Works   | the field is in the window's document                                                              |
| Pages' live routes                                               | Works   | a press makes one live, and it scrolls and takes clicks                                            |
| The main window's Layers selecting what the lens window shows    | Works   | the selection is shared, and the lens window's camera moves to it                                  |
| Moving the tab back to the main window                           | Works   | the canvas goes back with its camera                                                               |
| Pages' iframes when the tab moves                                | Reloads | each move detaches every iframe and loads it again, so a live page loses its state, its scroll too |
| How designs look                                                 | Breaks  | frames' shadow roots lose their stylesheets; the app logs "Sharing constructed stylesheets…"       |
| Dragging a layer, a resize handle or a board's title             | Breaks  | the press lands; `followPress` in `canvas/gesture.ts` follows the pointer on the main window       |
| Drawing a frame with Frame, placing text with Text               | Breaks  | the same: the tool is picked, but the drag or click that makes one is followed on the main window  |
| Alt to measure between layers                                    | Breaks  | `CanvasOverlay` listens for Alt on the main window                                                 |
| Every shortcut in the keymap: tools, selection, edit, view, file | Breaks  | `useShortcuts`, `useAppShortcuts` and the shell's Ctrl+number listen on the main window            |
| Arrows, Tab and Esc                                              | Wrong   | with the app's listener out of reach, tldraw's own handling acts: arrows nudge the board itself    |
| The canvas's menu, the toolbar's menus, tooltips, Search actions | Breaks  | Base UI draws them in the main window's document, at the lens window's coordinates                 |

Each menu's items still act on the lens window's canvas when chosen, as Duplicate did from the canvas's menu, but they
show in the other window. Ctrl+K and the shortcuts list don't open from the lens window at all, since they're shortcuts.

The frames' stylesheets are `CSSStyleSheet`s the main window made, which only its own document can adopt. Pages' iframes
are created with the main window's `document` (`live-frames.ts`), and moving an iframe to another document reloads it.
`live-frames.ts` also listens for messages, presses, focus and blur on the main window. Going live still worked in the
lens window, but a press outside the live page there won't reach the listener that closes it.

Two things couldn't be tried by script. A real change of window focus mid-drag: DevTools can bring a window to the front
without taking focus from the other. And a file dropped on the canvas: a scripted drop doesn't reach `CanvasDrop` in the
main window either. `CanvasDrop` listens on the canvas area, which moves with the canvas, and gestures end on the main
window's blur, so a drag in the lens window won't end when that window loses focus.

What it would take, with the canvas in the main window's renderer:

- **Frames:** make each frame's stylesheets in the document it's drawn in, and make them again when it moves to another.
- **Shortcuts:** listen on each lens window as well as the main one. Dockview reports each window as it opens
  (`onDidAddPopoutGroup`), which `dock-adapter.ts` already uses for drags.
- **Gestures and Alt:** follow the pointer, keys and blur on the window the press came from (`event.view`), not on
  `window`. `gesture.ts`, `ResizeHandles`, `layer-drag.ts`, `CanvasOverlay` and the tools' drags share the fix.
- **Menus and tooltips:** give Base UI a portal container in each window, through a context the lens's window provides.
- **Pages' live frames:** create iframes in the document they're shown in, and keep a live page from being moved, or
  accept that it reloads when its tab changes window.
- **tldraw:** nothing beyond remounting the canvas in the window it moves to, if a listener left behind turns out to
  matter.

PAR-1247 made these fixes, and nothing tried in the lens window needed tldraw remounted. Pages' live frames are heard in
each window, and a live page still loads again when its tab changes window. Undo, which the spike didn't try, works
there with the shortcuts.

The other two routes cost more. A renderer of its own for each lens window would need the open project, its store and
its code kept in step between processes. Keeping canvases in the main window would leave lens windows for panels and
lists alone. So PAR-1247 can carry today's canvas in a child window, with the fixes above.

## Open questions

- **Asset tabs on Components too?** Components are drawn with the same icons, media and tokens as screens.
- **Two projects side by side,** to compare or copy between them: is a second Parity window on another project ever
  wanted, or is one project for the whole app the rule?
