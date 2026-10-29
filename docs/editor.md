# The editor

What Parity's canvas editor does, how each part of it works, and the tests that keep it working. You asked on 2026-10-29
for every piece of editor work to land with tests and a description here, so nothing gets lost or quietly breaks.
Shortcuts are listed once, in the keymap ([chrome/keymap.ts](../apps/desktop/src/renderer/chrome/keymap.ts)) and the
Keyboard shortcuts dialog; this page says what they do. What's decided and why is in [decisions.md](decisions.md).
Features built before 2026-10-29 are being added under DOC-2 in the [backlog](backlog.md).

## How to keep it

- **Each feature has a section** under its area: what it does from the person's side, the rules it follows, including
  the edge cases, where its code is, and the tests that cover it, by file.
- **Change the section in the same commit as the feature.** A behaviour that changes while its section doesn't is a
  regression nobody will notice.
- **Name the gaps.** When part of a feature has no automated test, its section says so and how it was checked instead.

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
  unless nothing else is drawn.
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

Gaps: no automated test drives the canvas's pointer handling over such a component. Hovering, double-clicking to select,
the outline and size label, dragging to reorder, the inspector's note and its Wrap in layout were checked in an isolated
copy of the app, on a copy of the example with a `MemberRow({ member })`, a fragment and an email field added, on
2026-10-29. A component that declares `style` but puts it on an inner element, as a field passing it to its input, is
outlined around the field but sized at the input, and the note doesn't say so. A component layer in a slot doesn't get
the props its parent hands it: a `Button asChild` around a `Link` layer leaves the link without the button's class,
attributes and handlers, and a `$renderWith:` slot's component layer without what it's rendered with. Both clone the
slot's element, which for a component layer is the guest's error boundary around it, and the boundary drops them. An
element layer gets them. This is older than CAN-45: the boundary dates from the first commit and `$renderWith:` from
7c9c8c3.

## Moving, reordering and resizing

Dragging layers and designs, where they land, resize handles and duplicates.

## Keyboard

What the keys do on the canvas, and when they belong to a design or a field instead.

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

Gaps: none known. The whole flow (Tab on the Sign in screen, N after it, typing in Interact, Escape back) was also
checked in an isolated copy of the app on the example project.

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
- **Moving a layer by 1px** waits for CAN-80, since it would leave the spacing scale.
- **Layers inside an instance don't move,** as they can't be dragged.
- **The keys.** On the canvas, the arrows with Ctrl or Alt do nothing, so tldraw never moves a design behind the
  keymap's back. On a focused control, such as a Layers row, the arrows stay the control's. A layer that moves stays in
  view.

Code: `apps/desktop/src/renderer/canvas/nudge.ts` (the rules, which take data and return data, and `frameDrawn`, which
reads a layout's direction and a layer's drawn insets from its frame), `chrome/commands.ts` (`nudge`),
`chrome/actions.ts` (`byKey` keeps it out of Search actions), `chrome/keymap.ts` and `chrome/keys.ts` (the arrows are
written `←`, `→`, `↑` and `↓`), and `canvas/shortcuts.ts`, which passes the key event to the action and keeps the other
arrows from tldraw.

Tests:

- `apps/desktop/src/renderer/canvas/nudge.test.ts`: reading a flow from computed styles (rows, columns, reversed, right
  to left, grids as laid out or as written, blocks); how far each arrow moves in each; reordering a layer, a block, past
  absolutely placed layers and down a grid; moving insets from each side, both sides, tokens and unset sides with and
  without where they're drawn; nudging a design's layers in a state, following the frame's direction, and leaving
  instances alone; and, with the real stores, a run of presses as one undo step, a pause or a new selection starting
  another, designs moving together and a mode column and a note moving.
- `apps/desktop/src/renderer/ModeView.test.ts`: `frameDrawn` reads a row, a column and a grid's columns from a design
  rendered as the canvas renders it, and an absolutely placed layer's insets in steps, at full size and at half scale.
- `apps/desktop/src/renderer/chrome/keymap.test.ts`: the arrows match with and without Shift, and show as `⇧←` on a Mac.

Gaps: the key handler's wiring (an arrow reaching `nudge`, Ctrl and Alt arrows kept from tldraw, the layer kept in view)
has no automated test; it was checked in an isolated copy of the app on the example project, with a row of Pricing's
texts, a stretched layer on Calendar, and the Pricing design.

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
layer picked last, and designs by kind. `chrome/keymap.test.ts` checks the keys, Option for Alt on a Mac included.

Gaps: the menu items were checked by hand in an isolated copy of the app; no story covers them.

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
selected). The zoom was checked in an isolated copy of the app.

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

Code: `apps/desktop/src/renderer/canvas/paste-over.ts` (`placeOver`, `designsAt` and `replaceLayers`) and, in
`canvas/clipboard.ts`, `pasteOverSelection` and `pasteToReplace`, with reading the clipboard (`readClipboard`) and
saving an image (`importImage`) shared with Paste.

Tests: `apps/desktop/src/renderer/canvas/paste-over.test.ts`. Paste over selection: after the selected layer with
nothing removed, once after the last of several, beside a selected component, on top of an absolutely placed layer at
its insets, in a component's slot, leaving the root and instances' layers alone, designs at the selection's corner as
they sat, and new ids for designs whose ids are taken. Paste to replace: in place of one layer, fresh ids and states'
changes dropped, each of several layers, in a component's slot, at an absolutely placed layer's insets, and leaving the
root and instances' layers alone. `chrome/keymap.test.ts` checks both keys, and that Ctrl+R still renames.

Gaps: reading the clipboard and the messages have no automated test. Both pastes, over layers and designs, and
Ctrl+Shift+R not reloading the window, were checked in an isolated copy of the app, with the page's clipboard standing
in for the system's.

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
- **Off the spacing scale, until CAN-80.** Before, a length field read steps and took any number, so `7.3` became
  29.2px, which Tailwind can't write as a class, without a word. Now a typed length lands on the nearest half step (2px
  with a 4px unit), which is what Tailwind's scale lists below 4 and what dragging already writes, and the field says so
  under its row: "Snapped to 282px, the nearest step on the spacing scale". A value already off it shows as it is (29.2)
  until it's edited. Keeping and flagging lengths off the scale is CAN-80.
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
  returns data; it can move to `@parity/editor` when PKG-4 makes it.
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

Gaps: the inspector's wiring (`LayerPanel`, `MultiPanel` and `StylePreview` against the real store and frames) has no
automated test. It was checked in an isolated copy of the app on the example project on 2026-10-29, on Pricing's Brand
mark: typing 320 in Width previewed at each keystroke in 25, 25 and 41 ms (a commit took 291 ms to show before) and
Enter made 320px as one undo step, with focus kept; `16px` gave 16px; 281 gave 282px with its note; `abc` stayed with
its reason; a value set underneath left `12` in the field; Up, Shift+Up and Down gave 36, 76 and 72px as one undo step;
`50-10` in Opacity gave 40; scrubbing the Width label previewed in 22 ms and made one undo step; and `Mixed+8` on Brand
mark and Plans gave 40px and 1208px. The stories' play functions weren't run in Storybook. Number props don't preview,
since a prop change has to draw the component again; they take maths and are made on Enter, as before. In a 320px
inspector, Width and Height show about three characters of what's typed (CAN-75).
