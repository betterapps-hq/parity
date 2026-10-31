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

## API

```ts
// Reading
Designs(): DesignSummary[]                       // every design: id, name, kind, states, what it shows, size
GetDesign(design): Design                        // a whole design, as in document.md
Get(path, { depth?, state? }?): Node             // a design's root or a node; depth cuts children off with "…"
Get(path?, visit): any[]                         // walks nodes, collecting what visit returns
Components(): string[]                           // the components designs can use
Props(component, { all? }?): PropsInfo           // a component's props, from its source
Icons(): IconSet[]                               // the project's icon sets, with their styles
Icons(set, { search?, style?, limit? }): Icon[]  // async: a set's icons, as component nodes name them
GetTokens({ category?, source?, search? }?): Token[]
GetModes(): { settings, modes }                  // the project's modes, and each resolved
Selection(): { design?, node?, mode? }           // what the person has selected

// Designs
CreateDesign({ name, kind?, root?, x?, y?, file?, baseState? }): string   // returns the new design's id
UpdateDesign(design, { name?, kind?, x?, y?, mode?, showModes?, state?, allStates? }): void
DeleteDesign(design): void

// Nodes
Insert(parent, node, { index?, slot? }?): string // returns the new node's id
Update(path, change, { state? }?): void          // change: name, text, tag, hidden, props, args, style, component
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
Measure(design, { state?, mode? }?): Layout
Problems(design, { state?, mode? }?): Problem[]
Accessibility(design, { state?, mode? }?): Finding[]

// The canvas
FindEmptySpace({ width, height, direction?, near?, padding? }): { x, y }
Overlaps(design?): Overlap[]
Print(...values): void
```

## Paths

A design is named by its id or its name. A node is named by `design/node`, where `node` is the node's id or its name, or
by its id alone when only one design has that id. Names aren't unique, so prefer ids once you have them; `Insert`,
`Copy` and `CreateDesign` return them, and nodes you create with a `name` are listed under "Created" in the result.

## Reading

### Designs

Lists every design with its `id`, `name`, `kind` (`screen` or `component`), `states`, and `showing`: the state on the
canvas, the main mode and the modes beside it. Start here to find ids.

### Get

`Get("dashboard", { depth: 2 })` returns the design's root with two levels of children; deeper ones show as `"…"`. Read
a branch with a node path, as in `Get("dashboard/Stats", { depth: 2 })`. With `state`, the result shows the nodes as
that state changes them.

`Get(path, visit)` walks the nodes under `path`, or every design without one, and returns what `visit` returns for each.
`visit(node, { design, path, depth, index, parent, skipChildren })`. Return `undefined` to collect nothing.

```js
// Every Button in the project, with where it is.
Print(Get((node, at) => (node.type === "component" && node.component === "Button" ? at.path : undefined)))
```

### Components and Props

`Components()` is everything a `component` node can name. `Props("Button")` returns the props found in the component's
source: variants with their options (`variant`, `size`), its own props, and with `{ all: true }` the attributes it
passes to its element. A prop that isn't listed, or a variant value outside its options, comes back as a warning.

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
framework's scale) and its `values` per theme. Filter with `GetTokens({ category: "color", source: "semantic" })` or
`GetTokens({ search: "radius" })`.

### Selection

What the person has selected: the design's id, and the node and mode when they picked one. "This", "here" and "the
selected one" usually mean it.

## Designs

### CreateDesign

Makes a design and returns its id. Without `root` it starts as a page layout with padding, a gap and the background and
foreground colours. Without `x` and `y` it goes into empty space. `kind: "component"` makes a component design, which
screens place as instances; most component designs come from `ExtractComponent` instead, because that also gives them
params.

### UpdateDesign

Renames or moves a design, or changes how it's shown: `mode` sets the main frame's mode, `showModes` the modes beside
it, `state` the state on the canvas, and `allStates: true` shows every state in its own row. None of these change the
design itself.

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

Changes a node. `change` takes `name`, `text`, `tag`, `hidden`, `props`, `args` (an instance's values), `style` and
`component`. `props`, `args` and `style` merge with what's there; set a key to `null` to remove it.

With `{ state: "loading" }` the change belongs to that state instead of the base design. A state can change only
`hidden`, `text`, `props` and `style`.

### Replace, Move, Copy and Delete

`Replace` swaps a node for a new one in the same place and returns its id. `Move` reorders or reparents a node within
its design; to move it to another design, `Copy` it there and `Delete` the original. `Copy` gives the copy fresh ids and
returns the new id. A design's root can't be deleted; use `Replace`.

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

`SetTokens` changes token values in the project's stylesheets: `SetTokens({ primary: "oklch(0.55 0.2 260)" })` for every
theme, or `SetTokens({ primary: { default: "…", dark: "…" } })` per theme. Every frame shows the new values at once, and
saving writes them into the project's code, so do it only when the person asks to change the design system, not to style
one design. They're undone with the call's other changes.

## Checking

`Screenshot` renders frames offscreen at their real widths and returns how many it took; the images come back with the
result. `state` and `mode` take an id, a list, or `"all"`; `mode` also takes `"shown"`, the modes the design shows. The
defaults are the state on the canvas and the main mode.

Frames draw as the canvas does: instances of a library's component designs (from its `.lib.par`) draw that design, and
token values not yet saved show, the person's edits and this call's own `SetTokens` alike, so
`SetTokens({ primary: "red" }); await Screenshot(id)` shows the new value in the same call.

`Measure` lays out one frame and returns its size, whether it overflows sideways, and every node's box (`clipped` when a
parent cuts it off). `Problems` checks frames for render errors, overflow, clipping and unknown components.
`Accessibility` returns axe-core's findings per node and frame, with the rule, its impact and what's wrong.

## The canvas

`FindEmptySpace({ width, height })` finds room for a new board, to the right of the others unless `direction: "below"`,
or next to the design named in `near`. `Overlaps()` lists boards that collide, titles included; move one with
`UpdateDesign(design, { x, y })`. A board is as big as the canvas last drew it. One it hasn't drawn yet is sized from
its frames, laid out as the canvas lays them out: each shown mode's frame size (`frames` on the design, else the mode's
width), companions shrunk to 640 wide, and a frame without a fixed height as tall as its window. Those overlaps say
`estimated: true`.

```js
// With the default modes: a 1280 main frame, the dark one beside it at half size and the 390 phone, 2505 wide in all.
const dashboard = CreateDesign({ name: "Dashboard", x: 0, y: 0 })
UpdateDesign(dashboard, { showModes: ["desktop-dark", "mobile-light"] })
CreateDesign({ name: "Settings", x: 2200, y: 0 })
Print(Overlaps(dashboard)) // Dashboard and Settings, 305 across, estimated: true
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
