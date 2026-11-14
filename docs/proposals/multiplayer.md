# Proposal: a design document that several people can edit (PAR-1104)

Status: draft for discussion, 2026-11-14. Nothing here is built. This page sets out the data structures and patterns
that let the designs in `.par` files be edited by several people at once later, behind an interface whose library can be
swapped. Sync, presence, the cloud and review links come later; what's built first works for one person, offline, as the
editor does today.

## In one line

The editor's designs move from snapshots it replaces into a document of nodes and properties that changes by operations.
Parity talks to it through `@parity-app/multiplayer`, and `@parity-app/multiplayer-loro` is the first implementation, on
[Loro](https://github.com/loro-dev/loro).

## Why now

- **Multiplayer is coming,** on designs that live only in `.par` files, stored in the cloud, on one committed branch.
  Review links that show what changed between two commits, with comments on them, come with it.
- **Today's model can't merge.** `DesignStore` replaces a whole `DesignSnapshot` for each change, and undo goes back to
  an earlier snapshot. Two people's changes to one design can't be combined, and undo would take back someone else's
  work.
- **Ids collide.** New ids come from names (`uniqueId` gives `title-2`), so two people adding a title at once make the
  same id.
- **Order is array positions.** `children` and `slots` are arrays, which can't take two inserts at once.
- **The expensive parts are cheap to change now** and costly once more is built on snapshots: ids, ordering, undo and
  how changes are described.

## What's decided

- **Designs change by operations on nodes and properties,** never by replacing a snapshot. One transaction is one undo
  step, one change for the node index and extension hosts, and, later, one update for other people.
- **Parity reads plain, immutable values,** the same `CanvasDocument`, `ContainerSpec` and `DesignNode` objects it reads
  now, each the same object until a change touches it. Views, the node index (PAR-1088) and the editing functions in
  `@parity-app/editor` keep working.
- **Two packages now and room for a third,** as [packages.md](packages.md) asks: data in, data out, tested without
  Electron.

  | Package                              | Holds                                                                                                                                                                                                                                |
  | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `@parity-app/multiplayer`            | The interface, operations and changes; the bridge from whole values to operations; the diff of two `.par` files; and, under `/testing`, the shared tests, a plain provider they run against, the benchmark and its generated project |
  | `@parity-app/multiplayer-loro`       | The Loro provider. Depends on `loro-crdt`, which nothing else imports                                                                                                                                                                |
  | `@parity-app/multiplayer-liveblocks` | Not now. The interface leaves room for it                                                                                                                                                                                            |

- **No library type crosses the interface.** Nothing outside `multiplayer-loro` sees a `LoroDoc`, `LoroMap` or `TreeID`.
  Swapping providers means a new package that passes the shared tests.
- **`.par` stays the format on disk and in git,** plain JSON as today. A provider loads from it and saves to it, so
  swapping providers loses history, never designs. Git keeps the history between commits.
- **Undo is per person and made of operations:** it reverses only this person's transactions.
- **`history.ts`'s snapshot undo goes** once `DesignStore` sits on the document, as [conventions.md](../conventions.md)
  asks: no second path kept beside it.

## What goes in the document

One document per open project, holding every `.par` file the project edits. Libraries' `.lib.par` files are read only,
and designs drawn from code (pages, component boards, stories) are drawn again each time a project opens, so neither is
in it.

| Part                           | In the document                                                                                                  | Merges                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Designs                        | A node per design, in the order its file lists them                                                              | Per field; record fields per key (below)            |
| Layers                         | A node per layer, inside its design or its parent layer, in order                                                | Per field; record fields per key; text by character |
| Notes and references           | One entry per item, by id, with an order key                                                                     | Whole item                                          |
| Modes                          | One entry per top-level field of `ModeSettings`                                                                  | Whole field                                         |
| A file's other fields          | `detection`, `objects`, `links`, `sources`, `images`, `preferences`, `extensions`, `codeDesigns`, one entry each | Whole field                                         |
| Token values edited            | One entry per token, never saved to `.par` and never shared                                                      | Whole value                                         |
| Layers' `internals`, `element` | Not in the document: read from code and never saved                                                              |                                                     |

**Record fields merge per key,** one level deep: a layer's `style`, `props`, `args`, `overrides` and `responsive`, and a
design's `params` and `frames`. Two people changing a layer's padding and its colour both land. Everything else (a
`position`, `states`, `view`, `context`, `bind`, `credit`, a patch inside `responsive`) is replaced whole, and the last
write wins.

**A text layer's `text` merges by character,** so two people typing in one layer both keep their typing.

### Ids

- **A node's address stays a design key and a node id** (`app.par#home` and `title`), as the `.par` and the node index
  have them. The provider maps it to its own ids, which never leave it.
- **New ids keep a readable stem and add four random characters:** `uniqueId("Title", taken)` gives `title-k3f9`, not
  `title-2`, so two people adding a title at once don't collide, and the `.par` still reads well. Designs, notes and
  references get theirs the same way. Ids already in files stay as they are.
- **Ids an agent chooses are checked as today,** and refused when taken.
- **After a merge, two nodes with one id in one design are repaired:** the one created later gets a new suffix, and the
  repair is recorded (`designDoc.repaired`). This can only happen once changes arrive from other people.

### Order

- **Every node has a parent and a place among its siblings,** not an index in an array. The Loro provider uses Loro's
  movable tree with fractional order, so an insert or a move changes one node.
- **Operations place a node before a sibling** (`before`), or last when none is named, rather than at an index, so a
  place stays meaningful when someone else inserts at the same time.
- **A slot's children are a parent's children with a `slot` name:** a component or instance node's `slots.actions` are
  its children whose slot is `actions`, kept in order among themselves. A layout's children have none.
- **Cycles can't happen.** A local move into a node's own descendant is refused before it's applied. Concurrent moves
  that would make one are resolved by Loro's tree, which never forms a cycle.

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
  ReferenceSpec
} from "@parity-app/core"
import type { TokenEdits } from "@parity-app/editor"

/** A design's key: its file and its id, `app.par#home`, as `containerKey` makes it. */
export type DesignKey = string

/** A layer: its design, and its id within that design. */
export interface LayerAddress {
  design: DesignKey
  node: string
}

/** A field, or one key of a record field: `["name"]`, `["style", "padding"]`, `["params", "label"]`. */
export type FieldPath = readonly [field: string] | readonly [field: string, key: string]

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

export type DesignOp =
  // designs
  | { op: "addDesign"; file: string; design: ContainerSpec; before?: DesignKey }
  | { op: "removeDesign"; design: DesignKey }
  /** Reorders a design in its file, or moves it to the end of another file, or before a design there. */
  | { op: "moveDesign"; design: DesignKey; file?: string; before?: DesignKey }
  /** Sets one of a design's fields, or one key of `params` or `frames`; `undefined` removes it. Not `root`. */
  | { op: "setDesign"; design: DesignKey; path: FieldPath; value: JsonValue | undefined }
  // layers
  /** Inserts a layer with everything inside it, under `parent`, in `slot` when the parent is a component or instance. */
  | { op: "insert"; design: DesignKey; parent: string; slot?: string; before?: string; node: DesignNode }
  | { op: "remove"; design: DesignKey; node: string }
  /** Moves a layer within its design. Moving to another design is a remove and an insert. */
  | { op: "move"; design: DesignKey; node: string; parent: string; slot?: string; before?: string }
  /** Sets one of a layer's fields, or one key of a record field; `undefined` removes it. Not `id`, `type` or children. */
  | { op: "set"; design: DesignKey; node: string; path: FieldPath; value: JsonValue | undefined }
  | { op: "editText"; design: DesignKey; node: string; edit: TextEdit }
  // the rest of a file
  | { op: "setNote"; file: string; note: NoteSpec; before?: string }
  | { op: "removeNote"; file: string; id: string }
  | { op: "setReference"; file: string; reference: ReferenceSpec; before?: string }
  | { op: "removeReference"; file: string; id: string }
  | { op: "setFileField"; file: string; field: FileField; value: JsonValue | undefined }
  | { op: "setModes"; modes: ModeSettings }
  // not saved to .par, never shared
  | { op: "setTokens"; tokens: TokenEdits }
```

- **A node an operation inserts or adds is checked** against core's schemas (`parseDesignNode`, `containerSpec`), as
  agents' insertions are now.
- **`setDesign` and `set` take JSON values,** checked against the field's schema when the transaction is checked.

### Transactions and gestures

```ts
/** Who made a change, for undo, saving and telemetry. */
export type ChangeOrigin =
  | "edit" // the person, on the canvas or in a panel
  | "agent" // an agent, through the project's API
  | "extension" // an extension with the edits permission
  | "file" // a file changed outside Parity: git, an editor, an agent writing it
  | "view" // which state or modes a design shows: not undoable
  | "remote" // someone else, once sync arrives: never in this person's undo

export interface TransactOptions {
  origin: ChangeOrigin
  /** The gesture this belongs to: its transactions are one undo step until it ends. */
  gesture?: GestureId
  /** Whether the files it changes are written. `false` for changes that came from the files. Defaults to true. */
  persist?: boolean
}

export type TransactProblem =
  | { kind: "unknownDesign"; design: DesignKey }
  | { kind: "unknownNode"; address: LayerAddress }
  | { kind: "takenId"; design: DesignKey; id: string }
  | { kind: "intoItself"; address: LayerAddress; parent: string }
  | { kind: "noSuchSlot"; address: LayerAddress; slot: string }
  | { kind: "invalid"; op: number; pointer: string; message: string }

export type TransactResult = { ok: true; change: DocChange | undefined } | { ok: false; problem: TransactProblem }

/** A gesture's id, which `beginGesture` makes. */
export type GestureId = string

/** Where the document was during a gesture, to go back to (an absolute drag's side coming back, or Escape). */
export interface Checkpoint {
  readonly gesture: GestureId
  readonly version: DocVersion
}
```

- **A transaction is checked whole, then applied whole,** or not at all: its operations are checked against the current
  values first, since a provider may not be able to take back half of one.
- **A transaction that changes nothing returns no change** and makes no undo step.
- **Gestures nest:** the first `beginGesture` starts an undo group and the last `endGesture` ends it. A change preview
  open during a drag joins the drag's step.

### The document

```ts
export interface DesignDoc {
  /** The provider's name, as telemetry records it: `loro`. */
  readonly provider: string

  // Reading. Plain values, each the same object until a change touches it.
  /** Every file, as its `.par` holds it: the designs, notes, references and other fields. */
  files(): ReadonlyMap<string, CanvasDocument>
  file(path: string): CanvasDocument | undefined
  design(key: DesignKey): ContainerSpec | undefined
  node(address: LayerAddress): DesignNode | undefined
  /** The layer a layer sits in, and the slot it fills, or the design itself for a root layer. */
  parent(address: LayerAddress): { node: string; slot?: string } | "design" | undefined
  modes(): ModeSettings
  tokens(): TokenEdits
  version(): DocVersion

  // Writing.
  transact(label: string, ops: readonly DesignOp[], options: TransactOptions): TransactResult
  /** A file changed outside Parity: becomes one undoable step that makes the file what it now holds, and isn't written back. */
  replaceFile(path: string, document: CanvasDocument): TransactResult

  // Gestures.
  beginGesture(): GestureId
  /** Ends a gesture. Returns whether it made an undo step. */
  endGesture(gesture: GestureId): boolean
  checkpoint(gesture: GestureId): Checkpoint
  /** Takes the document back to a checkpoint, inside the gesture's step. */
  revert(checkpoint: Checkpoint): void
  /** Takes the whole gesture back and ends it, leaving no undo step and Redo as it was. */
  cancelGesture(gesture: GestureId): void

  // Undo, this person's transactions only.
  undo(): DocChange | undefined
  redo(): DocChange | undefined
  history(): UndoState

  // Hearing of changes: once per transaction, undo, redo, revert or replaced file, local or not.
  subscribe(listener: (change: DocChange) => void): () => void

  /** Releases what the provider holds. The document can't be used after. */
  dispose(): void
}

export interface UndoState {
  canUndo: boolean
  canRedo: boolean
  /** The labels Edit > Undo and Redo show: `Move frame`, `Change padding`. */
  undoLabel?: string
  redoLabel?: string
}

export interface DocProvider {
  readonly name: string
  /** Opens a project's files. `main` is the file new designs and the modes go into. */
  open(options: OpenOptions): DesignDoc
}

export interface OpenOptions {
  files: readonly { path: string; document: CanvasDocument }[]
  main: string
  modes: ModeSettings
  /** The most steps Undo goes back: `historyLimit`, 200. */
  undoLimit: number
}
```

### Changes

```ts
/** What one transaction, undo, redo, revert or replaced file changed, for views, saving, the node index and telemetry. */
export interface DocChange {
  origin: ChangeOrigin
  /** The transaction's label, or the step undone or redone. */
  label: string
  kind: "transaction" | "undo" | "redo" | "revert" | "replaceFile"
  /** Files whose `.par` content changed. Empty when `persist` was false. */
  writes: readonly string[]
  designs: {
    added: readonly DesignKey[]
    removed: readonly DesignKey[]
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
  version: DocVersion
}
```

### The bridge from whole values

About a hundred places change designs today by handing `DesignStore` a function from one value to the next:
`updateContainer(key, label, (container) => …)` and its relatives. They stay as they are. The bridge turns their result
into operations:

```ts
/** The operations that make `before` into `after`, comparing only what isn't the same object. */
export function containerOps(key: DesignKey, before: ContainerSpec, after: ContainerSpec): DesignOp[]

/** The same for a whole file, including its designs, notes, references and other fields. */
export function fileOps(path: string, before: CanvasDocument, after: CanvasDocument): DesignOp[]
```

- **It compares by object first,** as PAR-1088's collector does: a layer that's the same object, with everything inside
  it, is skipped. Only what an edit touched is compared field by field.
- **A layer in a new place is a move,** found by its id. A layer whose id is gone is a remove, and a new id an insert.
- **A text layer's new text is a `replace`,** which the provider turns into the smallest splice.
- **Hot paths can skip it later.** A drag, a nudge or typing can send operations directly if the benchmark shows the
  bridge costs too much. Nothing has to move first.

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
/** The tests every provider passes, as a Vitest suite. */
export function describeDesignDoc(provider: DocProvider, options?: { replicas?: ReplicaPair }): void

/** Two documents that exchange changes, for the concurrent tests. A provider that syncs offers one. */
export interface ReplicaPair {
  open(options: OpenOptions): { a: DesignDoc; b: DesignDoc; exchange(): void }
}

/** A plain provider without merging: the reference the shared tests are written against, and the benchmark's baseline. */
export const plainProvider: DocProvider

/** A project to load: `designs` designs of about `layers` layers each, `depth` deep, with text, instances and slots. */
export function generateProject(options: {
  designs: number
  layers: number
  depth: number
  seed: number
}): { path: string; document: CanvasDocument }[]
```

`plainProvider` lives only under `/testing`. The editor never uses it.

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
│   │   └─ its root layer        data: { id, type, slot?, parentSlot?, name?, hidden?, locked?, tag?,
│   │       └─ layers …                  component?, design?, route?, src?, alt?, fit?, controls?, credit?,
│   │                                    bind?, text: LoroText, style: LoroMap, props: LoroMap,
│   │                                    args: LoroMap, overrides: LoroMap, responsive: LoroMap }
├─ "notes"       LoroMap: `path#id` → { file, note, order }
├─ "references"  LoroMap: `path#id` → { file, reference, order }
├─ "files"       LoroMap: path → LoroMap of the file's other fields
├─ "modes"       LoroMap: field of ModeSettings → value
└─ "tokens"      LoroMap: token → value
```

- **A design's place in its file** is its root's place among the roots of that file.
- **`parentSlot`** names the slot of a component or instance a layer fills. A layout's `slot` field, which says the
  layout is a slot of its component, is a field like any other.
- **Record fields are `LoroMap`s** created with the node, so per-key merging needs nothing more. Only the fields a node
  has are created.
- **Notes and references keep an order key** made with Loro's fractional index, since a `LoroMap` has no order.

### Each method

| Method                       | On Loro                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`                       | `new LoroDoc()`, `getTree("designs").enableFractionalIndex(…)`, builds every node from the files and commits with origin `load`, which undo leaves out                                                                                                                                      |
| `files`, `design`, `node`    | Read from the plain values the provider keeps (below), never from Loro                                                                                                                                                                                                                      |
| `transact`                   | Checks every operation against the plain values, then applies them: `tree.createNode`, `tree.move` (by `before`'s index), `tree.delete`, `node.data.set`, a record's `LoroMap.set`/`delete`, `LoroText.insert`/`delete` or `update` for a replace, and `commit({ origin, message: label })` |
| `replaceFile`                | `fileOps` between what the file holds now and `document`, applied as one transaction with origin `file` and `persist: false`                                                                                                                                                                |
| `beginGesture`, `endGesture` | `undo.groupStart()` for the first open gesture and `undo.groupEnd()` for the last                                                                                                                                                                                                           |
| `checkpoint`, `revert`       | `doc.frontiers()`, and `doc.revertTo(frontiers)`, which writes the operations that go back, inside the gesture's group                                                                                                                                                                      |
| `cancelGesture`              | `revertTo` the gesture's first frontiers, then `groupEnd()`. Leaving no step and Redo as it was is an open question (below)                                                                                                                                                                 |
| `undo`, `redo`               | `undo.undo()`, `undo.redo()`; the label comes back through `onPop` (below)                                                                                                                                                                                                                  |
| `history`                    | `canUndo()`, `canRedo()`, and the labels from `topUndoValue()` and `topRedoValue()`                                                                                                                                                                                                         |
| `subscribe`                  | One `DocChange` per commit, from the event batch's tree, map and text diffs                                                                                                                                                                                                                 |
| `version`                    | `doc.frontiers()`, encoded                                                                                                                                                                                                                                                                  |
| `dispose`                    | Drops the `LoroDoc`, the `UndoManager` and the subscription                                                                                                                                                                                                                                 |

### Undo

- **`new UndoManager(doc, { mergeInterval: 0, maxUndoSteps: undoLimit, excludeOriginPrefixes: ["load", "view", "remote"] })`.**
  Parity groups steps itself, by transaction and gesture, so nothing merges by time. Loading and view changes are never
  steps, and later neither are other people's changes.
- **Loro undoes only this person's commits,** and only what they changed: someone else's later edit to the same field
  stands.
- **A step's label and the selection travel with it.** `onPush` returns `{ value: { label, selection }, cursors }`, and
  `onPop` gives them back, so Edit > Undo names the step and undoing puts the selection back.
- **Changes from files are steps,** as today: a file changed by git or an agent is one undoable step (`replaceFile`).

### The plain values

`files()`, `design()` and `node()` return plain objects the provider keeps beside Loro, built once on `open`:

- **A commit updates only what it touched.** For each node in the event batch, the provider builds its new plain value
  and copies the layers above it up to the design, its `ContainerSpec` and its file's `CanvasDocument`. Every other
  design, layer and file stays the same object.
- **Local transactions update them from the operations applied** when Loro's events for a commit arrive after `commit`
  returns, so `transact` returns with the values current. Events still drive undo, redo and, later, changes from others.
- **Saving reads them,** so writing a file is `JSON.stringify` of a value that's already there.

### Loading the library

- `loro-crdt` 1.x (1.17.1 now), MIT. Its WebAssembly is about 3.4 MB.
- The window loads its bundler build through Vite, which copies the `.wasm`. Tests in Node load its Node build. A web
  page, such as a review link, would load it the same way or take `loro-crdt/base64`.
- Loro handles no networking. Sync later sends the bytes from `doc.subscribeLocalUpdates` and takes others' with
  `doc.import`.

## How `DesignStore` moves onto it

`DesignStore` keeps its API, so the ~100 callers don't change. Inside, a `DesignDoc` replaces `DesignHistory`:

| Today                                                 | On the document                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `change(label, update, options)`                      | `fileOps` on each file `update` changed, then one `transact`                                               |
| `updateContainer`, `updateContainers`                 | `containerOps`, then one `transact`                                                                        |
| `addContainer`, `removeContainer`, `reorderContainer` | `addDesign`, `removeDesign`, `moveDesign`                                                                  |
| `setModes`, `changeTokens`                            | `setModes`, `setTokens`                                                                                    |
| `updateView` (not undoable)                           | `setDesign` on `view` with origin `view`                                                                   |
| `reloadDocument`                                      | `replaceFile`; a file with unsaved changes is still left alone unless forced                               |
| `beginGesture`, `endGesture`                          | The document's, which also keep `inGesture` and `subscribeGestures`                                        |
| `checkpoint`, `revert`, `changedBesides`              | The document's checkpoints; `changedBesides` compares the design with its value at the checkpoint          |
| `undo`, `redo`, `getHistory`                          | The document's                                                                                             |
| Saving                                                | Each change's `writes` schedules those files, as `schedule(path)` does now; a write is `doc.file(path)`    |
| Unsaved                                               | A file is unsaved while `doc.file(path)` isn't the value last written, nor the same as it (`sameDocument`) |
| `getEntries`, `getEntry`                              | Built from `doc.files()`, keeping each entry while its design is the same object, as now                   |

`history.ts` keeps saving's state (`SaveState`, failures, writes in flight) and loses `DesignSnapshot`, `HistoryEntry`
and the snapshot undo.

The node index from PAR-1088 keeps working, since unchanged designs and layers stay the same objects. Later,
`DocChange.designs` can name the parts to gather again instead of comparing objects.

## The shared tests

`describeDesignDoc` runs against `plainProvider` and `loroProvider`. Each case is a test:

**Reading and writing**

- Opening files and reading them back gives the same `.par` content.
- A transaction changes only the designs, layers and files it touched; everything else is the same object.
- Each operation does what it says, including `before`, slots and removing a field with `undefined`.
- A transaction with one bad operation changes nothing and says why: an unknown node, a taken id, a move into a node's
  own descendant, a missing slot, an invalid value.
- A transaction that changes nothing returns no change and makes no step.
- `replaceFile` makes the file what it holds, as one step, and doesn't mark it to be written.

**Undo**

- Undo and redo go back and forth through steps, with their labels.
- A gesture's transactions are one step; nested gestures are one step.
- `revert` inside a gesture keeps one step; `cancelGesture` leaves none, with Redo as it was.
- View changes and loading are never steps.
- Undo stops at `undoLimit`.

**Changes**

- Each transaction, undo, redo, revert and replaced file sends one change, naming what it touched and the files to
  write.

**Concurrent,** with a `ReplicaPair`

- Two people setting different fields of one layer both land; the same field ends the same on both.
- Two people changing different keys of `style` both land.
- Two people typing in one text layer both keep their typing.
- Two people inserting before the same sibling both land, in the same order on both.
- Two moves that would make a cycle end with no cycle, the same on both.
- One person removing a layer another is editing: the same result on both.
- Two layers given one id are repaired, the same way on both.
- Undo takes back only this person's step, and leaves the other person's later change to the same field.

## The benchmark

Under `/testing`, run as a Vitest bench against `plainProvider` and `loroProvider`. The script that runs it needs
agreeing before it's added to `package.json`.

| Project    | Designs | Layers each | Depth |
| ---------- | ------: | ----------: | ----: |
| Small      |      20 |         200 |     6 |
| Large      |     200 |       1,000 |    10 |
| Very large |     500 |       2,000 |    12 |

| Scenario                                   | Measures                                  |
| ------------------------------------------ | ----------------------------------------- |
| Open the project                           | Time, memory after                        |
| Set one field on one layer                 | Time per transaction                      |
| A 300-frame drag of one layer, then end    | Time per frame, time to end, memory after |
| Type 200 characters into a text layer      | Time per character                        |
| Paste 500 layers                           | Time                                      |
| Undo and redo 50 steps                     | Time per step                             |
| The bridge on a one-field change           | Time, against sending the operation       |
| Save one file                              | Time to produce its `.par`                |
| 10,000 edits in a session                  | Memory growth                             |
| Exchange 1,000 transactions with a replica | Bytes, time to apply                      |

The numbers go on this page when it runs, to decide the hot paths and whether memory needs Loro's shallow snapshots in
long sessions.

## Telemetry

Each event is defined with `defineEvent` in `packages/telemetry/src/document-events.ts`, added to `registeredEvents`,
and listed in [docs/telemetry.md](../telemetry.md), as "Adding an event" there says. All are sent by the window, the
only process that holds the document. None is sent per transaction or per frame: a session and a gesture each send one
summary.

### Added with the document

```ts
const provider = z.string().describe("The document's provider: `loro`")
const files = z.array(z.string()).describe("The project files in the document, by path")

defineEvent(
  "designDoc.opened",
  z.object({
    provider,
    files,
    designs: z.int().min(0).describe("Designs in the document"),
    layers: z.int().min(0).describe("Layers in the document"),
    durationMs: z.number().describe("From reading the files to the document being ready, in milliseconds"),
    bytes: z.int().min(0).optional().describe("The provider's state, in bytes, when it can say")
  }),
  { level: "info", sentBy: ["renderer"], when: "A project's designs are loaded into the document." }
)

defineEvent(
  "designDoc.openFailed",
  z.object({
    provider,
    files,
    file: z.string().optional().describe("The file it failed on, when one is to blame"),
    message: z.string().describe("Why, as the provider said it")
  }),
  { level: "error", sentBy: ["renderer"], when: "Loading a project's designs into the document fails." }
)

defineEvent(
  "designDoc.refused",
  z.object({
    provider,
    label: z.string().describe("The transaction's label: `Move layer`"),
    origin: z.enum(["edit", "agent", "extension", "file", "view", "remote"]).describe("Who made it"),
    problem: z
      .enum(["unknownDesign", "unknownNode", "takenId", "intoItself", "noSuchSlot", "invalid"])
      .describe("Why it was refused"),
    op: z.string().describe("The kind of operation refused: `move`"),
    operations: z.int().min(1).describe("Operations in the transaction")
  }),
  { level: "warn", sentBy: ["renderer"], when: "A transaction is refused, so nothing in it is applied." }
)

defineEvent(
  "designDoc.closed",
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
    transactMs: z.number().describe("Time spent applying transactions, in milliseconds")
  }),
  { level: "info", sentBy: ["renderer"], when: "A project closes, with a summary of its document's session." }
)
```

### Added with sync, later

Defined when sync is built, and listed here so the document's events are planned together.

```ts
defineEvent(
  "designDoc.repaired",
  z.object({
    provider,
    repair: z
      .enum(["duplicateId", "orphan"])
      .describe("What was repaired: two nodes with one id, or a node whose parent was gone"),
    design: z.string().describe("The design, by key"),
    nodes: z.int().min(1).describe("Nodes repaired")
  }),
  { level: "warn", sentBy: ["renderer"], when: "Changes from someone else leave the document needing a repair." }
)

defineEvent(
  "designSync.connected",
  z.object({
    provider,
    peers: z.int().min(0).describe("Other people in the session when it connected"),
    durationMs: z.number().describe("From connecting to being up to date, in milliseconds"),
    bytes: z.int().min(0).describe("Bytes received to catch up")
  }),
  { level: "info", sentBy: ["renderer"], when: "A shared design session connects and is up to date." }
)

defineEvent(
  "designSync.disconnected",
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
  "designSync.caughtUp",
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
  "designSync.failed",
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

| Event                        | Change                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gesture.ended`              | Adds `transactions` (`z.int().min(0)`, "Transactions the gesture applied") and `transactMs` (`z.number()`, "Time spent applying them, in milliseconds")   |
| `document.saved`             | Adds `exportMs` (`z.number()`, "Time to produce the file's content from the document, in milliseconds")                                                   |
| `edit.undone`, `edit.redone` | Keep their attributes, now filled from the step's `DocChange`. With sync, add `kept` (`z.int().min(0)`, "Fields left as someone else changed them since") |

## Order of work

1. **Ids with a random suffix:** `uniqueId` in `@parity-app/core`, and the tests that expect `title-2`.
2. **`@parity-app/multiplayer`:** the types, the bridge, `diffFiles`, and under `/testing` the plain provider, the
   shared tests (apart from the concurrent ones), the generated project and the benchmark.
3. **`@parity-app/multiplayer-loro`:** the provider, passing every shared test, the concurrent ones with a replica pair.
4. **The benchmark,** run on both providers, with its numbers here and a decision on hot paths.
5. **`DesignStore` on the document,** with the snapshot undo removed from `history.ts`, the events above, and
   [editor.md](../editor.md) updated.
6. **Later, each its own piece:** sync through a relay in the cloud, presence, review links with `diffFiles`, and
   comments.

## Open questions

- **Cancelling a gesture.** Escape after a live resize leaves no step today and puts Redo back as it was. Loro's
  `UndoManager` can't restore an earlier redo stack, so either cancelling clears Redo, or the provider keeps its own
  record of a gesture's redo. The spike decides.
- **Loro's events and `commit`.** Whether a commit's events arrive before `commit` returns decides whether local
  transactions update the plain values from events or from the operations applied. Both are allowed above.
- **History in long sessions.** Loro keeps every operation. The benchmark's 10,000 edits say whether long sessions need
  a shallow snapshot.
- **Modes and a file's other fields replaced whole.** Two people changing different viewports at once keep only the last
  change. Fine until someone needs more.
- **The web review page and 3.4 MB of WebAssembly.** The diff doesn't need Loro, so the page may not either.
