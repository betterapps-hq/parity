# Decisions

Calls made while building Parity without stopping to ask. Each says what was decided and why. The ones marked **Open**
still need your call.

## Project files

- **One `.par` project file per project.** Designs, notes and modes live in it. The main document is the `.par` at the
  project root, else the first `.par` found, else a new `<package-name>.par`. Other `.par` files anywhere in the project
  still load, and new designs go to the main one.
- **Modes live inside the main `.par`.** They're written only once they differ from the defaults, so a fresh project's
  file stays small.
- **`.lib.par` describes a component library: its name, id, stylesheet, breakpoints, tokens and its own canvas.** You
  asked for the tokens and the canvas. Version 2 adds `tokens` and `canvas`, and version 1 files still load. It sits at
  a package's root, and any dependency with one loads as a library, with or without Parity's catalog.
- **A library's tokens are DTCG,** the Design Tokens Community Group's format and resolver (2025.10), so the tools that
  read DTCG read the same tokens. `tokens` is a path to a token file or a resolver, or either written inline. A
  resolver's themes become values per context, such as `default` and `dark`.
- **The Tokens panel shows what a `.lib.par` says about a token** under its name. A DTCG path matches a custom property
  by its whole path or without its first group: `color.primary` is `--color-primary` or `--primary`. Described tokens
  that match no custom property are listed as "Described only", because frames render from the stylesheet.
- **A library's own `.lib.par` opens on the canvas.** When the open project's root has one, its `canvas` holds designs
  as a `.par` does: the author arranges them, and Save writes them back into `canvas`, leaving the rest of the file as
  written. New designs go there when the project has no `.par` at its root. A `.lib.par` anywhere else describes another
  package and isn't opened.
- **A library's designs show in the projects that use it,** under the library's section in Components, placed as linked
  instances that follow the library or as detached copies. You chose this on 2026-10-28. Their components are named as
  the library's (`nova/Button`).
- **Open:** Buildkit's nova `tokens.json`, which isn't DTCG yet.
- **Saving is explicit, as in a document editor.** Edits stay unsaved until Save (Ctrl+S). The tab shows a dot (it turns
  into the close button on hover). The status bar only says when a save failed, and clicking that tries again: you asked
  to remove its "Saved" and "Unsaved changes", as the tab's dot already shows them. A file that's the same as what was
  saved is clean, however it got there: undoing back, or turning Show every state on and off again (PAR-164), since
  views are tidied as they're written, leaving out every-state off, no modes or variants beside, and the base state.
  Edit > Settings > Save automatically turns on saving each edit about 300ms after it's made, and is off by default.
- **Token edits are ordinary edits** (PAR-164): they undo and redo with the designs, and reach the project's stylesheet
  only on Save (or autosave), an agent's `SetTokens` included, in the same undo step as its designs. The token editor's
  button is Apply, with a line saying Save writes it to the stylesheet. Don't save writes nothing. A failed write names
  the token and the file in the save notice, the status bar and the Tokens panel, where its row is marked and a banner
  offers Try again; a stylesheet changed since it was read fails the same way.
- **Closing a tab or quitting with unsaved changes asks** Save, Don't save or Cancel, with Save focused so Enter does
  it. Quitting with several projects unsaved asks once, with Save all.
- **Changes from outside reload as one undoable step.** That covers agents, git and text editors. A file with unsaved
  changes here isn't overwritten: a notice offers "Load from disk" instead. The app ignores its own writes by
  remembering what it last wrote.
- **Save a copy** writes every design, note and the modes into one `.par` wherever you choose. It suggests the folder
  above the project, because a `.par` inside the project would load as more designs.
- **Open project file** opens the project a `.par` belongs to: the nearest folder above it with a `package.json`.

## Menus and preferences

- **The menus are drawn by the app, in the title bar.** That's the same on every system. On macOS the system menu keeps
  only the app, clipboard, window and developer commands for now. **On macOS, the menus will also be mirrored into the
  system menu bar,** which you chose on 2026-10-28, because Mac users look for commands there (PAR-150).
- **File, Edit, View, Object, Arrange and Help, named and filled as Figma's are** (your request, 2026-10-29, from the
  menu audit). My calls:
  - **Object** holds what acts on the selection: Insert, wrapping in a layout, making a component, going to the main
    component, detaching an instance, ordering and hiding. **Arrange** keeps aligning and distributing.
  - **Settings live in a dialog, Edit > Settings (Ctrl+,),** the design-app convention on Windows (Adobe, Affinity,
    Inkscape), replacing the Preferences submenu in File. It holds every preference; View keeps the toggles flipped
    while working (layout grid, snapping, performance stats).
  - **Export is two items in File,** the selected design or every design. The scale moved to Settings.
  - **Help** has Search actions (Ctrl+K or Ctrl+/, Figma's actions menu), Keyboard shortcuts (Ctrl+Shift+?, as in
    Figma), developer tools and About Parity.
  - **No Check for updates yet.** Parity has no releases, so there's nothing to check; About says so and shows the
    version, Electron and Chromium, with a button to copy them. Updating comes with packaging (PAR-9, PAR-160).
  - **Exit is in File on Windows and Linux only;** on a Mac, Quit is in the Parity menu, as every app's is.
- **Every shortcut is in one keymap,** `chrome/keymap.ts`. The menus, tooltips, the Keyboard shortcuts dialog and the
  key handlers all read it, so what's shown is what works, and a test fails if two commands share keys. Keys are written
  as on Windows, with spaces, and shown joined by `+` on Windows and Linux (`Ctrl+Shift+Z`, and `Ctrl+Plus` for zoom)
  and with the Mac's symbols on a Mac (`⇧⌘Z`). You found the spaced form unclear about whether a `+` was needed
  (2026-10-29). Menus keep shadcn's plain-text shortcuts, as Figma's and the system's menus do; tooltips, the toolbar
  and the Keyboard shortcuts dialog use keycaps (`Kbd`).
- **tldraw's own shortcuts are off.** Its tool keys (E, D, R, A, L, F, N, K) switched to drawing tools behind Parity's
  toolbar, Ctrl+/ flipped the canvas to light mode, and Ctrl+. and Ctrl+' turned on modes Parity doesn't use. Space to
  pan stays, as it isn't a shortcut, and the arrows nudge through the keymap (CAN-39).
- **The keys are Figma's** (checked against Figma's help and several cheat sheets on 2026-10-29), with these
  differences, my calls:
  - **I is Interact,** where Figma's is the eyedropper, which Parity doesn't have.
  - **/ inserts,** where Figma's starts cursor chat. Shift+I inserts too, as Figma's does.
  - **F2 renames as well as Ctrl+R,** as Windows apps do. Ctrl+Y redoes as well as Ctrl+Shift+Z.
  - **Ctrl+G, Ctrl+Alt+G and Shift+A all wrap in a layout,** Parity's one way to group, frame and add auto layout.
    Ctrl+Shift+G, Alt+Shift+A and Ctrl+Backspace unwrap.
  - **Bring forward moves a layer later in its layout,** which paints it in front, as CSS does, so it moves down the
    Layers list, which lists layers in their layout's order.
  - **Alt+1 and Alt+2 open Layers and Components,** Figma's Layers and Assets.
  - **Ctrl+Alt+K makes a component of a design or a layer:** a design selected on its own becomes a component (or a
    screen again), and a selected layer is extracted into a new component named after it, as Figma's is.
  - **N and Shift+N zoom to the next and previous design,** as Figma's do with frames, in the Layers panel's order
    (components, then screens), wrapping round (CAN-39).
  - **Paste over selection (Ctrl+Shift+V) and Paste to replace (Ctrl+Shift+R) are Figma's two,** after Paste in the Edit
    menu (CAN-39). Paste over keeps the selection: the copies go once, just after the last selected layer, beside a
    selected layout or component rather than inside it, at an absolutely placed layer's insets, and copied designs go at
    the selected designs' top-left, drawn on top. Paste to replace swaps each selected layer for its own copy. A paste
    that doesn't fit (layers over designs, designs over layers) says what to copy instead.
  - **Select inverse (Ctrl+Shift+A) selects what Select all would, minus the selection;** Select matching layers
    (Ctrl+Alt+A) selects, within the design, layers that are the same component, the same main component, or text with
    the same tag, and styled the same apart from place and size. Content doesn't count. With designs selected, it
    selects designs of the same kind (CAN-39).
  - Figma keys for things Parity doesn't do yet are Copy as PNG, find and lock (PAR-190 to PAR-192).
- **Enter, Tab and the arrows on a focused control are the control's** (found by the editor audit, 2026-10-29): a
  button, tab, Layers row or toggle presses, moves focus or moves within itself, so Tab moves through the inspector's
  fields instead of selecting the next layer. They act on the canvas when it, or nothing, has focus. A key the canvas
  handles is also kept from tldraw when it's released, as tldraw's select tool picks the next board on Tab's release.
- **Escape while the pointer is held cancels the drag,** of a layer or a design, rather than selecting the parent.
- **Electron's default menu is replaced.** It closed the window on Ctrl+W and reloaded it on Ctrl+R. Its developer menu
  registers no keys, so Ctrl+R is free for Rename; Ctrl+Shift+I opens developer tools through the keymap. Its keys never
  worked on Windows anyway, where the menu isn't shown.
- **The canvas area is its own stacking context,** so its floating toolbars and overlays stay below menus and dialogs
  instead of covering their close buttons.
- **The theme defaults to dark** (what the app looked like before), with light and system in Settings. It covers the
  app's chrome and canvas only; designs keep whatever theme their mode picks. The main process remembers it too, so the
  window opens in the right theme without a flash.
- **Export renders every state, in the design's main mode and the modes shown beside it,** at 2x by default (1x and 3x
  in Settings). Files are named after the design, plus the state and mode when there's more than one. It exports the
  designs as they are on the canvas, saved or not, and doesn't save them.
- **Recent projects:** the last 10 that opened successfully.
- **The canvas's right-click menu follows Figma's order** (PAR-168): Select layer, then copying and pasting, ordering,
  Wrap, Make component and Go to the main component, then Hide. Items that don't apply to what's selected are left out;
  items that apply but can't act right now are greyed. Lock joins it with PAR-192, and Open in editor and Copy as JSX
  with PAR-166. The empty canvas gets Paste here, Select all and Zoom to fit, a text note over a board gets the empty
  canvas's menu, and Interact gets none.
- **A right-click selects what a click would** (PAR-168), unless it lands inside the selection or on a selected layer's
  resize handle. The menu reads the selection and its target when the right button goes down, because tldraw selects the
  board on release.
- **Paste here ignores the selection** (PAR-168): designs and notes go at the pointer, and layers go into the deepest
  layout of the design under the pointer, in the slot there, or at the pointer in an absolutely placed one, in half
  steps of the spacing scale. It never pastes into a layout inside an instance. Select layer lists the design first,
  then every layer under the pointer, those inside instances included.

## Canvas

- **tldraw's licence key comes from the environment.** You said on 2026-10-29 that you mean to pay for a licence, and
  until then the notice shouldn't get in the way. `VITE_TLDRAW_LICENSE_KEY` in `apps/desktop/.env.local` is passed to
  tldraw (a free trial key works), and without it the "Get a license for production" notice shows as before. My call:
  the canvas is a layer of its own, so the notice stays on the canvas and the app's menus, popovers and dialogs open
  over it.
- **Hints are shadcn tooltips, never the system's.** My call, from your note that they didn't look like shadcn: every
  hint goes through `Hint` (`chrome/Hint.tsx`). A control's shows at once, as shadcn's do; a row's or a truncated name's
  waits half a second, so moving down a list doesn't flash one per row. Menu items get none, since a tooltip opens on
  focus and the arrow keys would open one per item. File > Open recent shows each project's folder under its name
  instead.
- **The status bar shows what Parity runs.** You chose on 2026-10-29 to list only the processes Parity runs or uses, and
  each task's latest run. A button lists each open project's build server and Storybook and the tasks running, with
  their state, time, address and Portless name, and stops, restarts or dismisses each. My calls: stopping asks first,
  and each kind has an icon and a hue at least 25° from the others, using the canvas's own colours for the build server
  and formatting.
- **Snapping is on by default.** Designs lock to each other's edges and centres within 8 screen pixels. Hold Ctrl to
  move freely, or turn it off under View.
- **A click inside a board selects what's under the pointer, as in Figma's top-level frames** (PAR-163, which replaced
  double-click drilling in first). A click selects the top-level layer, or, with a layer of that design selected, its
  sibling there. The board is selected by its title or background, and a click on a frame's background selects it too.
  Each double-click goes one level deeper than the selection, and edits text only on a selected text layer that's the
  deepest thing under the pointer. Ctrl-click selects the deepest layer, Enter selects the layers inside or edits a text
  layer, and hovering outlines what a click would select, in the frame under the pointer. A press drags what a click
  would select, so a board never moves by a frame's background, where Figma moves a selected frame dragged from inside
  it. Free text notes keep tldraw's click and double-click.
- **A box drawn from a frame's background selects the top-level layers it touches** (PAR-163), as Figma's and tldraw's
  do, live, drawn with tldraw's own box; Shift adds to the selection and Escape restores it. Ctrl doesn't make it go
  deeper yet. With several designs selected, Enter works in the one picked last.
- **Side panels have one row of tabs, Pen style.** The open tab shows its name and the rest show only their icons. The
  left panel's tabs are Layers, Components, Icons, Images and Tokens; the right's are Design, Modes and Accessibility.
  Each panel remembers its open tab.
- **A collapsed panel becomes a rail** of its tab icons, under the button that expands it. Clicking an icon opens the
  panel on that tab.
- **The status bar's counts are links.** Components opens the Components tab and tokens opens Tokens. It doesn't show
  the project's path.
- **Zoom goes from 1% to 800%,** past tldraw's 5%, so a project with dozens of screens fits in view at once. The steps
  are 1, 2.5, 5, 10, 25, 50, 100, 200, 400 and 800%.
- **View > Performance stats** shows frames per second, memory and CPU in the status bar, off by default. CPU is a share
  of all cores, and memory and CPU cover every process of the app: the windows, the offscreen renderer, the project
  service (with the project's Vite), the GPU and Electron's helpers. Clicking it shows the last minute's frame rate, the
  longest recent frame and each process. Storybook runs outside the app, so it isn't counted. Measuring runs only while
  the stats show. Memory is what each process uses on its own, as the system's own monitor counts it: the working set
  Electron reports also counts the pages the processes share, once for each, and read about 25% high. Electron doesn't
  give the private part, so each system is asked its own way (`main/private-memory.ts`): on Windows, the private working
  set of Task Manager's Memory column, from a PowerShell that calls `GetProcessMemoryInfo` (a fraction of a millisecond
  a process, where the performance counters take over a second) while the stats show and stops 15 seconds after; on
  Linux, anonymous resident memory from each process's `/proc/<pid>/status`, which stays readable for Chromium's
  sandboxed processes where `smaps` doesn't; on macOS, the footprint of Activity Monitor's Memory column, from `top` at
  most every two seconds. A process the system won't say about keeps its working set. `pnpm perf` reads memory the same
  way. The Linux and macOS readings are tested against those systems' output, but haven't run on them yet.
- **`pnpm perf` measures the canvas** in its own copy of the app on the example project, in a window that opens at
  1439×901 in the middle of the main screen, so every run draws the same area at the same pixel ratio (the page is held
  at that size only if the window can't open within a few pixels of it, so a maximized copy still lays out like a
  window). The copy keeps drawing while other windows cover it, and a run made while it was minimized is marked as not
  counting. Sizes are read from the DevTools protocol, since evaluated code reads a frame's viewport. It measures frames
  per second zooming, panning and hovering, where each frame's time goes, selecting and editing a design, memory, and
  what a hidden tab holds. Results go to `.inspect/perf`, and `--compare` sets a run beside an earlier one. The copy is
  kept apart from the person's app and other sessions: its own ports, profile, bundle folder (`out/<port>`) and agent
  file, so agents keep talking to the person's app; and it serves the code as it was when it started, so edits made
  meanwhile can't reload what's measured. Its window says it's the measuring copy.
- **Zoomed far out, frames show bitmaps.** Once a frame has stayed the same for a second, the offscreen renderer
  captures it at a quarter of its size, one frame at a time so agents' renders still get their turn. Wherever the canvas
  draws frames no larger than that (25% zoom on a 1x screen), each shows its bitmap, and its live frame stays mounted
  but skips drawing. The selected design stays live, as does everything while interacting. Until its bitmap is taken, a
  frame shows its skeleton: measured from the live frame once it has stayed the same for a second, its text as faded
  bars in the text's colour and its cards, fields, buttons and images as flat shapes, drawn as a few SVG paths per
  frame, and keeping the frame's measured height. A frame not measured yet stays live. Bitmaps and skeletons are kept in
  memory only, so a code change never shows a stale one. Below about 5%, boards and frames also drop their shadows.
- **The canvas doesn't restyle its elements while the camera moves.** tldraw's `--tl-zoom` changes only once zooming
  stops, titles and labels size themselves from the zoom directly, selection colours go through tldraw's theme rather
  than custom properties, and the layer the camera moves is composited, so panning and zooming move what's already drawn
  until the camera stops. Boards well out of view skip drawing their frames but keep their layout.
- **The app is named Parity, with Parity's icon, to every system.** The main process names itself Parity and keeps its
  settings where the package's name put them (`%APPDATA%\@parity\desktop` on Windows). Each system names and draws an
  app from its program rather than its windows, so `pnpm dev` runs a copy of Electron carrying Parity's name and icon
  (`scripts/parity-electron.ts`), made once for each Electron version and icon under `apps/desktop/node_modules/.cache`;
  if it can't be made, the app runs as Electron, with a warning. On Windows the copy is `Parity.exe`, its version
  information saying Parity and its icon resources replaced with `icon.ico`, its other files linked to Electron's; the
  edit voids the signature, so Windows would refuse it with Smart App Control on (it's off here). On macOS it's
  `Parity.app`, cloned from Electron's bundle, with its program renamed, its Info.plist naming Parity, its icon file
  drawn from `dock.png` and the bundle signed again ad hoc; Electron finds its helpers by its own name first, so they
  keep theirs. On Linux it's Electron's folder linked, with the program as `parity`, since Linux names a process by its
  file; the window's icon comes from the app. The macOS and Linux copies haven't run on those systems yet.
- **A selected design shows only its own rounded outline.** tldraw's square selection box is drawn only around several
  designs at once.
- **Copy and paste go through the system clipboard,** in a JSON envelope Parity recognises, so copies paste across
  projects and windows. Copied layers bring the state they were copied in with them, and pasting gives them new ids.
  Plain text pastes as a text layer, or as a note on the canvas when nothing is selected. Copy style and paste style
  stay inside the app. Pasted PNG, JPEG, GIF, WebP and SVG images up to 20 MB are saved to `public/images/`.
- **Several layers of one design, or several designs, can be selected together.** The inspector shows what they share
  and lists what differs, with a "Mixed" placeholder in each field that differs.
- **Dragging a layer** shows an outline under the pointer, and the layouts around it reflow live around a copy of it
  where it would land, with a line only where they can't. Moving within a design keeps ids and state overrides. Moving
  to another design takes the shown state with it and gives new ids. Absolutely placed layers move by their insets,
  rounded to half a spacing step.
- **Wrap in layout** is Ctrl+G, Ctrl+Alt+G or Shift+A and copies the parent's direction and gap; Ctrl+Shift+G unwraps.
- **Align and distribute use Figma's keys,** Alt with A, H or D across and W, V or S down, plus Alt+Shift+H or V to
  distribute. Inside auto layout, aligning across sets each layer's own alignment and aligning along sets the parent's
  justification. Designs on the canvas align by their bounds.
- **The layout grid** (Shift+G) has 4, 8 or 12 columns for frames under 600px, under 1024px and wider, with 16, 24 and
  32px margins and 16, 24 and 24px gutters. These are fixed until breakpoints or library metadata provide them.
- **The insert picker** (`/` or Shift+I) offers text, rows and columns, component designs, the project's and libraries'
  components, and icons once two letters are typed. It inserts where a paste would.
- **Interact (I) hands the pointer and keys to the designs,** so their real components work as in a browser: tabs
  switch, fields take typing, menus open. Clicks and keys stop at the design, so the canvas doesn't select, drag or run
  a shortcut too; scrolling still pans. Outlines and handles hide while interacting. An Escape the design doesn't use
  steps out of it, and the next one goes back to Move and select. When interacting stops, every frame starts again from
  the design, so nothing you tried is left on the canvas, and the project isn't changed by it.
- **Keys reach a design only in Interact** (CAN-54). Outside it, frames are inert: Tab, clicks and a component's own
  focus calls never reach a design's inputs or buttons, so the canvas's shortcuts keep working. Selecting, hovering and
  measuring use layout boxes, never hit testing, so inert frames don't affect them. In Interact, keys typed into a
  design are the design's, found through the event's composed path, because shadow DOM hands the canvas's listeners the
  frame instead of the field inside it.
- **The arrows nudge** (CAN-39). A layer in a layout moves one place along the direction its frame draws, stepping over
  absolutely placed siblings and ones the state hides; in a grid, Up and Down move a whole row when there's one to move
  to, and Shift still moves one place. An absolutely placed layer moves one spacing step, or ten with Shift, from where
  it's drawn, since 1px would leave the scale until PAR-194. Designs and notes move 1px, or 10. Each run of presses on
  one selection is one undo step.
- **Layers are found from React's tree, as React DevTools does** (CAN-45), so a component that renders none of its props
  can be hovered, selected, outlined and dragged. Component layers are marked by the guest's error boundary and the
  others by their element. It reads React 19's internals and falls back to the `data-canvas-node` attribute, which the
  guest still passes, when they're missing. The walk runs once after React commits a frame or its DOM changes, so
  hovering only measures boxes.
- **A layer's box is what it draws at its top level** (CAN-45): one element for most layers, each root of a fragment,
  and for a provider, the top-level elements of the layers inside it. A point belongs to the innermost layer. Undrawn
  (0×0) elements and elements clipped to nothing, such as a checkbox's hidden input, are left out unless every element
  is undrawn (PAR-163), content portaled out of the frame doesn't count, a slot drawn twice is one layer covering every
  copy, and a component that draws nothing has no box and is selected from Layers.
- **When a component's props have no `style`, the inspector says sizes and styles won't change it** and offers Wrap in
  layout (CAN-45). It's read from the props type, so it doesn't show for `any`, `object`, index signatures or type
  parameters.
- **Length fields are typed and shown in pixels and stored as spacing steps** (CAN-48), at the project's step size, so
  320 in Width is 320px (80 steps at 4px, 40 at MUI's 8px). Fields take px, rem (16px) and %, maths with `+ - * /` and
  brackets, and token names. A leading `+`, `*` or `/` works from the current value, while a leading `-` is a negative
  number, since insets can be negative. `%` is a share of the current value, as in Figma, except in Opacity, where it's
  the unit. When maths needs a value that isn't set, padding, gaps and insets count as 0, opacity as 100, and Width and
  Height as their measured size; limits, rows and max lines say there's no value to work from.
- **Until PAR-194, a typed length lands on the nearest half step** (2px on a 4px scale), which is what dragging writes
  and what Tailwind's scale lists below 4, and the field says so under its row. Values already off it show as they are
  until edited.
- **Up and Down move a length one spacing step, and Shift ten;** other numbers move by 1 and 10, and presses under a
  second apart are one undo step. Dragging a label scrubs one step per 2px, or ten with Shift, and Escape cancels; the
  row's label scrubs when the row has one field, otherwise each field's letter does.
- **A field keeps input it can't read,** marked, with the reason under its row, even after it loses focus. Enter keeps
  focus with the text selected, and Escape reverts and leaves. A value changing underneath doesn't touch what's being
  typed.
- **The canvas previews a field's edit as inline styles on the frames already drawn,** not through the store, so typing
  shows in about 25 ms and commits as one undo step. Number props don't preview yet (PAR-203).
- **The field parser is in `@parity/core`** until `@parity/editor` exists (PAR-7).
- **A dragged layer stays in its own layout while the pointer is over that layout** (CAN-47): it changes places with its
  neighbours and never drops into one of them, so cards and bars that are layouts themselves don't swallow the neighbour
  they pass. Putting a layer inside a neighbour is done in Layers for now (PAR-206). Targets are measured before the
  dragged layer is hidden. In a grid or wrapping row, the line under the pointer decides first, then the children's
  middles, and below the last line the layer goes last.
- **A resize starts only after 4px along the handle's own axes,** and an edge fills only once it has left the parent's
  inside and come back, so pressing a handle never changes the other axis (CAN-47). Absolutely placed layers resize by
  their insets and never fill: a token inset on the side that moves becomes a number of steps, since a token can't be
  offset, and the other sides keep theirs. The resize hint closes when a handle is pressed.
- **A duplicated design goes to the first free space to the right along its row,** 160px clear of every design and note,
  as do designs pasted into their own project (CAN-47). Bringing it into view when that's off screen is PAR-204.

## Main components and instances

Phase 1 of [components](proposals/components.md), as the New Editor Features session built it; its "Phase 1, as built"
section has the details. The user asked for "variants, instance overrides and the main-component workflow" and said to
"leave code generation for later". The rest are that session's calls.

- **Variants are params of type `variant`,** not `enum` as the proposal had it. Each option has an id, a name and
  patches like a state's, and an instance picks one through its args.
- **Patches apply in a fixed order:** responsive, then variant options, then the state, then the instance's overrides,
  then patches reaching in from outside, such as a screen's states with `instance/inner` keys.
- **Instance overrides live on the instance** as `overrides: { innerId: NodePatch }`, with `nested/inner` keys for
  nested instances.
- **An edit inside an instance changes only that copy** in the base state, and belongs to the state in any other state.
- **Editing a text, prop or visibility the component binds to a param sets the instance's param value** instead of
  adding an override.
- **A component's board shows one combination of variants,** picked in its title bar. With a non-default option showing,
  base-state edits go to that option.
- **A component's board shows each param's default,** as an instance with no args does (PAR-164, my call; it changes
  what main boards show, which showed the design's own values). So the Stat card's board shows only the trend icon its
  params select. Editing a bound text, prop or visibility on the board in the base state changes that default, which
  matches the Params section's "Defaults show on this board".
- **Edits that can't be per state or variant say so before they're made** (PAR-164): an image's file, alt text and fit,
  and an instance's state, Reset all, Swap and Detach. A tinted note styled like the "Editing Monthly changes the
  design" control reads, for example, "File, alt text and fit change the design in every state, not only Yearly", and
  shows only while edits would otherwise go to a state or variant.
- **Prop and param fields follow the declared type** (PAR-164), not the value's: a number param with no value takes a
  number, JSON that doesn't parse is refused with the reason rather than saved as text, and an empty field clears the
  value.
- **The variant grid shows each variant on its own, plus combinations someone pins.** You chose this on 2026-10-28 over
  every combination, which multiplies fast.
- **A component design in `.par` stays the source, linked to a real component file.** You set the direction on
  2026-10-28: "we need to link these to real components, and generate from the design, and intake changes from the
  code." You settled the details the same day:
  - **Drift shows on the design, and you approve each change.** In your words: "show an indicator on each design that is
    drifted from the code, then you would enter a menu where you could approve each change and write it back." That
    works both ways: design changes not yet in the file, and code changes not yet in the design, found by the hash of
    what Parity last wrote. Saving the `.par` doesn't write code. It's the same flow PR reviews will use.
  - **Hand edits come back where they fit.** Text, token classes, props and known components read back as changes to
    approve. Behaviour such as events and data comes in as props that developers wire from their own code. For an edit
    Parity can't read back, it asks whether to freeze the component as code or overwrite the edit.
  - **Existing components can be linked too.** You said: "our app should detect the components in the app. Whether
    that's via a scanner, ast, or storybook." Code Parity can't read shows as locked in the design.
  - **With Storybook in the project, each linked component gets a stories file,** plain CSF with one story per state,
    through the same review.
  - **The file goes in the project's own components folder,** `components.json`'s alias or wherever most components are,
    named like `member-row.tsx`, with no suffix.
  - **An instance override with no param behind it becomes one.** Parity adds the param to the main component, as an
    undoable design edit, so the override works in code. You asked: "Why not just do? This is part of the design
    process."
- **Layers inside an instance can't be moved, resized on the canvas or deleted.**
- **Swap keeps args, state and overrides that still match** by id or layer name. **Detach bakes everything into plain
  layers** with fresh ids, the root keeping the instance's id.

## Modes

- **Viewports carry a device**, used for its icon, **and a height** when they come from a device. Frames still grow with
  their content. **A device viewport can show its frames in a phone mockup,** which cuts them at the device's height, as
  you asked on 2026-10-28. It's an option on the viewport, off unless chosen, so designs show their full length by
  default.
- **Mode presets** come from three places: the project's breakpoint tokens, each library's `.lib.par` breakpoints, and a
  list of device sizes taken from Chrome DevTools' devices plus current flagships. A breakpoint starts at its width, so
  it's added as a viewport exactly that wide. Breakpoints in rem count 16px to the rem.

## Decorators

How frames get the providers, themes and locales a project's components need. The proposal is
[proposals/decorators.md](proposals/decorators.md).

- **Frames are wrapped in decorators that follow Storybook's decorator contract.** You decided this: existing apps
  should work as they are, and decorators must work without Storybook. A decorator takes the design to render and a
  context with `args`, `globals`, `parameters` and `loaded`, and returns what to render around it. A mode's values
  arrive as `globals`, so a decorator written for Storybook works in Parity unchanged, and the other way round.
- **A project without Storybook keeps its decorators in `.parity/preview.tsx`,** with the exports of Storybook's preview
  (`decorators`, `loaders`, `parameters` and `globalTypes`), so moving to Storybook later means moving the file. You
  chose this on 2026-10-28, with the proposal's other recommendations:
  - With both, Parity's file wins. You said to "reuse Storybook preview or it can be overridden with a .parity
    preview.tsx". With no Parity file, Storybook's preview is used as is. When the file exists it replaces Storybook's,
    and it can import `.storybook/preview` and spread its decorators to build on them.
  - What a decorator changes on `<html>` or `<body>` moves onto the frame's stand-in body. A frame that needs more
    renders in an iframe.
  - Parameters are set per design and per state, and saved in `.par`.
  - Parity offers to write the preview file from the providers the app's entry renders, and never writes it unasked.
- **How Parity and Storybook connect is written down in [storybook.md](storybook.md),** at your request, because you
  expect them to get too tightly coupled. It sets the boundary: Storybook stays optional, Parity reads only its public
  formats, and everything Storybook-specific sits in one adapter.

## Finding components

How Parity finds the components in a project. The proposal is
[proposals/component-detection.md](proposals/component-detection.md). You said to build it on 2026-10-28, with the
recommended answer to each of its questions.

- **A quick parse of every app file lists components first, and TypeScript's checker then confirms them** and adds what
  the parse can't see, such as `const Select = SelectPrimitive.Root`.
- **A component's id is its export name, gaining folders only on a clash,** as few as it takes to tell it apart, as in
  `(portal)/ErrorPage` and `app/ErrorPage`. A component in the UI kit folder, the one `components.json` names or else
  `src/components/ui`, keeps the bare name even then, because that folder was all Parity read before, so existing
  designs keep working: copacker's other `FieldError` becomes `components/FieldError`. A default export takes its
  declaration's name, else its file's.
- **Libraries are listed when they have a `.lib.par` or are in Parity's registry, plus workspace packages the app
  depends on.** Other dependencies, such as Radix or Base UI, show through the project's own wrappers.
- **Pages get their own section in the Components panel** until the routes lens can name them.
- **The UI kit loads with the canvas, and the rest of the app loads as it's drawn.** My call, made while building it:
  loading copacker's 275 other modules at once took 14 seconds before anything drew. On demand, its canvas is ready in
  about a second, and a page arrives in under half a second the first time it's placed.
- **Exports only the type checker can decide wait for it,** such as an alias or a component that only returns
  `children`. In the UI kit, every capitalised export is still listed from the start, as before, until the checker drops
  the ones that aren't components. My call, so nothing the UI kit showed before goes missing while it runs.
- **Some folders are never read for components:** installed packages, build output, `__tests__`, `__mocks__`, `e2e`,
  `tmp` and `temp`, and also stories, tests, generated files and the entry file that mounts the app. My call: copacker's
  tsconfig includes a `tmp` folder of experiments that would have added 2,500 components.
- **A workspace package is read from source, and only for exports the parse confirms.** My call: when its package.json
  points at built output, as published packages do (`dist/index.js`), Parity reads `src/index` beside it, since the
  app's dev server compiles the package's source too. Exports only the type checker could decide are left out, so a
  package of hooks and helpers adds no section. Its section's id is its name without the scope (`@acme/ui` is `ui`).
- **The Components panel lists the project's own components in three sections:** the UI kit under its files, the rest of
  the app under its folders (less the folders they all share, such as `src`), and pages under their routes. The UI kit
  opens with the panel and the other two start closed beside other sections. My call: the UI kit is what loads with the
  canvas, so the three follow how the app's components are found and loaded.
- **A page is told by its router's file names until the routes lens can name it.** My call: Next.js's route files under
  `app/` (`page`, `layout`, `template`, `error`, `not-found`, `loading`, `default`), and any component in a file in a
  `pages` or `routes` folder, other than files starting with `_` or `-` and `api` routes. Route modules' other exports,
  such as React Router's `ErrorBoundary`, are parts of the page too.
- **A re-exported component is listed where it's declared, and imported through the app's alias.** My call: the file
  that declares it is what the canvas loads, so an index re-exporting it adds nothing, even under another name. The
  import shown to people and agents is the file through the tsconfig alias reaching furthest into it
  (`@/components/ui/button`), not an index, since shadcn-style apps import each file.
- **The type checker keeps one program per open project, within a memory budget.** My call on the numbers: props and the
  checker share the program, which is kept for the two projects used last and let go when a tab closes; the worker stops
  when no project is open. It isn't built with under 1 GB of memory free, and the worker may use half the computer's
  memory at most. Either way the components stay as the parse found them.
- **The type checker stops five minutes after its last answer,** and the next request starts it again (CAN-84). My call
  on the delay, from the memory audit: after an open's props and check, only a change to the app's files asks the worker
  anything, yet it held its programs for as long as the project was open, 118 MB of heap on the example project (the
  service fell from 279 to 134 MB when it stopped) and 1.26 GB on Copacker. Starting again costs the next rescan about a
  second on the example (props in 2.6 to 3.7 s against 1.5 to 2 s warm), and likely the 9 s an open's props take on
  Copacker, so the delay is long enough that someone editing the app's code, saving every minute or two, keeps a warm
  program, and short enough that one who has gone back to the canvas gets the memory back soon after. A project's first
  request to a new worker carries the files the last one's program had read, so it builds the same program and finds the
  same components; a request made while the old one is stopping goes to the new one, and the worker never stops with a
  request waiting (`utility/worker-client.ts`).
- **What the checker and props found is saved outside the project, by contents.** My call: in
  `~/.parity/cache/detection`, one file per project, under a fingerprint of every file they read, the tsconfigs,
  package.json, the lockfile, the list as discovered and Parity's own checker code. Results aren't saved when files
  changed while the checker read them.
- **Changed files are read again on their own, without reopening the project.** My call: the parse reads the changed
  files about half a second after the last change, so added, renamed and deleted components show at once, and the type
  checker then reads only those files and the files that import them, since an export's type can come from an import. A
  component that moves keeps its id while its name is unique, and the canvas draws it from its new file.
- **A workspace package is imported by its name and isn't pre-bundled.** My call: the app imports it that way, so the
  canvas gets what the app gets, and Vite compiles it as the app's own code. A package that doesn't build costs only its
  own components, as a project module does.
- **Why something is or isn't a component is shown where people look for it.** My call: each component's tooltip in the
  Components panel says what it was recognised as ("made with forwardRef"), and a search that matches exports the type
  checker left out lists them under Not listed with its reason ("takes 2 arguments, not one props object"). Agents get
  the same list from `parity components`. Only capitalised exports are listed, as lowercase helpers and types aren't
  candidates.
- **Corrections name an export by its file and export name, and live in the main project file.** My call: `detection`
  holds `include` and `exclude` lists of `{ path, export }`, so a correction outlasts ids changing on a clash. A
  correction is an ordinary, undoable change to the file, saved when the file is, and the list follows it straight away.
  Doing the opposite of a correction removes it rather than adding another, so detection decides again, and the field
  goes once it's empty. Only the project's own components can be corrected; a library's list is its `.lib.par`'s.
- **A component's render status is how it fares on the canvas now.** My call: it fails while any frame shows its error,
  and otherwise draws once it has drawn somewhere, so fixing it or removing the design clears the warning. The status
  comes from each component's error boundary in the guest, and a component loaded on demand only counts as drawn once
  its module has loaded. The panel shows failures only, as a warning beside the name; the reason is read from the error:
  a missing provider, server code, an async server component, or else the error itself.
- **`.ts` files are read for components too, and config files aren't.** My call: a `.ts` file can't hold JSX, so the
  parse leaves its capitalised functions and aliases to the type checker, which reads them with the rest. Files named
  `*.config.*`, such as `vite.config.ts` and `eslint.config.js`, are skipped with stories and tests, as they only export
  settings.
- **A framework's component finding is a `ComponentFinder` in `@parity/code`.** My call: the renderer adapter keeps the
  quick parse it already has, and the finder adds the thorough pass and props, each taking the project's one program,
  since every framework Parity expects (React, Vue through vue-component-meta, Svelte) reads types with TypeScript. The
  props worker calls React's through the contract. `findAll` runs all three passes in one call and returns each
  component's id, file, export, import, role, evidence and props, for callers without the app's service.

## Libraries, icons and images

- **Library components are namespaced by library,** as in `nova/Button`, so they never clash with the project's own.
  Their styles are imported right after Tailwind in the project's stylesheet, so the project's own tokens, declared
  later, still win.
- **Adding a library installs it with the project's package manager,** picked from the nearest lockfile, then reopens
  the tab.
- **Installed packages are found the way Node finds them,** in `node_modules` in the project or a folder above, not by
  resolving `<package>/package.json`. Packages whose `exports` leave that path out, such as Buildkit's nova, were
  otherwise never found.
- **The Components panel opens library sections** and collapses the project's own when there are several; any section
  collapses or expands on a click. Searching opens every section that matches.
- **Icons are components from the project's own icon package,** as in `lucide/Heart`, so generated code is the import a
  developer would write. The guest imports the whole package once. The Icons panel and the insert picker list the names
  from the project's own copy, as its manifest says to read them, and draw each icon with the project's own code. Agents
  are told the icon libraries too, so `lucide/Heart` isn't flagged as a component the project doesn't have.
- **A manifest names an icon set's shape,** because sets differ: one export per icon (Lucide, Heroicons, Phosphor,
  Tabler, Fluent), or data drawn by one component (Hugeicons, through `HugeiconsIcon`'s `icon` prop). Styles and sizes
  are either a prop (Phosphor's `weight`) or part of the name (`AddFilled`, `Add24Regular`), described by a pattern with
  `name`, `style` and `size` groups, so the panel shows one icon per name with a style picker and leaves sized copies
  out.
- **Icon sets are added from the Icons tab,** with the same picker the Components tab has, listing the registry's icon
  sets whatever the project already has. The tab opens on a set just added, and its set picker switches between them.
- **An icon set's tags are read from what the set publishes, never typed in.** My call: `parity lib` reads them into the
  set's `.lib.par` (`icons.tags`, by the icon's label, with `icons.tagSource` saying where from) from the set's own npm
  package or the companion one released with it, at the same version or else the newest before it, matching keys to
  every name each icon is exported under. Each icon's tags go on one line, so a set of thousands stays readable.
  Regenerating a set's file is all it takes to update them.
- **Tags come only from metadata published with a version, read by one reader for every set.** The user's call
  (2026-10-29): updating a library must take no manual work and give the same file each time, and Parity has to scale to
  hundreds of libraries without code for any one. A set's preset only says where its metadata is (a file in an npm
  package, or files in the repository and commit npm records for the version), and `iconWords` works out the shape: the
  table that names the most icons, wherever it sits, and from each icon its lists of words and the fields that sort
  icons into groups, leaving out fields that barely vary, constants, words most icons share and markers such as `*new*`.
  A set that publishes no versioned metadata is searched by its names and the other names it exports. So Heroicons,
  whose keywords are only in heroicons.com's scripts, and Hugeicons, whose tags are only on its web API, are searched by
  name: neither source has a version, so the same release could read differently from one day to the next.
- **Digits before an icon's style are a size only where the icon also comes without one (LIB-46).** My call, in
  `iconVariants` in `@parity/core`, which the Icons panel and `parity lib` share: a number is a size when it's one of
  the set's sizes and the name before it is an icon the set exports unsized, in any style (`CalendarDay32Color` is
  CalendarDay at 32). Otherwise it's part of the name, so Fluent's Battery0 to Battery10, TextHeader1 and Wifi1 list. An
  icon a set ships only at fixed sizes (`CodeCs16Regular`) is listed once per style, at the size nearest the set's
  default. Fluent lists 2,992 icons, up from 2,902.
- **An icon exported under several names inserts the one its types prefer (LIB-47).** My call: `parity lib` reads the
  set's declaration files and records in `icons.prefer` the names to insert where it isn't the shortest, which is used
  otherwise. A name not marked `@deprecated` comes first (Phosphor's `GearIcon`, not `Gear`), then the name an icon is
  declared under rather than an alias (Lucide's `TriangleAlert`, not `AlertTriangle`; Tabler's `IconBrandKakaoTalk`, not
  the misspelled `IconBrandKakoTalk`). The panel shows the inserted name without an `Icon` its other names don't have,
  so Phosphor's icons still read as Gear.
- **A style kept in a module of its own is found from the package's entry points (LIB-32).** My call: `parity lib` loads
  each path the package's `exports` lists, and one that exports at least half the set's icons and draws them differently
  from its default module is a style, named by its path (`16/solid` is 16 Solid) and recorded in
  `icons.variants.modules`. Entry points that draw the same icons the same way (Phosphor's `ssr`, Lucide's `icons`) are
  other ways in, and ones that don't load as a module (Fluent's `fonts`) or export few icons are left out, so of the six
  sets only Heroicons has such styles: 24 Outline, its default, 24 Solid, 20 Solid and 16 Solid. An icon in the default
  style stays `heroicons/CogIcon`; in another it names the module between the set and the icon, as its import does
  (`heroicons/16/solid/CogIcon`), and the guest imports each style's module.
- **Icon search is Parity's own ranking, not Fuse.js or MiniSearch.** My call, from a benchmark of 50 queries people
  type ("gear", "close", "down arrow", "calender") over Lucide with its tags, checked against 50 more it wasn't tuned
  on. Parity's search put the icon meant first for 39 of the held-out 50 and in the first row for all 50, in about 5 ms;
  Fuse.js managed 35 and 42 in about 30 ms, which grows with the 5,000 and more icons Tabler and Hugeicons have;
  MiniSearch was quick but managed 23 and 42; matching the name's letters, as before, managed 19 and 29. Each word of a
  query finds an icon in any order, by a word of its name, its other names (Lucide's older `AlertTriangle`) or its tags,
  whole or by its start. A name's first word counts most, as it says what the icon is; a set's first tags count a little
  more than its last; plainer names come first among equals. Small typos are forgiven, and icons only some words find
  are added, only when the search finds less than a row. It lives in `@parity/icons`, which the Icons panel and the
  insert picker both use.
- **`.lib.par` version 3 describes a library whole,** so Parity needs no code per library: the package and version it
  was generated from with the range it covers (`package`), its components and what each was found as (`components`), its
  icons (`icons`) and its decorators (`decorators`), beside version 2's styles, breakpoints, tokens and canvas. Versions
  1 and 2 keep loading, and their fields stay as they were.
- **Parity keeps a registry of `.lib.par` files** (`@parity/registry`) for libraries that don't ship one: nova, Radix,
  Base UI, React Aria Components, MUI, Chakra, Mantine and Fluent UI, and Lucide, Hugeicons, Heroicons, Phosphor, Tabler
  and Fluent icons. A package's own `.lib.par` comes first; otherwise the registry file whose range covers the installed
  version, the newest generated first. The catalog the app installs from is the registry. Each file covers the newest
  major only, so MUI 7 and Mantine 8, inside the cutoff, have none yet; Lucide's covers 0.400 and later too, since its
  icons are listed from the project's copy.
- **`parity lib` writes `.lib.par` files** for a package, an icon set or an app. Components are what the TypeScript
  checker says renders, as `proposals/component-detection.md` describes, with anything it can't decide reported rather
  than guessed. Tokens come from wherever the library keeps them: CSS custom properties, Tailwind `@theme`, DTCG files,
  or a JavaScript theme (MUI, Chakra, Fluent). Decorators come from a preset per known library, since no package says
  which providers it needs. An app's file is written at its root, keeping its designs.
- **`parity lib` installs a library on its own to describe it, so no project has to have it.** The user's call
  (2026-10-29), so updating hundreds of libraries takes no projects set up by hand. Naming a version or tag
  (`lucide-react@1.63.0`, `@latest`), or writing into the registry without `--root`, installs that version with npm
  under `~/.parity/cache/packages`, once per version, with its peers and without install scripts. A React package also
  gets React DOM at its React's version and React's types, as an app that uses it would have them. Regenerating a
  registry file reads the version it covers, and a file keeps its range while that covers the version, so a range
  widened by hand survives. Every icon set's file and Radix's came out the same as from the fixture projects.
- **Every Buildkit Base UI style gets a registry file,** at your request: luma, lyra, maia, mira, nova, rhea, sera and
  vega. They share one set of hand edits (`buildkit-baseui.edits.json` in the registry), since only their styles differ,
  and the Radix styles still aren't published.
- **Parts are placed inside their parents,** from the library's own examples (below), then three signals: namespace
  exports (`Accordion.Item`), the "must be used within" error a part throws alone, and shared name prefixes
  (`AccordionItem` under `Accordion`), or a plural (`Tab` under `Tabs`). Each part records which signal placed it,
  `example`, or `edit` for a hand edit. A part's missing context is the nearest one, so a parent an error names goes
  innermost, with its own parents outside. Inserting a part from the panel wraps it in the parents that aren't around
  the drop target already, and a family's root comes with its sample parts in it.
- **A library's own examples are the strongest signal after a hand edit (LIB-34),** so a library that releases often
  needs few edits. `parity lib` fetches the library's repository at the commit the installed version was published from,
  found in this order: the revision a kit records upstream (`upstream.json`), npm's `gitHead`, a version tag, then the
  last commit before npm's publish date. It checks out only the stories, demos and examples (a shallow, blob-filtered
  fetch and a sparse checkout, about 7 seconds for shadcn), cached under `~/.parity/cache/examples` per commit and
  folders (MUI's demos have no telling names, so its preset names a folder where every JSX file counts). The TypeScript
  compiler reads their JSX: every library ancestor of each use, and its fullest use as a sample. Most uses must be
  inside something; the chain is every ancestor at least half of those have, at any depth, in the order they're usually
  nested, rather than one level at a time (LIB-35). A part that draws alone takes only its own family's (examples put
  everything in forms and cards), and while a part still fails, the top level's own examples are added, for examples
  split across a demo's components. JSX passed in a prop isn't placed in that element. Every chain and sample is still
  tried: one that doesn't render is grown from the errors, the errors alone are tried if that fails, and other families'
  parents a part renders without are dropped. `--no-examples` skips it, and the registry's presets name each library's
  repository and folders.
- **A level some examples leave out is optional (LIB-35):** one fewer than nine in ten uses have (`DropdownMenuGroup`)
  that the part still renders without is in `optionalParents`. Inserting a part brings an optional level only when a
  parent outside it is missing too, so a `DropdownMenuItem` dropped into a `DropdownMenuContent` comes alone, and one
  dropped on an empty frame comes in the whole structure the examples show. A level every example has stays required
  even if the server render passes without it, which is how a popup's Content got left out before.
- **Samples take the values an example's file gives (LIB-35):** names it declares (`config={chartConfig}`), the first
  value of `useState`, and the items of a list it maps into elements, with each item's fields filled in; anything
  computed is left out. Values stay small (eight items, 2,000 characters). Example props a part needed are used when
  trying the parts inside it, as inserting gives parents their sample's props; props it renders without are taken away
  from its sample if a part inside it then fails.
- **Parts only a decorator's host renders aren't for placing (LIB-35):** `parity lib` follows the package's own built
  files from each function to what it renders (`jsx()`, `createElement()` and JSX), and a part drawn only inside a host
  a decorator adds (`Toaster` mapping its toasts into `Toast` and `ToastTitle`), and in no example, is marked
  `visual: false`. Buildkit's shared hand edits went from 30 (LIB-28) to 13 (LIB-34) to 3 (LIB-35) to 1 (LIB-36):
  ChartStyle's sample, which ChartContainer passes itself and no example shows.
- **A part no example places takes its parents from the package's source, last (LIB-36):** the same reading of its built
  files says which of its components render it, and that one's chain is tried after the errors' (`SelectContent` for
  `SelectScrollUpButton`). Not before them: a kit's Content often renders its own Portal and Overlay, which go in the
  Root.
- **Render functions are samples (LIB-36).** A sample's child or prop value can be `{ "$render": [...] }`, a function
  returning those children, with `spread` when what it's called with is spread onto the element
  (`renderInput={(params) => <TextField {...params} />}`) or `pass` naming the props that take it
  (`{(segment) => <DateSegment segment={segment} />}`). Examples' arrow functions that return JSX are read into them. In
  a design they're slots, `$render:<prop>` (or `$renderWith:` to spread, with `?pass=a,b`), whose nodes the canvas turns
  into the function the component calls, so they stay editable like any other nodes. A part inserted into a parent whose
  examples call their children goes into that render slot.
- **Example shares are counted per file and per use (LIB-36):** a level counts when either clears the bar, with the
  larger share, so one long demo can't outvote ten short ones and a level most uses show isn't lost. A chain that still
  fails is retried with levels a third, then a fifth, of the examples show, and a named parent's rarer levels are tried
  when growing from errors (`Slider.Control` above a `Slider.Thumb`).
- **The docs' anatomy checks every chain (LIB-36).** Presets name the folders of a library's docs pages; the code blocks
  under their Anatomy or Usage headings are read as JSX, and `parity lib` reports how many parts the docs nest are
  placed as they show (the nearest parent, and every parent the chain needs) and how many have every level, listing
  those that differ. It's a check, not a signal, so it stays an independent measure; it reads Base UI's, Chakra's and
  shadcn's docs (Radix's and Mantine's aren't in their repositories, MUI's and React Aria's have no anatomy blocks).
  Portals don't count either way, as chains leave them out (below).
- **Internal parts (LIB-37):** a part the package renders inside another of its components, that no example or docs page
  places, is `internal: true` (`ChartStyle`, a Select's scroll buttons, a kit's Overlay and Portal). It can still be
  placed, and the Components panel lists it under "Internal parts" at the end of its library. A part that still fails is
  tried with the props its owner passes when it renders it: the owner's own props (`config`) take the owner's sample,
  literals stay, and worked-out values use the part's own sample. Buildkit now needs no hand edits, though the shared
  file stays for the next one.
- **Portals are left out of chains when the part renders without them (LIB-37):** they only move content out of the
  frame, and Radix's throws in one ("getComputedStyle ... not of type Element") while passing on the server, where
  portals don't run. Examples put them in every menu, so before this Radix rendered 108 of 118 in the app; after, 117.
- **Elements as a prop's value are samples (LIB-37):** `{ "$element": [...] }`, read from examples' JSX in props
  (`control={<Checkbox />}`), and inserted as a slot of that prop's name, which the canvas already passes as the prop.
- **Components declared but missing when they run are left out (LIB-37):** MUI's types declare `BadgeRoot`, `ModalRoot`
  and others its build doesn't export; they're `visual: false`, and the report names them.
- **Parts every example draws from a hook's list are found, not hidden (LIB-38, changed by LIB-39):** when each use of a
  part sits inside `list.map(...)` over what a library hook returns (`const { toasts } = Toast.useToastManager()`),
  following an example's own component the list is mapped into, the part is flagged and the report names it. LIB-38
  first made those parts `visual: false`; your call reversed that, so the flag now only says which parts need sample
  data. Hooks that hold the example's own values (`useState`, `useMemo`, `useReducer`, `useRef`, `useControllable*`)
  don't count.
- **Toasts stay placeable, with a sample toast (LIB-39, your call, 2026-10-29).** Toasts are visible and people design
  them. Inside the mapping callback, and in the example's own component it maps into, the list item is bound to the
  fullest object the file hands the hook's or factory's result (`toastManager.add({ title, description })`, with
  `Toast.createToastManager()` counting as well), plus an `id` when the callback keys by one. So Base UI's Toast.Root,
  Positioner and the rest take `toast={{ id, title, description }}` as their sample, and Title and Description show its
  text through Root. All eight render on the server and in the app.
- **A decorator's hosted toast parts follow (LIB-39):** Buildkit's `Toaster` maps its list into `Toast` and the parts
  inside it, and no example places them. Reading the package's source now records when a render passes a list item
  (`toast: toastItem`), what it puts inside (`ToastContent` holding Title, Description, Action and Close, through the
  HTML in between), and the values the package makes with a factory and exports (`toast`). The item is the fullest
  object the examples hand one of those values (`toast.add({ title: "Event created", ... })`). A part drawn that way
  renders with it, adding the parent its error names once it has one (`ToastProvider`, since frames aren't inside the
  Toaster), and its sample is the item with the package's own nesting. So `Toast`, `ToastContent`, `ToastTitle`,
  `ToastDescription`, `ToastAction` and `ToastClose` are placeable again in all eight styles. `ToastProvider`,
  `ToastPortal` and `ToastViewport` stay hidden: they're the host's, not the toast's.
- **Templates are values when every part is known:** `` `${kind} saved` `` is read when the file says what `kind` is;
  one with an unknown part is left out rather than guessed.
- **Mapped lists bind their first item (LIB-43):** wherever an example maps a list it spells out, the parts drawn for
  each item get its first item, not only for hook lists. A list read from what a library factory or hook was given
  counts (`createListCollection({ items })`, `useListCollection({ initialItems })`, `initialItems` being what `items`
  starts as), including names destructured from the call. Only lists are read this way: a prop given the collection
  itself is still left out, as its options aren't the collection. Chakra's Select, Combobox and Listbox items now sample
  `item={{ label, value }}`, and Chakra renders 444 of 473 on the server, up from 433.
- **Spreads are read when the file spells them out (LIB-43):** `{...buttonProps}` on an element, `{ ...base, size }` and
  `[...sizes, "lg"]`, later fields overriding earlier ones.
- **A preset's example folder that holds nothing is reported (LIB-43):** it has usually moved upstream. Radix's
  `packages/react/` was one; it's gone from the preset.
- **Errors don't put a part inside a drawn part (LIB-43):** a toast renders with its sample item, so an error chain
  could place anything in it (ToastViewport landed inside Toast). A chain through a drawn part is kept only for what the
  package puts inside it; ToastViewport is back under Toaster, and the Toaster's sample holds it again.
- **An anchored toast's Positioner renders unanchored:** Base UI's anchored demo anchors to a button's ref, which a
  sample can't hold, so the Positioner sits at the frame's corner. Accepted rather than faked.
- **An example's own wrapper of a part is the part (LIB-48):** a demo component that returns one of the library's parts
  and nothing else (`const CustomTab = (props) => <Tab {...props} />`) places that part wherever the demo places the
  wrapper, so React Aria's `Tab` is found inside `TabList` in `Tabs`. One that hands its props on is sampled where it's
  used; one that doesn't (`<Item title="Docs">`) is sampled from its own element, with the children it's given when that
  element has none. The wrapper's own element isn't counted as a use of its own.
- **Families take in what the examples only place inside them (LIB-48):** a plural is its singular's family (`Tabs` with
  `Tab`), and a part the examples nearly always place, directly inside one family, joins it for samples (React Aria's
  `Row`, `Cell` and `Column` join `Table`), so a table's sample keeps its header and rows. Not when the part's own
  family is usually around it too (Chakra's `Toggle.Indicator` in a `Button` in `Toggle.Root`), and never into a layout
  box that holds more than eight families (`Group`, `Stack`, `Dialog`). Pruning a chain uses the same families, so a row
  keeps the `TableBody` it's in.
- **A collection's placeholder isn't drawing (LIB-48):** React Aria renders a collection's parts outside one as bare
  placeholders for the collection to read (`<item>`, `<tablebody>`), without throwing, so `Row` and `NavigationTreeItem`
  looked like they drew alone and got no parents. Markup that starts with one now counts as failing.
- **A prop only one use sets is left out of a sample (LIB-48):** a part's sample props are its defaults wherever it's
  drawn, including inside other parts' samples, so React Aria's one `Cell colSpan={2}` made every cell in a table's
  sample span two columns. For a part with five or more uses, a prop fewer than two, or under a quarter, of its uses set
  is kept aside and added back only when the part can't draw without it (MUI's `Slide` and its `in`).
- **A sample's spelled-out children are inserted as written (LIB-48):** a child a sample gives props or children (a
  table's cells, a tag group's tags) no longer takes its own part's sample props as defaults. Only a bare child does
  (`{ component: "Cell" }`), and the parts a family's root is given carry their samples' props themselves. Every Tag in
  React Aria's TagGroup took Tag's `id: "Annual"`, so the browser threw on duplicate keys, and each Cell took a
  `colSpan`. A child the example filled with something a sample can't show (the demo's own checkbox) is kept as written
  with empty children, so it isn't bare either. The generator builds samples the same way, so what it accepts is what
  the app inserts.
- **A part can need its parents' other parts (LIB-48):** a table's row renders only with the header beside the body it's
  in. When the examples' chain fails alone but renders inside the outermost parent's whole example, each level in place
  of the first like it there and the part in place of the first like it at the bottom, the part is marked `parentParts`.
  Inserting it alone does the same with that parent's sample, so a cell lands in the table's first row beside the row's
  other cells and under the table's header; React Aria checks in the browser that every row has as many cells as there
  are columns. The chain is accepted only where the part adds markup, since a closed menu or popover renders nothing on
  the server and would seem to hold anything. It's tried before the chain is grown upward, with and without the levels
  fewer than nine in ten examples show (a `Virtualizer` half of them wrap tables in).
- **A name's guess gives way to the examples and the collection (LIB-48):** a part the examples mostly use with nothing
  of the library's around it gets no parent from its name (Chakra's `InputGroup` isn't put inside `Input`), and a prefix
  that's a collection's item yields to the collection (React Aria's `TabPanels` goes in `Tabs`, not `Tab`).
- **Failing parts are tried again once every parent has its sample (LIB-48):** parts are tried in name order, so
  Chakra's `Combobox.Indicator` failed before `Combobox.Item` took its example `item`. Chakra now renders 446 of 473.
- **What's left needs values the app makes at runtime:** Chakra's TreeView parts render inside `TreeView.NodeProvider`
  given a plain `node` and `indexPath`, but the examples only pass the node a tree collection hands its render function.
  Its toasts need a `createToaster()` toaster, its FileUpload items `File`s, its date cells date objects; React Aria's
  toasts need a `ToastQueue`. Sample props are JSON, and only decorators can hold `$call` values, so these stay failing
  until samples can hold made values or a hand edit gives them.
- **Samples hold values the package makes (LIB-49, your call, 2026-10-29):** a prop an example gives the result of one
  of the package's own functions, imported by name from the package or a subpath of it, is
  `{ "$call": { "import", "export" }, "args": [...] }`, with the arguments the file spells out
  (`collection={createTreeCollection({ rootNode })}`). A function among the options is left out, so the package's
  default is used, and a hook isn't one, since it only runs inside a component. `parity lib` calls each once before
  trying parts and gives every part its examples' made values from the start, as the parts inside it, tried first in
  name order, can't draw without them. The project imports them by the name it depends on the package by, the builder
  loads their modules with the decorators', and the guest makes each once, in a list too (Fluent's
  `columns={[createTableColumn(...)]}`). The inspector shows one as "Made by createTreeCollection()", not editable.
  Chakra's TreeView parts now render: 456 of 473 on the server (from 446) and 460 in the app (from 450). Select,
  Combobox and Listbox roots now come with their real collections.
- **Code export must write made values as calls (LIB-49):** there's no design-to-code export yet; when there is, a
  `$call` prop becomes an import of the function and a call with its arguments, hoisted out of the JSX.
- **A render prop holds what it draws (LIB-49):** what an example's render function draws (`TreeView.Node`'s
  `render={({ node }) => ...}`) is placed inside the component it's given to, unlike an element passed in a prop. A
  render that picks between elements is sampled with the first. A parent whose sample has a render prop and no function
  children gets an inserted part in that prop's slot, keeping its other slots.
- **The in-app backtest runs its own instance:** `PARITY_UI_PORT`, `PARITY_DEBUG_PORT`, `PARITY_AGENT_FILE` and
  `PARITY_USER_DATA` give it its own ports, CLI channel and settings, so it runs beside another session's Parity instead
  of driving it.
- **`parity lib check <library>` is the in-app check (PAR-408):** it inserts every component of a registry library file
  into a design in the tab's project, once bare and once the way the Assets panel inserts it, and counts the parts that
  fail bare but render inside their parents. It builds nodes with core's `componentNode` and `withLibraryContext`, the
  same code the canvas inserts with, so the check can't drift from the app. Each library's floor, the least share of
  placed parts that must render, is in `packages/registry/in-app.json`; below it the command exits with 1.
- **A render function's arguments go to the node it returns (PAR-409):** a `$render` slot's `pass` and `$renderWith`
  props are given to the node itself, not cloned onto the error boundary around it, which dropped them (React Aria's
  `CalendarCell` lost its `date`, `DateSegment` its `segment`).
- **Generated parents and samples (PAR-409):**
  - A wrapper an example imports from a file beside it (`MyMenuItem` from `./utils`) counts as the part it passes its
    props to, as a wrapper in the same file does.
  - React Aria's `<submenutrigger>` markup is a placeholder, like `<item>`, so the part fails alone and gets parents.
  - A part named for a family (`SubmenuTrigger`, `Menu`) joins it even when examples also draw it alone and the family
    holds many others.
  - A chain whose outermost parent has parents of its own starts outside them, unless they're circular.
  - A part with no children of its own takes those its parent's sample spells out for it (a table's `Row` its `Cell`s),
    going into the outermost parent's whole sample when only that renders.
  - A function the library re-exports (Chakra's `parseDate`) is called from the library when an example imports it from
    elsewhere.
- **A part that hands its children to an input gets no text label (PAR-418):** the canvas gives a part with a `children`
  prop its own name as text, which an `<input>` can't hold (Mantine's `Cascader`, Nova's `ComboboxChipsInput`). The
  generator tries each part with text inside; one that then fails as a void or self-closing element, but renders without
  it, gets a sample of `children: []`. Inserting reads a sample's children, empty ones included, in place of the label.
- **`parity lib` tries parts with React's server renderer,** from the project's own React, rather than in the app: it
  needs no window, runs in seconds, and still throws the context errors that name a part's parents. The library's
  decorator providers wrap each try, with their imports and calls made, a mode's default value, and no frame, so
  `MantineProvider` is never a part's parent. What renders this way can still fail in a frame (portals and effects don't
  run on the server), so the in-app sweep is the backtest.
- **What a failing component needs is inferred from types and errors, and kept only if it then renders:** parents,
  required props with sample values from their types (the first of a set of strings, a word, a number, `true`, an empty
  list), a single element child for parts that clone theirs, and a family's parts as its root's sample. Contexts,
  consumers and `RootProvider`s are marked `visual: false` and left out of the Components panel. The rest are listed for
  a hand edit.
- **Hand edits to a library file survive regenerating it.** They're kept apart from what `parity lib` writes, keyed by
  export name, in the file's `edits` or a shared file it names, and merged over it: a field replaces the generated one,
  `false` leaves a component out, and decorators given there replace the generated ones. `--edits <file>` points a file
  at shared edits and tries them while generating, so the report counts what they fix. An edit whose export has gone is
  reported, in the CLI and in the project's notes, not dropped.
- **Regenerating compares fingerprints, not API Extractor,** to report new, changed and removed components. Each
  component keeps a fingerprint of what it was found as and its own props (those its package declares, not the HTML
  attributes it passes on), and each prop a hash of its type, so a change says which props were added, removed or
  retyped. API Extractor diffs a package's whole public API from a `.d.ts` rollup and needs setting up per package,
  which is more than component changes need. `--only new` and `--only A,B` write just those over the old file, and
  `--all` (the default) writes everything. Components the package no longer exports are dropped either way.
- **A library newer than its file keeps using it.** With no range covering the installed version, Parity uses the newest
  file made for an older version instead of none, keeping its decorators and tokens. Components it lists that the
  package no longer declares are left out, ones it has gained are found by name as for a package with no file, and the
  project's notes say so and give the `parity lib` command that updates the file.
- **The registry's libraries are offered when creating a project,** at your request, since they cover most React
  component libraries. The registry already ships inside the app.
- **Library tokens say where they belong** with `$extensions.parity`: `var` (the custom property), `category` and
  `lineHeight`. The frame declares them before the project's styles, so the project's own values win, and the Tokens
  panel files them by category: spacing, breakpoints, font sizes with their line heights, radius, shadows and colors,
  each theme as a mode. A library's spacing step becomes Parity's `--spacing` (MUI's 8px, Chakra's 0.25rem), so `p-2` in
  a design is the library's own `spacing(2)`.
- **Library decorators are data, not code,** so a `.lib.par` runs nothing of its own: wrap the design in a component,
  add one beside it (a toast host), or set a class, attributes or styles on the frame's body, optionally only `when` a
  mode's globals match. Values can be imports, calls, the mode's globals, or the frame itself (its shadow root, host,
  body, document, direction and language), which is how CSS-in-JS renders into each frame: Emotion's cache for MUI and
  Chakra, Griffel's shadow DOM renderer for Fluent, and Mantine's variables written to the frame's host. Manifests list
  decorators outermost first, as the JSX reads.
- **A package stylesheet the app imports** (`import "@mantine/core/styles.css"`) loads before the project's styles, by
  its specifier, and isn't read for tokens: the library's tokens come from its `.lib.par`, and the rest are its
  components' own variables.
- **Images are a node type of their own** (`image`, with `src`, `alt`, `fit` and `credit`). They render as `<img>` with
  paths resolved against the project's dev server.
- **Stock photos are removed for now,** at your request, because Pexels isn't taking new customers. The Images tab says
  they're coming soon. A key a person enters for a source, as with Pexels, is encrypted with the system keychain
  (Electron safeStorage) and used only in the main process.
- **Each stock source is used the way its terms ask** (your call, 2026-10-28): linked from the source's own address or
  downloaded into `public/images/`. Either is fine, and a photo keeps its `credit` both ways. Images the person pastes,
  drops or imports are saved under `public/images/`.
- **A Pexels key saved before stays where it was,** encrypted in the app's data (`connections.json`), unused and never
  deleted, so it works again if Pexels comes back. Photos already saved keep their `credit`, and pasting images is
  unchanged.
- **Unsplash is the first stock source** (your call, 2026-10-28), for its consistent quality. Its terms want photos
  linked from Unsplash, a request to its download endpoint when someone picks one, and credit to the photographer and
  Unsplash.
- **Parity owns the Unsplash key** (your call, 2026-10-28), so a service of Parity's holds it and the app calls the
  service; the key never ships in the app. Unsplash allows 50 requests an hour until it approves an app for production,
  then 5,000, and raises that further on request. Only searches and download pings count; loading the images themselves
  doesn't.

## The example project

- **The example is a small product, Acme, built to demo with:** 25 screens, read as a journey. The marketing site (Home,
  Pricing, Checkout), signing up and in (Sign up, Verify email, two onboarding steps, Sign in, Forgot password),
  everyday work (Dashboard, Projects, Project board, Task detail, Inbox, Messages, Calendar, Files, Search), then
  insights and admin (Reports, Team members, Member profile, Settings, Security, Billing, Integrations). Every screen
  shows light, dark and mobile, and uses the project's components, Nova's and Lucide icons.
- **Acme exists only as designs for now.** The example's React app stays the shadcn starter; writing the screens as code
  waits for the Writing back work.
- **App screens share an App sidebar and an App top bar,** both component designs. The sidebar has a state per section,
  so each screen's instance says which section is open; the top bar's breadcrumb is two params. Team members was moved
  into the shell rather than rebuilt, so its states still apply.
- **The canvas reads like the journey:** one row of boards per part of it, top-aligned, 400 apart, rows 600 apart.
  Components sit below, the shared ones first, then in the order of the screens that use them, 600 apart so the state
  names beside them have room. Board sizes were worked out from `Measure`, since the canvas reports 0 for boards it
  hasn't drawn (PAR-279).
- **Each screen has states worth showing:** Dashboard's Loading and Empty workspace, Sign in's Signing in and Wrong
  password, Settings' Saving, Saved and Invalid email, and Pricing's Monthly and Yearly.
- **Repeated parts became component designs by extraction** (Stat card, Activity item, Plan card, Project card, Task
  card, Notification item, Integration card and two dozen more), with params inferred from what differed. Stat card has
  a Loading state. Pricing's Yearly state changes each plan's price through its instance.
- **They were built through the agent API** (`parity exec`), one undoable step per screen, and saved after each, because
  the dev runner restarting Electron drops unsaved changes. Four agents built screens at once, taking turns through a
  lock: each run applies whole project files, so two at once would overwrite each other's work (PAR-278).
- **The example imports Nova's styles** (`@buildkitgg/shadcn-baseui-nova/tailwind.css`, right after Tailwind), as the
  Components panel's Import styles does. Without it, Nova's switches and progress bars render invisible.
- **The accessibility checks find real issues in it,** mostly one token pair: `muted-foreground` on `muted` is 4.34:1,
  short of 4.5:1, which shows on avatar initials, the keyboard hint and small print. They're left in, since changing
  that token and checking again is a good demo.
- **Parity's own Storybook opens a small copy of the example's designs** (your call, 2026-10-29), since opening all 61
  made Storybook grind to a halt. `apps/desktop/.storybook/example.par` holds the 14 that stories use (Pricing,
  Dashboard, Projects, Sign in, Settings, the component designs they're built from, Button, Member row and Order line),
  laid out close together, on the example's own components and styles. Stories that showed other screens now show these.
  The example keeps growing as the stress test that `pnpm dev` and `pnpm perf` open. The copy doesn't follow the
  example: a story that needs another design adds it to the copy.

## The portal

- **The portal is Parity on the web, for a whole org,** and has to exist before orgs pay per seat. It's where people
  find what they've been tagged in, see what their teammates, their org and their agents are doing, and open designs to
  see what changed (your call, 2026-10-29).
- **Opening a project opens its canvas,** in the browser or the desktop app, as Figma does. There's no project page in
  between (your call).
- **It's designed as Storybook explorations, built from the start page's parts,** under Parity/Explorations/Portal
  (`explorations/portal`), so it looks like the rest of Parity: the dark canvas previews, project cards, activity rows
  and For you. A first pass drawn on the canvas from plain layouts and the UI kit read as a generic dashboard and was
  dropped (your call).
- **Its sample org is Kestrel, a made-up customer,** with the explorations' cast and the start page's projects renamed
  for it (`portal/data.ts`). Buildkit isn't shown: it has nothing to do with the app (your call). The start page's
  renders name the org a look belongs to (`Look.org`), so Kestrel's apps say Kestrel, and the rest still say Buildkit.
- **Every screen draws from one list of events** (my call, after the design review): For you, the Inbox, Activity and
  the team page all show the same things at the same times, so a count or a time never disagrees between screens.
- **Its screens:** For you (what needs you, then what changed, with who's working where at the side), Recents (the
  projects as a file browser), a team page that opens on who's working where now, each on the canvas they're in, with
  Join for people and Watch for agents; the Inbox (the open item beside its board, pins and all, with its thread); the
  org's Activity (changes shown as the designs, merges, published components, new people, and the week in versions,
  threads and approvals); Handoff and Inspect; the canvas opened on what changed, or on how the code differs from the
  design; All projects, by team; a library's page; sharing and asking for access; search results; and the admin pages
  Members (with removing someone), Billing, Add seats, Plans and Security.
- **For you is a digest, as the start page's is** (my call, after the fourth review): each thing waiting on you is one
  line with what they said and its one or two actions (Reply, Approve, Let Ivy comment, See what changed), so most of it
  can be answered from there, and what happened since you were last here follows close under it. The inbox has the full
  thread beside its board.
- **Every page shares one left edge, and tabs and filters look different** (my calls, after the third review): tabs move
  between the parts of one place (a team, settings, a library), and quiet pills filter a list.
- **Handoff is for developers: every board by where it stands between design and code, from Parity's own versions** (my
  calls, after the design reviews), so it works without git, as history does. A board is In review, Ready to build,
  Building, Changed since approval, Built, or Code differs. An approval is of one version, so a newer version marked
  ready while the approved one is still to build or being built turns the board to Changed since approval wherever its
  status shows, and the developer can build the approved version or look at what changed; once the approved version is
  built, a newer one is just In review (my call, after the seventh review). Handoff is a list, one row per board grouped
  by status, with the board you pick open at the side: its version, its page and components and their files (new ones
  and new props marked), its tokens and their values, its states and sizes, and its code; branches, pull requests and
  tracker issues show too where a project has them. Each row has the same two columns (my call, after the fourth
  review): Approval, who approved the version, or while it's in review, whom it waits on and who asked when, and Code,
  who's building it, built it, or made it with the design. An agent that changes a design and its code together, as
  Claude Code did for the Cloud console, leaves the code already in a pull request, so approving that design leaves only
  the merge, and its boards are Built once it merges. Rows carry no buttons (your call, 2026-10-29, that a filled button
  in a row is out of place; my call on what replaces it): picking a row opens its board at the side, whose footer has
  the board's next step as its one filled button, beside Inspect. Actions in other lists stay quiet, outlined and never
  filled, with the yes before the no. Handoff, Inspect and What changed read what a board delivers from one list
  (`portal/boards.ts`), so they always name the same components and tokens.
- **Every change makes a version, but only one its designer marks ready moves a board** (your call, 2026-10-29, after
  the fifth review). Marking a version ready asks one of the team's reviewers; the versions in between are drafts, and
  someone working on a board shows in Handoff as just that, without its status moving or anyone being told. So builders
  never hear about unfinished work.
- **Each board has its own versions and is approved on its own, against its last approved version** (your call,
  2026-10-29, after the sixth review). A comparison of several boards labels each with the version last approved and the
  newer one, and the reviewer ticks which to approve, so one board can go ahead while another waits for changes.
  Kestrel's example is Claude Code's token change to Billing v19, Overview v12 and Sign in v7.
- **A comparison shows every size a change shows on** (my call, after the sixth review): Pricing compares desktop and
  phone, marked on both, since Jonas's open question is about the toggle on phones.
- **A library's components say which library and version they come from** (my call, after the sixth review): Handoff
  tags them with it, and the library's Used in list is read from the same boards, so it names the boards on each version
  and a project still on an older one.
- **Whoever's building a board hears when a newer version is marked ready, as something that needs them** (my call,
  after the fourth review): For you and the inbox say which version they're building, what changed since in a sentence,
  and link the comparison and their pull request. Kestrel's example is you building Pricing v12 in #150 while Maya made
  v13, a draft, and v14, which she asked Priya to review.
- **Each team picks its reviewers, and only they approve its designs, once the designer asks** (my call, after the fifth
  review), never their own or their own agent's. Kestrel's: Andrew, Lena and Jonas for Apps; Andrew and Priya for Web;
  Maya and Lena for the design system.
- **What you can do with a comparison depends on who you are to it** (my call, after the fifth review): a reviewer who
  was asked approves it or asks for changes, with its open threads shown; whoever's building the older version keeps
  building it or asks the designer, and moves to the newer one only once it's approved; free viewers, such as developers
  without a seat, see the same comparison.
- **Code that's moved away from its design gets the same comparison** (my call, after the fifth review): Code differs
  opens the approved version beside what main draws now, each difference marked with the code change behind it, and
  either the design is updated to match, making a new version, or the builder is asked to match the design.
- **All projects is a list grouped by team** (my call, after the fifth review): each project's owner, last edit and
  boards by status, and each team's boards by status and what it approved this week, so a large org can find work and
  see where each team stands. Recents stays the file browser of what you've been in.
- **Removing someone says what happens first** (my call, after the fifth review): their seat opens and is paid for until
  the renewal, the projects they own go to someone you pick, the agents they connected lose access (anyone else's
  connection of the same agent keeps working), their work stays under their name, their teams are told who's left to
  review, and without SCIM they're to be removed from the identity provider too.
- **Seat requests wait in one place** (my call, after the seventh review): Members lists every editor seat waiting on an
  admin, invites and requests alike, with how long each has waited, and each is in the admins' Needs you.
- **Libraries take Drafts' place in the nav** (my call): Parity's projects live in repositories, so there are no drafts.
  A library's page shows its components as the code renders them, which version each project uses and on which boards,
  and its releases; a project behind the latest version can be updated from there, or the update given to an agent.
- **Sharing shows where everyone's access comes from** (my call): owning the project, a team, being an admin, or an
  invite. Requests waiting for an answer come first, and go to the inbox of the project's owner and the org's admins.
  Asking to view or comment is free; asking to edit needs an editor seat, which an admin approves. The dialog keeps to
  Security: no public links, and guests for 90 days.
- **Search is one page of everything you can open** (my call): designs, components with their files, comments and
  settings, the match marked, filtered by project, team, when and who. Projects you can't see stay out of it.
- **Inspect is Parity's Dev Mode** (my call): a board at its approved version, read-only, opened from Handoff and
  leading back to it. Picking anything shows its component and file, its props as code, its states, its text and size as
  the code writes them (classes, with pixels beside), its tokens, and hovering something else measures to it. New and
  changed are against main, and a value that isn't one of the project's tokens says so (my call, after the seventh
  review). What the version asks for and the designer's notes come first (my call, after the sixth review); the board's
  page file and what there is to export show too, files open on GitHub, and Give to your agent hands the board to the
  developer's own coding agent. There's usually nothing to export: icons come from the project's icon package and the
  rest is drawn in code.
- **What changed compares two of the project's versions** (my calls, after the design reviews). Parity records versions
  itself, and only a change makes one: a comment doesn't. Every place a change shows is marked, found from what the
  render draws with the changed token rather than placed by hand, so a token change marks every board that uses it. A
  moved element is outlined where it was on the before side and where it is on the after side, and a removed one where
  it was on both (my call, after the fourth review). The side says who made the changes and why (the version notes, or
  the task someone gave their agent), the token's values before and after, and each change's components and files with
  their props before and after, as a diff; each change can be commented on. Approve approves the design at the newer
  version, and Ask for changes takes a note. Its link names both versions, so it can go in a pull request. Kestrel's
  examples are Claude Code's token change to three Cloud console boards and Maya's v13 and v14 of Pricing.
- **What changed stays quiet so the changes are the focus** (your call, 2026-10-29). No glow, pills or rings on the
  boards; the branch, pull request and links, opening the canvas among them, sit in a menu; hovering a change brings it
  forward on both boards and in the list. There's no timeline: the version labels above the boards pick what's compared.
- **Only editors pay; viewing and commenting are free** (your calls, 2026-10-29). Inspecting is viewing, so developers
  who build from designs don't need a seat. A seat request uses the open seats first, and buying more is offered only
  past them.
- **Four roles, each shown with what it can do** (my calls): admins can do everything; billing admins look after the
  plan, invoices and seats; members, and billing admins beyond billing, work on their teams' projects and what's shared
  with them (my call, after the seventh review); guests only on what they're invited to. Members can invite, and an
  admin or billing admin approves each editor seat. Nobody approves their own design, or their own agent's.
- **An agent can never do more than the person who runs it** (my call): a viewer's agent only comments. Security lists
  which agents can connect, with sign-in, sharing, guests and an audit log of who changed what.
- **Agents aren't part of billing at all** (your call, 2026-10-29). Parity has no agents of its own: the ones people
  use, such as Claude Code and Cursor, are theirs, connected through Parity's MCP server. So the billing, plans and
  members pages don't mention agents; which ones can connect is in Security.
- **The plans are Figma's at half the price per editor seat, rounded up to the next .95** (your call, 2026-10-29,
  against Figma's Full seat prices that day): Starter free, Professional $8.95 a month billed yearly or $10.95 monthly,
  Organization $27.95 and Enterprise $45.95, both billed yearly. As on Figma, seats added mid-year on Organization and
  Enterprise are prorated to the renewal and invoiced quarterly. Kestrel is on Organization. Each plan builds on the one
  before it, with features that follow Figma's tiers for now (the Plans story) and are still to be settled: single
  sign-on and an audit log kept a year come with Organization, and Enterprise adds SCIM and keeps the log longer. Moving
  to a smaller plan says what the org would lose first (my call).

## Collaboration

- **It's designed as small parts, each with its own stories,** under Parity/Explorations/Collaboration
  (`explorations/collaboration`): comments, comment pins, accessibility annotations, notes and sections, emoji, presence
  and sharing. Comment pins / On a board is a board you can use, with its animations.
- **Proposes changes is an approval, not a review tool** (your call, 2026-10-29). An agent or person with that role says
  what they'll change, and someone approves it with a click instead of replying "go ahead". There's no branch comparison
  or merge screen.
- **A proposal sits in the proposer's comment, and only editors decide it** (my calls). Each change is a line, with its
  layers linked. Approving sets the proposer to work on it, shown under the thread; declining can say why, and the
  proposer sees that. Someone who can only comment sees it waiting for an editor. While it waits, its pin has an amber
  ring and the inbox lists it under For you with Approve.
- **History doesn't depend on git** (your call, 2026-10-29). Many people using Parity won't use git, so Parity records
  who did what and when itself, and the web app (the portal) shows it. A project's git history, where it has one, is
  extra.
- **Better Apps comes first** (your call, 2026-10-29). Parity's comments, approvals, history and activity aren't built
  until Better Apps' packages have the audit log, approval flows and activity features. Better Apps' plans (Buildkit's
  `docs/platform-planning`) list comments, reactions, attachments, live presence, approval flows and the audit log;
  activity isn't in them yet.
- **There's no live service for comments or presence yet** (your call, 2026-10-29). It waits on Better Apps' packages to
  scaffold it, and Parity adds it then. Threads, approvals and presence will live in that service, not in the `.par`
  file: a comment isn't a change to the project, so it never touches the project's files or their history.
- **Editing the same app at the same time is needed, but not now** (your call, 2026-10-29). People should be able to
  edit different details of the same app at once, with their changes syncing back to one shared state.
- **Comments take attachments and can be edited** (your call, 2026-10-29). An attached file shows as a chip; an image
  shows a preview.
- **A thread can become an issue in GitHub, Linear or Azure DevOps** (your call, 2026-10-29). The list offers only the
  trackers the org has added.
- **Attachments are capped at 25 MB each, and deleting a thread's first comment deletes the thread** (my calls).
  Pictures preview in the comment and open larger; anything too large stays out of what's sent and says why.
- **A thread that lost its place says why under its header** (my call): a deleted layer leaves the pin where it was, a
  layer moved to another design takes its threads along, a thread left on another frame is faded until you switch, and a
  thread on a component shows on every use.
- **Notifications default to threads you're in, desktop notifications on, and a daily email summary** (my call). The
  inbox's For you holds mentions, replies, reviews, access requests and issue changes; agents' work has its own view. A
  project can override the defaults. A toast comes only for mentions and replies, and you can reply from it.

## Storybook

- **Storybook is detected, not configured:** its `main` file must exist, in `.storybook` or the folder a script that
  runs `storybook dev` names with `-c`. Storybook can't run without it. Stories map to components through the
  `component` their default export imports, following relative and aliased paths.
- **Opening a story uses a Storybook that's already running** for the project when its index matches; otherwise Parity
  starts the project's own Storybook (with Electron's Node, so nothing else needs installing) and stops it when the tab
  closes. It uses the script's port, or 6006, so links people already use keep working, and a free port only when that
  one's taken. A component's docs page opens when it has one, else its first story, in your browser.
- **Storybook opens at its Portless name when it has one, whatever named it.** You asked on 2026-10-29 that a project
  using Portless gets the right address, without Parity knowing which package set the name up. Parity reads Portless's
  routes, which Portless's own command line, Buildkit's dev-domains and anything else built on Portless all write, and
  asks each route's port for its story index: a Storybook with the project's stories is reused, and stories open at its
  name (`https://parity-shadcn-vite-stories.localhost`). My calls:
  - **Parity doesn't name what it starts.** With no Storybook running, it starts its own at `localhost` as before; one
    started under a name, from a terminal or a script, is found by it.
  - **A checkout's Storybook is told from a worktree's** by asking each for the project's `package.json` through Vite,
    which serves only the folders it allows and refuses the rest. When it can't tell, as with another builder, Parity
    uses neither and starts its own.
  - The service checks a server at `localhost`, since Node doesn't trust Portless's certificate; only the browser gets
    the name.
- **How the two connect, and the rules that keep them apart, are in [storybook.md](storybook.md).**

## Accessibility

- **Checks run offscreen with axe-core,** in every state and the modes a design shows, at the frame's own size, so
  contrast is measured on everything. Rules about whole pages (title, language, landmarks, a top heading, skip links)
  are off, because a design is part of a page. WCAG 2.2 AA and axe's best practices are on.
- **Issues are reported on layers.** An element inside a component counts as that component, and anything inside an
  instance counts as the instance. Layers with the same name, problem and frames, such as the rows of a list, are one
  entry, and clicking it selects all of them. Instances are named after their component design, as in "Member row".
- **The issues list puts axe's findings in plain words.** Each rule has a short title and a sentence on who it affects
  and what to do; rules without one use axe's own summary. Impact is an icon and a colour, counted at the top. Contrast
  failures show the two colours as a text sample, with the ratio found and the one needed. An ARIA reference to a
  missing element says so instead of quoting the generated id. Clicking a frame under a layer selects the layer there
  and shows that state on the canvas, as picking it under States does; clicking the layer itself keeps the state shown
  when it's one of its frames.
- **The Accessibility tab checks a design the first time it's shown;** after that, Check again is up to you, and the tab
  says when the design has changed since. Only changes a check would see count: layers, states and the modes shown.
  Showing another state or moving the design doesn't. It says plainly that automated checks find only some issues.
- **Showing another state on the canvas is an unsaved change,** from States or from this list, because the shown state
  is saved in the `.par`. You confirmed this on 2026-10-28: "Otherwise if you close and reopen, all your states and
  settings might not be there."
- **Agents call `Accessibility(design, { state, mode })`,** which returns one finding per layer and frame, with the
  rule, its impact, axe's help link and what's wrong, plus the measured colours for contrast failures.
- **Show tab order** numbers the selected design's tab stops on the canvas, in every frame, joined in the order Tab
  visits them. Positive `tabindex` comes first, then document order; hidden, disabled and inert elements are skipped, as
  is every radio button in a group but one.
- **Team members' selected tab is flagged correctly.** The design has tab triggers but no tab panels, so the selected
  tab's `aria-controls` points at nothing. axe skips inactive tabs, so it isn't the Radix false positive first noted
  here, and adding the panel to the design clears it. No library false positives are hidden.

## Rendering and agents

- **A project's Vite server listens on a port of its own, on 127.0.0.1 only.** My call: Parity asks the system for a
  free port, then has Vite take exactly that one, rather than passing port 0, which Vite reads as unset and turns
  into 5173. With two Parity instances open (two sessions, or an isolated backtest beside the person's app), both
  servers took 5173, one on IPv4 and one on IPv6, and a frame asking `localhost:5173` could reach the other instance's
  server and fail to load its guest. Portless doesn't replace this: it names servers by proxying to a port, so it would
  still need a free one behind it, and the guest server is internal to Parity, loaded only by its own frames.
- **Each open project's builder runs in a process of its own, which closing the project ends** (CAN-81). My call, from
  the memory audit: a closed Vite server isn't freed in the process that ran it, because Rolldown's native handles keep
  closures from it, and through them its whole module graph, so each reopen of the example project kept 60 to 160 MB in
  the project service. With the builder in its own process, five reopens leave the service where one open had it. The
  service starts the builder with Parity's own Node
  ([builder-process.ts](../apps/desktop/src/utility/builder-process.ts), started by
  [builders.ts](../apps/desktop/src/utility/builders.ts)), and they talk in the messages in `@parity/core`'s
  [builder-process.ts](../packages/core/src/builder-process.ts): the start options as data, with the builder by id and
  only the renderer's package lists (its code loads TypeScript, which a builder doesn't need), the components as the
  type checker and changed files find them, usage readings, and close. Closing waits for the process to end, and ends it
  outright after 5 seconds. A builder whose service ends, even killed outright, ends itself when its link to the service
  closes, so none is left behind, on Windows too. Detecting the builder still happens in the service.
- **A builder that stops by itself shows as crashed** in the status bar's processes, with the end of what it printed,
  and can be started again from there. One that stops before its server answers fails the project's opening with that
  error, as a builder that throws does.
- **A reopened project gets its builder's last port back when it's free and its code hasn't changed** (PAR-195), so its
  guest URL stays the same and the pages draw with the modules they hold; otherwise any free port. The service remembers
  each project's port while it runs, and a reopen waits for the closing builder's process to end first. With the port
  back on every reopen, as CAN-81 had it, a reopen after a code change showed the old code: a page never loads a URL
  twice, so the window kept the modules it had. My call on how a builder tells, in `@parity/core`'s
  [served.ts](../packages/core/src/served.ts) with the Vite side in `builder-vite/src/served.ts`:
  - **It logs what it serves the pages:** each module as first sent, with the files Vite made it from as they were then
    (its own and what it imports, which for the stylesheet is every file Tailwind scanned, design files included), and
    the files the whole build depends on (its config, the lockfiles in the root and above, the environment files, the
    root's package.json and TypeScript configs). It hands the log to the service as it closes.
  - **The next builder compares it with the files,** and with the guest module it would make now, before it listens. Any
    difference, or no log at all (a builder that crashed or didn't close in time), means a new port, and its log says
    which file changed.
  - **A file changed while the project was open still counts as unchanged** when every module made from it comes out the
    same when made again at close, so saving a design that uses no new class keeps the address. Build files never get
    this.
  - **The builder that takes the address carries the log on,** since the pages still hold what the last one served. One
    started again from the processes list takes its port whenever it's free; if it can't, the windows are told
    (`project.guestMoved`) and load the guest from the new one.
  - **A reopen after a code change still loads every module again,** the example project's 33 scripts and 6.9 M
    characters, which a page can't give back. Only picking up code edits live (PAR-165) or a separate realm per project
    would avoid that.
- **Closing a project lets go of its guest in the window:** its `loadGuest` entry and the stylesheet the document
  adopted for it (PAR-195), so the next open makes its stylesheets anew, without the last session's token previews. The
  offscreen renderer lets go of a project's last guest when its jobs come with a new address, since it doesn't hear of
  closes, and closes when idle anyway. Frame bitmaps are keyed by the guest module, which a same-address reopen gets
  back, so they still show.
- **The performance stats count each project's builder,** as "Vite for shop", since its memory used to count in the
  service's: the service asks each builder for its CPU time, and the system reads its memory as it does Electron's own
  processes'. Storybook and the other servers Parity starts still aren't counted.

- **At 100% a frame is the size Chrome draws the same page,** checked element by element on all 36 frames of the
  example's screens, within 0.01px. A frame's root starts from what a browser gives a page's root (`all: initial` on
  `:host`, in a layer below the project's own CSS), not from the canvas around it. Before this, text without a size of
  its own took the canvas's 12px and 18px line height instead of 16px. The frames beside the first column are drawn
  smaller on purpose, and so aren't actual size at 100%. `frame.test.ts` lays a frame out in Chrome and checks its root
  against a fresh page's, and the render sweep (PAR-211) is to compare whole frames with Chrome. On screen at 100%, a
  phone and a desktop frame were also captured and compared with Chrome pixel by pixel: same size and place, with only
  text antialiasing differing (the canvas draws text in grayscale, and Chrome with ClearType's colored edges).
- **Frames have square corners and cut nothing off,** at your request, since a browser's viewport doesn't round its
  corners. Only a frame with a device height clips, below that height, where a browser would scroll; a frame that grows
  with its content shows all of it, shadows and popups included.
- **A frame stands for a browser window of its own size,** so a project's styles and code see the screen it's designed
  for, not Parity's window, while frames stay shadow roots in one page. Iframes would isolate them fully, but at a
  document, a copy of the project's code and a React per frame. The window is the frame's width by its fixed height,
  else its viewport's screen height, else the height of the device nearest its width (844 for 390, 800 for 1280).
- **Viewport units measure the frame's window** (CAN-23): `vw`, `vh`, their `s`, `l` and `d` forms, `vi`, `vb`, `vmin`
  and `vmax` in the project's stylesheets become `calc()`s of two custom properties each frame sets. A frame has no
  browser bars, so `svh`, `lvh` and `dvh` are all its height.
- **So do the viewport units the project's code writes while it runs** (CAN-33).
  - **Inline styles, and text in a frame's `<style>` elements:** each frame's MutationObserver rewrites inline styles,
    however they're set, and text written into its `<style>` elements, as CSS-in-JS writes in development. This happens
    before the frame is next drawn. Code that measures straight after, as a layout effect can, still sees Parity's
    window at that moment. Chrome doesn't let JavaScript catch inline style properties as they're set. Doing it anyway
    would take a proxy on every element's `style`, which would slow every style Parity sets.
  - **Rules added to a stylesheet:** `insertRule`, `replace` and `replaceSync`, as CSS-in-JS uses in production, are
    rewritten as rules are added, in any stylesheet. Outside a frame the custom properties aren't set, so the units
    still measure Parity's window there.
  - Only declarations are rewritten, so a selector such as `.h-[100vh]` still matches. Rewriting twice changes nothing.
- **A frame's body has a browser's 8px margin,** in the lowest layer, so a reset such as Tailwind's preflight still
  removes it (CAN-25). The size container that the project's rewritten media queries ask is the frame's root rather than
  its body. A container lays out on its own, as a page's root does, so on the body it kept a first heading's margin from
  joining the body's, as it does in Chrome. On the root, `position: fixed` places itself against the frame, as against a
  browser's viewport.
- **A project's code that asks the window its size gets the frame's answer** (CAN-27). This covers `matchMedia` with a
  width, height, aspect ratio or orientation, `innerWidth`, `innerHeight`, `outerWidth`, `outerHeight`, the root's
  `clientWidth` and `clientHeight`, and `resize` listeners. The frame asking is:
  - the one React is rendering or running effects for, at any time. React's development build, which dev servers run,
    names the component it's working on, and that component's root says which frame;
  - the one the canvas is drawing or resizing, which it does synchronously, so the first effects run inside too;
  - for a media query list or resize listener, the frame that made it. These hear the frame resize without a rebuild;
  - otherwise, in an event handler, a timer or a render the project starts itself, the frame last drawn or used, but
    only for the project's code. Code counts as the project's when every caller on the stack came from the project's
    server. Parity's code, tldraw included, always gets Parity's window, and so does code evaluated without a source,
    from DevTools or a script driving Parity. In Parity's Storybook, where the two share a server, this last case is
    off.

  React's production build names no component, so with several frames on the canvas, a render the project starts itself
  can get the answer of the frame drawn last. A `useState` set in a mount effect still gets the right one. `screen` and
  `visualViewport` still describe Parity's window. `frame.test.ts` mounts shadcn's `useIsMobile` and a MUI-style
  `useMediaQuery` in a phone and a laptop frame at once, clicks and resizes them, and checks Parity's own answers. After
  these changes, the 93 full-size frames in the example's Boards story still match Chrome element by element, within
  0.03px.

- **Visual regression tests draw each frame as a page of its own, not as a canvas frame** (PAR-226). Canvas frames share
  one window, one document, one origin and one copy of the project's code, so the canvas can draw dozens at once. The
  rewrites and window answers above make them look right, and that's enough to design with. A baseline needs a
  guarantee, and these frames still share more than a test should:
  - the project's module state, such as a store two frames both read;
  - the document's portals, focus, scroll lock and listeners;
  - Parity's origin for storage, cookies and relative requests;
  - Parity's root font size for `rem` (PAR-156) and its CSS variables (PAR-157);
  - media queries other than width, the pixel ratio, the user agent and touch;
  - the canvas's drawing: fractional positions, zoom and grayscale text.

  So each design, state and mode is loaded as its own page on the project's dev server, in its own browser context. The
  project's CSS is unchanged there, and its window, `html`, `body`, `rem`, media queries and modules are its own. The
  mode's viewport, pixel ratio, color scheme, reduced motion and touch are emulated. Time is frozen, animations
  finished, and fonts, images and components that load on demand awaited. The canvas is then held to those pages: the
  sweep compares each canvas frame's layout with its page's, element by element (PAR-211), as was done by hand for
  CAN-23 to CAN-33. A gap in the canvas's isolation then shows up as a failure, not as a wrong baseline.

- **Visual tests come after the core** (your call, 2026-10-29). PAR-226 and the VIS stream, which
  [visual-tests.md](proposals/visual-tests.md) proposes, stay at Later until the core is done, including PAR-227 and
  PAR-228, which need nothing else.

- **Agents render offscreen,** in a hidden window, so their work never moves your camera. Export uses the same renderer.
- **The offscreen renderer closes when it's idle,** a minute after its last job, and the next job opens it again
  (CAN-83). Its page holds every module graph the project's guest imported, which a page can't unload, so it held 115 to
  215 MB for the whole session and grew each time a project reopened (452 MB after five). A job counts from when it's
  queued until it ends (`main/idle-close.ts`), so it never closes during a job or with one waiting. The first job after
  it opens again waits for the page and the project's modules to load, 0.4 to 0.9 s more than a capture's usual 133 ms
  on the example project; bitmaps are kept in the canvas, so a canvas that's settled rarely asks again.
- **Prop inference uses the TypeScript 6 compiler in a worker thread,** from cva variants, destructured defaults and the
  component's own props type.
- **The CLI and MCP check accessibility:** `parity a11y <design>` and the `check_accessibility` tool, in every state and
  the modes shown unless narrowed with `--state` and `--mode`. They list each rule broken, worst first, with the layers,
  their ids and the frames. `parity a11y` exits with 1 when it finds issues, so it can gate a script.
- **The CLI and MCP read the console:** `parity console` and the `get_console` tool return what the project's own code
  wrote, on your canvas (including while interacting) and in offscreen renders, oldest first. The main process keeps the
  last 500 messages and counts repeats in a row; `--clear` empties a project's after reading. A message counts as the
  project's when the script that wrote it comes from the project's builder; Parity's own messages and Vite's and React's
  dev chatter are left out.
- **Parity's dev server doesn't forward the console to its terminal** (Vite's `forwardConsole`), because forwarding
  wraps `console.error` and `warn` and every message would seem to come from Vite. Electron reports a message's format
  string and its values together, so React's `%s` placeholders show as written, followed by the values.
- **Agents learn Parity from its skill,** through `read_skill` or `parity skill`: `SKILL.md`, `execute.md` (the API),
  `document.md` (the design format), and guides to components, states and modes, checking, the design system, web apps
  and phones. It follows the layout of Pen's skill (a quick reference, an API file, a format file and guides) in our own
  words. Slides, shaders, SVG drawing and image generation are future features (the Future features stream in Linear),
  so the skill leaves them out. Keep it current: a new agent function or tool needs its line in `execute.md` or
  `SKILL.md`, and its examples must run.
- **Parity is design-system first, so it has no style archetypes.** A project's look comes from its own components and
  tokens, or from a design system library it adds. Pen's ready-made styles aren't copied, and the skill never suggests
  one. PAR-140, which proposed them, was dropped; its ID isn't reused.
- **Agent passes write stories; they don't set up Storybook** (your call, 2026-10-28). Adding Storybook to a project is
  setup work for the scaffolder, whose catalog already has a Storybook add-on, or for a recipe (PAR-285). The pass that
  set up Storybook was dropped before anyone built it; PAR-278 is now a different item.
- **The CLI and MCP find layout problems:** `parity problems <design>` and the `find_problems` tool report render
  errors, overflow, clipping and unknown components, in every state and the modes shown unless narrowed.
  `parity problems` exits with 1 when it finds any.
- **Reads for a terminal are CLI only:** `parity tokens`, `parity components` and `parity props <Component>`. Agents do
  these in a snippet (`GetTokens`, `Components`, `Props`), so the MCP tool list stays short.
- **Agents see what the Components panel shows** (your call, 2026-10-29): `parity components` lists the components that
  fail to draw on the canvas and why, and the person's corrections, saved or not, as well as the exports that aren't
  components (`0004a01`). `Components()` in a snippet still returns names, which closes PAR-254: snippets use them to
  build designs, an agent looks before it writes one, and whether a component draws changes as frames draw, so a status
  read at the start of a snippet would be stale by the time its designs render. My call; change it if snippets need the
  status too.
- **The CLI will be public on npm** (your call, 2026-10-29), so a CI pipeline gets Parity with `npx` and nothing else to
  download. Visual tests in CI rely on it (PAR-239). It can't be published as `@parity/cli`, because the `@parity` scope
  on npm belongs to Parity Technologies, so it's `@parity-app/cli`, under the `parity-app` npm organization you created
  on 2026-10-29 (PAR-26). Its command stays `parity`. It has that name inside the repository too, since pnpm's
  `publishConfig` can't rename a package when it's packed (PAR-13).
- **A project's Vite server keeps its own dependency cache,** `node_modules/.vite-parity`. With Vite's default, the
  project's own dev server, often running alongside, re-optimized into the same folder, and each server then served
  stale dependencies ("Outdated Optimize Dep"). Opening Parity's own app as a project broke every offscreen render this
  way (PROJ-11).
- **Dependencies are served without their source maps inlined,** by Parity's UI and each project's builder (CAN-85).
  Vite inlines a map into every script it sends, prebundled dependencies included, and those maps cost the pages more
  memory than the code: tldraw's 3.5 MB bundle arrived as 12.4 M characters. My call: a prebundled dependency ends with
  a link to the map Vite wrote beside it, which Vite serves when DevTools asks, so DevTools still shows its source; any
  other script from node_modules, such as Vite's client, comes without a map; and Parity's own code, workspace packages
  and a project's own files keep their inline maps, so their stack traces point at their source. It's one plugin,
  `@parity/builder-vite/dependency-maps`, which imports only Vite's types, since the builder runs it in the project's
  own Vite. Vite counts plugin names in its dependency cache's key, so adding it re-optimizes dependencies once, and
  pages can't reuse copies with maps from the HTTP cache.

## Previews

You asked on 2026-10-29 for previews of every kind of token and of components, designed in Storybook first. These calls
are from that design; [proposals/previews.md](proposals/previews.md) has the detail, and PAR-141 to PAR-143 and PAR-207
to PAR-209 build it.

- **Token previews are drawn, not rendered.** My call: a token's preview is a few of Parity's own elements styled from
  its resolved value, never a frame or a bitmap, so a panel of 459 tokens costs only elements. The project's custom
  properties are never set on Parity's elements, since shadcn's names are Parity's too; values resolve through
  `resolveTokenValue`. Project fonts already draw in Parity's document, since `@font-face` moves there.
- **Previews go by kind, finer than the category,** and the Tokens panel's sections follow the kinds. Shadows split into
  box, inset, drop and text, motion into durations, easings and animations, and what's under Effects and Other today
  gets sections of its own: blur, aspect ratios, perspective, border widths, opacity, layers (z-index) and cursors.
  Opacity, blur and border width also become categories, since the inspector picks by category; the rest stay kinds.
- **What a design shows sits on the design's sheet.** Shadows, blur, opacity and type are previewed on the project's
  background in its default theme, not Parity's dark chrome; measurements (spacing, radius, z-index, motion) are
  diagrams in Parity's ink.
- **Motion moves only while it's looked at:** while hovered, focused, highlighted in a picker or open in its detail, and
  never otherwise, so an idle panel runs no animations. With reduced motion, nothing plays by itself and Play runs it
  once. Animation tokens play the project's own keyframes.
- **Component previews are bitmaps of what inserting would place,** made by the offscreen renderer behind canvas bitmaps
  and agent renders, in the project's default mode, and kept on disk keyed by content, in PAR-158's store. No panel or
  picker mounts a component. Dark previews are made only on request.
- **A preview whose code changed shows its last picture, dimmed and marked as updating,** until the new one is made.
  That's fine in a list, unlike on the canvas, and a content key means a picture is never taken for current when it
  isn't.
- **The Components tab gets three views:** Names (today's list), List with a picture on each row (the default) and Grid.
  Resting the pointer on a component for half a second opens its card, with a large picture, its variants and its
  source; the `/` picker shows the highlighted component's card beside its list.
- **PAR-178 keeps the picker's speed and ranking; its previews moved to PAR-208,** so the two aren't built twice.
- **A token's detail shows its value read-only, and Edit changes it.** You found on 2026-10-29 that Cancel seemed to do
  nothing, that an erased value had no way back, and that you couldn't tell what would save. So editing is a mode:
  nothing is written until Save, Cancel or Escape leaves without writing, and after a save the detail says where the
  value went, with Undo.
- **A value is checked before it can be saved:** brackets and quotes must close, each `var()` must name a token, and the
  value with its references replaced must be the kind's value. You found `calc(var(--radius) * 2.6` saved without its
  `)`; the browser closes it silently, and `CSS.supports` passes anything holding `var()`. `validTokenValue` had both
  holes; the Tokens panel's editor has checked values this way since PAR-141.
- **Spacing draws at its true size,** in rows and in the detail's scale, as you asked on 2026-10-29: rows widen to the
  section's longest length, up to 128 pixels, and only a longer one is drawn cut, with a break in its bar.
- **Copying a token takes one step, and copies its name,** since you judged it's why most people open the tab: a copy
  button on each row and tile, Ctrl+C on a row, and a click on a palette shade copy `--radius-md`. You chose the name
  over `var()` on 2026-10-29, since Parity is for designers and vibe coders, who rarely open the code: Parity's fields
  take the name, with or without the dashes, and refuse `var()` (PAR-401 makes them take it), and the dashes keep it
  from reading as a Tailwind class in a message to the agent. The detail's Copy is a split button: its arrow opens Copy
  as, with `var()` and the Tailwind classes, each named by what it sets.
- **Every copy says how it went, through two shared parts** in `chrome/Copy.tsx`, which you asked for on 2026-10-29
  after a copy showed nothing: `CopyButton`, whose icon springs into a green check and back, or a red cross with
  "Couldn't copy", and `CopyOnClick`, for things with no room for a button, which raises a "Copied" bubble from what was
  clicked. Both share `useCopy`, so another way of copying the same thing (Ctrl+C, a menu) shows its result on the same
  button. My call: where the Clipboard API refuses, as in a frame without focus, they copy from a hidden field beside
  what has focus, so an open popover stays open. PAR-402 moves Parity's other copies onto them.
- **In the app, a palette shade copies on a click, and a search makes it editable.** My call, moving the previews into
  the Tokens panel: a shade in the grid opened the editor before; now a click copies it, as the exploration has it, and
  while searching the palette's matches list as rows, which open the editor. The list draws only the rows in view, with
  the search and filters fixed above it.
- **The detail says each thing once, in a fixed order:** the preview; the name, with what it comes to on the right as
  its row shows it; one labeled list of facts (the value in each theme, Built on, From, Used by); and a bar with Edit
  and Copy. You found the first pass disorganized on 2026-10-29: the value showed in three places, and its actions were
  scattered. Editing turns the values into fields in place and the bar into Cancel and Save; a motion token's Play sits
  on its preview, as on a video. There's no caption under the name: "Font sizes, theme scale" only repeated the section
  heading and the filter, so a library's name moved into the list as From.

## The app icon

- **Parity's icon is the brackets: code's `<` and `>` closing around a component's diamond,** which you chose on
  2026-10-29. The drawings are in `brand/`: `parity-icon.svg` for 48 pixels and up, `parity-icon-small.svg` with heavier
  lines and no glow for smaller sizes, and `parity-mark.svg`, the glyph alone in one color.
- **The app's icons are drawn from those files** by `apps/desktop/scripts/icons.ts` into `apps/desktop/resources`:
  `icon.ico` for the Windows taskbar, `icon.png` for Linux, and `dock.png` for the macOS dock, with the margin Apple's
  icons keep around the tile. The dev runner copies them beside the bundles, so a second copy of the app finds them too.
  The taskbar shrinks the 32 and 40 pixel sizes to 24 and 30, so those use the small drawing.
- **The program the app runs from carries the icon too,** for where a system reads the program rather than the window:
  File Explorer, Task Manager and a taskbar button pinned before the app runs, or Finder and Activity Monitor: see "The
  app is named Parity, with Parity's icon, to every system". Packaging the app will set it the same way.

## Developing Parity

- **Only a change to the main process or the preload script restarts Electron.** A change to the project service
  (`src/utility` and every workspace package it bundles) restarts just the service: Electron watches its bundle and
  reconnects each window, which reopens its projects and keeps its designs, unsaved changes and canvas. A change that
  leaves the bundle as it was, such as a comment, restarts nothing. The UI reloads in place through Vite, as before.
- **A dev runner left behind stops itself.** Stopping `pnpm dev` on Windows could leave `scripts/dev.ts` running, with
  an Electron that kept the debug port and old code. The runner now quits, closing Electron, once whatever started it is
  gone, and Electron quits once the runner is gone.
- **The repository has its first commit,** `3dbc7fb`, everything as it stood, which you asked for on 2026-10-28 before
  the package work starts.
- **Sessions commit their own work when they judge it's ready.** You said: "I want it to commit when it thinks it
  should, not just when I ask." That's when a piece of work is done and `pnpm verify` passes. Each session stages its
  own files, so other sessions' unfinished work stays out unless you ask for a wholesale commit. AGENTS.md says how.
- **Editor work lands with tests and a section in [editor.md](editor.md).** You asked on 2026-10-29 for "tests for each
  piece of functionality, and documentation so we know it exists and don't lose it or regress". A feature's section says
  what it does, where its code is and which tests cover it, and changes in the same commit as the feature. Features
  built before then are PAR-392.
- **The editor audit's tasks start with the ones that need no design,** as you asked on 2026-10-29. So the parts of
  CAN-39, CAN-47 and CAN-48 that need design first moved to new items: Copy as PNG (PAR-190), find (PAR-191), lock
  (PAR-192), the finer gesture work (PAR-193) and lengths off the spacing scale (PAR-194). Until PAR-194, nudging moves
  an absolutely placed layer by one spacing step, or ten with Shift, since 1px would leave the scale.
- **The editor's end-to-end tests are `pnpm test:app`** (PAR-202), kept out of `vp run test`. Files are `*.e2e.ts` with
  their own Vitest config, run one at a time against one copy of Parity on a temp copy of the example, its
  `node_modules` linked rather than copied, and a component that ignores its props added only in the copy. It uses ports
  5385 and 9385, or ports the system picks. Tests read results from the page's state, drive real pointer and keyboard
  input with presses tldraw sees kept 500 ms apart, use a stand-in clipboard, and undo everything after each test. A
  full run takes about five minutes.
- **Packages and scripts use only TypeScript that Node can strip,** because the CLI and scripts run them with plain
  `node`: no parameter properties, namespaces or enums. oxlint rejects the first two in `packages/**` and
  `apps/*/scripts/**`; the app's bundled code may use them. The Library files session found CAN-48's parser had broken
  the CLI this way, fixed in `f743864`.

## Repository and releases

How Parity goes public and ships. The proposal is [proposals/repository.md](proposals/repository.md), and the work is
the Repository, CI and releases stream in Linear.

- **Parity will be a public repository under the Better Apps organization on GitHub,** as you decided on 2026-10-29.
  Actions runners are free for public repositories, so CI tests on Windows, macOS and Linux.
- **The organization was Fencing Club, renamed Better Apps on 2026-10-29 at your request.** Its login is
  `betterapps-hq`, because `better-apps` and `BetterApps` belong to other people, and its picture is Parity's icon.
  GitHub redirects `Fencing-Club` only until someone claims that name, so nothing here should still use it.
- **Parity is MIT-licensed** (your call, 2026-10-29, Q6), like the agency monorepo. PAR-397 adds the LICENSE and names
  it in every package.json.
- **Interface text isn't checked against Fluent's guidance.** You said on 2026-10-29 that this was a Microsoft practice
  you no longer follow, so conventions.md keeps only the rule against dot separators.
- **DOC-3, splitting the backlog, was dropped.** The backlog is moving to Linear, which solves its size. Its ID isn't
  reused.
- **Releases ship unsigned until signing is set up,** as you chose on 2026-10-29. Signing is PAR-399. Until then,
  Windows SmartScreen warns on first run, macOS blocks the app until it's allowed in System Settings, and macOS can't
  update in place, so PAR-160 waits for signing there.
- **The toolchain moves to Vite+ in place, with `vp migrate`.** You asked for the monorepo template on 2026-10-29. My
  calls: workspace packages stay source-only, the example project, fixtures and builder-vite stay on stock Vite because
  they stand in for or drive customers' projects, and `pnpm verify` keeps its name.
- **Parity runs on Vite+ since `5020d8f`** (REPO-1, PAR-1). My calls as it landed:
  - **One root `vite.config.ts`** holds the format, lint, type-check, test and task settings. `pnpm verify` runs the
    `check` and `test` tasks (PAR-405), and `pnpm format` runs `vp fmt`.
  - **Shared versions are in a catalog.** pnpm sets Vite (Vite+'s core), Vite+ and Vitest once, and a script stops when
    the dependencies changed but weren't installed: run `pnpm install`.
  - **The desktop app runs on Vite+'s core.** A pnpm override keeps stock Vite 8 for the example project and
    builder-vite, as the call above says.
  - **Types are checked by `pnpm check:types`,** which runs `vp lint --type-aware --type-check` on TypeScript 7, on push
    and in CI rather than in `vp check` (see the hooks below). The eight type-aware rules that flagged 229 places are
    off until PAR-396 fixes them.
  - **Tests import from `vite-plus/test`** since PAR-393, and `prefer-vite-plus-imports` is an error everywhere but
    builder-vite, whose tests run a stock Vite and keep `vitest`.
  - **`.storybook` is type-checked now.** Outside any tsconfig, the checker had given it a program without the `@`
    alias.
  - **No two files in a folder may differ only by case and extension.** Beside `Processes.tsx`, `processes.ts` made the
    checker on Windows mistake one for the other, so it's now `process-store.ts`.
- **Versions come from Beachball change files,** as Buildkit and the agency monorepo do it, which you asked for on
  2026-10-29. This replaces my earlier call for release-please. My calls on how:
  - **Only the desktop app and the CLI are versioned.** The workspace packages they bundle are `private` again, as you
    agreed on 2026-10-29, and sit in their `devDependencies`, so electron-builder doesn't package them and Beachball
    accepts a released package depending on them.
  - **A change to a private package asks for a change file on what bundles it.** Beachball doesn't look inside private
    packages, so `scripts/changes.ts` does, following them through each other to the app and the CLI.
  - **`pnpm changefile --type patch --message "…"`** writes the missing change files without prompting, so sessions can.
    pnpm 12 has its own `pnpm change`, hence the name.
  - **Change files are checked from what's staged or committed, never the working tree.** `beachball check` counts the
    working tree, so in the folder sessions share it blocked commits on other sessions' unfinished edits. The commit
    hook runs `scripts/changes.ts check` on what's staged, the push hook `--committed` on the branch's commits, and CI
    both that and `beachball check` on its clean checkout.
  - **npm gets the packages whose package.json has a `publishConfig`,** which the CLI gets with its npm name,
    `@parity-app/cli` (PAR-13).
- **The CLI is packed for npm with `vp pack` (PAR-13).** My calls:
  - **The private packages it uses are bundled in, and npm installs only semver and TypeScript,** its dependencies. The
    build fails on any other package it would bundle, so a new one gets declared.
  - **The registry's files and `in-app.json` ship in `dist`,** where @parity/registry looks before resolving its own
    package, which the published CLI doesn't have.
  - **pnpm's `publishConfig` points `bin` and `exports` at `dist` when it packs,** so the workspace still runs the CLI
    from source.
  - **It needs Node 24,** as the repository does.
  - **Provenance comes from the CD workflow's `--provenance`, not `publishConfig`,** since npm only makes it in CI and
    the first version is published by hand, which npm needs before it can trust the workflow.
  - **`pnpm --filter @parity-app/cli try-packed` installs the packed tarball in an empty folder and runs it.** CI runs
    it on each system. The packed tarball is 2.6 MB.
- **Hooks keep what doesn't belong out of pull requests (PAR-3),** as you asked on 2026-10-29. My calls:
  - **A commit lints and formats its staged files, fixing what it can, and its subject must be conventional,** at most
    100 characters (4 of the last 400 were longer) and not work in progress. A fixup commit can be made but not pushed.
  - **Types are checked on push and in CI, not on commit or in `pnpm verify`,** as you said, since type checking grows
    slow. On 2026-10-29 it took lint from 1.6 to 3.2 seconds.
  - **A push also checks formatting, lint, the pushed commits' messages and change files,** which catches a commit that
    skipped its hooks. It took 9 seconds.
  - **Focused tests and `debugger` were lint errors already.**
  - **Tests run on twelve workers locally and four in CI,** as Copacker's do, which you said suits your machine.
- **Pull requests are required on `main`, and CodeRabbit reviews each one,** as you asked on 2026-10-29. The ruleset
  comes with the repository (PAR-398). My calls:
  - **A pull request merges once CI, CodeRabbit's status and the title check pass and every thread is resolved,** with
    no approval required, since GitHub doesn't let you approve your own. CodeRabbit's findings are fixed or answered
    before merging, and a review that stops on an error fails rather than passing unreviewed.
  - **Merges squash,** so the title becomes the commit's subject, and CI checks it with `scripts/commits.ts title`.
  - **Nobody force-pushes to or deletes `main`,** and nobody bypasses the ruleset.
  - **Terraform writes the ruleset,** as it writes the GitHub settings the pipelines read, from the pipelines'
    `github-repository-rules` module (v1.2.0) so Buildkit, Better Apps and Copacker can take the same rules. Parity's
    `infra/github` uses it. Its two rulesets were made by hand on 2026-10-29 to match the module, so `main` was
    protected before Terraform could run here, and import blocks adopt them when `terraform-apply` first runs. The
    required checks are `CI passes`, the gate over CI's jobs, and `CodeRabbit`.
  - **`.coderabbit.yaml` reviews assertively,** with AGENTS.md and conventions.md as its guidelines, and leaves lint,
    format, types, tests and change files to CI, so its own linters are off. Its Linear integration stays off, which
    keeps private issues out of public comments.
  - **GitHub's secret scanning and push protection stay on,** as they are by default for public repositories.
- **Releases follow Buildkit's flow.** After CI passes on `main`, pending change files open a release PR that merges
  itself once its checks pass, and its version changes start delivery: the CLI to npm through trusted publishing with
  provenance, and the desktop app to GitHub Releases. My calls: installers come from electron-builder, since one tool
  makes installers, signs them and serves updates, and only the desktop app makes GitHub Releases, so the updater never
  mistakes a CLI release for an app update.
- **Desktop releases reach the beta first, and everyone when promoted,** as you asked on 2026-10-29: beta builds and
  production releases, promoted the way the web apps go from staging to production. My calls: a release is a GitHub
  pre-release until it's promoted, and promoting marks that same release a full one, so nothing is rebuilt; the beta is
  a Get beta updates setting rather than a second app; and electron-builder stays over Electron Forge, whose free update
  service ignores pre-releases and doesn't serve Linux. The work is PAR-11, PAR-12 and PAR-160.
- **Pull requests get a web preview of Parity's UI: its Storybook, deployed to Cloudflare,** as you asked on 2026-10-29,
  beside the unsigned installers. My call: not the whole app as a web app, since the project service needs Node for
  files, each project's Vite and the agent, and Storybook already runs the real UI against a stand-in service. The work
  is PAR-111 and PAR-113.
- **One shared template, `publish-storybook`, publishes Storybook to whichever environment the caller names,** as you
  asked on 2026-10-29: you publish pull-request previews, staging and production Storybooks often, from many
  repositories, each to a place of its own. A template any stage calls is named for what it does, not for a stage. My
  calls:
  - Where each goes is that GitHub environment's settings, which Terraform's `cloudflare-storybook` module writes: a
    static-assets Worker per environment, its URL, the account and a token. A new destination is a new environment, and
    production can wait for an approval.
  - A pull request's Storybook is a Worker preview named for it, as the HOA app's previews are, and
    `unpublish-storybook` deletes it when the pull request closes.
  - It publishes what it builds or an artifact an earlier job built, so staging and production can get the same build.
- **Cloud services come from Terraform, and the pipelines expect what it makes,** as you said on 2026-10-29. My calls:
  - Each repository that needs one has a Terraform project in `infra/`, with its state in R2 and Terraform and the
    Cloudflare provider at Copacker's versions.
  - Shared modules live in `betterapps-hq/pipelines/terraform/`.
  - Terraform also writes the GitHub variables and secrets the templates read, so a template only deploys, and skips
    with a notice until they exist.
- **The `cloudflare-storybook` module (pipelines v1.1.0) has three limits Cloudflare and GitHub set.** My calls on each:
  - Its deploy token has Workers Scripts Write across the account. Cloudflare can't hold a token that uploads assets and
    manages previews to particular Workers; the module's README says so.
  - The account's workers.dev subdomain is chosen once in the dashboard, the one step by hand: the provider has no
    resource for it, and the apply stops with a message when it's missing.
  - It writes into an existing GitHub environment, such as a web deploy's `production` with its protection rules, and
    only creates `preview` itself. Owning an existing one would reset its rules, and destroying it would delete the web
    deploy's secrets.
- **Parity's CI (PAR-2) runs `pnpm verify` through ci-verify on Ubuntu, Windows and macOS.** My calls:
  - Its `prepare` installs the fixture projects when any is missing, with Bun 1.4.3 and Corepack 0.35.0 pinned from npm
    on every system, and `npm ci` for the five fixtures `install-projects` doesn't know (buildkit, chakra, fluent,
    headless, mui). Their `node_modules`, about 2 GB per system, are cached on their lockfiles.
  - Runners get 45 minutes, since a run that installs the fixtures can outlast 30 on Windows.
  - After `pnpm verify`, each system also installs and runs the CLI's packed tarball (`try-packed`, PAR-13).
  - A second ci-verify call, `checks`, runs once on Ubuntu with full history: `pnpm check:types`, and on pull requests
    `beachball check`, `scripts/changes.ts check --committed` and `scripts/commits.ts title`. The title comes from the
    event's file, never through an expression. It has a concurrency key of its own, so it never cancels verify's run.
  - A `CI passes` job over both is the one check main's ruleset requires, with CodeRabbit, so the ruleset needn't change
    when jobs or systems do.
  - Vite Task's cache isn't kept between runs yet. `pnpm verify` runs through `vp run` since PAR-405, and ci-verify's
    `vite-task-cache` input turns the rest on.
- **Parity's checks are Vite+ tasks, so Vite Task replays one whose inputs haven't changed (PAR-405).** My calls:
  - The root `vite.config.ts` defines `check` (`vp check`), `test` (`vp test run`) and `types`
    (`vp lint --type-aware --type-check`). `pnpm verify` is `vp run check && vp run test`, `pnpm check:types` is
    `vp run types`, and the pre-push hook runs `vp run types`. The `check` and `test` scripts are gone, since a task
    can't share a script's name; that's also why the type task is `types`, so `pnpm check:types` keeps working.
  - Each task's inputs leave out the listings of `node_modules` and `node_modules/.vite`. On Windows Vite Task records
    them, and Vite and Vitest add folders there as they run, so every task missed on a fresh checkout and `check` missed
    after `test`. Files read inside `node_modules` still count.
  - `test` tracks what it reads, including the fixtures' installs, and stays cached: on this machine a miss took about
    1.5 seconds longer than `vp test run` alone (15.6 against 14.1), and a hit takes 1.3 to 2.1 seconds instead of 14. A
    change to a package's source or to a fixture reruns it.
  - Vite Task keeps one entry per task, so undoing a change reruns the task once more.
- **`betterapps-hq/pipelines` started with the setup action and ci-verify (PAR-110).** My calls:
  - The setup action checks out without keeping credentials, and on Windows turns off `core.autocrlf` first, since the
    runners' CRLF made Vite+'s formatter fail every file.
  - It picks Vite+ when the workspace names `vite-plus`, and plain pnpm otherwise.
  - Templates name the repository's own actions by a release's commit, which Dependabot moves, as they pin third-party
    actions. A tag under the old `Fencing-Club` name would have resolved to whoever claimed that name. And with pull
    requests required, a release's commit is only tagged after it merges, so a template pins the release before.
  - A caller's extra steps before verifying, such as Parity's fixture installs, go in ci-verify's `prepare` input, with
    their own cache.
  - It's MIT licensed, as Parity is.
- **ci-verify grew what onboarding the other repositories needed (v1.2.0).** My calls:
  - `env` takes `NAME=value` lines set before the install, since a caller's own workflow-level env doesn't reach a
    reusable workflow. Agency needs its registry overridden before `pnpm install`.
  - `NODE_OPTIONS` has an input of its own, because GitHub won't set it through `GITHUB_ENV`. It reaches only the
    caller's `prepare` and `command`, so an option like `--require` can't break the checkout.
  - Turborepo's `TURBO_TOKEN` and signature key are optional secrets passed by name. They reach only `prepare` and
    `command`, never the install and its scripts.
  - `concurrency-key` replaces the branch in the run's group, so Copacker's runs on main stop cancelling each other, and
    Parity's two calls stay apart.
  - Where a branch rule needs a check's older name, as Buildkit's needs `verify`, a small gate job keeps it, since a
    called workflow's checks are named `<calling job> / Verify (<runner>)`.
- **Pipelines are shared across Parity, Buildkit, Better Apps and Copacker,** from one repository of templates, as you
  asked on 2026-10-29. Each repository has thin top-level pipelines, one per stage (CI, previews, the release PR, and CD
  split by what's delivered: npm packages, the desktop app, web apps), calling reusable workflows and composite actions
  from it. My calls: the repository is public, because callers span `AndrewCraswell` and `betterapps-hq`; callers pin a
  full commit SHA that Dependabot moves; and CI is shared as far as `pnpm verify`, with each repository's extra jobs
  beside the call.
- **The shared pipelines live in `betterapps-hq/pipelines`, with a folder per CI system** (your call, 2026-10-29, Q8):
  `github/` holds the composite actions and their docs. Reusable workflows can't go there, because GitHub only calls
  them from a repository's own `.github/workflows/`, so they live there, named by stage.
- **Conventions from the agency monorepo are in [conventions.md](conventions.md),** as you asked on 2026-10-29. My call
  on which: finish a change before checking it, fix forward, ask before adding a dependency, no dot glyph as a
  separator, and try changes people see in the running app. Its Turborepo, shared config packages, "prefer `type` over
  `interface`", React Compiler rules and library catalogs aren't taken; the proposal says why.
- **Once releases ship, a change to `.par` or `.lib.par` still reads the old format.** My call, and the one exception to
  fixing forward: people's saved files outlive the version that wrote them.

## Packages

How Parity's code is split, so the parts that change most are easy to find, replace and test. You asked for this on
2026-10-28, expecting design-to-code and code-to-design to need a lot of iteration. The proposal is
[proposals/packages.md](proposals/packages.md). These are my calls; change any of them.

- **Logic lives in packages that take data and return data,** with tests that run without Electron. The app's main and
  service processes do the files, IPC and processes, and the renderer keeps the views. You chose how far the lint guard
  reaches on 2026-10-29 (PAR-5), and the root `vite.config.ts` holds it:
  - A package is pure unless that file names it: nothing from Node, React, tldraw or Electron, and only other pure
    packages. A new package starts pure, so nobody has to remember to guard it.
  - `@parity/code`, `@parity/project` and `@parity/registry` are readers. They read a project's files, since
    TypeScript's program and the project's discovery read as they go, but never write them or start processes; a reader
    that needs a file changed returns a project edit. They use no React and depend only on pure packages and other
    readers.
  - The CLI, libgen, the agent runtime, the adapters and the fixtures are the edge, where Node belongs, and
    renderer-react uses React.
  - No package imports Electron, tldraw or the app. Tests may use Node to set up files.
- **Design and code sync gets one package, `@parity/code`,** which also takes over the three component readers
  (`project/components.ts`, `libgen/components.ts` and `@parity/props`), so one TypeScript program per project serves
  them all. Generating component files, reading them back and the drift review are built there, with golden-file tests.
- **Every write into a project goes through project edits** (PAR-6): edits built as data, shown as a diff, applied and
  undone together. They come before the components work, so PAR-85 waits on them. Writing back from the lenses keeps its
  place at the end of the lens order. They were called changesets until you asked on 2026-10-29, since the word read as
  the versioning tool and Parity versions with Beachball. My calls in building them:
  - An edit expects what it finds: a file that changed since the edit was built is left alone, and the whole edit with
    it, rather than overwritten. Undo is the edit reversed, so it refuses the same way once a file has changed again.
  - The service keeps a project's latest 50 edits to undo, and no more than 64 MB of the files they wrote, since a
    pasted image can be 20 MB. They outlast the project closing, because the window reopens a project to pick up what an
    edit changed.
  - Only importing a library's styles says what it wrote, with the diff and Undo, as it's a one-off change to the
    project's own stylesheet. Token edits take their undo from the design's history (PAR-164), and saving them goes
    through a project edit underneath. A pasted image stays a design step: its file is named by its content, so pasting
    it again reuses it, and undoing the paste leaves the file, as before.
  - Installing a library imports its styles through a project edit too, but doesn't offer Undo, since undoing the import
    would leave the package installed.
- **Editor behaviour moves into `@parity-app/editor`,** one file at a time with tests: arranging and the clipboard first
  (PAR-7). It's named in the `@parity-app` scope, the CLI's, because you asked on 2026-10-29 for every package to move
  there (PAR-425); the rest keep `@parity/` until then. My calls in starting it:
  - Each rule takes a design, or the documents designs are in, and returns it changed, with what the app needs next: the
    copies' ids, the new layout's id, the layout to select. The same object back means nothing changed, so the store
    records no step. The app keeps the undo labels, the messages, the selection, the system clipboard, saving images and
    the designs' boxes on the canvas, which it measures with tldraw and passes in.
  - The state being edited is passed in as a `StateSpec`. `editingState`, which picks it, stays in the app's
    `LayerPanel.tsx` until a package needs to choose it.
  - The rules have names of their own (`removeLayers`, `copyLayersInPlace`, `wrapInLayout`, `styleOf`, `applyStyle` and
    so on), so the app's commands keep theirs and nothing is imported under another name.
  - `paste-over.ts` moved with the clipboard, with its tests, since it was already pure and is where pasted layers go.
    `paste-here.ts` stays until drop rules move (PAR-33), as it uses `drop-slot.ts`'s `slotAt`, and `free-space.ts`'s
    `freeSpotBeside` until placement does (PAR-32).
  - Reading the clipboard's envelope checks more than it did, since it's data from outside the app: the project must be
    text, and the payload one of the three kinds, its layers, designs or notes checked by core's `.par` parsers
    (`parseDesignNode`, `parseCanvasDocument`). A copy that fails pastes nothing, with a message, instead of throwing
    partway or pasting its JSON as text: `isParityCopy` tells the app the text was a Parity copy all the same.
  - A pasted design keeps its id when it's free, as the clipboard's comment always said. Before, every pasted design
    took an id made from its name, so one whose id wasn't its name's lost it.
- **Lenses and adapters never go in core.** Lens models are schemas in `@parity/models`, each lens is a package, and so
  is each adapter, such as Drizzle or TanStack Router.

## What Parity supports

[support.md](support.md) has what works today, what each feature depends on, and the requirement tiers.

- **Four kinds of requirement.** You agreed to these as recommended.
  - **Fixed:** a Node package, a web UI drawn to the DOM, ES modules from a dev server, styles as stylesheets, tokens as
    CSS custom properties, and `.par` files. No adapter removes these.
  - **Expected for now:** TypeScript, React 19, Vite 7 or later, Tailwind CSS v4 and named exports. Nothing else is
    built for now; a project without one gets less, and an adapter can lift it later.
  - **Standards** are read from whatever tool writes them, and **adapters** come one per tool.
- **TypeScript is expected, not required.** JavaScript projects keep rendering, and no JavaScript-only fallbacks get
  built.
- **React and Vite only, until a second adapter is asked for.**
- **No test runner is required.** When tests come in, results come from JUnit XML and coverage from LCOV.
- **Tokens must compile to CSS custom properties,** from any source format.
- **Anything released more than two years ago is dropped,** counted from each version's own release: "drop anything
  released more than two years ago, even React 18." The exception: "a tool's newest major version is never dropped," so
  React 19 and Fluent UI v9 stay.
- **Dropped means untested, never blocked.** In your words: "By drop support, I didn't mean prevent others from using
  those versions, just that we don't actively test and support them." A dropped version gets no fixes or validation
  project, but a project using it opens and runs as far as it can, with no popup. The only sign is a quiet line in the
  status bar's tooltips and `detection.notice` in the agent API.
- **Other tools' configs load through `unconfig`, not `c12`,** since it's built for reading other tools' configs and
  reads rc files too, so `lilconfig` isn't needed. A tool with its own loader keeps it, as Vite does with
  `loadConfigFromFile`. You agreed: "As long as we're already using unconfig then it's good."
- **Fluent UI v9 and Fluent icons are planned,** for corporate customers: "These will be great for onboarding some
  corporate customers." support.md has the plan.

## App lenses

A lens is a view of one layer of an app, such as its routes, data, API, permissions or flags. The proposal is
[proposals/app-lenses.md](proposals/app-lenses.md).

- **Each lens reads an open standard where one exists.** You agreed to this. The standards are OpenAPI, AsyncAPI, JSON
  Schema, OpenFeature, OpenTelemetry, ICU messages and DTCG tokens. Any tool that produces one works without Parity
  knowing about the tool.
- **Where there's no standard, an adapter per tool fills one shared model for the lens.** Routers, auth roles and ORM
  schemas have no standard.
- **Standards first, then adapters.** You decided this: "We focus on standards first, then adapters/plugins." Each lens
  works from its standard before any adapter for a particular tool is built. Web apps and their backends come first; the
  plan is [proposals/web-and-backend.md](proposals/web-and-backend.md).
- **Lens priority: databases, the API, routes and mock data, then telemetry.** You set this order: "1) Databases 2)
  API 3) Telemetry", then placed the rest: "Routes and mock data should come before telemetry, right after the API."
  Mock data includes the scenarios that fill designs. Telemetry means OpenTelemetry from the running app: traces linking
  a click to its handler and queries, with errors and timings. It moves up from later.
- **Each lens's first adapter comes right after its standards pass, before telemetry,** so the lenses work on TanStack
  and Drizzle projects first. Then telemetry, then links from code, then writing back. You chose this on 2026-10-28.
- **Tests, coverage, the gaps report and performance come later.** You decided this: "These feel like they are value-add
  after everything else. I would not prioritize them now." Tests recorded in interact mode wait too: you said they'd be
  recorded and, with Storybook in the project, also written back to Storybook, "but it's not a priority."
- **No source is ever required.** A lens with nothing to read stays out of the way.
- **Parity writes into a project only in the project's detected style, and only where an adapter knows how.** Reading
  can stay neutral, but what's written has to fit the project.
- **The first adapters are TanStack Router and Drizzle.** You said: "Let's start with Tanstack and Drizzle. These are
  what we're working with mostly today." The rest of the example's stack is the scaffolder's to choose.
- **Each lens is its own canvas page,** with links jumping between pages, and the design canvas stays the main view.
- **Designs bind to API data.** A layer's text, or a repeated layer, binds to fields of an operation's response, filled
  by the design state's scenario.
- **The API model is operations, always exportable as OpenAPI 3.2,** with server functions as marked operations.
- **Databases: local and development first.** Production is only an opt-in, read-only connection per database.
- **The schema in the code comes from replaying its migrations into an in-memory database** and reading the catalog.
- **The `.par` is the source, and a `.parity/` folder holds files written from it.** You called this a hard compromise:
  everything in the project file is best, but "for flexibility, we should put things in the .parity folder when we need
  to," at the cost that a `.par` can't be shared without its files. So scenarios, mock data and seed data live in the
  `.par`, and only files other tools must import, such as MSW handlers and seed scripts, are written to `.parity/` from
  it. A `.par` copied on its own then loses nothing, and the folder can be written again. Hand-written files that are
  Parity's, such as `.parity/preview.tsx`, live there too.
- **Traces come from local development first.** Production telemetry comes later and is opt-in, with keys stored in the
  system keychain.
- **The second example is a Buildkit scaffolder project,** once the scaffolder can make one. You said: "I don't know if
  scaffolder is ready, but yeah, that's the preferred route."

## Extensions

Everything Parity recognises, connects to or deploys to would be an extension: an adapter, a connector or a deploy
target. The proposal is [proposals/extensions.md](proposals/extensions.md).

- **Nothing is open source yet.** You decided this: "Don't open source anything now, we're too early in the building."
  That covers the app, the plugin interfaces, the models and the manifest formats.
- **`.lib.par` grows to describe icons, fonts and plugins,** rather than a `parity` section in `package.json`.
- **Most adapters and connectors ship with the app.** You see them as the way people help Parity support more tools. A
  project can also add its own.
- **Deploying goes through Better Apps' deploy only, for now.** You asked whether a Terraform target would cover
  everything. It would provision almost anywhere, but it doesn't build or upload the app, someone still writes modules
  for each cloud, and it needs remote state and credentials. It could be a later target, as OpenTofu, for teams that
  already manage infrastructure that way.
- **Every plugin is code.** `.lib.par` is the data a library, icon set or font uses to describe itself, and presets for
  file-based routers are a detail inside Parity's own route plugin, not something people add. You chose this on
  2026-10-28.
- **A project adds its own adapters, plugins, integrations and settings in `parity.config.ts` at its root.** You said a
  config file "is going to be necessary. This is where you might add adapters, plugins, configurations, integrations,
  decorators, etc." It's optional: what Parity can infer still needs no config. It runs in the project service, so
  decorators, which run in the frames, stay in the preview file, as Storybook keeps `main` and `preview` apart.
- **Adding tools such as Sentry, PostHog or LaunchDarkly comes later,** from a CLI, through recipes or the scaffolder.
  You said it "belongs in the backlog -- not a priority right now."

## Not done yet

Planned work, and what's waiting on you, is in Linear, as [work.md](work.md) says.
