import {
  type CanvasDocument,
  type ContainerSpec,
  defaultModeSettings,
  findNode,
  type JsonValue,
  locateNode,
  type ModeSettings,
  type NoteSpec,
  type ReferenceSpec
} from "@parity-app/core"
import {
  noTokenEdits,
  sameDesign,
  sameDocument,
  sameTokenValues,
  sameValue,
  type TokenEdits,
  withTidyView,
  withoutModes
} from "@parity-app/editor"
import { type Applied, applyOp, type DocState, OpProblem } from "./apply.ts"
import { checkDraft } from "./check.ts"
import { containerOps, fileOps } from "./diff-ops.ts"
import { splitKey } from "./keys.ts"
import { Recorder } from "./recorder.ts"
import type {
  ChangeOrigin,
  Checkpoint,
  DesignKey,
  DocBackend,
  DocChange,
  DocOp,
  GestureEnded,
  GestureId,
  LayerAddress,
  ProjectDoc,
  TransactOptions,
  TransactProblem,
  TransactResult,
  UndoState
} from "./types.ts"
import { fieldOf, pathOf } from "./values.ts"

/*
 * The project's document over a provider's backend (docs/proposals/multiplayer.md: The document). Checks, undo, gestures
 * and token edits are kept here, so they're the same on every provider: a transaction is applied to a draft of the plain
 * values and checked whole, then sent to the backend as plain operations; undo is made of the inverses worked out on the
 * draft, and takes back only this person's steps.
 */

/** An inverse, with the value its target holds while nothing else has changed it, to tell when someone else has. */
interface Inverse {
  op: DocOp
  expect?: { value: JsonValue | undefined }
}

interface Step {
  /** Never used again, so a step is told apart from one made after it was undone. */
  id: number
  label: string
  origin: ChangeOrigin
  meta?: JsonValue
  gesture?: GestureId
  /** The operations that take it back, in the order they apply. */
  inverse: Inverse[]
}

/** A draft's values after, and the operations to send. */
interface Draft {
  after: DocState
  plain: DocOp[]
}

interface GestureState {
  /** What each target held before the gesture first changed it, by target. */
  start: Map<string, TargetValue>
  /** Redo when it began, back again if it ends where it began and nothing else made a step meanwhile. */
  redoBefore: Step[]
  othersSince: boolean
  /** Whether everything it changed is back as it began. */
  unchanged: boolean
  transactions: number
  transactMs: number
}

/** Origins whose changes are never steps. */
const notSteps = new Set<ChangeOrigin>(["view", "code", "remote"])

/** Origins whose changes aren't written. */
const notWritten = new Set<ChangeOrigin>(["code", "file", "remote"])

export function createProjectDoc(
  backend: DocBackend,
  options: {
    undoLimit: number
    main: string
    tokens?: TokenEdits
    /** What the modes are when the main file doesn't save them: Parity's defaults when unset. */
    defaultModes?: ModeSettings | undefined
  }
): ProjectDoc {
  const { main, undoLimit } = options
  const defaultModes = options.defaultModes ?? defaultModeSettings
  let tokens = options.tokens ?? noTokenEdits
  let undoStack: Step[] = []
  let redoStack: Step[] = []
  let steps = 0
  let gestureCount = 0
  /** Counts the changes made, for checkpoints. */
  let changeCount = 0
  let history: UndoState | undefined
  let disposed = false
  const gestures = new Map<GestureId, GestureState>()
  /** Per design, the last change each owner made: a gesture's id, `""` outside one, or `remote`. */
  const owners = new Map<DesignKey, Map<string, number>>()
  const listeners = new Set<(change: DocChange) => void>()
  const gestureListeners = new Set<() => void>()

  const state = (): DocState => ({ files: backend.files(), main, modes: backend.modes(), tokens })

  const notify = (change: DocChange) => {
    for (const listener of listeners) {
      listener(change)
    }
  }

  const notifyGestures = () => {
    for (const listener of gestureListeners) {
      listener()
    }
  }

  const own = (designs: Iterable<DesignKey>, owner: string) => {
    for (const key of designs) {
      const byOwner = owners.get(key) ?? new Map<string, number>()
      byOwner.set(owner, changeCount)
      owners.set(key, byOwner)
    }
  }

  const unsubscribe = backend.subscribe((change) => {
    changeCount += 1
    own([...change.designs.changed.map((each) => each.design), ...change.designs.removed], "remote")
    own(
      [...change.layers.added, ...change.layers.removed, ...change.layers.moved].map((address) => address.design),
      "remote"
    )
    own(
      change.layers.changed.map((each) => each.address.design),
      "remote"
    )
    history = undefined
    notify({
      ...change,
      origin: "remote",
      label: "",
      kind: "remote",
      persist: false,
      tokens: false,
      kept: 0
    })
  })

  /** Applies operations to a draft: the state after, the inverses by operation, and what to send the backend. */
  const draft = (
    before: DocState,
    ops: readonly Inverse[],
    recorder: Recorder,
    skipping?: { kept: number }
  ): { after: DocState; inverse: Inverse[][]; plain: DocOp[] } | TransactProblem => {
    let after = before
    const inverse: Inverse[][] = []
    const plain: DocOp[] = []

    for (const [index, { op, expect }] of ops.entries()) {
      let applied: Applied

      // Undoing: a field someone else has changed since is left as they left it.
      if (skipping && expect && !sameValue(currentValue(after, op), expect.value)) {
        skipping.kept += 1
        continue
      }

      try {
        applied = applyOp(after, op, index, recorder)
      } catch (error) {
        if (!(error instanceof OpProblem)) {
          throw error
        }

        const retried = skipping && retry(after, op, index, recorder, error.problem, skipping)

        if (!retried) {
          if (skipping) {
            continue
          }

          return error.problem
        }

        applied = retried
      }

      after = applied.state
      inverse.push(applied.inverse.map((each) => guarded(each, after)))
      plain.push(...applied.plain)
    }

    return { after, inverse, plain }
  }

  /**
   * An inverse that can't apply as it is, while undoing: one whose `before` is gone goes last; one whose target is gone,
   * or taken, is skipped and counted.
   */
  const retry = (
    after: DocState,
    op: DocOp,
    index: number,
    recorder: Recorder,
    problem: TransactProblem,
    skipping: { kept: number }
  ): Applied | undefined => {
    if (problem.kind === "notSibling" && "before" in op && op.before !== undefined) {
      try {
        return applyOp(after, { ...op, before: undefined }, index, recorder)
      } catch {
        // Falls through to skipping it.
      }
    }

    skipping.kept += 1

    return undefined
  }

  /** Applies a draft: checks it, sends it to the backend, and says what changed. */
  const commit = (
    before: DocState,
    result: { after: DocState; plain: DocOp[] },
    recorder: Recorder,
    origin: ChangeOrigin
  ): TransactProblem | "unchanged" | undefined => {
    if (!recorder.touched() || sameTargets(targets(recorder), before, result.after)) {
      return "unchanged"
    }

    const problem = checkDraft(before, result.after, recorder)

    if (problem) {
      return problem
    }

    const sent = result.plain.filter((op) => op.op !== "setTokens")

    if (sent.length > 0) {
      backend.apply(sent, origin)
    }

    tokens = result.after.tokens
    changeCount += 1
    history = undefined

    return undefined
  }

  const changeOf = (
    recorder: Recorder,
    extra: Pick<DocChange, "origin" | "label" | "kind" | "persist" | "kept"> & {
      gesture?: GestureId
      meta?: JsonValue
    }
  ): DocChange => ({
    ...extra,
    ...recorder.change(),
    tokens: recorder.tokens,
    version: backend.version()
  })

  const run = (
    label: string,
    ops: readonly DocOp[],
    options: TransactOptions,
    kind: DocChange["kind"]
  ): TransactResult => {
    alive()
    const started = performance.now()
    const before = state()
    const recorder = new Recorder()

    const result = draft(
      before,
      ops.map((op) => ({ op })),
      recorder
    )

    if ("kind" in result) {
      return { ok: false, problem: result }
    }

    const gesture = options.gesture === undefined ? undefined : gestures.get(options.gesture)
    const committed = commit(before, result, recorder, options.origin)

    if (committed === "unchanged") {
      return { ok: true, change: undefined }
    }

    if (committed) {
      return { ok: false, problem: committed }
    }

    const touched = targets(recorder)

    if (gesture) {
      for (const target of touched) {
        if (!gesture.start.has(target)) {
          gesture.start.set(target, valueOf(before, target))
        }
      }
    }

    const undoable = options.undoable ?? !notSteps.has(options.origin)

    if (undoable) {
      own(recorder.designs, options.gesture ?? "")
      record(label, options, result.inverse)
    }

    if (gesture) {
      gesture.transactions += 1
      gesture.transactMs += performance.now() - started
      gesture.unchanged = sameStart(gesture, state())
    }

    const change = changeOf(recorder, {
      origin: options.origin,
      label,
      kind,
      persist: (options.persist ?? true) && !notWritten.has(options.origin),
      kept: 0,
      gesture: options.gesture,
      meta: options.meta
    })

    notify(change)

    return { ok: true, change }
  }

  /** Keeps a transaction's inverses as a step, or in its gesture's step. */
  const record = (label: string, options: TransactOptions, inverse: Inverse[][]) => {
    const ops = inverse.toReversed().flat()
    const top = undoStack.at(-1)
    const gesture = options.gesture

    if (gesture !== undefined && top?.gesture === gesture && gestures.has(gesture)) {
      top.inverse = [...ops, ...top.inverse]
    } else {
      steps += 1
      undoStack.push({
        id: steps,
        label,
        origin: options.origin,
        inverse: ops,
        gesture,
        meta: options.meta
      })

      for (const [id, open] of gestures) {
        if (id !== gesture) {
          open.othersSince = true
        }
      }
    }

    redoStack = []
    undoStack = undoStack.slice(-undoLimit)
  }

  /** Applies a step's inverses, leaving what someone else changed since; the step that takes it back again. */
  const takeStep = (step: Step, kind: "undo" | "redo"): { change: DocChange; step: Step } | undefined => {
    const before = state()
    const recorder = new Recorder()
    const skipping = { kept: 0 }
    // What each design shows stays as it is now, as undo leaves it today.
    const ops = step.inverse.filter(({ op }) => !(op.op === "setDesign" && op.path[0] === "view"))
    const result = draft(before, ops, recorder, skipping)

    if ("kind" in result) {
      return undefined
    }

    const tidied = tidyViews(result.after, recorder)

    const committed = commit(
      before,
      { after: tidied.after, plain: [...result.plain, ...tidied.plain] },
      recorder,
      step.origin
    )

    if (committed && committed !== "unchanged") {
      return undefined
    }

    const change = changeOf(recorder, {
      origin: step.origin,
      label: step.label,
      kind,
      persist: true,
      kept: skipping.kept,
      meta: step.meta
    })

    own(recorder.designs, "")
    steps += 1

    return {
      change,
      step: {
        id: steps,
        label: step.label,
        origin: step.origin,
        inverse: result.inverse.toReversed().flat(),
        meta: step.meta
      }
    }
  }

  /** Views left naming a state or mode that's gone are tidied, as the step that's undone would have left them. */
  const tidyViews = (after: DocState, recorder: Recorder): Draft => {
    const plain: DocOp[] = []
    let next = after

    for (const key of recorder.designs) {
      const container = designIn(next, key)

      if (!container) {
        continue
      }

      const tidy = withTidyView(container)

      if (tidy !== container) {
        const op: DocOp = { op: "setDesign", design: key, path: ["view"], value: fieldOf(tidy, "view") }

        next = applyOp(next, op, 0, recorder).state
        plain.push(op)
      }
    }

    return { after: next, plain }
  }

  /** The steps Undo can take: a step whose open gesture is back where it began doesn't show. */
  const visible = (stack: readonly Step[]) =>
    stack.filter((step) => step.gesture === undefined || !gestures.get(step.gesture)?.unchanged)

  const alive = () => {
    if (disposed) {
      throw new Error("The project document is closed")
    }
  }

  const doc: ProjectDoc = {
    provider: backend.provider,
    sync: backend.sync,
    main,

    files: () => backend.files(),
    file: (path) => backend.files().get(path),
    design: (key) => designIn(state(), key),
    node: (address) => {
      const container = designIn(state(), address.design)

      return container && findNode(container.root, address.node)
    },
    parent: (address: LayerAddress) => {
      const container = designIn(state(), address.design)
      const location = container && locateNode(container.root, address.node)

      if (!location) {
        return undefined
      }

      const parent = location.ancestors.at(-1)

      return parent ? { node: parent.id, slot: location.slot } : "design"
    },
    modes: () => backend.modes(),
    tokens: () => tokens,
    version: () => backend.version(),

    transact: (label, ops, options) => run(label, ops, options, "transaction"),

    replaceFile: (path, document) => {
      const current = backend.files().get(path)
      const ops = fileOps(path, current, withoutModes(document))

      if (path === main) {
        const modes = document.modes ?? defaultModes

        if (!sameValue(modes, backend.modes())) {
          ops.push({ op: "setModes", modes })
        }
      }

      return run(`Reload ${path}`, ops, { origin: "file", persist: false, undoable: true }, "replaceFile")
    },

    beginGesture: () => {
      alive()
      gestureCount += 1
      const id = `gesture-${gestureCount}`
      gestures.set(id, {
        start: new Map(),
        redoBefore: redoStack,
        othersSince: false,
        unchanged: true,
        transactions: 0,
        transactMs: 0
      })

      if (gestures.size === 1) {
        notifyGestures()
      }

      return id
    },

    endGesture: (gesture) => {
      const open = gestures.get(gesture)

      if (!open) {
        return { step: false, transactions: 0, transactMs: 0 }
      }

      if (open.unchanged) {
        dropGesture(gesture, open)
      }

      gestures.delete(gesture)
      history = undefined

      const ended: GestureEnded = {
        step: undoStack.some((step) => step.gesture === gesture),
        transactions: open.transactions,
        transactMs: open.transactMs
      }

      notifyGestures()

      return ended
    },

    inGesture: () => gestures.size > 0,

    subscribeGestures: (listener) => {
      gestureListeners.add(listener)

      return () => gestureListeners.delete(listener)
    },

    checkpoint: (gesture, design) => {
      const container = designIn(state(), design)

      return container && { gesture, design, container, at: changeCount }
    },

    revert: (checkpoint: Checkpoint) => {
      const current = designIn(state(), checkpoint.design)

      if (!current) {
        return
      }

      // Views stay as they are now, as undo leaves them.
      const ops = containerOps(checkpoint.design, current, { ...checkpoint.container, view: current.view })

      run("Revert", ops, { origin: "edit", gesture: checkpoint.gesture }, "transaction")
    },

    changedBesides: (checkpoint) => {
      for (const [owner, at] of owners.get(checkpoint.design) ?? []) {
        if (owner !== checkpoint.gesture && at > checkpoint.at) {
          return true
        }
      }

      return false
    },

    cancelGesture: (gesture) => {
      const open = gestures.get(gesture)

      if (!open) {
        return
      }

      const inverse = undoStack
        .filter((step) => step.gesture === gesture)
        .toReversed()
        .flatMap((step) => step.inverse.map((each) => each.op))

      if (inverse.length > 0) {
        run("Cancel", inverse, { origin: "edit", undoable: false }, "transaction")
      }

      dropGesture(gesture, open)
      gestures.delete(gesture)
      history = undefined
      notifyGestures()
    },

    undo: () => {
      alive()
      const step = visible(undoStack).at(-1)

      if (!step) {
        return undefined
      }

      const taken = takeStep(step, "undo")

      if (!taken) {
        return undefined
      }

      undoStack = undoStack.filter((each) => each !== step)
      redoStack = [...redoStack, taken.step]
      history = undefined
      notify(taken.change)

      return taken.change
    },

    redo: () => {
      alive()
      const step = redoStack.at(-1)

      if (!step) {
        return undefined
      }

      const taken = takeStep(step, "redo")

      if (!taken) {
        return undefined
      }

      redoStack = redoStack.slice(0, -1)
      undoStack = [...undoStack, taken.step].slice(-undoLimit)
      history = undefined
      notify(taken.change)

      return taken.change
    },

    history: () => {
      if (!history) {
        const undo = visible(undoStack).toReversed()
        const redo = redoStack.toReversed()
        history = {
          canUndo: undo.length > 0,
          canRedo: redo.length > 0,
          undo: undo.map((step) => step.label),
          redo: redo.map((step) => step.label),
          step: undo[0]?.id
        }
      }

      return history
    },

    subscribe: (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },

    dispose: () => {
      if (disposed) {
        return
      }

      disposed = true
      unsubscribe()
      listeners.clear()
      gestureListeners.clear()
      backend.dispose()
    }
  }

  /** Drops a gesture's steps, with Redo back as it was when nothing else made a step meanwhile. */
  const dropGesture = (gesture: GestureId, open: GestureState) => {
    undoStack = undoStack.filter((step) => step.gesture !== gesture)

    if (!open.othersSince) {
      redoStack = open.redoBefore
    }
  }

  return doc
}

/** What a transaction touched, as targets a gesture compares: designs, notes and references, file fields, modes, tokens. */
function targets(recorder: Recorder): string[] {
  return [
    ...[...recorder.designs].map((key) => `design:${key}`),
    ...recorder.items,
    ...[...recorder.fileFields.values()].map(({ file, field }) => `field:${file}\u0000${field}`),
    ...[...recorder.filesAdded, ...recorder.filesRemoved].map((path) => `file:${path}`),
    ...(recorder.modes ? ["modes"] : []),
    ...(recorder.tokens ? ["tokens"] : [])
  ]
}

/** What a target holds, to compare: a design, a file, the token values, or a value compared as JSON. */
type TargetValue =
  | { kind: "design"; value: ContainerSpec | undefined }
  | { kind: "file"; value: CanvasDocument | undefined }
  | { kind: "tokens"; value: TokenEdits }
  | { kind: "modes"; value: ModeSettings }
  | { kind: "item"; value: { item: NoteSpec | ReferenceSpec; at: number } | undefined }
  | { kind: "field"; value: JsonValue | undefined }

function valueOf(state: DocState, target: string): TargetValue {
  if (target === "modes") {
    return { kind: "modes", value: state.modes }
  }

  if (target === "tokens") {
    return { kind: "tokens", value: state.tokens }
  }

  const colon = target.indexOf(":")
  const kind = target.slice(0, colon)
  const rest = target.slice(colon + 1)

  if (kind === "design") {
    return { kind: "design", value: designIn(state, rest) }
  }

  if (kind === "file") {
    return { kind: "file", value: state.files.get(rest) }
  }

  if (kind === "field") {
    const [file = "", field = ""] = rest.split("\u0000")
    const document = state.files.get(file)

    return { kind: "field", value: document && fieldOf(document, field) }
  }

  const split = splitKey(rest)

  const items: readonly (NoteSpec | ReferenceSpec)[] | undefined =
    split && (kind === "notes" ? state.files.get(split.path)?.notes : state.files.get(split.path)?.references)

  const at = items?.findIndex((item) => item.id === split?.id) ?? -1
  const item = items?.[at]

  // Where it sits counts too, so a transaction that only reorders a file's notes or references isn't "unchanged".
  return { kind: "item", value: item && { item, at } }
}

function sameTarget(a: TargetValue, b: TargetValue): boolean {
  if (a.value === b.value) {
    return true
  }

  if (a.value === undefined || b.value === undefined) {
    return false
  }

  if (a.kind === "design" && b.kind === "design") {
    return sameDesign(a.value, b.value)
  }

  if (a.kind === "file" && b.kind === "file") {
    return sameDocument(a.value, b.value)
  }

  if (a.kind === "tokens" && b.kind === "tokens") {
    return sameTokenValues(a.value, b.value)
  }

  return sameValue(a.value, b.value)
}

function sameTargets(list: readonly string[], before: DocState, after: DocState): boolean {
  return list.every((target) => sameTarget(valueOf(before, target), valueOf(after, target)))
}

function sameStart(gesture: GestureState, now: DocState): boolean {
  for (const [target, value] of gesture.start) {
    if (!sameTarget(value, valueOf(now, target))) {
      return false
    }
  }

  return true
}

function designIn(state: DocState, key: DesignKey): ContainerSpec | undefined {
  const split = splitKey(key)

  return split && state.files.get(split.path)?.containers.find((container) => container.id === split.id)
}

/** An inverse with the value its target holds now, for the fields an inverse sets back. */
function guarded(op: DocOp, after: DocState): Inverse {
  return op.op === "set" || op.op === "setDesign" || op.op === "setFileField"
    ? { op, expect: { value: currentValue(after, op) } }
    : { op }
}

/** What the field an inverse sets back holds now. */
function currentValue(state: DocState, op: DocOp): JsonValue | undefined {
  if (op.op === "set") {
    const container = designIn(state, op.design)

    return pathOf(container && findNode(container.root, op.node), op.path)
  }

  if (op.op === "setDesign") {
    return pathOf(designIn(state, op.design), op.path)
  }

  if (op.op === "setFileField") {
    const document = state.files.get(op.file)

    return document && fieldOf(document, op.field)
  }

  return undefined
}
