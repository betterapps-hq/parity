# States and modes

A design shows on the canvas as a grid of frames: its states down, and the modes it shows across. Both multiply what you
have to check, and both are cheap to add, so use them instead of copying designs.

## States

A state is one situation the design can be in. Most screens need some of these:

| State          | What changes                                                                 |
| -------------- | ---------------------------------------------------------------------------- |
| Loading        | Content swaps for skeletons of the same size, so nothing jumps when it loads |
| Empty          | The list or table hides; an empty state says why and offers the next step    |
| Error          | A message near what failed, saying what happened and what to do              |
| Partly filled  | One item, a long name, a missing photo: the cases real data brings           |
| Disabled, busy | A submit button that's disabled or shows progress while saving               |
| Permissions    | What a viewer sees compared with an admin                                    |

Build states from the base design. Put what only some states need (skeletons, an empty state, an error message) into the
base with `hidden: true`, then show and hide things per state with `AddState(design, { name, changes })`. A state stores
only its changes, so editing the base updates every state.

Name states for the situation ("No members yet", "Invite failed"), not the change ("Table hidden").

Every call that takes a state takes its id, never its name: `UpdateState`, `DeleteState`, `Update`'s and `Get`'s
`state`, `UpdateDesign`'s `state` and the checks. `AddState` returns the id, and `Designs()` lists each design's states
with their ids and names. Names can repeat and change, so an id made from a name stops matching it after a rename. A
name passed by mistake fails with `unknown_state`, naming the id it belongs to, or every id when states share the name.

```js
AddState("team-members", { name: "No members yet", changes: { "Members table": { hidden: true } } })
// Later, find a state's id by its name in Designs(), then pass the id.
const states = Designs().find((design) => design.id === "team-members").states // [{ id, name }]
const empty = states.find((state) => state.name === "No members yet").id
UpdateState("team-members", empty, { name: "No members" })
await Screenshot("team-members", { state: empty })
```

## Modes

Modes are the project's, shared by every design. Each mode picks one option of each variable:

- **Viewport:** a width, and a device. Desktop, tablet and mobile are typical.
- **Theme:** a class on the frame, such as `dark`, that switches the project's tokens.
- **Locale:** `lang` and `dir` attributes, for languages and right-to-left scripts.

`get_modes` (`parity modes`) lists them, and `get_modes` with a design gives its frames: run it before a responsive
change, since the ids `Responsive` takes are viewports (`mobile`) and the ids screenshots take are modes
(`mobile-light`). `GetModes()` gives the same in a snippet. A design shows its main mode and, beside it, any others you
choose with `UpdateDesign(design, { showModes: ["desktop-dark", "mobile-light"] })`. Show the modes that matter for the
design: a dashboard in desktop and mobile, a component in light and dark.

## Viewports and responsive patches

One design covers every viewport. Patch the differences with `Responsive(node, viewport, patch)` on the nodes that
change:

```js
Responsive("dashboard/Sidebar", "mobile", { hidden: true })
Responsive("dashboard/Stats", "tablet", { style: { gridTemplateColumns: [{ fr: 1 }, { fr: 1 }] } })
Responsive("dashboard/Stats", "mobile", { style: { gridTemplateColumns: [{ fr: 1 }] } })
Responsive("dashboard/Content", "mobile", { style: { padding: [{ step: 5 }, { step: 4 }] } })
```

The viewport is the viewport option's id, not the mode's. A frame is as wide as its viewport and as tall as its content,
unless the design sets a size for that viewport.

## Checking them all

After a change, screenshot every frame the design shows as one sheet: `screenshot` with `state: "all"`, `mode: "shown"`
and `sheet: true` (`parity screenshot <design> --state all --mode shown --sheet`). Check dark mode for colours that only
worked on white, mobile for rows that don't fit, and each state for a layout that jumps.
