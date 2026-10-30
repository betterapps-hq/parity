# The editor

What Parity's canvas editor does, how each part of it works, and the tests that keep it working. You asked on 2026-10-29
for every piece of editor work to land with tests and a description here, so nothing gets lost or quietly breaks.
Shortcuts are listed once, in the keymap ([chrome/keymap.ts](../apps/desktop/src/renderer/chrome/keymap.ts)) and the
Keyboard shortcuts dialog; this page says what they do. What's decided and why is in [decisions.md](decisions.md).
Features built before 2026-10-29 are being added under PAR-392 in Linear.

## How to keep it

- **Each feature has a section** under its area: what it does from the person's side, the rules it follows, including
  the edge cases, where its code is, and the tests that cover it, by file.
- **Change the section in the same commit as the feature.** A behaviour that changes while its section doesn't is a
  regression nobody will notice.
- **Name the gaps.** When part of a feature has no automated test, its section says so and how it was checked instead.

## Testing in the app (PAR-202)

`pnpm test:app` drives a copy of Parity as a person does, with the system's own pointer and keyboard, and checks what
the canvas, the panels and the project show: 63 tests, which take four to six minutes. It isn't part of `vp run test` or
`pnpm verify`. The pre-push hook runs it when the commits a push sends change the app, its packages, the example or the
workspace's build files (`scripts/app-tests.ts`), and a failure stops the push. CI runs it on Windows for every pull
request and every push to main, without blocking the merge until it runs reliably there (PAR-438). While working, run
only the files a change touches, such as `pnpm test:app keyboard`, rather than the whole suite after each change: each
run opens a Parity window. Each feature's tests below name the end-to-end ones that cover it.

- **What it starts.** `apps/desktop/e2e/global-setup.ts` copies `examples/shadcn-vite` to a temporary folder, linking
  its `node_modules` rather than copying them, and adds a Members screen: three `MemberRow({ member })` rows, a fragment
  and an email field. It starts Parity on the copy through `scripts/dev.ts`, with its own user data, agent file and a
  1440 by 900 window, on ports 5385 and 9385, or on ports the system picks when those are taken. When the run ends it
  stops that copy by its process id and removes the folder. On a picked port it also removes the build and dependency
  cache that port made, which the suite's own port keeps. The example itself, and any other copy of Parity running, are
  left alone.
- **How a test drives it.** The files run one after another against that one window, through the DevTools protocol with
  playwright-core. `App`, in `e2e/app.ts`, has the gestures: `click`, `rightClick`, `drag`, `selectDesign` by its title,
  and `selectLayer`, which clicks a layer and double-clicks down to it as a person does. Every test selects layers
  through it, so a change to clicking is made there alone. `App` reads what happened from the page (`children`, `style`,
  `selection`, `drawn`, `outlines`, `labels`, `undoLabel`) and never sets state to make something happen, apart from
  `show`, which puts a design in view at a zoom, and `reset`, which undoes everything after each test. Copy and paste go
  through a stand-in for the clipboard on the page; the system's clipboard is never read or written.
- **Adding a test.** Put it in its area's file (`selecting`, `menus`, `moving`, `keyboard`, `fields`, `reopening` or
  `sleeping`), or in a new `apps/desktop/e2e/<area>.e2e.ts` that connects before all, resets after each test and closes
  after all, as the others do. Start with `app.show(design, zoom)`, act through `App`'s gestures or `app.page.keyboard`,
  and wait for what changes with `expect.poll`, since the app answers a frame or more later. Change the project only
  through edits Undo takes back, so `reset` can put it back. Then name the test in its feature's section here.
- **The page never scrolls.** `App` counts each time the window's page scrolls, and `reset` fails the test it ran in if
  it did, or if the page isn't at the top, then puts it back so the tests after start clean. A scrolled page moves the
  canvas without tldraw noticing, so every click after it lands off by as much (PAR-424, "The window", below). Until
  PAR-424 the harness put the page back at once and only warned, which hid the bug.
- **What it can't see.** What tldraw draws on its own canvas, such as a board's hover outline, isn't in the page, so
  it's read through tldraw's editor (its box) or not at all.

## Selecting

How a click, a drag or a key picks layers and designs, and how the canvas finds and outlines them.

### Finding a layer's DOM (CAN-45)

Any layer can be hovered, clicked, outlined, measured and dragged, including a component that takes the props it needs
and renders none of the rest, such as `function MemberRow({ member })`. The canvas finds what each layer draws from
React's own tree, the way React DevTools highlights a component, rather than from an attribute the component would have
to pass on to its DOM.

- **How it's found.** The guest draws every component layer inside a boundary of its own, which carries the layer's id,
  and every layout, text and image layer as an element with a `data-canvas-node` attribute. When the canvas asks, the
  guest walks the frame's React tree from its root, the boundaries and those elements marking where each layer starts.
  Going down from a layer, the first element on each branch is the layer's, and nothing inside that element is: a card's
  box is its own root element, not the children inside it.
- **A layer's box** is the box around everything it draws at its top level. That's one element for most layers, each
  root of a component that returns a fragment, and for a component that draws only what it's given (a provider), the
  top-level elements of the layers inside it. An element that isn't drawn, such as one with `display: none`, is left out
  unless nothing else is drawn, and so is one clipped to nothing, such as the hidden input a checkbox draws for forms
  (PAR-163, below).
- **A point belongs to the innermost layer** whose elements hold it. The layers under a point, outermost first, are the
  ones whose boxes hold it, as before. A field built around an inner input is outlined around the field: its props, and
  so the attribute, reach the input, but its box is its outer element, and the input belongs to it.
- **Nested layers keep their own DOM.** A layer's elements stop at the layers inside it, so pointing at a card's title
  picks the title, and a layer's parent is the layer it's drawn inside.
- **Edge cases.** A component that draws nothing has no box: it can be selected from Layers but not on the canvas.
  Content portaled out of the frame, as a dialog's often is, isn't part of the layer's box; content portaled to a place
  inside the frame is. A component that draws only text, with no element around it, has no box of its own either. A slot
  a component draws more than once, as a list's `renderItem`, is one layer whose box covers every copy. A component that
  fails draws its error box in its place, and that box is the layer's.
- **Hovering stays cheap.** The walk runs once after the frame changes, when React commits it or DOM is added to or
  taken from it, and every lookup until then reuses it, so moving the pointer only measures boxes. Measured in the app
  on 2026-10-29: finding the layers under a point took about 0.15 ms on Sign in (45 layers) and 0.75 to 0.9 ms on the
  example's largest frames (about 330 layers and 470 elements), where the attribute lookup it replaces took 0.7 to 1 ms;
  walking React's tree again after a change took 0.2 to 0.6 ms on those largest frames.
- **It fails soft.** This reads React's internals as React 19 has them: the root's `_internalRoot.current`, else the
  container's `__reactContainer$` key, and each fiber's `child`, `sibling`, `stateNode` and `memoizedProps`. If they're
  missing, or the walk places an element the guest drew in another layer, the frame's lookups use the `data-canvas-node`
  attribute as before, which finds only components that pass their props to their DOM. The guest still passes the
  attribute to components as a prop, where it does no harm, so that fallback and the scripts that count drawn layers
  keep working.
- **When a component doesn't take `style`.** What a design sets on a component (size, spacing, place, fill) goes to its
  root through its `style` prop. When the props the type checker reads have no `style`, the inspector says so above the
  styles, "MemberRow doesn't take a `style`, so the size and styles below don't change it. Wrap it in a layout and size
  that instead.", with a Wrap in layout button (Ctrl G). Inside an instance the note shows without the button, since
  that belongs in the component design. Props typed `any`, `object` or with an index signature could take anything, so
  the note doesn't show for them.

Code: the walk is `packages/renderer-react/src/drawn-nodes.ts`, the guest's side (boundaries, when to walk again, the
check against the attribute) is in `guest.ts`, and the canvas's lookups (`findNodeElements`, `nodeBox`, `nodesAt`,
`nodeParent`, `nodeOfElement`, with the attribute as fallback) are in `apps/desktop/src/renderer/frame.ts`. `ModeView`
and the offscreen renderer (`render.ts`) register each frame's guest. Hovering and clicking go through `canvas/hit.ts`,
outlines, sizes and resize handles through `canvas/CanvasOverlay.tsx`, dragging through `canvas/layer-drag.ts`,
inserting through `canvas/insert.ts`, and `chrome/reveal.ts` scrolls to a layer's box. Whether a component takes `style`
is read in `packages/code/src/props.ts` (`takesStyle`), and the note is in `chrome/LayerPanel.tsx`.

Tests:

- `packages/renderer-react/src/drawn-nodes.test.ts`: the walk on fibers shaped as React 19 makes them: a component that
  ignores its props, a fragment, a field around an input, nested layers, a provider, a component that draws nothing,
  portals in and out of the frame, a slot drawn twice, and giving up on a tree that isn't one.
- `apps/desktop/src/renderer/frame-nodes.test.ts`: the same cases on React itself in Chrome, through the canvas's
  lookups: each layer found, its box measured and resolved from a point, DOM a component adds by itself, ids React moves
  to other DOM without adding any, and the fallback to the attribute. Seven of these eight fail with the attribute
  alone, the prop-ignoring row first. It also renders slots that hand their layers props, Radix's `asChild` and a
  `$renderWith:` slot, and keeps the two cases below that don't work yet as `it.fails`.
- `packages/code/src/props.test.ts`: whether a component's props take a `style`.
- `chrome/LayerPanel.stories.tsx`, ComponentWithoutStyle: the note, and wrapping the component from it.
- `apps/desktop/e2e/selecting.e2e.ts` (6), end to end (PAR-202), on the Members screen the run adds: hovering a
  `MemberRow` outlines it; a click selects it, with its outline, its name and size, and the inspector's note; Wrap in
  layout from the note; dragging it to reorder, with the copy where it lands, and one undo; the email field outlined
  around its input; and the fragment around both of its elements.

Gaps: the canvas's pointer handling over such a component, first checked by hand on 2026-10-29, is now the end-to-end
test above. A component that declares `style` but puts it on an inner element, as a field passing it to its input, is
outlined around the field but sized at the input, and the note doesn't say so. A component layer in a slot doesn't get
the props its parent hands it: a `Button asChild` around a `Link` layer leaves the link without the button's class,
attributes and handlers, and a `$renderWith:` slot's component layer without what it's rendered with. Both clone the
slot's element, which for a component layer is the guest's error boundary around it, and the boundary drops them. An
element layer gets them. This is older than CAN-45: the boundary dates from the first commit and `$renderWith:` from
7c9c8c3.

### Selecting what you point at (PAR-163)

A board works as Figma's top-level frames do: a click inside it selects what's under the pointer, and the board itself
is selected by its title or its background. The editor audit took four double-clicks and 2.3 s to reach a stat card in
the example's dashboard.

- **A click** inside a frame selects the top-level layer under the pointer, in any design, whatever was selected before.
  In the dashboard a click on a stat card selects Main. The press never reaches tldraw, so it doesn't select or move the
  board.
- **The board** is selected by its title, by its background around the frames, which stays tldraw's (a drag there moves
  the board), or by a click on a frame's background, where no layer is. Shift on a frame's background adds the board to
  the selected designs or takes it out, as Shift on its title does.
- **Further clicks** work as before. With a layer of the design selected, a click picks among its siblings under the
  pointer, keeps it when the pointer is inside it, and goes back to the top level outside its group. Each double-click
  goes one level deeper under the pointer: its first click selects what a click would, and the double-click the layer
  inside that. A double-click edits text only on a selected text layer that's the deepest thing under the pointer. The
  stat card takes three double-clicks (Content, Stats, then the card), where it took four.
- **Ctrl-click** selects the deepest layer under the pointer, inside instances too. On a layer's own edge, where none of
  the layers inside it are, that's the layer itself: Ctrl-clicking a stat card above its header selects the card.
- **Shift-click** adds what a click would select to the selection, or takes it out, as before.
- **Enter** on a text layer, or on a component whose child is text, starts editing it in place. Otherwise it selects
  every layer inside the selected layers, or inside the selected design (the one picked last, when there are several),
  in the frame they were picked in; with a mode column selected, in that mode's frame. Inside an instance those are the
  component's layers. On a layer with nothing inside, Enter does nothing. Shift+Enter still selects the parent.
- **Dragging a layer that isn't selected** selects it as it's pressed and moves it, as dragging a selected one does, and
  never the board. Pressing a selected layer still keeps the whole selection, to drag all of it. A press drags what a
  click would select, so a plain drag on a stat card moves Main, and Ctrl-dragging the card by its edge moves the card.
- **A box drawn from a frame's background** selects the frame's top-level layers it touches, updating as it's drawn, as
  Figma's and tldraw's boxes select what they touch. It's tldraw's own box. With Shift they're added to the layers of
  the design already selected. A box that touches nothing selects nothing, and Escape puts back what was selected before
  it. A layer that isn't drawn is never touched.
- **Hovering** outlines what a click would select, Ctrl included, in the frame under the pointer, in any design, not
  only in the one selected. Over a frame's background, and around the frames, no layer is outlined and tldraw outlines
  the board; over a layer, the board isn't outlined as hovered. Alt still outlines the deepest layer and measures to it
  from the selected layer, both as the hovered frame draws them. Hovering in Layers outlines in the frame the selection
  was picked in, as before.
- **Edge cases.** A free text note over a board keeps the press and the double-click, as before, and notes, the only
  things on the canvas that aren't on a board, work as they did. A layer's box leaves out elements clipped to nothing,
  such as the hidden input Base UI's checkbox draws at its frame's corner: that input stretched the checkbox's box over
  the frame's top left, so a click on Sign in's background selected its card. Pressing near a selected layer's edge
  grabs its resize handle, as before, so a double-click there goes no deeper.

Code: the rules are in `apps/desktop/src/renderer/canvas/pick.ts`, which takes ids and returns what to select:
`pickLayer` (a click and Ctrl), `pickDeeper` (a double-click), `pressTarget` (a press: select, keep, toggle or the
background), `hoverTarget`, `boardClick`, `touchedBy` and `boxSelection` (a box), and `enterTarget`. `canvas/hit.ts`
finds what's under the pointer and hands it over (`underPoint`, and `selectedIn` for the selected layer and the layer it
sits in). `canvas/CanvasOverlay.tsx` handles the pointer ahead of tldraw and outlines the hover in its frame;
`canvas/select-box.ts` (`pressBackground`) follows a press on a frame's background; `canvas/layer-drag.ts`
(`pressLayers`) drags as before. `canvas/CanvasEditor.tsx` (`ShapeIndicators`) leaves out the board's hover outline
while a layer is hovered. Enter is `selectChildren` in `chrome/commands.ts`, with `childLayers` in `canvas/layers.ts`,
and the keymap calls it "Select the layers inside, or edit text". A hover carries its frame's mode and state
(`selection.ts`), and `elementBox` in `frame.ts` leaves out clipped elements.

Tests:

- `canvas/pick.test.ts` (27): on the dashboard's layers, a click with nothing selected, the background, siblings of the
  selected layer, keeping it, leaving its group, siblings inside an instance, Ctrl, Shift; double-clicks one level at a
  time, into an instance, at the deepest layer, and the stat card in three or one Ctrl-click; hovering in an unselected
  design, the background, Alt; what a box touches, what it selects, Shift, touching nothing; a click on the background
  and Shift there; and Enter, with the real store, on a design, a mode column, a layout, an instance and a layout inside
  one, several layers, text and a component with text, and a layer with nothing inside.
- `canvas/CanvasOverlay.test.ts` (12), in Chrome: the overlay over two frames of a dashboard drawn by `ModeView` and the
  React guest, with the real mouse, and an element standing in for tldraw's canvas. A click selects the top-level layer
  and keeps the press from tldraw, a frame's background selects the board, a checkbox's hidden input doesn't stretch it
  over the background, the board's own background reaches tldraw, double-clicks go a level deeper each, Ctrl and Shift,
  dragging an unselected layer moves it, a box selects what it touches in its frame and Escape puts the selection back,
  and hovering outlines what a click would in the frame under the pointer, and nothing over the background. All but
  Ctrl's and the board's own background fail against the overlay as it was.
- `apps/desktop/e2e/selecting.e2e.ts` (9), end to end with tldraw (PAR-202): a click on a stat card selects Main and
  leaves the board where it was; three double-clicks reach the card, and a Ctrl-click above its header the card itself;
  a click on a frame's background selects the board; the board moves by its own background and by its title; a box from
  Sign in's background selects the card and the terms, with tldraw's box there while it's drawn and gone after; Enter on
  Stats selects its four cards, and on the greeting edits it; an unselected layer dragged moves without the board; a
  card Ctrl-dragged by its edge moves; and hovering a card in an unselected design's dark frame outlines Main there.

Gaps: tldraw isn't in the Chrome test; its box, the board moved by its background and title, and Enter are in the
end-to-end test. The board's hover outline is drawn on tldraw's canvas, out of the test's reach, so it was checked in an
isolated copy of the app on the example project on 2026-10-29, with the rest. There, a click on a stat card selected
Main; a box from Sign in's background over its card and terms selected both, with tldraw's box drawn and gone after; a
click there selected the board and a drag on the board's own background moved it; Enter on Stats selected its four cards
and on the greeting started editing it; Sign in's terms dragged above the card moved, and the Revenue card Ctrl-dragged
past Issues moved, each with the board left where it was; hovering a card in the dark frame outlined Main there and not
the board. Ctrl-clicking the stat card took 333 to 497 ms from the press to the frame after the selection drew (two runs
of five), and three double-clicks 1.3 to 2.1 s, sent as soon as each selection drew; the five selections the old way
made, set one after another as fast as they drew, took 1.06 to 1.37 s, before counting the gestures. Ctrl doesn't change
what a box selects, where Figma's selects the layers deeper inside. Right-click's Select layer, listing everything under
the pointer, is PAR-168.

### Right-click menus (PAR-168)

A right-click on a design opens Figma's canvas menu, as far as Parity's commands go, for what's selected. Each item
shows its keys from the keymap as the menubar shows them (`ContextMenuShortcut`, through `formatKeys`), and runs the
menubar's command. The Layers panel's menu is unchanged.

- **The items**, in groups with a line between them: Select layer; Copy, Paste here, Paste over selection, Paste to
  replace and Duplicate; Bring to front, Bring forward, Send backward and Send to back; Wrap in layout, Make component
  and Go to the main component; Hide. Labels are the menubar's, except that Go to names the main component ("Go to Plan
  card"), Hide reads Show when every selected layer is hidden in the state being edited, and Make component, with a
  design selected on its own, reads "Make it a component", or "Make it a screen" on a component. Paste here has no keys.
  Lock comes with PAR-192, and Open in editor and Copy as JSX with PAR-166; they have no placeholders.
- **With designs selected**, what's only for layers is left out: Paste to replace, the order, Wrap in layout and Hide.
  Go to the main component is there only with an instance selected.
- **Unavailable** items are greyed: the order and Make component with several layers selected, Make component with
  several designs, and, for layers inside an instance, Copy, Duplicate, the order, Wrap in layout and Hide. Paste over
  selection and Paste to replace stay for those, and say why they can't.
- **Around the designs** the menu is Paste here, then Select all and Zoom to fit.
- **A right-click selects first**, what a click there would select (Ctrl-right-click the deepest layer), unless the
  pointer is inside the selection: over a selected layer or a layer inside one, or anywhere in a selected design when no
  layers are selected. Then the selection stays and the menu acts on all of it. On a frame's background, or around the
  frames, it selects the design. A selected layer's resize handle, which reaches a little past its box, keeps the
  selection.
- **Select layer** lists the design, then every layer under the pointer, outermost first, layers inside instances
  included (from `nodesAt`), named and drawn with the icons Layers gives them, with a check on those selected. Pointing
  at an entry, or reaching it with the arrow keys, outlines its layer in the frame that was right-clicked; choosing it
  selects it there, and choosing the design selects the design.
- **Paste here** pastes what's on the clipboard where the pointer was, whatever's selected, as one undo step ("Paste
  layer here", "Paste design here"), and selects the copies.
  - Designs go on the canvas with their top left at the pointer, sitting as they sat together. Notes do the same.
  - Layers, text and images go into the deepest of the design's own layouts under the pointer, in the frame there, at
    the slot under the pointer, where a dragged layer would land (`slotAt`). A hidden layer isn't a slot. A layout
    inside an instance is never the target.
  - In a layout that's absolutely placed in the state shown, the copies go last, on top, at the pointer: their left and
    top in half steps of the spacing scale from inside its border, in place of their own insets. A copy that's
    absolutely placed itself goes in the slot, and at the pointer.
  - Over a design with no layout under the pointer, nothing is pasted, and a toast says so. Around the designs, text
    becomes a note at the pointer, and layers a new screen there.
- **Where the right-click lands decides.** tldraw keeps the system's menu from the canvas, pans while the right button
  is dragged (no menu then), and when the button comes up without panning, selects the board under it and sends a
  `contextmenu` of its own, for a release anywhere over the canvas. So the menu reads the selection, the target and Ctrl
  when the button goes down. A design's title keeps its own menu, and state labels, toolbars and text being edited open
  none. A text note over a board gets the menu for around the designs.
- **Interact mode:** the design gets the right-click, and no menu opens.
- **Keys after an item** are the canvas's at once (PAR-424). A menu holds focus for the 100 ms or so it takes to fade
  out, so the canvas's shortcuts treat a menu, list or dialog that's closing (`data-state="closed"`) as gone, a field in
  it included: Ctrl+Z pressed straight after Duplicate undoes it, where it used to go to the closing menu and do
  nothing. This holds for the menubar's and the title's menus, and dialogs, too.

Code: the menu's contents are `canvasMenu` in `apps/desktop/src/renderer/chrome/canvas-menu.ts`, which takes the
selection and the design under the pointer and returns the items, available or not, in order, with Select layer's list;
`rightClickSelection` there is what a right-click selects. `chrome/CanvasMenu.tsx` is the context menu around the canvas
area in `ProjectView.tsx`: it records the right button's press, finds the design under the pointer with `hitTest` and
`pickLayer`, outlines Select layer's entries through the hover, and runs items through `actions.ts`. Paste here is
`pasteAtPointer` in `canvas/clipboard.ts`, which reads the clipboard and places designs, notes and text; layers go
through `canvas/paste-here.ts`, where `measureHere` measures the layout under the pointer in its frame and `pasteHere`
places the copies. Which keys an open menu keeps is `inMenu` in `canvas/shortcuts.ts`.

Tests:

- `chrome/canvas-menu.test.ts` (17): one layer's menu in order with its keys, an instance's Go to, several layers, Show
  and Hide in two states, a design's menu and its Make component label, several designs, a layer inside an instance, the
  menu around the designs; Select layer's list, names, checks and the design's kind; and what a right-click selects on a
  layer, a frame's background, around the frames, the root, inside the selection, outside it, and in a selected design.
- `canvas/paste-here.test.ts` (12): the dashboard's stats row, at the slot under the pointer, first and last, several
  copies together, fresh ids, a hidden card skipped, an empty layout; an absolutely placed layout at half size, half
  steps, a copy's own insets replaced; an absolutely placed copy in the slot; a state that places the row absolutely;
  and nothing pasted into a layer that isn't a layout.
- `canvas/paste-here-frame.test.ts` (4), in Chrome: `measureHere` on a grid drawn at half size, with a hidden card, the
  slot under the pointer, first and last, at the pointer inside an absolutely placed layout's border, and the deepest
  layout.
- `chrome/CanvasMenu.stories.tsx` (7 stories, under Parity/Chrome/Canvas menu), on the real canvas with tldraw: Layer,
  Instance, SeveralLayers, Design, EmptyCanvas, SelectLayer and Interacting. Each right-clicks through tldraw's pointer
  events and checks the selection, the items, what's unavailable and the keys; SelectLayer checks the list and the
  outline. All seven played without errors in headless Chrome on 2026-10-29.
- `apps/desktop/e2e/menus.e2e.ts` (5), end to end with the system's right button (PAR-202): a right-click on a
  `MemberRow` selects it and lists its items in order, with their keys and the lines between groups, and Duplicate runs
  as one undo step; Ctrl+Z pressed at once after Duplicate, with focus still in the closing menu, undoes it (PAR-424,
  which fails without the fix); from a stat card, Select layer lists Dashboard, Main, Content, Stats and Users card with
  Main checked, and picks the card; Paste here below the lede in Pricing's Hero pastes the copied headline at that slot,
  from the stand-in clipboard, as "Paste layer here", and Undo takes it out; and in Interact a right-click reaches the
  design and no menu opens.

Gaps: the end-to-end test covers the right button, Select layer, Paste here into a layout and Interact. Panning with the
right button, Paste here into an absolutely placed layout, a design and a note pasted at the pointer, and the design's
title keeping its own menu were checked in an isolated copy of the app on the example project on 2026-10-29: each item
ran and undid as one step, Paste here landed in Calendar's absolutely placed Events at the pointer, and a design and a
note at the pointer, and the design's title opened no canvas menu. A component's slots aren't Paste here targets.
Several copies pasted into an absolutely placed layout all land at the pointer, on top of each other. A copy that
stretches between its insets loses its right and bottom when it's placed at the pointer. A right-click while the menu is
open closes it, and another opens it. The menubar still offers Copy, Duplicate, the order, Wrap in layout and Hide for a
layer inside an instance, which they don't act on; the canvas menu greys them.

### The overlay canvas only takes memory while it shows something (PAR-196)

tldraw draws the selection box around several designs, hover outlines, the brush and snap lines on a canvas over the
board, the window's size in device pixels. With nothing on it, that canvas now holds no bitmap, so the window and the
GPU don't keep about 36 MB of empty pixels. It's given the window's size again as soon as an overlay shows, before it's
drawn, and gives the bitmap back once the last one goes.

- **How:** tldraw sizes the canvas whenever it draws, so the canvas's `width` and `height` pass the size tldraw sets
  through only while an overlay shows, and hold it at none otherwise. An overlay shows while any of tldraw's overlay
  utils is active, apart from the shape indicators, which are always active and show only while they list an outline.
  The selection box draws from the selection, and lists only its handles, which it can leave out, so counting overlays
  alone emptied the box while Shift was held down on the empty canvas (`overlaysShow` in `CanvasEditor.tsx`). A reaction
  takes the bitmap back once nothing shows. A size the canvas already has is never set again, since that would clear it.
- **Measured:** at a 1289 × 1012 canvas on the example project, a memory-infra dump showed the canvas's 5 MB in the
  window and 31 MB of GPU images go when it was emptied, on 2026-10-30.

Code: `sizeWhileShown` in `apps/desktop/src/renderer/canvas/overlay-canvas.ts`, used by `sizeOverlays` in
`CanvasEditor.tsx`.

Tests: `overlay-canvas.test.ts` (5: no bitmap while nothing shows, tldraw's size while something does and none after,
left alone while something still shows, never setting a size it already has, restoring), and
`apps/desktop/e2e/overlays.e2e.ts` (2: no bitmap with the pointer off the board, the window's size and a drawn box with
every design selected, none again after Escape and after moving the camera; and the box still drawn while Shift is held
down on the empty canvas beside two selected designs). Gaps: hover outlines and snap lines were checked in an isolated
copy of the app on 2026-10-30, the canvas taking its size while a board was hovered and none once the pointer left; the
brush has no test.

## Moving, reordering and resizing

Dragging layers and designs, where they land, resize handles and duplicates.

### Where a dragged layer lands (CAN-47)

Dragging a selected layer shows a faded copy where it would land, and the layouts around it reflow around the copy, as
decisions.md describes. Where it lands follows the pointer:

- **The slot under the pointer.** In a grid or a wrapping row, the line of children the pointer is on comes first (the
  row it's over, or the nearer one in the gap between rows), then, along that line, the layer goes before the first
  child whose middle is past the pointer, or after the line's last child. Below the last line it goes last. A row or
  column that doesn't wrap goes by the middles along it, wherever the pointer is across it, as before. So in the
  dashboard's four stat cards, Users dragged right past the middle of Open issues gives Revenue, Issues, Users, Uptime,
  and Issues dragged left past the middle of Revenue gives Issues, Revenue, Users, Uptime. Grids that flow by columns,
  and wrapping columns, work the same way turned on their side.
- **Measured from the layout as it was when the drag began.** The dragged layer is hidden and its copy shown somewhere
  else, so what's on screen moves under the pointer. Targets are found in the boxes measured just before the layer is
  hidden: a neighbour that slid into the dragged layer's place isn't under the pointer, and the slots don't move when
  the copy moves. Another frame, or another design, is measured the first time the pointer is over it, before a copy is
  shown in it. Points are mapped back into each frame's first measure, so zooming or panning mid-drag still lands right.
- **A layer stays in the layout it's dragged in while the pointer is over it.** It changes places with its neighbours
  and never drops into one, or into anything inside one, even when the neighbour is a layout, as each of the dashboard's
  revenue bars is. Outside its own layout it goes into the deepest layout under the pointer, as before, in this design
  or another. To put a layer inside its neighbour, drag it there in Layers.
- **Edge cases.** Children that aren't drawn (hidden in this state) aren't slots; a layer placed after them goes after
  them. A move that leaves the order as it was changes nothing and adds no undo step. An absolutely placed layer doesn't
  reorder; it moves by its insets (below).

Code: `apps/desktop/src/renderer/canvas/drop-slot.ts` (`slotAt` and `flowOf`, geometry only), `canvas/drop-target.ts`
(`DragLayouts` measures a frame's layers through `frame.ts`'s `nodeBox`, and `dropTargetAt` finds the layout and slot),
and `canvas/layer-drag.ts` (`pressLayers` measures when the drag begins; `moveTarget` finds the frame under the pointer;
`DropPreview` shows the copy).

Tests:

- `canvas/drop-slot.test.ts`: the stat cards in both directions and anywhere up or down their row, a card short of a
  neighbour's middle staying put, two-row grids going up and down, the gap between rows, above and below every row, a
  row that moving a card empties, wrapping rows of different widths and centred lines, one-line rows and columns, an
  empty layout, and reading a flow from computed styles.
- `canvas/drop-target.test.ts`, in Chrome: the stat cards laid out as a real grid, dragged right and left; the line
  where the layout was, also after the camera zooms and pans; a card that stays in its own slot though its neighbour
  slid there, against the same layout measured after the card was hidden (which jumps it past the neighbour, as before
  CAN-47); a card dragged over neighbours that are layouts changing places with them; and a layout outside its own still
  taking the drop.
- `apps/desktop/e2e/moving.e2e.ts` (6), end to end (PAR-202), on the dashboard: Users dragged right past Issues, with
  the card hidden and its copy where it lands, then undone; Issues dragged left past Revenue; the header's Export past
  New project; Feb among the revenue bars nudged a little (no change and nothing to undo) and past March (they swap, and
  March keeps its two children); a drag shorter than the threshold changing nothing; and Escape mid-drag putting
  everything back.

Gaps: the pointer handling in `pressLayers` (the threshold, Escape, the preview), first checked by hand on 2026-10-29,
is now the end-to-end test above. Dropping a component from the Components panel (`canvas/insert.ts`, `dropTarget`)
still goes by the older one-line rule, so it lands wrongly in a grid of more than one row.

### Moving an absolutely placed layer by dragging (CAN-47)

A layer placed absolutely moves by its insets, in half steps of the spacing scale, from where the pointer was pressed to
where it's released.

- **Both sides.** Along each axis it moves by the side it's placed from: the left (or top), unless only the right (or
  bottom) is set. A layer stretched between both sides moves both, so it keeps its size: Calendar's Review slot, placed
  at left 0 and right 0, dragged 24px right is left 6 and right -6.
- **Negative and token insets.** A negative inset is kept, and an inset can go negative. A side set to a length token,
  or left unset, moves from where the frame drew it when the drag began, so it doesn't jump to the parent's edge; once
  moved it's a number of steps, since a token can't be offset. An axis the layer doesn't move along keeps what's
  written, tokens included.

This is the same rule nudging uses, one function for both. Code: `shiftInsets` in
`apps/desktop/src/renderer/canvas/insets.ts`; `canvas/layer-drag.ts` (`nudgeAbsolute`) reads where the sides are drawn
with `frameDrawn` (`canvas/nudge.ts`) and rounds the drag to half steps.

Tests: `canvas/insets.test.ts`, moving: by the side it's placed from, both sides of a stretched layer (the Review slot),
negative insets kept and going negative, half steps, tokens and unset sides from where they're drawn (a negative side
with a token on the other), and an axis with a token that isn't drawn staying put. End to end (PAR-202),
`apps/desktop/e2e/moving.e2e.ts` (2) drags Calendar's Review slot 24px right to left 6 and right -6, and, with left -2
and both right and top set to the `spacing` token, 16px right to left 2 and right -3, with top still `spacing` and the
width unchanged.

Gaps: none known. Dragging itself was first checked by hand, as the end-to-end test now does it.

### Resize handles (CAN-47)

A selected layer has square handles on its corners and invisible strips along its sides, as in Figma, and a selected
design has them on its frames' right and bottom.

- **A handle changes only its own sizes.** The left and right handles change the width, the top and bottom ones the
  height, and a corner both. Nothing changes until the pointer has moved four pixels along the handle's own axes, so a
  click, a double-click or a side's handle dragged along its side changes nothing. Dragging the right handle of the
  dashboard's New project button 50px right made it 196 by 32 with Height still Auto, where it used to set Height to
  Fill.
- **Fill.** A layer in a layout takes a size in whole spacing steps, or fill when its edge comes back to the inside of
  its parent after leaving it. An edge that starts there, as New project's right edge does at the end of its row, gets a
  fixed size until it has been away. Shift keeps the size fixed, and on a corner keeps the proportions.
- **Absolutely placed layers** keep the opposite edge where it was. The left or top handle moves that inset with the
  edge, so the right or bottom stays put; a layer stretched between both sides changes the dragged side's inset alone,
  keeping both sides; a layer placed from the right or bottom alone moves that inset when its right or bottom handle is
  dragged. Negative and token insets follow the moving rules above, and a side that doesn't move keeps its token. They
  never fill.
- **The hint** ("Drag to resize") closes when a handle is pressed and stays closed through the drag and after it, until
  the pointer next rests on a handle.

Code: `apps/desktop/src/renderer/canvas/resize.ts` (`edgeAxes`, and `resizeGesture`, which follows one drag and gives
the style for each pointer position), `canvas/insets.ts` (`resizeInsets`), `canvas/ResizeHandles.tsx` (the handles and
their hint, which `chrome/Hint.tsx` now lets a caller open and close), and `canvas/CanvasOverlay.tsx` (`startResize`
measures the layer, its parent and its drawn insets, and writes the style).

Tests:

- `canvas/resize.test.ts`: which sizes each of the eight handles changes; the right handle changing only the width
  however the pointer drifts; a side's handle dragged along its side changing nothing; the four-pixel start; an edge
  that starts on the inside of its parent not filling at once, then filling when it comes back, and Shift keeping it
  fixed; an edge reaching the inside filling; a corner with Shift; and an absolutely placed layer resized from the top
  and the left, stretched or not, keeping a negative inset and a token it doesn't move, and never filling.
- `canvas/insets.test.ts`, resizing: each anchoring (near side, far side, both, both with a size of its own), negative
  and token insets, and a token kept when its side doesn't move.
- `canvas/ResizeHandles.test.ts`, in Chrome: the hint opens on hover, closes on press and stays closed through a drag
  into the hint itself and after release (this fails as the handles were before), opens again on the next hover, and a
  double-click still resets.
- `apps/desktop/e2e/moving.e2e.ts` (4), end to end (PAR-202): New project's right handle, named by its hint when the
  pointer rests on it, dragged 48px right changes the width alone, in steps, with no hint during the drag or after; its
  top handle dragged sideways changes nothing and adds no undo step; the Review slot's top handle dragged up 16px gives
  top 36 and height 20 with the bottom edge where it was, and its left handle dragged right gives left 3 with right
  still 0.

Gaps: a frame's own handles (a design's width and height) aren't covered by these tests. A resize writes as the pointer
moves, and in a development build those writes can be more than a second apart, so one drag can take several undos; one
undo step per gesture is PAR-193.

### Duplicating a design (CAN-47)

Duplicate (Ctrl+D) on a selected design puts the copy to the right of the original, top-aligned with it, at the first
place along that row where it keeps 160px clear of every design and note on the canvas, so it never covers the next
design and their titles don't meet. Several selected designs move as one block, and pasting designs into the project
they were copied from places them the same way.

Code: `apps/desktop/src/renderer/canvas/free-space.ts` (`freeSpotBeside`, and `takenBounds`, which reads the canvas's
shapes), used by `chrome/designs.ts` (`duplicateDesign`) and `canvas/clipboard.ts` (`pasteDesigns`).

Tests: `canvas/free-space.test.ts`: the original alone, the example's Dashboard with Projects 176px to its right, a run
of designs and gaps too narrow for the copy, a gap wide enough, designs well above or below the row, and one just inside
the gap below it. End to end (PAR-202), `apps/desktop/e2e/moving.e2e.ts` (1) presses Ctrl+D on Dashboard: the copy is
selected, top-aligned with it to its right, with no design or note within 160px, and Undo takes it away.

Gaps: the view doesn't follow a copy that lands off screen.

### Arranging layers and designs (PAR-7)

Delete, Duplicate (Ctrl+D), Select all (Ctrl+A), Wrap in layout, Unwrap, the four orders, Hide, Align and Distribute act
on the whole selection as one undo step, labelled with how many things they touched.

- **They act on the outermost selected layers.** A layer inside another selected one moves with it, and selecting the
  design's root leaves nothing to arrange.
- **Delete selects the layout that held the last deleted layer,** or the design when that was its root.
- **Duplicate puts each copy just after its original,** in its layout or slot, with fresh ids for it and everything in
  it, and selects the copies.
- **Select all picks the selected layer's siblings** in its layout or slot, or every design when no layer is selected.
- **Wrap in layout lays the new layout out as the parent lays out the layers** in the state being edited: a row in a
  row, with the parent's gap. Layers in different layouts can't be wrapped together, and a message says so.
- **Unwrap leaves a layout's layers where it was** and selects them; on anything but a layout it says to select one.
- **Ordering moves a layer among its siblings.** Later paints in front, as in CSS, so Bring forward moves it later in
  its layout and down the Layers list. An order that wouldn't move it records nothing.
- **Align on layers works in their layouts,** in the state being edited: a layer aligns by itself on its layout's cross
  axis (`self`), and along the main axis the layout moves all its children (`justify`). Layers in a component's slot
  stay as they are.
- **Align on designs lines them up on the canvas** by their edges or centers, within the span of them all, and needs
  two. **Distribute spaces three or more evenly** between the outermost two, across or down. Positions are rounded to
  whole pixels, and a move that changes nothing records nothing.

Code: the rules are in `packages/editor/src/arrange.ts` (`@parity-app/editor`).
`apps/desktop/src/renderer/chrome/arrange.ts` applies them to the selection and the store, measures designs' boxes on
the canvas and shows the messages. Hide is core's `toggleHidden`.

Tests: `packages/editor/src/arrange.test.ts`: the outermost layers and the root; deleting and what's selected next (in a
layout, the root and a slot); duplicating in place with fresh ids (in a layout, a slot, a copied layout's children, and
nothing to copy); deleting designs from their own documents; siblings in a layout and a slot; wrapping in a row, a
column and another state, and layers that can't be wrapped; unwrapping, and layers that aren't layouts; each order in a
layout and a slot, and orders that wouldn't move; aligning on the cross and main axes in two states and in a slot;
aligning designs by edges and centers, with a box offset from its position; distributing across and down whatever the
selection's order; and moving designs in whole pixels.

Gaps: the commands, menus and messages have no automated test. They didn't change when the rules moved into the package.

## Keyboard

What the keys do on the canvas, and when they belong to a design or a field instead.

### How shortcuts are shown

Every shortcut is written once, in the keymap, as on Windows with a space between keys (`Ctrl Shift Z`), and shown
through `formatKeys` so it reads as one chord:

- **On Windows and Linux** keys are joined by `+`: `Ctrl+Shift+Z`, `Alt+F4`, `Shift+←`. A `+` or `-` key is named when
  it's joined, `Ctrl+Plus` and `Ctrl+Minus`, as Windows's own apps write them, so it can't be read as the separator. A
  single key stays as it is (`+`, `Del`).
- **On a Mac** they're the Mac's symbols, modifiers first in the Mac's order, with nothing between: `⇧⌘Z`.
- **Text that isn't keys,** such as `Hold Space`, is shown as written.
- **Menus show shortcuts as plain text** at the end of each item (the menubar's, context menus' and Search actions'
  Shortcut components), as Figma's and the system's menus do. Tooltips, the toolbar, the start screen and the Keyboard
  shortcuts dialog show them as keycaps (`Kbd`). Both go through `formatKeys`.

Code: `formatKeys` in `apps/desktop/src/renderer/chrome/keys.ts`, called by `components/ui/kbd.tsx`, `menubar.tsx`,
`context-menu.tsx`, `dropdown-menu.tsx` and `command.tsx`.

Tests: `chrome/keymap.test.ts`, `formatKeys`: joining with `+`, naming `+` and `-`, the Mac's symbols, text left alone,
and every key in the keymap showing as one chord off a Mac. End to end (PAR-202), `apps/desktop/e2e/keyboard.e2e.ts` (2)
reads the Edit and View menus' items as plain text joined by `+`, and the nudges and the new keys in the Keyboard
shortcuts dialog as keycaps; `e2e/menus.e2e.ts` reads the canvas menu's.

### Keys stay out of designs outside Interact (CAN-54)

With Move and select, Hand or Text, every frame on the canvas is inert, so the canvas keeps its keys. Tab from the
canvas goes past a design's fields and buttons to the app's next control, and nothing can focus them: not a click, not a
component that focuses itself as it mounts (`autoFocus`, an effect calling `focus()`), and not an open dialog's focus
trap in a design, which would otherwise pull focus back from the inspector. With Interact (I), frames take the pointer,
Tab and typing as a browser page does, and keys typed there are the design's. Leaving Interact lets go of any focus
inside a frame, and the frames start again from the design, as before.

- **What still reads inert frames.** Hovering, selecting, outlines, sizes, dragging and nudging find layers by their
  layout boxes and by DOM queries, never by the browser's hit testing, and the tab order overlay reads a frame's
  focusable elements by their attributes, so none of them changes. The accessibility checks run in the offscreen
  renderer's own frames, which aren't inert.
- **How.** `ModeView` puts the `inert` attribute on each frame's host unless `interactive` is set, and blurs whatever
  had focus inside it when that changes; the canvas sets it from the tool (`useInteracting`). The attribute also removes
  the frame from hit testing, which outside Interact `pointer-events: none` already did. In Interact, the key handlers
  still tell a design's keys by the event's composed path, since shadow DOM hands them the frame instead of the field
  inside it.

Code: `apps/desktop/src/renderer/ModeView.tsx`, `canvas/ContainerView.tsx` (`FrameTile`) and `selection.ts`
(`useInteracting`).

Tests: `apps/desktop/src/renderer/ModeView.test.ts` renders `ModeView` with the React guest in Chrome. Outside Interact
the frame is inert, a field that focuses itself as it mounts doesn't get focus, Tab from the canvas goes past it, and a
component's own `focus()` does nothing; in Interact, Tab reaches the field and typing goes into it, and focus leaves
when Interact stops. The first three fail without `inert`; letting go of focus is `ModeView`'s own, so it doesn't wait
for the browser to notice the frame went inert. It also checks that an inert frame still gives the canvas the layers
under a point (`hitInFrame`), its tab order (`tabOrder`) and what nudging reads (`frameDrawn`).
`apps/desktop/e2e/keyboard.e2e.ts` (2) runs the whole flow end to end (PAR-202): with Sign in selected every frame is
inert, Tab never reaches its fields and N still works after it; in Interact a click and typing go into its field, N
included, and Escape twice gives the canvas its keys back, with the frames inert and nothing in them focused.

Gaps: none known.

### Nudging (CAN-39)

The arrows move what's selected, as Figma's do, through the keymap: Nudge is the arrows and Big nudge is Shift with
them, listed under Arrange in the Keyboard shortcuts dialog. They aren't in the menus, as Figma's aren't, nor in Search
actions, since each needs to know which arrow was pressed.

- **A layer in a layout** moves one place earlier or later along the layout's direction: Left and Right in a row, Up and
  Down in a column. The direction is the one the frame the layer was picked in draws, so a layout that a viewport turns
  from a row into a column follows that frame. A reversed flex direction, or a right-to-left page, follows the screen:
  Right always moves it right. In a grid, Left and Right move one place and Up and Down a row's worth of places, only
  when there's a row to move to. The arrows across a layout, and across a wrapping row, do nothing. Shift moves one
  place too.
- **A place is a layer in the flow.** Absolutely placed layers, and layers the state being edited hides, keep their
  place in the list and are stepped over, so every press visibly moves the layer. Several selected layers in one layout
  move together, as a block, and stop together at the end. Layers in different layouts each move within their own.
- **In a component's slot,** the direction is read from the element the slot's layers are drawn in; plain blocks count
  as a column. When a layer isn't drawn, the layout's direction comes from the design (a column unless it says row, a
  grid by its columns).
- **An absolutely placed layer** moves one step of the spacing scale, or ten with Shift, in the state being edited.
  Along each axis it moves by the side it's placed from (the left or top, unless only the right or bottom is set), or by
  both sides when it's stretched between them, so it keeps its size. A negative inset is kept. A side set to a length
  token, or left unset, moves from where the frame draws it, in half steps, as dragging moves it. When the layer isn't
  drawn, an unset side counts from 0, and an axis set by a token stays put, with a message saying so.
- **Designs and text notes** move 1px, or 10px with Shift. A selected mode column moves its design.
- **One undo step per run.** Presses on the same selection less than a second apart are one step (Undo nudge layer);
  pausing, or changing the selection, starts another.
- **Moving a layer by 1px** waits for PAR-194, since it would leave the spacing scale.
- **Layers inside an instance don't move,** as they can't be dragged.
- **The keys.** On the canvas, the arrows with Ctrl or Alt do nothing, so tldraw never moves a design behind the
  keymap's back. On a focused control, such as a Layers row, the arrows stay the control's. A layer that moves stays in
  view.

Code: `apps/desktop/src/renderer/canvas/nudge.ts` (the rules, which take data and return data, and `frameDrawn`, which
reads a layout's direction and a layer's drawn insets from its frame), `canvas/insets.ts` (`shiftInsets`, which moves an
absolutely placed layer's insets for dragging too), `chrome/commands.ts` (`nudge`), `chrome/actions.ts` (`byKey` keeps
it out of Search actions), `chrome/keymap.ts` and `chrome/keys.ts` (the arrows are written `←`, `→`, `↑` and `↓`), and
`canvas/shortcuts.ts`, which passes the key event to the action and keeps the other arrows from tldraw.

Tests:

- `apps/desktop/src/renderer/canvas/nudge.test.ts`: reading a flow from computed styles (rows, columns, reversed, right
  to left, grids as laid out or as written, blocks); how far each arrow moves in each; reordering a layer, a block, past
  absolutely placed layers and down a grid; nudging a design's layers in a state, following the frame's direction, and
  leaving instances alone; and, with the real stores, a run of presses as one undo step, a pause or a new selection
  starting another, designs moving together and a mode column and a note moving.
- `apps/desktop/src/renderer/canvas/insets.test.ts`: moving insets from each side, both sides, tokens and unset sides
  with and without where they're drawn (`shiftInsets`, shared with dragging).
- `apps/desktop/src/renderer/ModeView.test.ts`: `frameDrawn` reads a row, a column and a grid's columns from a design
  rendered as the canvas renders it, and an absolutely placed layer's insets in steps, at full size and at half scale.
- `apps/desktop/src/renderer/chrome/keymap.test.ts`: the arrows match with and without Shift, and show as `⇧←` on a Mac.
- `apps/desktop/e2e/keyboard.e2e.ts` (3), end to end (PAR-202): a link in Pricing's footer moved two places right by two
  presses, nothing across the row, and one undo; Calendar's Planning slot moved down a step, then ten with Shift, and
  right on both of its sides; and Pricing moved 1px and 10px, with Ctrl and Alt arrows moving neither the design nor
  tldraw's board.

Gaps: the key handler's wiring is the end-to-end test above, apart from keeping a moved layer in view, which was checked
in an isolated copy of the app on the example project.

### Select inverse and select matching layers (CAN-39)

Both are in Edit, after Select all, as in Figma.

- **Select inverse (Ctrl+Shift+A)** selects what Select all would, less what's selected now. With layers selected,
  that's the other layers beside the one picked last, in the same layout or slot; with designs selected, every other
  design; with nothing selected, every design. When everything was selected, nothing is. Inside an instance it does
  nothing, as Select all doesn't.
- **Select matching layers (Ctrl+Alt+A)** selects every layer in the selected layers' design that matches one of them,
  as the state being edited shows it. Two layers match when they're the same kind of thing and look the same:
  - the same kind: the same component, an instance of the same main component, text with the same tag, or both layouts,
    or both images;
  - the same style, leaving out where the layer is placed and how big it is (position and insets, width, height and
    their limits, fill, self alignment, grid spans and margin), so a card's title matches the titles of cards placed or
    sized differently;
  - and nothing else: text, props, an instance's values, an image's file and the layers inside don't count, as Figma
    leaves out content.

  The search stays in the design, as Figma's stays in the top-level frame, and doesn't go inside instances. The layer
  picked last stays the one the inspector shows. With designs selected, it selects every design of the same kind:
  components, or screens.

Code: `apps/desktop/src/renderer/canvas/select.ts` (`inverseSelection`, `matchKey`, `matchingLayers`,
`matchingSelection`), with the commands in `chrome/commands.ts` and the menu items in `chrome/AppMenu.tsx`.

Tests: `apps/desktop/src/renderer/canvas/select.test.ts` covers inverting layers, everything selected, designs, a mode
column, nothing selected and an instance's layers; and matching cards' titles however they're placed, the cards
themselves, text of another style or tag, a state's changes, instances and components, several selected layers, the
layer picked last, and designs by kind. `chrome/keymap.test.ts` checks the keys, Option for Alt on a Mac included. End
to end (PAR-202), `apps/desktop/e2e/keyboard.e2e.ts` (3): Ctrl+Shift+A on a link in Pricing's footer selects the other
two, Ctrl+Alt+A on a plan card selects all three and keeps it the one the inspector shows, and Select inverse runs from
the Edit menu.

Gaps: Select matching layers from the Edit menu was checked by hand in an isolated copy of the app; no story covers the
menu items.

### Next and previous design (CAN-39)

N selects the design after the selected one and zooms to it, and Shift+N the one before, as Figma's Zoom to next frame
and Zoom to previous frame do. They're in View, after Zoom to selection.

- **The order is the Layers panel's:** components, then screens, each in the order the project lists them. It goes round
  from the last to the first.
- **From a selected layer or mode column,** it goes on from its design. With nothing, or a text note, selected, N
  selects the first design and Shift+N the last.
- **The zoom** is Zoom to selection's: the design fills the view, with a margin, whether it was in view or not.

Code: `adjacentDesign` and `designOrder` in `apps/desktop/src/renderer/canvas/select.ts`, and `selectAdjacentDesign` in
`chrome/commands.ts`, which zooms with `zoomToSelection`.

Tests: `apps/desktop/src/renderer/canvas/select.test.ts` (the order, going round, from a layer, and with nothing
selected). End to end (PAR-202), `apps/desktop/e2e/keyboard.e2e.ts` (2): N from Pricing selects Sign up and zooms to it,
so that Zoom to selection (Shift+2) after it doesn't move the view, and Shift+N goes back; and N from Members, the last
screen, goes round to Member row, the first component.

### Copy, paste and paste style (PAR-7)

Copy (Ctrl+C) puts the selected layers, designs or note on the system clipboard, so they paste into another project or
another Parity window. Paste (Ctrl+V) takes Parity's copies, an image or SVG markup (saved into the project), or plain
text. Copy style (Ctrl+Alt+C) and Paste style keep their own clipboard inside the app.

- **What's copied is what the frame shows.** A layer copied in a state other than the base carries that state's changes,
  all the way down, slots included. Only the outermost selected layers are copied.
- **The copy is an envelope** (`{"parity":"clipboard","version":1,"project":…,"payload":…}`) holding layers, designs or
  notes, and the project they came from. Text that starts like a Parity copy but isn't a complete envelope of a known
  kind, such as cut-off JSON or an unknown version, pastes nothing and shows a message. So does an envelope whose
  layers, designs or notes are empty or don't match the `.par` schema, rather than failing halfway or pasting its JSON
  as text.
- **Pasted layers get fresh ids,** for them and everything in them. They go into the selected layout when it's the only
  layer selected, else just after the last selected layer in its layout or slot, else into the design's root. With no
  design selected, or a root that isn't a layout, they become a new screen called Pasted, laid out in a padded column.
- **Pasted designs keep their ids unless taken,** when they get one from their name. Into the project they came from,
  they go to the right of the originals (see Duplicating a design); elsewhere, in the middle of the view.
- **Pasted notes get fresh ids** and sit a little below and right of where they were copied, as they sat together.
- **Text pastes as a text layer** where layers would go, or as a note in the middle of the view. **SVG markup pastes as
  a picture,** not as its source.
- **Paste style gives each selected layer the copied style in place of its own,** in the state being edited.
- **Layers naming components the project doesn't have** still paste, with a warning naming them.

Code: the rules are in `packages/editor/src/clipboard.ts` (`@parity-app/editor`).
`apps/desktop/src/renderer/canvas/clipboard.ts` reads and writes the system clipboard, saves images, places designs by
their boxes on the canvas, applies the rules to the selection and the store, and shows the messages.

Tests: `packages/editor/src/clipboard.test.ts`: writing and reading the envelope, and text, a cut-off envelope, another
version, a project that isn't text, an unknown kind, a payload without its list or with an empty one, and invalid
layers, designs and notes, all rejected; telling a Parity copy, readable or not, from other text; designs and notes read
back; SVG markup, and text that only looks like it; copying the outermost layers as a state shows them; where layers
paste (a lone selected layout, after the last selected layer, in a slot, the root, and a root that isn't a layout);
fresh ids in order, last, inside copies and in a slot; the new screen; designs' ids, kept when free even when not made
from the name, and whole-pixel moves; notes beside where they were and at a place; copying style in a state, and pasting
it in the base and in another state; and missing components at any depth, and none while the project's aren't known.

Gaps: reading and writing the system clipboard, images and the messages have no automated test. In a state other than
the base, Paste style leaves the base's own style values under the copied ones, since a state's changes can't unset
them; the test checks only that the copied values land.

### Paste over selection and paste to replace (CAN-39)

Figma's two pastes that go where the selection is, both in Edit after Paste. Each is one undo step, and the copies end
up selected. What they paste is Parity's copied layers, plain text as a text layer, or an image or SVG, saved into
`public/images/` as a paste saves it; Paste over selection also pastes copied designs over designs.

**Paste over selection (Ctrl+Shift+V)** puts what's on the clipboard in the selection's place, on top of it, and removes
nothing.

- **Over layers,** the copies go just after the last selected layer, in the design's order, in its layout or slot, once
  however many layers are selected. Later in a layout paints on top, so over an absolutely placed layer they sit on top
  of it, at its insets as the state being edited shows them, in place of their own. A selected layout or component gets
  them beside it, not inside it, which is where Paste differs.
- **Over designs,** copied designs go at the selected designs' position: the copies' top left corner at the selected
  designs' top left, sitting as they sat together, on top of them, as new designs are. Each keeps its id unless that's
  taken, as a paste does.
- **Layers go over layers and designs over designs.** Otherwise a message says what to copy. It needs layers or designs
  selected; otherwise it's unavailable in the menu and the keys do nothing. Layers inside an instance can't be pasted
  over, and a message says so.

**Paste to replace (Ctrl+Shift+R)** puts what's on the clipboard in place of each selected layer.

- **In its place** is its index in its layout or slot, and, for an absolutely placed layer, its insets as the state
  being edited shows them, which replace the pasted layer's own.
- **Each selected layer gets its own copy,** with fresh ids, as Figma's does. The states' changes to a replaced layer go
  with it.
- **It needs layers selected,** and replaces only with layers: copied designs or text notes get a message. Layers inside
  an instance can't be replaced, and a message says so.
- **The key is free.** Ctrl+R renames, and nothing else in Parity takes Ctrl+Shift+R: the keymap's test fails if two
  commands share keys, and the main process's menu adds no keys of its own (its Developer items, including Reload, are
  built with `registerAccelerator: false`, and Electron's default menu, whose Force Reload took it, is replaced).

Code: `packages/editor/src/paste-over.ts` (`placeOver`, `designsAt` and `replaceLayers`) and, in
`apps/desktop/src/renderer/canvas/clipboard.ts`, `pasteOverSelection` and `pasteToReplace`, with reading the clipboard
(`readClipboard`) and saving an image (`importImage`) shared with Paste.

Tests: `packages/editor/src/paste-over.test.ts`. Paste over selection: after the selected layer with nothing removed,
once after the last of several, beside a selected component, on top of an absolutely placed layer at its insets, in a
component's slot, leaving the root and instances' layers alone, designs at the selection's corner as they sat, and new
ids for designs whose ids are taken. Paste to replace: in place of one layer, fresh ids and states' changes dropped,
each of several layers, in a component's slot, at an absolutely placed layer's insets, and leaving the root and
instances' layers alone. `apps/desktop/src/renderer/chrome/keymap.test.ts` checks both keys, and that Ctrl+R still
renames.

End to end (PAR-202), with a stand-in for the clipboard on the page, `apps/desktop/e2e/keyboard.e2e.ts` (6):
Ctrl+Shift+V after a link in Pricing's footer, removing nothing, and one undo; Ctrl+Shift+R in the link's place, without
reloading the window; Ctrl+Shift+V over Calendar's absolutely placed Planning slot, at its insets; copied Pricing over
Sign in, at its position and on top of it; the message when designs are copied and layers selected; and plain text
replacing a layer as a text layer.

Gaps: the system's own clipboard isn't read in the tests, and pasting an image or SVG is covered by neither.

## Fields

How the inspector's number, length and token fields read what's typed, scrubbed or stepped.

### Typing, stepping and scrubbing (CAN-48)

Every number and length field in the Design tab takes what people type, as Figma's do. The lengths are Gap (and its
column and row gaps), Padding and Margin (both sides, or each side), Width and Height, Min and Max, and an absolutely
placed layer's insets. Opacity is a percentage. A grid's Cols and Rows, a layer's Span and a text's Max lines are whole
numbers. A component's number props take any number.

- **What a field shows.** A length shows in pixels: a gap of 4 steps shows 16, with `px` after it, hidden while the
  field has focus. Hovering it gives its step (`Gap, spacing-4`). A length token shows its name, in a code font. When
  the selected layers differ, the field shows the word Mixed, as text that can be typed after.
- **What it reads.** A number; `px`, `rem` (16px) and `%`; maths with `+ - * /` (`×` and `÷` too) and brackets; for a
  length, a token's name (`container-sm` or `--container-sm`) or a step's (`spacing-4`). An empty field clears the
  property, as before. Typing 320 in Width gives 320px, kept as 80 steps (`w-80`), following the project's spacing unit:
  with MUI's 8px, 320 is 40 steps.
- **Working from the value there.** A leading `+`, `*` or `/` works from it: `+8` adds 8px, `*2` doubles it. A leading
  minus is a negative number, since an inset can be negative; to subtract, type after the value shown, or `Mixed-8`.
  Mixed stands for each layer's own value, so `Mixed+8` adds 8px to each selected layer; anything without it gives every
  layer the same value. In a length or a count, `%` is a share of the value there (`50%` halves a width, as in Figma's
  dimension fields); in Opacity it's the unit, so `50%` is 50.
- **What unset counts as,** for maths that works from the value: 0 for padding, margin, gaps and insets, 100 for
  opacity, 2 for a grid's columns, 1 for a span, and a layer's measured size for Width and Height when they're auto,
  fill or hug, as Figma's sizes are always numbers. Unset limits, rows, max lines and props have no value, so such maths
  says "There's no value here to work from". A layer whose value is a token has no number either: it keeps its value,
  and the field says how many layers did.
- **Off the spacing scale, until PAR-194.** Before, a length field read steps and took any number, so `7.3` became
  29.2px, which Tailwind can't write as a class, without a word. Now a typed length lands on the nearest half step (2px
  with a 4px unit), which is what Tailwind's scale lists below 4 and what dragging already writes, and the field says so
  under its row: "Snapped to 282px, the nearest step on the spacing scale". A value already off it shows as it is (29.2)
  until it's edited. Keeping and flagging lengths off the scale is PAR-194.
- **Limits.** Sizes, padding, margin, gaps and limits can't go below 0; insets can. Opacity stays within 0 and 100.
  Counts are whole numbers from 1. A value past a limit is kept at it ("Kept at 0px: it can't go lower"), and a count
  with a fraction is rounded ("Rounded to 2: it takes whole numbers"), each said under the row.
- **Up and Down** move a length one step of the spacing scale (4px with a 4px unit) and Shift ten steps, the same
  distance nudging moves an absolutely placed layer; a half step goes to the whole step beside it. Opacity, counts and
  numbers move by 1, and Shift by 10. Each press is made at once, and presses on a field less than a second apart are
  one undo step, as a run of typing is. With something readable typed, it steps from that; with something it can't read,
  nothing changes and the reason shows.
- **Scrubbing.** Dragging a field's label changes the value by one step for every 2px the pointer moves, ten with Shift,
  left to lower. The label is the row's (Width, Gap, Opacity, Max lines) when the row holds one field without a letter
  of its own, else the letter inside the field (V and H, T, R, B and L, X and Y, Cols and Rows). Such a label has a
  left-right cursor and its hint says "Drag to change it". The canvas previews while dragging, the field shows the
  value, and letting go makes it one undo step. Escape takes it back. Pressing a letter without dragging focuses its
  field. These are my calls, as the smallest step from Figma, whose labels scrub at four speeds.
- **The canvas previews while typing or scrubbing.** Each readable keystroke shows on the canvas at once, without
  changing the design: the edit's inline styles are written straight onto the elements already drawn, in every frame of
  the design, worked out for each frame's state and viewport as the frame works out its own. The side panels follow once
  the change is made. Something it can't read keeps the last preview while typing, since `16p` is on its way to `16px`.
  A component previews only when it renders the design's props on its root, as only then does it take the style; one
  that doesn't changes once the edit is made, as before.
- **Committing.** Enter makes the edit, one undo step, and keeps the field, with its text selected for the next value.
  Tab or clicking away makes it too. The preview stays until the change draws over it, so the canvas doesn't flick back.
  Escape takes the preview back, puts the value back and leaves the field.
- **Input it can't read stays** as typed, with the field marked and the reason under its row:
  `Can't read "abc": type a number, px, rem or %`, `"em" isn't a unit Width takes`,
  `Opacity takes a percentage, not px`, `Something's missing after "+"`, `A bracket isn't closed`,
  `Put an operator between 16 and 4`, `Can't divide by zero`. Nothing is made and the canvas goes back to the value. It
  stays when the field loses focus, until it's typed in again or Escape.
- **A value changing underneath** (an agent's edit, an undo, a resize on the canvas) doesn't touch what's being typed:
  it shows over the value until it's made or reverted. With nothing typed, the field follows the value. Selecting
  another layer, or another set of layers, starts the fields afresh.
- **What a field says** shows under its whole row, where there's room, and stays until the field is next edited. A note
  is muted; a reason is in the destructive color, read out as an alert, and the field points to it (`aria-describedby`).

Code:

- `packages/core/src/fields.ts`: reading what's typed (`readFieldInput`), working it out against a value
  (`applyFieldInput`), landing on the scale and the limits, steps (`stepFieldValue`), scrubbing (`scrubSteps`), showing
  a value (`formatFieldValue`) and what the field says (`describeFieldNote`, `summarizeFieldNotes`). It takes data and
  returns data; it can move to `@parity-app/editor` when PAR-7 makes it.
- `packages/core/src/style-changes.ts`: which inline styles an edit changes between two renders of a design
  (`styleChanges`).
- `apps/desktop/src/renderer/chrome/number-field.ts`: the field's behaviour as a reducer (`reduceField`): drafts, Enter,
  leaving, Escape, steps and scrubs, and the effects it asks for.
- `chrome/fields.tsx`: `NumberField`, which runs those effects and handles keys and scrubbing, `NumberInput`, and
  `Field`, whose label scrubs a lone field and which shows what its fields say under the row.
- `chrome/StyleSections.tsx`: each style field's rules and how its edit reads and writes each layer's own style
  (`fieldEdits`), with `LengthInput` and `CompactNumber`. `StyleEditor` takes values, or a function of each layer's
  style, and has `preview` and `endPreview`. `chrome/PropsSection.tsx` has the number props.
- `canvas/style-preview.ts`: `StylePreview`, which writes previews onto the frames, takes them back, and settles them
  for the change. `chrome/LayerPanel.tsx` and `chrome/MultiPanel.tsx` wire it into the inspector, the latter working an
  edit out for each layer.

Tests:

- `packages/core/src/fields.test.ts` (42): 320 as pixels, `16px`, `rem` and step names, tokens, maths with units, `%` of
  the value there, leading operators, a leading minus, Mixed per layer, landing on the scale with its note, limits,
  another spacing unit, clearing, `50-10` in Opacity, counts and numbers, each reason for input it can't read, steps,
  scrubbing, and notes across layers. The cases the audit found broken fail without the change.
- `packages/core/src/style-changes.test.ts` (6): only what an edit changes, properties taken off, a component's style, a
  state that sets its own value, and nothing for no change.
- `apps/desktop/src/renderer/chrome/number-field.test.ts` (16): previews while typing, keeping the last one, the draft
  over a changing value, Enter committing and keeping focus, input it can't read kept with its reason, leaving the
  field, Escape, steps from the value and from a draft, and scrubbing.
- `apps/desktop/src/renderer/chrome/fields.test.ts` (9), in Chrome: the real field in a row. 320 previews as it's typed;
  Enter commits and keeps focus with the text selected; `16em` stays with its reason, also after leaving; a value
  changing underneath, then Escape; a snapped note; Up, Shift+Up and Down; scrubbing the row's label to one commit, and
  Escape during a scrub; and `Mixed+8` on two layers.
- `apps/desktop/src/renderer/canvas/style-preview.test.ts` (6), in Chrome: a preview drawn in each state's frame, a
  state that sets its own width left alone, a later preview putting back what it doesn't change, taking it back exactly,
  settling for the change, and nothing written for no change.
- `chrome/fields.stories.tsx`: a Length row in every look, and TypingMaths, SnappedToTheScale, CantRead and Stepping.
- `apps/desktop/e2e/fields.e2e.ts` (8), end to end on Pricing's Brand mark (PAR-202), the inspector's wiring against the
  real store and frames: 320 typed in Width drawn at each keystroke (4, 32 and 320px) while the design keeps its width,
  and Enter making 80 steps as one undo step, with the field focused and its text selected; `16px`; 281 landing on 282px
  with its note; `abc` kept with its reason, and Escape putting the value back; a value set underneath leaving `12` in
  the field; Up, Shift+Up and Down as one undo step; `50-10` in Opacity; scrubbing the Width label, drawn while dragging
  and one undo step on release; and `Mixed+8` on Brand mark and Plans.

Gaps: the timings were measured by hand in an isolated copy of the app on 2026-10-29: typing 320 in Width previewed at
each keystroke in 25, 25 and 41 ms (a commit took 291 ms to show before), and scrubbing in 22 ms. The stories' play
functions weren't run in Storybook. Number props don't preview, since a prop change has to draw the component again;
they take maths and are made on Enter, as before. In a 320px inspector, Width and Height show about three characters of
what's typed (PAR-189).

## Saving and undo

What goes through Save and Undo, and where an edit lands when the board shows a state or a variant.

### One history, saved together (PAR-164)

Every change people or agents make goes into one history per project, and stays unsaved until Save (Ctrl+S), as
decisions.md's "Saving is explicit" sets out.

- **What's undoable:** every edit to a design or a text note, the modes, and token values. An agent's call is one step,
  its designs and its tokens together. What a board shows (the state, Show every state, the modes beside it, the variant
  picked in its title bar) isn't undoable, and Undo leaves it as it is, but it's saved in the `.par`, so changing it
  marks the file unsaved.
- **What Save writes:** each `.par` with changes, and the token values into the project's stylesheet (`src/index.css` in
  the example), together. A token edit shows in every frame at once, since the stylesheet every frame shares is edited
  in place, but nothing is written until Save. Don't save, when closing a tab or quitting, leaves the stylesheet as it
  was. With Save automatically on, token values are written about 300ms after the edit, as files are.
- **Undo after a save** puts the value back on the canvas, and the next Save writes the value the stylesheet had before.
- **Clean again.** A file is clean whenever it's back to what was saved: by undoing, as before, and now also by changing
  it back. Turning Show every state on and off again, or showing another state and then the base one, leaves the file
  clean, also when the file wrote its view out in full (`"allStates": false`, the base state's id). A view is kept tidy:
  what it says by default (every state off, no modes beside, the base state) isn't written.
- **A failed write** to the stylesheet says where: the save notice and the status bar say which token and which file
  ("Couldn't write --primary to src/index.css: EPERM…"), the Tokens panel shows the same at its top with Try again, and
  the row of each token not written says "Not written to the stylesheet". The values stay on the canvas, unsaved. A
  stylesheet changed since its values were read fails the same way, writing nothing.
- **The token editor** says this before anything changes: "Every frame shows it at once. Saving the project writes it to
  src/index.css, and Undo takes it back." Its button is Apply.

Code: the history and what's unsaved are `apps/desktop/src/renderer/design-store.ts` (`changeTokens`, `writeTokensWith`,
`getTokenFailure`, `applyDocuments` taking tokens, `updateView` tidying the view, and `adoptSaved`, which takes a file
changed back to what's saved as saved); token values as data are `token-edits.ts` (`withTokenEdits`, which keeps the
value each token had before its first edit, `tokenDifferences`, `tokenWrites`, `tokensWithEdits`); comparing files with
views tidied is `document-equality.ts`. `tokens-store.ts` previews the history's token values in the shared stylesheet
after each edit, undo or redo, and gives the design store its writer; `workspace.ts` makes one per guest, so a guest
loaded again shows the unsaved values too. The agent's call is `agent/handlers.ts` (`apply`), the panel
`chrome/TokensPanel.tsx`.

Tests:

- `apps/desktop/src/renderer/design-store.test.ts` (10 of its 16): token edits undone, redone and saved with a design;
  nothing written when they're back at the stylesheet's value; the stylesheet's value written back after undoing past a
  save; a failed write naming the token and the file and clearing on success; a stylesheet that changed since it was
  read; saving automatically; an agent's call as one step; Show every state off again leaving the file clean; another
  state and back from a file with its view written out in full; and a file that differs in more than its view staying
  unsaved until undone.
- `apps/desktop/src/renderer/token-edits.test.ts` (4): the first edit's original kept, what Save writes, a theme value
  that wasn't there, and the token list with edits.
- `apps/desktop/src/renderer/tokens-store.test.ts` (3), in Chrome: an edit previewed in the stylesheet in both themes,
  undo and redo taking it back and forth, Save writing it; a theme value taken out again on undo; and a guest loaded
  again showing, then saving, an unsaved edit.
- `chrome/TokensPanel.stories.tsx`: ReferenceToAnotherToken (an edit is one undo step, unsaved) and SaveFails (the
  panel's message and the marked row), both played in Storybook on 2026-10-29.

### Edits in the state and variant shown (PAR-164)

The inspector's Editing control says where edits go: in the base state ("Editing Monthly changes the design") they
change the design; in another state, or with a variant other than the default shown on a component's board, they're kept
as that state's or variant's changes ("changes only this state", "changes only the Large variant").

- **Edits start from what the board shows.** The inspector, the text editor and Hide read a layer as the board draws it
  in the state being edited: with the variant shown, the state's changes, and the params it binds. The text editor opens
  on the state's text: in Pricing's Yearly state, the Pro plan's price opens as $19, not Monthly's $24. Hide or show
  (Ctrl+Shift+H, or Hide in and Show in on a row in Layers) hides what the state shows and shows what it hides, so a
  layer the state, the variant or a param hides counts as hidden, and Layers marks it so.
- **A component's board shows its params' defaults,** as an instance that sets none of them does. The Stat card's board
  shows only the rising trend icon, since `showFalling` is off, where it showed both. Changing a bound text, prop or
  visibility on the board, in the base state, changes the param's default too, so the board and the instances that don't
  set the param follow it: renaming the Stat card's Revenue label to Sales on the board makes `label` default to Sales.
  A param without a default follows the layer's own value, as before, and variants are picked in the title bar.
- **A state's change is kept against the board,** with the params bound: showing the Stat card's Falling icon in Loading
  keeps `hidden: false` for Loading, which used to be dropped as matching the design.
- **Edits that always change the design say so first.** An image's file, alt text and fit, and an instance's state,
  Reset all, Swap and Detach can't differ by state. While the Editing control points at another state or a variant, a
  note above them, tinted as the Editing control is, says so: "File, alt text and fit change the design in every state,
  not only Yearly." or "Its state, Reset all, Swap and Detach change the design in every variant, not only Large." In
  the base state there's nothing to say, so it doesn't show.
- **Values keep their types.** A param's or prop's field is chosen by what it's declared to take, not by the value it
  has: a number param with no value yet gets a number field, so typing 12 gives 12 and not "12"; a boolean gets a
  switch; text gets text. An object prop takes JSON, and JSON that doesn't parse stays in the field with "Can't read
  this as JSON: check its quotes, commas and brackets" under it, changing nothing, where it used to become a string. A
  prop of any type reads JSON when what's typed is JSON, and text otherwise. The instance's params, a component design's
  param defaults and component props all work this way.

Code: in `packages/core`, `edit.ts` (`nodeOnBoard`, `toggleHidden`, `editNode` keeping the bound param's default in step
and a state's patch against the board) and `render.ts` (`boardArgs`, which `resolveDesign` gives a board, and
`paramDefaults`, shared with instances); `instances.ts` (`layerOnBoard`, for one of a design's own layers or one inside
an instance). In the app, `canvas/CanvasOverlay.tsx` (`TextEditor`), `chrome/arrange.ts` (`toggleHiddenLayers`),
`chrome/LayerTree.tsx` (the row's hidden mark and its Hide in menu item), `chrome/LayerPanel.tsx` (the layer as the
board shows it, `BaseDesignNote` in the Image and Instance sections), `chrome/edit-scope.ts` (`baseDesignNote`, the
note's words), `chrome/prop-values.ts` (`valueKind`, `readValue`) and `chrome/fields.tsx` (`ValueInput`), used by
`PropsSection.tsx`, `LayerPanel.tsx`'s instance params and `ComponentsSection.tsx`'s defaults.

Tests:

- `packages/core/src/instances.test.ts` (7): the Stat card's board showing one trend icon as its instances do; a bound
  text's default on the board, and an edit to it changing the default; a param without a default left to the layer's own
  value; the board's layer in a state, inside an instance and with a variant shown; and hiding through a bound param, in
  a state the param hides, and through the state's and the variant's changes. The five about the board and Hide fail
  against the code before PAR-164.
- `apps/desktop/src/renderer/chrome/edit-scope.test.ts` (3): no note in the base state, the state's name, the variant's.
- `apps/desktop/src/renderer/chrome/prop-values.test.ts` (4): fields by declared type before there's a value, by the
  value's own type, JSON refused rather than kept as text, and any value read as JSON or text.
- `chrome/LayerPanel.stories.tsx`, InstanceChangedInAState: the note above the Pro plan's state, Swap and Detach in
  Yearly.

Gaps: the wiring has no automated DOM test (the text editor reading `layerOnBoard`, Layers' Hide in label, the notes in
the inspector, the typed fields). All of it, and the history above, was checked in an isolated copy of the app on a copy
of the example project on 2026-10-29: `--primary` edited in the Tokens panel showed in the frames with the file
untouched, Ctrl+Z and Ctrl+Shift+Z took it back and forth, and Ctrl+S wrote it to `src/index.css`; with the stylesheet
read-only, Save failed with the token and file named in the notice, the status bar and the Tokens panel, and Try again
wrote it once it could; an edit closed with Don't save left the stylesheet as it was; `SetTokens` from `parity exec` was
one unsaved step that Undo took back; Show every state on and off left Pricing clean; the Stat card showed one trend
icon, and Ctrl+Shift+H on Falling showed it and turned `showFalling`'s default on; the text editor opened on $19 in
Yearly and $24 in Monthly; the notes showed in Yearly and not in Monthly; and 12 typed in a number param with no default
gave the number 12. Known limits:

- A value given to a theme that had none (a dark `--radius`), saved, then undone, has nothing Save can write: the canvas
  takes it out, but the stylesheet keeps it until it's removed by hand. Frames drawn offscreen (bitmaps, exports) keep
  such a value until the project is reopened.
- Clearing a prop in a state (a boolean switched back to its default, a text emptied) takes back the state's change
  rather than setting the prop, so a prop the base design sets can't be turned off in one state.
- The stylesheet changing on disk isn't read back into the tokens until the project reopens, as before.

## Tokens

What the Tokens tab shows, and how a token is copied and edited from it.

### Previews of every kind of token (PAR-141)

Every row in the Tokens tab draws its token as it looks, in one fixed box, so the names line up whatever the kind. A
color shows a swatch for each theme; spacing, a bar at its true size; a radius, a rounded corner; a shadow, a card's
corner on the design's sheet; type, "Aa" in its size, weight, spacing or font; line height, lines of text; opacity and
blur, shapes on the design's sheet; a duration, a track; an easing, its curve; an animation, one plain block running its
keyframes; a z-index, where it falls among stacked sheets; breakpoints and containers, their share of a wide screen; an
aspect ratio, a box of that shape; a cursor, its icon, and hovering it shows the real cursor. A bare number has nothing
to draw, so its row shows the number. Beside the name is what the token comes to, in the unit people think in (`16px`,
`50%`, `1.5×`, the first font, `1000ms, loops`), or nothing where the preview says it all.

- **Sections follow what a token is for,** not where Parity files it: Colors (Semantic colors, then the Palette), Fonts,
  Font sizes, Font weights, Line height, Letter spacing, Spacing, Radius, Borders (Widths, Width and style), Shadows
  (Box, Inset, Drop, Text), Opacity, Blur (Layer, Backdrop), Motion (Durations, Easing, Animations), Layers,
  Breakpoints, Containers, Aspect ratios, Perspective, Cursors and Other. Effects and Other no longer hold blurs,
  z-indexes, border widths and the like. A token's kind comes from core's `previewKind`: its category, its name whatever
  its case or separators, its value, and the DTCG type a `.lib.par` gives it.
- **Values are what the token comes to.** A reference is followed to the value at the end, through `calc()` too, in each
  theme (`--radius-lg: calc(var(--radius) + 4px)` draws at 14px), and a step of the spacing scale is the scale times its
  factor. The project's custom properties are never set on Parity's own elements, since shadcn's names are Parity's too.
- **Spacing keeps the usual box.** A bar is drawn at its true size up to 16 pixels short of its box. Past that, a longer
  one is drawn true to there and the rest squeezed, hatched, into those last pixels, on a log scale up to 384 pixels, so
  a squeezed bar never passes for its true size and a longer length still ends further along; the pixels beside the name
  say how long it is. The detail draws the scale the same way with more room, so most steps are at their true size.
- **Each measured kind lists smallest first:** font weights from thin to black, font sizes from `text-xs` up, shadows by
  how far they reach past their box (for the furthest layer, the offset plus the blur and spread, read from the value
  rather than a size name), then spacing, radii, letter spacing, line heights, border widths, blurs, opacities,
  durations, layers, breakpoints, containers, perspective and aspect ratios by value, and animations by their duration.
  A value that is a duration is a duration whatever its name, so tw-animate-css's `animation-delay-75` lists with the
  durations. Tokens of the same value, and the kinds with no one order (colors, fonts, easings, cursors), go by name the
  way people count: numbers by value (`chart-2` before `chart-10`) and size words smallest first (`2xs`, `xs`, `sm`,
  `md`, `lg`, `xl`, `2xl`, and Fluent's `XXS` to `XXL` and `Small` to `XLarge`). A value that can't be measured goes
  after the rest, by name the same way.
- **What a design shows sits on the design's sheet:** shadows, blur, opacity and type are drawn on white in the light
  theme, as in a frame, not on Parity's dark chrome. Measurements are diagrams in Parity's ink.
- **Every color swatch has one clean edge (PAR-435).** One element paints the color over a checkerboard, which shows
  through a see-through color, and draws a hairline over both in 14% of Parity's text color, following the swatch's
  radius (`swatch` in `token-previews.tsx`). It's light in the dark UI and dark in the light one, so black, white and
  `foreground`-like swatches stand off the panel, with no white corners on dark ones. Rows, tiles, the detail's preview
  and value dots (`Swatch` in `chrome/fields.tsx`, which the inspector's token picker shares), palette shades and a
  library's described tokens all draw it. A token has a swatch for each theme, split by a 1px gap, even where two themes
  share a value, in rows, tiles and the detail, whose swatches are each named for their theme. A palette row's last
  shade is rounded too: each shade's copy helper follows it in the row, so the rounding goes by the last button rather
  than the last element.
- **Tiles.** The List and Tiles buttons beside the search switch views. Tiles are two across, each a larger preview with
  the name and what it comes to under it. A bare number stays a row, as a tile of only a name says less. The palette
  stays a grid in both.
- **Copying.** A row's or tile's copy button, which shows in place of the value while the row is hovered or has the
  keyboard, so the name never gives up room for it, copies the token's name (`radius-md`), which Parity's fields take,
  and its icon springs into a green check. Ctrl+C (Cmd+C on a Mac) on a row or tile does the same. A palette shade's
  tooltip is its name, and a click copies it, with a "Copied" bubble, as there's little else to do with one of 242.
- **Editing.** Clicking a row or tile opens the token's detail (below), where Edit changes it. A palette shade is edited
  from a search: while searching, the palette's matches list as rows.
- **Motion plays only while it's looked at:** a duration, easing or animation runs while its row or tile is hovered or
  has the keyboard, through the Web Animations API, and stops when that ends, so an idle tab runs no animations. With
  reduced motion it holds still. An animation runs the project's own `@keyframes`, read by name from its stylesheet,
  inside `@layer` and `@media` too; one whose keyframes aren't there holds still. Every animation, whichever library
  it's from, runs on the same plain block, with a dashed outline where the block rests, so one that fades, shrinks or
  collapses still shows against where it was. A keyframe value reading a variable only its page has (Radix's
  `--radix-accordion-content-height`) takes the variable's fallback, or, for a size, the block's own.
- **Only the rows in view are drawn,** so the theme's 500 tokens cost what a screenful does. The search and the filters
  stay above the list as it scrolls.
- **Narrow panels.** The left panel is at least 232 pixels wide, enough for every tab's icon and the collapse button.
  The open tab shows its name only when the tab strip has room for it, and is otherwise an icon like the rest, with its
  name in the tooltip. The filters drop their counts before their names, and every count is in the filter's tooltip. The
  search says "Search tokens", without a count, which didn't fit (PAR-437).

Code: the drawings are `apps/desktop/src/renderer/chrome/token-previews.tsx` (`TokenArt`, `TokenGlyph`, `TokenTile`,
`valueLabel`, `valueProblem`, `spacingSlot`, `tokenSections`, `useHoverPlay`); the panel is `chrome/TokensPanel.tsx`
(`comesTo`, `panelItems`, the virtualized list, `TokenRow`, `TokenTileButton`, `PaletteShade`, `TokenEditor`); the copy
parts are `chrome/Copy.tsx`; the keyframes are `tokens-store.ts` (`keyframesNamed`, `TokenStore.keyframes`); a token's
kind, the Copy as forms and the value helpers are `packages/core/src/token-kinds.ts`. The Storybook explorations under
`explorations/previews` draw with the same module, from sample tokens.

Tests:

- `packages/core/src/token-kinds.test.ts` (12): kinds over Tailwind's theme, a project's own tokens, and the Chakra,
  Fluent and Mantine registries, where no Chakra or Fluent token is left a bare number; Copy as forms; brackets and
  quotes left open; references listed and filled in; values split at their top-level commas.
- `apps/desktop/src/renderer/tokens-store.test.ts` (1 of its 4), in Chrome: an animation's keyframes read from a
  stylesheet, inside `@layer` too, with each step's timing function as its easing.
- `chrome/TokensPanel.stories.tsx`: AllTokens (no animation running with nothing hovered), Tiles, Copying (the row's
  button, Ctrl+C, a palette shade), Motion, EditingAPaletteShade (from a search), InvalidValue, UnclosedBracket (a
  bracket left open and a missing token, refused) and DescribedOnly (the end of the list, drawn once scrolled to). All
  22 of the file's stories played in Storybook on 2026-10-29.
- `explorations/previews/TokenPreviews.stories.tsx`: all 18 played on 2026-10-29, drawing with the app's module.
- `chrome/TokensPanel.stories.tsx` EqualThemes (PAR-435): `chart-3`, equal in Light and Dark, has two swatches in its
  row, its tile and its detail, each named for its theme.
- Swatch edges (PAR-435) were checked by eye on 2026-10-29 in AllTokens, Detail, Tiles and DescribedTokens, dark and
  light: black, white and destructive swatches each with one edge, and the palette's rows rounded at both ends.

Gaps: the previews themselves are checked by eye in Storybook, not by pixels. Opacity, blur and border width are still
filed under Other and Effects as categories, so the inspector's pickers don't offer them by kind yet; the panel's
sections already split them.

### A token's detail (PAR-143)

Clicking a token's row or tile opens its detail beside the panel, top to bottom:

- **A large preview.** A color shows each theme side by side, named. A spacing step is drawn at its true size among up
  to eight of its neighbours on the scale; a duration races the others; an easing is drawn over the rest, faintly; a
  font or size is set in a specimen; a z-index is marked in its stack; a breakpoint on a ruler with phone, tablet and
  laptop widths. Motion plays while the detail is open, with a Pause button on the preview; with reduced motion it waits
  for Play.
- **The name** (`--primary`), with what it comes to on the right as its row shows it, left out where the value already
  says just that, and what a `.lib.par` says it's for.
- **One list of facts:** its value in each theme, a shadow's layers or a font stack one part to a line; Built on, the
  tokens its values refer to in any theme, each with what it comes to (a spacing step shows `spacing × 4`); and From,
  the library that describes it. A value the last save couldn't write says "Not written to the stylesheet".
- **A bar with Edit and Copy.** Copy copies the name, as rows do; its arrow opens Copy as, with `var()` under CSS and
  the name under Token. It offers nothing a framework adds, such as a class, since a variable says only that it can be
  used as one, whichever framework defined it. A spacing step has no value of its own, so its Edit is off, and its hint
  says to change `--spacing` instead.

Themes are named as the Modes panel names them: the root's values are the theme option that adds no class (Light), and
`.dark`'s are the option whose class is `dark` (Dark). A library's themes take their options' names too, and a theme no
option switches on is named from its key (`teams-high-contrast` is Teams high contrast). The class itself never shows.

Edit turns the values into fields in place, checked as they're typed, with what's wrong under the field: a bracket or
quote left open ("A bracket isn't closed. Add ) at the end."), which the browser would close by itself and take; a
`var()` naming no token ("There's no token named radius-huge."), each reference read in its own theme; a `var()` naming
the token itself ("primary can't be built on itself.") or one built on it ("primary is built on chart-1, so this would
loop."), in another `var()`'s fallback too, which the old values alone would let through; and a value that, with its
references filled in, isn't the kind's ("That isn't a color. Try oklch(0.6 0.2 250) or #2563eb."). The preview follows
what's typed while it can draw it. Apply is off until something changed and every value is right; Cancel or Escape in a
field leaves editing without changing anything, and Escape from the buttons closes the detail. Apply changes every frame
at once as one undoable step, unsaved, as any edit is (see "One history, saved together"): the detail then says
"Applied. Saving writes it to src/index.css.", with Undo while that's still the last step, even after Edit and Cancel.

Code: `apps/desktop/src/renderer/chrome/TokenDetail.tsx` (`TokenDetail`, `DetailPreview`, `themeLabel`, `CopyMenu`); the
panel's `TokenPopover` and `Detail` in `chrome/TokensPanel.tsx`, which name themes with `themeNamesOf` from the
project's modes and apply through `TokenStore.set`. The Storybook exploration's own detail
(`explorations/previews/token-panels.tsx`) is the design it came from, with Save in place of Apply.

Tests: `chrome/TokensPanel.stories.tsx`: Detail (Light and Dark, never `.dark`; Copy and Copy as), EditingAColor,
EditingAPaletteShade, SpacingStep (Built on `--spacing × 4`, Edit off), InvalidValue and UnclosedBracket (refused as
typed, a token built on itself too, Apply off), ReferenceToAnotherToken (Apply as one unsaved step, Edit and Cancel
keeping Undo, then the detail's Undo), ReferenceLoop (refused through another token), and SaveFails. All 24 of the
file's stories played in Storybook on 2026-10-29. Gaps: the inspector's pickers don't show previews yet, the rest of
PAR-143.

## Libraries

How a library's own designs reach the projects that install it.

### A library's components are named by the library in its own project (PAR-124)

A project with a `.lib.par` at its root is a library's own project, and its own components are named by the library, as
`nova/Button`, the way the apps that install it name them. So a design the author makes on the library's canvas, which
Save writes into the file's `canvas`, refers to `nova/Button` and works unchanged in those apps.

- **The library's id** is the file's `id`, else the package's name without its scope (`@acme/charts` is `charts`), the
  same rule the apps use for the library's section and its components' ids.
- **Every id gets it,** including ids that gained folders on a clash (`nova/demos/FieldError`), and so do components
  that show up later: a file changing, the type checker finding one the parse missed, or the person listing one by hand.
- **Only at the root.** A `.lib.par` anywhere else describes another package, and the project's components keep their
  plain names. A file that can't be read leaves them plain too, and the project's notes say why.

Code: `componentIds`, `filesChanged`, `checkedChanges` and `correctedSources` in `packages/code/src/listing.ts`, which
take the namespace; `discoverProject` in `packages/project/src/index.ts`, which reads it (`ProjectConfig.namespace`);
`libraryId` in `packages/core/src/library.ts`; the project service in `apps/desktop/src/utility/projects.ts`, which
passes it on as files change.

Tests: `packages/code/src/listing.test.ts` (2: ids start with the namespace, including qualified ones and ids libraries
have taken; and they keep it as files change, the checker adds one and the person lists one).
`packages/project/src/index.test.ts` (1: a library's own components are named by its `id`, else by its package's name).
`packages/core/src/library.test.ts` (1: `libraryId`).

### A library's component designs in the Components panel (PAR-125)

The component designs in a dependency's `.lib.par` canvas show in that library's section of the Components panel, under
"Component designs", before its components. Screens on the library's canvas aren't listed; they're the author's own
showcase.

- **They're named by the library:** `settings-row` is `nova/settings-row`, so it never clashes with the project's own
  designs, and instances inside it that place the library's other designs point at their new names. A project design
  with the same id wins, and the library's isn't listed.
- **They aren't the project's.** They don't show on the canvas or in the Layers panel, and Save never writes them; they
  change when the library does. A design that places one draws it the way it draws the project's own instances.
- **Search** finds them by name, as it does components.

Code: `libraryDesigns` in `packages/core/src/library.ts`; `findLibraries` in `packages/project/src/libraries.ts`, which
puts them on the library (`LibraryInfo.designs`); `DesignStore` in `apps/desktop/src/renderer/design-store.ts`, which
adds them to the designs instances can place (`getComponentLibrary`); `componentSources` in
`apps/desktop/src/renderer/chrome/AssetsPanel.tsx`.

Tests: `packages/core/src/library.test.ts` (1: component designs named by the library, their instances following,
screens left out). `packages/project/src/index.test.ts` (1: a dependency's canvas designs on its library).
`apps/desktop/src/renderer/design-store.test.ts` (1: a project design reaches a library design it places, which isn't an
entry and isn't saved). Gaps: the panel's section has no automated test. It was checked in an isolated copy of the app
on 2026-10-29, with a dependency whose `.lib.par` canvas held a component design and a screen: the library's section
listed the design under Component designs and left the screen out.

### Placing a library's design, linked or detached (PAR-126)

A library's design is placed like the project's own: drag it onto a design, or click it to add it to the selection. That
places a **linked instance**, which follows the library: when the library's design changes, so does every copy. Its
right-click menu has **Insert linked instance** and **Insert detached copy**. A detached copy is plain layers, baked
from what the design shows, with fresh ids, to change freely.

- **A linked instance** has the Instance section as any other: its variants and params, its state, overrides with Reset
  all, and Detach. It can't go to its main component or push overrides to it, as that's in the library; the section
  names the design, and its hint says which library it's linked to. Layers, the canvas's labels and the inspector call
  it by the design's name, as they do the project's own.
- **A detached copy** is what Detach makes of a linked instance (see "Main components and instances" in
  [decisions.md](decisions.md)): the root keeps the instance's id, so it's selected the same way, and it's one undo
  step, "Add copy". A library design nested inside stays a linked instance.

Code: `insertItem` in `apps/desktop/src/renderer/canvas/insert.ts` (an `instance` item with `detached`); the library
rows' menu in `AssetsPanel.tsx`; `InstanceSection` in `apps/desktop/src/renderer/chrome/LayerPanel.tsx`.

Tests: `packages/core/src/library.test.ts` (1: a library design placed in an app draws its components and params,
linked, and the same once detached, with no link left). Gaps: inserting from the panel and the Instance section for a
library's instance have no automated test. Both were tried in the same copy of the app: a click placed a linked instance
drawing the library's Switch and Button with its param's default, named by the design in the Layers and Instance
sections, and Insert detached copy placed plain layers.

## Zooming far out

What the canvas draws, and what it lets go of, once it's zoomed out far enough for frames to show their bitmaps.

### Frames sleep while their bitmaps show (PAR-197)

Once the camera comes to rest zoomed far enough out that frames are drawn no larger than their bitmaps (25% on a 1x
screen), every frame showing its bitmap sleeps: its design's React root is unmounted and the elements it drew are
removed, which is most of what a frame holds. The frame keeps its host element, its size and its bitmap, and its board
keeps its size, so agents' snapshots, hit testing at the frame's edges and the layout around it are unchanged. Zooming
back in, a sleeping frame keeps showing its bitmap until it wakes, then draws its design again at the size it had.

- **What sleeps:** a frame showing its bitmap, once the zoom has settled past the line, so a zoom passing through puts
  nothing to sleep. Not the selected board's frames, which outlines and panels measure, and nothing while interacting. A
  frame whose design doesn't render has no bitmap, so it never sleeps.
- **What wakes:** a sleeping frame wakes once it's no longer to sleep and its board is near the view (within a quarter
  of the view's size, as boards out of view are), one frame each animation frame, in the order they asked. A frame out
  of view stays asleep, still showing its bitmap, until it comes near. Selecting a board wakes its frames at any zoom.
- **A frame whose design changes while it sleeps** (an agent's edit, a token, a reloaded project) wakes wherever it is,
  so its board lays out the new size, and sleeps again once its new bitmap is taken.
- **Sizes hold through sleep and waking.** The frame's element keeps the height it had when it fell asleep until it's
  drawn again, and its host skips drawing while it sleeps, as a board out of view does, so the browser keeps the size it
  last had when drawn rather than an empty frame's.
- **What reads a sleeping frame's DOM** finds its host, empty: hit testing finds the frame and its design but no layers,
  as over a frame's background, and an agent's cursor pointing at a layer there points at the frame instead. Anything
  that measures layers does so on the selected board, which never sleeps.

Code: `useAwake` in `apps/desktop/src/renderer/canvas/frame-sleep.ts`; `FrameTile` in `canvas/ContainerView.tsx`, which
decides from its bitmap and passes `asleep` to `ModeView.tsx`, which unmounts the guest and holds the frame's height;
the board's `near` and `dormant` signals in `canvas/ContainerShapeUtil.tsx`; `isRestingFar` in
`canvas/CanvasEditor.tsx`; the `[data-asleep]` rules in `styles.css`.

Tests: `apps/desktop/e2e/sleeping.e2e.ts` (2: zoomed out, every frame with a bitmap sleeps, the window's DOM nodes fall
by at least the elements the awake frames held, and no board changes size; back at 100% the design's frames draw again
with their layers while boards out of view stay asleep, still at the same sizes; and the selected board's frames wake at
a far zoom and sleep again once nothing is selected). `apps/desktop/src/renderer/ModeView.test.ts` (1: a frame put to
sleep keeps its host and height with nothing inside, and draws its design again when it wakes). `App.settle` in
`e2e/app.ts` waits for a design's board to wake, and `App.show` brings a design into view before finding a layer in it,
so the other files' tests work on frames that slept. Gaps: the order frames wake in, and waking on a changed design,
have no test of their own; the first was checked by reading `wakeNext`, the second by reading `useAwake`. The memory it
gives back and the time waking takes were measured by hand in a debug copy (see [decisions.md](decisions.md), Canvas),
not by the suite.

### What a frame shows, keyed once (PAR-439)

When the type checker finds a component the guest didn't have, or finds that one moved to another file, every frame
draws again with it: the live frame in place, keeping the state of its other components, and its bitmap is taken again
with the same code offscreen, so zoomed out it doesn't keep showing the old one. A frame asleep wakes for it, as for any
change to what it shows, and sleeps again once its new bitmap is taken. Before, the guest swapped the component's loader
and nothing else, so frames and bitmaps kept what they had drawn until their design next changed.

- **One place says what a frame shows.** `useFrameShows` works out, for each frame, `drawn` (the guest, the revision of
  its code, the mode and the design's tree) and `key` (that, with the size and the tokens previewed), and the job that
  draws it offscreen. The live frame draws again when `drawn` changes; its bitmap, its skeleton and its sleep go by
  `key`. The live frame follows size and previewed tokens by itself, so a token preview doesn't draw every frame's React
  tree again.
- **The guest's code revision** goes up only when `addComponents` changes where a component comes from: a component
  given again from the same file, as each type-checker pass and each offscreen render does, changes nothing, and its
  module isn't loaded again. One revision covers the project, so a component that moves redraws every frame and retakes
  every bitmap, one at a time in the background; frames whose design doesn't use it draw the same as before. That's rare
  next to saves, which don't change it. A component's own boundary also counts its moves, so one that failed starts over
  when it comes from a new file rather than keeping its error.
- **The offscreen renderer gets the components too.** The bitmap job carries the components the guest was given since it
  loaded, as agents' renders already did, so a frame using one isn't drawn offscreen without it.

Code: `useFrameShows` and `useFrameBitmap` in `apps/desktop/src/renderer/canvas/frame-bitmaps.ts`; `FrameTile` in
`canvas/ContainerView.tsx`, which passes `drawn` to `ModeView`'s `shows`; `revision` and `addComponents` in
`packages/renderer-react/src/guest.ts`, declared on `Guest` in `packages/core/src/adapters.ts`.

Tests: `packages/renderer-react/src/guest.test.ts` (1: the revision goes up when a component comes from a new file,
moved or added, and not when it's given the same file again or nothing, and subscribers hear each change).
`apps/desktop/src/renderer/ModeView.test.ts` (2: a component moved to another file is drawn from there once the frame's
`shows` changes, and not while it stays the same; and one that failed draws from its new file instead of its error).
Gaps: that `FrameTile`'s keys follow the revision, and that the bitmap job carries the added components, have no test of
their own; both were checked by reading `useFrameShows`. A component moving in the running app wasn't tried, since it
means changing the example's files, which other sessions share; `ModeView.test.ts` drives the guest's side of it, from
`addComponents` on.

## What the editor itself loads

What Parity's own UI costs the window, apart from the projects it shows.

### Icons and dependencies served lean (PAR-199)

The window loads only the lucide icons the editor uses, and Parity's dependencies minified. Nothing looks different; the
window holds less.

- **Icons:** each `import { … } from "lucide-react"` in the app's code is rewritten, while Vite serves it, to import
  each icon from its own file, and lucide-react is kept out of Vite's prebundling. Types are dropped, a name
  lucide-react doesn't export stays imported from the package so it fails as before, and the import keeps its lines, so
  the module's source map holds. Imports are found by parsing the module, so import-like text in a string stays.
  Dependencies and a project's own icons, which its builder serves, are left alone. Storybook uses the same config;
  builds bundle lucide-react as usual.
- **Dependencies:** what Vite prebundles for the UI is minified. Their source maps still lead DevTools to the code as
  published, so a stack trace through tldraw reads as before once DevTools maps it.
- **Measured** on the example project, against an isolated copy of the app: the window's scripts went from 19.3 M
  characters to 14.9 M, lucide-react's from 1.73 M to 0.28 M across 149 files, tldraw's from 3.53 M to 1.68 M, and the
  heap after a collection from 151 to about 141 MB. [decisions.md](decisions.md) has the calls.

Code: `iconImports` and `iconImportsPlugin` in `apps/desktop/scripts/icon-imports.ts`, and `optimizeDeps` in
`apps/desktop/vite.config.ts`.

Tests: `apps/desktop/scripts/icon-imports.test.ts` (8: every name an icon goes by, the installed package's index, one
file per icon under the module's own names, lines kept, types dropped, unknown names left, import-like text in strings
and comments left, other modules unchanged). The e2e suite (`pnpm test:app`) runs the editor with both in place. Gaps:
the minified prebundle has no test of its own; it was checked in an isolated copy of the app on 2026-10-29, where all
736 icons on screen drew and the window's scripts were measured over the DevTools protocol.

## Opening and closing projects

What opening a project loads into the windows, and what closing it gives back.

### Reopening loads the project afresh (PAR-195, PAR-422, PAR-433)

A reopened project's builder serves it at a new address, one no guest has had since the project service started, even
when the system would hand an old one out again, so the window and the offscreen renderer load its modules again rather
than drawing with the ones they kept from the last open. Closing a project gives back its canvas, however often it's
opened again.

- **Why a new address every time:** drawing a reopened project with the modules from before, its React included, kept
  every closed canvas in the window, about 34,000 DOM nodes and 125 MB of heap on the example project each time. Which
  of the browser's or React's references held it wasn't pinned down. A new address costs the window a fresh copy of the
  project's modules instead, about 15 MB of heap and 40 MB of memory per reopen, which a page can't give back.
- **Closing a project** drops its guest's entry and the stylesheet the document adopted for it, so the next open makes
  its stylesheets anew. The offscreen renderer drops a project's last guest when that project's jobs come with a new
  address. A reopen waits for the closing builder's process to end, so a project never has two.
- **Tabs and their views are given a tab's id,** not the tab: React keeps the props a list's parent drew last, so a
  closed tab passed whole would keep its session, canvas included, until the window drew again.
- **A builder started again** from the processes list keeps its address when it's free, since the canvas it serves is
  still open. When it isn't, it takes a port no guest has had, and the open tabs are told (`project.guestMoved`): each
  loads the guest from the new address, swaps in its tokens and lets go of the old guest. A tab whose new guest won't
  load keeps the old one and says so, and the service tells it again the next time the builder starts again, even on the
  same port, as it compares with where the window draws the guest (`followGuest`). A tab still loading when its guest
  moves draws from the new address once it's ready; one reopened while the moved guest loads keeps what the reopen
  loaded and lets the moved one go. When restarts overlap, the tab draws from the latest move, whichever guest loads
  first.

Code: `serveBuilder` and `restartBuilder` in `apps/desktop/src/utility/projects.ts`, with `newGuestPort`, `restartPort`,
`guestMove` and `followGuest` in `guest-ports.ts`; `moveGuest` in `apps/desktop/src/renderer/workspace.ts`;
`releaseGuest` in `apps/desktop/src/renderer/guest.ts`, called from `workspace.ts` and `render.ts`; `guestId` in
`apps/desktop/src/renderer/canvas/frame-bitmaps.ts`, which keys a reopened guest's bitmaps apart from the last one's;
`ProjectView.tsx` and `chrome/TabBar.tsx`, which take a tab's id.

Tests: `apps/desktop/e2e/reopening.e2e.ts` opens and closes the example project twice and checks the window ends within
3,000 DOM nodes of where it started; with the old address on reopen it ended about 69,000 over.
`apps/desktop/src/utility/guest-ports.test.ts` covers which port a builder takes, skipping ports guests had, and when
the windows are told a guest moved, and told again after a move they couldn't load;
`apps/desktop/src/renderer/workspace.test.ts` covers `moveGuest`, including a tab still loading, one reopened meanwhile
and overlapping moves. Gaps: the offscreen renderer's side has no automated test, nor has `restartBuilder` sending
`project.guestMoved` to the window. A project service started again forgets the ports, while the window keeps what it
loaded from them.

### A tab closed while its project opens (PAR-427)

Closing a tab whose project is still opening, as tabs restored at launch can be, closes the project once the service has
it: its builder stops, it leaves the processes list, and the window lets go of the guest it loaded for it. Before, the
service finished opening it and kept it, with its builder running and no tab. Opening the project again before the first
open finishes keeps it open in the new tab. The same holds for a tab closed while it reopens, and for a guest that fails
to load after its tab closed. Each open is tracked on its own, so an earlier open that was abandoned can't close or fill
a newer tab for the same project. While another tab's open hasn't heard which project it is, as one opening the default
project or a `.par` file hasn't, the close waits for it, since it may be the same project.

Code: `closeNow`, `open` and `reload` in `apps/desktop/src/renderer/workspace.ts`, through its `attempts` and
`settleDrops`.

A reopen asked for while the tab is already opening or reopening is left to the one in flight, so closing the tab
cancels it.

Tests: `apps/desktop/src/renderer/workspace.test.ts` (13: closed before the service answers, closed while the guest
loads, opened again before the first open finished, the reopened tab closed too before either open finished, the default
project opened again in a tab that doesn't know it yet, and closed once that tab turns out to be another project, the
guest failing after its tab closed, closed while a reopen closes the project, while it opens it again and while it loads
the guest, a reopen's guest failing after its tab closed, a second reopen asked for during one, and a project that
finished opening, closed with its tab).

Not tested: a tab changed or closed while a reopen saves its unsaved changes, and a reopen's `project.open` failing
after its tab closed. Both were checked by reading `reload`: after saving it reads the tab again and stops only when
it's gone or already reopening, and a failed `project.open` leaves no project to close.

## The window

How the app's window holds the canvas and the panels around it.

### The page never scrolls (PAR-424)

The window's page is always exactly the window: no part of the chrome makes it taller or wider, so it never scrolls.
Each panel scrolls on its own, so revealing or focusing something out of a panel's view, such as a Layers row or the
Screens heading's New screen button, scrolls only that panel. The canvas stays where tldraw measured it, and clicks on
it land where they're aimed.

- **Why it matters.** tldraw measures where the canvas is when it mounts or resizes, not when the page scrolls. The
  end-to-end suite found the page 1139 px tall in a 903 px window, and focusing a design's title below the fold scrolled
  it by 235 px: the menubar and tabs went out of view, and every canvas click after it landed 235 px off, selecting
  nothing or the wrong layer.
- **The cause** was the Layers panel's group headings. Their New component and New screen buttons are visually hidden,
  left to screen readers (`sr-only`, which places them absolutely), until hovered or focused, and the heading wasn't
  positioned, so the buttons were placed against the window rather than inside the panel, and the panel's scroll didn't
  clip them. The heading is now `relative`.
- **The guard.** The app's root (`#root` in `styles.css`) is positioned and has `overflow: clip`, so nothing inside it,
  even an absolutely placed element with no positioned ancestor, can make the page bigger than the window. `hidden`
  wouldn't do: the page already had `overflow: hidden` (from the body), and the browser still scrolls a hidden page to
  show what's focused. `clip` makes it impossible to scroll at all. Menus, popovers, dialogs, tooltips and toasts are
  portaled to the body and fixed to the window, so they're unaffected.
- **Tab from a design's title** goes through that design's own controls and then leaves the canvas (PAR-424). Only the
  selected design's title, its variant, state and modes menus while they show, and its board's mode captions and state
  labels are in the tab order; every other design's are out of it (`tabIndex={-1}`), reached by N, Layers or a click,
  except the menus of a design that's hovered, which are in the tab order while they show. Enter and the arrows on the
  menus, captions and labels are theirs (`data-canvas-control`), so Enter on a caption selects its mode column as a
  click does; on the title itself Enter still selects the layers inside. Before, Tab from a title went through every
  other design's title in turn, and focusing one off screen was what scrolled the page.

Code: `#root` in `apps/desktop/src/renderer/styles.css`, the group heading in `chrome/LayerTree.tsx`, the tab order in
`canvas/ContainerView.tsx` (`TitleButton`, `TitleControls`, `StateLabel`, `FrameTile`'s caption), and which keys a
canvas control keeps in `canvas/shortcuts.ts`.

Tests: end to end, `apps/desktop/e2e/window.e2e.ts` (1): with a Members layer selected, Layers is scrolled and the page
neither overflows nor scrolls; Shift+Tab back from Members' title to the New screen button scrolls Layers up to it and
not the page; Tab on from the title leaves the page still; and a click on a layer then selects it. It fails without the
fix, at the first check. `e2e/keyboard.e2e.ts`, "Tab from a design's title": from Members' title Tab goes to its State
and Modes menus and its mode caption, where Enter selects the mode column, then out of the canvas without reaching
another title or board, where before it went on to the next design's title. Every end-to-end test also fails if the page
scrolled during it (see "Testing in the app" above); before the fix that also failed the older test that tabs on from
Sign in's title.

Gaps: a design that's hovered but not selected shows its menus, and they're in the tab order while they show. Nothing
yet keeps a future panel from scrolling the page by putting a focusable element outside its scroller; the root's clip
keeps the page still, but such an element would sit outside its panel.

## Rendering frames

How the project's code runs in the canvas's frames.

### Frames run React's production build (PAR-198)

Frames draw with the production builds of the project's dependencies, React's among them, so the window doesn't keep a
stack for every element React makes: on the example project its JS heap is 33 MB smaller, 117 MB rather than 150 MB. The
project's own modules are still served as in development, and its own dev server isn't touched. What's lost, and the
numbers, are in [decisions.md](decisions.md) under "Frames run the production builds".

- **Dependencies are prebundled as production:** the builder sets `process.env.NODE_ENV` to `production` in the
  dependency optimizer's own `define`, Rolldown's from Vite 8 and esbuild's before. The project's modules keep its mode.
- **JSX compiled for development still renders.** The renderer names modules React's production build leaves empty
  (`developmentStandIns`), and the builder serves a stand-in for any `…/jsx-dev-runtime` a module or a prebundled
  dependency imports: that package's `jsx` as `jsxDEV`, with `Fragment`.
- **Each frame's code still asks its own window,** in renders React starts itself and in the effects that follow,
  without the development build's `getOwner`: while React has a dispatcher out, the frame is the one whose provider is
  above the component, and a frame React renders, or starts committing as it reads the root's `ownerDocument`, becomes
  the one last drawn, so effects and class components' lifecycle methods ask about it.
- **Layers are still found from React's tree,** which reads only fields both builds keep.

Code: `productionDependencies`, `developmentStandIn` and `guestPlugin` in `packages/builder-vite/src/index.ts`;
`developmentStandIns` in `packages/renderer-react/src/index.ts`; `renderingIn`, `watchRenders` and `watchCommits` in
`packages/renderer-react/src/viewport.ts`, and `FrameWindowContext`, which the guest provides at each frame's top.

Tests: `packages/builder-vite/src/production.test.ts` (8: a Vite server prebundling a stand-in React as production while
serving the project's module as development, and its `jsx-dev-runtime` through the stand-in; a stand-in's import
resolved from the folder of the module importing it; a prebundled package compiled for development getting the stand-in,
with a runtime installed only below it; the stand-ins' matching; the optimizer settings for Vite 8 and before, its
plugin named after the stand-ins, and esbuild's plugin). `apps/desktop/src/renderer/frame.test.ts` and
`frame-nodes.test.ts` bundle React's production build, so the frame's window and finding layers are checked on what
frames run, including an effect of a render a timer started and a class's `componentDidUpdate` after a timer, in one of
two frames. Gaps: Vite 7 and earlier's esbuild setting is checked only as data in the tests; it was checked by hand on
`fixtures/vite7-js` (Vite 7.3.7), whose React came prebundled as production and whose JSX went through the stand-in, and
with a package compiled for development, which esbuild bundled with the stand-in. The numbers were measured by hand with
a script that isn't in the repository.
