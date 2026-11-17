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
  sameDesign,
  sameDocument,
  sameTokenValues,
  sameValue,
  type TokenEdit,
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
  UndoState,
  Written
} from "./types.ts"
import { fieldOf, pathOf } from "./values.ts"

/*
 * The project's document over a provider's backend (docs/proposals/multiplayer.md: The document). Checks, undo, gestures
 * and token edits are kept here, so they're the same on every provider: a transaction is applied to a draft of the plain
 * values and checked whole, then sent to the backend as plain operations; undo is made of the inverses worked out on the
 * draft, and takes back only this person's steps.
 */

/**
 * An inverse, with the value its target holds while nothing else has changed it, to tell when someone else has: a
 * field's value, or the token values a token edit left.
 */
interface Inverse {
  op: DocOp
  expect?: { value: JsonValue | undefined } | { tokens: TokenEdits } | { text: string }
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

/** Origins whose changes come from the files, so the files already hold them. */
const fromFiles = new Set<ChangeOrigin>(["code", "file"])

export function createProjectDoc(backend: DocBackend, options: { undoLimit: number; main: string }): ProjectDoc {
  const { main, undoLimit } = options
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

  const state = (): DocState => ({ files: backend.files(), main, modes: backend.modes(), tokens: backend.tokens() })

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
      // Not in this copy's files yet: the copy that writes files writes it like its own.
      written: "no",
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
      if (skipping && expect && "value" in expect && !sameValue(currentValue(after, op), expect.value)) {
        skipping.kept += 1
        continue
      }

      // And so are token values and typing someone else has changed since (see `undoing`).
      for (const taken of skipping ? undoing(after, { op, expect }, skipping) : [op]) {
        try {
          applied = applyOp(after, taken, index, recorder)
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

    if (result.plain.length > 0) {
      backend.apply(result.plain, origin)
    }

    changeCount += 1
    history = undefined

    return undefined
  }

  const changeOf = (
    recorder: Recorder,
    extra: Pick<DocChange, "origin" | "label" | "kind" | "written" | "kept"> & {
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
      written: writtenOf(options),
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
      written: "no",
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
    tokens: () => backend.tokens(),
    version: () => backend.version(),

    transact: (label, ops, options) => run(label, ops, options, "transaction"),

    replaceFile: (path, document) => {
      const current = backend.files().get(path)
      const ops = fileOps(path, current, withoutModes(document))

      if (path === main) {
        const modes = document.modes ?? defaultModeSettings

        if (!sameValue(modes, backend.modes())) {
          ops.push({ op: "setModes", modes })
        }
      }

      return run(`Reload ${path}`, ops, { origin: "file", written: "files", undoable: true }, "replaceFile")
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

/** Where a transaction's content is already written. */
function writtenOf(options: TransactOptions): Written {
  return options.written ?? (fromFiles.has(options.origin) ? "files" : "no")
}

/** An inverse with the value its target holds now, for the fields and token values an inverse sets back. */
function guarded(op: DocOp, after: DocState): Inverse {
  if (op.op === "setTokens") {
    return { op, expect: { tokens: after.tokens } }
  }

  if (op.op === "editText" && op.edit.kind === "splice") {
    const text = textIn(after, op)

    return text === undefined ? { op } : { op, expect: { text } }
  }

  return op.op === "set" || op.op === "setDesign" || op.op === "setFileField"
    ? { op, expect: { value: currentValue(after, op) } }
    : { op }
}

/**
 * What an inverse writes while undoing: only the step's own token values go back, and only the step's own typing comes
 * out of a text others have typed in since (PAR-1238). Nothing when there's nothing of the step's left.
 */
function undoing(state: DocState, { op, expect }: Inverse, skipping: { kept: number }): DocOp[] {
  if (expect && "tokens" in expect && op.op === "setTokens") {
    return [tokensBack(state.tokens, op.tokens, expect.tokens, skipping)]
  }

  if (expect && "text" in expect && op.op === "editText") {
    return textBack(state, op, expect.text, skipping)
  }

  return [op]
}

/** A text layer's text, or nothing when it's gone or isn't a text layer. */
function textIn(state: DocState, op: Extract<DocOp, { op: "editText" }>): string | undefined {
  const container = designIn(state, op.design)
  const node = container && findNode(container.root, op.node)

  return node?.type === "text" ? node.text : undefined
}

/**
 * Undoing typing in a text others have typed in since: the step's own characters that are still there come out, and
 * what it removed goes back where those characters were, wherever others' edits have moved them; theirs stay. Each
 * character of the text as the step left it is followed to where it is now (`kept`), so edits others made on both
 * sides of the typing, or inside it, stay apart. Written as changes to the text as it is now, last first so each
 * position holds; when there's nothing of the step's left to take out, it's skipped and counted.
 */
function textBack(
  state: DocState,
  op: Extract<DocOp, { op: "editText" }>,
  left: string,
  skipping: { kept: number }
): DocOp[] {
  const now = textIn(state, op)

  if (now === undefined || now === left || op.edit.kind !== "splice") {
    return [op]
  }

  const { at, remove, insert } = op.edit
  const where = kept(left, now)
  // The step's characters still there, in runs of neighbours.
  const runs: { start: number; end: number }[] = []

  for (let index = at; index < at + remove; index++) {
    const position = where[index]!
    const last = runs.at(-1)

    if (position < 0) {
      continue
    }

    if (last && last.end === position) {
      last.end += 1
    } else {
      runs.push({ start: position, end: position + 1 })
    }
  }

  if (runs.length === 0 && insert === "") {
    skipping.kept += 1

    return []
  }

  // What the step removed goes back before the first character after its own that's still there.
  let back = now.length

  for (let index = at + remove; index < left.length; index++) {
    if (where[index]! >= 0) {
      back = where[index]!
      break
    }
  }

  const splice = (start: number, end: number, text: string): DocOp => ({
    ...op,
    edit: { kind: "splice", at: start, remove: end - start, insert: text }
  })

  return [
    ...(insert === "" ? [] : [splice(back, back, insert)]),
    ...runs.toReversed().map(({ start, end }) => splice(start, end, ""))
  ]
}

/**
 * Where each character of `before` is in `after`, or -1 for one that's gone: the longest run of characters they share,
 * in order, after what they start and end with.
 */
function kept(before: string, after: string): number[] {
  let head = 0

  while (head < before.length && head < after.length && before[head] === after[head]) {
    head++
  }

  let tail = 0

  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++
  }

  const where = Array.from({ length: before.length }, () => -1)

  for (let index = 0; index < head; index++) {
    where[index] = index
  }

  for (let index = 0; index < tail; index++) {
    where[before.length - 1 - index] = after.length - 1 - index
  }

  // The middles, by Myers' difference: its cost grows with how much others changed, not with the text's length.
  const a = before.slice(head, before.length - tail)
  const b = after.slice(head, after.length - tail)

  for (const [i, j] of sharedRun(a, b)) {
    where[head + i] = head + j
  }

  return where
}

/** The most changes `sharedRun` looks through before it gives up and treats the rest as changed. */
const mostChanges = 2000

/**
 * The characters `a` and `b` share, in order, as pairs of positions: Myers' O(ND) difference, which keeps one row per
 * change it looks through. Past `mostChanges` it gives up and shares nothing, so a far-apart pair costs no more than that.
 */
function sharedRun(a: string, b: string): [number, number][] {
  const offset = Math.min(a.length + b.length, mostChanges) + 1
  const furthest = new Int32Array(2 * offset + 1)
  const rows: Int32Array[] = []

  for (let changes = 0; changes < offset; changes++) {
    rows.push(furthest.slice())

    for (let diagonal = -changes; diagonal <= changes; diagonal += 2) {
      const down =
        diagonal === -changes ||
        (diagonal !== changes && furthest[offset + diagonal - 1]! < furthest[offset + diagonal + 1]!)

      let x = down ? furthest[offset + diagonal + 1]! : furthest[offset + diagonal - 1]! + 1
      let y = x - diagonal

      while (x < a.length && y < b.length && a[x] === b[y]) {
        x++
        y++
      }

      furthest[offset + diagonal] = x

      if (x >= a.length && y >= b.length) {
        return backtrack(rows, offset, a.length, b.length, a, b)
      }
    }
  }

  return []
}

/** The shared pairs on the path `sharedRun` found, walked back from the end through the rows it kept. */
function backtrack(rows: Int32Array[], offset: number, n: number, m: number, a: string, b: string): [number, number][] {
  const pairs: [number, number][] = []
  let x = n
  let y = m

  for (let changes = rows.length - 1; changes >= 0; changes--) {
    const row = rows[changes]!
    const diagonal = x - y

    const down =
      diagonal === -changes || (diagonal !== changes && row[offset + diagonal - 1]! < row[offset + diagonal + 1]!)

    const previous = down ? diagonal + 1 : diagonal - 1
    const fromX = row[offset + previous]!
    const fromY = fromX - previous

    while (x > fromX && y > fromY && a[x - 1] === b[y - 1]) {
      x--
      y--
      pairs.push([x, y])
    }

    x = fromX
    y = fromY
  }

  return pairs.reverse()
}

/**
 * The token values undoing a token edit leaves: each token the step changed goes back to what it was before, unless
 * someone else has changed it since, and every other token stays as it is now.
 */
function tokensBack(now: TokenEdits, before: TokenEdits, left: TokenEdits, skipping: { kept: number }) {
  const next = new Map(now)

  for (const key of new Set([...before.keys(), ...left.keys()])) {
    if (sameEdit(before.get(key), left.get(key))) {
      continue
    }

    if (!sameEdit(now.get(key), left.get(key))) {
      skipping.kept += 1
      continue
    }

    const back = before.get(key)

    if (back) {
      next.set(key, back)
    } else {
      next.delete(key)
    }
  }

  return { op: "setTokens", tokens: next } satisfies DocOp
}

function sameEdit(a: TokenEdit | undefined, b: TokenEdit | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a.value === b.value && a.original === b.original)
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
