import type { ContainerSpec, DesignNode } from "@parity-app/core"
import { designsSelection, layersSelection } from "@parity-app/editor"
import { describe, expect, it } from "vite-plus/test"
import type { ContainerEntry } from "../design-store.ts"
import { type CommandContext, commandStates } from "./command-state.ts"
import { type Command, keymap } from "./keymap.ts"

const text = (id: string, extra: { hidden?: boolean; locked?: boolean } = {}): DesignNode => ({
  type: "text",
  id,
  text: id,
  ...extra
})

/** A dashboard: a header with a title, a hidden subtitle and a locked badge, an instance of a stat card, and a chart. */
const dashboard: ContainerSpec = {
  id: "dashboard",
  name: "Dashboard",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      {
        type: "layout",
        id: "header",
        children: [text("title"), text("subtitle", { hidden: true }), text("badge", { locked: true })]
      },
      { type: "instance", id: "users", design: "stat-card" },
      { type: "component", id: "chart", component: "ui/Chart" }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "loading", name: "Loading", overrides: { title: { hidden: true } } }
  ]
}

const statCard: ContainerSpec = {
  id: "stat-card",
  name: "Stat card",
  kind: "component",
  position: { x: 2000, y: 0 },
  root: { type: "layout", id: "card", children: [text("value")] },
  states: [{ id: "default", name: "Default" }]
}

const settings: ContainerSpec = {
  id: "settings",
  name: "Settings",
  position: { x: 4000, y: 0 },
  locked: true,
  root: { type: "layout", id: "page", children: [] },
  states: [{ id: "default", name: "Default" }]
}

const entries: ContainerEntry[] = [
  { key: "app.par#dashboard", path: "app.par", container: dashboard },
  { key: "app.par#stat-card", path: "app.par", container: statCard },
  { key: "app.par#settings", path: "app.par", container: settings }
]

const design = "app.par#dashboard"
const layers = (ids: string[], state?: string) => layersSelection(design, ids, state ? { state } : {})

/** A project tab with its canvas drawn, nothing to undo, nothing to repeat and a reference library connected. */
const tab = (overrides: Partial<CommandContext> = {}): CommandContext => ({
  selection: {},
  entries,
  notes: 0,
  canvas: true,
  history: { canUndo: false, canRedo: false },
  references: true,
  ...overrides
})

const situations = {
  "no project tab": tab({ selection: undefined, entries: [], canvas: false }),
  "an empty canvas": tab({ entries: [] }),
  "a canvas holding a note": tab({ entries: [], notes: 1 }),
  "nothing selected": tab(),
  "a layer": tab({ selection: layers(["title"]) }),
  "two layers": tab({ selection: layers(["title", "chart"]) }),
  "a hidden layer": tab({ selection: layers(["subtitle"]) }),
  "a layer the state being edited hides": tab({ selection: layers(["title"], "loading") }),
  "a locked layer": tab({ selection: layers(["badge"]) }),
  "an instance": tab({ selection: layers(["users"]) }),
  "a layer inside an instance": tab({ selection: layers(["users/value"]) }),
  "the design's root": tab({ selection: layers(["root"]) }),
  "a screen": tab({ selection: { design } }),
  "a component": tab({ selection: { design: "app.par#stat-card" } }),
  "a locked screen": tab({ selection: { design: "app.par#settings" } }),
  "two designs": tab({ selection: designsSelection([design, "app.par#stat-card"]) }),
  "three designs": tab({ selection: designsSelection(entries.map((entry) => entry.key)) }),
  "a note": tab({ selection: { note: "note-1" } }),
  "a reference": tab({ selection: { reference: "ref-1" } }),
  "no reference library": tab({ references: false }),
  "no canvas yet": tab({ canvas: false }),
  "history to undo and redo": tab({ history: { canUndo: true, canRedo: true, undoLabel: "Move", redoLabel: "Wrap" } }),
  "a change to repeat": tab({ repeat: { label: "Wrap in layout", enabled: true } }),
  "a change that can't repeat now": tab({ repeat: { label: "Wrap in layout", enabled: false } })
} satisfies Record<string, CommandContext>

type Situation = keyof typeof situations

/** A row: in a situation, a command is enabled or not, and called its keymap label unless `label` says otherwise. */
type Row = [Situation, Command, boolean, string?]

const rows: Row[] = [
  // Nothing to act on outside a project.
  ["no project tab", "paste", false],
  ["no project tab", "save", false],
  ["no project tab", "newTab", true],
  ["no project tab", "zoomIn", false],
  ["no project tab", "undo", false],

  // Select all and Zoom to fit need something on the canvas.
  ["an empty canvas", "selectAll", false],
  ["an empty canvas", "zoomToFit", false],
  ["an empty canvas", "zoomIn", true],
  ["an empty canvas", "nextDesign", false],
  ["a canvas holding a note", "selectAll", true],
  ["a canvas holding a note", "zoomToFit", true],
  ["no canvas yet", "zoomToFit", false],
  ["no canvas yet", "zoomTo100", false],

  // With nothing selected, what acts on the selection doesn't apply.
  ["nothing selected", "copy", false],
  ["nothing selected", "cut", false],
  ["nothing selected", "delete", false],
  ["nothing selected", "paste", true],
  ["nothing selected", "hide", false, keymap.hide.label],
  ["nothing selected", "lock", false, keymap.lock.label],
  ["nothing selected", "makeComponent", false, keymap.makeComponent.label],
  ["nothing selected", "goToMain", false, keymap.goToMain.label],
  ["nothing selected", "alignLeft", false],
  ["nothing selected", "zoomToSelection", false],
  ["nothing selected", "exportSelection", false],
  ["nothing selected", "copyAsPng", false],

  // One of the design's own layers.
  ["a layer", "copy", true],
  ["a layer", "duplicate", true],
  ["a layer", "bringToFront", true],
  ["a layer", "wrap", true],
  ["a layer", "unwrap", true],
  ["a layer", "makeComponent", true, keymap.makeComponent.label],
  ["a layer", "hide", true, "Hide"],
  ["a layer", "lock", true, "Lock"],
  ["a layer", "rename", true],
  ["a layer", "pasteReplace", true],
  ["a layer", "alignLeft", true],
  ["a layer", "distributeHorizontal", false],
  ["a layer", "detach", false],
  ["a layer", "exportSelection", true],

  // The order, unwrapping and making a component take one layer alone.
  ["two layers", "bringForward", false],
  ["two layers", "unwrap", false],
  ["two layers", "makeComponent", false],
  ["two layers", "wrap", true],
  ["two layers", "hide", true, "Hide"],

  // Hide reads Show when every selected layer is hidden, in the state being edited.
  ["a hidden layer", "hide", true, "Show"],
  ["a layer the state being edited hides", "hide", true, "Show"],
  ["a locked layer", "lock", true, "Unlock"],

  // An instance goes to its component, named after it.
  ["an instance", "goToMain", true, "Go to Stat card"],
  ["an instance", "detach", true],

  // A layer inside an instance belongs to its component; only Cut and Delete still apply.
  ["a layer inside an instance", "copy", false],
  ["a layer inside an instance", "duplicate", false],
  ["a layer inside an instance", "bringToFront", false],
  ["a layer inside an instance", "wrap", false],
  ["a layer inside an instance", "hide", false, keymap.hide.label],
  ["a layer inside an instance", "lock", false, keymap.lock.label],
  ["a layer inside an instance", "rename", false],
  ["a layer inside an instance", "cut", true],
  ["a layer inside an instance", "delete", true],

  // So does the design's root.
  ["the design's root", "copy", false],
  ["the design's root", "hide", false, keymap.hide.label],
  ["the design's root", "makeComponent", false],
  ["the design's root", "lock", false, keymap.lock.label],
  ["the design's root", "rename", true],
  ["the design's root", "delete", true],

  // A design on its own converts to a component, and a component back to a screen.
  ["a screen", "makeComponent", true, "Convert to component"],
  ["a component", "makeComponent", true, "Convert to screen"],
  ["a screen", "copy", true],
  ["a screen", "duplicate", true],
  ["a screen", "lock", true, "Lock"],
  ["a screen", "hide", false, keymap.hide.label],
  ["a screen", "pasteReplace", false],
  ["a screen", "alignLeft", false],
  ["a screen", "selectChildren", true],
  ["a screen", "exportSelection", true],
  ["a locked screen", "lock", true, "Unlock"],

  // Several designs align, three distribute, and none makes a component.
  ["two designs", "alignLeft", true],
  ["two designs", "distributeHorizontal", false],
  ["two designs", "makeComponent", false, keymap.makeComponent.label],
  ["two designs", "lock", true, "Lock"],
  ["three designs", "distributeVertical", true],
  ["three designs", "lock", true, "Lock"],

  // A note is copied and deleted; a reference only deleted, as it can't be pasted into a design.
  ["a note", "copy", true],
  ["a note", "cut", true],
  ["a note", "duplicate", false],
  ["a note", "exportSelection", false],
  ["a reference", "copy", false],
  ["a reference", "delete", true],
  ["a reference", "nudge", true],
  ["a reference", "zoomToSelection", true],

  // Find references needs a reference library.
  ["nothing selected", "findReferences", true],
  ["no reference library", "findReferences", false],

  // Undo, Redo and Repeat say what they'd do.
  ["nothing selected", "undo", false, keymap.undo.label],
  ["history to undo and redo", "undo", true, "Undo move"],
  ["history to undo and redo", "redo", true, "Redo wrap"],
  ["nothing selected", "repeat", false, keymap.repeat.label],
  ["a change to repeat", "repeat", true, "Repeat wrap in layout"],
  ["a change that can't repeat now", "repeat", false, "Repeat wrap in layout"]
]

describe("each command's state", () => {
  it.each(rows)("with %s, %s is enabled: %s", (situation, command, enabled, label) => {
    expect(commandStates(situations[situation])[command]).toEqual({
      enabled,
      label: label ?? keymap[command].label
    })
  })

  it("has a state for every command in the keymap", () => {
    expect(Object.keys(commandStates(tab())).toSorted()).toEqual(Object.keys(keymap).toSorted())
  })
})
