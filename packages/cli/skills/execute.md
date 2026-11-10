# The `execute` tool

`execute` runs a JavaScript snippet against a working copy of one tab's designs. The functions below are globals.
`await` works at the top level. When the snippet finishes, every change lands on the canvas as one step the person can
undo; when it throws, nothing changes and you get an `editId` to fix it with.

The person, and other agents, can change the tab while your snippet runs. Only the designs your snippet changed, created
or deleted are applied, over what's there by then, so their edits to other designs, even in the same file, stay. If a
design you changed was changed or deleted in the meantime, or the modes were and you set them, nothing is applied and
the call fails naming it:

```text
Failed, nothing changed: Not applied: since this call read the tab, "Pricing" (app.par) was changed in the editor, and
this call changes it too. Run the call again to work from what's there now.
```

Run it again with its `editId` and no edits (`parity exec --edit-id <id>`, or `execute` with just `editId`): the snippet
reads the tab afresh, so it works from their change. Read the design again first if your snippet depends on what it
held.

- Prefer a `description` of 3 to 8 words, such as "Add a pricing section". CLI `exec` calls it `--label`. Both default
  to "Edit designs" if omitted.
- `Print(...)` (or `console.log`) is how you see values. Objects print as JSON.
- Values assigned without `const` or `let` carry over to your next snippet in the same tab.
- A snippet has 5 seconds of computing time. Rendering (screenshots and checks) doesn't count against it.
- To retry a failed snippet, send `editId` with `edits`, each an exact `{ find, replace }` on the snippet text (`all` to
  replace every match). Omitted edits default to an empty list. Do not send a new snippet with `editId`.
- Both CLI and MCP validate the same request: a nonblank snippet or `editId`, nonblank label and tab when supplied, and
  patches with a nonempty `find`, string `replace` (which can be empty), and optional boolean `all`. Invalid requests
  are rejected before reaching the app.

### Warnings

A call that applies can still return warnings. Each finding comes once, with every place it was found. The text puts
them under "Render failures", "Warnings" and "Suggestions". The structured result's `warningGroups` gives each one's
`category`, `severity` (`error`, `warning` or `suggestion`), `message`, `count` and `at`, which lists the places as
`design/node` paths or frames. A render failure means a screenshot or check is missing for that frame, so look into it
first. `unnamed_layout` is a suggestion for layouts this call added: give each one a name with `Update`.

```js
// Unnamed rows come back as one suggestion, such as 12 places (team-members/k3x9a, … and 7 more). Name them:
const rows = Get("team-members", (node, at) => (node.type === "layout" && !node.name ? at.path : undefined))
rows.forEach((path, index) => Update(path, { name: `Member row ${index + 1}` }))
```

## API

```ts
// Reading
Designs(): DesignSummary[]                       // every design: id, name, kind, states, what it shows, size
GetDesign(design): Design                        // a whole design, as in document.md
Get(path, { depth?, state?, mode? }?): Node      // a design's root or a node; depth cuts children off with "…"
Get(path?, visit): any[]                         // walks nodes, collecting what visit returns
Get(path, visit, { state?, mode? }): any[]       // walks nodes as a frame draws them
Components(): string[]                           // the components designs can use
Props(component, { all? }?): PropsInfo           // a component's props, from its source
Icons(): IconSet[]                               // the project's icon sets, with their styles
Icons(set, { search?, style?, limit? }): Icon[]  // async: a set's icons, as component nodes name them
GetTokens({ category?, source?, search?, nearest? }?): Token[]   // nearest: the closest to a colour or length first
GetModes(design?): { settings, variables, viewports, modes, designs }   // modes resolved; what each design shows
Selection(): { design?, node?, mode? }           // what the person has selected

// Designs
CreateDesign({ name, kind?, root?, x?, y?, width?, height?, file?, baseState? }): string   // the new design's id
UpdateDesign(design, { name?, kind?, x?, y?, width?, height?, mode?, showModes?, state?, allStates? }): void
DeleteDesign(design): void

// Nodes
Insert(parent, node, { index?, slot? }?): string // returns the new node's id
Update(path, change, { state? }?): void          // change: name, text, tag, hidden, props, args, style, unset, component
Replace(path, node): string
Move(path, parent, { index?, slot? }?): void     // within one design
Copy(path, parent, { index?, slot?, name? }?): string
Delete(path): void
Responsive(path, viewport, patch | null): void   // a patch for one viewport, or null to remove it

// States
AddState(design, { name, changes? }): string     // changes keyed by node id or name
UpdateState(design, state, { name?, changes? }): void
DeleteState(design, state): void

// Components
FindRepeats(design): Repeat[]                    // parts that repeat with the same structure
ExtractComponent(design, nodes, { name, params?, file? }): string

// Modes and tokens
SetModes(settings): void                         // replaces the project's modes
SetTokens({ name: value | { theme: value } }): void

// Checking
Screenshot(design, { state?, mode?, scale? }?): number
Measure(design, { state?, mode? }?): Layout      // one frame: one state id, one mode id
Problems(design, { state?, mode? }?): Problem[]
Accessibility(design, { state?, mode? }?): Finding[]

// The canvas
FindEmptySpace({ width, height, direction?, near?, padding? }): { x, y }
Overlaps(design?): Overlap[]
Print(...values): void
```

Every function checks its arguments before it does anything. A wrong one fails the call with an `invalid_input` error
whose path names it, and the message starts with that path:

- An option or field by its key: `width`, `style/gap`, `changes/title/text`.
- A node by `node` (or `root` in `CreateDesign`) and where in it: `node/fontSize: unknown property`.
- Any other argument by its name: `design`, `path`, `patch`, `nodes`.

An option a function doesn't take is an error too, so check its spelling against the list above.

## Paths

A design is named by its id or its name. A node is named by `design/node`, where `node` is the node's id or its name, or
by its id alone when only one design has that id. Names aren't unique, so prefer ids once you have them; `Insert`,
`Copy` and `CreateDesign` return them, and nodes you create with a `name` are listed under "Created" in the result.

A state is named by its id only, as `Designs()` lists it and `AddState` returns it. A state's name in its place fails
with `unknown_state`, and the error names the id it belongs to.

## Reading

### Designs

Lists every design with its `id`, `name`, `kind` (`screen`, `component` or `frame`), `states`, and `showing`: the state
on the canvas, the main mode and the modes beside it. Start here to find ids.

### Get

`Get("dashboard", { depth: 2 })` returns the design's root with two levels of children; deeper ones show as `"…"`. Read
a branch with a node path, as in `Get("dashboard/Stats", { depth: 2 })`. Without `state` or `mode`, Get returns the
nodes as stored, which is what `Update` and the other edits change.

With `state`, `mode` or both, Get returns the nodes as that frame of the board draws them: the design's variant options
(`view.variants`), its params' defaults filled into bound values, its responsive patches for the mode, then the state's
patches. `mode` is a mode id from `GetModes()`, as Screenshot takes. A state alone is read in the design's main mode,
and a mode alone in the state the design shows. A bound value comes back filled in, with its `bind` kept so you can tell
it comes from a param. An instance comes back as its own node with the args it's drawn with; read what's inside it by
its path, `design/instance/inner`, which only works with `state` or `mode`.

```js
// A component whose title is bound to its "title" param: stored, then as the board shows it.
Print(Get("card/title").text) // "Title"
Print(Get("card/title", { state: "base" }).text) // "Card title", the param's default
// A copy of the card on a screen, inside the instance, in a state and on mobile.
Print(Get("profile/person/title", { state: "selected", mode: "mobile-light" }).text) // "Selected"
```

`Get(path, visit)` walks the nodes under `path`, or every design without one, and returns what `visit` returns for each.
`visit(node, { design, path, depth, index, parent, skipChildren })`. Return `undefined` to collect nothing. Given a
path, `Get(path, visit, { state, mode })` visits the nodes as that frame draws them, as above.

```js
// Every Button in the project, with where it is.
Print(Get((node, at) => (node.type === "component" && node.component === "Button" ? at.path : undefined)))
```

### Components and Props

`Components()` is everything a `component` node can name. `Props("Button")` returns the props found in the component's
source: variants with their options (`variant`, `size`), its own props, including those a library's component adds to
its element's (Nova's `isActive`), and with `{ all: true }` the attributes it passes to its element. A prop that isn't
listed, or a variant value outside its options, comes back as a warning.

Its `composition` says what it needs around it and holds, before you insert it:

- `role` is `provider` for one that draws nothing and gives the parts inside it their context (`SidebarProvider`),
  `wrapper` for one other parts go inside (`Sidebar`), and `component` otherwise.
- `parents` is `listed`, with the `chain` it goes inside, outermost first, and where its library learned that; `none`;
  or `unknown`, with the `reason`, such as a project component that hasn't drawn yet or an error asking for a provider.
  An `optional` parent is left out when the ones outside it are already there.
- `holds` lists the parts that go directly inside it, and `slots` the `key` each slot's layers go under.
- `example.node` is the component inside its parents with its sample, as the Assets panel inserts it and the Components
  panel draws it. `example.status` is `drawn` once the component has drawn on the canvas, `failing` with a `reason`, or
  `untried`.

```js
// A sidebar goes inside its provider: insert the example, then fill it in.
const { composition } = Props("nova/Sidebar")
Print(composition.parents.chain.map((parent) => parent.component))
const sidebar = Insert("settings/Content", composition.example.node)
```

Writing the layers yourself works the same way. A provider draws nothing of its own, so the Components panel leaves it
out, but `Components()` lists it, since the parts inside it throw without it. A part placed without its provider shows
in `Problems` as a render error that names it.

```js
// A Nova sidebar, inside the provider its parts need.
const part = (component, props, children) => ({ type: "component", component, props, slots: { children } })
const item = (label, isActive) =>
  part("nova/SidebarMenuItem", {}, [
    { type: "component", component: "nova/SidebarMenuButton", props: { isActive, children: label } }
  ])
CreateDesign({
  name: "App sidebar",
  root: {
    type: "layout",
    name: "Frame",
    style: { width: 280, height: 400 },
    children: [
      part("nova/SidebarProvider", {}, [
        part("nova/Sidebar", { collapsible: "none" }, [
          part("nova/SidebarContent", {}, [
            part("nova/SidebarMenu", {}, [item("Dashboard", true), item("Members", false)])
          ])
        ])
      ])
    ]
  }
})
```

### Icons

`Icons()` lists the project's icon sets: each one's `id`, `name`, `package`, `styles` (such as `outline` and `solid`,
empty when it has one) and the `style` used when none is asked for. An icon is a component node named `<set>/<Icon>`,
with no children. `await Icons("lucide", { search: "settings" })` finds icons by name, by the other names the set
exports them under and by the tags it publishes, best first; each comes back with its `label` and the `component` (and
`props`, for sets that take the style as a prop) to insert it with. Without `search` it lists the set's icons in order.
It returns 50 unless `limit` says otherwise, in the set's default style unless `style` names another.

```js
// A settings button with the project's own settings icon.
const [icon] = await Icons(Icons()[0].id, { search: "settings", limit: 1 })
Insert("dashboard/Toolbar", {
  type: "component",
  component: "Button",
  props: { variant: "ghost", "aria-label": "Settings" },
  slots: { children: [{ type: "component", component: icon.component, props: icon.props }] }
})
```

### GetTokens

Each token has a `name`, a `category` (`color`, `font-size`, `radius`, `shadow`, `spacing`, `font`, `font-weight`,
`leading`, `tracking` and others), a `source` (`semantic` for the project's own variables, `theme` for its styling
framework's scale, `keyword` for a framework keyword the style fields also take) and its `values` per theme. Filter with
`GetTokens({ category: "color", source: "semantic" })` or `GetTokens({ search: "radius" })`.

A design handed over often has colours and sizes that aren't tokens, such as `#2f6fed` or `13px`. `nearest` lists the
tokens closest to one first, each with its `distance`, and leaves out tokens that can't be compared: only colours for a
colour, only lengths for a length. A colour is hex or `oklch()`, and its distance is how different the two look (under
0.02 looks the same). A length is px or rem, and its distance is in pixels; give it a category, since a radius, a type
size and a spacing step are all lengths. Ties go to the project's own semantic tokens. Use the nearest token, and tell
the person when it's far from what the design asked for.

```js
// The design asks for #2f6fed text at 13px: use the tokens nearest them.
const [color] = GetTokens({ nearest: "#2f6fed", category: "color" })
const [size] = GetTokens({ nearest: "13px", category: "font-size" })
Update("signup/Title", { style: { foreground: color.name, size: size.name } })
```

For a circle or a pill, use `radius-full`, Tailwind's `rounded-full`. It's listed under `radius` with
`source: "keyword"`, and frames draw it as round as the box allows, at any size:

```js
Update("avatar", { style: { width: 10, height: 10, radius: "radius-full" } })
```

### Selection

What the person has selected: the design's id, and the node and mode when they picked one. "This", "here" and "the
selected one" usually mean it.

## Designs

### CreateDesign

Makes a design and returns its id. Without `root` it starts as a page layout with padding, a gap and the background and
foreground colours. Without `x` and `y` it goes into empty space. `kind: "component"` makes a component design, which
screens place as instances; most component designs come from `ExtractComponent` instead, because that also gives them
params.

`kind: "frame"` makes a frame, the light kind for sketching an idea before it's a screen or a component: an empty padded
layout, drawn once at its own `width` and `height` in the project's primary mode. A frame has one state, no params and
no modes beside it, and no code is written from it, so `AddState`, `showModes` or another `mode` on one fail with
`invalid_input`. Turn it into a screen or a component when it needs them.

```js
const sketch = CreateDesign({ name: "Sketch", kind: "frame", width: 480, height: 320 })
Insert(sketch, { type: "text", tag: "h2", text: "Pricing ideas" })
await Screenshot(sketch)
UpdateDesign(sketch, { kind: "screen" }) // keeps its layers, and its size in the primary viewport
```

### UpdateDesign

Renames or moves a design, or changes how it's shown: `mode` sets the main frame's mode, `showModes` the modes beside
it, `state` the state on the canvas, and `allStates: true` shows every state in its own row. None of these change the
design itself. `width` and `height` resize a frame.

`kind` turns a design into another kind. Turned into a frame, a design keeps its layers as its board drew them in the
base state, with its params' values filled in, and drops its other states, the modes beside it, its params and its
variants; the call's warnings say what went.

## Nodes

### Insert

Adds a node, with everything inside it, as the last child of `parent` or at `index`. Into a component node, it goes into
the `children` slot unless `slot` names another. Every node gets a fresh id; don't pass ids. `parent` can be a design,
meaning its root.

```js
const form = Insert("settings/Content", {
  type: "layout",
  name: "Profile form",
  style: { gap: 4, maxWidth: 120 },
  children: [
    { type: "component", component: "Label", props: { htmlFor: "name", children: "Name" } },
    { type: "component", component: "Input", props: { id: "name", defaultValue: "Avery Chen" } },
    { type: "component", component: "Button", props: { children: "Save changes" }, style: { self: "start" } }
  ]
})
```

### Update

Changes a node. `change` takes `name`, `text`, `tag`, `hidden`, `props`, `args` (an instance's values), `style`, `unset`
and `component`. `props`, `args` and `style` merge with what's there; set a key to `null` to remove it.

With `{ state: "loading" }` the change belongs to that state instead of the base design, and `null` takes back the
state's change to that key. A state can change only `hidden`, `text`, `props`, `style` and `unset`. To turn off in one
state what the base sets, list it in `unset`:
`Update(button, { unset: { props: ["disabled"], style: ["gap"] } }, { state: "ready" })`. In the base design, `unset`
removes the keys as `null` does.

### Replace, Move, Copy and Delete

`Replace` swaps a node for a new one in the same place and returns its id. `Move` reorders or reparents a node within
its design; to move it to another design, `Copy` it there and `Delete` the original. `Copy` gives the copy fresh ids and
returns the new id. A design's root can't be deleted; use `Replace`.

The new node and everything in it get fresh ids, so `Replace` throws away the patches on the old node and what was
inside it: its `Responsive` patches, its changes in every state and its variant options' patches. Replacing a design's
root clears every state's changes. To keep a node's patches, change it with `Update` instead. The result lists what went
under "Discarded by Replace" (`discarded` in structured output), with each node's viewports, states and variants:

```text
Discarded by Replace (reapply what you still want to the new node):
  dashboard/stats, now k3x9a:
    Stats (stats): viewports mobile
```

Put back the ones you still want on the new ids, in the same call or the next. A state's changes go back with
`UpdateState(design, state, { changes: { [id]: … } })`.

```js
const stats = Replace("dashboard/Stats", { type: "layout", name: "Stats", style: { direction: "row", gap: 16 } })
Responsive(stats, "mobile", { style: { direction: "column" } })
```

### Responsive

Patches a node in one viewport: `Responsive("dashboard/Stats", "mobile", { style: { columns: 1 } })`. The viewport is a
viewport option's id from the modes (such as `desktop`, `tablet` and `mobile`), not a mode's id. Patches take `hidden`,
`text`, `props` and `style`, and merge with the viewport's earlier patch. `null` removes it.

## States

A state is a situation the whole design is in, like a story: loading, empty, error, signed out. It stores only what
differs from the base. `changes` maps node ids or names to patches (`hidden`, `text`, `props`, `style`); `null` clears a
node's patch. The first state is the base.

```js
AddState("team-members", {
  name: "Empty",
  changes: {
    "Members table": { hidden: true },
    "Empty state": { hidden: false },
    seats: { props: { children: "1 of 10 seats used" } }
  }
})
```

Put the parts only some states show into the base design with `hidden: true`, then show them in those states. A text
node's words are its `text`; a component's are usually its `children` prop.

## Components

### FindRepeats

Returns parts of a design that repeat with the same structure: each has the root ids of its occurrences (`nodes`), a
starting `name`, and the `params`, which are what differs between occurrences (texts, props, whether a node shows).

### ExtractComponent

Turns occurrences into a component design and replaces each with an instance that keeps its own content as args. Returns
the component's id. `params` renames the params found, by the name they were given. It refuses when the result wouldn't
render the same in every state and viewport.

Look at what `FindRepeats` found before extracting, because the params' names are only a start:

```js
repeats = FindRepeats("team-members")
Print(repeats)
```

Then, in the next snippet, extract with names that say what each param is:

```js
const [rows] = repeats
ExtractComponent("team-members", rows.nodes, { name: "Member row", params: { [rows.params[0].name]: "name" } })
```

## Modes and tokens

`SetModes(settings)` replaces the project's modes: take `GetModes().settings`, change it, and pass it back. Modes are
shared by every design.

`GetModes()` also gives `viewports`, the ids `Responsive` takes, each with its width and window height; `modes`, the ids
`Screenshot` and the checks take, each with its `values` (one option per variable), width, window height, classes and
attributes; and `designs`, each design's `state` (or `states` when it shows every state), `main` mode and `beside`
modes. `GetModes("dashboard")` gives just that design, with each frame's width, fixed `height` if it has one, and
`window`.

```js
const { viewports, designs } = GetModes("dashboard")
Print(viewports.map((viewport) => viewport.id)) // ["desktop", "tablet", "mobile"]: for Responsive
Print(designs[0].frames.map((frame) => `${frame.mode} ${frame.window.width}x${frame.window.height}`))
```

`SetTokens` changes token values in the project's stylesheets: `SetTokens({ primary: "oklch(0.55 0.2 260)" })` for every
theme, or `SetTokens({ primary: { default: "…", dark: "…" } })` per theme. Every frame shows the new values at once, and
saving writes them into the project's code, so do it only when the person asks to change the design system, not to style
one design. They're undone with the call's other changes.

`SetTokens` refuses a value the Tokens panel would refuse, throwing an `invalid_input` error that names the token and
theme and says what's wrong: a bracket or quote left open, a `var()` naming no token, or a token built on itself. None
of that call's values are kept. A value that isn't its token's kind (`"bluish"` for a color) is refused when the call
ends, and then nothing in the call is applied.

```js
SetTokens({ primary: { default: "oklch(0.55 0.2 260)", dark: "var(--foreground)" } })
try {
  SetTokens({ primary: "oklch(0.55 0.2 260" })
} catch (error) {
  Print(error.message) // SetTokens/primary/default: A bracket isn't closed. Add ) at the end.
}
```

## Checking

`Screenshot` renders frames offscreen at their real widths and returns how many it took; the images come back with the
result. `state` and `mode` take an id, a list, or `"all"`; `mode` also takes `"shown"`, the modes the design shows. The
defaults are the state on the canvas and the main mode.

Frames draw as the canvas does: instances of a library's component designs (from its `.lib.par`) draw that design, and
token values not yet saved show, the person's edits and this call's own `SetTokens` alike, so
`SetTokens({ primary: "red" }); await Screenshot(id)` shows the new value in the same call.

`Measure` lays out one frame and returns its state, mode and size, whether it overflows sideways, and every node's box
with the node it's drawn inside (`parent`); a node an ancestor cuts off has `clipped` and that ancestor's box in `clip`.
A node whose element the project's code writes, such as a component's, has `source`: the file, line and column, as
`src/components/ui/button.tsx:44:5`, to open or edit. Parity's own layers have none. `Problems` checks frames for render
errors, overflow, clipping and unknown components. Each layout problem has its `kind`: `frame-overflow` for a node that
sticks out of the frame, by its position or its width, or `clipped` for one an ancestor that hides overflow cuts off. It
names the `node`, its `box`, the `container` it overflows (the clipping node, or the frame, which has no `node`) with
that box, and the pixels past each edge in `overflow`. A node past a parent that doesn't clip, inside the frame, shows,
so it isn't a problem; children going no further than a reported parent are left out.

```js
const id = CreateDesign({ name: "Checkout" })
Insert(id, { type: "component", component: "Button", name: "Pay", props: { children: "Pay" } })
// Each one, such as { kind: "frame-overflow", node: "pay", name: "Pay", box: { x: 340, y: 100, width: 60, height: 36 },
// container: { box: { x: 0, y: 0, width: 390, height: 600 } }, overflow: { right: 10 }, problem: "at x 340, …" }
for (const problem of await Problems(id, { mode: "shown" })) Print(problem.kind, problem.name, problem.overflow)
const layout = await Measure(id)
Print(
  layout.state,
  layout.mode,
  layout.nodes.map((node) => `${node.id} in ${node.parent}`)
)
```

`Measure` takes one state id and one mode id, because it returns one frame's layout. A list, `"all"` or `"shown"` fails
with `invalid_input`, naming the ids it takes. To measure several frames, call it once for each; every layout says which
state and mode it drew:

```js
const signup = Designs().find((design) => design.id === "signup")
const layouts = []
for (const state of signup.states) {
  for (const mode of [signup.showing.mode, ...signup.showing.beside]) {
    layouts.push(await Measure("signup", { state: state.id, mode }))
  }
}
for (const layout of layouts) Print(`${layout.state} in ${layout.mode}: ${layout.width} × ${layout.height}`)
```

`Accessibility` returns axe-core's findings per node and frame, with the rule, its impact and what's wrong.

These frames are drawn in the same window as the canvas's: as wide as the frame, and as tall as the design's fixed
height for the viewport, else the viewport's screen height, else the device nearest its width. So `100vh` and window
size checks measure the same in `Measure` and `Screenshot` as on the canvas, even when the frame grows past that height.

## The canvas

`FindEmptySpace({ width, height })` finds room for a board that size, to the right of the others unless
`direction: "below"`, or next to the design named in `near`. Its default `padding` of 240 leaves room for the board's
title. Give it the size the board will be: `Designs()` has a drawn board's `width` and `height`.

`Overlaps()` checks every board on the canvas and lists each pair that's too close, in one of two kinds:

- **A collision:** the boards themselves overlap.
- **Title clearance:** `titleOnly: true`. The boards are clear, but the lower one starts less than 160 below the upper
  one, so the title the canvas draws above it covers the upper board.

`width` and `height` are the area they share, title band included. Move one with `UpdateDesign(design, { x, y })`.

A board is as big as the canvas last drew it, so its size is measured. One it hasn't drawn yet is sized from its frames,
laid out as the canvas lays them out: each shown mode's frame size (`frames` on the design, else the mode's width),
companions shrunk to 640 wide, and a frame without a fixed height as tall as its window. A pair with an estimated board
says `estimated: true`; without it, both sizes are measured.

```js
// With the default modes: a 1280 main frame, the dark one beside it at half size and the 390 phone, 2505 wide in all.
const dashboard = CreateDesign({ name: "Dashboard", x: 0, y: 0 })
UpdateDesign(dashboard, { showModes: ["desktop-dark", "mobile-light"] })
CreateDesign({ name: "Settings", x: 2200, y: 0 })
Print(Overlaps(dashboard)) // Dashboard and Settings, 305 across, estimated: true
```

An execute call's own warnings cover only the boards it creates, changes or moves: `overlap` for a collision and
`title_clearance` for a title too close. Other crowded boards are counted in one `canvas_overlaps` suggestion, so a call
that changes nothing, or only reads, doesn't make a crowded canvas look clear. To audit the canvas, call `Overlaps()`:

```js
for (const { names, titleOnly, estimated } of Overlaps()) {
  const kind = titleOnly ? "a title covers a board" : "the boards collide"
  Print(`${names.join(" and ")}: ${kind}, ${estimated ? "estimated" : "measured"}`)
}
// Room below Settings for a board 1400 wide and 1000 tall, and its title above it.
const room = FindEmptySpace({ width: 1400, height: 1000, near: "settings", direction: "below" })
CreateDesign({ name: "Plans", x: room.x, y: room.y })
```

## Examples

A new screen, checked in every state and mode:

```js
const id = CreateDesign({ name: "Billing" })
Insert(id, { type: "text", tag: "h1", text: "Billing", style: { size: "text-2xl", weight: 600 } })
Insert(id, {
  type: "component",
  component: "Card",
  name: "Plan",
  slots: {
    children: [
      {
        type: "component",
        component: "CardHeader",
        slots: {
          children: [
            { type: "component", component: "CardTitle", props: { children: "Pro plan" } },
            { type: "component", component: "CardDescription", props: { children: "$24 per seat, billed monthly" } }
          ]
        }
      }
    ]
  }
})
await Screenshot(id, { state: "all", mode: "shown" })
Print(await Problems(id, { state: "all", mode: "shown" }))
```

A loading state that swaps content for skeletons:

```js
Update("dashboard/Stats loading", { hidden: true })
AddState("dashboard", { name: "Loading", changes: { Stats: { hidden: true }, "Stats loading": { hidden: false } } })
```
