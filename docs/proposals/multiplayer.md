# Proposal: a project document that several people can edit (PAR-1104)

Status: draft for discussion, 2026-11-14, revised the same day after a review against the code and Loro's declarations.
Nothing here is built. This page sets out the data structures and patterns that let the designs in `.par` files be
edited by several people at once later, behind an interface whose library can be swapped. Sync, presence, the cloud and
review links come later; what's built first works for one person, offline, as the editor does today.

## In one line

The editor's designs move from snapshots it replaces into a document of nodes and properties that changes by operations.
Parity talks to it through `@parity-app/multiplayer`, which keeps undo, gestures and checks the same for every provider,
and `@parity-app/multiplayer-loro` is the first provider that can merge, on [Loro](https://github.com/loro-dev/loro).

## Why now

- **Multiplayer is coming,** on designs that live only in `.par` files, stored in the cloud, on one committed branch.
  Review links that show what changed between two commits, with comments on them, come with it.
- **Today's model can't merge.** `DesignStore` replaces a whole `DesignSnapshot` for each change, and undo goes back to
  an earlier snapshot. Two people's changes to one design can't be combined, and undo would take back someone else's
  work.
- **Design ids collide.** Layers already get random ids (`generateId` in `@parity-app/core`, five characters), but a new
  design's id comes from its name (`uniqueId` gives `pricing-2`), so two people adding a design called Pricing make the
  same id.
- **Order is array positions.** `children` and `slots` are arrays, which can't take two inserts at once.
- **The expensive parts are cheap to change now** and costly once more is built on snapshots: how changes are described,
  undo, gestures and ordering.

## What's decided

- **Designs change by operations on nodes and properties,** never by replacing a snapshot. One transaction is one undo
  step, one change for the node index and extension hosts, and, later, one update for other people.
- **Parity reads plain, immutable values,** the same `CanvasDocument`, `ContainerSpec` and `DesignNode` objects it reads
  now, each the same object until a change touches it. Views, the node index (PAR-1088) and the editing functions in
  `@parity-app/editor` keep working.
- **Undo, gestures, checkpoints and checks live in `@parity-app/multiplayer`,** the same for every provider. A provider
  only holds the state, applies operations that have been checked, and reports what changed, so providers stay small and
  can't disagree about undo.
- **Nodes are what Parity reads; the document is what it owns.** The node index (`ProjectNodes`, `NodeRef`) lists every
  node from every owner, read only: layers, and the components, routes and stories that code owns. The project's
  document holds what Parity saves itself, the `.par` files with modes and token edits, and is where designs are undone,
  dragged and saved. Code Parity writes from designs later is output, and what's read back from it is code's nodes. So
  the document is `ProjectDoc`, not a node store.
- **`DesignStore` is folded away** into `ProjectDoc`, a `ProjectSaver`, lookups and free functions for callers (How the
  session moves onto it).
- **Extensions' operations are the document's.** `DesignOperation` in `@parity-app/extension-api` (PAR-1093) is the
  layer operations below with the same shape, so an extension's `transact` becomes the document's.
- **Three packages now and room for a fourth,** each data in, data out and tested without Electron, as
  [packages.md](packages.md) asks.

  | Package                              | Holds                                                                                                                                                                             |
  | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `@parity-app/multiplayer`            | `ProjectDoc` and the provider interface, operations, checks, undo, gestures, changes, the functions for callers, the diff of two `.par` files, and the shared tests and benchmark |
  | `@parity-app/multiplayer-local`      | A provider for one person, without merging and without Loro, which the editor can ship                                                                                            |
  | `@parity-app/multiplayer-loro`       | The Loro provider. Depends on `loro-crdt`, agreed as a dependency, which nothing else imports. Its WebAssembly is the one part that isn't plain TypeScript                        |
  | `@parity-app/multiplayer-liveblocks` | Not now. The interface leaves room for it                                                                                                                                         |

- **No library type crosses the interface.** Nothing outside `multiplayer-loro` sees a `LoroDoc`, `LoroMap` or `TreeID`.
  Swapping providers means a new package that passes the shared tests.
- **`.par` stays the format on disk and in git,** plain JSON as today. A provider loads from it and saves to it, so
  swapping providers loses history, never designs. Git keeps the history between commits.
- **Undo is per person and made of operations:** it reverses only this person's transactions, and leaves a field someone
  else has changed since.
- **Loro can be turned off with one line,** and the editor keeps working on the local provider (Turning Loro off).
- **`history.ts`'s snapshot undo goes** once the session sits on the document, as [conventions.md](../conventions.md)
  asks: no second path kept beside it. The two providers aren't two paths: both run behind one interface and pass the
  same tests, and the local one is what the editor falls back to.

## How the pieces fit

```text
 canvas, panels, agents, extensions
        │  updateContainer(doc, …), addContainer(doc, …), doc.transact(…), applyOperations(doc, …)
        ▼
 ProjectDoc (@parity-app/multiplayer) ── one per open project
   checks a transaction on a draft · keeps undo and gestures · token edits · tells subscribers
        │  backend.apply(ops)                       ▲ backend.subscribe: others' changes, with sync
        ▼                                           │
 DocBackend, from a DocProvider ── local, or Loro (later Liveblocks)
   holds the designs, notes, references, files' fields and modes · applies checked operations

 ProjectSaver ── listens to ProjectDoc's changes, writes `.par` files and the stylesheet
```

## What goes in the document

One document per open project, holding every `.par` file the project edits. Libraries' `.lib.par` files are read only,
and designs drawn from code (pages, component boards, stories) are drawn again each time a project opens, so neither is
in it.

| Part                           | Where                                                                                                                         | Merges                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Designs                        | The backend: a node per design, in the order its file lists them                                                              | Per field; record fields per key (below)            |
| Layers                         | The backend: a node per layer, inside its design, its parent layer or one of its parent's slots, in order                     | Per field; record fields per key; text by character |
| Notes and references           | The backend: one entry per item, by id, with an order key                                                                     | Whole item                                          |
| Modes                          | The backend: one entry per top-level field of `ModeSettings`, saved into the main file                                        | Whole field                                         |
| A file's other fields          | The backend: `detection`, `objects`, `links`, `sources`, `images`, `preferences`, `extensions`, `codeDesigns`, one entry each | Whole field                                         |
| Token values edited            | `ProjectDoc` itself: written to the stylesheet, never to `.par`, never shared                                                 | Not shared                                          |
| Layers' `internals`, `element` | Not in the document: read from code and never saved                                                                           |                                                     |

**Record fields merge per key,** one level deep: a layer's `style`, `props`, `args`, `overrides` and `responsive`, and a
design's `params` and `frames`. Two people changing a layer's padding and its colour both land. Everything else is
replaced whole and the last write wins, including some that are coarse for several people: a design's `states` (every
state's overrides at once), a patch inside `responsive` or `overrides` (mobile padding and mobile colour are one value),
and a param's options. Open questions has these.

**A text layer's `text` merges by character,** so two people typing in one layer both keep their typing.

### Ids

- **A node's address stays a design key and a node id** (`app.par#home` and `title`), as the `.par` and the node index
  have them. A provider maps it to its own ids, which never leave it.
- **Layers keep `generateId`,** which already gives random ids, and notes and references keep theirs.
- **A new design's id keeps a readable stem and adds `generateId`'s five random characters:** a new
  `designId(name, taken)` in core gives `pricing-k3f9q`, and the places that name a new design (`create.ts`,
  `new-screen.ts`, `frames.ts`, `components.ts`, the agent's workspace) use it. `uniqueId` stays as it is for states,
  variant options, modes and viewports, which live inside values replaced whole.
- **Ids an agent or extension chooses are checked as today,** and refused when taken.
- **Merges are repaired.** After changes arrive from someone else, each design they touched is checked with
  `containerSpec`, and what breaks it is repaired by named rules: two layers with one id (the later one gets a new id),
  two layers that are one slot (the later one is renamed), a state or variant patch naming a layer that's gone (the
  patch key is dropped, as `deleteNode` does today), states on a design that isn't a component (dropped). Each repair is
  recorded (`projectDoc.repaired`). This can only happen once sync arrives.

### Order

- **Every node has a parent and a place among its siblings,** not an index in an array. The Loro provider uses Loro's
  movable tree with fractional order, so an insert or a move changes one node.
- **Operations place a node before a sibling** (`before`), or last when none is named, rather than at an index, so a
  place stays meaningful when someone else inserts at the same time. A `before` that isn't a sibling in the same parent
  and slot is refused.
- **Slots stay as they are in the plain values** (`slots.actions`), including a slot filled with nothing. How a provider
  stores them is its own business: the Loro provider makes each slot a node of its own under its component or instance.
- **Cycles.** A move into a node's own descendant is refused before it's applied. Concurrent moves that would make one
  are left to the provider; Loro's tree refuses a local move that makes a cycle, and the concurrent tests confirm it
  resolves concurrent ones without one.

## `@parity-app/multiplayer`

### Addresses and values

```ts
import type {
  CanvasDocument,
  ContainerSpec,
  DesignNode,
  JsonValue,
  ModeSettings,
  NoteSpec,
  ReferenceSpec,
  TokenEdits // moves from @parity-app/editor to core, so the editor can use ProjectDoc
} from "@parity-app/core"

/** A design's key: its file and its id, `app.par#home`. */
export type DesignKey = string

/** The key of a design in a file, as `containerKey` in the window makes it today, which this replaces. */
export function designKey(path: string, id: string): DesignKey

/** A layer: its design, and its id within that design. */
export interface LayerAddress {
  design: DesignKey
  node: string
}

/**
 * A field, or one key of a record field: `["name"]`, `["style", "padding"]`, `["params", "label"]`. The same type as the
 * extension API's `FieldPath`.
 */
export type FieldPath = string[]

/** The fields of a `.par` file other than its designs, notes and references, each replaced whole. */
export type FileField =
  | "detection"
  | "objects"
  | "links"
  | "sources"
  | "images"
  | "preferences"
  | "extensions"
  | "codeDesigns"

/** Opaque: equal while the document is unchanged. */
export interface DocVersion {
  readonly provider: string
  readonly value: string
}

export function sameVersion(a: DocVersion, b: DocVersion): boolean
```

### Operations

```ts
/** A change to the text of a text layer: replace the whole text, or splice it, by UTF-16 offset. */
export type TextEdit =
  | { kind: "replace"; text: string }
  | { kind: "splice"; at: number; remove: number; insert: string }

export type DocOp =
  // Layers: the extension API's DesignOperation, with the same shape.
  /** Inserts a layer with everything inside it, under `parent`, in `slot` when the parent is a component or instance. */
  | { op: "insert"; design: DesignKey; parent: string; slot?: string; before?: string; node: DesignNode }
  | { op: "remove"; design: DesignKey; node: string }
  /** Moves a layer within its design. Moving to another design is a remove and an insert. */
  | { op: "move"; design: DesignKey; node: string; parent: string; slot?: string; before?: string }
  /** Sets one of a layer's fields, or one key of a record field; leaving out `value` removes it. */
  | { op: "set"; design: DesignKey; node: string; path: FieldPath; value?: JsonValue }
  // Layers, beyond the extension API.
  | { op: "editText"; design: DesignKey; node: string; edit: TextEdit }
  /** Replaces a design's root layer with a new tree, as Turn into frame wraps it in a layout. */
  | { op: "replaceRoot"; design: DesignKey; root: DesignNode }
  /** Takes a slot away from a component or instance layer, which differs from leaving it filled with nothing. */
  | { op: "removeSlot"; design: DesignKey; node: string; slot: string }
  // Designs.
  | { op: "addDesign"; file: string; design: ContainerSpec; before?: DesignKey }
  | { op: "removeDesign"; design: DesignKey }
  /** Reorders a design in its file, or moves it to another file, which gives it a new key. */
  | { op: "moveDesign"; design: DesignKey; file?: string; before?: DesignKey }
  /** Sets one of a design's fields, or one key of `params` or `frames`; leaving out `value` removes it. Not `root`. */
  | { op: "setDesign"; design: DesignKey; path: FieldPath; value?: JsonValue }
  // The rest of a file, and the modes.
  | { op: "setNote"; file: string; note: NoteSpec; before?: string }
  | { op: "removeNote"; file: string; id: string }
  | { op: "setReference"; file: string; reference: ReferenceSpec; before?: string }
  | { op: "removeReference"; file: string; id: string }
  | { op: "setFileField"; file: string; field: FileField; value?: JsonValue }
  | { op: "setModes"; modes: ModeSettings }
```

- **`set` can't change `id`, `type`, `children` or `slots`.** A layer whose type changes and keeps its id, as detaching
  an instance does, is a `remove` and an `insert` with that id in one transaction, which is allowed since operations
  apply in order. `set` on a text layer's `["text"]` is an `editText` replace.
- **`setModes` changes the main file,** which carries the modes, so its change names the main file to write.

### Checking a transaction

A transaction is checked whole, then applied whole, or not at all:

1. Its operations are applied in order to a draft of the plain values, so an insert followed by a `set` on the new
   layer, or a remove and an insert of the same id, check as they'll apply.
2. Each design the draft changed is checked with core's `containerSpec`, which covers the rules that span fields: patch
   keys naming layers, unique slots, frames, states only on components. A file field is checked with its own schema from
   `canvasDocument`.
3. Only then are the operations sent to the backend, which applies them without checking again.

```ts
export type TransactProblem =
  | { kind: "unknownDesign"; op: number; design: DesignKey }
  | { kind: "unknownNode"; op: number; address: LayerAddress }
  | { kind: "takenId"; op: number; design: DesignKey; id: string }
  | { kind: "intoItself"; op: number; address: LayerAddress; parent: string }
  | { kind: "notSibling"; op: number; address: LayerAddress; before: string }
  | { kind: "fixedField"; op: number; address: LayerAddress; field: string }
  | { kind: "invalid"; op?: number; design?: DesignKey; pointer: string; message: string }
```

### The document

```ts
/** Who made a change, for undo, saving and telemetry. */
export type ChangeOrigin =
  | "edit" // the person, on the canvas or in a panel
  | "agent" // an agent, through the project's API
  | "extension" // an extension with the edits permission
  | "file" // a file changed outside Parity: git, an editor, an agent writing it
  | "view" // which state or modes a design shows: not undoable
  | "remote" // someone else, once sync arrives: never in this person's undo

/** A gesture's id, which `beginGesture` makes. */
export type GestureId = string

export interface TransactOptions {
  origin: ChangeOrigin
  /** The gesture this belongs to: the gesture's transactions are one undo step until it ends. */
  gesture?: GestureId
  /** Whether the files it changes are written. `false` for changes that came from the files. Defaults to true. */
  persist?: boolean
  /** Kept with the undo step and given back when it's undone or redone, as the selection to restore. */
  meta?: JsonValue
}

export type TransactResult = { ok: true; change: DocChange | undefined } | { ok: false; problem: TransactProblem }

/** A design's value at a moment in a gesture, to go back to: an absolute drag's side coming back, or Escape. */
export interface Checkpoint {
  readonly gesture: GestureId
  readonly design: DesignKey
  /** The design as it was. */
  readonly container: ContainerSpec
}

export interface UndoState {
  canUndo: boolean
  canRedo: boolean
  /** The labels Edit > Undo and Redo show: `Move frame`, `Change padding`. */
  undoLabel?: string
  redoLabel?: string
  /** Counts the step Undo would take back: different after a change, an undo, a redo or a gesture's end. */
  step: number
}

export interface ProjectDoc {
  readonly provider: string
  /** Whether the provider can merge others' changes: features that need several people check it. */
  readonly sync: boolean

  // Reading. Plain values, each the same object until a change touches it.
  /** Every file without its modes, which the saver writes into the main file. */
  files(): ReadonlyMap<string, CanvasDocument>
  file(path: string): CanvasDocument | undefined
  readonly main: string
  design(key: DesignKey): ContainerSpec | undefined
  node(address: LayerAddress): DesignNode | undefined
  /** The layer a layer sits in, and the slot it fills, or the design itself for a root layer. */
  parent(address: LayerAddress): { node: string; slot?: string } | "design" | undefined
  modes(): ModeSettings
  tokens(): TokenEdits
  version(): DocVersion

  // Writing.
  /** Checks and applies a transaction. Its change is returned and also sent to subscribers. */
  transact(label: string, ops: readonly DocOp[], options: TransactOptions): TransactResult
  /** Token values edited on the canvas, which the saver writes to the stylesheet. Undoable, never shared. */
  setTokens(label: string, tokens: TokenEdits, options: TransactOptions): DocChange | undefined
  /**
   * A file changed outside Parity: one undoable step that makes the file what it now holds, not written back. The main
   * file's modes come with it.
   */
  replaceFile(path: string, document: CanvasDocument): TransactResult

  // Gestures: a drag, a resize, a scrub, a run of arrow presses or a change preview.
  beginGesture(): GestureId
  /**
   * Ends a gesture. Returns whether it left an undo step: one that ends where it began leaves none, and Redo is as it
   * was before it began.
   */
  endGesture(gesture: GestureId): boolean
  inGesture(): boolean
  subscribeGestures(listener: () => void): () => void
  checkpoint(gesture: GestureId, design: DesignKey): Checkpoint | undefined
  /** Puts the checkpoint's design back as it was, inside the gesture's step. Everything else stays. */
  revert(checkpoint: Checkpoint): void
  /** Whether a transaction outside the checkpoint's gesture has changed its design since, which `revert` would undo. */
  changedBesides(checkpoint: Checkpoint): boolean
  /** Takes the gesture's changes back and ends it, leaving no step and Redo as it was. */
  cancelGesture(gesture: GestureId): void

  // Undo, this person's transactions only.
  undo(): DocChange | undefined
  redo(): DocChange | undefined
  history(): UndoState

  /** Told of every change: transactions, undo, redo, replaced files and, with sync, others' changes. */
  subscribe(listener: (change: DocChange) => void): () => void

  /** Releases the backend. The document can't be used after. */
  dispose(): void
}

export function createProjectDoc(backend: DocBackend, options: { undoLimit: number }): ProjectDoc
```

### Gestures

- **Each gesture's step holds only its own transactions,** as today. A transaction made during a drag without the drag's
  id, such as an agent's, is a step of its own, and the drag's next transaction starts its step anew.
- **Gestures run side by side,** each by its id. `inGesture` is true while any is open, and `subscribeGestures` tells
  when the first begins and the last ends, which the node index (PAR-1088) waits for.
- **A gesture that ends where it began leaves no step** and puts Redo back as it was. Whether it changed anything is
  found by comparing the designs it touched with their values when it began, using `sameDesign`.
- **`revert` is today's revert:** it puts the checkpoint's design back as it was, with `containerOps` from the design
  now to `checkpoint.container`, as a transaction inside the gesture's step. Other designs, other files and other
  people's transactions stay.
- **`changedBesides` is true** when a transaction that isn't the gesture's has touched the checkpoint's design since the
  checkpoint, which `DocChange` makes easy to keep.

### Undo

`ProjectDoc` keeps undo itself, from inverse operations, so it's the same on every provider:

- **When a transaction is checked, each operation's inverse is worked out from the draft**, before it's applied. A step
  is a transaction's inverses, or a gesture's, applied in reverse order. Undo applies them as a transaction; Redo
  applies the inverses of that.

  | Operation                       | Its inverse                                                                 |
  | ------------------------------- | --------------------------------------------------------------------------- |
  | `insert`                        | `remove` of the layer                                                       |
  | `remove`                        | `insert` of the whole layer, with its parent, slot and the sibling after it |
  | `move`                          | `move` back to its parent, slot and the sibling after it                    |
  | `set`, `setDesign`              | the same with the value before, or without a value when there was none      |
  | `editText`                      | the opposite splice, or a `replace` with the text before                    |
  | `replaceRoot`                   | `replaceRoot` with the root before                                          |
  | `removeSlot`                    | `insert`s refilling the slot, or a `set` making it empty again              |
  | `addDesign`, `removeDesign`     | each other, with the design whole and the design after it                   |
  | `moveDesign`                    | `moveDesign` back to its file and the design after it                       |
  | `setNote`, `setReference`       | the item before, or its `removeNote`/`removeReference`                      |
  | `removeNote`, `removeReference` | `setNote`/`setReference` with the item and the item after it                |
  | `setFileField`, `setModes`      | the same with the value before                                              |
  | `setTokens`                     | the token values before                                                     |

- **Undo leaves someone else's change.** Before applying an inverse, it checks the target is as the step left it: a
  field still holds the value the step set, a layer the step inserted is still there, a parent it moved back to still
  exists. One that isn't is skipped and counted, so undo never takes back what someone else did since. Without sync,
  nothing is ever skipped, since steps are undone in order.
- **Origins:** `view` changes are never steps; `remote` ones never are either, and arrive through the backend.
- **The limit** is `undoLimit`, `historyLimit` (200) as now.

### Changes

```ts
/** What one transaction, undo, redo, token edit or replaced file changed, for views, saving, the node index and telemetry. */
export interface DocChange {
  origin: ChangeOrigin
  /** The transaction's label, or the step undone or redone. */
  label: string
  kind: "transaction" | "undo" | "redo" | "replaceFile" | "remote"
  gesture?: GestureId
  /** The `meta` given with the step, on undo and redo. */
  meta?: JsonValue
  /** Files whose `.par` content changed: the main file too when the modes did. Empty when `persist` was false. */
  writes: readonly string[]
  designs: {
    added: readonly DesignKey[]
    removed: readonly DesignKey[]
    /** Designs moved to another file, old key to new, as `NodeUpdate.renames` has it for the node index. */
    renamed: readonly { from: DesignKey; to: DesignKey }[]
    /** Designs whose own fields changed, by name, not those of layers inside them. */
    changed: readonly { design: DesignKey; fields: readonly string[] }[]
  }
  layers: {
    added: readonly LayerAddress[]
    removed: readonly LayerAddress[]
    moved: readonly LayerAddress[]
    /** Layers whose own fields changed, by name: `style`, `text`. */
    changed: readonly { address: LayerAddress; fields: readonly string[] }[]
  }
  notes: boolean
  references: boolean
  fileFields: readonly { file: string; field: FileField }[]
  modes: boolean
  tokens: boolean
  /** Inverses undo skipped because someone else had changed their target since. */
  kept: number
  version: DocVersion
}
```

### The provider interface

```ts
/** What a provider gives `ProjectDoc`: the state, applying checked operations, and others' changes once it syncs. */
export interface DocBackend {
  readonly provider: string
  readonly sync: boolean
  /** Plain values, without modes, each the same object until an operation touches it. */
  files(): ReadonlyMap<string, CanvasDocument>
  modes(): ModeSettings
  version(): DocVersion
  /** Applies operations `ProjectDoc` has checked, as one commit, and says what they changed. */
  apply(ops: readonly DocOp[], origin: ChangeOrigin): BackendChange
  /** Changes the backend didn't get through `apply`: others', with sync. */
  subscribe(listener: (change: BackendChange) => void): () => void
  dispose(): void
}

/** What changed in the backend's state. `ProjectDoc` adds the label, the step and the token edits to make a `DocChange`. */
export type BackendChange = Pick<
  DocChange,
  "designs" | "layers" | "notes" | "references" | "fileFields" | "modes" | "version"
>

export interface DocProvider {
  /** As telemetry records it: `loro`, `local`. */
  readonly name: string
  readonly sync: boolean
  /** Opens a project's files. `main` is the file the modes go into. */
  open(options: OpenOptions): DocBackend
}

export interface OpenOptions {
  /** The files without their modes. */
  files: readonly { path: string; document: CanvasDocument }[]
  main: string
  modes: ModeSettings
}
```

### Functions for callers

About a hundred places change designs today through `DesignStore`'s methods. Each becomes a function of the document in
the package, which works out the operations and makes one transaction. The main ones:

```ts
type Options = Partial<TransactOptions>

export function updateContainer(
  doc: ProjectDoc,
  key: DesignKey,
  label: string,
  update: (container: ContainerSpec) => ContainerSpec,
  options?: Options
): TransactResult
export function updateContainers(
  doc: ProjectDoc,
  keys: Iterable<DesignKey>,
  label: string,
  update: (container: ContainerSpec, key: DesignKey) => ContainerSpec,
  options?: Options
): TransactResult
export function updateView(
  doc: ProjectDoc,
  key: DesignKey,
  update: (view: ContainerViewSettings) => ContainerViewSettings
): void
export function setPosition(
  doc: ProjectDoc,
  key: DesignKey,
  position: { x: number; y: number },
  options?: Options
): void
export function addContainer(doc: ProjectDoc, path: string, container: ContainerSpec, label?: string): DesignKey
export function removeContainer(doc: ProjectDoc, key: DesignKey, label?: string): void
export function reorderContainer(doc: ProjectDoc, key: DesignKey, target: DesignKey, place: "before" | "after"): void
export function setModes(doc: ProjectDoc, modes: ModeSettings, label?: string): void
export function changeTokens(doc: ProjectDoc, label: string, edits: readonly TokenEdit[], options?: Options): void
export function addNote(doc: ProjectDoc, path: string, note: NoteSpec): string
export function updateNote(doc: ProjectDoc, key: string, label: string, update: (note: NoteSpec) => NoteSpec): void
export function addReferences(
  doc: ProjectDoc,
  path: string,
  references: readonly ReferenceSpec[],
  label: string
): string[]
export function updateReference(
  doc: ProjectDoc,
  key: string,
  label: string,
  update: (reference: ReferenceSpec) => ReferenceSpec
): void

/** For the six callers that change several files at once, with a function of the files and the modes. */
export function changeFiles(
  doc: ProjectDoc,
  label: string,
  update: (state: { files: ReadonlyMap<string, CanvasDocument>; modes: ModeSettings }) => {
    files: ReadonlyMap<string, CanvasDocument>
    modes: ModeSettings
  },
  options?: Options
): TransactResult

/** Agents' changes, merged three ways against what the agent read, as `mergeAgentChanges` does now. */
export function applyAgentChanges(doc: ProjectDoc, label: string, changes: readonly DesignChange[]): AgentApplied
/** Extensions' operations, which are already `DocOp`s. */
export function applyOperations(doc: ProjectDoc, label: string, operations: readonly DesignOperation[]): TransactResult
/** Whole files replacing what's there, as one step: an agent writing files, or restoring a recovery copy. */
export function applyDocuments(
  doc: ProjectDoc,
  label: string,
  documents: readonly { path: string; document: CanvasDocument }[]
): TransactResult

/** The operations that make `before` into `after`, comparing only what isn't the same object. */
export function containerOps(key: DesignKey, before: ContainerSpec, after: ContainerSpec): DocOp[]
/** The same for a whole file: its designs, notes, references and other fields. */
export function fileOps(path: string, before: CanvasDocument, after: CanvasDocument): DocOp[]
```

`AgentApplied` carries what `applyAgentChanges` returns today: the conflicts and the designs it changed.

- **`containerOps` compares by object first,** as PAR-1088's collector does: a layer that's the same object, with
  everything inside it, is skipped, and only what an edit touched is compared field by field.
- **A layer in a new place is a `move`,** found by its id; a layer whose id is gone a `remove`, and a new id an
  `insert`. A layer whose type changed is a `remove` and an `insert` with its id. A new root is a `replaceRoot`.
- **A text layer's new text is a `replace`,** which the backend can turn into the smallest splice.
- **Hot paths can send operations directly later,** if the benchmark shows the comparing costs too much.

### Lookups

What `DesignStore` builds from the designs becomes functions of `doc.files()`, kept while their inputs are the same
objects, as now: `containerEntries(doc)`, `containerEntry(doc, key)`, `noteEntries(doc)`, `referenceEntries(doc)`,
`componentLibrary(doc, libraryDesigns)`, `reachableLibrary(doc, key, libraryDesigns)`, `editFrame(doc, picked)` and
`designsLabel(doc, keys)`. The React hooks (`useContainerEntries`, `useContainerEntry`, `useLibrary`, `useNotes`,
`useReference`, `useModeSettings`, `useHistory`, `useSaveState`) read them through `useSyncExternalStore` with
`doc.subscribe`, or the saver's.

### The diff between two files

Review links show what changed between two commits. The diff works on two `.par` snapshots, by id, whichever provider
made them:

```ts
export interface DocumentDiff {
  designs: {
    added: readonly DesignKey[]
    removed: readonly DesignKey[]
    moved: readonly DesignKey[]
    changed: readonly { design: DesignKey; fields: readonly FieldDiff[] }[]
  }
  layers: {
    added: readonly LayerAddress[]
    removed: readonly LayerAddress[]
    /** A new parent, slot or place among its siblings. */
    moved: readonly LayerAddress[]
    changed: readonly { address: LayerAddress; fields: readonly FieldDiff[] }[]
  }
  notes: { added: readonly string[]; removed: readonly string[]; changed: readonly string[] }
  references: { added: readonly string[]; removed: readonly string[]; changed: readonly string[] }
  fileFields: readonly FileField[]
  modes: boolean
}

export interface FieldDiff {
  path: FieldPath
  before: JsonValue | undefined
  after: JsonValue | undefined
}

export function diffFiles(
  path: string,
  before: CanvasDocument | undefined,
  after: CanvasDocument | undefined
): DocumentDiff
```

Comments on a review link are anchored to what they're about, in the commit they were written on:

```ts
export interface CommentAnchor {
  /** The commit the comment was written on. */
  commit: string
  design: DesignKey
  node?: string
  /** A range of a text layer's text, by UTF-16 offset in that commit. */
  text?: { start: number; end: number }
}
```

### For tests and the benchmark: `@parity-app/multiplayer/testing`

```ts
/** The tests every provider passes, as a Vitest suite, through `createProjectDoc`. */
export function describeProjectDoc(provider: DocProvider, options?: { replicas?: ReplicaPair }): void

/** Two backends that exchange changes, for the concurrent tests. A provider that syncs offers one. */
export interface ReplicaPair {
  open(options: OpenOptions): { a: DocBackend; b: DocBackend; exchange(): void }
}

/** What the benchmark drives: today's DesignStore through an adapter, or ProjectDoc through the functions above. */
export interface BenchSession {
  updateContainer(
    key: string,
    label: string,
    update: (container: ContainerSpec) => ContainerSpec,
    gesture?: string
  ): void
  addContainer(path: string, container: ContainerSpec): string
  beginGesture(): string
  endGesture(gesture: string): void
  undo(): void
  redo(): void
  /** The `.par` content of a file, as saving would write it. */
  fileContent(path: string): CanvasDocument | undefined
}

/** The benchmark's scenarios against one kind of session, as a Vitest bench. */
export function benchSession(open: (files: { path: string; document: CanvasDocument }[]) => BenchSession): void

/** A project to load: `designs` designs of about `layers` layers each, `depth` deep, with text, instances and slots. */
export function generateProject(options: {
  designs: number
  layers: number
  depth: number
  seed: number
}): { path: string; document: CanvasDocument }[]
```

## `@parity-app/multiplayer-local`

```ts
import type { DocProvider } from "@parity-app/multiplayer"

/** One person's document, without merging: `name` is `local`, `sync` is false. */
export const localProvider: DocProvider
```

It's a whole provider, shipped and kept working, not a test fixture: what the editor falls back to if Loro has to go,
and the benchmark's line for the layer without Loro.

- **It holds the plain values and changes them directly.** Each operation makes the node's new value and copies the
  layers above it up to its design and file, so everything else stays the same object.
- **It's small,** since checks, undo and gestures are `ProjectDoc`'s: it applies operations and says what they changed.
- **No merging, and no WebAssembly.** It offers no `ReplicaPair`, so it skips the concurrent tests.

## `@parity-app/multiplayer-loro`

```ts
import type { DocProvider } from "@parity-app/multiplayer"

export const loroProvider: DocProvider
```

### How the document maps onto Loro

```text
LoroDoc (one per open project)
├─ "designs"     LoroTree, fractional order on
│   ├─ a root per design         data: { file, id, name, kind?, position, locked?, states?, view?,
│   │                                    context?, size?, params: LoroMap, frames: LoroMap }
│   │   └─ its root layer        data: { id, type, slot?, name?, hidden?, locked?, tag?, component?,
│   │       ├─ child layers …            design?, route?, src?, alt?, fit?, controls?, credit?, bind?,
│   │       └─ a slot node               text: LoroText, style: LoroMap, props: LoroMap, args: LoroMap,
│   │           └─ its layers …          overrides: LoroMap, responsive: LoroMap }
│   │                            a slot node's data: { slotOf: name }
├─ "notes"       LoroMap: `path#id` → { file, note, order }
├─ "references"  LoroMap: `path#id` → { file, reference, order }
├─ "files"       LoroMap: path → LoroMap of the file's other fields
└─ "modes"       LoroMap: field of ModeSettings → value
```

- **A design's place in its file** is its root's place among that file's roots.
- **A slot is a node of its own** under its component or instance, with the slot's layers inside it, so a layer's parent
  and slot change together in one move, a slot filled with nothing is a slot node with no children, and slots keep their
  order. A layout's `slot` field, which says the layout is a slot of its component, is a field like any other.
- **Record fields are `LoroMap`s** created with the node, so per-key merging needs nothing more. Only the fields a node
  has are created.
- **Notes and references keep an order key** made with Loro's fractional index, since a `LoroMap` has no order.
- **Token edits aren't in it,** so they're never in what's exported or sent.

### Each method

| Method      | On Loro                                                                                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`      | `new LoroDoc()`, `getTree("designs").enableFractionalIndex(…)`, builds every node from the files, and `commit({ origin: "load" })`                                                                                                                                                          |
| `files`     | The plain values the backend keeps (below), never read from Loro                                                                                                                                                                                                                            |
| `apply`     | For each operation: `tree.createNode(parent)` then `moveBefore(sibling)` for a `before`; `moveBefore` or `move` for a move; `tree.delete`; `node.data.set`; a record's `LoroMap.set` or `delete`; `LoroText.insert`/`delete`, or `update` for a replace. Then `commit({ origin, message })` |
| `subscribe` | With sync: `doc.subscribe`, turning an event batch with `by: "import"` into a `BackendChange` from its tree, map and text diffs                                                                                                                                                             |
| `version`   | `doc.frontiers()`, encoded                                                                                                                                                                                                                                                                  |
| `dispose`   | Drops the `LoroDoc` and the subscription                                                                                                                                                                                                                                                    |

**Loro's `UndoManager` isn't used.** Its groups take in every local commit made while a group is open, not one
gesture's, and `revertTo` goes back over the whole document, not one design. Undo kept in `ProjectDoc` avoids both and
is the same on every provider. Others' changes still merge under it, since an undo is ordinary operations.

### The plain values

`files()` returns plain objects the backend keeps beside Loro, built once on `open`:

- **An `apply` updates them from the operations it applied,** making the touched nodes' new values and copying the
  layers above each up to its design and file. Every other design, layer and file stays the same object.
- **Changes from others update them from Loro's events,** the same way, once sync arrives.
- **Fields are built in the order core's schemas list them,** so saved files keep a steady key order and git diffs stay
  small.

### Loading the library

- `loro-crdt` 1.x (1.17.1 now), MIT. Its WebAssembly is 3,596,988 bytes, about 3.4 MiB.
- Its `package.json` gives a `bundler` build and a `browser` build, picked by the `browser` and `development`
  conditions. Which one the window's Vite build takes, and that it copies the `.wasm`, is checked in step 6. Tests in
  Node load its Node build. A web page, such as a review link, can take `loro-crdt/base64` if it needs Loro at all.
- Loro handles no networking. Sync later sends the bytes from `doc.subscribeLocalUpdates` and takes others' with
  `doc.import`.

## Turning Loro off

Loro costs a 3.4 MiB download and its compile time, long before several people edit anything. If it has to go at short
notice, the editor goes back to the local provider without anything else changing:

- **One place picks the provider.** `renderer/project-doc.ts` exports the provider the window opens projects with.
  Nothing else in the app imports a provider package, and everything else talks to `ProjectDoc`.
- **Loro loads in a chunk of its own,** through a dynamic `import()` in that file, while the window starts. With the
  local provider picked, the window never downloads it; deleting the import takes it out of the build.
- **No data moves.** `.par` is the only thing either provider saves, so a project opens the same on both.
- **The same behaviour, kept by tests.** CI runs `describeProjectDoc` on both providers on every pull request, so the
  local one can't fall behind while Loro is in use. Undo, gestures and checks are `ProjectDoc`'s, so they're the same
  code on both.
- **What's lost is what needs several people:** merging others' changes, and sync once it's built. Those features check
  `doc.sync` and don't show without it.

## How the session moves onto it

At step 5 an open project's session holds a `ProjectDoc` and a `ProjectSaver`, and no `DesignStore`. Callers change
their receiver, from `store.updateContainer(…)` to `updateContainer(doc, …)`, which is mechanical and lands in the same
step.

### `ProjectSaver`

```ts
export interface ProjectSaver {
  state(): SaveState
  unsaved(): string[]
  hasUnsaved(): boolean
  /** Writes what's waiting now, as Save does. */
  flush(): Promise<void>
  /** Says how token values reach the stylesheet. The latest writer is used. */
  writeTokensWith(writer: TokenWriter): void
  tokenFailure(): TokenFailure | undefined
  recoveryCopy(keptAt?: number): RecoveryCopy | undefined
  subscribe(listener: () => void): () => void
  dispose(): void
}

export function createProjectSaver(doc: ProjectDoc, persistence: Persistence): ProjectSaver
```

- **It writes what each change's `writes` name,** after the delay saving waits for now. A file's content is
  `doc.file(path)`, and the main file's adds the modes when they differ from the defaults, as `fileContent` does now.
- **A file is unsaved** while its content isn't the value last written, nor the same as it (`sameDocument`).
- **It writes token values** to the stylesheet through the `TokenWriter`, with `tokenWrites` and the failure as today.
- **It keeps the save state:** saved, unsaved, saving or failed, failures by file, and writes in flight, which leave
  `history.ts` for it.

### Every member of `DesignStore`

| `DesignStore` today                                                       | After                                                                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| constructor (documents, modes, `mainPath`, persistence, `libraryDesigns`) | `provider.open`, `createProjectDoc`, `createProjectSaver`; `libraryDesigns` passed to the library lookups       |
| `mainPath`                                                                | `doc.main`                                                                                                      |
| `subscribe`                                                               | `doc.subscribe`, and `saver.subscribe` for the save state                                                       |
| `getEntries`, `getEntry`, `getNotes`, `getReferences`, `getReference`     | `containerEntries`, `containerEntry`, `noteEntries`, `referenceEntries` (Lookups)                               |
| `getLibrary`, `getComponentLibrary`, `getLibraryDesigns`                  | `reachableLibrary`, `componentLibrary`, and the session's `libraryDesigns`                                      |
| `getModes`, `getTokenEdits`                                               | `doc.modes()`, `doc.tokens()`                                                                                   |
| `getDocuments`, `getMainDocument`, `merged()`                             | `doc.files()`, `doc.file(doc.main)`, and `mergedDocument` over them, which stays a function                     |
| `editFrame`                                                               | `editFrame(doc, picked)`                                                                                        |
| `getHistory`, `getUndoStep`                                               | `doc.history()`, whose `step` replaces comparing step objects                                                   |
| `undo`, `redo`, and the `edit.undone`/`edit.redone` they record           | `doc.undo()`, `doc.redo()`; the session records the events from the returned change                             |
| `getSaveState`, `unsavedPaths`, `hasUnsaved`, `flush`                     | The saver's                                                                                                     |
| `writeTokensWith`, `getTokenFailure`                                      | The saver's                                                                                                     |
| `getRevision`, `status`                                                   | `doc.version()` and the saver's state, through `status(doc, saver)` in `status.ts`                              |
| `change`                                                                  | `changeFiles`                                                                                                   |
| `updateContainer`, `updateContainers`, `updateView`, `setPosition`        | The functions of the same names                                                                                 |
| `addContainer`, `removeContainer`, `reorderContainer`                     | The functions of the same names                                                                                 |
| `setModes`, `changeTokens`, `designsLabel`                                | The functions of the same names                                                                                 |
| `addNote`, `updateNote`, `addReferences`, `updateReference`               | The functions of the same names                                                                                 |
| `reloadDocument`                                                          | `doc.replaceFile`; a file with unsaved changes is still left alone unless forced, using the saver's `unsaved()` |
| `applyDocuments`, `restoreRecovery`, `recoveryCopy`                       | `applyDocuments`; restoring a copy is `applyDocuments` with its files; the copy is the saver's                  |
| `applyAgentChanges`                                                       | `applyAgentChanges`, with `mergeAgentChanges` working on `doc.files()`                                          |
| `applyOperations`                                                         | `applyOperations`, sending the extension's operations as they are                                               |
| `beginGesture`, `endGesture`, `inGesture`, `subscribeGestures`            | The document's                                                                                                  |
| `checkpoint`, `revert`, `changedBesides`                                  | The document's, taking the design's key as now                                                                  |
| `useContainerEntries` and the other hooks                                 | The same hooks over the lookups (Lookups)                                                                       |

The editor modules built on `DesignSnapshot` move with it: `design-changes.ts` merges agents' changes against
`doc.files()`, `recovery.ts` makes and restores copies from files and token edits, `references.ts` works on files, and
`status.ts` reads the document's version and the saver's state. `history.ts` loses `DesignSnapshot`, `HistoryEntry` and
the snapshot undo, and what's left of it, the save state, becomes `ProjectSaver`'s.

The node index from PAR-1088 keeps working, since unchanged designs and layers stay the same objects. Later,
`DocChange.designs` can name the parts to gather again instead of comparing objects.

Project edits (PAR-1093's `files.edit`) keep their own undo, in the project service, as now.

## The shared tests

`describeProjectDoc` runs `createProjectDoc` over `localProvider` and `loroProvider`, the concurrent cases only where a
provider offers a `ReplicaPair`. Each case is a test:

**Reading and writing**

- Opening files and reading them back gives the same `.par` content, with the modes kept apart.
- A transaction changes only the designs, layers and files it touched; everything else is the same object.
- Each operation does what it says, including `before`, slots, a slot filled with nothing, `removeSlot`, `replaceRoot`
  and leaving out `value`.
- A layer's type changes with its id kept, through a `remove` and an `insert` in one transaction.
- An insert followed by a `set` on the new layer applies.
- A transaction with one bad operation changes nothing and says why: an unknown design or node, a taken id, a move into
  a node's own descendant, a `before` that isn't a sibling, a fixed field, a value that leaves a design invalid.
- A transaction that changes nothing returns no change and makes no step.
- `replaceFile` makes the file what it holds, as one step, and doesn't mark it to be written; the main file's modes come
  with it.
- `setModes` names the main file to write.
- `moveDesign` to another file reports the design under its new key.

**Undo and gestures**

- Undo and redo go back and forth through steps, with their labels and `meta`.
- A gesture's transactions are one step; two gestures side by side are a step each.
- An agent's transaction during a drag is its own step, and the drag's next transaction starts a new one.
- A gesture that ends where it began leaves no step, and Redo is as it was.
- `revert` puts the checkpoint's design back and keeps an agent's change to another design made meanwhile, in one step.
- `changedBesides` is false while only the gesture has changed its design, and true after another transaction has.
- `cancelGesture` leaves no step, with Redo as it was.
- View changes and loading are never steps; token edits are.
- Undo stops at `undoLimit`, and `step` changes with each step.

**Changes**

- Each transaction, undo, redo, token edit and replaced file sends one change, naming what it touched and the files to
  write.

**Concurrent,** with a `ReplicaPair`

- Two people setting different fields of one layer both land; the same field ends the same on both.
- Two people changing different keys of `style` both land.
- Two people typing in one text layer both keep their typing.
- Two people inserting before the same sibling both land, in the same order on both.
- Two moves that would make a cycle end with no cycle, the same on both.
- One person removing a layer another is editing: the same result on both.
- One person removing a layer while another changes a state's overrides for it: the patch key is dropped by the repair,
  and the file still opens.
- Two layers given one id, and two layers made the same slot, are repaired the same way on both.
- Undo takes back only this person's step, and leaves the other person's later change to the same field, counted in
  `kept`.

## The benchmark

It answers three questions: what the layer costs over today's store, what Loro costs over the layer without it, and what
Loro costs to download and start.

### Today, the layer, and Loro

The scenarios are written once, in `benchSession`, against `BenchSession`, and run on three sessions:

| Run   | Session                                                            | Where                                                        |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Today | Today's `DesignStore`, through a small adapter                     | `apps/desktop/src/renderer/design-store.bench.ts`, at step 2 |
| Local | `ProjectDoc` on `localProvider`, through the functions for callers | `packages/multiplayer-local`                                 |
| Loro  | `ProjectDoc` on `loroProvider`, the same                           | `packages/multiplayer-loro`                                  |

Today's run is recorded on this page with its commit at step 2. Its file goes at step 5 with `DesignStore`, and checking
out that commit runs it again. They run as one-off commands, not `package.json` scripts:

```bash
NODE_OPTIONS=--expose-gc pnpm exec vp test bench apps/desktop/src/renderer/design-store.bench.ts
```

```bash
NODE_OPTIONS=--expose-gc pnpm exec vp test bench packages/multiplayer-local packages/multiplayer-loro
```

`generateProject` makes each project from a seed, so every run loads the same one: 25 designs to a file, about one in
twenty a component, and screens of nested layouts with text and instances filling the components' slots. The sizes match
what's expected, thousands to tens of thousands of layers, rather than the million the first draft of this table had:

| Project    | Designs | Layers each | Depth | Layers in all |
| ---------- | ------: | ----------: | ----: | ------------: |
| Small      |      20 |         100 |     6 |        ~2,000 |
| Large      |     100 |         200 |     8 |       ~20,000 |
| Very large |     250 |         400 |    10 |      ~100,000 |

| Scenario                                   | Measures                                              |
| ------------------------------------------ | ----------------------------------------------------- |
| Open the project                           | Time; the heap the session holds over the files       |
| Set one field on one layer                 | Time per transaction                                  |
| A 300-frame drag of one design, then end   | Time per frame, the end included                      |
| Type 200 characters into a text layer      | Time per character, each its own transaction          |
| Paste 500 layers, or take them out again   | Time per paste                                        |
| Undo and redo 50 steps                     | Time per step                                         |
| Comparing on a one-field change            | Time, against sending the operation (`benchProvider`) |
| Save one file                              | Time to produce its `.par` and write it as JSON       |
| 10,000 edits in a session                  | Heap growth                                           |
| Exchange 1,000 transactions with a replica | Bytes, time to apply (`benchProvider`, Loro only)     |

Each edit is made as the editor makes it: a function from the design to the new design, copying only the layers above
the one that changed.

### Today's numbers

`DesignStore` on `history.ts`'s snapshots, run on `1f944c38` with PAR-1109's bench on top, on Windows 11 with an AMD
Ryzen AI Max+ PRO 395 (32 threads) and Node 24.20.0. Times are the mean per unit. Each open is given objects it hasn't
seen, as a parsed project would be, and each drag starts where the last one ended, so it keeps its undo step.

| Scenario                                  |    Small |     Large | Very large |
| ----------------------------------------- | -------: | --------: | ---------: |
| Open the project                          | 9.200 ms | 109.60 ms |  471.80 ms |
| Set one field on one layer                | 0.580 ms |  1.099 ms |   2.539 ms |
| A 300-frame drag of one design, per frame | 0.560 ms |  1.080 ms |   2.574 ms |
| Type into a text layer, per character     | 0.565 ms |  1.115 ms |   2.487 ms |
| Paste 500 layers, or take them out        | 1.170 ms |  1.214 ms |   2.151 ms |
| Undo or redo, per step                    | 0.022 ms |  0.109 ms |   0.430 ms |
| Save one file                             | 0.455 ms |  0.936 ms |   1.085 ms |

| Heap                       |  Small |  Large | Very large |
| -------------------------- | -----: | -----: | ---------: |
| The files' values          | 0.3 MB | 4.3 MB |    21.8 MB |
| The session opened on them | 0.0 MB | 0.1 MB |     0.2 MB |
| 10,000 edits               | 0.2 MB | 0.2 MB |     0.3 MB |

What they say about today:

- **Every edit costs more as the project grows, not just as the change does.** One field on one layer takes 0.6 ms on
  the small project and 2.5 ms on the very large one, and a drag frame or a typed character costs the same. At 100,000
  layers that's about a seventh of a 60 fps frame before drawing; where it goes, a profile at step 3 will say.
- **Opening is slow on a large project:** indexing every design, the component library included, takes almost half a
  second at 100,000 layers. An earlier run that reopened the same objects measured 0.4 ms, because `placedDesigns`
  caches by identity; a real open parses new objects and gets none of that. Reading and parsing the files isn't in it,
  and costs the same for every provider.
- **Undo is cheap,** swapping snapshots, and **memory is flat**: opening shares the files' objects, and the 200-step
  limit keeps 10,000 edits from growing the heap.

### What Loro costs to load

| Measure                    | How                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| The window's download      | The size of its built assets with each provider                                          |
| Loading Loro's WebAssembly | `projectDoc.opened`'s `wasmMs`, in the bench and from testers                            |
| Opening a project          | `project.drawn`'s time with each provider, on the example project and the Very large one |
| Memory                     | The window's memory after opening the Very large project, with each provider             |

The numbers go on this page, to decide whether the window keeps Loro before sync arrives, which paths send operations
directly, and whether long sessions need Loro's shallow snapshots.

## Telemetry

Each event is defined with `defineEvent` in `packages/telemetry/src/document-events.ts`, added to `registeredEvents`,
and listed in [docs/telemetry.md](../telemetry.md), as "Adding an event" there says. All are sent by the window, the
only process that holds the document. None is sent per transaction or per frame: a session, a gesture and a run of
refusals each send one.

### Added with the document

```ts
const provider = z.string().describe("The document's provider: `loro` or `local`")
const files = z.array(z.string()).describe("The project files in the document, by path")

defineEvent(
  "projectDoc.opened",
  z.object({
    provider,
    files,
    designs: z.int().min(0).describe("Designs in the document"),
    layers: z.int().min(0).describe("Layers in the document"),
    durationMs: z.number().describe("From reading the files to the document being ready, in milliseconds"),
    wasmMs: z
      .number()
      .optional()
      .describe("Time to download and compile the provider's WebAssembly, in milliseconds, when it has any"),
    bytes: z.int().min(0).optional().describe("The provider's state, in bytes, when it can say")
  }),
  { level: "info", sentBy: ["renderer"], when: "A project's designs are loaded into the document." }
)

defineEvent(
  "projectDoc.openFailed",
  z.object({
    provider,
    files,
    file: z.string().optional().describe("The file it failed on, when one is to blame"),
    message: z.string().describe("Why, as the provider said it")
  }),
  { level: "error", sentBy: ["renderer"], when: "Loading a project's designs into the document fails." }
)

defineEvent(
  "projectDoc.refused",
  z.object({
    provider,
    label: z.string().describe("The transaction's label: `Move layer`"),
    origin: z.enum(["edit", "agent", "extension", "file", "view", "remote"]).describe("Who made it"),
    problem: z
      .enum(["unknownDesign", "unknownNode", "takenId", "intoItself", "notSibling", "fixedField", "invalid"])
      .describe("Why the first was refused"),
    op: z.string().describe("The kind of operation refused: `move`"),
    count: z.int().min(1).describe("Transactions refused in the run: one, or all of a gesture's")
  }),
  {
    level: "warn",
    sentBy: ["renderer"],
    when: "A transaction is refused, or a gesture ends that had some refused, so nothing in them was applied."
  }
)

defineEvent(
  "projectDoc.closed",
  z.object({
    provider,
    durationMs: z.number().describe("How long the document was open, in milliseconds"),
    transactions: z.int().min(0).describe("Transactions applied"),
    operations: z.int().min(0).describe("Operations in them"),
    undos: z.int().min(0).describe("Steps undone"),
    redos: z.int().min(0).describe("Steps redone"),
    refused: z.int().min(0).describe("Transactions refused"),
    layers: z.int().min(0).describe("Layers when it closed"),
    peakBytes: z.int().min(0).optional().describe("The provider's largest state, in bytes, when it can say"),
    transactMs: z.number().describe("Time spent checking and applying transactions, in milliseconds")
  }),
  { level: "info", sentBy: ["renderer"], when: "A project closes, with a summary of its document's session." }
)
```

### Added with sync, later

Defined when sync is built, and listed here so the document's events are planned together.

```ts
defineEvent(
  "projectDoc.repaired",
  z.object({
    provider,
    repair: z
      .enum(["duplicateId", "duplicateSlot", "danglingPatch", "statesOnNonComponent", "orphan"])
      .describe(
        "What was repaired: two layers with one id, two layers that are one slot, a patch naming a layer that's gone, states on a design that isn't a component, or a layer whose parent was gone"
      ),
    design: z.string().describe("The design, by key"),
    count: z.int().min(1).describe("Things repaired")
  }),
  { level: "warn", sentBy: ["renderer"], when: "Changes from someone else leave a design needing a repair." }
)

defineEvent(
  "projectSync.connected",
  z.object({
    provider,
    peers: z.int().min(0).describe("Other people in the session when it connected"),
    durationMs: z.number().describe("From connecting to being up to date, in milliseconds"),
    bytes: z.int().min(0).describe("Bytes received to catch up")
  }),
  { level: "info", sentBy: ["renderer"], when: "A shared design session connects and is up to date." }
)

defineEvent(
  "projectSync.disconnected",
  z.object({
    provider,
    reason: z
      .enum(["closed", "network", "refused", "idle"])
      .describe("Why: closed by the person, lost, refused by the server, or idle"),
    connectedMs: z.number().describe("How long it was connected, in milliseconds"),
    pending: z.int().min(0).describe("Local transactions not yet sent")
  }),
  { level: "info", sentBy: ["renderer"], when: "A shared design session disconnects." }
)

defineEvent(
  "projectSync.caughtUp",
  z.object({
    provider,
    sent: z.int().min(0).describe("Local transactions sent after reconnecting"),
    received: z.int().min(0).describe("Others' transactions received"),
    bytes: z.int().min(0).describe("Bytes exchanged"),
    durationMs: z.number().describe("From reconnecting to being up to date, in milliseconds")
  }),
  { level: "info", sentBy: ["renderer"], when: "A shared design session catches up after being offline." }
)

defineEvent(
  "projectSync.failed",
  z.object({
    provider,
    direction: z.enum(["send", "receive"]).describe("Whether sending or receiving failed"),
    message: z.string().describe("Why, as the provider or server said it"),
    bytes: z.int().min(0).describe("The update's size, in bytes")
  }),
  { level: "error", sentBy: ["renderer"], when: "An update can't be sent, or one received can't be applied." }
)
```

### Changed

| Event                        | Change                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gesture.ended`              | Adds `transactions` (`z.int().min(0)`, "Transactions the gesture applied") and `transactMs` (`z.number()`, "Time spent checking and applying them, in milliseconds") |
| `document.saved`             | Adds `exportMs` (`z.number()`, "Time to produce the file's content from the document, in milliseconds")                                                              |
| `edit.undone`, `edit.redone` | Keep their attributes, now filled from the returned `DocChange`. With sync, add `kept` (`z.int().min(0)`, "Changes left as someone else made them since")            |

## Order of work

The session moves onto the document with the local provider first, so the biggest change lands without the new
dependency. Loro then comes in where the provider is picked, which is also how it would go back out.

1. **Design ids with a random suffix:** `designId` in `@parity-app/core`, used where a new design is named.
2. **Today's numbers:** `benchSession` and `generateProject` first, then `design-store.bench.ts` with an adapter over
   today's `DesignStore`, its numbers and commit on this page.
3. **`@parity-app/multiplayer`:** the types, checking on a draft, undo and gestures, the functions for callers, lookups,
   `diffFiles`, and the shared tests. `TokenEdits` moves to core.
4. **`@parity-app/multiplayer-local`,** passing the shared tests, and its bench run.
5. **The session on the document, with the local provider:** `renderer/project-doc.ts`, `ProjectSaver`, `DesignStore`
   folded away and callers moved to the functions, the snapshot undo removed from `history.ts`, the events above, and
   [editor.md](../editor.md) updated.
6. **`@parity-app/multiplayer-loro`,** passing every shared test, the concurrent ones with a replica pair, and checking
   which Loro build Vite takes.
7. **The window on Loro:** `renderer/project-doc.ts` picks `loroProvider`, and the bench and load costs run on all
   three, with the numbers here and a decision on hot paths.
8. **Later, each its own piece:** sync through a relay in the cloud, presence, review links with `diffFiles`, and
   comments.

## Open questions

- **Loro's events and `commit`.** Whether a commit's events arrive before `commit` returns doesn't matter for local
  operations, which update the plain values themselves, but decides how others' changes are taken in.
- **History in long sessions.** Loro keeps every operation. The benchmark's 10,000 edits say whether long sessions need
  a shallow snapshot.
- **Coarse merge units.** `states`, a patch inside `responsive` or `overrides`, a param's options, the modes and a
  file's other fields are each replaced whole, so two people editing different parts of one keep only the last. Making
  `states[].overrides` and the patches maps of their own is the first change if that bites.
- **Starting a shared session.** Two backends built from one `.par` each have their own provider ids and can't merge. A
  shared session starts from one snapshot of the provider's state, held in the cloud, that everyone loads. `.par` stays
  what's in git.
- **Outside changes in a shared session.** If everyone's file watcher saw the same commit and called `replaceFile`, its
  inserts would arrive several times. In a shared session, only the cloud applies commits, and the window's watcher
  leaves designs alone.
- **The web review page and 3.4 MiB of WebAssembly.** The diff doesn't need Loro, so the page may not either.
