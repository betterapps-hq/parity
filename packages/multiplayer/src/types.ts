import type {
  CanvasDocument,
  ContainerSpec,
  DesignNode,
  JsonValue,
  ModeSettings,
  NoteSpec,
  ReferenceSpec
} from "@parity-app/core"
import type { TextSplice, TokenEdits } from "@parity-app/editor"

/*
 * The project document's types (docs/proposals/multiplayer.md): what a caller reads and sends, what a transaction
 * changed, and what a provider gives `ProjectDoc`. No provider's own type crosses them.
 */

/** A design's key: its file and its id, `app.par#home`. */
export type DesignKey = string

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
  | "routeKinds"
  | "images"
  | "preferences"
  | "extensions"
  | "codeDesigns"

export const fileFields: readonly FileField[] = [
  "detection",
  "objects",
  "links",
  "sources",
  "routeKinds",
  "images",
  "preferences",
  "extensions",
  "codeDesigns"
]

/** Opaque: equal while the document is unchanged. */
export interface DocVersion {
  readonly provider: string
  readonly value: string
}

export function sameVersion(a: DocVersion, b: DocVersion): boolean {
  return a.provider === b.provider && a.value === b.value
}

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
  /** Gives a component or instance layer a slot filled with nothing, before another of its slots or last. */
  | { op: "addSlot"; design: DesignKey; node: string; slot: string; before?: string }
  /** Takes a slot away from a component or instance layer, which differs from leaving it filled with nothing. */
  | { op: "removeSlot"; design: DesignKey; node: string; slot: string }
  // Files.
  /** A new `.par` file with no designs, notes or references yet, and the other fields given. */
  | { op: "addFile"; file: string; fields?: Partial<Record<FileField, JsonValue>> }
  /** Takes a file out of the project, with everything in it. Never the main file. */
  | { op: "removeFile"; file: string }
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
  /** Token values edited on the canvas, which the saver writes to the stylesheet. Shared like the rest, with sync. */
  | { op: "setTokens"; tokens: TokenEdits }

export type TransactProblem =
  | { kind: "unknownDesign"; op: number; design: DesignKey }
  | { kind: "unknownNode"; op: number; address: LayerAddress }
  | { kind: "takenId"; op: number; design: DesignKey; id: string }
  | { kind: "intoItself"; op: number; address: LayerAddress; parent: string }
  | { kind: "notSibling"; op: number; address: LayerAddress; before: string }
  | { kind: "fixedField"; op: number; address: LayerAddress; field: string }
  | { kind: "unknownFile"; op: number; file: string }
  | { kind: "takenFile"; op: number; file: string }
  | { kind: "invalid"; op?: number; design?: DesignKey; pointer: string; message: string }

/** Who made a change, for undo, saving and telemetry. */
export type ChangeOrigin =
  | "edit" // the person, on the canvas or in a panel
  | "agent" // an agent, through the project's API
  | "extension" // an extension with the edits permission
  | "file" // a file changed outside Parity: git, an editor, an agent writing it
  | "view" // which state or modes a design shows: not undoable
  | "code" // designs drawn again from code: not undoable, not written
  | "remote" // someone else, once sync arrives: never in this person's undo

/** Where a change's content is already written: in the files, or nowhere yet. */
export type Written = "files" | "no"

/** A gesture's id, which `beginGesture` makes. */
export type GestureId = string

export interface TransactOptions {
  origin: ChangeOrigin
  /** The gesture this belongs to: the gesture's transactions are one undo step until it ends. */
  gesture?: GestureId
  /** Whether it's a step for Undo. `false` for what follows from another change, as fitting a frame to its content. */
  undoable?: boolean
  /**
   * Where its content is already written: `files` for changes that came from the files, which the saver takes as saved.
   * Defaults to `no`, so the copy that writes files writes it.
   */
  written?: Written
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
  /** Counts the document's changes when it was taken, for `changedBesides`. */
  readonly at: number
}

export interface UndoState {
  canUndo: boolean
  canRedo: boolean
  /** The steps' labels, latest first: `Move frame`, `Change padding`. Edit > Undo and Redo show the first. */
  undo: readonly string[]
  redo: readonly string[]
  /** The step Undo would take back, by an id that's never used again: equal only while it's the same step. */
  step: number | undefined
}

/** What a gesture did, for `gesture.ended`. */
export interface GestureEnded {
  /** Whether it left an undo step. */
  step: boolean
  transactions: number
  transactMs: number
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
  /**
   * A file changed outside Parity: one undoable step that makes the file what it now holds, not written back. The main
   * file's modes come with it.
   */
  replaceFile(path: string, document: CanvasDocument): TransactResult

  // Gestures: a drag, a resize, a scrub, a run of arrow presses or a change preview.
  beginGesture(): GestureId
  /** Ends a gesture. One that ends where it began leaves no step, and Redo is as it was before it began. */
  endGesture(gesture: GestureId): GestureEnded
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

/** What one transaction, undo, redo or replaced file changed, for views, saving, the node index and telemetry. */
export interface DocChange {
  origin: ChangeOrigin
  /** The transaction's label, or the step undone or redone. */
  label: string
  kind: "transaction" | "undo" | "redo" | "replaceFile" | "remote"
  gesture?: GestureId
  /** The `meta` given with the step, on undo and redo. */
  meta?: JsonValue
  /** Files whose `.par` content changed: the main file too when the modes did. */
  files: readonly string[]
  /**
   * Where those files' new content is already written: `files` for a replaced file, code drawn again and `written:
   * "files"`, which the saver takes as saved; `no` for everything else, others' changes included, which the copy that
   * writes files writes.
   */
  written: Written
  /** Files added and removed. */
  filesAdded: readonly string[]
  filesRemoved: readonly string[]
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

/** What a provider gives `ProjectDoc`: the state, applying checked operations, and others' changes once it syncs. */
export interface DocBackend {
  readonly provider: string
  readonly sync: boolean
  /** Plain values, without modes, each the same object until an operation touches it. */
  files(): ReadonlyMap<string, CanvasDocument>
  modes(): ModeSettings
  /** The token values edited on the canvas. */
  tokens(): TokenEdits
  version(): DocVersion
  /**
   * Applies operations `ProjectDoc` has checked, as one commit, and says what they changed. They're plain: a `remove`
   * comes with the `setDesign`s that drop its patches, and a `setModes` with those that prune views, so a backend
   * applies each operation alone (`applyPlain`).
   */
  apply(ops: readonly DocOp[], origin: ChangeOrigin): BackendChange
  /** Changes the backend didn't get through `apply`: others', with sync. */
  subscribe(listener: (change: BackendChange) => void): () => void
  dispose(): void
}

/** What changed in the backend's state. `ProjectDoc` adds the label and the step to make a `DocChange`. */
export type BackendChange = Pick<
  DocChange,
  | "files"
  | "filesAdded"
  | "filesRemoved"
  | "designs"
  | "layers"
  | "notes"
  | "references"
  | "fileFields"
  | "modes"
  | "tokens"
  | "version"
> & {
  /**
   * Others' changes to texts, as the changes that made them, in order, where the backend knows them. Undo follows this
   * person's typing through them, so it never takes another's character for theirs (PAR-1258).
   */
  texts?: readonly TextChanges[]
}

/** The changes, in order, that someone else made to one text layer's text. */
export interface TextChanges {
  address: LayerAddress
  splices: readonly TextSplice[]
}

export interface DocProvider {
  /** As telemetry records it: `loro`, `local`. */
  readonly name: string
  readonly sync: boolean
  /** Opens a project's files. `main` is the file the modes go into. */
  open(options: OpenOptions): DocBackend
}

export interface OpenOptions {
  /** The files without their modes. A drawn file is drawn from code by each window and never shared. */
  files: readonly { path: string; document: CanvasDocument; drawn?: boolean }[]
  main: string
  modes: ModeSettings
  /** Token values edited and not yet written, as a recovery copy brings back. None by default. */
  tokens?: TokenEdits
}
