import {
  type CanvasDocument,
  type ContainerSpec,
  type DesignNode,
  emptyDocument,
  findNode,
  type JsonValue,
  type ModeSettings,
  nodeIds
} from "@parity-app/core"
import { noTokenEdits, sameTokenValues, type TextSplice, type TokenEdits } from "@parity-app/editor"
import {
  applyOp,
  applyPlain,
  type BackendChange,
  type ChangeOrigin,
  type DesignKey,
  type DocBackend,
  type DocOp,
  type DocState,
  type DocVersion,
  designKey,
  fileOps,
  type OpenOptions,
  Recorder,
  splitKey,
  type TextChanges
} from "@parity-app/multiplayer"
import {
  type Delta,
  LoroDoc,
  type LoroEvent,
  LoroMap,
  LoroMovableList,
  LoroText,
  type TreeID,
  VersionVector
} from "loro-crdt"
import {
  childrenOf,
  dataOf,
  keep,
  nodeIn,
  scoped,
  designRecords,
  fieldsOf,
  fileKey,
  isJsonRecord,
  entriesOf,
  type ItemList,
  jsonOf,
  listJson,
  type JsonRecord,
  layerRecords,
  type Node,
  readDesign,
  readFile,
  readModes,
  readTokens,
  sameJson,
  type ProjectContainers,
  recordIn,
  rootsOf,
  textOf,
  listIn,
  slotKey,
  syncField,
  syncKey,
  tokenJson,
  type Tree,
  writeDesign,
  writeLayer
} from "./layout.ts"
import { type Repair, repairDesigns } from "./repair.ts"

/*
 * The backend on Loro (docs/proposals/multiplayer.md: `@parity-app/multiplayer-loro`). `apply` makes each checked
 * operation's Loro calls and one commit, and keeps the plain values beside Loro with `applyPlain`. Others' changes come
 * in through `receive`: the designs they touched are repaired, read back from Loro, and made into operations on the
 * plain values with `fileOps`, so what changed is said the same way as for this person's changes.
 */

const provider = "loro"

/** A design's node and its layers' nodes, by layer id. */
interface DesignEntry {
  key: DesignKey
  /** Indexed when first needed: reading a design's nodes from a snapshot makes Loro decode them. */
  layers: Map<string, TreeID> | undefined
}

/** A design's entry once its layers are indexed. */
type IndexedEntry = DesignEntry & { layers: Map<string, TreeID> }

/** A Loro backend, with what replicas exchange. */
export interface LoroBackend extends DocBackend {
  /** Loro's updates since `version`, or everything. */
  updates(since?: Uint8Array): Uint8Array
  /** This replica's version vector, for another replica's `updates`. */
  versionVector(): Uint8Array
  /** Takes in another replica's updates and tells subscribers what changed. */
  receive(bytes: Uint8Array): void
  /** What the last `receive` repaired. */
  repairs(): readonly Repair[]
  /** Whether the last `receive` left changes waiting for others this replica hasn't got yet. */
  pending(): boolean
  /** Every file and the modes as Loro holds them, read whole: what the plain values must equal. */
  read(): { files: ReadonlyMap<string, CanvasDocument>; modes: ModeSettings }
  /** The whole document, for another replica to open on. */
  snapshot(): Uint8Array
  /**
   * Told of each commit this replica makes, repairs after a `receive` included, as updates for the other replicas'
   * `receive`. Others' changes taken in aren't told.
   */
  subscribeLocalUpdates(listener: (bytes: Uint8Array) => void): () => void
  /** The Loro document, for this package's tests. */
  readonly doc: LoroDoc<ProjectContainers>
}

/** Opens a project in a new Loro document, or, given another replica's snapshot, on that. */
export function openLoro(options: OpenOptions, snapshot?: Uint8Array): LoroBackend {
  const doc = new LoroDoc<ProjectContainers>()
  const tree: Tree = doc.getTree("designs")
  tree.enableFractionalIndex(0)
  const notesMap = doc.getMap("notes")
  const referencesMap = doc.getMap("references")
  const filesMap = doc.getMap("files")
  const modesMap = doc.getMap("modes")
  const tokensMap = doc.getMap("tokens")
  // Drawn files are drawn from code by each window: they're in the plain values and never in Loro.
  const drawn = new Set(options.files.flatMap((file) => (file.drawn ? [file.path] : [])))

  let state: DocState = {
    files: new Map(options.files.map((file) => [file.path, file.document])),
    main: options.main,
    modes: options.modes,
    tokens: options.tokens ?? noTokenEdits
  }

  /** Every node, a design's own included, to its design's node: kept for deleted nodes, as others' deletes name them. */
  const designOf = new Map<TreeID, TreeID>()
  const designs = new Map<TreeID, DesignEntry>()
  const keys = new Map<DesignKey, TreeID>()
  /** Changes to drawn files, which Loro's version doesn't see. */
  let drawnChanges = 0
  let lastRepairs: Repair[] = []
  let lastPending = false
  const listeners = new Set<(change: BackendChange) => void>()

  const version = (): DocVersion => ({
    provider,
    value: `${JSON.stringify(doc.frontiers())}/${drawnChanges}`
  })

  // Indexing.

  const index = (root: Node, key: DesignKey) => {
    const previous = designs.get(root.id)

    if (previous && keys.get(previous.key) === root.id) {
      keys.delete(previous.key)
    }

    designs.set(root.id, { key, layers: undefined })
    keys.set(key, root.id)
    designOf.set(root.id, root.id)
  }

  /** Indexes a design's layers by id, and its nodes by design. */
  const indexLayers = (root: TreeID, entry: DesignEntry): IndexedEntry => {
    const layers = new Map<string, TreeID>()

    const visit = (each: Node) => {
      designOf.set(each.id, root)
      const data = dataOf(each)
      const id = textOf(data.get("id"))

      if (id !== undefined && data.get(slotKey) === undefined) {
        layers.set(id, each.id)
      }

      childrenOf(each).forEach(visit)
    }

    childrenOf(node(root)).forEach(visit)

    return Object.assign(entry, { layers })
  }

  const unindex = (root: TreeID) => {
    const entry = designs.get(root)

    if (entry && keys.get(entry.key) === root) {
      keys.delete(entry.key)
    }

    designs.delete(root)
  }

  const made = (root: TreeID, entry: IndexedEntry) => (id: string, node: Node) => {
    designOf.set(node.id, root)

    if (id !== "") {
      entry.layers.set(id, node.id)
    }
  }

  const node = (id: TreeID | undefined): Node => {
    const found = id === undefined ? undefined : nodeIn(tree, id)

    if (!found) {
      throw new Error(`Loro has no node ${id}`)
    }

    return found
  }

  const designNode = (key: DesignKey) => node(keys.get(key))

  const entryOf = (key: DesignKey): IndexedEntry => {
    const root = keys.get(key) ?? "0@0"
    const entry = designs.get(root)

    if (!entry) {
      throw new Error(`Loro has no design ${key}`)
    }

    return entry.layers ? { ...entry, layers: entry.layers } : indexLayers(root, entry)
  }

  const layerNode = (key: DesignKey, id: string) => node(entryOf(key).layers.get(id))

  /** Where a parent's layers go: the parent itself, or its slot node, made if it isn't there. */
  const holder = (key: DesignKey, parent: string, slot: string | undefined): Node => {
    const parentNode = layerNode(key, parent)

    if (slot === undefined) {
      return parentNode
    }

    const existing = childrenOf(parentNode).find((child) => dataOf(child).get(slotKey) === slot)

    if (existing) {
      return existing
    }

    const created = keep(parentNode.createNode())
    dataOf(created).set(slotKey, slot)
    designOf.set(created.id, keys.get(key) ?? created.id)

    return created
  }

  const placeOf = (key: DesignKey, before: string | undefined): number | undefined =>
    before === undefined ? undefined : layerNode(key, before).index()

  const items = (list: "notes" | "references", file: string): ItemList =>
    listIn(list === "notes" ? notesMap : referencesMap, file)

  // Loading.

  scoped(() => {
    if (snapshot) {
      doc.import(snapshot)

      for (const root of rootsOf(tree)) {
        index(root, keyOf(root))
      }
    } else {
      for (const file of options.files) {
        if (!drawn.has(file.path)) {
          load(file.path, file.document)
        }
      }

      syncModes(undefined, options.modes)
      syncTokens(noTokenEdits, state.tokens)
      doc.commit({ origin: "load" })
    }
  })

  function load(path: string, document: CanvasDocument): void {
    const fields = recordIn(filesMap, path)

    for (const [field, value] of entriesOf(fieldsOf(document))) {
      if (field !== "version" && field !== "containers" && field !== "notes" && field !== "references") {
        fields.set(field, value)
      }
    }

    for (const design of document.containers) {
      addDesign(path, design, undefined)
    }

    for (const list of ["notes", "references"] as const) {
      const values = document[list] ?? []

      if (values.length > 0) {
        const target = items(list, path)
        values.forEach((item, at) => target.insert(at, jsonOf(fieldsOf(item))))
      }
    }
  }

  function addDesign(path: string, design: ContainerSpec, at: number | undefined): void {
    const entry: IndexedEntry = { key: designKey(path, design.id), layers: new Map() }

    writeDesign(tree, path, design, at, (root) => {
      designs.set(root.id, entry)
      keys.set(entry.key, root.id)
      designOf.set(root.id, root.id)

      return made(root.id, entry)
    })
  }

  function syncModes(before: DocState["modes"] | undefined, after: DocState["modes"]): void {
    const previous = before ? fieldsOf(before) : modesMap.toJSON()
    const next = fieldsOf(after)

    for (const key of Object.keys(previous)) {
      if (!(key in next)) {
        modesMap.delete(key)
      }
    }

    for (const [key, value] of entriesOf(next)) {
      if (!before || !sameJson(previous[key], value)) {
        modesMap.set(key, value)
      }
    }
  }

  function syncTokens(before: TokenEdits, after: TokenEdits): void {
    for (const key of before.keys()) {
      if (!after.has(key)) {
        tokensMap.delete(key)
      }
    }

    for (const [key, edit] of after) {
      const was = before.get(key)

      if (!was || was.value !== edit.value || was.original !== edit.original) {
        tokensMap.set(key, tokenJson(edit))
      }
    }
  }

  // Applying this person's operations.

  /** The file an operation changes, to leave drawn files out of Loro. */
  const fileOf = (op: DocOp): string | undefined => {
    switch (op.op) {
      case "addFile":
      case "removeFile":
      case "addDesign":
      case "setNote":
      case "removeNote":
      case "setReference":
      case "removeReference":
      case "setFileField":
        return op.file

      case "setModes":
      case "setTokens":
        return undefined

      default:
        return splitKey(op.design)?.path
    }
  }

  const designAt = (at: DocState, key: DesignKey): ContainerSpec | undefined => {
    const split = splitKey(key)

    return split && at.files.get(split.path)?.containers.find((container) => container.id === split.id)
  }

  const write = (op: DocOp, before: DocState, after: DocState) => {
    switch (op.op) {
      case "insert": {
        const target = holder(op.design, op.parent, op.slot)
        const root = keys.get(op.design) ?? target.id
        writeLayer(target, op.node, placeOf(op.design, op.before), made(root, entryOf(op.design)))

        return
      }

      case "remove": {
        const removed = findNode(designAt(before, op.design)?.root ?? emptyRoot, op.node)
        const entry = entryOf(op.design)
        tree.delete(layerNode(op.design, op.node).id)

        for (const id of removed ? nodeIds(removed) : []) {
          entry.layers.delete(id)
        }

        return
      }

      case "move": {
        const moved = layerNode(op.design, op.node)

        if (op.before === undefined) {
          tree.move(moved.id, holder(op.design, op.parent, op.slot).id)
        } else {
          holder(op.design, op.parent, op.slot)
          moved.moveBefore(layerNode(op.design, op.before))
        }

        return
      }

      case "set": {
        const [field = "", key] = op.path
        const data = dataOf(layerNode(op.design, op.node))
        const beforeNode = findNode(designAt(before, op.design)?.root ?? emptyRoot, op.node)
        const afterNode = findNode(designAt(after, op.design)?.root ?? emptyRoot, op.node)
        const previous = beforeNode ? fieldsOf(beforeNode)[field] : undefined
        const next = afterNode ? fieldsOf(afterNode)[field] : undefined

        if (key === undefined) {
          syncField(data, field, previous, next, layerRecords)
        } else {
          syncKey(data, field, key, op.value, next)
        }

        return
      }

      case "editText": {
        const text = keep(dataOf(layerNode(op.design, op.node)).ensureMergeableText("text"))

        if (op.edit.kind === "replace") {
          text.update(op.edit.text)
        } else {
          text.splice(op.edit.at, op.edit.remove, op.edit.insert)
        }

        return
      }

      case "replaceRoot": {
        const design = designNode(op.design)
        const entry = entryOf(op.design)

        for (const old of childrenOf(design)) {
          tree.delete(old.id)
        }

        entry.layers.clear()
        writeLayer(design, op.root, undefined, made(design.id, entry))

        return
      }

      case "addSlot": {
        const parent = layerNode(op.design, op.node)
        const slots = childrenOf(parent)
        const at = op.before === undefined ? -1 : slots.findIndex((slot) => dataOf(slot).get(slotKey) === op.before)
        const created = keep(at < 0 ? parent.createNode() : parent.createNode(at))
        dataOf(created).set(slotKey, op.slot)
        designOf.set(created.id, keys.get(op.design) ?? created.id)

        return
      }

      case "removeSlot": {
        const parent = layerNode(op.design, op.node)
        const slot = childrenOf(parent).find((child) => dataOf(child).get(slotKey) === op.slot)
        const holderNode = findNode(designAt(before, op.design)?.root ?? emptyRoot, op.node)
        const filled = holderNode && "slots" in holderNode ? (holderNode.slots?.[op.slot] ?? []) : []
        const entry = entryOf(op.design)

        for (const id of filled.flatMap((layer) => [...nodeIds(layer)])) {
          entry.layers.delete(id)
        }

        if (slot) {
          tree.delete(slot.id)
        }

        return
      }

      case "addFile": {
        const fields = recordIn(filesMap, op.file)
        const given: JsonRecord = {}

        for (const [field, value] of Object.entries(op.fields ?? {})) {
          if (value !== undefined) {
            given[field] = value
          }
        }

        // A file taken away and added again starts empty, though Loro keeps what its containers held.
        for (const field of fields.keys()) {
          if (!(field in given)) {
            fields.delete(field)
          }
        }

        for (const [field, value] of Object.entries(given)) {
          fields.set(field, value)
        }

        clearItems(op.file)

        return
      }

      case "removeFile": {
        for (const design of before.files.get(op.file)?.containers ?? []) {
          removeDesign(designKey(op.file, design.id))
        }

        clearItems(op.file)
        filesMap.delete(op.file)

        return
      }

      case "addDesign": {
        const at = op.before === undefined ? undefined : (designNode(op.before).index() ?? undefined)
        addDesign(op.file, op.design, at)

        return
      }

      case "removeDesign":
        removeDesign(op.design)

        return

      case "moveDesign": {
        const moved = designNode(op.design)
        const { path, id } = splitKey(op.design) ?? { path: "", id: "" }
        const target = op.file ?? path

        if (target !== path) {
          dataOf(moved).set(fileKey, target)
        }

        if (op.before === undefined) {
          tree.move(moved.id, undefined)
        } else {
          moved.moveBefore(designNode(op.before))
        }

        const entry = entryOf(op.design)
        keys.delete(op.design)
        entry.key = designKey(target, id)
        keys.set(entry.key, moved.id)

        return
      }

      case "setDesign": {
        const [field = "", key] = op.path
        const data = dataOf(designNode(op.design))
        const previous = fieldOfDesign(before, op.design, field)
        const next = fieldOfDesign(after, op.design, field)

        if (key === undefined) {
          syncField(data, field, previous, next, designRecords)
        } else {
          syncKey(data, field, key, op.value, next)
        }

        return
      }

      case "setNote":
      case "setReference": {
        const list = op.op === "setNote" ? "notes" : "references"
        const item = op.op === "setNote" ? op.note : op.reference
        setItem(list, op.file, item.id, jsonOf(fieldsOf(item)), after)

        return
      }

      case "removeNote":
      case "removeReference": {
        const target = items(op.op === "removeNote" ? "notes" : "references", op.file)
        const at = idsOf(target).indexOf(op.id)

        if (at >= 0) {
          target.delete(at, 1)
        }

        return
      }

      case "setFileField": {
        const fields = recordIn(filesMap, op.file)

        if (op.value === undefined) {
          fields.delete(op.field)
        } else {
          fields.set(op.field, op.value)
        }

        return
      }

      case "setModes":
        syncModes(before.modes, after.modes)

        return

      case "setTokens":
        syncTokens(before.tokens, after.tokens)

        return
    }
  }

  const fieldOfDesign = (at: DocState, key: DesignKey, field: string): JsonValue | undefined => {
    const design = designAt(at, key)

    return design ? fieldsOf(design)[field] : undefined
  }

  function removeDesign(key: DesignKey): void {
    const root = keys.get(key)

    if (root !== undefined) {
      tree.delete(root)
      unindex(root)
    }
  }

  function clearItems(file: string): void {
    for (const list of ["notes", "references"] as const) {
      const target = items(list, file)

      if (target.length > 0) {
        target.delete(0, target.length)
      }
    }
  }

  function setItem(list: "notes" | "references", file: string, id: string, value: JsonRecord, after: DocState): void {
    const target = items(list, file)
    const wanted = (after.files.get(file)?.[list] ?? []).findIndex((each) => each.id === id)
    const current = idsOf(target).indexOf(id)

    if (current < 0) {
      target.insert(Math.max(wanted, 0), value)

      return
    }

    if (wanted >= 0 && wanted !== current) {
      target.move(current, wanted)
    }

    if (!sameJson(itemAt(target, wanted >= 0 ? wanted : current), value)) {
      target.set(wanted >= 0 ? wanted : current, value)
    }
  }

  const apply = (ops: readonly DocOp[], origin: ChangeOrigin): BackendChange => scoped(() => applyOps(ops, origin))

  const applyOps = (ops: readonly DocOp[], origin: ChangeOrigin): BackendChange => {
    const recorder = new Recorder()

    for (const [at, op] of ops.entries()) {
      const before = state
      state = applyOp(state, op, at, recorder, false).state
      const file = fileOf(op)

      if (file !== undefined && drawn.has(file)) {
        drawnChanges += 1
      } else {
        write(op, before, state)
      }
    }

    doc.commit({ origin })

    return { ...recorder.change(), version: version() }
  }

  // Taking in others' changes.

  const alive = (id: TreeID) => tree.has(id) && !tree.isNodeDeleted(id)

  /** The design node a node is in, walking up from nodes made by the import. */
  const designFor = (id: TreeID | undefined): TreeID | undefined => {
    if (id === undefined) {
      return undefined
    }

    const known = designOf.get(id)

    if (known !== undefined) {
      return known
    }

    // A node made and deleted by others isn't in any design this replica knows, and a deleted node's parent is Loro's.
    let current = alive(id) ? nodeIn(tree, id) : undefined

    while (current) {
      const found = designOf.get(current.id)

      if (found !== undefined) {
        return found
      }

      const up = current.parent()
      const parent = up ? keep(up) : undefined

      if (!parent) {
        return current.id
      }

      current = parent
    }

    return undefined
  }

  const receive = (bytes: Uint8Array) => {
    // Subscribed only while importing: with a subscription, Loro builds the events of every local commit too, which
    // costs more than the commit on a large one. An import's events arrive before `import` returns.
    const events: LoroEvent[] = []

    const unsubscribe = doc.subscribe((batch) => {
      if (batch.by === "import") {
        for (const event of batch.events) {
          events.push(event)

          // A map's new values include the containers set in it, as Loro objects to free.
          if (event.diff.type === "map") {
            for (const value of Object.values(event.diff.updated)) {
              if (value instanceof LoroMap || value instanceof LoroText || value instanceof LoroMovableList) {
                keep(value)
              }
            }
          }
        }
      }
    })

    try {
      // Changes that need others not here yet wait inside Loro, and are applied once those arrive.
      lastPending = (doc.import(bytes).pending?.size ?? 0) > 0
    } finally {
      unsubscribe()
    }

    if (events.length === 0) {
      return
    }

    const roots = new Set<TreeID>()
    const touchedFiles = new Set<string>()
    /** Others' changes to texts, by the node whose text they changed, for undo to follow (PAR-1258). */
    const textChanges = new Map<TreeID, TextSplice[]>()
    let modesTouched = false
    let tokensTouched = false

    for (const event of events) {
      const [top, second] = event.path

      if (top === "designs") {
        if (event.diff.type === "tree") {
          for (const item of event.diff.diff) {
            for (const id of [
              item.target,
              "parent" in item ? item.parent : undefined,
              item.action === "create" ? undefined : item.oldParent
            ]) {
              const design = designFor(id)

              if (design !== undefined) {
                roots.add(design)
              }
            }
          }
        } else {
          const id = treeIdIn(second)
          const design = designFor(id)

          if (design !== undefined) {
            roots.add(design)
          }

          if (id !== undefined && event.diff.type === "text") {
            textChanges.set(id, [...(textChanges.get(id) ?? []), ...splicesOf(event.diff.diff)])
          }
        }
      } else if (top === "notes" || top === "references" || top === "files") {
        if (second === undefined && event.diff.type === "map") {
          Object.keys(event.diff.updated).forEach((path) => touchedFiles.add(path))
        } else if (second !== undefined) {
          touchedFiles.add(textOf(second) ?? "")
        }
      } else if (top === "modes") {
        modesTouched = true
      } else if (top === "tokens") {
        tokensTouched = true
      }
    }

    lastRepairs = repairDesigns(tree, roots)

    if (lastRepairs.length > 0) {
      doc.commit({ origin: "repair" })
    }

    for (const root of roots) {
      const old = designs.get(root)

      const oldPath = old && splitKey(old.key)?.path

      if (oldPath !== undefined) {
        touchedFiles.add(oldPath)
      }

      if (alive(root)) {
        touchedFiles.add(textOf(dataOf(node(root)).get(fileKey)) ?? "")
      }
    }

    for (const path of drawn) {
      touchedFiles.delete(path)
    }

    const ops: DocOp[] = []

    for (const path of touchedFiles) {
      ops.push(...fileOps(path, state.files.get(path), fileFrom(path, roots)))
    }

    if (modesTouched) {
      const modes = readModes(modesMap)

      if (!sameJson(jsonOf(fieldsOf(modes)), jsonOf(fieldsOf(state.modes)))) {
        ops.push({ op: "setModes", modes })
      }
    }

    if (tokensTouched) {
      const tokens = readTokens(tokensMap)

      if (!sameTokenEdits(tokens, state.tokens)) {
        ops.push({ op: "setTokens", tokens })
      }
    }

    const recorder = new Recorder()
    state = applyRemote(state, ops, recorder, touchedFiles, roots)

    for (const root of roots) {
      if (alive(root)) {
        const design = node(root)
        index(design, keyOf(design))
      } else {
        unindex(root)
      }
    }

    if (!recorder.touched()) {
      return
    }

    const change = { ...recorder.change(), texts: textsOf(textChanges), version: version() }

    for (const listener of listeners) {
      listener(change)
    }
  }

  /** Others' changes to texts, by the layer whose text they changed. */
  const textsOf = (changes: ReadonlyMap<TreeID, TextSplice[]>): TextChanges[] => {
    const texts: TextChanges[] = []

    for (const [id, splices] of changes) {
      const root = designFor(id)
      const design = root === undefined || !alive(id) ? undefined : designs.get(root)
      const layer = design && textOf(dataOf(node(id)).get("id"))

      if (design && layer !== undefined) {
        texts.push({ address: { design: design.key, node: layer }, splices })
      }
    }

    return texts
  }

  /** A file as Loro now holds it, reusing the plain value of each design the import didn't touch. */
  const fileFrom = (path: string, touched: ReadonlySet<TreeID>): CanvasDocument | undefined => {
    const fields = filesMap.get(path)

    if (fields === undefined) {
      return undefined
    }

    const current = new Map((state.files.get(path)?.containers ?? []).map((design) => [design.id, design]))
    const containers: ContainerSpec[] = []

    for (const root of rootsOf(tree)) {
      if (dataOf(root).get(fileKey) !== path) {
        continue
      }

      const kept = touched.has(root.id) ? undefined : current.get(textOf(dataOf(root).get("id")) ?? "")
      containers.push(kept ?? readDesign(root))
    }

    return readFile(containers, notesMap.get(path), referencesMap.get(path), fields)
  }

  /**
   * Applies the operations that make the plain values what Loro holds. Should a merge leave something the operations
   * can't express, the touched files are replaced whole and every design in them counted as changed.
   */
  const applyRemote = (
    from: DocState,
    ops: readonly DocOp[],
    recorder: Recorder,
    paths: ReadonlySet<string>,
    roots: ReadonlySet<TreeID>
  ): DocState => {
    try {
      return applyPlain(from, ops, recorder)
    } catch {
      const files = new Map(from.files)

      for (const path of paths) {
        const file = fileFrom(path, roots)

        if (file) {
          files.set(path, file)

          for (const design of file.containers) {
            recorder.designField(designKey(path, design.id), path, "root")
          }
        } else if (files.delete(path)) {
          recorder.fileRemoved(path)
        }
      }

      return { ...from, files, modes: readModes(modesMap), tokens: readTokens(tokensMap) }
    }
  }

  /** Every file and the modes as Loro holds them. */
  const readWhole = (): { files: Map<string, CanvasDocument>; modes: ModeSettings } =>
    scoped(() => {
      const all = new Set(rootsOf(tree).map((root) => root.id))
      const files = new Map<string, CanvasDocument>()

      for (const path of filesMap.keys()) {
        files.set(path, fileFrom(path, all) ?? emptyDocument())
      }

      return { files, modes: readModes(modesMap) }
    })

  // On another replica's snapshot, what it holds wins over the files given, which can be older than its edits.
  if (snapshot) {
    const whole = readWhole()
    // In the order the files were given, with any only the snapshot has after them.
    const files = new Map<string, CanvasDocument>()

    for (const [path, document] of state.files) {
      const held = drawn.has(path) ? document : whole.files.get(path)

      if (held) {
        files.set(path, held)
      }
    }

    for (const [path, document] of whole.files) {
      files.set(path, document)
    }

    state = { ...state, files, modes: whole.modes, tokens: readTokens(tokensMap) }
  }

  return {
    provider,
    sync: true,
    doc,
    files: () => state.files,
    modes: () => state.modes,
    tokens: () => state.tokens,
    version,
    apply,
    subscribe: (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    updates: (since) =>
      since ? doc.export({ mode: "update", from: VersionVector.decode(since) }) : doc.export({ mode: "update" }),
    versionVector: () => doc.oplogVersion().encode(),
    receive: (bytes) => {
      scoped(() => receive(bytes))
    },
    repairs: () => lastRepairs,
    pending: () => lastPending,
    read: readWhole,
    snapshot: () => doc.export({ mode: "snapshot" }),
    subscribeLocalUpdates: (listener) => doc.subscribeLocalUpdates(listener),
    dispose: () => {
      listeners.clear()

      for (const container of [tree, notesMap, referencesMap, filesMap, modesMap, tokensMap]) {
        container.free()
      }

      doc.free()
    }
  }
}

const emptyRoot: DesignNode = { type: "layout", id: "", children: [] }

/** Whether two sets of token edits are the same, originals included. */
function sameTokenEdits(a: TokenEdits, b: TokenEdits): boolean {
  if (a.size !== b.size || !sameTokenValues(a, b)) {
    return false
  }

  for (const [key, edit] of a) {
    const other = b.get(key)

    if (!other || other.value !== edit.value || other.original !== edit.original) {
      return false
    }
  }

  return true
}

function idsOf(list: ItemList): string[] {
  return listJson(list).map((item) => (isJsonRecord(item) ? (textOf(item.id) ?? "") : ""))
}

function itemAt(list: ItemList, at: number): JsonValue | undefined {
  return listJson(list)[at]
}

/** A design's key, from its node's file and id. */
function keyOf(root: Node): DesignKey {
  return designKey(textOf(dataOf(root).get(fileKey)) ?? "", textOf(dataOf(root).get("id")) ?? "")
}

/** The tree id in an event's path, as a node's data events have it after the tree's name. */
function treeIdIn(part: string | number | undefined): TreeID | undefined {
  return isTreeId(part) ? part : undefined
}

function isTreeId(part: string | number | undefined): part is TreeID {
  return /^\d+@\d+$/.test(String(part))
}

/** A Loro text change as the changes it makes, in order, each at its place in the text the ones before it left. */
function splicesOf(delta: readonly Delta<string>[]): TextSplice[] {
  const splices: TextSplice[] = []
  let at = 0

  for (const part of delta) {
    if (part.retain !== undefined) {
      at += part.retain
    } else if (part.delete !== undefined) {
      splices.push({ start: at, end: at + part.delete, insert: "" })
    } else {
      splices.push({ start: at, end: at, insert: part.insert })
      at += part.insert.length
    }
  }

  return splices
}
