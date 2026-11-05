# The editor

The production desktop can be packaged with `pnpm --filter @parity-app/desktop package` after `pnpm build` (PAR-9). The
Windows installer offers a per-user install directory and an uninstaller. CI's `try-installed` check opens a cold
project in that installed app and checks that the canvas and project service connect, then uninstalls it.

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
the canvas, the panels and the project show: 101 tests, which take five to eight minutes. It isn't part of `vp run test`
or `pnpm verify`. End-to-end tests run only in CI, never in local checks or Git hooks, including focused files. The
`App tests` workflow (`.github/workflows/app.yml`) runs them on Windows for every pull request and every push to main,
without blocking the merge until they run reliably there (PAR-438). Each feature's tests below name the end-to-end ones
that cover it.

- **What it starts.** `apps/desktop/e2e/global-setup.ts` copies `examples/shadcn-vite` to a temporary folder, linking
  its `node_modules` rather than copying them, and adds a Members screen: three `MemberRow({ member })` rows, a fragment
  and an email field. It starts Parity on the copy through `scripts/dev.ts`, with its own user data, agent file and a
  1440 by 900 window, on ports 5385 and 9385, or on ports the system picks when those are taken. When the run ends it
  stops that copy by its process id and removes the folder. On a picked port it also removes the build and dependency
  cache that port made, which the suite's own port keeps. The example itself, and any other copy of Parity running, are
  left alone.
- **The screen it needs.** Every test is written for a 1440 by 900 page. A smaller screen shrinks the window, so the
  canvas narrows and clicks land under the inspector: `App.connect` fails at once and says the screen is too small.
  GitHub's Windows runners start at 1024 by 768, so on CI on Windows `launch` first sets the display to 1920 by 1080,
  through `ChangeDisplaySettings`, and logs the result. It never changes a person's own screen.
- **When it can't reach the app.** `App.connect` writes each step to stderr as it starts (the canvas, the frames
  settling, the app's modules, the reset), and gives each its own time limit. A failure names the step, what the window
  shows and the errors its page logged, and quotes the app's last 40 lines of output. Once one file can't connect, the
  rest fail at once with its reason, since they would fail the same way: waiting out every file used to take longer than
  the job's 30 minutes, and the cancelled job never printed why.
- **How a test drives it.** The files run one after another against that one window, through the DevTools protocol with
  playwright-core. `App`, in `e2e/app.ts`, has the gestures: `click`, `rightClick`, `drag`, `selectDesign` by its title,
  and `selectLayer`, which clicks a layer and double-clicks down to it as a person does. Every test selects layers
  through it, so a change to clicking is made there alone. `dropFiles` drags files from the system over the window and
  drops them, with Chromium's own drag events carrying real files, as Explorer or Finder would. `App` reads what
  happened from the page (`children`, `style`, `selection`, `drawn`, `outlines`, `labels`, `undoLabel`) and never sets
  state to make something happen, apart from `show`, which puts a design in view at a zoom, `showEmptyCanvas`, which
  puts an empty part of the canvas in view, and `reset`, which undoes everything after each test. Copy and paste go
  through a stand-in for the clipboard on the page; the system's clipboard is never read or written.
- **Adding a test.** Put it in its area's file (`selecting`, `menus`, `inserting`, `moving`, `keyboard`, `fields`,
  `dropping`, `text`, `reopening` or `sleeping`), or in a new `apps/desktop/e2e/<area>.e2e.ts` that connects before all,
  resets after each test and closes after all, as the others do. Start with `app.show(design, zoom)`, act through
  `App`'s gestures or `app.page.keyboard`, and wait for what changes with `expect.poll`, since the app answers a frame
  or more later. Change the project only through edits Undo takes back, so `reset` can put it back. Then name the test
  in its feature's section here.
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
  top-level elements of the layers inside it. Text a layer draws outside any element of its own counts too (PAR-201), so
  a component that draws only text, as `function Label() { return "Email" }` does, has its text's box, and can be
  hovered, picked and sized on the canvas. An element that isn't drawn, such as one with `display: none`, is left out
  unless nothing else is drawn, and so is one clipped to nothing, such as the hidden input a checkbox draws for forms
  (PAR-163, below).
- **A point belongs to the innermost layer** whose elements hold it. The layers under a point, outermost first, are the
  ones whose boxes hold it, as before. A field built around an inner input is outlined around the field: its props, and
  so the attribute, reach the input, but its box is its outer element, and the input belongs to it.
- **Nested layers keep their own DOM.** A layer's elements stop at the layers inside it, so pointing at a card's title
  picks the title, and a layer's parent is the layer it's drawn inside.
- **What a parent hands a layer reaches it** (PAR-200). A `Button asChild` around a `Link` layer gives the link the
  button's class, attributes, handlers and ref, merged under the link's own as Radix merges them onto an element, and a
  `$render:` or `$renderWith:` slot gives its layer what the component renders it with. That holds for component layers
  as for element layers: the boundary that marks a component layer sits inside what the parent clones, so the props go
  past it to the component, and the layer is still found and still keeps its errors to itself.
- **Edge cases.** A component that draws nothing has no box: it can be selected from Layers but not on the canvas.
  Content portaled out of the frame, as a dialog's often is, isn't part of the layer's box; content portaled to a place
  inside the frame is. A slot a component draws more than once, as a list's `renderItem`, is one layer whose box covers
  every copy. A component that fails draws its error box in its place, and that box is the layer's.
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
- **When a component puts its `style` inside (PAR-201).** A component can take `style` and put it on an element inside
  another it draws, as a field passes its props to its input. The first time a layer draws such a component with a
  style, the guest finds where the style went in React's tree, before the frame is painted, and from then on draws a
  plain div around the component that takes the style instead. The div is a one-cell grid the component fills, so W 320
  makes the whole field 320 wide, and its outline is the field's. The design, the layers panel and the inspector don't
  change. A layer of it with no style, and a component that puts its style on its root, are drawn as they are. The guest
  keeps what it found for every frame, until the component comes from another file.

Code: the walk is `packages/renderer-react/src/drawn-nodes.ts`, the guest's side (boundaries, `ComponentLayer` and the
props it merges, when to walk again, the check against the attribute, the div around a component that puts its style
inside) is in `guest.ts`, with where a component put its style (`stylePlacement`) in `drawn-nodes.ts`, and the canvas's
lookups (`findNodeElements`, `nodeBox`, `nodesAt`, `nodeParent`, `nodeOfElement`, with the attribute as fallback) are in
`apps/desktop/src/renderer/frame.ts`. `ModeView` and the offscreen renderer (`render.ts`) register each frame's guest.
Hovering and clicking go through `canvas/hit.ts`, outlines, sizes and resize handles through `canvas/CanvasOverlay.tsx`,
dragging through `canvas/layer-drag.ts`, inserting through `canvas/insert.ts` (its rules in
`packages/editor/src/insert.ts`), and `chrome/reveal.ts` scrolls to a layer's box. Whether a component takes `style` is
read in `packages/code/src/props.ts` (`takesStyle`), and the note is in `chrome/LayerPanel.tsx`.

Tests:

- `packages/renderer-react/src/drawn-nodes.test.ts`: the walk on fibers shaped as React 19 makes them: a component that
  ignores its props, a fragment, a field around an input, nested layers, a provider, a component that draws nothing,
  portals in and out of the frame, a slot drawn twice, and giving up on a tree that isn't one; and text drawn outside an
  element (PAR-201): a component that draws only text, one that draws text beside an element, text inside an element
  left to the element, and a provider given its children's text; and where a component put its style (PAR-201): on its
  root beside its own styles, inside, on a fragment's second root, nowhere, not in a slot's layer, and not known before
  it draws an element.
- `apps/desktop/src/renderer/frame-nodes.test.ts`: the same cases on React itself in Chrome, through the canvas's
  lookups: each layer found, its box measured and resolved from a point, DOM a component adds by itself, ids React moves
  to other DOM without adding any, and the fallback to the attribute. Seven of these eight fail with the attribute
  alone, the prop-ignoring row first. It also renders slots that hand their layers props (PAR-200): Radix's `asChild`
  giving an element layer and a component layer the button's class and attributes, a component layer its handler and ref
  with its own class kept, the component layer still found inside the button and under the pointer, and a failing
  component in the slot keeping its error to itself; and a `$renderWith:` slot giving an element layer and a component
  layer what each copy is rendered with, the node's style and each copy's key kept, and both spread and named props. A
  component that draws only text has its text's box, no elements, and is under a point over its text (PAR-201). A field
  given a width is drawn in a div of that width which the whole field fills, its input left as the field lays it out,
  while a field with no style and a link that puts its style on its root are drawn as they are (PAR-201).
- `packages/code/src/props.test.ts`: whether a component's props take a `style`.
- `chrome/LayerPanel.stories.tsx`, ComponentWithoutStyle: the note, and wrapping the component from it.
- `apps/desktop/e2e/selecting.e2e.ts` (6), end to end (PAR-202), on the Members screen the run adds: hovering a
  `MemberRow` outlines it; a click selects it, with its outline, its name and size, and the inspector's note; Wrap in
  layout from the note; dragging it to reorder, with the copy where it lands, and one undo; the email field outlined
  around its input; and the fragment around both of its elements.

Gaps: the canvas's pointer handling over such a component, first checked by hand on 2026-10-29, is now the end-to-end
test above. Code generated from a design doesn't exist yet; when it does, it has to draw the same div around a component
that puts its style inside.

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
  the design already selected. A box that touches nothing selects nothing. Escape, or the window losing focus while the
  box is drawn, puts back what was selected before it. A layer that isn't drawn is never touched.
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
- `canvas/CanvasOverlay.test.ts` (13), in Chrome: the overlay over two frames of a dashboard drawn by `ModeView` and the
  React guest, with the real mouse, and an element standing in for tldraw's canvas. A click selects the top-level layer
  and keeps the press from tldraw, a frame's background selects the board, a checkbox's hidden input doesn't stretch it
  over the background, the board's own background reaches tldraw, double-clicks go a level deeper each, Ctrl and Shift,
  dragging an unselected layer moves it, a box selects what it touches in its frame, Escape puts the selection back, and
  so does the window losing focus, after which the pointer moving on and letting go selects nothing more (PAR-583), and
  hovering outlines what a click would in the frame under the pointer, and nothing over the background. All but Ctrl's
  and the board's own background fail against the overlay as it was.
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

### The overlay measures only when what it shows can change (PAR-522)

The overlay draws outlines, the selected layer's name and size, resize handles, a layout's spacing, redlines and the
layout grid over the frames. It used to measure them every animation frame while anything was selected, searching the
whole canvas for the design's frames several times each time, so a selection held still cost the window's thread as much
as the rest of the canvas. Now it rests while nothing moves, and still follows everything it did.

- **Frames are found from an index,** kept as `ModeView` mounts and unmounts each frame, not by searching the canvas.
  Everything that finds a design's frames uses it: the overlay, hovering and clicking, agents' presence, Reveal, the
  style preview and the tab order overlay.
- **It measures after a change** to the camera or a board, the selection or the hover, the tool or View's settings, a
  design, a frame's size or what it draws, an image or font loading, or the pointer, wheel and keys, which drive drags,
  snapping, resizing and Alt's redlines. After each it measures every animation frame for half a second, then rests.
- **Animations are followed while they run.** Once it has settled, it keeps measuring while an animation or transition
  runs in a frame of the selected or hovered design, so outlines move with it, and stops when it ends. A component that
  animates by script writes to its DOM, which counts as a change. A design animating elsewhere doesn't keep it going.
- **Measured** on 2026-11-04 in an isolated copy of the app on the example project (119 frames), its development build,
  held still for 3 seconds with the pointer over empty canvas: the window's script time with Home selected went from 91
  to 7 ms per second, and with its nav selected and zoomed to from 81 to 7, against 8 with nothing selected. The outline
  landed on the same pixels before and after, through tldraw's animated zoom and a 3-second CSS animation inside the
  frame, which it followed from start to end; afterwards the window was back at 6 ms per second.

Code: the index is `registerFrame`, `findFrames` and `allFrames` in `apps/desktop/src/renderer/frame.ts`, registered by
`ModeView.tsx`. When to measure is `packages/editor/src/overlay-measuring.ts` (`overlayDesigns`, `drawsOver`,
`settleUntil`, `measuresNext`), and what wakes it is the measuring effect in `canvas/CanvasOverlay.tsx`, with its
`animates`. The calls are in decisions.md, The selection overlay measures when what it shows can change.

Tests:

- `packages/editor/src/overlay-measuring.test.ts` (11): the designs drawn over, the layout grid's every frame, the
  settle window and how changes move it on, resting once settled, following an animation without asking about it while
  settling, and resting while nothing shows.
- `canvas/CanvasOverlay.test.ts`, "finding a design's frames" (2), in Chrome: the frames `ModeView` registers, found in
  the page's order, by state and mode, only inside the root asked, and left out once they unmount. Its other tests drive
  the overlay with the real mouse, through the index.
- `canvas/style-preview.test.ts` finds its frames through the index too.
- `apps/desktop/e2e/selecting.e2e.ts`, on CI: hovering and selecting outline layers, with the selected one's name and
  size, and a dragged layer shows where it would land, all through the index and the measuring.

Gaps: outlines following the camera and an animation inside a frame, and the window's idle script time, have no
automated test; they were checked in the app as above. Layout that moves with nothing the overlay hears of, such as a
video taking its size once its data arrives, is caught up at the next change.

### Distance labels beside the line (PAR-558)

Holding Alt over a layer, or snapping one as it's moved or resized, draws the distances to what it measures against as
red lines. Each line has a black label with the distance in pixels, then the spacing step it comes to (`spacing-4`) in
grey, or "off scale" in amber when it isn't a whole or half step.

- **The label sits beside the line, not on it,** 8px from its midpoint: below a horizontal line, centred on it, and to
  the right of a vertical one. Before, it was centred on the line and hid it, so between two layers a few pixels apart
  no line showed at all. Beside a small selection it can reach a corner's resize handle, so it's drawn over the handles
  and lets presses through to them.
- **One colour for the label.** The step was a red chip and "off scale" a red one; both are now text in the black label,
  so the line stays the only red.

Code: `RedlineView` and `redlineLabel`, which places the label, in `apps/desktop/src/renderer/canvas/Redline.tsx`.
`canvas/CanvasOverlay.tsx` measures the lines (`redlines`) and draws them.

Tests:

- `canvas/Redline.test.ts` (3): a horizontal line's label below it and centred, a vertical line's to its right, and both
  clear of a line 2 or 4 pixels long.
- `canvas/Redline.stories.tsx` (Parity/Canvas/Distances): layers side by side, stacked, 4px and 2px apart, and off the
  scale. Close Together's play test checks the label starts below the line.

Gaps: a label beside a line near the canvas's edge can run past it, as the centred one could. Checked in the app on
2026-11-04 with Alt between layers far apart and a few pixels apart.

### Right-click menus (PAR-168)

A right-click on a design opens Figma's canvas menu, as far as Parity's commands go, for what's selected. Each item
shows its keys from the keymap as the menubar shows them (`ContextMenuShortcut`, through `formatKeys`), and runs the
menubar's command. The Layers panel's menu is unchanged.

- **The items**, in groups with a line between them: Select layer; Copy, Paste here, Paste over selection, Paste to
  replace and Duplicate; Bring to front, Bring forward, Send backward and Send to back; Wrap in layout, Make component
  and Go to the main component; Hide. Labels are the menubar's, except that Go to names the main component ("Go to Plan
  card"), Hide reads Show when every selected layer is hidden as the board shows it in the state being edited (the
  variant shown, the state and the params it binds, as Hide itself reads them, PAR-486), and Make component, with a
  design selected on its own, reads "Convert to component", or "Convert to screen" on a component. Paste here has no
  keys. Lock comes with PAR-192, and Open in editor and Copy as JSX with PAR-166; they have no placeholders.
- **With designs selected**, what's only for layers is left out: Paste to replace, the order, Wrap in layout and Hide.
  Go to the main component is there only with an instance selected.
- **Unavailable** items are greyed: the order and Make component with several layers selected, Make component with
  several designs, and, for layers inside an instance, Copy, Duplicate, the order, Wrap in layout and Hide. Paste over
  selection and Paste to replace stay for those, and say why they can't. The menubar's Edit and Object menus grey the
  same ones for layers inside an instance, and their keys do nothing then, since both read one rule.
- **Around the designs** the menu is New screen, New component and Insert…, then Paste here, then Select all and Zoom to
  fit (PAR-546, below).
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
  layer here", "Paste screen here"), and selects the copies.
  - Designs go on the canvas with their top left at the pointer, sitting as they sat together. Notes do the same.
  - Layers, text and images go into the deepest of the design's own layouts under the pointer, in the frame there, at
    the slot under the pointer, where a dragged layer would land (`slotAt`). A hidden layer isn't a slot. A layout
    inside an instance is never the target.
  - A component's slot counts as a layout (PAR-419): over a card's header, a copy goes among the header's layers. A slot
    is under the pointer when the element its layers are drawn in is, the slot of the layer under the pointer first, and
    its place there is read from that element as a layout's is. So a slot that holds no layers yet, and a part of the
    component that draws no slot, such as a title it draws from a prop, aren't targets: the copy goes to the layout
    around the component instead.
  - In a layout that's absolutely placed as the frame shows it (its state, variant options and viewport, PAR-464), the
    copies go last, on top, at the pointer: their left and top in half steps of the spacing scale from inside its
    border, in place of their own insets. A copy stretched between its insets, with a left and a right and no width,
    keeps its right, and so its bottom with a top, a bottom and no height (PAR-419). Several go side by side from there,
    each 4 steps right of the one before when that one has a width in steps (PAR-24); one that fills or hugs leaves the
    next where it starts. A copy that's absolutely placed itself goes in the slot, and at the pointer.
  - Over a design with no layout under the pointer, nothing is pasted, and a toast says so. Around the designs, text
    becomes a note at the pointer, and layers a new screen there, named after them (PAR-546).
- **Where the right-click lands decides.** tldraw keeps the system's menu from the canvas, pans while the right button
  is dragged (no menu then), and when the button comes up without panning, selects the board under it and sends a
  `contextmenu` of its own, for a release anywhere over the canvas. So the menu reads the selection, the target and Ctrl
  when the button goes down. A design's title keeps its own menu, and state labels, toolbars and text being edited open
  none. A text note over a board gets the menu for around the designs.
- **A right-click while the menu is open** opens it again at the new point, for what that right-click selects, as in
  Figma (PAR-419); one off the canvas, such as on a panel, closes it. The open menu lays Base UI's backdrop over the
  page, so tldraw never hears of that press: the menu stays open, and when the button comes up the canvas under the
  backdrop gets the `contextmenu` tldraw would have sent, which moves the menu there.
- **Interact mode:** the design gets the right-click, and no menu opens.
- **Keys after an item** are the canvas's at once (PAR-424). A menu holds focus for the 100 ms or so it takes to fade
  out, so the canvas's shortcuts treat a menu, list or dialog that's closing (`data-closed`) as gone, a field in it
  included: Ctrl+Z pressed straight after Duplicate undoes it, where it used to go to the closing menu and do nothing.
  This holds for the menubar's and the title's menus, and dialogs, too.

Code: the menu's contents are `canvasMenu` in `apps/desktop/src/renderer/chrome/canvas-menu.ts`, which takes the
selection and the design under the pointer and returns the items, available or not, in order, with Select layer's list;
`rightClickSelection` there is what a right-click selects, and `layerCommands` which of Copy, Duplicate, the order, Wrap
in layout and Hide can act on the selected layers, which the menubar's `actions.ts` reads too. `chrome/CanvasMenu.tsx`
is the context menu around the canvas area in `ProjectView.tsx`: it records the right button's press, finds the design
under the pointer with `hitTest` and `pickLayer`, outlines Select layer's entries through the hover, runs items through
`actions.ts`, and opens again on a right-click outside it (`reopensOnCanvas`, from `onOpenChange`). Paste here is
`pasteAtPointer` in `canvas/clipboard.ts`, which reads the clipboard and places designs, notes and text; layers go
through `canvas/paste-here.ts`, where `measureHere` measures the layout or component's slot under the pointer in its
frame, and `pasteHere` in `packages/editor/src/paste-here.ts` places the copies (`placedAt` at the pointer). Which keys
an open menu keeps is `inMenu` in `canvas/shortcuts.ts`.

Tests:

- `chrome/canvas-menu.test.ts` (21): one layer's menu in order with its keys, an instance's Go to, several layers, Show
  and Hide in two states, Show for a layer the variant shown hides and Hide after Hide shows it, a design's menu and its
  Make component label, several designs, a layer inside an instance, the menu around the designs and on a canvas with
  nothing on it; Select layer's list, names, checks and the design's kind; what a right-click selects on a layer, a
  frame's background, around the frames, the root, inside the selection, outside it, and in a selected design; and
  `layerCommands`, which the menubar shares, for the design's own layers, one or several, and for a layer inside an
  instance, the root, and one of each.
- `packages/editor/src/paste-here.test.ts` (23): the dashboard's stats row, at the slot under the pointer, first and
  last, several copies together, fresh ids, a hidden card skipped, an empty layout; an absolutely placed layout at half
  size, half steps, a copy's own insets replaced; an absolutely placed copy in the slot; a state that places the row
  absolutely, and a viewport's patch that does; a binding kept only for a param the design has; nothing pasted into a
  layer that isn't a layout; several copies side by side in an absolutely placed layout; a stretched copy keeping its
  right and bottom, and a sized one only its right; a component's slot, the place under the pointer in it and the other
  slot left alone, and nothing pasted into a slot the component doesn't have or with no slot named; and `slotHere`'s
  slot and line in a row, in a component's slot, none in an absolutely placed layout, and none outside a layout.
- `canvas/paste-here-frame.test.ts` (6), in Chrome: `measureHere` on a grid drawn at half size, with a hidden card, the
  slot under the pointer, first and last, at the pointer inside an absolutely placed layout's border, and the deepest
  layout; a card component's default slot found through the element its layers are drawn in, by a layer in it and by the
  row around them, and its footer slot; and the layout around the card over the title it draws itself.
- `chrome/AppMenu.stories.tsx` (EditLayerInInstance and ObjectLayerInInstance, under Parity/Chrome/App menu): with the
  Users card's value selected inside its instance, Edit greys Copy and Duplicate but not the pastes, and Object greys
  Wrap in layout, the order and Hide or show. Not played in headless Chrome; the end-to-end test below checks the same.
- `chrome/CanvasMenu.stories.tsx` (8 stories, under Parity/Chrome/Canvas menu), on the real canvas with tldraw: Layer,
  Instance, SeveralLayers, Design, EmptyCanvas, NewScreenHere, SelectLayer and Interacting. Each right-clicks through
  tldraw's pointer events and checks the selection, the items, what's unavailable and the keys; SelectLayer checks the
  list and the outline, and NewScreenHere where the new screen goes. The first seven played without errors in headless
  Chrome on 2026-10-29, and EmptyCanvas and NewScreenHere again on 2026-11-05.
- `apps/desktop/e2e/menus.e2e.ts` (8), end to end with the system's right button (PAR-202): a right-click on a
  `MemberRow` selects it and lists its items in order, with their keys and the lines between groups, and Duplicate runs
  as one undo step; Ctrl+Z pressed at once after Duplicate, with focus still in the closing menu, undoes it (PAR-424,
  which fails without the fix); a right-click on the next row, left of the open menu, selects that row and moves the
  menu as far as the pointer moved, one menu still, whose Duplicate acts on that row (PAR-419); with a layer inside the
  Users card selected by Ctrl and a click, the menubar's Edit greys Copy and Duplicate and its Object greys Wrap in
  layout, the order and Hide or show (PAR-419); from a stat card, Select layer lists Dashboard, Main, Content, Stats and
  Users card with Main checked, and picks the card; Paste here below the lede in Pricing's Hero pastes the copied
  headline at that slot, from the stand-in clipboard, as "Paste layer here", and Undo takes it out; New screen from the
  menu around the designs makes one at the pointer (PAR-546); and in Interact a right-click reaches the design and no
  menu opens.

Gaps: the end-to-end test covers the right button, opening the menu again, the menubar for a layer inside an instance,
Select layer, Paste here into a layout and Interact. Panning with the right button, Paste here into an absolutely placed
layout, a design and a note pasted at the pointer, and the design's title keeping its own menu were checked in an
isolated copy of the app on the example project on 2026-10-29: each item ran and undid as one step, Paste here landed in
Calendar's absolutely placed Events at the pointer, and a design and a note at the pointer, and the design's title
opened no canvas menu. On 2026-11-04, in `pnpm dev` on the example: a right-click on Dashboard while the menu was open
moved it to the new point, with Select layer's list open too; Stat card's note pasted here between the header's Label
and Value, in the Card header's slot, as "Paste layer here"; and with the Users card's value selected the menubar greyed
Copy, Duplicate, Wrap in layout, the order and Hide or show. A stretched copy pasted at the pointer is covered by the
unit tests alone. Cut and Delete, which the canvas menu doesn't have, stay available in the menubar for a layer inside
an instance.

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
`apps/desktop/e2e/overlays.e2e.ts` (3: no bitmap with the pointer off the board, the window's size and a drawn box with
every design selected, none again after Escape and after moving the camera; the box still drawn while Shift is held down
on the empty canvas beside two selected designs; and the brush drawn while a box is dragged on the empty canvas, with no
bitmap once it's let go). Gaps: hover outlines and snap lines have no automated test. Hover outlines were checked in an
isolated copy of the app on 2026-10-30, by reading the canvas's size over the DevTools protocol: it took the window's
size while a board was hovered, and none once the pointer left. Snap lines haven't been checked; they show only while a
design is dragged, when tldraw's snap overlay util is active, so the canvas has its size then.

## Inserting

How layers, components and icons are found and put into a design.

### The insert picker and the Components panel, fast and in order (PAR-178)

`/` or Shift+I on the canvas opens the insert picker. It opens in 20 to 50ms in development, where it took 390 to 490ms
(770ms the first time) and the audit timed 1.28s by hand. Browsing, it lists the basic layers, then the project's
component designs, its UI kit, the rest of its components and its pages, then each library's designs and components,
each under its source. A search ranks across sources instead, each row saying where it's from.

- **Names before descriptions.** A search matches a name exactly, then at its start, then at the start of a word in it
  (`badge` in AvatarBadge, `dialog trig` in AlertDialogTrigger), then anywhere in it. After those come rows where some
  of the search's words are in the name and the rest in its file, folder or source (`nova badge`), and last rows only
  their file, folder or source match. Within each, the project's own come first. Letters scattered through a name don't
  match, as they did with the old fuzzy match, whose "badge" found AlertDialogTrigger and BreadcrumbPage.
- **Left out until searched for by name:** a library's internal parts (the `.lib.par`'s `internal`, such as
  DialogOverlay and ProgressIndicator) and portals, providers (ThemeProvider, TooltipProvider, Radix's
  `Tooltip.Provider`), and the app's plumbing (App, Router, Routes and error boundaries). A search with a word in the
  name finds them: one naming it in full (`ThemeProvider`, `dialog overlay`) ranks it with the rest, and one that only
  starts it (`dialog`) puts it after every other match. A search matching only their folder never shows them.
- **One component in two places is one row.** Components with the same name from different sources, as the UI kit's
  Badge and Shadcn Nova's, are one row. Browsing, it says "Also in Shadcn Nova"; searching, it shows both sources. Enter
  inserts the project's own; clicking a source inserts that one, and a search naming a source (`nova badge`) puts it
  first. Component designs and basic layers are never merged with components, and two components of one name in one
  source (`(portal)/ErrorPage`, `app/ErrorPage`) stay two rows.
- **The keyboard.** The search field keeps focus. Up and Down move through the rows and go round at the ends, Page Up
  and Page Down move eight, Enter inserts, Escape closes, and Tab does nothing, so focus can't reach the window behind.
  The pointer picks the row it's over. Enter inserts a row's first source; to insert another from the keyboard, name it
  in the search (`nova badge`), which puts it first. The row's text, which a screen reader reads, names every source,
  but the source buttons themselves are for the pointer: no key moves between them. Icons are searched once two letters
  are typed, up to 48 a set, after the components.
- **It takes the keys as it opens, and is gone as it closes** (PAR-554). The search field has focus as the picker
  appears, so Escape or a search typed straight after `/` reaches it, not the canvas. Escape, a click outside or an
  insert takes the picker out of the page at once, with no closing animation, so a click straight after lands on the
  canvas. Base UI moves focus into a dialog a frame after it opens, and keeps a closed one, backdrop and all, until it
  sees the closing animation end, a frame or two after its 100ms. Before this, in a window in the background, where
  frames come about once a second, Escape went to the canvas, which selected the parent and left the picker open, and
  the backdrop took the next click. The list already left the moment the picker closed, so the animation only faded out
  the backdrop and an empty box.
- **The Components panel** searches the same way: in each source, families with the best matches first and the best
  matches first in each, hidden components only when a word of the search is in their name. Browsing, each source lists
  what the picker hides last, under a heading saying what it is ("Providers and app plumbing", "Internal parts and
  providers"), as libraries' internal parts already were.

What made it slow, measured on the example in an isolated copy on 2026-10-30, from the key until the list was laid out:

- **Every row was drawn.** cmdk drew all 610 rows, each with its icons, about 350ms of the 400ms key press. The list now
  draws only the rows in view, with `@tanstack/react-virtual`, so it costs the same for 10 components or 600.
- **The dialog was modal.** A modal Radix dialog locks the page's scrolling and stops the pointer on the body, which
  restyled all of the window's 6,000 elements, about 100ms (it showed as Radix's animation check and the scroll lock's
  `clientWidth`). The picker is a non-modal dialog. Its backdrop, the kit's, takes clicks outside and closes it.
- **The list was rebuilt on every open,** and so were the icon sets, whose names the guest lists in 40 to 50ms. Both are
  kept per project until its components, libraries or component designs change, and built while the window is idle after
  a project opens or its components change, so even the first `/` finds them ready.

Code: ranking, hiding and merging are pure, in `packages/editor/src/insert-search.ts` (`insertRows`, `searchOption`,
`hiddenReason`, `hiddenHeading`). The picker is `apps/desktop/src/renderer/chrome/QuickInsert.tsx`; what it offers comes
from `componentSources` in `chrome/AssetsPanel.tsx`, which also marks hidden components and puts them last in the panel
(`families`, `searchFamilies`). Inserting itself is `packages/editor/src/insert.ts` (PAR-32), with the app's
`canvas/insert.ts` applying it, which this doesn't change.

Tests:

- `packages/editor/src/insert-search.test.ts` (27): what's hidden and why, and the panel's heading for it; splitting
  names into words in any script; each match tier, nothing for a search of only punctuation, the order the picker and
  the panel share, descriptions after names, and the audit's "badge" no longer matching AlertDialogTrigger; the browsing
  order; hidden ones left out, found by name, not by folder, and ranked after the rest when only partly named; Badge
  once with both sources, the project's first; a search naming a source; two components of one name in one source, and a
  design and a component of one name, kept apart; and the audit's searches.
- `apps/desktop/e2e/inserting.e2e.ts` (6), end to end (PAR-202): opening seven times, the fastest under 100ms and the
  median under 150ms (25 to 50ms on a quiet machine); Escape straight after opening closing the picker with the design
  still selected, and a click straight after selecting a layer (PAR-554); the browsing order, read a screen at a time;
  "badge" finding Badge, AvatarBadge and SidebarMenuBadge only, Badge with the UI kit and Shadcn Nova; App and
  ThemeProvider left out of a folder search and found by name, and Dialog's overlay after every dialog part placed; and
  Enter inserting the UI kit's Badge, and the Shadcn Nova source inserting Nova's.
- `chrome/QuickInsert.stories.tsx`: Open, Searching, FoundInTwoPlaces, SearchedByName, SearchingIcons, NoResults and
  NothingToInsertInto.

Gaps: the Components panel's ordering and hidden heading are covered by the shared module's tests and were checked in
the app (searching "badge", "theme" and "dialog"), but have no test of their own. Radix Primitives isn't hidden: nothing
in a library's `.lib.par` says it's unstyled primitives that the project's own components wrap, so it's listed last, as
a library, rather than left out. Previews are PAR-208. The time is measured to the list being laid out, not to the frame
that shows it, since in a window in the background frames come about once a second; the trace showed the key press
taking 31ms and the frame after it 18ms.

### A component's stories and code from its menu (PAR-527)

Right-clicking a component in the Components panel opens its menu: **View in Storybook**, then **View code**, which
opens the component's file in the person's editor at the line of its export. Each is greyed with why when it can't act,
rather than left out, so the menu is the same for every component: View in Storybook says "No stories" for one without
any, and View code "Not in the project" for a library component without type declarations, whose declarations are
otherwise its code. With stories, View in Storybook stays enabled while Storybook isn't running and says "Starts
Storybook": choosing it starts the project's Storybook, reusing one already serving it, and opens the component's docs
or first story once it's up, as the row's book button does. Whether it's running is the service's process list, which
the status bar polls. A project without a Storybook has no View in Storybook. A library's component design offers Insert
linked instance and Insert detached copy after them.

Resting the pointer on a component opens its card beside the row (PAR-515, "Component previews" below), which names it
and its file, or the package a library's comes from, and says when it fails on the canvas and why. One listed by hand
says so.

- **Which editor:** Settings > Code > Editor. The choices are Automatic, VS Code, Cursor, Windsurf, Zed or System
  default. Automatic tries them in that order and opens the first one installed, or the system's default app for the
  file when none is. A named editor that isn't installed says so in a toast, with where to choose another.
- **Finding one:** each editor's command on PATH (`code`, `cursor`, `windsurf`, `zed`), on Windows with PATHEXT's
  extensions, as `code` is `code.cmd`. On macOS and Linux the usual folders are searched too, since an app the Dock
  starts has only the system's PATH. It's started apart from Parity, so it stays open when Parity quits.
- **The line:** the export's declaration, read from the file when it's opened: `export function Button`, or the
  `function Badge` that shadcn's `export { Badge }` names. When neither is in the file, as for one re-exported from
  another, the file opens at its top. A part named through its family, as `Dialog.Root`, opens at the family's export.

Code: `codeEditors`, `editorsFor`, `commandPaths` and `exportLine` in `packages/core/src/code-editors.ts`;
`openInEditor` in `apps/desktop/src/main/code-editor.ts`, behind `canvas:open-in-editor`; `componentFile` and `viewCode`
in `renderer/chrome/code-editor.ts`; the menu's items in `chrome/ComponentMenu.tsx`, used by `chrome/AssetsPanel.tsx`;
the setting in `chrome/SettingsDialog.tsx` and `chrome/preferences.ts`.

Tests: `packages/core/src/code-editors.test.ts` (10: the editors each choice tries; VS Code's and Zed's arguments; the
paths on PATH on Windows and elsewhere; and the export's line for a function, constant or class, one an export list
names, a list over several lines, a longer name that isn't it, a default export, a declared one, a missing one, and
Windows line endings). `apps/desktop/src/renderer/chrome/code-editor.test.ts` (2: the project's own component's file
from a Windows or POSIX root, and a library component's declarations, or none). `chrome/ComponentMenu.stories.tsx`:
WithStories, ChoosingViewCode, StorybookNotRunning, WithoutStories, NoCodeInTheProject and LibraryDesign; and
ComponentMenu, ListedByHand and FailingToDraw in `chrome/ComponentsPanel.stories.tsx`. Gaps: launching the editor and
the system's default app in `main/code-editor.ts` have no test of their own. They were tried in a debug copy: View code
on Button opened VS Code at `button.tsx:43`, its `function Button`, and Badge's menu said "Starts Storybook" with none
running.

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
  and wrapping columns, work the same way turned on their side. A layout that runs backwards goes the way it's drawn: in
  a right-to-left grid or row, or a reversed row or column, "past the middle" is leftwards or upwards, and the slot's
  line stands on the child's right or below it; with lines that wrap upwards (`wrap-reverse`), or a wrapping column in a
  right-to-left page, the lines follow one another up or leftwards, and the end is above or left of the last.
- **Measured from the layout as it was when the drag began.** The dragged layer is hidden and its copy shown somewhere
  else, so what's on screen moves under the pointer. Targets are found in the boxes measured just before the layer is
  hidden: a neighbour that slid into the dragged layer's place isn't under the pointer, and the slots don't move when
  the copy moves. Another frame, or another design, is measured the first time the pointer is over it, before a copy is
  shown in it. Points are mapped back into each frame's first measure, so zooming or panning mid-drag still lands right.
- **A layer stays in the layout it's dragged in while the pointer is over it.** It changes places with its neighbours
  and never drops into one, or into anything inside one, even when the neighbour is a layout, as each of the dashboard's
  revenue bars is. Outside its own layout it goes into the deepest layout under the pointer, as before, in this design
  or another. To put a layer inside its neighbour, drag it there in Layers.
- **Into another design, the copies are what the frame shows** (PAR-464): the state being edited, the variant options
  the board shows, the frame's viewport and the values bound params show, keeping only the bindings the destination has
  params for, as a paste does (see "Copy, paste and paste style").
- **Edge cases.** Children that aren't drawn (hidden in this state) aren't slots; a layer placed after them goes after
  them. A move that leaves the order as it was changes nothing and adds no undo step. An absolutely placed layer doesn't
  reorder; it moves by its insets (below).

Code: the rules are in `@parity-app/editor` (PAR-33), from measures the canvas passes in:
`packages/editor/src/drop-slot.ts` (`slotAt`, geometry only, and `flowOf`, the one reading of a layout's flow that
dropping, dragging and nudging share since PAR-205), `drop-target.ts` (`frameLayout` keeps what was measured, and
`dropTargetAt` finds the layout and slot, and the line marking it) and `move-layers.ts` (`moveLayersWithin` and
`moveLayersAcross`). The app's `apps/desktop/src/renderer/canvas/drop-target.ts` measures (`DragLayouts` reads a frame's
layers' boxes through `frame.ts`'s `nodeBox`, and each layout's flow from its computed style, and `dropInFrame` passes
them in), and `canvas/layer-drag.ts` follows the pointer (`pressLayers` measures when the drag begins; `moveTarget`
finds the frame under the pointer; `DropPreview` shows the copy; `moveLayers` applies the move to the store and the
selection).

Tests:

- `packages/editor/src/drop-slot.test.ts`: the stat cards in both directions and anywhere up or down their row, a card
  short of a neighbour's middle staying put, two-row grids going up and down, the gap between rows, above and below
  every row, a row that moving a card empties, wrapping rows of different widths and centred lines, one-line rows and
  columns, an empty layout; layouts that run backwards: a right-to-left grid with the slot's line on the card's right, a
  reversed row, lines that wrap upwards with the end above them, and a column wrapping right to left; and reading a flow
  from computed styles: a flex box's direction, reversed or not, and its wrapping, `wrap-reverse`, a row and a wrapping
  column right to left, a grid's columns as laid out or as written (`repeat` and line names), and counted from its
  children's places for `repeat(auto-fill, …)` and `subgrid`, or not at all with nothing drawn, a grid flowing by
  columns, and blocks.
- `packages/editor/src/drop-target.test.ts` (13), from boxes: the stat cards dragged right and left; the line where the
  layout was, and the same slot after the camera zooms out and pans; a card that stays in its own slot while the pointer
  is where it was; a card dragged over neighbours that are layouts, or the text in them, changing places with them; a
  layout outside its own taking the drop; from another design, a card that's a layout taking it, and the dragged card
  counting as a slot; children that aren't drawn left out; and nothing found in a layout that wasn't measured or a
  design whose root isn't a layout.
- `packages/editor/src/move-layers.test.ts` (13): within a design, before what was at the index, several together, ids
  and states' changes kept, into a component's slot, and the same design back when dropped where it is, into itself or
  into a layout that isn't there; into another design, copies in order with ids new there, as the state being edited
  shows them, as the shared fixture's card shows them on mobile with its bound title kept only where the destination has
  the param, only the outermost of nested layers, into a slot, and nothing changed when the layers aren't there.
- `apps/desktop/src/renderer/canvas/drop-target.test.ts`, in Chrome, measuring as the canvas does: the stat cards laid
  out as a real grid, dragged right and left; the line where the layout was, also after the camera zooms and pans; a
  card that stays in its own slot though its neighbour slid there, against the same layout measured after the card was
  hidden (which jumps it past the neighbour, as before CAN-47); a card dragged over neighbours that are layouts changing
  places with them; and a layout outside its own still taking the drop.
- `apps/desktop/e2e/moving.e2e.ts` (6), end to end (PAR-202), on the dashboard: Users dragged right past Issues, with
  the card hidden and its copy where it lands, then undone; Issues dragged left past Revenue; the header's Export past
  New project; Feb among the revenue bars nudged a little (no change and nothing to undo) and past March (they swap, and
  March keeps its two children); a drag shorter than the threshold changing nothing; and Escape mid-drag putting
  everything back.

Gaps: the pointer handling in `pressLayers` (the threshold, Escape, the preview), first checked by hand on 2026-10-29,
is now the end-to-end test above. A component dropped from the Components panel lands by the same rule since PAR-205
(see "Inserting, Make component and new designs").

### Moving an absolutely placed layer by dragging (CAN-47)

A layer placed absolutely moves by its insets, live, as the pointer moves (PAR-174): in half steps of the spacing scale,
except along an axis where it snaps (see "Snapping layers while moving and resizing", below). Its outline and size label
follow it. Escape takes the move back, leaving nothing to undo, and a drag that ends where it began adds no undo step.

- **Both sides.** Along each axis it moves by the side it's placed from: the left (or top), unless only the right (or
  bottom) is set. A layer stretched between both sides moves both, so it keeps its size: Calendar's Review slot, placed
  at left 0 and right 0, dragged 24px right is left 6 and right -6.
- **Negative and token insets.** A negative inset is kept, and an inset can go negative. A side set to a length token,
  or left unset, moves from where the frame drew it when the drag began, so it doesn't jump to the parent's edge; once
  moved it's a number of steps, since a token can't be offset. An axis the layer doesn't move along keeps what's
  written, tokens included.

This is the same rule nudging uses, one function for both. Code: `packages/editor/src/move-resize.ts`
(`@parity-app/editor`): `shiftInsets` moves the insets, and `absoluteDrag` follows one drag, taking the layer's style as
the board shows it, where its sides are drawn and what it snaps to, and giving the insets for each pointer move, in half
steps or, where it snapped, to the half pixel. `apps/desktop/src/renderer/canvas/layer-drag.ts` (`followAbsolute`)
measures those, where the sides are drawn with `frameDrawn` (`canvas/nudge.ts`), and writes each move in the drag's
gesture, one undo step (PAR-441), taking them back to the drag's checkpoint (`Drag.revert`, from `canvas/gesture.ts`'s
`followPress`) on Escape or when the layer comes back to where it began.

Tests: `packages/editor/src/move-resize.test.ts`, moving: by the side it's placed from, both sides of a stretched layer
(the Review slot), negative insets kept and going negative, half steps, tokens and unset sides from where they're drawn
(a negative side with a token on the other), and an axis with a token that isn't drawn staying put; and dragging the
Review slot, in half steps where nothing is near, exactly where its bottom locks to Lunch's top, 8.25 steps to a line
off the scale, and by the pointer when it isn't drawn. End to end (PAR-202), `apps/desktop/e2e/moving.e2e.ts` (2) drags
Calendar's Review slot 24px right to left 6 and right -6, and, with left -2 and both right and top set to the `spacing`
token, 16px right with Ctrl held to left 2 and right -3, with top still `spacing` and the width unchanged. Moving live
and Escape are covered under "Snapping layers while moving and resizing".

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
  fixed size until it has been away. Shift keeps the size fixed, and on a corner keeps the proportions. A size along the
  direction of the layout the layer is in takes away `grow`, the older way to fill along it.
- **Absolutely placed layers** keep the opposite edge where it was. The left or top handle moves that inset with the
  edge, so the right or bottom stays put; a layer stretched between both sides changes the dragged side's inset alone,
  keeping both sides; a layer placed from the right or bottom alone moves that inset when its right or bottom handle is
  dragged. Negative and token insets follow the moving rules above, and a side that doesn't move keeps its token. They
  never fill. Their dragged edges snap (PAR-174, "Snapping layers while moving and resizing", below), unless Shift keeps
  a corner's proportions.
- **A frame** takes a width and a height in whole pixels for its viewport, at least 160 by 80. Within 6 screen pixels of
  its viewport's width the width is left unset, so it follows the viewport again; a frame that hugged its content when
  the drag began goes back to hugging it the same way, and one with a height of its own keeps one.
- **A double-click** on a handle goes back to the default size on its axes: a layer's size is taken away, and a frame
  goes back to its viewport's width or its content's height.
- **The hint** ("Drag to resize") closes when a handle is pressed and stays closed through the drag and after it, until
  the pointer next rests on a handle.
- **Small layers keep their middle** (PAR-193). Along an axis where a layer is under 24 screen pixels, its handles sit
  just outside it: the corners and the top and bottom strips above and below a layer that's short, the corners and the
  side strips beside one that's narrow, with the strips running its whole length. So a press anywhere on a layer small
  both ways drags it; one small along only one axis keeps its other axis's strips on it. New project at 50% is 16px
  high: its corners, top and bottom sit above and below it, and only its left and right strips, 4px into each end as on
  any wide layer, are on it. A layer 24px or more keeps its handles on its edges.
- **Escape takes a resize back** (PAR-193), a layer's or a frame's: everything the drag wrote is undone without leaving
  a step to undo or clearing what Redo had, the layer stays selected, and the release that follows does nothing. Escape
  goes to the resize alone, not to the canvas, where it would select the parent. Only the resized design goes back:
  another file an agent changed during the drag, or another design in the same file, keeps its change and its undo step.
  Such a change clears Redo, as any new step does, so Redo comes back only when nothing else changed during the drag.
- **The cursor** shows the handle's arrows wherever the pointer goes during the drag, over the canvas, the frames and
  the panels, until it ends (see "Cursors and Escape during a gesture", below).
- **It starts from what the frame shows** (PAR-464): the layer's style and its layout's direction with the state being
  edited, the variant options the board shows and the frame's viewport, so a layer a variant or a mobile patch places
  absolutely resizes by its insets there, and a row the board shows is a row. The edit still lands where every edit does
  (see "Edits in the state and variant shown").

Code: the rules are `packages/editor/src/move-resize.ts` (`@parity-app/editor`). `resizeStart` reads the layer and its
layout as the board shows them. `layerResize` follows one drag of a layer's handle and gives the style for each pointer
move: `resizeGesture` gives steps or fill, or the insets `resizeInsets` moves for an absolutely placed layer, and
`layerResize` adds the snapped edges and takes `grow` away. `frameResize` follows a frame's, with its snap-back and
smallest size, `layerSizeReset` and `frameSizeReset` are a double-click's, and `edgeAxes` says which sizes a handle
changes. `packages/editor/src/handles.ts` (`handleBoxes`) says where each handle goes. In the app,
`canvas/ResizeHandles.tsx` draws the handles and their hint, which `chrome/Hint.tsx` lets a caller open and close, and
`canvas/CanvasOverlay.tsx`'s `startResize` measures the layer, its parent's inside and, for an absolutely placed layer,
its drawn insets and what it snaps to, or the frame's box, and writes what comes back. `canvas/gesture.ts`'s
`followPress` follows the pointer in one gesture, holds the cursor, and on Escape reverts the store to a checkpoint
taken when the drag began, with `DesignStore.checkpoint` and `revert` in `design-store.ts` (see "Cursors and Escape
during a gesture").

Tests:

- `packages/editor/src/move-resize.test.ts`: which sizes each of the eight handles changes; the right handle changing
  only the width however the pointer drifts; a side's handle dragged along its side changing nothing; the four-pixel
  start; an edge that starts on the inside of its parent not filling at once, then filling when it comes back, and Shift
  keeping it fixed; an edge reaching the inside filling; a corner with Shift; and an absolutely placed layer resized
  from the top and the left, stretched or not, keeping a negative inset and a token it doesn't move, and never filling.
  Resizing by insets: each anchoring (near side, far side, both, both with a size of its own), negative and token
  insets, and a token kept when its side doesn't move. From what the board shows and what was measured: `grow` taken
  away along the layout's direction and kept across it, nothing before the drag starts, and a double-click's reset. A
  frame, from its box at half size: a width in whole pixels, back to its viewport's width within 6 screen pixels, back
  to hugging its content, a height of its own kept, both from the corner, and 160 by 80 at least; a double-click's
  reset, and no entry kept for a viewport that takes its own size. With the shared fixture's card (PAR-464),
  `resizeStart` reads its layout as the row its Inline option makes it, and the layer's style in a viewport and state,
  the Compact state's gap over the mobile patch.
- `canvas/ResizeHandles.test.ts`, in Chrome: the hint opens on hover, closes on press and stays closed through a drag
  into the hint itself and after release (this fails as the handles were before), opens again on the next hover, and a
  double-click still resets.
- `packages/editor/src/handles.test.ts`: handles straddling a large layer's edges with the strips short of the corners;
  a layer under 24px both ways with no handle on it; one small only in height, with only its side strips on it; a layer
  of exactly 24px as before; a layer that draws nothing; and a frame's three handles in order.
- `apps/desktop/src/renderer/design-store.test.ts`, reverting to a checkpoint: a gesture's writes more than a second
  apart taken back with nothing left to undo for them; Redo kept; an earlier gesture's step left as it was; another file
  reloaded mid-gesture kept, with its undo step undoing to the design as it was; another design added to the same file
  mid-gesture kept, with its undo step; every step before the gesture kept when its first write pushed the oldest out at
  the undo limit; and nothing changed since.
- `apps/desktop/e2e/moving.e2e.ts` (6), end to end (PAR-202): New project's right handle, named by its hint when the
  pointer rests on it, dragged 48px right changes the width alone, in steps, with no hint during the drag or after; its
  top handle dragged sideways changes nothing and adds no undo step; the Review slot's top handle dragged up 16px gives
  top 36 and height 20 with the bottom edge where it was, and its left handle dragged right gives left 3 with right
  still 0; New project's right handle dragged in two moves, then Escape, leaves no style, nothing to undo, the width as
  it was and the button selected; and at 50%, New project's handles leave it but for its two end strips, and a press 3px
  inside its top edge moves it past Export. The last two failed before PAR-193. A seventh drags New project's right
  handle 24px, pauses a second and a half, drags on to 48px, and takes it all back with one undo (PAR-441).

Gaps: a frame's handles (a design's width and height) are tested from boxes but not end to end, Escape on them included,
which goes through the same `followPress`. A resize writes as the pointer moves, all of it one undo step however long it
pauses (PAR-441, see "One undo step per gesture"). Checked in the app on 2026-10-30, in a copy on its own ports: the
handles above and below New project at 50%, the arrows over the design 90px below the handle, and Escape leaving the
button as it was.

### Empty layouts (PAR-193)

A layout with nothing in it, which would draw nothing, takes at least 24px of the design along each axis its content
would size, outlined in dashes, so it can be seen, selected with a click and dropped into. This is on the canvas only.

- **A length the design gives it stays.** Along an axis with a fixed width or height, or a least size, it keeps what the
  design says, so an empty layout used as an 8px spacer is still 8px across; only the other axis gets the 24px. On an
  instance whose component's root is an empty layout, the instance's own width or height counts too. Filling and growing
  aren't lengths: in a grid, or with no space to share, they leave an empty layout at nothing, so it gets the 24px, and
  where they give it more, it keeps that. In a row, an empty column that's stretched keeps its stretched height.
- **It's empty when nothing is drawn in it** in the state and viewport shown, so a layout whose children the state hides
  counts too. The size and the dashes go once something is put in it; while a drag shows a copy of a layer in it, they
  stay.

Code: core's `emptyLayoutAttribute` in `packages/core/src/render.ts` marks an empty layout's element with the axes its
content would size (`data-canvas-empty-layout="width height"`), and the frame's root sheet in
`apps/desktop/src/renderer/frame.ts` gives it its least size (`emptyLayoutSize`) and dashes. The least size is
`!important`, to beat the `min-width: 0` every layout is drawn with. The sheet finds empty layouts by that attribute,
not by `:empty`: with `:empty` in it, a sheet every frame shares, closing a project with the pointer in the window kept
its frames in memory, about 1,800 DOM nodes each time on the example. `reopening.e2e.ts` caught it when the tests before
it left the pointer on the canvas.

Tests: `packages/core/src/render.test.ts`: which axes are marked for a layout that hugs, a fixed width, a least height,
growing in a row, and filling with a fixed height; a layout with layers unmarked; and one whose only layer the state
hides marked. End to end (PAR-202), `apps/desktop/e2e/moving.e2e.ts` (2), with an empty row added after New project:
it's 24px wide and at least 24px high and is selected by a click, and a stat card dropped 6px inside its left edge at
50% goes into it. Both failed before PAR-193: the row was 0px wide.

Gaps: the size label and the inspector show the 24px the canvas gives it, not the 0 the app would draw.
`reopening.e2e.ts` sees a leak like the one above only when the pointer is in the window, which depends on the tests run
before it; moving the pointer in after each close would make it certain.

### Cursors and Escape during a gesture (PAR-193)

While layers are dragged, a design is dragged by its title or a handle resizes, the cursor shows what's happening
wherever the pointer goes: grabbing for a drag, the handle's arrows for a resize. With the text tool, the canvas shows
the text cursor. Escape cancels each of these drags.

- **One lifecycle for every drag** (PAR-568). A resize, layers dragged in a layout, an absolutely placed layer dragged,
  designs dragged by a title and a box drawn on a frame's background all follow a press the same way. It becomes a drag
  once the pointer has gone 4 screen pixels, and only then begins its undo step, takes its checkpoint and holds its
  cursor, so a click begins none of them. The release keeps what the drag did. Escape, the pointer being cancelled and
  the window losing focus each do what the gesture's policy says:

  | Gesture                       | Escape                  | Pointer cancelled or window loses focus |
  | ----------------------------- | ----------------------- | --------------------------------------- |
  | Resize                        | takes it all back       | keeps it                                |
  | Layers dragged in a layout    | calls it off            | calls it off                            |
  | An absolutely placed layer    | takes it back           | takes it back                           |
  | Designs dragged by a title    | puts them back          | saves them where they are               |
  | A box on a frame's background | puts the selection back | puts the selection back                 |

  Taking back reverts the design to the checkpoint from when the drag began, leaving nothing to undo. A drag that's
  called off has written nothing, since it writes only when it's kept, and puts back what it showed: the drop preview,
  the designs on the canvas, the selection. Before PAR-568, a title drag and a box ended through listeners of their own
  and didn't hear the window losing focus (PAR-583). A title drag cut short that way never ended: the design stayed
  where it was dragged, unsaved, and the grabbing cursor covered the whole window even after the next click, since the
  title had lost the pointer and its listeners heard nothing more. A box went on selecting as the pointer moved with no
  button pressed, until the next click kept what it touched last.

- **Why it needed a layer of its own.** The cursor used to be set on the page's body, which showed only where nothing
  else set one: over the canvas tldraw sets its own cursor on everything it draws, and a title sets `default`. Now a
  transparent layer over the whole window holds the cursor for as long as the gesture lasts. The gestures follow the
  pointer through window listeners and find what's under it by layout boxes, so the layer takes nothing from them, and
  nothing under it reacts to hovering meanwhile.
- **The text tool** gives tldraw's canvas the browser's text cursor, by a rule more specific than tldraw's own, which
  takes the cursor of tldraw's tool, always Select or Hand here.
- **Escape on a design dragged by its title** puts every dragged design back where it was, saves nothing and adds no
  undo step, and leaves the design selected.

Code: `apps/desktop/src/renderer/canvas/gesture.ts`: `followPress` follows a press, `gestures` holds each gesture's
policy, `dragThreshold` (from `@parity-app/editor`'s `move-resize.ts`) is the 4 pixels, `holdCursor` the layer, and
`onGestureEnd` hears how a gesture ends, as the right-click menu does too. The gestures are `canvas/CanvasOverlay.tsx`
(`startResize`), `canvas/layer-drag.ts` (`pressLayers` and `followAbsolute`), `canvas/ContainerShapeUtil.tsx`
(`dragByTitle`, which gives the title the cursor too, since it has the pointer captured) and `canvas/select-box.ts`
(`pressBackground`). The text tool's rule is in `apps/desktop/src/renderer/styles.css`.

Tests:

- `canvas/gesture.test.ts`, without Electron, driving `followPress` with a plain `EventTarget` for the window and a
  `DesignStore`: a press released short of 4 pixels is a click, with no undo step begun and no cursor held; the undo
  step, checkpoint and cursor begin once, as the press becomes a drag, and at the release the cursor goes, the step ends
  and nothing is left listening; Escape before the drag only ends it; a drag takes back what it wrote mid-drag and goes
  on in the same step; and Escape after a drag that wrote nothing leaves the file alone. For each of the five gestures,
  writing as the app's does (as the pointer moves, or once when kept): Escape leaves nothing to undo and the file clean;
  the window losing focus ends it as the table says, what it keeps being one undo step; and the release keeps it as one
  step. Also `onGestureEnd` (4): a gesture ending once, at the release, a cancelled pointer, the window losing focus or
  Escape, with nothing left listening after; Escape kept from going further, other keys let by; giving up without
  ending; and one gesture's end left to it when another follows.
- `canvas/CanvasOverlay.test.ts`, in Chrome, with the real mouse and the box's own code (`pressBackground`): a box from
  a frame's background puts the selection back when the window loses focus mid-box, and the pointer moving on over the
  cards and letting go selects nothing more (PAR-583). Against the box's listeners from before PAR-568 it fails, and the
  listeners left behind spoil the hover test after it.
- End to end (PAR-202), `apps/desktop/e2e/moving.e2e.ts` (5), reading the cursor of the element the browser finds under
  the pointer: grabbing while a stat card is dragged; grabbing while Dashboard is dragged by its title, on the title and
  200px off it; the arrows 80px below New project's right handle mid-resize, and not after; the text cursor over the
  stat cards with the text tool; and Dashboard's title dragged 160px, then Escape, leaving its board and its position as
  they were with nothing to undo. Each failed before PAR-193.

Gaps: what the system draws can't be read through the DevTools protocol, so the tests read the cursor the page asks for
at the pointer. Whether Chrome takes a captured title's cursor or the layer's doesn't matter, since both are grabbing.
The window losing focus is tested on the lifecycle, and for a box in Chrome with the window's `blur` sent by script, but
not end to end: Playwright tells the page it drives that it has the focus whatever the window does, so a real focus loss
never reaches it. A title drag's own part, saving the designs where they are, is checked only in the app. Checked in the
app on 2026-11-05 (PAR-583), on a copy of the example project, with the pointer sent over the DevTools protocol,
Playwright's focus emulation turned off, and the window minimized through Win32 mid-drag, which blurred the page. Before
PAR-568, Sign in dragged by its title and a box from its background both went on, as above. On main, the title drag
saved Sign in where it was as one undo step (Move screen) and let the cursor go, the box put the selection back, and
neither followed the pointer when it came back with no button pressed. The focus loss also took the title's pointer
capture (`lostpointercapture`) and sent no `pointercancel`, for a press sent over the protocol; a press of the system's
own mouse wasn't tried. That's why the old title drag, listening on the title, heard nothing more; `followPress` listens
on the window. Also checked on 2026-11-05 in Storybook's app window, with the pointer, Escape and the window's blur sent
by script: each of the five drags ended by Escape, by blur and by a release, as the table says, and a title drag with
the real pointer. Dragging a board by its background is tldraw's, with tldraw's own cursor, and Escape there is tldraw's
too.

### Snapping a dragged design (PAR-33)

A design dragged on the canvas locks to the designs and notes around it, as decisions.md describes: along each axis, the
nearest of its left, centre and right (or top, middle and bottom) to any of theirs, within 8 screen pixels at the
current zoom. Of lines just as near, the first design's wins. A line shows where it locks, spanning both. Ctrl (Cmd on a
Mac) moves freely, and so does turning snapping off under View; designs dragged together don't snap to each other.

Code: `snapBox` in `packages/editor/src/snap.ts` takes the boxes and the zoom and returns where the design goes and the
guides to draw, and `snaps` says whether a drag snaps, from the preference and Ctrl, for designs and layers alike;
`apps/desktop/src/renderer/canvas/snap.ts` (`snapPosition`) reads the shapes' boxes from tldraw and draws the guides as
tldraw's snap indicators, and `canvas/ContainerShapeUtil.tsx` calls it while a design is dragged.

Tests: `packages/editor/src/snap.test.ts` (9): a left locking within 8 pixels and not past them, the distance counted on
screen at half and double zoom, centres and ends lining up, each axis on its own, the nearest line though a farther one
comes first, the first design's of lines just as near, the guides, and nothing around. Ctrl is tested with layers'
snapping, below.

Gaps: the pointer handling and the preference aren't tested; `apps/desktop/e2e/selecting.e2e.ts` drags a design with
snapping on, but doesn't check where it locks.

### Snapping layers while moving and resizing (PAR-174)

An absolutely placed layer dragged inside its design locks to its siblings and its parent, the way a dragged design
locks to the designs around it, with the same 8 screen pixels, the same red guides, and Ctrl (Cmd on a Mac) or View's
snapping preference to move freely.

- **Edges and centres.** Along each axis, the nearest of its left, centre and right (or top, middle and bottom) to any
  of its siblings' or its parent's, within 8 screen pixels at the current zoom. Of lines just as near, a sibling's wins
  over the parent's, and the first sibling's over the next. The parent is the box its insets count from, inside its
  border: its containing block. That's the parent layout itself, since layouts are always positioned; only in a
  component's slot can it be another, the component's own box when it transforms or contains its content, or a box
  further up when nothing in the component is positioned. Either way a side snapped to that box's edge has an inset of
  0, and the distances shown are the insets written.
- **Even spacing.** Along each axis, it also takes the place that spaces it evenly with the siblings beside it across
  that axis, as in a row or a column: in the middle between two, or the same gap after or before a run of them that's
  already evenly spaced, so three or more are evenly spaced. Of an edge and an even space, the nearer wins; when both
  come to the same place, both show.
- **What shows.** A red guide along each line it locked to, spanning it and what it locked to; spacing marks in every
  gap of the evenly spaced run; and the distances to what it lined up with, drawn as Alt's redlines are, with the
  spacing step they come to: the gap to a sibling, or its four insets in its parent. They go when the drag ends, whether
  it's released, called off with Escape, or cut short by the pointer being cancelled or the window losing focus, and
  while Ctrl is held. Nothing is left listening after a gesture ends.
- **Exact where it locks.** Along an axis it locked along, it goes exactly there, to the half pixel, in fractions of a
  step where the line isn't on the scale; along an axis that didn't lock it moves in half steps as before.
- **Resizing.** Only the edges a handle drags lock, to the same lines; even spacing doesn't count, and the size goes to
  the half pixel rather than to whole steps. Shift on a corner keeps the proportions instead of snapping. Layers in a
  layout keep sizing in whole steps or filling, and don't snap.

On the Calendar's day, the Review slot sits 8 steps below the Planning slot and 8 above Lunch: dragged 6px down at 100%,
it stays, with marks in its gaps and Lunch's gap to the Usability slot, a guide down their left edges and 32px,
spacing-8 to Planning. Dragged 36px down, its bottom locks to Lunch's top at top 48, where it would be 49 with Ctrl.

Code: `snapLayer` in `packages/editor/src/snap.ts` (`@parity-app/editor`) takes the layer's box, its siblings' and its
parent's, the zoom and, for a resize, the edges the handle drags (`resizeEdges`, `resizedBox`), and returns where it
goes, the axes it locked, the guides, the distances (`distancesBetween`, which Alt's redlines use too) and the spacing
marks; `lockedEdgeMoves` says how far a resize's locked edges moved. `packages/editor/src/move-resize.ts` snaps with
them: `absoluteDrag` moves the layer exactly where it locked, and `layerResize` passes a resize's locked edges to
`resizeGesture`, which `resizeInsets` takes exactly; both give back where it locked.
`apps/desktop/src/renderer/canvas/layer-snap.ts` (`LayerSnapping`) measures the boxes in the frame when the gesture
begins, the parent's as the layer's `offsetParent`, which is its containing block, and shows where the layer locked, the
guides and marks as tldraw's snap indicators, keeping the distances for `canvas/CanvasOverlay.tsx` to draw; the gesture
clears them when it ends. `canvas/layer-drag.ts` (`followAbsolute`) and `CanvasOverlay.tsx`'s `startResize` pass it in
and show what comes back. Both gestures end through `canvas/gesture.ts` (`followPress`), which tells them whichever way
they end.

Tests:

- `packages/editor/src/snap.test.ts` (14 more): a left locking to a sibling's within 8 pixels, with its guide and the
  gap between them; a centre locking to the parent's, with the four insets; the distance counted on screen at half and
  double zoom; nothing near; a resize locking only the dragged edge, left or right, and how far it moved; an axis the
  handle doesn't drag left alone; the edges each handle drags; the same gap after a run and before one, in the middle
  between two, with the marks; a nearer line winning over even spacing, and both showing when they agree; spacing
  needing three beside each other; distances apart and inside; and Ctrl or Cmd, or snapping turned off, moving freely.
- `packages/editor/src/move-resize.test.ts`: a snapped edge taken exactly, to the half pixel, and an axis that didn't
  snap in steps; sizes and insets to the half pixel with `exact`; the Review slot's bottom handle locking to Lunch's top
  through `layerResize`, in steps with Ctrl, and Shift on a corner not snapping; and a drag going exactly where it
  locks.
- `canvas/layer-snap.test.ts` (3), in Chrome, in a frame at half size, snapped with `snapLayer` from what it measured: a
  layer snapping to the inside of its parent's border, in the frame's own pixels; a badge in a transformed component's
  slot snapping to the component's box; and one in a slot of a component that isn't positioned snapping to the root its
  insets count from, not to the component's edge.
- `canvas/gesture.test.ts`: how a gesture ends, under "Cursors and Escape during a gesture", above.
- `apps/desktop/e2e/moving.e2e.ts` (5), end to end, on the Review slot at 100%: dragged 6px down it stays, with spacing
  marks over three gaps, a guide and the 32px distance during the drag, and nothing to undo or shown after; dragged 36px
  down it's at top 48 during the drag and after, and Undo puts it back; with Ctrl it's at 49, with nothing shown; Escape
  mid-drag puts it back with nothing to undo; and its bottom handle dragged 26px makes it 24 steps high.

Gaps: the spacing marks and guides are read from tldraw's snap indicators, not from what's drawn. Checked in the app on
2026-11-04, in a copy on its own ports: the guide, marks and distance on the Review slot, its bottom locked to Lunch's
top, Ctrl, Escape and the bottom handle.

### Duplicating a design (CAN-47)

Duplicate (Ctrl+D) on a selected design puts the copy to the right of the original, top-aligned with it, at the first
place along that row where it keeps 160px clear of every design and note on the canvas, so it never covers the next
design and their titles don't meet. Several selected designs move as one block, and pasting designs into the project
they were copied from places them the same way.

- **A copy that lands off screen comes into view** (PAR-204). After Ctrl+D, Duplicate in the Layers menu, or a paste of
  designs, the canvas pans, at the zoom it's at, so the selected copy is seen 64px clear of the canvas's edges, room for
  its title. It moves the least it can along each axis, so what was in view stays as near as it can. A copy wider or
  taller than the view only needs its start in view, where its title is; otherwise its start comes to the view's start.
  A copy already in view leaves the view where it was. The pan takes 250ms.
- **At the size it's drawn at.** A copy beside its original is the original's size. A design pasted from another
  project, or whose original is no longer on the canvas, goes in the middle of the view, and its size is only known once
  its board draws it, so it's brought into view then, from its board's real size rather than a guess. One that isn't
  drawn within 2 seconds, as in a tab that isn't showing, leaves the view alone.

Code: `freeSpotBeside`, `pastedPlacement` and `panToShow` in `packages/editor/src/placement.ts` (`@parity-app/editor`),
with `takenBounds`, `bringIntoView` and `bringIntoViewOnceSized` in `apps/desktop/src/renderer/canvas/free-space.ts`,
which read the canvas's shapes and move its camera, used by `chrome/designs.ts` (`duplicateDesign`) and
`canvas/clipboard.ts` (`pasteDesigns`). A board says when it has its size (`setBoardSized`, from
`canvas/ContainerShapeUtil.tsx`'s resize observer).

Tests: `packages/editor/src/placement.test.ts`: the original alone, the example's Dashboard with Projects 176px to its
right, a run of designs and gaps too narrow for the copy, a gap wide enough, designs well above or below the row, and
one just inside the gap below it; pasted copies (`pastedPlacement`) beside originals on the canvas at their size, and
copies from another project, or with an original gone, in the middle of the view with no size guessed; and bringing a
copy into view (`panToShow`): none needed when it's in view, right just far enough, left, up and down, a copy wider than
the view brought to its start, a taller one left alone while its top shows, and no margin unless asked. End to end
(PAR-202), `apps/desktop/e2e/moving.e2e.ts` (4): Ctrl+D on Dashboard puts the copy selected, top-aligned with it to its
right, with no design or note within 160px, and Undo takes it away; Ctrl+D on Dashboard at 50%, whose copy starts off
screen, pans to it at the same zoom; Ctrl+C and Ctrl+V of it do the same; and Ctrl+D on Forgot password at 5%, whose
copy lands in view, leaves the view where it was.

Gaps: bringing a design pasted from another project into view once its board is sized has no automated test; it was
checked by reading. A copy pasted over the selection (Ctrl+Shift+V) or at the pointer doesn't pan, since it goes where
the person is looking.

### Arranging layers and designs (PAR-7)

Delete, Duplicate (Ctrl+D), Select all (Ctrl+A), Wrap in layout, Unwrap, the four orders, Hide, Align and Distribute act
on the whole selection as one undo step, labelled with how many things they touched.

- **They act on the outermost selected layers.** A layer inside another selected one moves with it, and selecting the
  design's root leaves nothing to arrange.
- **Delete selects the layout that held the last deleted layer,** or the design when that was its root.
- **Duplicate puts each copy just after its original,** in its layout or slot, with fresh ids for it and everything in
  it, and selects the copies.
- **Select all picks the selected layer's siblings** in its layout or slot, or every design when no layer is selected.
- **Wrap in layout lays the new layout out as the parent lays out the layers** as the frame shows it: in the state being
  edited, with the variant options the board shows and the frame's viewport (PAR-464). A row in a row, with the parent's
  gap. Layers in different layouts can't be wrapped together, and a message says so.
- **Unwrap leaves a layout's layers where it was** and selects them; on anything but a layout it says to select one.
- **Ordering moves a layer among its siblings.** Later paints in front, as in CSS, so Bring forward moves it later in
  its layout and down the Layers list. An order that wouldn't move it records nothing.
- **Align on layers works in their layouts,** as the frame shows them: in the state being edited, with the variant
  options the board shows and the frame's viewport (PAR-464). A layer aligns by itself on its layout's cross axis
  (`self`), and along the main axis the layout moves all its children (`justify`). So in a layout a variant turns into a
  row, Align right sets `justify: end` on the layout, in that variant, rather than `self` on the layer. Layers in a
  component's slot stay as they are.
- **Align on designs lines them up on the canvas** by their edges or centers, within the span of them all, and needs
  two. **Distribute spaces three or more evenly** between the outermost two, across or down. Positions are rounded to
  whole pixels, and a move that changes nothing records nothing.

Code: the rules are in `packages/editor/src/arrange.ts` (`@parity-app/editor`).
`apps/desktop/src/renderer/chrome/arrange.ts` applies them to the selection and the store, measures designs' boxes on
the canvas and shows the messages. Hide is core's `toggleHidden`.

Tests: `packages/editor/src/arrange.test.ts`: the outermost layers and the root; deleting and what's selected next (in a
layout, the root and a slot); duplicating in place with fresh ids (in a layout, a slot, a copied layout's children, and
nothing to copy); deleting designs from their own documents; siblings in a layout and a slot; wrapping in a row, a
column and another state, with the shared fixture's card in its Inline option and in a viewport, and layers that can't
be wrapped; unwrapping, and layers that aren't layouts; each order in a layout and a slot, and orders that wouldn't
move; aligning on the cross and main axes in two states, in a row a variant makes and a column a viewport shows, and in
a slot; aligning designs by edges and centers, with a box offset from its position; distributing across and down
whatever the selection's order; and moving designs in whole pixels.

Gaps: the commands, menus and messages have no automated test. They didn't change when the rules moved into the package.

### Inserting, Make component and new designs (PAR-32)

Components, component designs and images go in from the Assets panel and Quick insert; Make component turns layers into
a component design; the Layers panel's add buttons start new designs. Each is one undo step, and selects what it made.

- **A drop lands in the slot under the pointer** (PAR-205), in the deepest of the design's own layouts there, or of its
  components' slots that hold layers (PAR-419), as a dropped image file and Paste here land (`measureHere`, `slotHere`,
  through `slotAt`): in a grid or a wrapping row the line of children the pointer is on comes first, then the slot along
  it, so a card dropped on the second row of Projects' grid goes there, not in the first row. In a layout that's
  absolutely placed as the board shows it, it goes last, placed at the pointer in half steps of the spacing scale. While
  dragging, the layout is outlined and a line shows the slot, or a corner marks the pointer where it goes in an
  absolutely placed layout. A drop on the empty canvas makes a screen there (PAR-546, below); one over a design where
  there's no layout says so.
- **A click inserts at the selection:** into a selected layout, at its end; just after any other selected layer, in its
  layout or slot; or at the end of a selected design's root. With nothing selected it makes a screen in the middle of
  the view (PAR-546); with a design selected that has nowhere for it, a message says to select a layout.
- **What goes in is ready to show something.** A component gets its required props (an option's first value, `false`,
  `0` or its own name, unless they have a default) and its name as text when it takes children. A library's part comes
  inside the parents it needs that aren't around the layout already, with their samples.
- **A name goes in only where it fits (PAR-518).** A component whose own element sets its size gets no name, since
  "Avatar" in a 32px circle showed as "Avata": the props reader marks it `fixedSize` when the classes on the outermost
  element it returns give it a width (`size-8`, `w-10`), a height under a line (`h-px`) or `@container`, in a project's
  code or a library's compiled JavaScript. A library's part takes what its library's samples give it instead of its
  name: its own sample's children or text, or none when the sample gives none, as for a Separator, a Checkbox or
  AttachmentAction, an icon button. A part without a sample of its own takes the children the first of the library's
  other samples to use it gives it, so MarkerIcon and AttachmentMedia, whose icons Marker's and Attachment's samples
  can't show, hold nothing. A part no sample shows keeps its name. A component design goes in as a linked instance or,
  from a library's menu, a detached copy. An image is 80 spacing steps (320px) wide, its height following its shape.
- **The undo step says what was added:** "Add Button" (the component's name without its library), "Add component", "Add
  copy" or "Add image".
- **Make component** puts the component design at the end of the project file, 640px above the topmost design on the
  canvas, lined up with the design it came from, so components sit above screens. An instance replaces each occurrence,
  and the step is "Extract" and its name. It's refused, changing nothing, unless the design renders the same in every
  state, viewport and variant option, as its board shows each, with the defaults of the params the design binds
  (PAR-486). Every option of every variant is checked, not only the one the board shows (PAR-493), each with the other
  variants as the board shows them, and the message names the option: "Extracting would change how Team looks (Default,
  desktop, Compact), so it wasn't done". So a variant option that changes something inside the part, shown or not, or a
  param default a layer in it shows, refuses it rather than losing the change. A component design's Params section lists
  its instances, across every design.
- **A new design goes 240px to the right of everything on the canvas,** top-aligned with the topmost design. A screen
  starts as a padded page with its name as a heading, a component as a small padded layout on a 480px frame.

Code: the rules are in `packages/editor/src/insert.ts`, `components.ts`, `create.ts` and `placement.ts`
(`@parity-app/editor`), with the new layer's props and label in `componentNode` and a library part's parents and samples
in `withLibraryContext`, both in `packages/core/src/library-insert.ts`, and `fixedSize` read by `setsOwnSize` in
`packages/code/src/props.ts`. The app's `canvas/insert.ts` measures the layout under the pointer and applies an insert
to the selection and the store, `chrome/components.ts` measures the designs and applies Make component, and
`chrome/create.ts` adds a new design and zooms to it.

Tests: `packages/editor/src/insert.test.ts`: the layer for a component (required props, given props, a library's name),
an instance and an image (its size, alt text and credit, and a tiny one); the labels; inserting between children, at the
end, in a slot, at the pointer in an absolutely placed layout, inside a library part's parents or among them already,
and a detached copy; and where a click inserts (a layout, after a layer, in a slot, the root, and nowhere). Where a drop
lands is `slotHere`'s, in `packages/editor/src/paste-here.test.ts`: the slot and its line in a row, a grid's second row
where one line along every child would pick the first, and the pointer's place in an absolutely placed layout.
`components.test.ts`: making a component into the project file, a taken id and param names, a project file that doesn't
exist yet, and the errors; and instances in layouts and slots across designs. `create.test.ts`: a new screen and
component, and a taken id. `placement.test.ts`: a new design beside everything, one the canvas hasn't drawn, an empty
canvas, and a component above everything. A library part's parents and samples are core's, in
`packages/core/src/library-insert.test.ts`. The extraction and its check are core's `extractComponent`, in
`packages/core/src/decompose.test.ts`: occurrences become instances that render the same, a state changing the part
refused, a single part's texts as params, and the check against the board, refused under a variant option that changes
the part, whether the board shows it or not (PAR-493), but not one that changes what's outside it; each option of two
variant params checked in turn, refused for one the board doesn't show; and refused when a layer in the part shows a
param's default. `packages/core/src/library-insert.test.ts`, with three for names that fit (PAR-518): none for a
component that sets its own size, unless given; none for a part whose sample gives no children; and a part without a
sample taking the children its library's other samples give it (none for an icon's box or one used without any, their
text), else its name. `packages/code/src/props.test.ts` has two for `fixedSize`: the example's Avatar, AvatarGroupCount,
CardHeader and Separator but not Card, Badge or Button, and a library's compiled parts, leaving out classes for what's
inside or taken from a parent. The extraction and its check are core's `extractComponent`, in
`packages/core/src/decompose.test.ts`: occurrences become instances that render the same, a state changing the part
refused, a single part's texts as params, and the check against the board, refused under a variant option that changes
the part but not one that changes what's outside it or isn't shown, and refused when a layer in the part shows a param's
default.

End to end, `apps/desktop/e2e/dropping.e2e.ts` drags Badge from the Components panel onto the left of the fifth card in
Projects' grid: the grid is outlined and the line stands beside that card while dragging, Badge lands fifth, selected,
as "Add Badge", and Undo takes it out. It also drops Badge into the Calendar's Events layout, which is absolutely
placed, above the Planning slot: Events is outlined with a corner at the pointer and no line while dragging, and Badge
lands last, placed absolutely 10 steps from Events' left and 6 from its top, and Undo takes it out. And it drops Badge
on the empty canvas, which makes a screen called Badge there (PAR-546, below).

Gaps: clicking in the panels, the messages, and a drop into an absolutely placed layout have no end-to-end test.

### New screen, New component and the empty canvas (PAR-546)

Making a screen or component is one visible step, as PAR-541's approved designs show, without the start in the middle of
an empty canvas that PAR-560 dropped: New screen and New component are everywhere a command is, and whatever lands on
empty space on the canvas makes a screen there.

- **New screen (Ctrl+Alt+N) and New component (Ctrl+Alt+Shift+N)** are in the keymap's Object group, so the Keyboard
  shortcuts dialog lists them and their keys work on the canvas, not in a text field. They lead File, above opening a
  project, and Object, above Insert…, each with its keys. Each makes an empty screen or component right of everything,
  selects it and zooms to it, as Layers' + always has.
- **Search actions finds them by the start of words.** Each typed word must start a word of an action's name or group,
  in any order, and a name that starts with everything typed comes first, so "new" lists New screen and New component
  and nothing with n, e and w scattered through it, and "fit zoom" still finds Zoom to fit.
- **The canvas's right-click menu around the designs** starts with New screen, New component and Insert…, each with its
  keys, then Paste here, then Select all and Zoom to fit. New screen and New component put the new one's top left where
  the canvas was right-clicked and select it, leaving the view where it is. With no screen, component or note on the
  canvas, Select all and Zoom to fit are unavailable. Over a design the menu is as it was. It's as wide as its longest
  item, so New component and its keys stay on one line.
- **Layers' + always shows** beside Components and Screens, after the count, with its name and keys in the tooltip. An
  empty group leaves the count out, since its row says so, and the row is a button that makes the first one: "No screens
  yet. New screen", the action in the kind's color. Enter or Space on either makes one, rather than renaming the
  selected row as Enter in the tree does.
- **The inspector with nothing selected** asks for "a screen or component on the canvas or in Layers", whatever is on
  the canvas.
- **What lands on empty space on the canvas makes a screen there,** by one rule. Its top left is where it landed, it
  holds what landed in a padded column, and it's selected, as one undo step named for what landed ("Paste layer", "Paste
  7 layers", "Add Badge", "Add vertical layout"). It's named after what's in it, never "Pasted": one layer as Layers
  names it (a component without its library, "Button"; an instance after its design; text by its words; a layout Column
  or Row); several images Images; several other layers the first and how many more ("Nav and 6 more").
  - Layers pasted on the empty canvas with Paste here, or with nothing selected with Ctrl+V, in the middle of the view;
    and the insert picker's Text and layouts with nothing selected.
  - A component, component design or image from the Components panel dropped on the empty canvas, where a corner in the
    screen's color marks its top left while dragging; or clicked in the panel or picked in the insert picker with
    nothing selected, in the middle of the view. It goes in as inserting it into a layout would: with its required
    props, a library part inside the parents it needs, and a detached copy as the layers its design shows.
  - Image files dropped on the empty canvas, named after the file or Images (see Dropping image files, below).
  - Over a design where there's no layout under the pointer, nothing lands, and a message says "There's no layout here
    to drop into", as it does for files. With a design selected that has nowhere to insert, the insert picker and the
    Components panel both say "Select a layout, or a layer to add it after".
  - Frames will take this over once PAR-545 builds them.

Code: the commands are `newScreen` and `newComponent` in `chrome/keymap.ts` and `chrome/actions.ts`, run through
`createDesign` in `chrome/create.ts`, which takes a point for the canvas menu. `AppMenu.tsx` (`NewItems`),
`canvas-menu.ts` (`canvasMenu`, around the designs) and `CanvasMenu.tsx` (`run`) show them; `chrome/word-match.ts`
(`matchWords`) is Search actions' filter in `ActionsSearch.tsx`; the headings and empty rows are in
`chrome/LayerTree.tsx`, and the inspector's prompt in `DesignPanel.tsx`. The rule and the names are
`packages/editor/src/new-screen.ts` (`layersName`, `designOfLayers`, `designOfItem`); the app's `canvas/new-screen.ts`
finds the empty canvas (`emptyCanvasAt`) and the middle of the view and adds a screen of layers, `canvas/insert.ts` adds
one of an item (`addScreenOfItem`, from `insertAtSelection` and drops), and `canvas/clipboard.ts` and
`canvas/CanvasDrop.tsx` call them.

Tests:

- `packages/editor/src/new-screen.test.ts` (11): one layer named as Layers names it, a component without its library and
  by its own name, an instance by its design or its id, several images, several layers and the first, and never Pasted;
  a screen of layers at the point, named after them, with a free id, fresh ids and no bindings; and a screen of a
  component with its props, a design's instance, an image by its alt text, and a library part inside its parents, named
  after the part.
- `chrome/keymap.test.ts`: Ctrl+Alt+N, Ctrl+Alt+Shift+N and Cmd+Alt+N, and Ctrl+N left free; `chrome/word-match.test.ts`
  (4): "new" finding New screen and New component only, a word inside a name ranked after a name that starts with it,
  typed words in any order and case, and everything before anything's typed; `chrome/canvas-menu.test.ts`: the menu
  around the designs with its labels and keys, and Select all and Zoom to fit unavailable on an empty canvas.
- Stories, which replace the exploration Parity / Explorations / Starting on the canvas, deleted with this build: Parity
  / Left panel / Layers (Designs, EmptyProject, NewScreenHovered, FirstScreenMade), Parity / Chrome / App menu (File,
  ObjectWithNothingSelected, SearchActionsForNew), Parity / Chrome / Canvas menu (EmptyCanvas, NewScreenHere), Parity /
  Chrome / Quick insert (NothingSelected, NowhereToInsertInto), Parity / Left panel / Components
  (AddingWithNothingSelected) and Parity / Inspector / Design (NothingSelected). All but the two Quick insert ones
  played without errors in headless Chrome on 2026-11-05; there `/` doesn't reach the canvas, for Open's story too.
- End to end (PAR-202), `apps/desktop/e2e/menus.e2e.ts`: a right-click on the empty canvas lists New screen, New
  component and Insert… with their keys, and New screen makes an untitled screen at the pointer, selected, as "New
  screen"; `e2e/dropping.e2e.ts`: Badge dragged from the Components panel onto the empty canvas shows the corner and no
  outline, and makes a screen called Badge at the drop point holding it, selected, as "Add Badge", which Undo takes out.

Checked in `pnpm dev` on the example on 2026-11-05: File and Object start with both items and their keys; Ctrl+Alt+N and
Ctrl+Alt+Shift+N make and select an untitled screen and component; Ctrl+K and "new" lists the two, and Enter makes a
screen; the canvas menu around the designs makes one at the pointer; Layers' + is named, shows "New screen Ctrl+Alt+N"
in its tooltip, is reached with Tab and makes one with Enter; `/` with nothing selected makes Column from Vertical
layout and Badge from Badge; Badge dragged onto the empty canvas shows the corner and makes Badge there; and Pricing's
layers, copied, make "Nav and 6 more" with Paste here and with Ctrl+V. Each undid as one step.

Gaps: the end-to-end tests run only in CI. A screen made with nothing selected goes in the middle of the view, as pasted
layers always have, even when a design is there. A component in a new screen fills its width, as it would in any column;
the proposal's "keeps its own width" is not part of this.

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

Code: `formatKeys` in `apps/desktop/src/renderer/chrome/keys.ts`. The kit's `Kbd` and its menus' and Search actions'
`*Shortcut` parts show what they're given, so each place that shows keys passes them through `formatKeys` itself, as
`AppMenu.tsx`, `CanvasMenu.tsx`, `ActionsSearch.tsx`, `Toolbar.tsx` and `ShortcutsDialog.tsx` do.

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
  when there's a row to move to. A row's worth is the columns the grid has as laid out, or, for one only layout can
  count, such as `repeat(auto-fill, …)` or a `subgrid`, as many as the places its children start at; with nothing to
  count from, Up and Down do nothing. The arrows across a layout, and across a wrapping row, do nothing. Shift moves one
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
- **One undo step per run** (PAR-441). Presses on the same selection are one step (Undo nudge layer), however long the
  pauses between them, and however often the same layers are selected again meanwhile, in any order. Another edit, an
  undo or a redo, or selecting something else, also when the selection comes back, starts another; selecting something
  else ends the run as it happens. A run that comes back where it began leaves no step, and Redo as it was.
- **Moving a layer by 1px** waits for PAR-194, since it would leave the spacing scale.
- **Layers inside an instance don't move,** as they can't be dragged.
- **The keys.** On the canvas, the arrows with Ctrl or Alt do nothing, so tldraw never moves a design behind the
  keymap's back. On a focused control, such as a Layers row, the arrows stay the control's. A layer that moves stays in
  view.

Code: the rules are `packages/editor/src/move-resize.ts` (`@parity-app/editor`): `arrowOf`, `reorderStep` and `reorder`,
`nudgeLayers`, which moves absolutely placed layers by `shiftInsets` as dragging does, and `nudgedPosition` for designs
and notes. `apps/desktop/src/renderer/canvas/nudge.ts` has `nudgeSelection`, which nudges what's selected in the store,
and `frameDrawn`, which reads a layout's flow, through `@parity-app/editor`'s `flowOf` with its children's boxes from
`frame.ts`'s `flowingBoxes`, and a layer's drawn insets from its frame. Then `chrome/commands.ts` (`nudge`),
`chrome/actions.ts` (`byKey` keeps it out of Search actions), `chrome/keymap.ts` and `chrome/keys.ts` (the arrows are
written `←`, `→`, `↑` and `↓`), and `canvas/shortcuts.ts`, which passes the key event to the action and keeps the other
arrows from tldraw. A run's gesture is `runGesture` in `nudge.ts`, a `GestureRun` (`canvas/gesture.ts`) keyed by the
selection's `selectionKey` (`selection.ts`).

Tests:

- `packages/editor/src/move-resize.test.ts`: how far each arrow moves in a row, a column, reversed and a grid;
  reordering a layer, a block, past absolutely placed layers and down a grid; nudging a design's layers in a state,
  following the frame's direction, and leaving instances alone; moving insets from each side, both sides, tokens and
  unset sides with and without where they're drawn (`shiftInsets`, shared with dragging); and designs and notes moving
  1px or 10px, to the whole pixel.
- `apps/desktop/src/renderer/canvas/nudge.test.ts`, with the real stores: a run of presses with pauses of four seconds
  as one undo step, another edit or an undo between presses starting another, a run there and back leaving no step, a
  new selection starting another, also back to the one before, the same layers selected again in another order keeping
  the run, designs moving together and a mode column and a note moving.
- `apps/desktop/src/renderer/ModeView.test.ts`: `frameDrawn` reads a row, a column and a grid's columns from a design
  rendered as the canvas renders it, and an absolutely placed layer's insets in steps, at full size and at half scale.
- `apps/desktop/src/renderer/chrome/keymap.test.ts`: the arrows match with and without Shift, and show as `⇧←` on a Mac.
- `apps/desktop/e2e/keyboard.e2e.ts` (4), end to end (PAR-202): a link in Pricing's footer moved two places right by two
  presses, nothing across the row, and one undo; the same two presses a second and a half apart, still one undo
  (PAR-441); Calendar's Planning slot moved down a step, then ten with Shift, and right on both of its sides; and
  Pricing moved 1px and 10px, with Ctrl and Alt arrows moving neither the design nor tldraw's board.

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
  all the way down, slots included, and so do the variant options the board shows, the frame's viewport patches and the
  values bound params show there (PAR-464). Only the outermost selected layers are copied.
- **A binding goes only where its param is** (PAR-464). A copied layer bound to a param keeps the binding when it's
  pasted into a design with a param of that name, and follows it there; anywhere else the binding is dropped and the
  layer keeps the value it showed. A new screen has no params, so it keeps none. Pastes, Paste over, Paste to replace,
  Paste here and dragging to another design all do this.
- **The copy is an envelope** (`{"parity":"clipboard","version":1,"project":…,"payload":…}`) holding layers, designs or
  notes, and the project they came from. Text that starts like a Parity copy but isn't a complete envelope of a known
  kind, such as cut-off JSON or an unknown version, pastes nothing and shows a message. So does an envelope whose
  layers, designs or notes are empty or don't match the `.par` schema, rather than failing halfway or pasting its JSON
  as text.
- **Pasted layers get fresh ids,** for them and everything in them. They go into the selected layout when it's the only
  layer selected, else just after the last selected layer in its layout or slot, else into the design's root. With no
  design selected, or a root that isn't a layout, they become a new screen named after them, laid out in a padded column
  (PAR-546, under Inserting).
- **Pasted designs keep their ids unless taken,** when they get one from their name. Into the project they came from,
  they go to the right of the originals (see Duplicating a design); elsewhere, in the middle of the view.
- **Pasted notes get fresh ids** and sit a little below and right of where they were copied, as they sat together.
- **Text pastes as a text layer** where layers would go, or as a note in the middle of the view. **SVG markup pastes as
  a picture,** not as its source.
- **Copy style copies the look the frame shows,** with its variant options and viewport, and **Paste style gives each
  selected layer the copied style in place of the one shown,** in the state being edited. In a state other than the
  base, the state takes away what the copy doesn't set (PAR-426), so it shows only the copied style there, as the base
  would: pasting a padding of 4 onto a row with a gap of 3 and a padding of 1 leaves a column with a padding of 4. The
  inspector marks each value taken away as changed in that state, with Reset.
- **Layers naming components the project doesn't have** still paste, with a warning naming them.

Code: the rules are in `packages/editor/src/clipboard.ts` (`@parity-app/editor`).
`apps/desktop/src/renderer/canvas/clipboard.ts` reads and writes the system clipboard, saves images, places designs by
their boxes on the canvas, applies the rules to the selection and the store, and shows the messages.

Tests: `packages/editor/src/clipboard.test.ts`: writing and reading the envelope, and text, a cut-off envelope, another
version, a project that isn't text, an unknown kind, a payload without its list or with an empty one, and invalid
layers, designs and notes, all rejected; telling a Parity copy, readable or not, from other text; designs and notes read
back; SVG markup, and text that only looks like it; copying the outermost layers as a state shows them; where layers
paste (a lone selected layout, after the last selected layer, in a slot, the root, and a root that isn't a layout);
fresh ids in order, last, inside copies and in a slot; with the shared fixture's card, copying in a variant, state and
viewport, the bound title as it shows, and pasting it into a design with and without the param, and bindings fitted all
the way down; designs' ids, kept when free even when not made from the name, and whole-pixel moves; notes beside where
they were and at a place; copying style in a state, and in a variant and viewport, and pasting it in the base and in
another state, where the state shows only the copied style, taking away the design's values and keeping nothing for what
the design doesn't set; and missing components at any depth, and none while the project's aren't known. The new screen
layers make, its name and the bindings it keeps none of, are in `packages/editor/src/new-screen.test.ts` (PAR-546). What
a state takes away is tested in `packages/core`: `edit.test.ts` ("taking a value away"), a prop taken away in one state,
a value the state set taken away with nothing kept, setting it again and Reset, and removal in the base;
`render.test.ts`, a state taking style and props away over the design and the viewport's patch, layered patches, an
instance's param back to its default, and reading `unset` from a file; `packages/agent/src/workspace.test.ts`, `Update`
taking the base's gap away in one state and refusing an unknown key.

Gaps: reading and writing the system clipboard, images and the messages have no automated test. The inspector's mark on
a value a state takes away has no automated DOM test.

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
once after the last of several, beside a selected component, on top of an absolutely placed layer at its insets, at the
insets a viewport's patch gives and not elsewhere, a binding kept only for a param the design has, in a component's
slot, leaving the root and instances' layers alone, designs at the selection's corner as they sat, and new ids for
designs whose ids are taken. Paste to replace: in place of one layer, fresh ids and states' changes dropped, each of
several layers, in a component's slot, at an absolutely placed layer's insets, and leaving the root and instances'
layers alone. `apps/desktop/src/renderer/chrome/keymap.test.ts` checks both keys, and that Ctrl+R still renames.

End to end (PAR-202), with a stand-in for the clipboard on the page, `apps/desktop/e2e/keyboard.e2e.ts` (6):
Ctrl+Shift+V after a link in Pricing's footer, removing nothing, and one undo; Ctrl+Shift+R in the link's place, without
reloading the window; Ctrl+Shift+V over Calendar's absolutely placed Planning slot, at its insets; copied Pricing over
Sign in, at its position and on top of it; the message when designs are copied and layers selected; and plain text
replacing a layer as a text layer.

Gaps: the system's own clipboard isn't read in the tests, and pasting an image or SVG is covered by neither.

## Adding images

Images from outside Parity: pasted (Copy, paste and paste style, above) or dropped from the system's files.

### Dropping image files from Explorer or Finder (PAR-24)

PNG, JPEG, GIF, WebP and SVG files dragged from the desktop, Explorer or Finder onto the canvas are saved into the
project under `public/images/` through `images.import`, as a pasted image is, and land where they're dropped.

- **Over a layout inside a design** they go into the deepest of the design's own layouts under the pointer, in the frame
  there, at the slot under the pointer, where a dragged layer would land (`slotAt`), as Paste here puts layers. In a
  layout that's absolutely placed in the state shown, they go at the pointer, on top. A layout inside an instance is
  never the target.
- **On the empty canvas** they make a new screen with its top left at the pointer, as a paste with nothing to paste into
  makes one. It's named after the file, or Images when there are several, and holds them in a padded row that wraps.
- **Over a design where there's no layout,** or over its board around the frames, nothing is added, and a message says
  so.
- **Several files** land side by side, in the order they were dragged: one after another in the slot, so along the
  layout's own direction; in a row in a new screen; and in an absolutely placed layout, from the pointer rightwards, 4
  steps apart.
- **Each image** is 80 steps wide (320px at 4px a step) and as tall as its proportions make it, as a pasted one is, and
  is named after its file with a short hash of its content, so dropping the same file again reuses it. The ones dropped
  end up selected.
- **One undo step** places them all ("Drop image", "Drop 2 images"). The files are written as they're dropped, one at a
  time in the order dropped, before the step, as a paste writes them, and undoing it leaves them, as undoing a paste
  does.
- **Files that aren't taken** are named in a message, with why: not one of the five types ("notes.txt isn't a PNG, JPEG,
  GIF, WebP or SVG image."), or larger than 20 MB. The rest are still added. A file the system gives no type is taken by
  its extension. One that fails to save gets a message too, and the rest are placed.
- **While dragging** over the canvas, a label beside the pointer says what a drop there does ("Add 2 images here", "New
  screen with the image", "Drop onto a layout, or onto the empty canvas"), counting only the files that may be images.
  Over a layout, its box is outlined with a dashed line and the slot is marked as a dragged layer's is; where they'd go
  at the pointer, a corner marks their top left. It goes when the drag leaves the canvas, when it's dropped, or a second
  after the drag stops sending updates, as one called off can end without saying so.
- **Edge cases.** tldraw never sees the files, so it doesn't add pictures of its own. In Interact the design under the
  pointer gets the drop, and a file field in it takes the file as it would in a browser. A file dropped anywhere else in
  the window, such as on a panel, is refused rather than opened in the window in Parity's place, which is what Electron
  does with a drop nothing takes.

Code: which files are taken (`imageTypeOf`, `sortDrop`, by the `imageTypes` and `imageLimit` that `images.import` uses
too), the message (`skippedMessage`), the label (`dropHint`), the undo label and the new screen (`designOfImages`) are
in `packages/editor/src/drop-files.ts` (`@parity-app/editor`). In the app, `canvas/drop-files.ts` finds where a drop
lands (`fileDropAt`, through `hitTest`, `measureHere` and `slotHere`), saves the files through `importImage` in
`canvas/clipboard.ts`, and places them as one step (`dropFiles`, through `pasteHere`); `keepFilesFromOpening` there
refuses drops elsewhere, from `main.tsx`. `canvas/CanvasDrop.tsx` handles the drag on the canvas and draws the outline,
the slot, the corner and the label. Saving is `apps/desktop/src/utility/images.ts`.

Tests:

- `packages/editor/src/drop-files.test.ts` (13): the five types by media type; other types left out whatever the name;
  types by extension when the system gives none; what counts as a possible image while dragging; images kept in order
  and the rest skipped by name and reason, the size limit included; the messages for one file, several, both reasons and
  more than five; the label for each place; the undo labels; names without extensions; and the new screen, named after
  its file or Images, in a wrapping row at the drop point, with a free id and fresh ids.
- `canvas/paste-here.test.ts`: several copies side by side in an absolutely placed layout, and `slotHere`'s slot and
  line (see Right-click menus, above).
- `apps/desktop/e2e/dropping.e2e.ts` (4), end to end (PAR-202), with real files through Chromium's drag events: a PNG
  and an SVG dropped between Pricing's lede and billing period, with the outline, the slot and "Add 2 images here" while
  dragging, landing in that slot one after the other at their proportions, saved under `public/images/`, selected, as
  "Drop 2 images", and one undo taking both out and leaving the files; an SVG dropped on the empty canvas making a
  screen called logo at the drop point, with the corner and its label; a text file dropped with a PNG named in a message
  while the PNG is added; and a drag called off adding nothing and showing nothing after.

Gaps: no drag from Explorer itself has been tried. The tests, and the check in an isolated copy of the app on a copy of
the example on 2026-10-30, send Chromium's own drag events carrying the files, which is what Explorer's drag becomes
inside the window. In that check the outline, slot and label showed over Pricing's Hero, a PNG and an SVG landed there
with a text file named in the message, and two dropped on the empty canvas made a screen called Images. Finder isn't
tried, as Parity's macOS copy hasn't run yet. A drop over a design's frame where no layout is, and over its board's
background, says so rather than making a new screen, which Paste here does around the boards; neither is in the
end-to-end test. In a column, several images land one under another, since side by side means along the layout's own
direction. Files land in a component's slot as Paste here does (PAR-419), which is in no test of dropping. Files from a
browser rather than the system (a picture dragged from a web page carries a URL, not a file) aren't handled. Interact's
drop into a design wasn't tried.

## Fields

How the inspector's number, length and token fields read what's typed, scrubbed or stepped.

### Typing, stepping and scrubbing (CAN-48)

Every number and length field in the Design tab takes what people type, as Figma's do. The lengths are Gap (and its
column and row gaps), Padding and Margin (both sides, or each side), Width and Height, Min and Max, and an absolutely
placed layer's insets. Opacity is a percentage. A grid's Cols and Rows, a layer's Span and a text's Max lines are whole
numbers. A component's number props take any number.

- **What a field shows.** A length shows in pixels: a gap of 4 steps shows 16, with `px` after it, hidden while the
  field has focus. Hovering it gives its step (`Gap, spacing-4`). A length token shows its name, in a code font. When
  the selected layers differ, the field shows the word Mixed, as text that can be typed after. Values are in the panel's
  12px text, as its labels and lists are.
- **Width and Height show their whole value** (PAR-496). At the inspector's usual width and wider, the length has room
  for four digits and `px` beside its Fixed, Fill or Hug list. Below that, from about 310 pixels down to the narrowest
  260, the list goes under the length rather than squeezing it, so a 96 by 48 layer shows 96 and 48, not 9 and 4.
- **What it reads.** A number; `px`, `rem` (16px) and `%`; maths with `+ - * /` (`×` and `÷` too) and brackets; for a
  length, a token's name (`container-sm` or `--container-sm`) or a step's (`spacing-4`). An empty field clears the
  property, as before. Typing 320 in Width gives 320px, kept as 80 steps (`w-80`), following the project's spacing unit:
  with MUI's 8px, 320 is 40 steps.
- **Working from the value there.** A leading `+`, `*` or `/` works from it: `+8` adds 8px, `*2` doubles it. A leading
  minus is a negative number, since an inset can be negative; to subtract, type after the value shown, or `Mixed-8`.
  Mixed stands for each layer's own value, so `Mixed+8` adds 8px to each selected layer; anything without it gives every
  layer the same value. The note above the fields of several selected layers, which lists what differs, says so too
  (PAR-203). In a length or a count, `%` is a share of the value there (`50%` halves a width, as in Figma's dimension
  fields); in Opacity it's the unit, so `50%` is 50.
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
- **Limits.** Sizes, padding, margin, gaps and limits can't go below 0; insets can. Opacity is a whole percentage within
  0 and 100 (PAR-203). Counts are whole numbers from 1. A value past a limit is kept at it ("Kept at 0px: it can't go
  lower"), and a count or an opacity with a fraction is rounded ("Rounded to 2: it takes whole numbers", "Rounded to
  33%: it takes whole percentages"), each said under the row. An opacity already off a whole percentage shows as it is
  until it's edited, and Up and Down go from the whole percentage nearest it.
- **Up and Down** move a length one step of the spacing scale (4px with a 4px unit) and Shift ten steps, the same
  distance nudging moves an absolutely placed layer; a half step goes to the whole step beside it. Opacity, counts and
  numbers move by 1, and Shift by 10. Each press is made at once, and a run of presses is one undo step, however slow
  (PAR-441): typing, Enter, Escape, leaving the field or scrubbing it ends the run, and so does another selection while
  the field keeps focus, so one undo never takes back edits to two layers. With something readable typed, it steps from
  that; with something it can't read, nothing changes and the reason shows.
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
- **Number props preview too** (PAR-203), typed or scrubbed, such as a Progress bar's `value`. A prop has to draw the
  component again, which inline styles can't do, so the preview is made in the design, in a gesture of its own, as a
  resize writes as the pointer moves, and each keystroke takes the last one back first. Maths works from the value as it
  was before the preview (`/20` divides 70, not the 35 `/2` showed). Escape, or committing the value it started with,
  takes it all back with nothing to undo; Enter makes anything else one undo step. While it shows, the panels, agents
  and, with automatic saving on, the file see it as they see a resize in progress.
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
- `chrome/fields.tsx`: `NumberField`, which runs those effects, handles keys and scrubbing, and begins and ends the
  gesture a run of steps or a scrub commits in, a `GestureRun` from `canvas/gesture.ts` (`runEnders` says what ends a
  run, and `FieldTarget`, which `chrome/DesignPanel.tsx` sets to the selection's `selectionKey`, what the run edits),
  `NumberInput`, and `Field`, whose label scrubs a lone field and which shows what its fields say under the row.
  `NumberValueInput` is a prop's or param's number, which works its edits out from the value as it was before a preview.
- `chrome/StyleSections.tsx`: each style field's rules and how its edit reads and writes each layer's own style
  (`fieldEdits`), with `LengthInput` and `CompactNumber`. `StyleEditor` takes values, or a function of each layer's
  style, and has `preview` and `endPreview`. `chrome/PropsSection.tsx` has the number props, which
  `chrome/LayerPanel.tsx` previews through `canvas/change-preview.ts`'s `ChangePreview`: a change made in a gesture and
  taken back to its checkpoint unless it's made. `chrome/MultiPanel.tsx` has the note on what differs.
- `canvas/style-preview.ts`: `StylePreview`, which writes previews onto the frames, takes them back, and settles them
  for the change. `chrome/LayerPanel.tsx` and `chrome/MultiPanel.tsx` wire it into the inspector, the latter working an
  edit out for each layer.

Tests:

- `packages/core/src/fields.test.ts` (44): 320 as pixels, `16px`, `rem` and step names, tokens, maths with units, `%` of
  the value there, leading operators, a leading minus, Mixed per layer, landing on the scale with its note, limits,
  another spacing unit, clearing, `50-10` in Opacity, whole percentages in Opacity with their note and stepping from a
  fraction (PAR-203), counts and numbers, each reason for input it can't read, steps, scrubbing, and notes across
  layers. The cases the audit found broken fail without the change.
- `apps/desktop/src/renderer/canvas/change-preview.test.ts` (4), with the real store: each preview in place of the last
  and taken back with nothing to undo, a commit after previews as one undo step, a commit in a run's gesture, and Redo
  kept when a preview is taken back.
- `packages/core/src/style-changes.test.ts` (6): only what an edit changes, properties taken off, a component's style, a
  state that sets its own value, and nothing for no change.
- `apps/desktop/src/renderer/chrome/number-field.test.ts` (16): previews while typing, keeping the last one, the draft
  over a changing value, Enter committing and keeping focus, input it can't read kept with its reason, leaving the
  field, Escape, steps from the value and from a draft, and scrubbing.
- `apps/desktop/src/renderer/chrome/fields.test.ts` (14), in Chrome: the real field in a row. 320 previews as it's
  typed; Enter commits and keeps focus with the text selected; `16em` stays with its reason, also after leaving; a value
  changing underneath, then Escape; a snapped note; Up, Shift+Up and Down; a run of Up presses with a pause as one
  gesture, ended by Enter, another ended by leaving the field, and a typed commit in none (PAR-441); a run ended by what
  the field edits changing while it keeps focus, the next press starting another; scrubbing the row's label to one
  commit, in a gesture from the press to the release, and Escape during a scrub; `Mixed+8` on two layers; and a number
  prop whose preview the value it's given holds (PAR-203): `/20` previewed and committed from 70, Escape and Enter on
  the value it started with taking the preview back, and a scrub from 70.
- `apps/desktop/src/renderer/canvas/style-preview.test.ts` (6), in Chrome: a preview drawn in each state's frame, a
  state that sets its own width left alone, a later preview putting back what it doesn't change, taking it back exactly,
  settling for the change, and nothing written for no change.
- `chrome/fields.stories.tsx`: a Length row in every look, and TypingMaths, SnappedToTheScale, CantRead and Stepping.
- `chrome/StyleSections.stories.tsx`, SizeAtNarrowest and LargeSize (PAR-496): a 96 by 48 brand mark at the narrowest
  inspector and a 1440 by 900 one at the usual width, each play function checking that Width and Height show the value
  whole. Both fail on the layout before PAR-496.
- `apps/desktop/e2e/fields.e2e.ts` (10), end to end on Pricing's Brand mark (PAR-202), the inspector's wiring against
  the real store and frames: 320 typed in Width drawn at each keystroke (4, 32 and 320px) while the design keeps its
  width, and Enter making 80 steps as one undo step, with the field focused and its text selected; `16px`; 281 landing
  on 282px with its note; `abc` kept with its reason, and Escape putting the value back; a value set underneath leaving
  `12` in the field; Up, Shift+Up and Down, more than a second apart, as one undo step; `50-10` in Opacity; scrubbing
  the Width label, drawn while dragging and one undo step on release; and `Mixed+8` on Brand mark and Plans, with the
  note naming it. On App sidebar's Seats bar (PAR-203): 25 typed in its `value` drawn at each keystroke and made as one
  undo step, and `/20` drawn as 3.5 from 70, then taken back by Escape with nothing to undo.

Gaps: the timings were measured by hand in an isolated copy of the app on 2026-10-29: typing 320 in Width previewed at
each keystroke in 25, 25 and 41 ms (a commit took 291 ms to show before), and scrubbing in 22 ms. The stories' play
functions weren't run in Storybook. A number prop's preview wasn't timed: it draws the component again, as a commit
does. Params' number fields don't preview yet. Padding, Margin, Min, Max and an absolutely placed layer's insets, two
lengths to a row, can still clip a value in an inspector narrower than its usual 320 pixels.

### One right edge in the inspector (PAR-552)

Everything in the inspector's Design tab runs to one right edge, 12px from the panel's side: inputs, the Editing bar,
buttons such as Make component, a section's action such as Min and max, and the toggles beside Padding and Margin. A
field's reset arrow, shown while a state changes it, sits in the label column right after the label, so a row's input
keeps the row's full width whether or not it can be reset. An image's photo credit sits under its fields, in their
column. The Editing bar reads as one sentence ("Editing Monthly changes every state") and wraps when it doesn't fit,
rather than running past its border.

Code: `panelEnd` in `apps/desktop/src/renderer/chrome/PanelSection.tsx` is the right padding sections and headers use;
`Field` in `chrome/fields.tsx` places the reset arrow beside the label.

Tests: none; it's checked in the Inspector stories (Layer: Image Layer and Instance Changed In A State; Fields: Changed
In A State; Design: Screen Selected), in light and dark.

## Component props

What the Props section of a component layer lists, and how each kind of prop is set there.

### Slots shown the way children is (PAR-127)

A prop that takes content is set as `children` is: text typed in its field, or layers in a slot of its name, which the
canvas passes as the prop. Fluent v9's slots (`icon`, `contentBefore`, `media`, `header` and the like) are such props:
the type checker reads them as nodes, so a Fluent Button's `icon` or an Input's `contentBefore` takes text or an icon
layer where it used to take a value of unknown type.

- **Which slots.** A prop whose type is a union with a props object holding `as` (Fluent's `Slot<'span'>`,
  `Slot<typeof Label>`) is a slot. One that also takes text, numbers or elements takes content, so it's a node; one that
  takes only its part's props (a Checkbox's `input`, an Avatar's `image`, both void elements) is an object, set as JSON.
- **Where they're listed.** A slot that takes content is the component's own, listed with its own props wherever the
  library declares it, with its type as Fluent writes it (`Slot<'span'>`). Its `root` slot is the component itself, so
  it stays with the attributes, as `children` does for a library's components.
- **Set in layers.** Once a node prop's slot holds layers (a sample's `icon={<CalendarRegular />}`), its field says "Set
  in layers" in place of a text field, whether the prop's a slot or `children`, and it isn't offered under Add a prop
  again, since the slot's layers are what the canvas passes. An attribute's slot with layers is listed among the set
  props, without a Remove button: its layers are removed in the Layers panel. A library's `children` in layers stays in
  the Layers panel alone, as before. With no layers, a value that isn't text (a number, `null`) is edited as any typed
  value is, rather than taken for layers.

Code: `packages/code/src/props.ts` (`classify` and `slotKind`, and the group a slot takes in `componentProps`),
`packages/core/src/props.ts` (`propsPanel`, what the section lists, and `nodePropInput`, how a node prop's field edits
it), and `chrome/PropsSection.tsx` in the app.

Tests:

- `packages/code/src/props.test.ts`, Fluent's slots (4): a declaration in a package's `node_modules` written as Fluent
  writes `Slot`, with a content slot read as an own node prop typed `Slot<'span'>`, a void element's slot as an object,
  the root slot left with the attributes, and the library's other props its file declares listed as its own (PAR-457,
  below).
- `packages/core/src/props.test.ts` (6): a node prop edited as layers, text or a typed value; a content slot listed and
  taking text, set in layers once its slot holds them and not offered again, an attribute's slot with layers among the
  set props, a library's children in layers left to the Layers panel, and a text label and functions left out.

Gaps: the section's wiring has no automated DOM test. The reader was run against `fixtures/fluent`'s installed
`@fluentui/react-components` on 2026-10-30: Button's `icon`, Input's `contentBefore` and `contentAfter`, CardHeader's
`header`, `image`, `description` and `action`, Avatar's `icon`, `initials` and `badge`, and Checkbox's `label` and
`indicator` read as own nodes; Checkbox's and Input's `input`, Card's `checkbox` and Avatar's `image` as objects. In an
isolated copy of the app on that project, the same day, a Button with a text layer in its `icon` slot drew it before its
label and its Props section said `icon` was set in layers, and an Input's `contentBefore` took `$` as text and drew it
in the field, with `contentAfter` offering "Text, or layers in its slot".

### A library's own props beside the attributes it passes on (PAR-457)

A library component often takes an element's attributes and adds props of its own: Nova's `SidebarMenuButton` is a
button's attributes and `isActive`, `tooltip`, `variant` and `size`. The props its own declaration file adds are its
own, listed with its variants in the Props section and in `Props()` for agents, with their defaults. What it passes on
from React or another package (`disabled`, `type`, Base UI's `render`) stays with the attributes, behind `all`.

- **Defaults** come from the package's compiled JavaScript beside the declaration file, which keeps what the component
  destructures (`isActive = false`) where the declarations drop it.
- **A cva variant** is a prop's only when its options are the prop's. Nova's `sidebar.js` has a `variant` for the menu
  button, so the `Sidebar`'s own `variant` (`sidebar`, `floating`, `inset`) and `SidebarMenuSubButton`'s `size` used to
  take the menu button's options; they now keep their own, with their own defaults.
- **Slots** keep their rule (PAR-127): `root` and slots that take only their part's props stay with the attributes.
- **Other libraries** gain their own props the same way where a file declares a component and its props together: MUI's
  Button lists `color`, `variant`, `size` and `startIcon` (and `sx` and `classes`, read as values of unknown type),
  Fluent's lists `appearance`, `shape` and `size`, and Chakra's lists `loading` and `spinner`. Before, they listed none
  of these outside `all`.

Code: `componentProps`, `sameOptions` and `functionNamed` in `packages/code/src/props.ts`. The Props section, `Props()`,
`parity props` and the MCP's `get_props` read the same result.

Tests: `packages/code/src/props.test.ts`, a library's own props (4): a kit shaped as Nova lists `isActive` and a
provider's `defaultOpen` and `open` as its own with their defaults; the attributes it passes on stay with the
attributes; a cva variant's options go only to the prop whose type has them; and the example's installed Nova reads
`isActive`, `tooltip`, the provider's props and the `Sidebar`'s `variant` this way.
`packages/libgen/src/nova-sidebar.test.ts` (1: a menu button given `isActive` draws Nova's own `data-active` style). The
other libraries' lists were read from `fixtures/mui`, `fixtures/fluent` and `fixtures/chakra` on 2026-11-05.

## Text

Editing a text layer's words on the canvas, and how a text layer sizes.

### Editing text in place (PAR-175)

Double-clicking a selected text layer, or Enter on it, opens an editor over the text, as Figma's does. It also opens on
a component whose only child is text, such as a button's label, and on text just added with the text tool or the insert
picker.

- **What's selected when it opens.** A double-click selects the word under the pointer, as a browser does: the word
  holding that character, or the space or punctuation there when it isn't a word, on any line. Enter, the text tool and
  the insert picker select the whole text, so typing replaces it. A double-click that lands off the characters (between
  lines, in padding) selects the whole text too.
- **It stays on the text.** The editor is measured against the text every frame while it's open, so it moves and scales
  with the camera as the canvas pans and zooms, and with the layout when something around the text moves. The text it
  covers is hidden meanwhile, and shows again when the editor closes.
- **It wraps where the text wraps.** Text that wraps (auto height, fixed, or a component's text that wraps) is edited in
  its content box at its own width, and grows down as more is typed. Text that stays on one line (auto width, or a
  component that doesn't wrap its text, as a button doesn't) is edited from where its characters are and grows along the
  line, up to its maximum width if it has one, where it wraps as the text does. Its font, size, weight, line height,
  letter spacing, alignment, case and decoration follow the text's at the zoom shown.
- **Leaving keeps the edit.** Escape keeps what's typed, as notes do, and so do Enter and clicking away. Shift+Enter
  types a new line. The layer stays selected. An edit is one undo step, Edit text, written to the state and variant the
  editor opened on (PAR-164, below); leaving without a change writes nothing.
- **Input methods.** While an input method is composing (Japanese, Chinese, Korean), Enter and Escape are left to it, to
  take or drop what's composed, and don't close the editor. The editor tracks composition by its `compositionstart` and
  `compositionend` events, and by the key event's own `isComposing`.

### Auto width, auto height and fixed text (PAR-175)

A text layer sizes in one of Figma's three ways, picked under Text > Resizing in the inspector (for a text layer; a
component's text sizes as the component does). The mode is read from the layer's width and height, so it isn't a
separate setting that could disagree with them, and the resize handles change it as Figma's do.

- **Auto width:** `width: "hug"`. The layer is as wide as its line and never wraps for its parent, only at a maximum
  width if it has one, as in Figma. It's drawn `width: max-content`, Tailwind's `w-max`; hug on other layers stays
  `fit-content`.
- **Auto height:** any other width, or none, and no height. It wraps at its width and grows down. A text layer with no
  width wraps at the one its layout gives it, so that's auto height too, which is what text added to a layout starts as.
- **Fixed:** a height as well, a length, a token or fill. It keeps that height whatever the text, and text past it
  overflows, as in Figma.
- **Switching keeps it where it's drawn.** Auto width sets hug and drops the height (and the older `grow`). Auto height
  turns a hugging width into the width it's drawn at, rounded up to whole spacing steps so the text doesn't wrap again,
  keeps any other width, and drops the height. Fixed does the same for the width and fixes the height it's drawn at,
  rounded up too, or keeps the one it has. In a column, where the older `grow` fills the height, both drop it too; in a
  row it fills the width, which they keep. Each is one undo step. Dragging a side handle of auto width text fixes its
  width, so it becomes auto height; dragging the bottom fixes its height, so it becomes fixed.
- **Several layers, states and variants.** With several text layers selected, each is measured in its own box, so each
  keeps its own size, and each one's own parent decides whether `grow` goes. In a selection of text and other layers,
  Resizing changes only the text. In a state, a variant or an instance, a height or `grow` the design sets would show
  again if the change only dropped it, so auto width and auto height set the height to hug, and `grow` to false, over
  it. Resetting Resizing there takes back all three of width, height and `grow`, so no `grow: false` stays behind
  (PAR-582).

Code: what the editor selects, the modes and switching between them are `packages/editor/src/text-editing.ts` (`wordAt`,
`openingSelection`, `textSizing`, `withTextSizing`, and `textSizingKeys`, the properties a switch writes and a reset
clears). Drawing hug text as `max-content` is `textCss` in `packages/core/src/render.ts`. The editor is
`apps/desktop/src/renderer/canvas/TextEditor.tsx`: it finds the character under the double-click from the text's own
ranges, measures the text each frame, and handles the keys. The double-click passes its point through
`SelectionStore.setEditing` (`selection.ts`), from `canvas/CanvasOverlay.tsx`. The Resizing control is `TextResizing` in
`chrome/StyleSections.tsx`, and `measure` in `chrome/LayerPanel.tsx` rounds up for it. The agent's skill says how text
sizes in `packages/cli/skills/document.md`.

Tests:

- `packages/editor/src/text-editing.test.ts` (13): the word holding a character, from any of its letters; a space or
  punctuation on its own; the end of the text and an empty one; apostrophes and digits kept in a word; the whole text
  without a point on it; the mode read from widths and heights; each switch, keeping fill and a fixed height; the height
  set to hug and `grow` to false over the design's in a state; `grow` dropped by auto height and fixed in a column and
  kept in a row; every switch in a state writing only the keys Resizing's reset clears, so resetting leaves the state as
  it was (PAR-582); and every switch landing where `textSizing` reads it back.
- `packages/core/src/render.test.ts`, sizing: hug text drawn `max-content`, still wrapped by a maximum width, and other
  widths as before.
- `apps/desktop/e2e/text.e2e.ts` (7), end to end (PAR-202), on Pricing's subtitle and FAQ heading: a double-click on
  "upgrade" and on "viewers", on the second line, selects that word; Enter selects the whole text; the editor sits over
  the text's 560px box, on its two lines, and grows down as it's typed in; it follows the text as the wheel pans and
  Ctrl and the wheel zoom, with its font scaled to match and the selection kept; Escape keeps the edit as one Edit text
  step with the layer still selected; Enter and Escape during a composition leave it open and change nothing, and Enter
  after `compositionend` keeps it; and Resizing switches the heading, fixed at 80px, to auto width on one line, then
  auto height at the width it's drawn at, then fixed at its height. Six of the seven fail against the code before
  PAR-175; Enter already selected the whole text.

Gaps: the composition test sends `compositionstart` and `compositionend` itself, so a real input method's keys haven't
been tried. With several layers selected, Resizing measures each text layer in its own box, changes only the text layers
of a mixed selection, and reads each one's own parent for `grow`; none of that has a test of its own, as the panel's
edits are only driven end to end. Each click on a mode is an undo step of its own (PAR-441). The resize handles changing
the mode follows from reading it from the width and height, and has no test of its own. A text layer's own new lines,
typed with Shift+Enter, are kept in the text but drawn as spaces, since text layers don't preserve white space (older
than PAR-175). While the editor is open the text under it doesn't reflow as it's typed in, so layers after it move only
once the edit is kept. Checked in an isolated copy of the app on 2026-10-30: a double-click on "upgrade" selected it,
the editor followed a wheel pan and a zoom to 110% with "upgrade" still selected, Escape kept "grow" as one Edit text
step with Lede still selected, and Resizing showed Auto height pressed and switched Lede to auto width, which its 560px
maximum still wraps.

## Saving and undo

What goes through Save and Undo, and where an edit lands when the board shows a state or a variant.

### One history, saved together (PAR-164)

Every change people or agents make goes into one history per project, and stays unsaved until Save (Ctrl+S), as
decisions.md's "Saving is explicit" sets out.

- **What's undoable:** every edit to a design or a text note, the modes, and token values. An agent's call is one step,
  its designs, modes and tokens together, and undoing it leaves edits made while it ran. What a board shows (the state,
  Show every state, the modes beside it, the variant picked in its title bar) isn't undoable, and Undo leaves it as it
  is, but it's saved in the `.par`, so changing it marks the file unsaved.
- **What Save writes:** each `.par` with changes, and the token values into the project's stylesheet (`src/index.css` in
  the example), together. A token edit shows in every frame at once, since the stylesheet every frame shares is edited
  in place, but nothing is written until Save. Don't save, when closing a tab or quitting, leaves the stylesheet as it
  was. With Save automatically on, token values are written about 300ms after the edit, as files are.
- **Undo after a save** puts the value back on the canvas, and the next Save writes the value the stylesheet had before.
  A value given to a theme that had none (a dark `--radius`), saved and then undone, is taken out of the stylesheet
  again by the next Save (PAR-420), from every block of that theme that declares it, and a block left empty goes with
  it, so a value Save added in a new `.dark` leaves the file as it was. Frames drawn offscreen stop drawing it once it's
  undone, without a reopen.
- **Clean again.** A file is clean whenever it's back to what was saved: by undoing, as before, and now also by changing
  it back. Turning Show every state on and off again, or showing another state and then the base one, leaves the file
  clean, also when the file wrote its view out in full (`"allStates": false`, the base state's id). A view is kept tidy:
  what it says by default (every state off, no modes beside, the base state) isn't written.
- **A failed write** to the stylesheet says where: the save notice and the status bar say which token and which file
  ("Couldn't write --primary to src/index.css: EPERM…"), the Tokens panel shows the same at its top with Try again, and
  the row of each token not written says "Not written to the stylesheet". The values stay on the canvas, unsaved. A
  stylesheet changed since its values were read fails the same way, writing nothing.
- **An agent's call lands over what's here now** (PAR-278): only the designs it changed, created or deleted are applied,
  so the person's edits to other designs, in the same file too, and another agent's call stay. Each design the call
  changes or deletes must still be as the call read it; one already as the call left it, changed the same way or deleted
  here too, counts as applied. A design the call created conflicts when one with its id was added here, and modes the
  call set conflict when they changed here since. Any conflict refuses the whole call: nothing changes, not its other
  designs or its tokens either, and the agent is told which designs, or that the modes, conflicted.
- **The token editor** says this before anything changes: "Every preview shows it at once. Saving the project writes it
  to src/index.css, and Undo takes it back." Its button is Apply.
- **A theme's value goes where the stylesheet keeps it** (PAR-468): the preview and the save find a theme's blocks by
  the rules the Tokens tab read it with (`themeOfSelector` in `packages/tokens/src/policy.ts`), so `dark` is `.dark`,
  `[data-theme="dark"]` or `html.dark` alike. Every block that declares the token gets the new value, so a later
  `[data-theme="dark"]` can't win back over an edited `.dark` after a save; a value the theme lacks goes into its first
  block, else a new `.dark`. A `:root` inside `@media`, such as a `prefers-color-scheme` block, isn't the default, so
  editing the default never changes it.
- **A frame shows a theme set by attribute** (PAR-22): a mode whose class names a theme the stylesheet switches on with
  an attribute, such as the default Dark option's `dark` with `[data-theme="dark"]`, sets that attribute on the frame's
  body too (`themeAttributes` and `frameAttributes` in `packages/tokens/src/policy.ts`, used by
  `apps/desktop/src/renderer/ModeView.tsx` and `render.ts`). An attribute the mode sets itself wins. An attribute on the
  root (`:root[data-theme="dark"]`) still never applies in a frame, as the frame's root is its shadow host.

Code: the history, what's unsaved and the save state are `packages/editor/src/history.ts` in `@parity-app/editor`
(`recordChange`, `undoChange`, `redoChange`, `reloadFile`, `unsavedPaths`, `fileWrite`, `writeSucceeded` and
`writeFailed`, and `adoptSaved`, which takes a file changed back to what's saved as saved), and the changes made to
designs and notes are `design-changes.ts` there. `apps/desktop/src/renderer/design-store.ts` holds the history for the
canvas and panels: it writes the files and the stylesheet the history says to, with the timers for saving automatically,
and its `changeTokens`, `writeTokensWith`, `getTokenFailure`, `applyAgentChanges` taking tokens (through
`mergeAgentChanges` in `design-changes.ts`) and `updateView` tidying the view call the package. Token values as data are
the package's `token-edits.ts` (`withTokenEdits`, which keeps the value each token had before its first edit,
`tokenDifferences`, `tokenWrites`, `tokensWithEdits`); comparing files with views tidied is its `document-equality.ts`.
`tokens-store.ts` previews the history's token values in the shared stylesheet after each edit, undo or redo, and gives
the design store its writer; `workspace.ts` makes one per guest, so a guest loaded again shows the unsaved values too.
The agent's call is `agent/handlers.ts` (`apply`), the panel `chrome/TokensPanel.tsx`. Saving writes the values into the
stylesheet with `writeTokenChanges` in `packages/tokens/src/stylesheet.ts`, which `saveTokens` in
`apps/desktop/src/utility/projects.ts` applies as a project edit. A `TokenWrite` without a value is a value taken out,
which `writeTokenChanges` hands to `removeCustomProperty` there.

Tests:

- `packages/editor/src/history.test.ts` (46 with the gestures below): undo and redo with their labels; each change
  without a gesture a step of its own; the 200-step limit; what a board shows left alone by Undo and not recorded; token
  edits undone, redone and saved; nothing to write when they're back at the stylesheet's value; the stylesheet's value
  written back after undoing past a save; a dark `--radius` saved, undone and saved again, through the real writer,
  leaving the stylesheet as it was and no override for offscreen frames once undone ("take a value a theme didn't have
  out of the stylesheet", PAR-420); a failed write naming the token and the file and clearing on success; several tokens
  failing together; Save starting again after a failed write was undone back to the file being saved; an agent's call as
  one step; undoing a merged call back to just before it, keeping an edit made during it; the modes a call set undone
  with its designs; Show every state off again leaving the file clean; another state and back from a file with its view
  written out in full; a file that differs in more than its view staying unsaved until undone; and files changed on disk
  taken as saved, unless they have unsaved changes; and no token override left once an edit is undone (PAR-465).
- `packages/editor/src/design-changes.test.ts` (14): changing, moving, adding and deleting designs, and notes; merging
  an agent's call: two calls changing different designs in one file both kept, the person's edit to another design kept,
  a design changed on both sides refused by name with nothing applied, tokens included ("refuses a design changed by
  both"); changing a deleted design, or creating one under an id added here, refused ("refuses changing a design the
  person deleted"); designs the person deleted or added left so; files created for new designs; a change or deletion
  already made here taken as applied ("takes a change already made the same way"); and modes set only while unchanged,
  refused otherwise ("sets the modes only while they're as the call read them").
- `packages/agent/src/run.test.ts` (2 of its 29): a call gives each design it changed, created or deleted with the
  design as it read it, and no others; a refused call fails naming the design, keeps its snippet, and runs again by
  `editId`.
- `apps/desktop/src/renderer/design-store.test.ts` (12 of its 21): Save writing the files and the stylesheet, saving
  automatically a moment later, a failed save thrown and cleared, a reload cancelling a save waiting to happen, library
  designs never written, and a dark `--radius` undone after a save written to the stylesheet without a value.
- `packages/tokens/src/stylesheet.test.ts` (15 of its 18): taking a value out (PAR-420): one added to an existing block
  taken out again, leaving the stylesheet as it was; a block left empty taken out with it, a new `.dark` or `@theme`
  block leaving the file as it was, between other rules and on one line too; every block of the theme losing the
  declaration and keeping the rest; and a longer name, a nested block and a `:root` inside a media query left alone,
  with nothing to take out leaving the file as it is. Writing: a value replaced in place, keeping comments and
  formatting; a theme's own declaration; a missing one added at the block's indentation, or in a new block; no match on
  a prefix or a nested block; a semantic token written to the root and a theme's value to its class; a theme scale token
  to the `@theme` block that declares it, else a new one; a token the stylesheet doesn't declare added to the root; a
  theme written to its `[data-theme="dark"]` block ("by attribute as much as by class"); a `:root` inside a media query
  left alone; and both `.dark` and `[data-theme="dark"]` written, read back as the new value ("writes every block").
- `apps/desktop/src/renderer/guest.test.ts` (3 of its 6), in Chrome: `previewToken` editing a theme by class and by
  attribute, adding a value a theme lacks with the selector it already uses, and leaving a `prefers-color-scheme` block
  alone when previewing the default.
- `packages/tokens/src/policy.test.ts` and `packages/libgen/src/tokens.test.ts`: which selector is which theme, and the
  same CSS read alike by libgen and the app; and the attributes a frame gets for an attribute theme (PAR-22, 5 tests:
  vite7-js's `[data-theme='dark']`, an attribute beside a class, none for a class theme, the light theme, the root, a
  conditional rule or a component's own attribute, and a mode's own attribute winning).
- `packages/editor/src/token-edits.test.ts` (6): the first edit's original kept, what Save writes, a theme value that
  wasn't there written without a value once it's undone, the token list with edits, and the overrides offscreen frames
  get (PAR-465).
- `apps/desktop/src/renderer/tokens-store.test.ts` (3), in Chrome: an edit previewed in the stylesheet in both themes,
  undo and redo taking it back and forth, Save writing it; a theme value taken out again on undo, with no preview left
  for frames drawn elsewhere; and a guest loaded again showing, then saving, an unsaved edit.
- `chrome/TokensPanel.stories.tsx`: ReferenceToAnotherToken (an edit is one undo step, unsaved) and SaveFails (the
  panel's message and the marked row), both played in Storybook on 2026-10-29.

Taking a value out was checked in an isolated copy of the app on a copy of the example project on 2026-11-04: a dark
`--radius` set with `SetTokens` from `parity exec`, saved with Ctrl+S, undone with Ctrl+Z (`parity status` then named
`radius dark` unsaved) and saved again left `src/index.css` byte for byte as it was. Gap: frames drawn offscreen are
right when the render window loaded the guest before the first save, as it does when the canvas opens zoomed out to
bitmaps. A render window that first loads the guest after a save starts from the saved CSS, while the overrides are
still worked out against the CSS the canvas loaded, so an edit undone back past that save, a value taken out or put
back, shows the saved value there until the project reopens.

### One undo step per gesture (PAR-441)

A gesture is one undo step, however long it takes and however many changes it makes: a design or note dragged by its
board, a layer drag, a resize handle, a scrub of a field's label, and a run of arrow presses, on the canvas or in a
field. Time plays no part, so a slow drag with long pauses is still one step, and two quick edits are two.

- **How a gesture says so.** Its source begins a gesture when it starts, passes it with each change it makes, and ends
  it when it's over. The changes join one step while it's the latest, labelled by the first of them (Undo resize layer).
- **Where each begins and ends.** A resize, a layer drag and a design dragged by its title begin their gesture as the
  press becomes a drag, 4 pixels from where it was pressed, and end it however the drag ends, as "Cursors and Escape
  during a gesture" sets out (PAR-568). A resize writes as it moves, and Escape takes it all back. A layer drag in a
  layout writes on the drop; an absolutely placed layer writes as it moves, and Escape takes that back too, as do the
  pointer cancelled and the window losing focus. Dragged by its title, a design writes once, when the drag ends. A
  design or note dragged by its board is tldraw's translate, from its first move until tldraw stops translating. A scrub
  runs from the press on the label to the release. A run of arrow presses on the canvas lasts while the same layers,
  designs or note stay selected, in whatever order, and nothing else changes: another edit, an undo or a redo, or
  selecting something else, also back to what it was, ends it. In a field, typing, Enter, Escape, leaving the field,
  scrubbing it or another selection ends a run of Up and Down. Both kinds of run are a `GestureRun`, keyed by the
  selection's `selectionKey`, so a press on another selection starts a run of its own.
- **Gestures that change nothing.** A gesture that changes nothing adds no step, and one that comes back where it began,
  such as a drag back to its start or a nudge there and back, leaves none, with the file clean again and Redo as it was
  before the gesture.
- **Changes from elsewhere.** An agent's call or a file reloaded during a gesture is a step of its own, so the gesture's
  changes after it make a second step. The agent's work stays out of the gesture's undo.

Code: `packages/editor/src/history.ts` (`recordChange` with the `gesture` option, `endGesture`, and `checkpoint` and
`revertTo` by gesture) and `apps/desktop/src/renderer/design-store.ts` (`beginGesture`, `endGesture`). The canvas's
drags and runs begin and end theirs through `canvas/gesture.ts`: `followPress` for resize handles
(`canvas/CanvasOverlay.tsx`), layer drags (`canvas/layer-drag.ts`) and title drags (`canvas/ContainerShapeUtil.tsx`),
and `GestureRun` for runs, in `canvas/nudge.ts` (`runGesture`) and `chrome/fields.tsx` (`NumberField`'s runs and
scrubs), whose gesture reaches the store through `StyleSections.tsx`'s `fieldEdits`, `LayerPanel.tsx`, `MultiPanel.tsx`
and `PropsSection.tsx`. tldraw's translate is `canvas/CanvasEditor.tsx`'s.

Tests:

- `packages/editor/src/history.test.ts` (10 of its 46), without Electron: a drag, a resize, a scrub and a run of arrow
  presses, each with five-second pauses between its changes, as one step labelled by its first change, undone to where
  it began with the file clean, and redone; a gesture that changes nothing adding no step; one that comes back where it
  began leaving none, and going on from there starting its step again; one that comes back keeping what Redo had, which
  a gesture ended elsewhere doesn't; another change, an undo or the gesture's end ending its step; two gestures' changes
  kept apart; and a file reloaded mid-gesture as a step of its own, between the gesture's.
- `apps/desktop/src/renderer/design-store.test.ts` (2 of its 21): a gesture's changes five seconds apart as one step
  until it ends, and each gesture its own id; and a live drag written as an absolutely placed layer's is, taking a side
  back to the checkpoint mid-drag, as one step, and as none once Escape reverts it. Its checkpoint tests are under
  "Resize handles".
- `apps/desktop/src/renderer/canvas/gesture.test.ts`, without Electron: for each of the canvas's five drags, Escape
  leaving nothing to undo, the window losing focus ending it as its policy says, and the release keeping it as one step
  (under "Cursors and Escape during a gesture"); and a run, one gesture for presses on one selection, another for a
  press on another, ended as the selection changes and going on while the same one is selected again, following the
  selection only while it lasts.
- `apps/desktop/src/renderer/canvas/nudge.test.ts` and `chrome/fields.test.ts`: the runs and the scrub, under "Nudging"
  and "Typing, stepping and scrubbing".
- End to end, each pausing longer than the one-second window the history used to group by: `moving.e2e.ts`, New project
  resized with a pause of a second and a half, then one undo; `keyboard.e2e.ts`, two arrow presses a second and a half
  apart, then one undo; `fields.e2e.ts`, Up, Shift+Up and Down more than a second apart, then one undo; and
  `selecting.e2e.ts`, Sign in dragged by its board with a pause, then one undo.

Gaps: a layer drag in a layout and a title drag write once, on release, and have no slow test of their own; the live
drag of an absolutely placed layer is tested through the store, not end to end with a pause. A frame's own handles and a
note dragged by tldraw go through the same code as a resize and a board, without tests of their own. Escape during
tldraw's drag of a board isn't covered.

### Edits in the state and variant shown (PAR-164)

The inspector's Editing control says where edits go: in the base state ("Editing Monthly changes every state") they
change the design; in another state, or with a variant other than the default shown on a component's board, they're kept
as that state's or variant's changes ("changes only this state", "changes only the Large variant").

- **Edits start from what the board shows.** The inspector, the text editor and Hide read a layer as the board draws it
  in the state being edited: with the variant shown, the state's changes, and the params it binds. The text editor opens
  on the state's text: in Pricing's Yearly state, the Pro plan's price opens as $19, not Monthly's $24. Hide or show
  (Ctrl+Shift+H, or Hide in and Show in on a row in Layers) hides what the state shows and shows what it hides, so a
  layer the state, the variant or a param hides counts as hidden, and Layers marks it so. The canvas menu's Hide says
  Show by the same reading (`hiddenOnBoard`, PAR-486), so it never offers to hide a layer the variant already hides.
- **Hide in and Show in name where the change lands** (PAR-497). In the base state, with a variant option other than the
  default shown, the change goes to that option, so the row's menu names it: Show in Compact, not Show in Default. In
  any other state the state takes it, and the menu names the state. Core's `editTargetName` gives the name, which the
  note above edits that always change the design uses too.
- **Operations read what the frame shows** (PAR-464). Align, Wrap, resizing, nudging, dragging, Copy, Copy style, Paste
  style, Paste over, Paste to replace, Paste here and Select matching read a layer through core's evaluation, as
  `@parity-app/editor`'s `shownNode` and `boardReader` give it: the state being edited, the variant options the board
  shows, each bound param's value, and the responsive patches of the frame the layer was picked in, when one is known.
  Where they write doesn't change: an edit still lands in the state, or the variant, the Editing control names. The
  inspector reads the board without a viewport, as the text editor and Hide do, since its edits change the design or the
  state rather than a viewport's patch. The app's wiring, which frame's viewport each command passes, has no automated
  test.
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
- **Clearing a prop in a state turns it off there** (PAR-421). A switch turned back to its default, a text emptied or an
  attribute removed takes the prop away in the state being edited, so a prop the base design turns on can be off in one
  state: Sign in's button, disabled in the base, enabled in Wrong password. The field is marked as changed, an attribute
  taken away stays listed, and Reset takes the state's change back. An instance's param cleared in a state goes back to
  its default there. In the base state, clearing removes the prop from the design, as before.

Code: in `packages/core`, `edit.ts` (`propChange`, how the inspector sets and clears a prop; `nodeOnBoard`,
`hiddenOnBoard`, `toggleHidden`, `editTargetName`, `editNode` keeping the bound param's default in step and a state's
patch against the board) and `render.ts` (`boardArgs`, which `resolveDesign` gives a board, and `paramDefaults`, shared
with instances); `instances.ts` (`layerOnBoard`, for one of a design's own layers or one inside an instance).
`packages/editor/src/shown.ts` (`shownNode`, `boardReader`) builds the context an operation reads with, and
`canvas/view.ts`'s `frameViewport` gives the viewport of the frame a layer was picked in. In the app,
`canvas/TextEditor.tsx`, `chrome/arrange.ts` (`toggleHiddenLayers`), `chrome/LayerTree.tsx` (the row's hidden mark and
its Hide in menu item), `chrome/LayerPanel.tsx` (the layer as the board shows it, `BaseDesignNote` in the Image and
Instance sections), `chrome/edit-scope.ts` (`baseDesignNote`, the note's words), `chrome/prop-values.ts` (`valueKind`,
`readValue`) and `chrome/fields.tsx` (`ValueInput`), used by `PropsSection.tsx`, `LayerPanel.tsx`'s instance params and
`ComponentsSection.tsx`'s defaults.

Tests:

- `packages/core/src/instances.test.ts` (7): the Stat card's board showing one trend icon as its instances do; a bound
  text's default on the board, and an edit to it changing the default; a param without a default left to the layer's own
  value; the board's layer in a state, inside an instance and with a variant shown; and hiding through a bound param, in
  a state the param hides, and through the state's and the variant's changes. The five about the board and Hide fail
  against the code before PAR-164.
- `packages/core/src/instances.test.ts`, "names where Show and Hide land" (PAR-497): the variant option shown in the
  base state, another state over the variant, and the base state with the default option shown.
- `chrome/LayerTree.stories.tsx`, HiddenByAVariant (PAR-497): Plan card's Compact option hides Feature 4, and its row's
  menu offers Show in Compact.
- `packages/editor/src/shown.test.ts` (7): `shownNode` and `boardReader` agree with each other for every layer in each
  of the shared fixture's cases, in every viewport; a bound text's default, the variant shown and a viewport's patches;
  and a layer inside an instance by its path, with the library. The operations' own tests are under their sections.
- `apps/desktop/src/renderer/chrome/edit-scope.test.ts` (3): no note in the base state, the state's name, the variant's.
- `apps/desktop/src/renderer/chrome/prop-values.test.ts` (4): fields by declared type before there's a value, by the
  value's own type, JSON refused rather than kept as text, and any value read as JSON or text.
- `chrome/LayerPanel.stories.tsx`, InstanceChangedInAState: the note above the Pro plan's state, Swap and Detach in
  Yearly.
- `packages/core/src/edit.test.ts`, "clearing a prop, as the inspector does" (2, PAR-421): a prop the design turns on,
  cleared in one state, off there and still on in the design, and Reset taking it back; and clearing in the base state
  removing it, with a value set as before.
- `chrome/LayerPanel.stories.tsx`, TurningAPropOffInAState (PAR-421): Sign in's button disabled in the base, its
  `disabled` switch turned off in Wrong password, then Reset, which turns it back on and leaves nothing to reset.

Gaps: the wiring has no automated DOM test (the text editor reading `layerOnBoard`, the notes in the inspector, the
typed fields) beyond the stories above, whose play functions run only in Storybook. All of it, and the history above,
was checked in an isolated copy of the app on a copy of the example project on 2026-10-29: `--primary` edited in the
Tokens panel showed in the frames with the file untouched, Ctrl+Z and Ctrl+Shift+Z took it back and forth, and Ctrl+S
wrote it to `src/index.css`; with the stylesheet read-only, Save failed with the token and file named in the notice, the
status bar and the Tokens panel, and Try again wrote it once it could; an edit closed with Don't save left the
stylesheet as it was; `SetTokens` from `parity exec` was one unsaved step that Undo took back; Show every state on and
off left Pricing clean; the Stat card showed one trend icon, and Ctrl+Shift+H on Falling showed it and turned
`showFalling`'s default on; the text editor opened on $19 in Yearly and $24 in Monthly; the notes showed in Yearly and
not in Monthly; and 12 typed in a number param with no default gave the number 12. Known limits:

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
  z-indexes, border widths and the like. A token's kind comes from `previewKind` in `@parity-app/tokens`: its category,
  its name whatever its case or separators, its value, and the DTCG type a `.lib.par` gives it.
- **Values are what the token comes to.** A reference is followed to the value at the end, through `calc()` too, in each
  theme (`--radius-lg: calc(var(--radius) + 4px)` draws at 14px), and a step of the spacing scale is the scale times its
  factor. The project's custom properties are never set on Parity's own elements, since shadcn's names are Parity's too.
- **Spacing keeps the usual box.** A bar is drawn at its true size up to 16 pixels short of its box. Past that, a longer
  one is drawn true to there and the rest squeezed, hatched, into those last pixels, on a log scale up to 384 pixels, so
  a squeezed bar never passes for its true size and a longer length still ends further along; the pixels beside the name
  say how long it is. The detail draws the scale the same way with more room, so most steps are at their true size.
- **Every list of tokens shares one order** (`orderTokens` in `packages/tokens/src/token-order.ts`): the Tokens panel,
  the inspector's token pickers and the spacing picker all list from `TokenStore.inOrder`, and none sorts on its own, so
  they can't fall out of step (PAR-440). The store reads each token the way the panel draws it (`inTokenOrder` in
  `token-values.ts`): its kind from the DTCG type a `.lib.par` gives it, and its value as what it comes to, references
  and spacing steps filled in. A value of `none` counts as nothing, so it comes first. A length plain parsing can't
  read, such as `calc()`, is measured by the browser, in a shadow's layers too.
- **Each measured kind lists smallest first:** font weights from thin to black, font sizes from `text-xs` up, shadows by
  how far they reach past their box (for the furthest layer, the offset plus the blur and spread, read from the value
  rather than a size name), then spacing, radii, letter spacing, line heights, border widths, blurs, opacities,
  durations, layers, breakpoints, containers, perspective and aspect ratios by value, and animations by their duration.
  A value that is a duration is a duration whatever its name, so tw-animate-css's `animation-delay-75` lists with the
  durations. Tokens of the same value, and the kinds with no one order (colors, fonts, easings, cursors), go by name the
  way people count: numbers by value (`chart-2` before `chart-10`) and size words smallest first (`2xs`, `xs`, `sm`,
  `md`, `lg`, `xl`, `2xl`, and Fluent's `XXS` to `XXL` and `Small` to `XLarge`). A size word comes before any other word
  in the same place (`text-lg` before `text-normal`), so the order never runs in a circle. A value that can't be
  measured goes after the rest, by name the same way.
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
- **Folding.** Each section's title folds it, and again opens it; a folded section keeps its title and count. Starting
  or clearing a search unfolds every section, so nothing that matches is hidden.
- **Copying.** A click on a row or tile copies the token's name (`radius-md`), which Parity's fields take, and the row
  says Copied where its value was, for a moment, so the name never gives up room for a button. A detail a hover opened
  stays open through the click. Ctrl+C (Cmd+C on a Mac) on a row or tile does the same. A palette shade's tooltip is its
  name, and a click copies it, with a "Copied" bubble, as there's little else to do with one of 242.
- **Editing.** Resting the pointer on a row or tile opens the token's detail (below), as a component's card opens, and
  the right arrow opens it from the keyboard, or moves the keyboard into one a hover opened, past a disabled Edit. Edit
  in the detail changes the token. A palette shade is edited from a search: while searching, the palette's matches list
  as rows.
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
(`panelItems`, the virtualized list, `TokenRow`, `TokenTileButton`, `PaletteShade`, `TokenEditor`); what a token comes
to and the order built from it are `token-values.ts` (`comesTo`, `inTokenOrder`); lengths the browser measures are
`lengths.ts` (`px`); the copy parts are `chrome/Copy.tsx`; the keyframes and the shared order are `tokens-store.ts`
(`keyframesNamed`, `TokenStore.keyframes`, `TokenStore.inOrder`, `useTokenList`); a token's kind, the Copy as forms and
the value helpers are `packages/tokens/src/kinds.ts`, and matching the tokens a `.lib.par` describes to the stylesheet's
custom properties is `matchDescribed` in `packages/tokens/src/matching.ts`; the order itself is
`packages/tokens/src/token-order.ts` (`orderTokens`, `scaleValue`, `shadowReach`, `compareNames`). The Storybook
explorations under `explorations/previews` draw with the same module, from sample tokens.

Tests:

- `packages/tokens/src/kinds.test.ts` (12): kinds over Tailwind's theme, a project's own tokens, and the Chakra, Fluent
  and Mantine registries, where no Chakra or Fluent token is left a bare number; Copy as forms; brackets and quotes left
  open; references listed and filled in; values split at their top-level commas.
- `packages/tokens/src/matching.test.ts` (2): a described token matched by the custom property its extension names, else
  by its path, with or without its first group, and the ones that match none.
- `packages/tokens/src/token-order.test.ts` (13, PAR-440): a picker's containers smallest first, as the panel lists
  them; `none` first; what can't be measured after the rest, a value still holding a `var()` anywhere too, and an empty
  one of any kind; names by number and by size word, in Tailwind's and both of Fluent's forms; a size word before
  `normal`, the same in every starting order, which was a circle before; ties by name; animations by duration; shadows
  by reach, Tailwind's and Fluent's, and a `calc()` layer read by the measurer it's given, with `var()` never handed to
  it.
- `apps/desktop/src/renderer/token-values.test.ts` (3, PAR-440): the shared order takes a token's kind from its
  `.lib.par` DTCG type (shadows with no category list by reach only with it), and its value as what it comes to, through
  a reference and a derived spacing step; a value still holding a `var()` lists after the rest, never measured.
- `chrome/token-previews.test.ts` (4): a spacing bar's true and squeezed lengths.
- `apps/desktop/src/renderer/tokens-store.test.ts` (1 of its 4), in Chrome: an animation's keyframes read from a
  stylesheet, inside `@layer` too, with each step's timing function as its easing.
- `chrome/TokensPanel.stories.tsx`: AllTokens (no animation running with nothing hovered), FoldedSections (a title folds
  its section, a search unfolds it), Tiles, Copying (a click on the row, keeping a hovered detail open, Ctrl+C, a
  palette shade), DetailFromTheKeyboard (the right arrow in and Escape back, past a spacing step's disabled Edit),
  Motion, EditingAPaletteShade (from a search), InvalidValue, UnclosedBracket (a bracket left open and a missing token,
  refused) and DescribedOnly (the end of the list, drawn once scrolled to). All 29 of the file's stories played in
  Storybook on 2026-10-30. Gap: FoldedSections clears the search with the section already open, so no story folds one
  during a search and then clears it. That clearing unfolds it was checked in the code: the search field's `onChange`
  empties the folded set whenever the search goes from empty to not, or back.
- `explorations/previews/TokenPreviews.stories.tsx`: all 18 played on 2026-10-29, drawing with the app's module.
- `chrome/TokensPanel.stories.tsx` EqualThemes (PAR-435): `chart-3`, equal in Light and Dark, has two swatches in its
  row, its tile and its detail, each named for its theme.
- Swatch edges (PAR-435) were checked by eye on 2026-10-29 in AllTokens, Detail, Tiles and DescribedTokens, dark and
  light: black, white and destructive swatches each with one edge, and the palette's rows rounded at both ends.

Gaps: the previews themselves are checked by eye in Storybook, not by pixels. Opacity, blur and border width are still
filed under Other and Effects as categories, so the inspector's pickers don't offer them by kind yet; the panel's
sections already split them. No test reads a picker's list or the Tokens panel's rows for their order, and `px`'s
browser measuring of `calc()` (`lengths.ts`) has no test of its own: after PAR-440's review fixes these were checked by
reading the code (every list reads `useTokenList`, which returns `TokenStore.inOrder`, and the panel's filters keep that
order) and through the core and `token-values.ts` tests above, not in Storybook or the running app.

### A token's detail (PAR-143)

Resting the pointer on a token's row or tile opens its detail beside the panel (the right arrow opens it from the
keyboard); a click on the row copies the token's name. The detail, top to bottom:

- **A large preview.** A color shows each theme side by side, named. A spacing step is drawn at its true size among up
  to eight of its neighbours on the scale; a duration races the others; an easing is drawn over the rest, faintly; a
  font or size is set in a specimen using “The quick brown fox jumps over the lazy dog.” (PAR-499); a z-index is marked
  in its stack; a breakpoint on a ruler with phone, tablet and laptop widths. Motion plays while the detail is open,
  with a Pause button on the preview; with reduced motion it waits for Play.
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

### Full round beside the radius tokens (PAR-458)

The radius field takes `radius-full` as well as the project's radius tokens. It's Tailwind's `rounded-full`, which
Tailwind writes as `calc(infinity * 1px)` rather than as a theme variable: the corners are as round as the box allows,
so a square of any size is a circle and a wider box is a pill, in every viewport. A frame draws it as
`var(--radius-full, calc(infinity * 1px))`, so a project that declares its own `--radius-full` keeps that value, and one
that doesn't gets no new variable. `GetTokens` (and `parity tokens`, MCP `get_tokens`) lists it after the tokens, as
`{ name: "radius-full", category: "radius", source: "keyword", values: { default: "calc(infinity * 1px)" } }`, unless
the project has a token of that name, which is listed instead. An agent's `radius: "radius-full"`, in a design, a
viewport's patch or a state, gets no "isn't a token" warning; under any other key it's still not a token.

Code: `radiusKeywords` and `radiusCss` in `packages/core/src/render.ts`; `tokensAndKeywords` and `lint` in
`packages/agent/src/workspace.ts`.

Tests: `packages/core/src/render.test.ts` (a 24px and a 384px avatar and a component's root drawn fully round, a
viewport's patch switching to it from `radius-md`); `packages/agent/src/run.test.ts` (2: `GetTokens` listing the keyword
and the design taking it without a warning while a color named `radius-full` is warned about; a project's own
`--radius-full` listed as its token). Gaps: the inspector's radius picker doesn't offer Full yet, and the Tokens panel
doesn't list it; a node an agent rounds this way shows `radius-full` in the field as it would an unknown token.

## Accessibility

How the Accessibility tab checks a design and helps fix what it finds.

### Contrast fixes from the project's tokens (PAR-21)

Each contrast failure in the Accessibility tab suggests the project's color token closest to the text's color that
passes, drawn as a second text sample on the same background with the ratio it reaches ("Use `foreground`, Reaches
18.16:1"). Apply sets it as the layers' `foreground` as one undoable step named "Use foreground", then checks the design
again, since only a check shows the fix worked; the row offers Undo while that's still the last step, and Undo checks
again too. Undo from the keyboard leaves the check out of date instead. When no token passes on that background, the row
says so and has no Apply. `check_accessibility` and `Accessibility()` give agents the same fix on each contrast finding
(`contrast.fix`: the token, its color in that frame and its lowest ratio, or `"none"`), and `parity a11y` prints it as
the style to set.

- **Every frame counts, passing ones too.** The token must pass in every frame the layer's text was measured in,
  including frames where it passes now, so fixing light mode can't break dark. axe-core's passes for `color-contrast`
  give those frames' colors.
- **Closest means least change.** Distance is in OKLab, from the measured text color, added up over the frames. A
  token's own transparency is laid over the background first.
- **The project's own tokens first.** Semantic tokens (`foreground`, `primary`…) are tried before the framework's
  palette, so text that follows a theme still does; the palette is tried only when no semantic token passes.
- **Only where coloring the layer reaches the text.** The frame sets an unused color on the layer's element and sees
  whether the text takes it. Text colored inside a component, by its own classes, or inside an instance gets no fix,
  since setting the layer's color wouldn't change it.
- **Out of date, and checking again.** A check whose design changed since shows an amber warning with Check again, a dot
  on the refresh button, and its findings faded. Checking again keeps the last findings, faded, under "Checking again",
  rather than emptying the panel.

Code: `contrastFix`, `contrastRatio` and `colorDistance` in `packages/tokens/src/contrast.ts`; the frame's readings
(`contrastReadings`, `follows`, `tokenColors`) in `apps/desktop/src/renderer/render.ts`; `addContrastFixes` in
`packages/agent/src/workspace.ts`; `ContrastFixRow`, `ImpactTally` and `DesignCheck` in
`apps/desktop/src/renderer/chrome/AccessibilityPanel.tsx`; `fixLine` in `packages/cli/src/client.ts`.

Tests: `packages/tokens/src/contrast.test.ts` (WCAG ratios, translucent colors, the closest passing token, passing
frames, preferred tokens and the fallback, large text, no token); `packages/agent/src/run.test.ts` ("gives contrast
failures the token that passes in every frame", "gives no contrast fix when coloring the layer wouldn't reach its
text"); `packages/cli/src/client.test.ts` ("gives a contrast failure's fix as the style to set"); and
`chrome/AccessibilityPanel.stories.tsx`: ContrastFix (Apply, the change, checking again), NoPassingToken, OutOfDate,
CheckingAgain, ManyFindings (the tally) and LongNote, all played in Storybook on 2026-11-05. Gaps: the frame's readings
in `render.ts` need the offscreen window, so they have no automated test; a fix sets the base style, so a state that
sets its own `foreground` keeps it.

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
take the namespace; `nextComponentList` in `packages/code/src/component-list.ts`, which keeps it with the list;
`discoverProject` in `packages/project/src/index.ts`, which reads it (`ProjectConfig.namespace`); `libraryId` in
`packages/core/src/library.ts`; the project service in `apps/desktop/src/utility/projects.ts`, which starts the list
with it.

Tests: `packages/code/src/listing.test.ts` (2: ids start with the namespace, including qualified ones and ids libraries
have taken; and they keep it as files change, the checker adds one and the person lists one).
`packages/code/src/component-list.test.ts` (1: what the type checker adds in a library's own project is named by the
library). `packages/project/src/index.test.ts` (1: a library's own components are named by its `id`, else by its
package's name). `packages/core/src/library.test.ts` (1: `libraryId`).

### A library's component designs in the Components panel (PAR-125)

The component designs in a dependency's `.lib.par` canvas show in that library's section of the Components panel, under
"Ready-made components", before its components. Screens on the library's canvas aren't listed; they're the author's own
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
listed the design under Ready-made components and left the screen out.

### Providers a library's parts need (PAR-428, PAR-453)

A provider draws nothing of its own, but the parts inside it throw without it: Nova's `Sidebar` and its parts need
`SidebarProvider`. The library's file marks such a provider `visual: false`, and it stays one of the project's
components, so designs and agents can put the parts inside it. Only the Components panel and the insert picker's
browsing leave it out; a search by its name finds it.

- **Agents** see it in `Components()` and `parity components`, and compose with it like any component: a
  `nova/SidebarProvider` node with the sidebar in its `children` slot, or `Props()`'s `composition` example (PAR-454),
  which places a part inside its parents. A part placed without it shows in `Problems` as a render error that names the
  provider.
- **Inserting a part** from the panel puts it inside its parents, the provider included, with the provider's sample.

Code: `findLibraries` in `packages/project/src/libraries.ts`, which keeps a `visual: false` component with its `parents`
and `sample`; `componentSources` in `apps/desktop/src/renderer/chrome/AssetsPanel.tsx`, which leaves it out of the
panel.

Tests: `packages/libgen/src/nova-sidebar.test.ts` (3: the shadcn example's Nova lists `SidebarProvider` as a part that
draws nothing and the sidebar's parent; a `Sidebar` alone throws naming the provider; the provider's sample from the
registry draws the sidebar). `packages/project/src/library-files.test.ts` (1: a part marked `visual: false` stays
listed). Composing a Nova sidebar inside its provider through `parity exec` was checked in the running app on
2026-11-04: `Problems` found nothing, and the same sidebar without the provider reported the provider's error.

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

Code: `insertIntoDesign` in `packages/editor/src/insert.ts` (an `instance` item with `detached`), applied by
`insertItem` in `apps/desktop/src/renderer/canvas/insert.ts`; the library rows' menu in `AssetsPanel.tsx`;
`InstanceSection` in `apps/desktop/src/renderer/chrome/LayerPanel.tsx`.

Tests: `packages/core/src/library.test.ts` (1: a library design placed in an app draws its components and params,
linked, and the same once detached, with no link left). `packages/editor/src/insert.test.ts` (1: a detached copy placed
as plain layers, keeping the instance's id). Agents' frames, exports and the Accessibility panel draw a library's
instance too: see "Offscreen frames draw what the canvas draws" (PAR-465). Gaps: inserting from the panel and the
Instance section for a library's instance have no automated test. Both were tried in the same copy of the app: a click
placed a linked instance drawing the library's Switch and Button with its param's default, named by the design in the
Layers and Instance sections, and Insert detached copy placed plain layers.

## Zooming far out

What the canvas draws, and what it lets go of, once it's zoomed out far enough for frames to show their bitmaps, or its
tab isn't showing.

### Frames sleep while their bitmaps show (PAR-197)

Once the camera comes to rest zoomed far enough out that frames are drawn no larger than their bitmaps (25% on a 1x
screen), every frame showing its bitmap sleeps: its design's React root is unmounted and the elements it drew are
removed, which is most of what a frame holds. The frame keeps its host element, its size and its bitmap, and its board
keeps its size, so agents' snapshots, hit testing at the frame's edges and the layout around it are unchanged. Zooming
back in, a sleeping frame keeps showing its bitmap until it wakes, then draws its design again at the size it had.

- **What sleeps:** a frame showing its bitmap, once the zoom has settled past the line, so a zoom passing through puts
  nothing to sleep. Not the selected board's frames, which outlines and panels measure, and nothing while interacting. A
  frame whose design doesn't render has no bitmap, so it never sleeps. A capture that fails, as the offscreen window's
  can on a busy machine, isn't kept: the frame tries again 2 seconds later, then at doubling intervals up to 16, so it
  isn't left drawn for good.
- **What wakes:** a sleeping frame wakes once it's no longer to sleep and its board is near the view (within a quarter
  of the view's size, as boards out of view are), one frame each animation frame, in the order they asked. A frame out
  of view stays asleep, still showing its bitmap, until it comes near. Selecting a board wakes its frames at any zoom.
- **A frame whose design changes while it sleeps** (an agent's edit, a token, a reloaded project) wakes wherever it is,
  so its board lays out the new size, and sleeps again once its new bitmap is taken.
- **A frame that hasn't drawn waits on a placeholder (PAR-525).** Zoomed far out, a frame not drawn yet doesn't draw its
  design while its bitmap is to come, whether kept from an earlier session or still to be captured: it shows a plain
  block in the muted color, at its mode's width and its own height, or for a frame that grows with its content, its
  window's height or the height kept with an earlier bitmap. It falls asleep on its bitmap when it comes, at the height
  kept with it, so it never draws on the way. The block is still, since a pulse on every frame would repaint the canvas
  the whole time. A frame on the selected board, zoomed in or while interacting draws at once, and so does one whose
  capture failed or whose design doesn't render, so it shows why.
- **Sizes hold through sleep and waking.** The frame's element keeps the height it had when it fell asleep until it's
  drawn again, and its host skips drawing while it sleeps, as a board out of view does, so the browser keeps the size it
  last had when drawn rather than an empty frame's.
- **What reads a sleeping frame's DOM** finds its host, empty: hit testing finds the frame and its design but no layers,
  as over a frame's background, and an agent's cursor pointing at a layer there points at the frame instead. Anything
  that measures layers does so on the selected board, which never sleeps.

Code: `useAwake` in `apps/desktop/src/renderer/canvas/frame-sleep.ts`; `FrameTile` in `canvas/ContainerView.tsx`, which
decides from its bitmap and passes `asleep` to `ModeView.tsx`, which unmounts the guest and holds the frame's height,
and shows the placeholder, with the `.frame-placeholder` rule in `styles.css`; the board's `near` and `dormant` signals
in `canvas/ContainerShapeUtil.tsx`; `isRestingFar` in `canvas/CanvasEditor.tsx`; the `[data-asleep]` rules in
`styles.css`; `capture` in `canvas/frame-bitmaps.ts`, which drops a failed capture.

Tests: `apps/desktop/e2e/sleeping.e2e.ts` (2: zoomed out, every frame with a bitmap sleeps, the window's DOM nodes fall
by at least the elements the awake frames held, and no board changes size; back at 100% the design's frames draw again
with their layers while boards out of view stay asleep, still at the same sizes; and the selected board's frames wake at
a far zoom, picked in Layers since its title is hidden there, and sleep again once nothing is selected).
`apps/desktop/src/renderer/ModeView.test.ts` (1: a frame put to sleep keeps its host and height with nothing inside, and
draws its design again when it wakes). `apps/desktop/src/renderer/canvas/frame-bitmaps.test.ts` (2: a failed capture
isn't kept, so the next try takes it and that one is kept; a frame that didn't render is kept and not drawn again).
Before it, a capture that failed under load (Electron's `UnknownVizError`) was kept as no bitmap, so that frame never
slept and `sleeping.e2e.ts`, which waits for every frame's bitmap, timed out in the full suite. The retry delays, and
that a frame which leaves the canvas or changes stops retrying, have no test of their own; they were checked by reading
`useFrameBitmap`, and the full suite passed four times under extra load with the fix. `App.settle` in `e2e/app.ts` waits
for a design's board to wake, and `App.show` brings a design into view before finding a layer in it, so the other files'
tests work on frames that slept. Gaps: the order frames wake in, and waking on a changed design, have no test of their
own; the first was checked by reading `wakeNext`, the second by reading `useAwake`. The memory it gives back and the
time waking takes were measured by hand in a debug copy (see [decisions.md](decisions.md), Canvas), not by the suite.

### A hidden tab's frames sleep (PAR-153)

A tab that isn't showing keeps its session, its store and its boards, but 3 seconds after it's hidden every frame
showing its bitmap sleeps, on every board including the selected one: its design's React root is unmounted and its
elements removed, as zoomed far out (see above). Shown again, every frame shows at once, the frames near the view
drawing their design or, until they wake, their bitmap, and frames away from the view keeping their bitmap until they
come near. Frames wake one each animation frame, near the view only, so switching back doesn't remount the whole
project.

- **Sizes hold.** Boards keep the size they had: the tab's shapes aren't touched, and a frame put to sleep while nothing
  is laid out keeps the height it last had when drawn (`contain-intrinsic-size: auto`) instead of recording none. A
  board that has never been drawn, as in a tab restored behind another, has no size to keep, so its frames stay awake
  until the tab is first shown.
- **Agents** read a hidden tab's boards from its shapes, which keep every board's position and size, as before.
- **Not at once.** A tab hidden for less than 3 seconds, as when flipping through tabs, lets go of nothing, so switching
  straight back costs nothing either.
- **What still runs:** a frame whose design changes while its tab is hidden (an agent's edit) wakes, draws offscreen,
  and sleeps again once its new bitmap is taken, as a sleeping frame does anywhere. A frame without a bitmap, whose
  design didn't render, never sleeps.

Measured with `pnpm perf` on `examples/shadcn-vite` (61 designs, 119 frames), every board visited at 100% first and then
`fixtures/vite7-js` opened in a second tab: the hidden tab held 7,898 DOM nodes and 120 MB of heap, against 33,283 and
139 MB before; switching back, every frame showed something within 283 ms (317 ms before, when they were all still
drawn), the 4 frames near the view had woken by 468 ms, and no board changed size.

Code: `isTabHidden` and the `shown` prop of `CanvasEditor` in `apps/desktop/src/renderer/canvas/CanvasEditor.tsx`, which
`ProjectView.tsx` passes the tab's being active; `boardDormant` and `hiddenSleepMs` in `canvas/frame-sleep.ts`, which
the board's `dormant` signal in `canvas/ContainerShapeUtil.tsx` goes by; the height kept in `ModeView.tsx`'s teardown.
`pnpm perf` visits every board at 100% before hiding the tab, and reports `back shown ms` (every frame showing its
design or its bitmap), `back woken ms` and `frames awake`; `PARITY_PERF_UI_PORT` and `PARITY_PERF_DEBUG_PORT` let a
second run go alongside another.

Tests: `apps/desktop/src/renderer/canvas/frame-sleep.test.ts` (4: a shown tab's boards stay awake up close, sleep far
out except the selected one, a hidden tab's boards all sleep at any zoom, and not before they've been drawn).
`ModeView.test.ts` (1, from PAR-197: a frame put to sleep keeps its host and height). Gaps: that the tab's hiding
reaches the boards after 3 seconds, and that sizes hold through it, have no unit test; both were measured by
`pnpm perf`, above, and the hiding was checked by reading `CanvasEditor`. Before, tried 2026-10-29 without sleep:
unmounting a hidden tab's frames cut its DOM nodes 77%, but all 119 remounting took 4 s, and remounting a few a frame
took 7 s with boards changing size. Sleep's waking near the view only, and its held heights, are what this needed.

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
  given again from the same file changes nothing, and its module isn't loaded again. One revision covers the project, so
  a component that moves redraws every frame and retakes every bitmap, one at a time in the background; frames whose
  design doesn't use it draw the same as before. That's rare next to saves, which don't change it. A component's own
  boundary also counts its moves, so one that failed starts over when it comes from a new file rather than keeping its
  error.
- **The offscreen renderer gets the components too.** The bitmap job carries the components the guest was given since it
  loaded, as agents' renders already did, so a frame using one isn't drawn offscreen without it.
- **A component whose source went away is taken back, on both sides** (PAR-487). When the type checker no longer finds a
  component the guest was given, the canvas's guest takes it back (`removeComponents`): one it loaded with is drawn as
  it loaded again, one it was only given is no longer a component, and the revision goes up so frames and bitmaps draw
  again. The offscreen renderer remembers what each guest's last job carried and takes back what a later job drops, so a
  bitmap or an agent's render doesn't keep drawing it from the old file. Before, the offscreen window only ever added.
  Both work out what to give and take back with core's `guestChanges` (PAR-566): the canvas's guest from the list it
  last had, the offscreen renderer's from what each guest's last job carried, so it gives only what changed since. Edits
  to a component's code or CSS don't need a new bitmap key: the guest's dev server runs without HMR, so neither the
  canvas nor the offscreen window picks them up until the project's guest loads again at a new address, which changes
  every key (see decisions.md on PAR-422 and PAR-165).

Code: `useFrameShows` and `useFrameBitmap` in `apps/desktop/src/renderer/canvas/frame-bitmaps.ts`; `FrameTile` in
`canvas/ContainerView.tsx`, which passes `drawn` to `ModeView`'s `shows`; `revision`, `addComponents` and
`removeComponents` in `packages/renderer-react/src/guest.ts`, declared on `Guest` in `packages/core/src/adapters.ts`;
`guestChanges` in `packages/core/src/guest-changes.ts`, which `setSources` in `renderer/workspace.ts` and
`renderer/render.ts` call.

Tests: `packages/renderer-react/src/guest.test.ts` (1: the revision goes up when a component comes from a new file,
moved or added, and not when it's given the same file again or nothing, and subscribers hear each change; 1: taking back
added components forgets one only given, restores one it loaded with, moves the revision once, ignores ids it wasn't
given, and adds one given again). `packages/core/src/guest-changes.test.ts` (6 for `guestChanges`: one new to the list,
one gone, one moved, everything to a guest given nothing yet, nothing when every component stays where it was, and
nothing when only what else the list says about one changes). `apps/desktop/src/renderer/ModeView.test.ts` (2: a
component moved to another file is drawn from there once the frame's `shows` changes, and not while it stays the same;
and one that failed draws from its new file instead of its error). Gaps: that `FrameTile`'s keys follow the revision,
and that the bitmap job carries the added components, have no test of their own; both were checked by reading
`useFrameShows`. That `setSources` and `render.ts` give and take back what `guestChanges` says, and that a job carrying
no components changes nothing, was checked by reading them. A component moving in the running app wasn't tried, since it
means changing the example's files, which other sessions share; `ModeView.test.ts` drives the guest's side of it, from
`addComponents` on.

### Bitmaps kept between sessions (PAR-158)

Frame bitmaps are kept on disk, so a project opened again, or Parity started again, shows its frames' bitmaps once
they're read rather than capturing every one again, one at a time, before frames can sleep. They're kept in Parity's app
data, in `bitmaps`, one folder per project and one lossless WebP per bitmap.

- **A bitmap is named by what it shows:** the project's code as the guest drawing it was loaded, the render job less the
  guest's address, which is new each time a project opens, and where each component the frame draws comes from, whether
  the guest was served it or given it since, as when the type checker finds one (PAR-179). The code is a fingerprint of
  the path, size and modification time of every file in the project and of the lockfiles above it, skipping
  dependencies, build output, dot-folders and designs, with the guest module Parity draws it with and a format number.
  It's taken when each address is first served and kept for that address, since the page never loads a module twice: a
  builder started again on the same port keeps it. Any edit to code, CSS or config gives a new name, so a bitmap of old
  code is never shown for new.
- **Kept as lossless WebP (PAR-535).** The offscreen window captures a PNG, and the project service encodes it again as
  a lossless WebP with sharp's libwebp before keeping it, the same pixels in about 40% less: the example project's 119
  bitmaps came to 569 KB in the app, 4.8 KB each and 21 KB at most, where their PNGs took 908 KB, 7.6 and 33, encoding
  in about 10 ms each, off main's thread. The canvas is given the WebP too, so it reads and decodes the smaller file.
  Component previews are kept the same way. Chromium's own encoder was tried first, being lossless at full quality, but
  wrote files 5% larger than the PNGs. A system where sharp can't load keeps nothing, and captures each session.
- **Each bitmap carries its frame's height** as the canvas drew it, in a `parity:height` text chunk after the image, so
  a frame that hasn't drawn yet can show its kept bitmap at its size (see Opening in seconds). WebP decoders skip it, as
  the format asks them to of a chunk they don't know. The offscreen window lays a frame out at the bitmap's quarter
  zoom, where text rounds to other heights, so its own measure is kept only for a frame the canvas hadn't drawn. A file
  without a height, as versions before PAR-179 kept, isn't shown, and nor are the PNGs kept before PAR-535, which age
  out with the cache.
- **A frame not yet captured this session asks for a kept one first,** and shows it as soon as it's read. Only when
  there's none is it captured, after what's left of the 1-second wait; frames showing the same bitmap share one read,
  and a capture that landed meanwhile wins. Every capture that rendered is kept, written beside its name and renamed so
  a reader never finds half a file. A frame that didn't render isn't kept.
- **Four frames are captured at once (PAR-523),** each in an offscreen window of its own, so each is drawn, measured and
  captured exactly as it was when one window took them one at a time. The canvas asks for as many captures at once as
  there are windows (`offscreenWindows`, in `turns`), so an agent's render or export waits for at most the four under
  way. A window opens only when a job finds the others busy, its first job taking about half a second more to load the
  page and the project's modules, and all close a minute after the last job. A capture takes about 150 ms in its window:
  drawing the frame (the 30 ms wait, components loading on demand, two animation frames), the window made as tall as the
  frame and two more animation frames, then the capture and its PNG.
- **What's kept is cleaned up** when the service starts and after every 50 writes: partial files a write left behind
  over a minute ago, every bitmap of a project none of whose bitmaps was shown in 30 days, and then the least recently
  shown past 200 MB, down to 180 MB. Showing a bitmap counts as using it. **View > Clear bitmap cache**, also in the
  actions search, removes them all; bitmaps on the canvas now are taken again when their frames next change.

Code: `cacheRemovals` in `packages/core/src/bitmap-cache.ts`; `renderQueue` and `offscreenWindows` in
`packages/core/src/preview-order.ts`, and `turns` in `packages/core/src/turns.ts`; `renderOffscreen`,
`ensureRenderWindow` and `closeRenderWindows` in `apps/desktop/src/main/index.ts`; `codeSnapshot` in
`packages/project/src/code-fingerprint.ts`; `apps/desktop/src/utility/bitmap-store.ts`, and `codeServedAt` and the
`fingerprints` kept per address in `utility/projects.ts`, with the components each address served; `drawnComponents` in
`apps/desktop/src/shared/render-job.ts`; `withWebpText`, `webpText` and `webpSize` in `packages/core/src/webp-text.ts`;
`losslessWebp` in `apps/desktop/src/utility/webp.ts`, and the build shipping sharp beside the service
(`apps/desktop/scripts/build.ts`, `electron-builder.yml`); the `frames.capture`, `frames.stored` and
`frames.clearStored` handlers in `utility/index.ts`; `useFrameBitmap` and `stored` in
`apps/desktop/src/renderer/canvas/frame-bitmaps.ts`; `clearBitmapCache` in `renderer/chrome/commands.ts`, in the View
menu (`AppMenu.tsx`) and the actions search (`ActionsSearch.tsx`); `PARITY_BITMAP_DIR`, which main gives the service.

Tests: `packages/core/src/turns.test.ts` (2: no more than the limit run at once, the earliest waiting next, and a failed
task frees its turn and fails for whoever gave it); `renderQueue`'s windows are covered under Component previews.
`packages/core/src/bitmap-cache.test.ts` (6: nothing goes while under the cap, a project unused for 30 days goes whole
and one with a recent bitmap keeps its older ones, the least recently used go past the cap down to what's kept, the age
limit counts before the cap, an old partial file goes and a new one stays, and a partial file doesn't keep its project).
`packages/project/src/code-fingerprint.test.ts` (6: the same for the same files and salt, new with the salt, new for an
edited component, stylesheet or config, and the same with dependencies, build output, dot-folders and designs added).
`apps/desktop/src/utility/bitmap-store.test.ts` (7: a bitmap kept from one address is found from another with its
frame's height, one whose guest was given a component is found from a guest served it and not from one served it from
another file, none for a file without a height, none for other code or another frame, no partial file left behind, an
old project and an old partial file swept, and nothing once cleared). `apps/desktop/src/shared/render-job.test.ts` (2
for `drawnComponents`: the components a tree draws, nested in slots and props, by where they come from, and the same
whether served or given). `packages/core/src/webp-text.test.ts` (5: text kept after the image behind the extended header
a plain WebP needs, with its size and alpha, for lossless and lossy images; replaced under the same keyword and kept
under others; none without it, and what isn't a WebP left alone; and the size read from either header).
`apps/desktop/src/utility/webp.test.ts` (1: the WebP has the PNG's pixels exactly).
`apps/desktop/src/renderer/canvas/frame-bitmaps.test.ts` (4: a kept bitmap stands in for its key, with its height, so no
capture is asked for, frames with the same key share a read, none when none was kept, and a capture taken during the
read wins). Gaps: that a frame waits for the read before its capture, and the fingerprint kept per address, have no test
of their own; both were checked by reading `useFrameBitmap` and `restartBuilder`. Tried in a debug copy on
`examples/shadcn-vite`: the first session kept 119 bitmaps (1.1 MB) for 238 frames; started again, all 238 frames were
shown from disk with no capture, about 2 seconds after the window loaded, the service answering each read in about a
millisecond once it reached it; Clear bitmap cache emptied the folder and showed its toast. Before the fix to wait for
the read, the service answered after the 1-second wait, so every frame was captured again anyway. The four windows were
checked against one in debug copies on fresh profiles: of the 119 bitmaps both kept, 117 were the same file byte for
byte, and 2 differed by at most 6 of 255 in a channel around a card's shadow, which is how they rasterize; a third
differs between two runs with the same number of windows. That captures go to separate windows has no automated test;
the end-to-end suite starts each copy on a fresh profile, so it captures its frames this way.

### Component previews, made offscreen and kept on disk (PAR-207)

Each component has a picture of what inserting it would place, made in the offscreen window and kept on disk with the
frame bitmaps, so no panel mounts a component and a project opened again draws none it already has. The Components panel
shows it in a component's card, opened by resting the pointer on its row as a token's is, beside the row (PAR-515): the
picture on the project's page in a framed box that fits it, then its name, file and, when it fails on the canvas, why.
PAR-208 gives it the List and Grid views and the picker. The card is `ComponentCard` and `ComponentPopover` in
`chrome/ComponentCard.tsx`, with the stories Pictures (six real previews of different shapes), States (waiting, being
drawn, updating and failing), BesideItsRow and Tooltips in `chrome/ComponentCard.stories.tsx`; `AssetEntry` in
`chrome/AssetsPanel.tsx` opens it. Tooltips are raised in the theme's own colors, a step lighter than a popover in the
dark theme, through the variables shadcn's tooltip reads, set in `styles.css`.

- **What's pictured is what inserting places:** the node `nodeForItem` and `withLibraryContext` build for an empty
  layout, with the component's sample and the parents a part needs, its layers numbered in order so the tree is the same
  every time. It's drawn in the project's first mode, inside an element as wide as the component up to 640 pixels with 8
  pixels around it, in a window the mode's width, at twice its size, and cropped to that element. Unsaved token previews
  aren't drawn. A story's args aren't read yet; PAR-209 gives a component sample props, its first story's args first.
- **Two pictures each,** scaled down in the main process to fit 240 by 152 pixels (rows, tiles, the picker) and 608 by
  352 (the card), never larger than drawn. They go in the project's `previews` folder in the bitmap store, named by
  their key, with `index.json` holding each component's latest key and, for one that fails to draw, its error. The
  window shows them as plain `<img>`s from `parity-preview://<project>/<key>-<size>.png`, which main serves from the
  store, so Chromium decodes only what's on screen and the window holds an address per picture, not its data.
- **Keyed by what it depends on** (`previewKey`): the job less where it's drawn from (the tree, the mode, its size, the
  theme, the scale), and the size and time of each file it depends on, as the address the job draws from first served
  them (`codeSnapshot`, which also gives PAR-158's fingerprint). Those files are the components' own files and
  everything they import, followed through relative paths, tsconfig aliases, `index` files and stylesheet `@import`s
  (`importedFiles`, `moduleClosure`); the project's stylesheets and what they import; and the root's package.json,
  tsconfigs, tool configs and every lockfile, which stand for the packages imported (`sharedPreviewFiles`). So an edit
  changes only the keys of components that import what changed, a saved token or a stylesheet changes them all, and the
  same code gives the same keys after a restart. Library parts whose tree is their parent's share its key and picture.
- **Canvas and agents first.** The offscreen windows' jobs are one queue (`renderQueue`): canvas bitmaps and agents'
  renders, then previews of rows on screen, then the rest. Previews are made one at a time, in one window, so with the
  others free a preview never holds up a bitmap or an agent's render (PAR-523). Nothing is made until the tab is the one
  shown, its canvas is up and no frame on it is waiting for its bitmap (`bitmapsWaiting`). Then the window asks for one
  at a time (`nextPreview`): a component whose row is on screen first, whatever the person is doing; the rest only after
  2 seconds with no pointer, key, wheel or drag and no edit, the person's or an agent's, and the pass stops before its
  next one as soon as they work. The offscreen windows' idle close still shuts them a minute after the last job.
- **States:** waiting, being made, made, updating (the last picture, dimmed, with "Updating its preview" until the new
  one is made) and fails to draw (with the error, kept, so the same code isn't drawn again on every open). One the
  offscreen window couldn't finish isn't kept and is tried again after the next lookup. The window looks every preview
  up again, 50 at a time, when the guest, its theme, the components, their props, the modes or the component designs
  change.
- **Kept under PAR-158's cleanup:** previews count toward the same 200 MB and 30 days, showing a picture counts as using
  it, and Clear bitmap cache removes them too.
- **A void element gets no children (PAR-513).** React declares `children` for every element, so a component whose props
  are `ComponentProps<"input">` seemed to take them, and inserting it, on the canvas or for its preview, labelled it
  with its name, which React refuses on an `<input>` (error 137). Props reading (`inferProps`) leaves that `children`
  out for props that go to a void element: ones with an attribute only a void element has (`InputHTMLAttributes`,
  `ImgHTMLAttributes` and the rest) or a ref to one (`HTMLHRElement`, `HTMLBRElement`). A component that declares its
  own `children` keeps them. Library parts already had this from their samples' `children: []`.
- **Sample text ends at a sentence or a word (PAR-513).** Libgen keeps at most 60 characters of an example's text, and
  used to cut there mid-word, so the Accordion's preview read "…You can enable email a". It now ends where the last
  sentence within them ends, else after the last whole word with "…" (`sampleText`), and the registry's files were
  shortened the same way. Since a preview's key covers its tree, both changes give the affected components new keys and
  new pictures without raising `previewFormat`.
- **No cut-off names (PAR-518).** A part that sets its own size, or whose library's samples give it no text, is drawn
  without its name, as it's inserted (see Inserting, Make component and new designs). On `examples/shadcn-vite`, Avatar,
  AvatarGroupCount, CardHeader and Separator, and nova's MarkerIcon, AttachmentAction, AttachmentMedia, AlertAction and
  Separator, no longer show "Avata", "C" or the like; their new trees give them new keys. ItemSeparator and
  SidebarSeparator still do, and nova's Card is still a narrow column (see decisions.md).

Code: `componentPreviewTree` in `packages/editor/src/component-preview.ts`; `renderQueue`, `nextPreview` and `fitInside`
in `packages/core/src/preview-order.ts`; `renderedComponents` in `packages/core/src/render.ts`; `previewKey`,
`resolveModule`, `importedFiles`, `moduleClosure` and `sharedPreviewFiles` in `packages/project/src/preview-key.ts`;
`codeSnapshot` in `packages/project/src/code-fingerprint.ts`; `importSpecifiers` in `packages/code/src/listing.ts`; the
`previews.lookup` and `previews.make` handlers, `apps/desktop/src/utility/previews.ts` and the preview half of
`utility/bitmap-store.ts`; `renderPreview`, `renderOffscreen` and `servePreview` in `apps/desktop/src/main/index.ts`;
`previewJob`, `startPreviews`, `useComponentPreview` and `usePreviewOnScreen` in
`apps/desktop/src/renderer/component-previews.ts`; `ComponentCard` in `renderer/chrome/ComponentCard.tsx` and `AssetRow`
in `chrome/AssetsPanel.tsx`; `bitmapsWaiting` in `renderer/canvas/frame-bitmaps.ts`; `passesToVoidElement` in
`packages/code/src/props.ts`; `sampleText` and `shortenedText` in `packages/libgen/src/sample-text.ts`.

Tests: `packages/core/src/preview-order.test.ts` (5 for `renderQueue`: canvas and agent jobs before previews on screen
and those before the idle pass, one job at a time with one window, one job in each window at once in the lowest free,
one preview at a time with the other windows left to bitmaps, and a failure going to its caller with the next job still
run; 5 for `nextPreview`: nothing until the canvas settles, the first on screen even while the person works, the rest in
order once idle, waiting out the rest of the idle time, and nothing left; 4 for `fitInside`).
`packages/project/src/preview-key.test.ts` (9 for `resolveModule`, 2 for `importedFiles`, 2 for `moduleClosure`, 1 for
`sharedPreviewFiles`, and 6 for `previewKey` on files on disk: the same for the same code and tree, new for a component
importing the changed file and not for one that doesn't, new for every component when a stylesheet or one it imports
changes or when the dependencies do, new with what's drawn, and 40 hex characters).
`packages/project/src/code-fingerprint.test.ts` (1: each file's size and time by path).
`packages/code/src/listing.test.ts` (2 for `importSpecifiers`). `packages/editor/src/component-preview.test.ts` (3: what
inserting places inside the sized element, a part inside its parents, and the same tree every time).
`apps/desktop/src/utility/bitmap-store.test.ts` (6: addresses and size for a kept preview, pictures and index kept
across a restart, none for a key not made, kept in the previews folder with no partial file, swept with an unused
project, and none once cleared). `apps/desktop/src/utility/previews.test.ts` (6, with the project and the offscreen
window standing in: drawn once and not again after a restart with the same code; after an edit, drawn again only for the
component importing what changed, with its last picture meanwhile; a draw failure kept; one that didn't finish tried
again; two asks at once drawing once; and none for code the project hasn't served). `packages/code/src/props.test.ts` (3
for void elements: no `children` for `<input>` attributes or a ref to an `<hr>`, kept for other elements and for a
component's own, and none for shadcn's Input). `packages/libgen/src/sample-text.test.ts` (6: short text whole, a long
one ended at a sentence, at a whole word with "…", not at a too-short first sentence, text without spaces, and text cut
before shortened as the whole would be). `packages/registry/src/index.test.ts` (1: no sample text in the registry cut
mid-word, and nova's Accordion ending its sentence). Gaps: the window's store and scheduler (`component-previews.ts`),
the queue's use in main and the protocol have no test of their own; they were tried in the app.

Tried in a debug copy on `examples/shadcn-vite`, with 587 components: the canvas's 119 bitmaps were taken in 16 seconds
and the first preview was made a second after the last. The idle pass then made 555 previews and kept 13 failures (parts
that need their parent, which PAR-208 and PAR-209 handle) in 77 seconds, about 140 ms each; the other 19 are parts that
share their parent's key. On disk they came to 3.1 MB: thumbnails 1.3 MB (2.3 KB each on average) and large pictures 1.8
MB (3.3 KB on average, the largest 66 KB). The window keeps a key and two addresses per component and decodes a picture
only while it's shown. Started again with nothing changed, none was drawn and Button's hint showed its picture at once.
After an edit to `badge.tsx` and a restart, only Badge was drawn again, its hint showing the old picture dimmed as
updating until then.

### Sharp once the zoom settles (PAR-556)

The layer the camera moves is composited (`will-change: transform`), so panning and zooming move what's already drawn.
Chrome draws such a layer once and only scales it after that, so zooming in from far out left the canvas drawn at the
far zoom: text, edges and the board's own captions blurry, even seconds after the camera stopped. Once the zoom settles
somewhere new, the layer goes without the hint for two animation frames (`data-redrawing`), so it's drawn at its scale,
then composited again from that.

- **Panning is unchanged.** Only a change of zoom redraws, once it has settled, as `--tl-zoom` changes (see "The canvas
  doesn't restyle its elements while the camera moves" in [decisions.md](decisions.md)). During a zoom the layer is
  scaled as before.
- **One redraw at a time.** A zoom settling again while the layer is being drawn again starts the redraw over, and
  closing the canvas ends it.

Code: `redrawLayer` in `apps/desktop/src/renderer/canvas/layer-redraw.ts`, called by `settleZoom` in
`canvas/CanvasEditor.tsx`; the `.tl-html-layer:not([data-redrawing])` rule in `styles.css`.

Tests: `apps/desktop/src/renderer/canvas/layer-redraw.test.ts` (3: the layer is off its own compositing for two frames
and then back on it, a redraw ended early gives the hint back at once with no frame left waiting, and a redraw ended for
a new one runs its two frames again). Gaps: that the layer is drawn sharp is up to Chrome and has no automated test. It
was tried in a debug copy on `examples/shadcn-vite`: zooming in steadily from the whole project to 324% on Button's
board, the board was still blurry 8 seconds after the camera stopped; with the redraw, it was sharp once the zoom
settled. Its cost wasn't timed, as the copy's window was minimized; it's one paint of the layer for each zoom.

### Titles and labels zoomed far out (PAR-151)

A board's labels are its design's title above it, the state labels beside its rows when it shows every state, and the
captions naming each frame's mode. Up close they keep their screen size. Past 40% they shrink with the canvas, so they
stay beside what they label instead of growing over the boards around it.

- **A title is a name, so it stays.** It shrinks to 60% of its screen size and no smaller, and is as wide on screen as
  its board: a long name truncates, and the design's icon is clipped with it, so nothing runs past the board's edge.
- **Detail goes first.** State labels and mode captions shrink as titles do, but fade as they shrink and are gone by
  25%, while titles show at any zoom.
- **Too narrow to read, a label hides.** Once a board is narrower than 24 screen pixels, its title hides, and its state
  labels with it. A caption hides once its frame is that narrow. So at 1% a board 2,400 pixels wide or more keeps its
  title, clipped to its 24 or more pixels, and a narrower one shows none. A narrow component's labels hide this way even
  above 25%, before detail would have faded, so a board's detail never shows once its title has gone. A hidden label
  doesn't take the pointer.

Code: `labelLook` in `packages/editor/src/canvas-labels.ts`, the rule for every label; `useCanvasLabel` in
`apps/desktop/src/renderer/canvas/labels.ts`, which applies it to a label's style as the zoom changes; `TitleBar`,
`StateLabel` and `FrameCaption` in `canvas/ContainerView.tsx`, which pass each the board's or the frame's width.

Tests: `packages/editor/src/canvas-labels.test.ts` (5: every label at screen size up close; names shrinking to 60% and
showing at any zoom while there's room, including a 3,000-pixel board at 1%; detail fading out by 25%; a label hiding
once what it labels is under 24 screen pixels, and showing again closer in; a narrow board's detail hiding with its
title at 30%, where it would otherwise still show). Gaps: applying the look to the DOM (the transform, the width it fits
and the clipped icon) has no automated test. It was checked in Storybook on the example's boards at 100%, 25%, 5% and
1%.

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

### React's production build on request (PAR-519, PAR-550)

`pnpm dev` runs Parity's window on React's development build, with StrictMode's checks, Fast Refresh and React's
warnings, as the daily driver. `pnpm dev:prod`, and the copy `pnpm perf` starts, run it on React's production build,
which is faster. The audit timed, by hand on the example project, selecting a design, committing a field and undo going
from 210 to 360 ms to the next paint to under 90, and opening the Components panel from 1.4 s to 0.14 s.

| `pnpm perf` on the example project              | Development build | Production build |
| ----------------------------------------------- | ----------------- | ---------------- |
| Select a design, median / max                   | 180 / 298 ms      | 71 / 126 ms      |
| Edit a design, median / max                     | 134 / 386 ms      | 47 / 117 ms      |
| Started again, usable (`--open-only`, two runs) | 9.4 and 4.4 s     | 2.7 and 3.0 s    |
| The window's memory                             | 764 MB            | 590 MB           |

On 2026-11-04, on Windows 11 with other sessions using the machine, which the development build's restart times show.
Started again after a full run's measuring, both builds took about 4.7 s.

- **The dev script takes the build as a flag,** `--react production`, which `pnpm dev:prod` passes, and starts the UI's
  Vite server in a mode of its own (`react-production`), which the UI's Vite config reads. No environment variable is
  involved. `pnpm perf` passes the flag too, unless it's run with `--react development`, and records the build in each
  result. Storybook and the end-to-end suite, which don't pass it, run the development build.
- **Dependencies are prebundled as production:** the UI's Vite config sets `process.env.NODE_ENV` to `production` in the
  dependency optimizer (Rolldown's `transform.define`), as builder-vite does for frames (PAR-198). The app's own modules
  are still served as in development, so `import.meta.env.DEV` stays true.
- **The app's JSX calls the production `jsx`:** it's still compiled for development, calling `jsxDEV`, which the
  production build leaves out, so `react/jsx-dev-runtime` is aliased to `scripts/jsx-dev-runtime.ts`, React's `jsx`.
- **Fast Refresh is off,** since it reaches React only through the development build: a change to a component reloads
  the page, as a change to any other module already did.
- **The dev script prints which build it runs.** [decisions.md](decisions.md) has why development is the default.
- **tldraw still draws,** since the window is on localhost, where tldraw needs no licence key.
- **Switching builds rebuilds the prebundle:** Vite keys it by the optimizer's options and the aliases, so the other
  build's is never served.

Code: `reactFlag`, `reactBuild`, `reactProductionMode` and `reactBuildConfig` in `apps/desktop/scripts/react-build.ts`,
used by `apps/desktop/vite.config.ts`, `apps/desktop/scripts/dev.ts` and `apps/desktop/scripts/perf.ts`; `dev:prod` in
both `package.json` files.

Tests: `apps/desktop/scripts/react-build.test.ts` (8: the flag's values, an unknown one rejected, the flag taken out of
the arguments wherever it is, the flag without a value rejected, nothing added for the development build, the production
build's define, alias and Fast Refresh filter, the stand-in being React's `jsx`). Gaps: the window's build is checked by
hand, as the e2e suite runs the development build. On 2026-11-04, in an isolated copy, React's fibers had no development
fields on the production build and had them on the development build, tldraw drew the canvas on both, an edited
component reloaded the page on the production build, and the prebundle's config hash differed between the builds.

## Opening and closing projects

What opening a project loads into the windows, and what closing it gives back.

On first launch the installed app shows Home. Later launches restore the saved project tabs, and Home if that's where
the window was. Development can request an initial project through its runner. `workspace.test.ts` covers these startup
choices (PAR-8, PAR-605).

### The start page: Home and new tabs (PAR-605, PAR-607)

Home is pinned first in the tab strip, an icon that can't be closed, and shows whenever no tab is chosen. Alt+Home or
View > Home goes there, and Ctrl+Tab goes round with Home first. The strip's +, Ctrl+T and File > New tab open a new tab
at the end of the strip. Both are the start page from the explorations (decisions.md, "The start page is built"):

- **Home** has the organization switcher, Search, Open and New project along the top. Below them, the Continue where you
  left off section offers the project opened last, which its picture, Resume or Enter opens, with For you beside it.
  Before any project has opened, the Open a project panel takes its place, with Open a folder and Open a project file.
- **A new tab** has a large Search field, then New project and Open.
- **Both list your projects** as cards under Recent, Starred, Shared with you and All projects, two rows until Show N
  more. A card has the project's picture, its folder's name and when it was last opened; its tooltip is the folder's
  path. Its menu opens it, stars or unstars it, and removes it from Recent. Home's Recent leaves out the project it
  offers to continue.
- **Opening from a new tab uses that tab.** A project already open elsewhere is switched to, and the new tab closes.
- **Search is Ctrl+K,** which lists your projects as well as actions: first on Home and in a new tab, last in a project.
- **A project's picture is its canvas as last saved (PAR-607).** It shows the project's first screens as the canvas drew
  them, each its main frame with the phone frame beside it where its board shows one, each frame the shape of its
  window, or shorter where the frame is. Moving the pointer across a card flips through them, naming each; Home's
  Continue picture names the frames above them, as the canvas does. Up to five screens are pictured: those with a phone
  frame beside them first, then the rest, each in Layers' order; components and frames aren't. A project not opened
  since shows a placeholder, a board and a phone in a color of its own with its initial.
  - **When it's taken:** two seconds after the project opens and after each save, once the canvas has drawn the frames
    and has every bitmap it's waiting for, from those bitmaps; no frame is drawn again for it. A run of saves takes one.
    Edits not saved yet are never pictured: a picture that would show them waits for the next save.
  - **Where it's kept:** in Parity's app data, in `pictures`, one file per project with each frame cut to the top of its
    window, about 70 KB for the example's five screens. Clear bitmap cache leaves them. A project's picture goes when
    the start page stops listing it.
- **Stubs:** For you and Shared with you are empty; New project, New project from this, cloning, Copy link, Invite
  people and New organization show a toast saying they aren't ready yet. New project's toast also offers Open a folder.

Code: `apps/desktop/src/renderer/start/` (`HomePage.tsx`, `NewTabPage.tsx`, `ProjectList.tsx`, `ProjectCard.tsx`,
`StartControls.tsx`, and `projects.ts` for what's listed and how times read); `workspace.ts` keeps Home, new tabs and
each project's notes; `chrome/TabBar.tsx` draws the Home tab and the + button; `chrome/ActionsSearch.tsx` lists the
projects. Pictures: `start/ProjectArt.tsx` draws one, `start/pictures.ts` reads them for the page, and
`start/picture-screens.ts` (`picturedScreens`, `isPhone`) picks the screens and frames; `renderer/project-picture.ts`
(`keepProjectPicture`, started by `ProjectView.tsx`) takes them, from `useFirstRowFrame`, `firstRowFrame` and
`frameBitmap` in `canvas/frame-bitmaps.ts`; the service keeps them in `utility/pictures.ts`, cut by `topOfPicture` in
`utility/webp.ts`, through the `pictures.store`, `pictures.read` and `pictures.keepOnly` handlers in `utility/index.ts`,
in the folder main names as `PARITY_PICTURE_DIR`.

Tests: `start/projects.test.ts` (8: the order recent and starred projects list in, each scope, the times from minutes to
another year, the picture's hue, folder names) and `workspace.test.ts`'s "Home and new tabs" (8, with a project's
picture let go once it isn't listed) and "starting the workspace" (Home on a fresh install, and staying there).
`start/picture-screens.test.ts` (4: screens with a phone frame first, then the rest, in Layers' order; no components or
frames, and no more than the most; no second phone beside a phone; a phone by its device or its width) and
`utility/pictures.test.ts` (6: a picture kept with each frame cut to its window and read back; the latest in place of
the one before; projects with none, or a file that can't be read, left out; a kept frame that isn't an image refused;
the pictures of projects no longer listed let go, and partial files only once old; nothing kept without a folder).
Stories: Parity/Start page (Home, a card flipping through screens, which plays, Home without pictures, the first time,
Starred, Shared with you, a project's menu, New project, Open, a new tab), with the example project's pictures,
Parity/App's On Home, New tab, No project open and Nothing opened yet, and the tab bar's On Home, With new tab and New
tab tooltip. Gaps: no end-to-end test drives Home or a new tab yet; `reopening.e2e.ts` opens the project again with
Home's Resume. Taking a picture, which waits on the canvas, has no test of its own: it was checked in `pnpm dev` on
2026-11-05, where opening the example kept its five screens (72 KB), Home showed Team members with Mobile Light, moving
across its card flipped through Team members, Sign in and Pricing, and Team members' main frame set to Desktop Dark and
saved with Ctrl+S showed dark on the card once taken again; chakra's Home screen, shorter than its window, was drawn as
tall as its content.

### A project with no Parity file opens on a Home screen (PAR-561)

Opening a folder or project that has no `.par` file yet opens on a screen named Home, for the app's `/` route. It draws
the component that renders the app there, live, in the project's primary mode with a phone's mode beside it: Desktop
Light and Mobile Light with the default modes. There's no empty canvas to start from (decisions.md, "The empty-canvas
start is dropped").

- **What renders `/`:** the page for it, by its router's file names (decisions.md, "Pages get their own section in the
  Components panel"): Next's `app/page`, also inside a route group such as `app/(marketing)/page`, or an `index` in a
  `pages` or `routes` folder, a route file's default export over its other parts. Without one, it's the `App` component
  that Vite's and Create React App's templates mount, by its export name or as `App.tsx`'s default export. When there
  are several, the one in the fewest folders wins. A library's component is never it.
- **Without either,** the screen is a padded page headed Home, as New screen starts one.
- **The page fills the screen:** the component sits in the screen's root layout, unpadded, on the theme's background.
- **The mode beside the primary one** is the first mode on a phone, preferring one whose theme and other options match
  the primary mode's, so Mobile Light comes before Mobile Dark beside Desktop Light. Beside a phone's primary mode it's
  a laptop's or desktop's. With no mode on the other kind of device, the screen shows the primary mode alone.
- **Opening writes nothing.** The Home screen opens as if the main project file held it: there's nothing to undo or
  save, and the folder is left as it was. The file is written with the first change, Home screen included. Closed
  without a change, the project opens on a new Home screen next time.
- **Only a project with no project file gets one.** A project whose file couldn't be read gets none, so saving never
  writes over the broken file, and one whose designs were all deleted opens with none.
- **A blank project from the scaffolder (PAR-284) has no project file either,** so it opens on a Home screen the same
  way.

Code: `openingDesigns`, `homeScreen` and `homeComponent` in `packages/editor/src/home.ts` (`@parity-app/editor`), which
`createSession` in `apps/desktop/src/renderer/workspace.ts` calls with what `project.open` gave it. In Storybook, Parity
/ App / Blank project opens on the Home screen. The stories of Layers with nothing in it open `designless`, a project
whose file holds no designs.

Tests: `packages/editor/src/home.test.ts` (14: a Home screen in the main file of a project with none, a project's own
files as they are, and none beside a file that couldn't be read; the screen drawing `App` with Mobile Light beside
Desktop Light, a padded page headed Home with nothing to draw, the phone mode sharing the primary mode's theme, a
laptop's beside a phone's, and the primary mode alone; and what renders `/`: Next's, a `pages` folder's and a `routes`
folder's page over `App`, a route group's, a route file's default export, `App` by export or file and the nearest one,
never a library's, and nothing). Gap: `createSession` calling it has no automated test.

### Opening in seconds (PAR-179)

Started again, Parity shows the example project's canvas, with every frame on its bitmap from last time, about 3.2
seconds after its window starts loading, in a development build, where it took 5.7 to show every frame and 6.6 to have
every bitmap. Reopened in the same window, every frame shows its bitmap at 2.2 seconds, where the bitmaps took 19.

- **Frames start on their bitmaps, kept from last time or captured.** Zoomed far out, a frame that hasn't drawn its
  design yet waits for its bitmap, kept from an earlier session (see Bitmaps kept between sessions) or, since PAR-525,
  captured offscreen, showing a placeholder meanwhile (see Frames sleep while their bitmaps show), and falls asleep on
  it without ever drawing, at the height kept with it, so its board has its size. It draws at once where it wouldn't
  sleep: on the selected board, zoomed in, and while interacting, and when its capture fails. Once it's stopped waiting
  it never waits again, and wakes and draws as any sleeping frame does. Before PAR-179, every frame drew its design
  first, about 2 seconds on the example, only to be taken apart once its bitmap showed, and the kept bitmaps' replies,
  which the service gave in a millisecond each, waited behind that drawing; until PAR-525, a frame with none kept still
  drew, which held a first launch up.
- **A captured bitmap keeps the canvas's height (PAR-525).** A frame that never drew has no height of its own to keep
  with its bitmap, and the offscreen window lays the frame out at the bitmap's quarter zoom, where text rounds to other
  heights. So once the bitmap is captured, the offscreen page lays the frame out again at full size and measures it
  (`canvasHeight`), which is what's kept and what the frame takes when its bitmap shows. Measuring before the capture
  made `capturePage` fail on tall app screens that lay themselves out again as they're resized, so it comes after. A
  frame that has nothing being edited is captured as soon as there's no kept bitmap, without the 1-second wait for edits
  to settle.
- **The canvas opens roughly fitted.** It fits the project as soon as its boards are placed, before they've sized
  themselves, so frames start at the zoom they're shown at, and fits it again once they have, as before. Boards not
  sized yet are small, so one that would fit nearer than where the canvas starts starts there instead, as before.
- **The project opens as Parity starts.** The service keeps which projects are open, in `open-projects.json` in Parity's
  app data, and opens them as it starts, while the window loads its UI; the window's open of the same project joins the
  one under way. One the window doesn't ask for within a minute, as when its tabs and the list disagree, is closed
  again.
- **tldraw's hatched fill is left out.** tldraw draws the pattern its arrows, drawings and geo shapes can be filled with
  as an image for every power of two up to the farthest zoom in over the farthest out, and the canvas's 1% to 800% made
  that 1,024 times: a canvas over 8,000 pixels square for each theme, painted and encoded as a PNG on the window's
  thread each time a canvas mounted, about a second. The canvas draws none of those shapes, so they're given without it.
- **A bitmap kept in a session where the type checker found components is found in the next,** since it's named by where
  the components a frame draws come from (see Bitmaps kept between sessions). Before, every frame missed in the session
  after one where the checker ran, which is the first open after any change to the code.

**What `pnpm perf` times.** Opening is timed three ways on the example project (61 designs, 119 frames): the first
launch, on a fresh profile; closing the tab and opening the project again in the same window; and starting the app again
on the same profile, which restores the tab. A canvas is usable once every frame shows its design, its bitmap or, since
PAR-525, its placeholder, and has its previews once every frame has its bitmap. Launches are timed from the window's
page starting to load, which Electron's own start comes before, by about 0.1 seconds; a reopen from the open.
`--open-only` times just this.

| Opening, usable / previews  | Before (`main` at PAR-441)    | After                         |
| --------------------------- | ----------------------------- | ----------------------------- |
| First launch, fresh profile | 5.9 to 8.6 s / 23.7 to 26.2 s | 4.8 to 5.2 s / 21.4 to 21.5 s |
| Again in the same window    | 2.8 to 2.9 s / 19.3 to 19.4 s | 2.2 s / 2.2 s                 |
| Started again, same profile | 5.7 to 6.0 s / 6.6 to 6.9 s   | 3.2 to 3.3 s / 3.2 to 3.3 s   |

Two runs each, on Windows 11, in development builds, with other sessions using the machine. The audit's 8.6 and 27
seconds were timed by hand before bitmaps were kept on disk (PAR-158); a first launch's previews were then still
captured one at a time, about 21 seconds for 119 frames.

**A first launch's previews (PAR-523).** Captured four at a time (see Bitmaps kept between sessions), a first launch has
every bitmap in 12.0 to 12.6 seconds where it took 29.1 to 29.3 one at a time, measured back to back on the same machine
while other sessions were using it, which made every number slower than the table's: usable came at 6.1 to 6.6 seconds,
where the table has 4.8 to 5.2. The 8-second target isn't met, and the windows aren't what holds it: captures start only
once every frame has drawn its design, which is when the canvas is usable, and from there they take about 5 seconds,
where the four windows could take 119 frames in about 4. The window's own thread is the bound: as each bitmap comes it
puts that frame to sleep, which takes its drawn design apart, about 40 ms a frame, and it asks for the next capture only
once it has handled the last, so the offscreen windows waited 43% of the time. A far frame that shows a skeleton instead
of drawing first (PAR-525) takes away both.

**Placeholders instead of drawing (PAR-525).** Measured back to back with `main` on the same machine, while other
sessions used it, on React's production build: a first launch is usable at 5.6 to 6.3 seconds where `main` took 7.4 to
8.5, and has every bitmap at 12.2 to 13.5 where `main` took 14.8 to 15.9. No frame draws on the way: every frame shows
its placeholder the moment it mounts, and its bitmap as it's captured, four at a time. The 3-second target for a first
launch isn't met, and frames aren't what holds it now: they mount only once the project has opened and its guest has
loaded, which on a fresh profile, with nothing cached, took about 5 seconds in these runs. Reopening and starting again
show kept bitmaps as before, give or take this machine's load.

**Where the time went, started again.** Before: the window loaded Parity's UI (1.0 s, from Vite's development server);
asked the service for the project, which took 1.3 s to open it (finding its tools 0.2 s, discovering its components 0.35
s, starting Vite in the builder's process 0.6 s); loaded the project's guest (0.4 s); then mounted the canvas, which
drew all 119 frames and tldraw's fill images, so the kept bitmaps came in at 6.4 s. After: the UI loads in the same 1.0
s while the service, opening the project from 0.35 s, has it ready at about 1.6 s; the guest loads (0.35 s); the canvas
mounts and shows every kept bitmap by about 3.2 s, the last 1.3 s almost all React's development build drawing the
canvas, its panels and 119 tiles.

**The targets.** Reopened in the same window, the canvas is usable and has its previews within 3 seconds. Started again,
it has its previews within 5 seconds but is usable at 3.2 to 3.3, short of 3. What's left is the development build's:
loading the UI from Vite's server (1.0 s) and React's development build, which renders each component twice under
StrictMode, drawing the canvas; an installed app has neither, and wasn't measured. The service's part, now overlapping
the UI's load, is mostly Vite starting in the builder's process, which needs discovery's results first; discovering
while the tools are found was tried and gained nothing, as both work on the service's one thread.

Code: `useFirstDrawWaits`, `holdsFirstDraw`, `drawnHeight`, and the `measure` and `holding` that `useFrameBitmap` and
`capture` take, in `apps/desktop/src/renderer/canvas/frame-bitmaps.ts`; `FrameTile` in `canvas/ContainerView.tsx`, and
the `[data-measured]` and `.frame-placeholder` rules in `styles.css`; `window.canvasHeight` in `renderer/render.ts`,
which `renderFrame` in `main/index.ts` asks after a capture, and the `frames.capture` handler in `utility/index.ts`,
which keeps it; the first fit in `handleMount` in `canvas/CanvasEditor.tsx`; `withoutPatternFills` in
`canvas/tldraw-fills.ts`; `startReopening` in `apps/desktop/src/utility/reopening.ts`, wired in `utility/index.ts`, with
`openRoots` in `utility/projects.ts` and `PARITY_REOPEN_FILE`, which main gives the service; the opening timings in
`apps/desktop/scripts/perf.ts`.

Tests: `apps/desktop/src/renderer/canvas/frame-bitmaps.test.ts` (3 for `holdsFirstDraw`: a frame zoomed far out waits
while its bitmap is to come, kept or captured, and once it has come, until it falls asleep on it; draws once its capture
failed or came without a height; and draws at once zoomed in, on the selected board or while interacting; and 1 that a
capture's height is kept with it, so a read during the capture gives both). `apps/desktop/src/utility/reopening.test.ts`
(5: each project kept is opened and those a window asks for stay open, one no window asks for in time is closed, one a
window asked for before the list was read is left to it, the last list given is kept whole for the next start, and
nothing is opened without a list or with a broken one). `apps/desktop/src/renderer/canvas/tldraw-fills.test.ts` (2: none
of tldraw's shapes adds to the canvas's defs, and only the shapes whose defs add the fill are replaced, keeping their
types). The bitmaps' heights and names are covered under Bitmaps kept between sessions. Gaps: `useFirstDrawWaits`
itself, the first fit and the service opening projects as it starts have no automated test; the end-to-end suite starts
each copy on a fresh profile, so none of it opens on kept bitmaps. They were checked with `pnpm perf` in a copy of the
app, and with a script that started a copy again, recorded every board's size while all 119 frames showed kept bitmaps
without having drawn, then selected each board so its frames drew, and found none of the 61 boards changed size. With
the offscreen window's heights, 28 boards were 3 to 66 pixels too tall, which is why the canvas's own height is kept.
Since PAR-525, a script on a fresh profile watched every frame: all 119 showed placeholders, then bitmaps, with none
drawn on the way; no board changed size between its placeholder and its bitmap other than taking its height; and
selecting each board so its frames drew changed 4 of 61 by 12 to 24 pixels, where heights measured at the bitmap's zoom
changed 28 by up to 66. The bitmaps were the same pixels as before the full-size measure, but for the 2 whose shadows
rasterize differently between runs. The placeholder and capturing without the wait have no automated test of their own;
they were checked that way and by reading `FrameTile` and `useFrameBitmap`.

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

Tests: `apps/desktop/e2e/reopening.e2e.ts` opens and closes the example project three times and checks the window ends
within 5,000 DOM nodes of where it started; with the old address on reopen it ended about 69,000 over after two. The
allowance is for tldraw, which sometimes keeps the editor closed last, with its canvas, until another replaces it: about
3,600 nodes, since frames showing bitmaps hold none of their own. That's one canvas however often the project opens, so
a canvas kept on each reopen still fails the test (PAR-445). `apps/desktop/src/utility/guest-ports.test.ts` covers which
port a builder takes, skipping ports guests had, and when the windows are told a guest moved, and told again after a
move they couldn't load; `apps/desktop/src/renderer/workspace.test.ts` covers `moveGuest`, including a tab still
loading, one reopened meanwhile and overlapping moves. Gaps: the offscreen renderer's side has no automated test, nor
has `restartBuilder` sending `project.guestMoved` to the window. A project service started again forgets the ports,
while the window keeps what it loaded from them.

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

### The project service starts under Parity's copy of Electron (PAR-489)

`pnpm dev` runs Electron as `Parity.exe` on Windows (decisions.md, "The app is named Parity"), and that copy starts the
project service and opens a project just as Electron under its own name does. Electron counts any program not named
`electron` as packaged, so the copy once looked for the service in `resources\app.asar.unpacked\utility.mjs` beside
`Parity.exe`, which isn't there: the utility process exited with code 1 before any of the service's code ran, again for
every window load, and printed nothing, even with `ELECTRON_ENABLE_LOGGING=1`. The dev runner sets `PARITY_DEV_RUNNER`,
and the main process counts the app as packaged only without it, so the service starts from `out\utility.mjs` beside the
bundles and update checks stay off. If the service's script is ever missing again, the main process says so: it logs
`Project service exited with code 1, since <path> doesn't exist`, naming the path it was given.

Smoke check, on Windows, from a fresh worktree:

1. `pnpm install --frozen-lockfile`, then delete `apps/desktop/node_modules/.cache/parity-electron-*` so the copy is
   made anew, and start `pnpm dev`.
2. Its output has no `Project service exited` line, and the service runs from the copy: in PowerShell,
   `Get-CimInstance Win32_Process -Filter "name='Parity.exe'" | ? CommandLine -like '*NodeService*'` lists one process,
   and another `Parity.exe` runs `out\builder-process.mjs`.
3. With the app running, `node apps/desktop/scripts/inspect.ts` waits for the canvas, prints every design's frames and
   no `errors`, and saves `.inspect/canvas.png`, where the status bar shows the project's builder running.
4. Stop it, and run the same steps with `PARITY_STANDARD_ELECTRON=1 pnpm dev`, which runs Electron as installed
   (`electron.exe`). The report lists the same designs and modes. A frame can show live in one and as a bitmap in the
   other, depending on when the report was taken.

Checked on Windows 11 (10.0.26200) on 2026-11-03 with `examples/shadcn-vite`: both runs showed the same 119 modes with
no errors. With the dev runner's check removed, the copy failed as above and logged the missing path.

Code: `isPackaged` in `apps/desktop/src/main/packaged.ts`, `serviceEntry` and `startService` in
`apps/desktop/src/main/index.ts`; `parityElectron` in `apps/desktop/scripts/parity-electron.ts`, which `scripts/dev.ts`
skips under `PARITY_STANDARD_ELECTRON=1`.

Tests: `apps/desktop/src/main/packaged.test.ts` covers the copy under the dev runner counting as not packaged. The app
tests start Parity through `scripts/dev.ts`, so on CI's Windows runner they run under `Parity.exe` too. Gap: nothing
automated starts the service from a freshly made copy and compares it with Electron as installed. That's the smoke check
above.

## The window

How the app's window holds the canvas and the panels around it.

### One word for each thing (PAR-538)

The editor's labels, menus, hints, toasts and undo labels use the glossary in [decisions.md](decisions.md), "Starting
from scratch, and what things are called (PAR-537)":

- **A thing on the canvas is a screen or a component,** never a design. A label that knows which says so ("Rename
  screen", "Delete 2 components", "Move 3 screens and components"); one that can't says both ("Select a screen or
  component on the canvas or in Layers", "Next screen or component"). The inspector's Design tab keeps its name. A menu
  item that acts on any selection stays short: Export selected…, Export all….
- **A mode's tile on a board is a preview:** "Drag to resize this preview", "Resize preview", "Show beside the first
  preview", the modes menu's Previews, "Some previews had problems" after an export, and "12 previews checked" in the
  Accessibility tab. Frames a second, and the accessibility rule about HTML frames, are still frames.
- **Main is only a main component.** The preview a board shows first is "Shown first", and the modes menu offers Show
  first and Only Desktop Light (the mode's own name), as the inspector's Modes section does. The project's first mode is
  still Primary.
- **The first state is named, never Base.** The state menu, the state labels beside the every-state grid and the States
  section show its name alone, without a count of changes; a field's reset says "Reset to Default", or the first state's
  own name; and the Editing control says "changes every state".
- **Undoing a view change has no step, but its label says what changed** ("Show Dark", "Show every state"), for anything
  that lists it later.
- **A screen's icon is lucide's AppWindow,** a window with its title bar, and a component's is still Component. The
  status bar says how many components are in code ("587 components in code"), the screen inspector's section that finds
  repeated parts is Repeated parts, and the Components panel lists the project's own as Local components and a library's
  ready-made ones as Ready-made components.

Code: `kindName`, `kindTitle` and `kindsName` in `packages/editor/src/kind-names.ts` name screens and components for a
label; `DesignStore.designsLabel` names selected ones by key, and `modeNames` in
`apps/desktop/src/renderer/canvas/view.ts` names modes.

Tests: `packages/editor/src/kind-names.test.ts` (3: one by kind, several of one kind, a mix with screens first),
`packages/editor/src/drop-files.test.ts` ("New screen with the image"),
`apps/desktop/src/renderer/chrome/edit-scope.test.ts` ("change every state"). End to end,
`apps/desktop/e2e/keyboard.e2e.ts` (the View menu and the Keyboard shortcuts dialog), `selecting.e2e.ts` ("Move
screen"), `dropping.e2e.ts` and `inserting.e2e.ts` (Local components). The stories that show these labels are the modes
menu, the inspector's Design tab, the States section, the board and the status bar. Gaps: the strings themselves are
checked by reading them, not by tests, as [conventions.md](conventions.md) says of prose.

### Installed app updates (PAR-160)

Windows NSIS and Linux AppImage installations check GitHub Releases on startup and through Help > Check for updates.
Automatic downloads stay silent in the background (PAR-498). Only an explicit menu check shows download progress. A
completed download shows a persistent Restart to update / Later notice; About keeps the action available after Later.
Restart uses the existing unsaved-work prompt, and Cancel leaves the app and update ready. An installation failure
resets the close decision, so closing later still checks for new unsaved work. Quitting normally never installs an
update. Unsigned Macs check for newer releases and offer their download page instead of installing in place. The Mac
application menu includes the same check.

Manual checks show checking, no-update and retryable-error feedback in the same toast, without opening About or
interrupting work (PAR-490). Startup checks remain quiet when no update is available or the check fails. A menu check
also restores a previously dismissed download or restart notice. About stays available separately through Help.

Settings > Get beta updates is off by default and remembered between runs. It includes GitHub pre-releases without
allowing downgrades. About labels installed beta builds with `(Beta)` independently of the selected Update channel; the
preference describes which future releases to accept. It also shows the available version. Development builds and
extracted Linux folders do not download or install updates.

The release workflow embeds the initial Beta identity, including for a first offline launch. The installed tag's public
release metadata observes promotion to stable. A version-keyed cache preserves confirmed identity offline and refreshes
after five minutes, so promoting identical artifacts to stable updates their identity. An unconfirmed offline build is
never guessed from its numeric version or the update preference. Confirmed empty stable feeds mean no update;
connection, authorization and service failures remain retryable errors.

`chrome/UpdateToast.stories.tsx` shows the download, restart-ready and Mac fallback designs, unknown-size progress, both
themes through the toolbar, and the real toast host. `chrome/UpdateDialogs.stories.tsx` covers About's update states and
the beta setting and beta/stable installed builds independently of the preference. The owner signed off on the rendered
toast designs and the PAR-490 check-feedback and build-label stories before app integration.

Code: `packages/core/src/updates.ts` defines state transitions; `apps/desktop/src/main/update-session.ts` serializes
operations and `main/updates.ts` adapts electron-updater. `main/index.ts` owns the close acknowledgement and IPC,
through `preload/index.ts`. `renderer/chrome/updates.tsx` shares state between `UpdateToast.tsx`, `AboutDialog.tsx` and
`SettingsDialog.tsx`; `AppMenu.tsx` exposes the check.

Tests: `packages/core/src/updates.test.ts` covers guarded transitions, late progress, channel changes and invalid
progress; `main/update-session.test.ts` covers serialized checks, retry, installation failure resetting the close
decision, disabled development builds and the Mac fallback. `preload/index.test.ts` covers a native menu action arriving
before React subscribes and replacing its listener without losing the next action. `chrome/updates.test.ts` covers
manual checks without a dialog, quiet startup results, repeated checks, retry and dismissed progress becoming a ready
notice. CI runs `scripts/try-update.ts` on Windows and Linux: two real packaged versions, checksum rejection, Later,
unsaved-work cancellation, Save, installation and relaunch as the newer version. It refuses to run outside CI.

### The page never scrolls (PAR-424)

The window's page is always exactly the window: no part of the chrome makes it taller or wider, so it never scrolls.
Each panel scrolls on its own, so revealing or focusing something out of a panel's view, such as a Layers row or the
Screens heading's New screen button, scrolls only that panel. The canvas stays where tldraw measured it, and clicks on
it land where they're aimed.

- **Why it matters.** tldraw measures where the canvas is when it mounts or resizes, not when the page scrolls. The
  end-to-end suite found the page 1139 px tall in a 903 px window, and focusing a design's title below the fold scrolled
  it by 235 px: the menubar and tabs went out of view, and every canvas click after it landed 235 px off, selecting
  nothing or the wrong layer.
- **The cause** was the Layers panel's group headings. Their New component and New screen buttons were visually hidden,
  left to screen readers (`sr-only`, which places them absolutely), until hovered or focused, and the heading wasn't
  positioned, so the buttons were placed against the window rather than inside the panel, and the panel's scroll didn't
  clip them. The heading is now `relative`, and since PAR-546 the buttons always show.
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

### The status bar's process lights stay off the main thread (PAR-524)

Each process in the status bar has a light: a running server's breathes, a starting or stopping one's ring turns, a
crashed one pings red, and a stopped one is hollow. A project's build server runs for as long as it's open, so its light
breathes almost all the time, and it mustn't cost the window anything while nothing else happens.

- **Opacity only.** A running light is the dot and, behind it, its glow, a blurred shadow drawn once on its own layer.
  The dot fades between 85% and full (`process-breathe`) and the glow fades in and out with it (`process-glow`), both by
  opacity, which the compositor runs without the page repainting. Before, `process-breathe` animated the dot's
  `box-shadow`, which had to be painted again every frame: an idle window painted, layerized and committed 60 times a
  second, about 1.3 ms of main thread per frame.
- **Measured.** `pnpm perf`'s idle run on the example, with its build server running, now spends 0 ms a frame on paint,
  pre-paint and layerize. `document.getAnimations()` in the status bar lists `process-glow` and `process-breathe` on
  opacity, and the turning ring's `spin` on transform, and nothing else.
- **Reduced motion** stops every light, ring and shimmer (`[data-process-motion]` in `styles.css`): a running light is
  then a steady dot with no glow.
- **The lights stand alone.** The status bar shows no words beside them. What they used to say (a crash or failed task,
  what's starting, a running task and its progress, or how many run) is now their tooltip and accessible name, and
  clicking them opens the flyout.
- **A narrow status bar shows icons and counts.** Below 56rem (a container query on the footer), the renderer and
  builder show only their icons; components, tokens and Storybook show their icons and counts (Storybook's is how many
  components have stories); a failed save is its warning icon; and the performance stats are the gauge and the frame
  rate. The words stay for screen readers and each tooltip names the item, so the status bar fits a phone's width
  (checked at 375px).
- **Every tooltip has one shape:** a short title (the item's name and version, or its count), then one short line on
  what it does or what a click does, such as "Storybook 10.6.5" over "3 components with stories. Click to open it". An
  untested version adds "Parity doesn't test this version". Paths, discovery notes and error messages stay out, since
  they can run long: a failed save's reason is in its notification.
- **Notifications sit above the status bar** on a phone-sized window too: sonner places them by `mobileOffset` below
  600px, which is now 40px like `offset`, rather than its default 16px, which covered the bar's buttons.

Code: `Light` and `triggerLabel` in `apps/desktop/src/renderer/chrome/Processes.tsx`, `Words` in `chrome/StatusBar.tsx`,
and the `process-*` keyframes in `styles.css`.

Tests: Storybook, `chrome/StatusBar.stories.tsx` Everything: every item the status bar can hold at once, with a running,
a starting and a stopped light side by side; EverythingNarrow: the same at 480px, as icons and counts; OlderProject: the
renderer's and builder's tooltips name the version and note it's untested; `chrome/ProcessIcons.stories.tsx` EveryKind
and EveryKindLight: each light in every status, in both themes; and `chrome/Processes.stories.tsx` JustTheBuildServer:
one light, breathing.

Gaps: nothing checks automatically that the lights stay on opacity and transform; the perf idle run shows it.

## Rendering frames

How the project's code runs in the canvas's frames.

### Parity's variables stay out of frames (PAR-157)

A frame shows what the project's CSS gives on its own page in Chrome, not Parity's variables. Custom properties inherit
into a shadow root, so a project that uses `var(--background, white)` or `var(--border, 1px)` without defining them used
to get Parity's values, since shadcn's names are Parity's too. Now it gets its fallback.

- **Every custom property that reaches a frame's host is set to `initial` at its root,** in the lowest layer, beside the
  `all: initial` that resets the other properties. The names come from the computed style of the element around the
  host, read as the frame is prepared, so Parity's stylesheets, tldraw's and inline variables all count.
- **The project's own variables win,** from `:root` and `html` (which become `:host`), in any layer, as do the viewport
  sizes each frame sets on its host and token previews.
- **The canvas's own `--frame-height` stays,** set around the host for the canvas's rules on the host itself: it holds a
  sleeping frame at the height it was drawn at, so its board doesn't shrink to its caption zoomed far out.
- **Registered properties stay the document's.** A name Parity registers with `@property` keeps its initial value in
  frames, since shadow roots ignore `@property` (see [decisions.md](decisions.md), "Parity's own custom properties stay
  out of frames").

Code: `resetCustomProperties` in `packages/core/src/css.ts`; `keepOutInherited` and `frameRootCss` in
`apps/desktop/src/renderer/frame.ts`, called by `prepareFrame`.

Tests: `packages/core/src/css.test.ts` (3: each name set to `initial`; names that aren't custom properties left out; a
name with `:`, a space or `;` escaped, so it can't set another property). `apps/desktop/src/renderer/frame.test.ts` (3),
in Chrome, on a page that defines `--background` and `--border` in a stylesheet, and `--tl-zoom` and `--frame-height`
inline around the frame: a box using them with fallbacks has the same background and border in the frame as on a fresh
page, its fallbacks, and no `--tl-zoom`; and with the project defining two of them on `:root` and in a layer on `html`,
the project's values, as on the page; and the host still has `--frame-height`. End to end, `sleeping.e2e.ts` checks
every board keeps its size zoomed far out. Gap: a variable Parity first defines after a frame is prepared isn't tested;
it reaches the frame until it's prepared again.

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

### Offscreen frames draw what the canvas draws (PAR-465)

Agents' Measure, Screenshot, Problems, Accessibility and ExtractComponent, Export PNG and the Accessibility panel draw
their frames offscreen, from the tab's snapshot. They now draw with the canvas's own inputs:

- **Library instances.** An instance of a library's component design (from a `.lib.par` canvas, such as `kit/label`)
  draws that design, where it used to draw the `No component design "kit/label"` placeholder. The snapshot carries the
  design store's library designs, and agents build the library as the canvas does, the project's own design winning an
  id they share.
- **Token previews.** Unsaved token edits show in agents' frames, exports and the Accessibility panel as on the canvas,
  and a call's own `SetTokens` shows in the frames it draws after it, in the same call. Each job carries the complete
  set of token values that differ from the compiled CSS, not the changes since the last job. It's compared with the CSS
  the guest loaded, so after a save and the guest loading again, undoing an edit still sends the value put back (or an
  empty one, taking out a theme value the saved CSS now has).
- **No job inherits another's tokens.** The render window keeps one stylesheet per guest; each job starts it from the
  compiled CSS and lays its set over it, so a job with no overrides after one with some draws the compiled values, and
  undoing an edit that gave a theme a value it didn't have (a dark `--radius`) leaves nothing behind in bitmaps. It
  starts over only when the set changed, so a run of jobs with the same set doesn't rebuild it, and a set that fails
  partway is never taken as shown. The canvas's own frames are edited in place, as before.

Code: `projectComponentLibrary` in `packages/core/src/render.ts`, used by `DesignStore` (`getLibraryDesigns`) and
`AgentWorkspace.library` in `packages/agent/src/workspace.ts`; `withTokenOverrides` in
`packages/editor/src/token-edits.ts`, which `TokenStore` follows its edits with and `previews` gives; `tokenValues` in
`workspace.ts` laying the call's `SetTokens` over them for each `FrameRequest`; the snapshot in
`apps/desktop/src/renderer/agent/handlers.ts` and `renderFor` in `apps/desktop/src/utility/agent.ts`; `guestSheet` and
`showTokenOverrides` in `apps/desktop/src/renderer/guest.ts`, called by `render.ts` for each job.

Tests:

- `packages/agent/src/run.test.ts` (5 of its 29): Measure, Problems and Screenshot of a design placing a library design
  draw it with no placeholder; no missing-design warning for a placed library design, only for one that doesn't exist; a
  project design wins over a library design with its id; frames carry the canvas's unsaved values, then those with the
  call's `SetTokens` over them; and nothing when no value differs.
- `packages/core/src/render.test.ts` (1): the project's library holds the library designs and its own, its own winning.
- `packages/editor/src/token-edits.test.ts` (2) and `history.test.ts` (1): only values that differ are overrides; an
  edit undone, also one giving a theme a new value, leaves none; a saved edit still is one; and after a guest loads
  again with the edits saved, undoing them overrides with the value put back and an empty one for the theme value taken
  out.
- `apps/desktop/src/renderer/guest.test.ts` (3 of its 6), in Chrome: overrides A, then none, then another set, then A
  again give the same stylesheet as A the first time, and none gives the compiled one; a theme value taken out once the
  set leaves it out; only a guest's stylesheet takes overrides; and a set that threw partway doesn't stop the one before
  it being laid over again.
- `apps/desktop/src/renderer/tokens-store.test.ts` (1 of its 3): `previews()` empty once an edit is undone.
- `apps/desktop/src/renderer/design-store.test.ts` (1 of its 21): the library designs the snapshot carries.

Gaps: the snapshot and `renderFor` wiring has no test of its own, and checked by reading; the end-to-end tests run in
CI. The snapshot crosses from the window to the service as the window's other replies do, unchecked; its library designs
were checked when their `.lib.par` was read.

### Which node overflows what (PAR-456)

Agents' `Measure` gives each node's box with the node it's drawn inside (`parent`), the ancestor that clips it when one
cuts it off (`clip`, with its box), and the state and mode it drew. `Problems`, `find_problems` and `parity problems`
give each layout problem as a finding: its `kind` (`frame-overflow` or `clipped`), the node and its name, its box, the
`container` it overflows (the node that clips it, or the frame) with that box, and the pixels past each edge in
`overflow`. The sentence with it says the same, such as "at x 340, y 100 and 60 × 36px, it sticks out of the 390px frame
by 10px on the right", and the CLI puts the layer's name before its id. Overflow of a parent that doesn't clip, inside
the frame, isn't reported; see [decisions.md](decisions.md), "Problems reports where a node overflows".

Code: `layoutFindings` and `describeLayoutFinding` in `packages/agent/src/overflow.ts`, used by `problems` in
`packages/agent/src/workspace.ts`; `clipper` and `nodeParent` in `apps/desktop/src/renderer/render.ts` measure each
node; `describeProblems` in `packages/cli/src/client.ts` and the problems schema in `operations.ts`.

Tests:

- `packages/agent/src/overflow.test.ts` (13): a node narrower than the frame that its position takes past the right
  edge; the half-pixel tolerance; a badge past a parent that doesn't clip isn't reported; nested clipping names the
  nearest ancestor at each level; a clipping element outside the layers; children going no further than their reported
  parent left out, one going further kept; a bottom edge only with a fixed height; nodes drawn at no size; the
  sentences.
- `packages/agent/src/run.test.ts` (2 of its 46): the finding in only the mode whose frame the button passes, with its
  boxes, the frame's overflow not reported again, a clipped title in every mode, and Measure's parent, state and mode; a
  node wider than every frame found once in each.
- `packages/cli/src/client.test.ts` (1 of its 11): the readable line names the layer.

Gaps: the renderer's `clipper` and `nodeParent` run in the offscreen window, which the end-to-end tests cover in CI.

### Every frame drawn in the same window (PAR-466)

A frame stands for a browser window, and every path that draws it gives it the same one: the live frame in its mode on
the canvas, its bitmap zoomed out, and the offscreen frames agents measure, screenshot, check for problems and for
accessibility, which Export and the Accessibility panel use too. A mode whose viewport has a screen height, say 1280 by
1234, gives a frame that grows with its content a 1234px window everywhere, so `100vh`, `innerHeight` and the project's
window size checks read 1234 in bitmaps, screenshots and measurements as on the canvas. Before, the offscreen renderer
worked out its own height from the width alone, the 800 of the device nearest 1280.

- **Two heights, kept apart.** A frame's own height is fixed or not: a fixed one clips the frame, and without one the
  frame grows with its content. Its window always has a height: the frame's fixed height, else the viewport's screen,
  else the device nearest its width (see [decisions.md](decisions.md), "A frame stands for a browser window"). Core's
  `frameGeometry` gives both, `{ width, height?, viewport }`, and every path draws from it.
- **The offscreen job carries the window.** `RenderJob.mode` has the frame's `width` and optional `height` beside its
  `viewport`, and the offscreen page mounts the frame in that viewport rather than working one out. An agent's
  `FrameRequest` carries the viewport too, so a frame an agent asks for is drawn at what the canvas shows.
- **The offscreen window's own size doesn't matter to the frame.** It opens 800px tall and is resized to the frame
  before a capture or an audit, but the project's viewport units and its `innerHeight`, `matchMedia` and resize events
  answer from the frame's window (CAN-23, CAN-33), as on the canvas.

Code: `frameGeometry` in `packages/core/src/render.ts`; `FrameTile` in
`apps/desktop/src/renderer/canvas/ContainerView.tsx`, which passes it to `ModeView.tsx` and `useFrameShows` in
`canvas/frame-bitmaps.ts`; `renderJobMode` in `apps/desktop/src/shared/render-job.ts`, which builds a job's mode for
bitmaps and for `renderFor` in `apps/desktop/src/utility/agent.ts`; `AgentWorkspace.render` in
`packages/agent/src/workspace.ts`; `canvasRender` in `apps/desktop/src/renderer/render.ts`.

Tests: `packages/core/src/render.test.ts` (1: at 1280 by 1234, a frame that grows has no height and a 1234px window, and
a frame fixed at 600 keeps its 600 apart from its window). `apps/desktop/src/shared/render-job.test.ts` (2: for that
growing frame, the live frame's geometry, a bitmap's job and an agent's `Measure` job all have a 1280 by 1234 window and
no height; a fixed frame's job keeps its height beside its window). `packages/agent/src/run.test.ts` (1: `Measure`,
`Screenshot` and `Accessibility` ask for frames with that window). `apps/desktop/src/renderer/render.test.ts` (2), in
Chrome: the offscreen page's `canvasRender`, in an 800px window, mounts a growing 1280px frame in the job's 1234px
window, where `100vh` measures 1234 and the frame grows past it; a frame fixed at 600 is 600 tall while `100vh` is
still 1234. Gap: the end-to-end suite draws frames offscreen but doesn't read a window height in them.

### Caller identity (PAR-450)

Agent cursors and badges display the caller's declared name. CLI callers set `PARITY_AGENT_NAME`; without it they appear
as `Terminal`. MCP callers supply `clientInfo.title` or, if absent or blank, `clientInfo.name` during initialize;
without either they appear as `Agent`. Names retain their spelling and punctuation, with surrounding whitespace removed.
Parity does not infer identity from environment variables belonging to other tools or a list of known agents. `--label`
describes the task independently of the caller's name.

Tests: `packages/cli/src/caller.test.ts` covers explicit identity, the DeepSeek environment regression, MCP title
precedence, names preserved verbatim and neutral fallbacks.

Implementation: `packages/cli/src/caller.ts` selects declared names and bounds session ids; `client.ts` attaches the
name/id to RPC, and `mcp.ts` supplies the initialize handshake name. `apps/desktop/src/utility/agent.ts` forwards that
identity to presence events, displayed by `renderer/agent/AgentPresence.tsx` and `AgentPointer.tsx`.

Coverage gaps: the unit tests exercise name selection and distinct bounded ids, not a full MCP-to-canvas session.
Read-only CLI executions were checked in the running fencing-club app with inherited `CODEX_HOME`: without an explicit
name the badge showed Terminal; with `PARITY_AGENT_NAME=DeepSeek Harness` it showed DeepSeek Harness. Both completed
without design edits, and the badges were checked in screenshots. Concurrent long-name MCP cursors have not been checked
visually; their id truncation regression is covered by `caller.test.ts`.

### Shared execute contract (PAR-451)

CLI `exec` and MCP `execute` use the same operation in `packages/cli/src/execute.ts`. Both default the task label to
"Edit designs" and the tab as every call does (see "Which copy of the app a call reaches"). A request contains a snippet
or a retry id, with optional ordered patches. Ambiguous requests, blank supplied labels/tabs and malformed patches are
rejected before contacting the app. A failed execution includes retry details and is a failure in both transports. CLI
file/stdin and MCP image content remain adapter responsibilities; execution still lands as one undoable step through the
desktop.

`packages/cli/src/execute.test.ts` exercises both actual entry points against local RPC: discovery, stdin and file
input, explicit labels/tabs, defaults, retry patches, invalid requests, success output and images, failed execution and
desktop errors. It also checks that caller identity travels separately from operation parameters.

### Shared desktop operation contracts (PAR-452)

All CLI desktop interactions use the contracts in `packages/cli/src/operations.ts`, alongside PAR-451's execute
operation. MCP also exposes `get_tokens`, `get_components` and `get_props`. Both transports validate names, selectors,
booleans and screenshot scale before RPC, use the same defaults, and signal screenshot failures and audit findings as
failures with details preserved. CLI relative-path resolution and output formatting stay at the edge. Local skill
reading shares validation and a reader without requiring the app.

`packages/cli/src/operations.test.ts` launches both real entry points against local RPC, covering each operation's
defaults, explicit tab/options, human and JSON output, invalid inputs, RPC errors, image blocks, audit and screenshot
failures, local skill reads and errors, and MCP discovery. `transport-fixture.ts` also supports execute's existing
contract tests. The running app is checked with read-only state and component/token/prop reads through both transports.

The RPC boundary uses `packages/agent/src/caller.ts` to preserve complete names and bound only explicit ids. Its
`caller.test.ts` covers long shared prefixes, id bounds, fallback ids and invalid names. The renderer caps name width in
the pointer and activity badge, with the full name in a native hover title; it does not shorten the stored name.

When no explicit CLI id is set, the CLI omits `agentId`, letting the boundary use the complete name as its fallback. The
transport contract test covers two names sharing more than 80 prefix characters. Name spans alone enable pointer events
through the otherwise transparent overlay, so the full hover title is reachable without blocking the rest of the canvas.
The cursor component was checked in Storybook with a long name; its text and title remain intact and its visible width
is bounded with ellipsis.

### What a component goes inside (PAR-454)

`Props(component)`, `parity props` and `get_props` return the component's `composition` with its props, and before they
are read: its role (a `provider` that draws nothing, a `wrapper` other parts go inside, or a `component`), the parents
it goes inside (`listed` with their chain and where the library learned it, `none`, or `unknown` with why), the parts it
holds, its slots by the key a node holds them under, and an example node `Insert` takes as it is. The example is the
tree the Components panel draws for the component, and its status is the canvas's render status: `drawn`, `failing` with
why, or `untried`. The CLI prints it after the props, with the example as JSON.

`packages/editor/src/composition.test.ts` covers a Nova-shaped sidebar (its provider before inserting, provider, wrapper
and component roles, optional parents), parents that are unknown until a project component draws or that a provider
error names, slots from props and from samples, and a stable example. `packages/agent/src/run.test.ts` reads Sidebar's
provider through `Props` and inserts the example. `packages/cli/src/operations.test.ts` checks that the CLI and MCP give
the same composition and text.

### Structured results and coded errors (PAR-472)

Every shared operation returns the same data as CLI `--json` and MCP `structuredContent`, beside the text and images
people read. Each operation's output schema stays in its contract; `tools/list` leaves them out, which keeps it under 12
KiB (PAR-510). Failures carry a stable `code`, the `message`, `retryable`, a JSON-pointer `path` to the input at fault,
up to 20 `alternatives` (valid ids for an unknown or ambiguous one) and a failed snippet's `editId`. Unknown tabs,
designs, nodes, states, modes, viewports, components, icon sets and retry ids are coded where the app finds them;
invalid input is coded before anything reaches the app; a missing app is `not_running`. Tokens and the console are
bounded by `limit`, with `total` and `truncated`.

Implementation: `packages/core/src/errors.ts` (codes, `CodedError`, `closest`, `readErrorDetails`);
`packages/cli/src/errors.ts` (the operation error, its schema and path mapping); `operations.ts` and `execute.ts`
(output schemas, canonical results, bounds); `mcp.ts` and `bin.ts` (structured output in each transport);
`packages/agent/src/workspace.ts` and `run.ts` (coded lookups, conflicts and retries, `ExecResult.details`);
`apps/desktop/src/utility/agent.ts` (RPC `details`), `utility/index.ts`, `preload/index.ts` and
`renderer/agent/handlers.ts` (details across the window channel, `ServeAnswer`, coded tab lookup).

Tests: `packages/core/src/errors.test.ts` (defaults, bounded closest-first alternatives, checking details from another
process, coded unknown state). `packages/agent/src/run.test.ts` ("coded failures": unknown design, state, mode,
component and node, ambiguous node, uncoded throw, unknown retry id, a patch that doesn't match, and the conflict code).
`packages/cli/src/operations.test.ts` and `execute.test.ts` launch the real CLI and MCP: structured data equal to CLI
`--json` for every operation, app codes with paths and alternatives for unknown tab, design, state and component,
unknown codes read as `app_error`, invalid input paths in each transport's names, `not_running`, bounds and limits,
image data kept out of structured results, and every tool's output schema. `client.test.ts` covers the truncated token
text.

Checked in the running app on `examples/shadcn-vite`: unknown tab, component, design and state through the CLI with
`--json`, bounded tokens, and an execute that applied and was renamed back. Gaps: the end-to-end suite doesn't drive the
CLI; `get_app_state` is unbounded (53 KB for 61 designs), left to PAR-479.

### What Replace discards (PAR-455)

`Replace` puts a new node, with fresh ids, where the old one was. The old node and everything inside it go, and so do
the patches keyed to them: their responsive patches, their changes in every state and their variant options' patches.
Replacing a design's root also clears every state's changes. Nothing is moved onto the new node, since its ids don't map
onto the old ones. Patches on nodes outside the replaced one stay.

An execute result says what went in `discarded`: for each `Replace` that threw patches away, the design, the replaced
node, its replacement, and each node that had patches, by id (or `instance/inner` path) and name, with the viewports,
states and `param=option` variants it was patched in. The CLI and MCP text list them under "Discarded by Replace". A
replacement that dropped nothing adds nothing, and a failed call reports nothing, because it changed nothing. Undo
brings the patches back with the rest of the step. The skill shows how to put back the ones still wanted.

Implementation: `packages/agent/src/workspace.ts` (`replace` and `discardedPatches`, which compares the design before
and after); `packages/agent/src/types.ts` (`DiscardedPatches`); `packages/cli/src/execute.ts` (the field and its schema)
and `client.ts` (`describeExec`).

Tests: `packages/agent/src/run.test.ts` ("Replace": a nested replacement reports only its node's viewports and variant
and keeps the rest; a root replacement reports every node's patches and drops the variant patches; the design as read
keeps them for undo; a failed call reports nothing; replacements without patches add no field; the skill's example of
putting patches back). `packages/cli/src/execute.test.ts` (the same text from the CLI and MCP, `discarded` in `--json`
and structured content, and nothing when there's none).

### States named by id (PAR-459)

Every agent call that takes a state takes its id: `UpdateState`, `DeleteState`, `Update`'s and `Get`'s `state`,
`UpdateDesign`'s `state`, and `Screenshot`, `Measure`, `Problems` and `Accessibility`, with the CLI and MCP checks that
run them. A reference that isn't an id fails with `unknown_state` on `state`. The message says ids are expected and
lists each one beside its name, as `Designs()` does. When the reference matches a state's name (ignoring case and spaces
at the ends), it names that state's id, which leads `alternatives`. When several states share the name, it names all of
their ids and picks none. A name a state had before a rename matches nothing.

Implementation: `findState` in `packages/core/src/edit.ts`, which every lookup goes through; `update` in
`packages/agent/src/workspace.ts` checks the state before the change.

Tests: `packages/core/src/errors.test.ts` (an unknown id with ids and names listed; a renamed state's name pointing to
its id, ignoring case and spaces; a shared name listing both ids; a former name matching nothing).
`packages/agent/src/run.test.ts` ("asks for a state's id in every call that takes one": the same message and
alternatives from each call, a shared name, and the id working).

### Measure draws one frame (PAR-461)

`Measure` takes one state id and one mode id. A list, `"all"` or `"shown"`, which `Screenshot`, `Problems` and
`Accessibility` take, fails before anything renders with `invalid_input` on `state` or `mode`. The message says Measure
lays out one frame, to call it once for each, and that the checks take several, then lists the design's states as
`id (name)` or its modes; a frame lists only the primary mode. `alternatives` gives those ids. The CLI and MCP show the
same text and structured error. The execute skill shows a loop over a design's states and shown modes that keeps each
layout with the state and mode it reports.

Implementation: `expectOneFrame` in `packages/agent/src/workspace.ts`, called by `measure`.

Tests: `packages/agent/src/run.test.ts` ("explains that Measure draws one frame": each of `"all"`, a list and `"shown"`
for state and mode, with nothing rendered; one state and mode still measuring; a frame listing only its primary mode).
`packages/cli/src/execute.test.ts` ("explains Measure's single frame the same way in both transports": the agent's error
as CLI text, `--json` and MCP). `packages/cli/src/skill-examples.test.ts` runs the skill's loop.

### Warnings grouped by what they found (PAR-460)

An execute call's findings are grouped: one per category and message, with how many places it was found and which.
`warningGroups` gives each group's stable `category` (`render_failed`, `unknown_component`, `unknown_component_design`,
`unknown_prop`, `invalid_option`, `not_a_token`, `not_a_length_token`, `overlap`, `title_clearance`, `canvas_overlaps`,
`kind_changed`, `unnamed_layout`), its `severity`, its `message`, its `count` and `at`, which lists every place as a
`design/node` path or frame. Errors come first, then warnings, then suggestions, each in the order found. A render that
failed is an error. A new unnamed layout that groups things is a suggestion, reported only for layouts the call added.
`warnings` keeps one line per group: the place and message for one place, and for several the count, the first five and
how many more (`12 places (home/a, …, home/e and 7 more): name layouts…`). The CLI and MCP text list the lines under
"Render failures", "Warnings" and "Suggestions". A copy of the app without groups has every line read as a warning.
Nothing is named or renamed for the agent.

Implementation: `packages/agent/src/warnings.ts` (categories and severities, `groupWarnings`, `warningLine`);
`packages/agent/src/workspace.ts` (`warn`, and the groups in `result`); `packages/cli/src/execute.ts` (the field and its
schema) and `client.ts` (`describeExec`).

Tests: `packages/agent/src/warnings.test.ts` (twelve places in one group with a count; a place counted once when a
finding repeats there; categories and messages kept apart, errors first and suggestions last).
`packages/agent/src/run.test.ts` ("warning groups": eight inserted unnamed rows as one suggestion, an unnamed layout
already there left out, two unknown props, a token, and a render failure first). `packages/cli/src/client.test.ts`
(headings by severity; lines from an app without groups). `packages/cli/src/execute.test.ts` (groups in `--json` and
structured content).

### Board collisions and title clearance (PAR-462)

`Overlaps()` checks every board on the canvas and lists each pair that's too close: a collision when the boards overlap,
or `titleOnly` when they're clear but the lower one starts less than 160 below the upper, so its title covers it.
`estimated` marks a pair where a board isn't drawn yet and is sized from its frames; without it both sizes are as the
canvas drew them. `state` returns the same list. An execute call's warnings cover only the boards it created, changed or
moved: `overlap` for a collision, `title_clearance` for a title too close, each saying "measured" or naming the board
that isn't drawn yet. Pairs the call didn't touch are counted in one `canvas_overlaps` suggestion that points to
`Overlaps()`, so a call that only reads doesn't make a crowded canvas look clear. The skill's canvas section shows an
audit with `Overlaps()` and placing a board with `FindEmptySpace({ width, height })`.

Implementation: `packages/agent/src/workspace.ts` (`overlaps`, `overlapWarnings`), `packages/agent/src/warnings.ts` (the
categories), `packages/cli/src/operations.ts` (`state`'s overlap schema) and `execute.ts` (the categories' description).

Tests: `packages/agent/src/run.test.ts` ("shows a move as a drag…": a collision with an estimated board; "counts a
board's title as part of it": title clearance; "says measured when both boards were drawn"; "estimates an undrawn
board's height…": both boards named when neither is drawn; "doesn't call a crowded canvas clear when the call moved
nothing": a read on a canvas with three crowded pairs; "warns only about the boards the call moved, and counts the
rest"). `packages/cli/src/skill-examples.test.ts` runs the audit example.

### Which copy of the app a call reaches (PAR-514)

Several copies of Parity can run at once, each with its own projects open, and every CLI or MCP call goes to the copy
that has its project. Each copy writes an entry to `~/.parity/agents` as its service starts and main removes it as the
copy quits. The CLI asks each copy for its tabs and when its window last had focus, chooses the copy and tab by the
rules in `packages/agent/src/routing.ts`, and sends that exact tab. `--tab` takes an id, folder or name; `--tab active`
is the active tab of the copy focused last; without `--tab`, a call goes to the open project the working folder is in,
else to `active`. A project open in two copies goes to the one running longest. `parity tabs` lists every copy's
projects once. `PARITY_AGENT_FILE` keeps a copy apart, reachable only through that file.

Implementation: `packages/agent/src/routing.ts` (the rules, data in and out, also the app's tab matching in
`renderer/agent/handlers.ts`), `packages/agent/src/registry.ts` (entries, for the app and the CLI),
`apps/desktop/src/utility/agent.ts` (writes the entry, answers `copy`), `apps/desktop/src/main/index.ts` (removes it),
`packages/cli/src/client.ts` (routes each call) and `operations.ts` (each operation's routing, from its fields).

Tests: `packages/agent/src/routing.test.ts` (two copies with different projects, the same project in both, `active` by
focus, the working folder, nested projects, Windows case and slashes, nothing open or running),
`packages/agent/src/registry.test.ts` (entries written, listed and removed; the file before the registry; a copy kept
apart), and `packages/cli/src/copies.test.ts` (the real CLI and MCP server against two fake copies: routing, `active`,
the merged list, an unknown tab, a stale entry removed, each operation's routing, and MCP tools routed and answering
exactly as the CLI's commands do, since both run the same operations through the same `call`).

Checked with two dev copies sharing a registry, one with `examples/shadcn-vite` and one with a copy of it: `parity tabs`
listed both; `state` reached each by folder (in any case and slashes) and from inside each project's folder; `exec` ran
in the second; `--tab active` followed the window brought to the front; an unknown tab listed both; and each copy's
entry was gone after it quit, the other's kept. Gap: focus was given through DevTools, not a click.

### Where edits stand, for agents (PAR-481)

`parity status`, MCP `get_status` and the window's `agent.status` request read a tab's revision, whether anything
applied isn't saved, its unsaved files, token values waiting, the save state and failed writes, the undo and redo counts
and whether saving is automatic. `summary` (with `limit`) adds each unsaved file's designs added, changed and removed,
changed modes, token values, and the undo and redo labels. `get_app_state` carries the revision too. Reading it changes
nothing; the revision changes with every change, undo, redo, revert or reload of designs, modes or token edits, and not
with saving or the camera.

Implementation: `revision` in `packages/editor/src/history.ts` (`restore`); `editStatus` in
`packages/editor/src/status.ts`; `DesignStore.status` and `getRevision` in `apps/desktop/src/renderer/design-store.ts`;
`agent.status` in `renderer/agent/handlers.ts` and `shared/protocol.ts`; the `status` RPC and state's revision in
`utility/agent.ts`; the `status` operation in `packages/cli/src/operations.ts`, `describeStatus` in `client.ts`, and the
adapters in `mcp.ts` and `bin.ts`.

Tests: `packages/editor/src/status.test.ts` (clean at 0; change, undo and redo each counted and told apart from what's
saved; saving and a failed write leave the revision; a bounded summary of added, changed and removed designs, token
values and labels newest first; changed modes). `packages/cli/src/operations.test.ts` (CLI and MCP defaults, explicit
summary and limit, structured output, invalid summary and limit) and `client.test.ts` (the text). Checked in the running
app on `examples/shadcn-vite`: a clean tab, an agent's rename (dirty, `changed button`, one undo step), a token edit
(the stylesheet unsaved), and `state`'s revision moving with them. Gap: no end-to-end test drives a person's edit and
then reads the status; deltas since a revision are PAR-267.

### Discovering modes (PAR-473)

`parity modes [design]`, MCP `get_modes` and the snippet API's `GetModes(design?)` return the project's variables, its
viewports (the ids `Responsive` takes) with each window's height, each mode (the ids renders take) resolved with its
option per variable, classes and attributes, and each design's shown state or states, main mode and beside modes. Naming
a design returns just it, with each frame's width, fixed height when it has one, and window. Reading changes nothing.

Implementation: `packages/core/src/mode-report.ts` (`modesReport`, `designModes`); `GetModes` in
`packages/agent/src/workspace.ts`; the `modes` RPC in `apps/desktop/src/utility/agent.ts`; the `modes` operation and
schema in `packages/cli/src/operations.ts`, `describeModes` in `client.ts`, and the adapters in `mcp.ts` and `bin.ts`.

Tests: `packages/core/src/mode-report.test.ts` (viewport windows, a device's own height, resolved values including
defaults, theme classes and locale attributes, a design's main, beside, every-state and fixed-height frames).
`packages/agent/src/run.test.ts` (`GetModes` with and without a design, no writes or changes, and `unknown_design` with
alternatives). `packages/core/src/errors.test.ts` (a typo ranked first). `packages/cli/src/operations.test.ts` (CLI and
MCP defaults, a named design, structured output, invalid and unknown input, an unknown design's code and alternatives)
and `client.test.ts` (the text). Checked in the running app on `examples/shadcn-vite`: `parity modes dashboard`,
`parity modes`, and a mistyped design with `--json`. Gap: locale and custom variables are reported as set; whether a
project's code reads them is up to its decorators.

### Library import aliases (PAR-483)

A library installed under an alias uses that alias for its components, providers, icon modules and values made by the
package. Discovery resolves these module names once; the builder and icon picker use the resolved names. Literal
component data named `import` or `modules` stays unchanged. Inserting a part through its parent's render prop preserves
the parent's other slots. Library designs' `$call` factories are loaded even when no component sample, provider or icon
uses their modules; design-only `$import` props remain literal data.

Code: `remapLibraryImports` and `libraryImports` in `packages/core/src/library.ts`; `findLibraries` in
`packages/project/src/libraries.ts`; `guestModuleSource` and `iconImports` in `packages/builder-vite/src/index.ts`;
`iconCatalog` in `apps/desktop/src/renderer/chrome/icons.tsx`.

Tests: `packages/project/src/index.test.ts` (aliased entry modules, decorators, nested made values and icon subpaths),
`packages/core/src/library.test.ts` (one import traversal, ordinary data preserved and current-format-only reads),
`packages/core/src/library-insert.test.ts` (render-prop insertion preserves other slots), and
`packages/builder-vite/src/index.test.ts` (resolved icon modules, stable style keys and design-only factories), and
`apps/desktop/src/renderer/library-runtime.test.ts` (generated guest renders a placed library design with nested
design-only factories).
