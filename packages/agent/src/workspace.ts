import { isDeepStrictEqual } from "node:util"
import {
  addState,
  boardRoot,
  boardSize,
  type CanvasDocument,
  childEntries,
  type ContainerKind,
  type ContainerSpec,
  deleteNode,
  type DesignChange,
  type DesignNode,
  editNode,
  type EvalScope,
  drawnNode,
  type EvalContext,
  extractComponent,
  findRepeats,
  findState,
  frameSize,
  shownModes,
  generateId,
  insertNode,
  locateEffective,
  locateNode,
  mapNode,
  type ModeSettings,
  type NodeStyle,
  moveNode,
  type NodeChange,
  nodeIds,
  nodeLabel,
  type NodePatch,
  parseCanvasDocument,
  parseDesignNode,
  parseModeSettings,
  parseNodePatch,
  projectComponentLibrary,
  removeState,
  renameState,
  resolveDesign,
  type ResolvedMode,
  resolveModes,
  type StateSpec,
  uniqueId,
  withFreshIds
} from "@parity-app/core"
import { describeIconSets, findIcons, type IconMatch, type IconOptions, iconStyle, styleModule } from "./icons.ts"
import type {
  AccessibilityFinding,
  AgentEvent,
  AgentHooks,
  AgentSnapshot,
  ExecResult,
  Screenshot,
  TokenChange
} from "./types.ts"

interface Located {
  path: string
  container: ContainerSpec
}

type Values = Record<string, unknown>

const nodeKeys = new Set([
  "type",
  "name",
  "hidden",
  "style",
  "responsive",
  "children",
  "component",
  "props",
  "slots",
  "text",
  "tag",
  "design",
  "args",
  "state",
  "bind",
  "src",
  "alt",
  "fit",
  "credit"
])
/** Lengths given as token names rather than spacing steps, by the style key they're under. */
function lengthTokens(style: NodeStyle | undefined): [string, string][] {
  const found: [string, string][] = []
  for (const name of lengthStyleKeys) {
    const value = style?.[name]
    for (const side of Array.isArray(value) ? value : [value]) {
      if (typeof side === "string" && side !== "fill" && side !== "hug") found.push([name, side])
    }
  }
  return found
}

const lengthStyleKeys = [
  "gap",
  "rowGap",
  "padding",
  "margin",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "top",
  "right",
  "bottom",
  "left"
] as const

const tokenStyleKeys = [
  "background",
  "foreground",
  "border",
  "radius",
  "shadow",
  "font",
  "size",
  "leading",
  "tracking"
] as const

/**
 * One agent call's view of a tab: a working copy of its designs, modes and tokens. Every function the snippet calls
 * reads or changes the copy; nothing reaches the editor until the snippet finishes without an error, and then all of
 * it lands as one undoable step.
 */
export class AgentWorkspace {
  private readonly documents: Map<string, CanvasDocument>
  private modes: ModeSettings
  private readonly changed = new Set<string>()
  private modesChanged = false
  private readonly tokenChanges: TokenChange[] = []
  readonly output: string[] = []
  readonly warnings: string[] = []
  readonly screenshots: Screenshot[] = []
  readonly created: Record<string, string> = {}
  private readonly pending: AgentEvent[] = []
  private flushScheduled = false
  private readonly inserted = new Set<string>()
  /** Designs this call changed or moved, by key, whose overlaps it reports. */
  private readonly touched = new Set<string>()

  private readonly snapshot: AgentSnapshot
  private readonly hooks: AgentHooks
  private readonly label: string

  constructor(snapshot: AgentSnapshot, hooks: AgentHooks, label: string) {
    this.snapshot = snapshot
    this.hooks = hooks
    this.label = label
    this.documents = new Map(snapshot.documents.map(({ path, document }) => [path, structuredClone(document)]))
    this.modes = snapshot.modes
  }

  /** The functions a snippet can call, as globals. */
  api(): Record<string, unknown> {
    return {
      document: "document",
      Designs: () => this.listDesigns(),
      GetDesign: (design: string) => this.getDesign(design),
      Get: (...args: unknown[]) => this.get(args),
      Components: () => [...this.snapshot.components].sort(),
      Props: (component: string, options?: { all?: boolean }) => this.componentProps(component, options),
      Icons: (set?: string, options?: IconOptions) =>
        set === undefined ? describeIconSets(this.snapshot.iconSets ?? []) : this.icons(set, options),
      GetTokens: (filter?: { category?: string; source?: string; search?: string }) => this.getTokens(filter),
      GetModes: () => ({ settings: this.modes, modes: resolveModes(this.modes).map(describeMode) }),
      Selection: () => this.selection(),
      CreateDesign: (spec: DesignInput) => this.createDesign(spec),
      UpdateDesign: (design: string, update: DesignUpdate) => this.updateDesign(design, update),
      DeleteDesign: (design: string) => this.deleteDesign(design),
      Insert: (parent: string, node: unknown, options?: PlaceOptions) => this.insert(parent, node, options),
      Update: (path: string, change: unknown, options?: { state?: string }) => this.update(path, change, options),
      Replace: (path: string, node: unknown) => this.replace(path, node),
      Move: (path: string, parent: string, options?: PlaceOptions) => this.move(path, parent, options),
      Copy: (path: string, parent: string, options?: PlaceOptions) => this.copy(path, parent, options),
      Delete: (path: string) => this.delete(path),
      Responsive: (path: string, viewport: string, patch: unknown) => this.responsive(path, viewport, patch),
      AddState: (design: string, spec: { name: string; changes?: Record<string, unknown> }) =>
        this.addState(design, spec),
      UpdateState: (design: string, state: string, spec: { name?: string; changes?: Record<string, unknown> }) =>
        this.updateState(design, state, spec),
      DeleteState: (design: string, state: string) => this.deleteState(design, state),
      SetModes: (settings: unknown) => this.setModes(settings),
      SetTokens: (values: Record<string, string | Record<string, string>>) => this.setTokens(values),
      Measure: (design: string, options?: FrameOptions) => this.measure(design, options),
      Problems: (design: string, options?: MatrixOptions) => this.problems(design, options),
      Screenshot: (design: string, options?: MatrixOptions & { scale?: number }) => this.screenshot(design, options),
      Accessibility: (design: string, options?: MatrixOptions) => this.accessibility(design, options),
      FindEmptySpace: (options: SpaceOptions) => this.findEmptySpace(options),
      Overlaps: (design?: string) => this.overlaps(design),
      Print: (...values: unknown[]) => this.print(values),
      FindRepeats: (design: string) => this.findRepeats(design),
      ExtractComponent: (design: string, nodes: string | string[], options: ExtractInput) =>
        this.extractComponent(design, nodes, options)
    }
  }

  result(): Pick<ExecResult, "changes" | "created" | "output" | "warnings" | "screenshots"> {
    this.flush()
    for (const path of this.changed) {
      const document = this.documents.get(path)!
      try {
        parseCanvasDocument(document)
      } catch (error) {
        throw new Error(`${path} would be invalid: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error
        })
      }
      this.lint(document)
    }
    return {
      changes: {
        designs: [...this.changed].flatMap((path) => this.designChanges(path)),
        ...(this.modesChanged && !isDeepStrictEqual(this.modes, this.snapshot.modes)
          ? { modes: { base: this.snapshot.modes, after: this.modes } }
          : {}),
        tokens: this.tokenChanges
      },
      created: this.created,
      output: this.output,
      warnings: [...new Set([...this.warnings, ...this.overlapWarnings()])],
      screenshots: this.screenshots
    }
  }

  /**
   * Each design in a file this call changed, created or deleted, with the design as the snapshot had it, so the editor
   * applies just these over whatever changed there since.
   */
  private designChanges(path: string): DesignChange[] {
    const before = new Map(
      (this.snapshot.documents.find((entry) => entry.path === path)?.document.containers ?? []).map((container) => [
        container.id,
        container
      ])
    )
    const after = this.documents.get(path)?.containers ?? []
    const changes: DesignChange[] = []
    for (const container of after) {
      const base = before.get(container.id)
      if (!base || !isDeepStrictEqual(base, container))
        changes.push({ path, id: container.id, base: base ?? null, after: container })
    }
    const kept = new Set(after.map((container) => container.id))
    for (const [id, base] of before) if (!kept.has(id)) changes.push({ path, id, base, after: null })
    return changes
  }

  emit(event: AgentEvent): void {
    if ((event.kind === "write" || event.kind === "move") && event.design) this.touched.add(event.design)
    this.pending.push({ label: this.label, ...event })
    if (this.flushScheduled) return
    this.flushScheduled = true
    queueMicrotask(() => this.flush())
  }

  flush(): void {
    this.flushScheduled = false
    if (this.pending.length > 0) this.hooks.presence(this.pending.splice(0))
  }

  // Reading -----------------------------------------------------------------------------------------------------------

  private all(): Located[] {
    return [...this.documents].flatMap(([path, document]) =>
      document.containers.map((container) => ({ path, container }))
    )
  }

  /** The name of the design with this id, for naming its instances. */
  private designName = (id: string): string | undefined =>
    this.all().find(({ container }) => container.id === id)?.container.name

  private listDesigns() {
    return this.all().map(({ path, container }) => {
      const bounds = this.snapshot.bounds[key(path, container.id)]
      return {
        id: container.id,
        name: container.name,
        kind: container.kind ?? "screen",
        file: path,
        x: container.position.x,
        y: container.position.y,
        ...(bounds ? { width: Math.round(bounds.width), height: Math.round(bounds.height) } : {}),
        states: container.states.map((state) => ({ id: state.id, name: state.name })),
        showing: {
          state: container.view?.state ?? container.states[0]!.id,
          mode: shownModes(this.modes, container.view).main.id,
          beside: shownModes(this.modes, container.view).beside.map((mode) => mode.id)
        },
        nodes: nodeIds(container.root).size
      }
    })
  }

  private getDesign(reference: string): ContainerSpec {
    const found = this.findDesign(reference)
    this.emit({ kind: "read", design: key(found.path, found.container.id) })
    return structuredClone(found.container)
  }

  private get(args: unknown[]): unknown {
    const [first, second, third] = args
    if (typeof first === "function") return this.visit(undefined, first as Visit)
    if (typeof first !== "string") throw new TypeError("Get(path, options?), Get(path, visit) or Get(visit)")
    if (typeof second === "function") return this.visit(first, second as Visit, third as GetOptions | undefined)
    const options = (second ?? {}) as GetOptions
    if (shownRead(options)) {
      const { layer, read } = this.shownLayer(first, options)
      this.emit(read)
      return elide(structuredClone(layer.node), options.depth)
    }
    const design = this.tryDesign(first)
    const found = design ? { ...design, node: design.container.root } : this.findNode(first)
    this.emit({ kind: "read", design: key(found.path, found.container.id), node: design ? undefined : found.node.id })
    return elide(structuredClone(found.node), options.depth)
  }

  private visit(reference: string | undefined, visit: Visit, options: GetOptions = {}): unknown[] {
    const results: unknown[] = []
    /** Calls `visit` on one node, and says whether to go on into its children. */
    const call = (
      design: string,
      node: DesignNode,
      path: string,
      depth: number,
      index: number,
      parent: string | undefined
    ): boolean => {
      let skip = false
      const value = visit(structuredClone(node), {
        design,
        path: `${design}/${path}`,
        depth,
        index,
        parent,
        skipChildren: () => {
          skip = true
        }
      })
      if (value !== undefined) results.push(value)
      return !skip
    }
    if (reference !== undefined && shownRead(options)) {
      const { container, layer: start, read } = this.shownLayer(reference, options)
      this.emit({ kind: "read", design: read.design })
      const walk = (layer: ShownLayer, depth: number, index: number, parent: string | undefined) => {
        if (!call(container.id, layer.node, layer.path, depth, index, parent)) return
        for (const [position, child] of layer.children.entries()) {
          // Its index in its slot, as the stored walk gives it.
          const index = layer.children.slice(0, position).filter((sibling) => sibling.slot === child.slot).length
          walk(child, depth + 1, index, layer.path)
        }
      }
      walk(start, 0, 0, undefined)
      return results
    }
    const scopes = reference
      ? [
          this.tryDesign(reference) ??
            (() => {
              const found = this.findNode(reference)
              return { ...found, start: found.node }
            })()
        ]
      : this.all()
    for (const scope of scopes) {
      const start = "start" in scope ? (scope.start as DesignNode) : scope.container.root
      this.emit({ kind: "read", design: key(scope.path, scope.container.id) })
      const walk = (node: DesignNode, depth: number, index: number, parent: string | undefined) => {
        if (!call(scope.container.id, node, node.id, depth, index, parent)) return
        for (const entry of childEntries(node)) {
          for (const [childIndex, child] of entry.nodes.entries()) walk(child, depth + 1, childIndex, node.id)
        }
      }
      walk(start, 0, 0, undefined)
    }
    return results
  }

  /**
   * A layer and what's inside it as the board draws a state and mode, through core's effective evaluation: with the
   * variant options the design's board shows, its params' defaults and the project's components. The reference is a
   * design, a node (`design/node`, or a node id alone when one design has it) or a layer inside an instance
   * (`design/card/title`). Only the instances on the way to the layer are expanded, not ones inside it.
   */
  private shownLayer(reference: string, options: GetOptions) {
    const found = this.findLayer(reference)
    const { container } = found
    const mode = options.mode ? this.frameMode(options.mode) : shownModes(this.modes, container.view).main
    const context: EvalContext = {
      state: this.shownState(container, options.state),
      viewport: mode.viewport,
      library: this.library()
    }
    const located = locateEffective(container, found.layer, context)
    if (!located) throw new Error(`No layer "${found.layer}" in ${container.id}`)
    const layer = drawnLayer(located.shown, found.layer, located.scope, mode.viewport, located.location.slot)
    const design = key(found.path, container.id)
    const node = found.layer === container.root.id ? undefined : found.layer.split("/")[0]
    return { container, layer, read: { kind: "read" as const, design, ...(node ? { node } : {}) } }
  }

  /** A layer by reference, as a path `locateEffective` takes: a design's root, its node, or a node inside an instance. */
  private findLayer(reference: string): Located & { layer: string } {
    const design = this.tryDesign(reference)
    if (design) return { ...design, layer: design.container.root.id }
    for (let slash = reference.indexOf("/"); slash > 0; slash = reference.indexOf("/", slash + 1)) {
      const found = this.tryDesign(reference.slice(0, slash))
      if (!found) continue
      const [first = "", ...inner] = reference.slice(slash + 1).split("/")
      const node = resolveInDesign(found.container, first)
      return { ...found, layer: [node.id, ...inner].join("/") }
    }
    const found = this.findNode(reference)
    return { ...found, layer: found.node.id }
  }

  /** The state a frame shows: the one named, or the one the design's board shows. */
  private shownState(container: ContainerSpec, id: string | undefined): StateSpec {
    return id
      ? findState(container, id)
      : (container.states.find((candidate) => candidate.id === container.view?.state) ?? container.states[0]!)
  }

  private getTokens(filter: { category?: string; source?: string; search?: string } = {}) {
    return this.snapshot.tokens
      .filter(
        (token) =>
          (!filter.category || token.category === filter.category) &&
          (!filter.source || token.source === filter.source) &&
          (!filter.search || token.name.includes(filter.search))
      )
      .map((token) => ({ name: token.name, category: token.category, source: token.source, values: token.values }))
  }

  private selection() {
    const { design, node, mode } = this.snapshot.selection
    const located = design ? this.all().find((entry) => key(entry.path, entry.container.id) === design) : undefined
    return { design: located?.container.id, node, mode }
  }

  // Designs -----------------------------------------------------------------------------------------------------------

  private createDesign(spec: DesignInput): string {
    if (!spec || typeof spec.name !== "string")
      throw new TypeError("CreateDesign({ name, kind?, file?, x?, y?, root? })")
    const taken = this.all().map((entry) => entry.container.id)
    const id = uniqueId(spec.name, taken)
    const path = spec.file ?? this.snapshot.mainDocument
    if (!path.endsWith(".par")) throw new Error(`Project files end in .par, not ${path}`)
    const ids = new Set<string>()
    const root = spec.root
      ? this.prepareNode(spec.root, ids)
      : this.prepareNode(
          {
            type: "layout",
            name: "Page",
            style: { padding: [10, 12], gap: 6, background: "background", foreground: "foreground" },
            children: []
          },
          ids
        )
    const place =
      spec.x === undefined || spec.y === undefined ? this.findEmptySpace({ width: 1400, height: 1000 }) : undefined
    const container: ContainerSpec = {
      id,
      name: spec.name,
      kind: spec.kind ?? "screen",
      position: { x: spec.x ?? place!.x, y: spec.y ?? place!.y },
      root,
      states: [{ id: "default", name: spec.baseState ?? "Default" }]
    }
    const document = this.documents.get(path) ?? { version: 3, containers: [] }
    this.documents.set(path, { ...document, containers: [...document.containers, container] })
    this.changed.add(path)
    this.created[spec.name] = id
    this.emit({ kind: "write", design: key(path, id) })
    return id
  }

  private updateDesign(reference: string, update: DesignUpdate): void {
    const { path, container } = this.findDesign(reference)
    const modeIds = new Set(this.modes.modes.map((mode) => mode.id))
    for (const mode of [...(update.showModes ?? []), ...(update.mode ? [update.mode] : [])]) {
      if (!modeIds.has(mode)) throw new Error(`No mode "${mode}". Modes: ${[...modeIds].join(", ")}`)
    }
    if (update.state) findState(container, update.state)
    const main = update.mode ?? shownModes(this.modes, container.view).main.id
    const primary = this.modes.modes[0]?.id
    const from = container.position
    const to = { x: update.x ?? from.x, y: update.y ?? from.y }
    if (to.x !== from.x || to.y !== from.y) this.emit({ kind: "move", design: key(path, container.id), from, to })
    // A move alone shows as the board being dragged, not as a change to it.
    const onlyMoved = Object.keys(update).every((name) => name === "x" || name === "y")
    const next: ContainerSpec = {
      ...container,
      ...(update.name ? { name: update.name } : {}),
      ...(update.kind ? { kind: update.kind } : {}),
      position: to,
      view: {
        ...container.view,
        ...(update.mode ? { mode: update.mode === primary ? undefined : update.mode } : {}),
        modes: (update.showModes ?? container.view?.modes ?? []).filter((mode) => mode !== main),
        ...(update.state ? { state: update.state } : {}),
        ...(update.allStates === undefined ? {} : { allStates: update.allStates })
      }
    }
    this.setContainer(path, next, undefined, undefined, !onlyMoved)
  }

  private deleteDesign(reference: string): void {
    const { path, container } = this.findDesign(reference)
    const document = this.documents.get(path)!
    this.documents.set(path, {
      ...document,
      containers: document.containers.filter((item) => item.id !== container.id)
    })
    this.changed.add(path)
    this.emit({ kind: "write", design: key(path, container.id) })
  }

  // Nodes -------------------------------------------------------------------------------------------------------------

  private insert(parent: string, input: unknown, options: PlaceOptions = {}): string {
    if (parent === "document") {
      const node = input as Values
      return this.createDesign({
        name: String((node.name ?? "Untitled") as unknown),
        root: input,
        ...(options as object)
      })
    }
    const target = this.tryDesign(parent)
    const found = target ? { ...target, node: target.container.root } : this.findNode(parent)
    const node = this.prepareNode(input, nodeIds(found.container.root))
    const root = insertNode(found.container.root, found.node.id, node, options)
    this.setContainer(found.path, { ...found.container, root }, node.id)
    return node.id
  }

  private update(path: string, input: unknown, options: { state?: string } = {}): void {
    const { path: file, container, node } = this.findNode(path)
    const change = { ...expectObject(input, "Update") }
    if ("args" in change) {
      change.props = { ...(change.props as Values | undefined), ...expectObject(change.args, "args") }
      delete change.args
    }
    const unknown = Object.keys(change).filter(
      (name) => !["name", "text", "tag", "hidden", "props", "style", "component"].includes(name)
    )
    if (unknown.length > 0)
      throw new Error(`Update can't change ${unknown.join(", ")}; use Replace, Move or Responsive`)
    const stateId = options.state ?? container.states[0]!.id
    const base = stateId === container.states[0]!.id
    if (!base && ("name" in change || "tag" in change || "component" in change)) {
      throw new Error("A state can only change hidden, text, props and style")
    }
    if (node.type === "component" && change.props) {
      this.checkProps(
        String((change.component ?? node.component) as unknown),
        change.props as Values,
        `${container.id}/${node.id}`
      )
    }
    let next = editNode(container, stateId, node.id, toChange(change))
    if (base && ("name" in change || "tag" in change || "component" in change)) {
      next = {
        ...next,
        root: mapNode(next.root, node.id, (current) => {
          const updated = { ...current } as DesignNode & Values
          if ("name" in change) {
            if (change.name === null) delete updated.name
            else updated.name = String(change.name as unknown)
          }
          if ("tag" in change && updated.type === "text") updated.tag = change.tag as never
          if ("component" in change && updated.type === "component") updated.component = String(change.component)
          return updated
        })
      }
    }
    this.setContainer(file, next, node.id, base ? undefined : stateId)
  }

  private replace(path: string, input: unknown): string {
    const { path: file, container, node } = this.findNode(path)
    const location = locateNode(container.root, node.id)!
    const parent = location.ancestors.at(-1)
    const ids = nodeIds(container.root)
    const replacement = this.prepareNode(input, ids)
    if (!parent) {
      this.setContainer(
        file,
        {
          ...container,
          root: replacement,
          states: container.states.map((state) => ({ id: state.id, name: state.name }))
        },
        replacement.id
      )
      return replacement.id
    }
    const withoutOld = deleteNode(container, node.id)
    const root = insertNode(withoutOld.root, parent.id, replacement, { index: location.index, slot: location.slot })
    this.setContainer(file, { ...withoutOld, root }, replacement.id)
    return replacement.id
  }

  private move(path: string, parent: string, options: PlaceOptions = {}): void {
    const from = this.findNode(path)
    const target = this.tryDesign(parent)
    const to = target ? { ...target, node: target.container.root } : this.findNode(parent)
    if (from.path !== to.path || from.container.id !== to.container.id) {
      throw new Error(
        "Move works within one design. To move a layer to another design, Copy it there and Delete the original."
      )
    }
    const root = moveNode(from.container.root, from.node.id, to.node.id, options)
    this.setContainer(from.path, { ...from.container, root }, from.node.id)
  }

  private copy(path: string, parent: string, options: PlaceOptions & { name?: string } = {}): string {
    const source = this.findNode(path)
    const target = this.tryDesign(parent)
    const to = target ? { ...target, node: target.container.root } : this.findNode(parent)
    const copy = withFreshIds(structuredClone(source.node), nodeIds(to.container.root))
    if (options.name) copy.name = options.name
    const root = insertNode(to.container.root, to.node.id, copy, options)
    this.setContainer(to.path, { ...to.container, root }, copy.id)
    if (copy.name) this.created[copy.name] = copy.id
    return copy.id
  }

  private delete(path: string): void {
    const design = this.tryDesign(path)
    if (design) throw new Error(`"${path}" is a design; use DeleteDesign`)
    const { path: file, container, node } = this.findNode(path)
    if (node.id === container.root.id) throw new Error("A design's root can't be deleted; use Replace or DeleteDesign")
    this.setContainer(file, deleteNode(container, node.id), node.id)
  }

  private responsive(path: string, viewport: string, input: unknown): void {
    const viewports = new Set(
      this.modes.variables
        .filter((variable) => variable.kind === "viewport")
        .flatMap((variable) => variable.options.map((option) => option.id))
    )
    if (!viewports.has(viewport)) throw new Error(`No viewport "${viewport}". Viewports: ${[...viewports].join(", ")}`)
    const { path: file, container, node } = this.findNode(path)
    const patch = input === null ? undefined : parseNodePatch(stripNulls(input), `Responsive(${viewport})`)
    const root = mapNode(container.root, node.id, (current) => {
      const responsive = { ...current.responsive }
      if (patch) responsive[viewport] = { ...responsive[viewport], ...patch }
      else delete responsive[viewport]
      const next = { ...current, responsive }
      if (Object.keys(responsive).length === 0) delete (next as Values).responsive
      return next
    })
    this.setContainer(file, { ...container, root }, node.id)
  }

  // States ------------------------------------------------------------------------------------------------------------

  private addState(reference: string, spec: { name: string; changes?: Record<string, unknown> }): string {
    const { path, container } = this.findDesign(reference)
    const added = addState(container, spec.name)
    const next = this.applyChanges(added.container, added.id, spec.changes)
    this.setContainer(path, next, undefined, added.id)
    return added.id
  }

  private updateState(
    reference: string,
    stateId: string,
    spec: { name?: string; changes?: Record<string, unknown> }
  ): void {
    const { path, container } = this.findDesign(reference)
    findState(container, stateId)
    let next = spec.name ? renameState(container, stateId, spec.name) : container
    next = this.applyChanges(next, stateId, spec.changes)
    this.setContainer(path, next, undefined, stateId)
  }

  private deleteState(reference: string, stateId: string): void {
    const { path, container } = this.findDesign(reference)
    this.setContainer(path, removeState(container, stateId))
  }

  /** State changes keyed by node id or name; `null` clears a node's override. */
  private applyChanges(
    container: ContainerSpec,
    stateId: string,
    changes: Record<string, unknown> | undefined
  ): ContainerSpec {
    let next = container
    for (const [reference, value] of Object.entries(changes ?? {})) {
      const node = resolveInDesign(next, reference)
      if (value === null) {
        const state = findState(next, stateId)
        const overrides = { ...state.overrides }
        delete overrides[node.id]
        next = {
          ...next,
          states: next.states.map((candidate) =>
            candidate.id === stateId ? withOverrides(candidate, overrides) : candidate
          )
        }
        continue
      }
      parseNodePatch(stripNulls(value), `changes/${reference}`)
      next = editNode(next, stateId, node.id, toChange(expectObject(value, `changes/${reference}`)))
    }
    return next
  }

  // Modes and tokens --------------------------------------------------------------------------------------------------

  private setModes(settings: unknown): void {
    this.modes = parseModeSettings(settings)
    this.modesChanged = true
  }

  private setTokens(values: Record<string, string | Record<string, string>>): void {
    for (const [rawName, value] of Object.entries(expectObject(values, "SetTokens"))) {
      const name = rawName.replace(/^--/, "")
      const themes = typeof value === "string" ? { default: value } : expectObject(value, `SetTokens/${name}`)
      for (const [theme, themed] of Object.entries(themes)) {
        if (typeof themed !== "string" || !themed.trim())
          throw new TypeError(`SetTokens/${name}/${theme}: expected a CSS value`)
        this.tokenChanges.push({ name, theme, value: themed.trim() })
      }
    }
  }

  // Rendering ---------------------------------------------------------------------------------------------------------

  private frameMode(modeId: string | undefined): ResolvedMode {
    const modes = resolveModes(this.modes)
    if (!modeId) return modes[0]!
    const mode = modes.find((candidate) => candidate.id === modeId)
    if (!mode) throw new Error(`No mode "${modeId}". Modes: ${modes.map((candidate) => candidate.id).join(", ")}`)
    return mode
  }

  /** Renders a frame, showing the agent at work: `look` says what it's for, which also decides what's captured. */
  private async render(
    reference: string,
    options: FrameOptions,
    look: "screenshot" | "measure" | "accessibility" | "problems",
    scale = 1
  ) {
    const { path, container } = this.findDesign(reference)
    const state = this.shownState(container, options.state)
    const viewportMode = options.mode ? this.frameMode(options.mode) : shownModes(this.modes, container.view).main
    const size = frameSize(container, viewportMode)
    const mode = { ...viewportMode, width: size.width }
    const designKey = key(path, container.id)
    this.emit({ kind: look, design: designKey, state: state.id, mode: mode.id })
    this.flush()
    const tree = resolveDesign(boardRoot(container), state, mode.viewport, this.library(), {
      params: container.params,
      choices: container.view?.variants
    })
    const frame = await this.hooks.render({
      design: designKey,
      tree,
      mode,
      height: size.height,
      scale,
      capture: look === "screenshot",
      ...(look === "accessibility" ? { audit: true } : {}),
      tokens: this.tokenValues()
    })
    return { container, state, mode, frame }
  }

  private async measure(reference: string, options: FrameOptions = {}) {
    const { container, frame } = await this.render(reference, options, "measure")
    if (frame.error) throw new Error(`The frame failed to render: ${frame.error}`)
    const names = nodeNames(container, this.designName)
    return {
      width: frame.width,
      height: frame.height,
      overflowsX: frame.overflowsX,
      nodes: frame.nodes.map((node) => ({ ...node, name: names.get(node.id) }))
    }
  }

  private async problems(reference: string, options: MatrixOptions = {}) {
    const { container } = this.findDesign(reference)
    const found: { state: string; mode: string; problem: string; node?: string }[] = []
    for (const state of this.statesFor(container, options.state)) {
      for (const mode of this.modesFor(container, options.mode)) {
        const { frame } = await this.render(reference, { state: state.id, mode: mode.id }, "problems")
        const add = (problem: string, node?: string) =>
          found.push({ state: state.id, mode: mode.id, problem, ...(node ? { node } : {}) })
        if (frame.error) add(`render error: ${frame.error}`)
        const { width } = frameSize(container, mode)
        if (frame.overflowsX) add(`content is wider than the ${width}px frame`)
        for (const name of frame.unknownComponents) add(`"${name}" isn't one of the project's components`)
        for (const node of frame.nodes) {
          if (node.clipped) add("cut off by a parent that clips", node.id)
          if (node.width > width + 0.5) add(`${node.width}px wide, more than the frame`, node.id)
        }
      }
    }
    return found
  }

  private async screenshot(reference: string, options: MatrixOptions & { scale?: number } = {}): Promise<number> {
    const { container } = this.findDesign(reference)
    const scale = Math.min(Math.max(options.scale ?? 1, 0.25), 3)
    let count = 0
    for (const state of this.statesFor(container, options.state)) {
      for (const mode of this.modesFor(container, options.mode)) {
        const { frame } = await this.render(reference, { state: state.id, mode: mode.id }, "screenshot", scale)
        if (frame.error)
          this.warnings.push(`${container.name} (${state.name}, ${mode.name}) failed to render: ${frame.error}`)
        if (!frame.png) continue
        this.screenshots.push({
          design: container.id,
          state: state.id,
          mode: mode.id,
          width: frame.width,
          height: frame.height,
          png: frame.png
        })
        count++
      }
    }
    return count
  }

  /**
   * What axe-core finds in each frame, one finding per node, in the frame's own size and at 1x. Automated checks catch
   * only some issues, so an empty list isn't a pass.
   */
  private async accessibility(reference: string, options: MatrixOptions = {}): Promise<AccessibilityFinding[]> {
    const { container } = this.findDesign(reference)
    const names = nodeNames(container, this.designName)
    const found: AccessibilityFinding[] = []
    for (const state of this.statesFor(container, options.state)) {
      for (const mode of this.modesFor(container, options.mode)) {
        const { frame } = await this.render(reference, { state: state.id, mode: mode.id }, "accessibility")
        if (frame.error) {
          this.warnings.push(`${container.name} (${state.name}, ${mode.name}) failed to render: ${frame.error}`)
          continue
        }
        const seen = new Set<string>()
        for (const { nodes, ...issue } of frame.issues ?? []) {
          for (const { id, ...about } of nodes) {
            // Inside an instance, ids carry the instance's as a prefix; the instance is the layer in this design.
            const node = names.has(id) ? id : id.split("/")[0]!
            const name = names.get(node)
            const once = `${issue.rule}\n${name ? node : ""}`
            if (seen.has(once)) continue
            seen.add(once)
            found.push({ state: state.id, mode: mode.id, ...issue, ...(name ? { node, name } : {}), ...about })
          }
        }
      }
    }
    return found
  }

  private statesFor(container: ContainerSpec, option: string | string[] | undefined): StateSpec[] {
    if (option === "all") return container.states
    const ids = option === undefined ? [container.view?.state ?? container.states[0]!.id] : [option].flat()
    return ids.map((id) => findState(container, id))
  }

  private modesFor(container: ContainerSpec, option: string | string[] | undefined): ResolvedMode[] {
    const modes = resolveModes(this.modes)
    if (option === "all") return modes
    const shown = shownModes(this.modes, container.view)
    if (option === "shown") return [shown.main, ...shown.beside]
    const ids = option === undefined ? [shown.main.id] : [option].flat()
    return ids.map((id) => this.frameMode(id))
  }

  /**
   * Every design's board on the canvas: where this call leaves it, as big as it was last drawn. New designs, not yet
   * drawn, get an estimate from their frames' sizes, laid out as the canvas lays them out (see boardSize).
   */
  private boards(): Board[] {
    return this.all().map(({ path, container }) => {
      const bounds = this.snapshot.bounds[key(path, container.id)]
      const size = bounds ?? estimateSize(container, this.modes)
      return {
        key: key(path, container.id),
        id: container.id,
        name: container.name,
        x: container.position.x,
        y: container.position.y,
        width: Math.round(size.width),
        height: Math.round(size.height),
        estimated: !bounds
      }
    })
  }

  /**
   * Boards that overlap, each pair once; only those involving one design when it's given. A board's title, drawn
   * above it at screen size, counts as part of it, so a board just below another overlaps it by its title.
   */
  private overlaps(reference?: string): Overlap[] {
    const only = reference === undefined ? undefined : this.findDesign(reference).container.id
    const boards = this.boards()
    const found: Overlap[] = []
    for (const [index, a] of boards.entries()) {
      for (const b of boards.slice(index + 1)) {
        if (only !== undefined && a.id !== only && b.id !== only) continue
        const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y - titleBand, b.y - titleBand)
        if (width <= 0 || height <= 0) continue
        const boards = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0
        found.push({
          designs: [a.id, b.id],
          names: [a.name, b.name],
          width,
          height,
          ...(boards ? {} : { titleOnly: true as const }),
          ...(a.estimated || b.estimated ? { estimated: true as const } : {})
        })
      }
    }
    return found
  }

  /** Warnings for boards this call created, changed or moved that now overlap another. */
  private overlapWarnings(): string[] {
    const ids = new Set(this.boards().flatMap((board) => (this.touched.has(board.key) ? [board.id] : [])))
    return this.overlaps()
      .filter(({ designs }) => designs.some((id) => ids.has(id)))
      .map(({ designs, names, width, height, estimated, titleOnly }) => {
        const size = `${width}x${height}${estimated ? " (estimated, not drawn yet)" : ""}`
        const what = titleOnly
          ? `is too close to ${names[1]} (${designs[1]}): a title would cover the other board`
          : `overlaps ${names[1]} (${designs[1]}) by ${size}`
        return `${names[0]} (${designs[0]}) ${what}. Leave at least ${titleBand} between boards for titles. Move one clear with UpdateDesign(id, { x, y }); FindEmptySpace finds space and Overlaps() lists every overlap.`
      })
  }

  private findEmptySpace(options: SpaceOptions): { x: number; y: number } {
    const padding = options.padding ?? 240
    const boxes = this.boards()
    if (boxes.length === 0) return { x: 0, y: 0 }
    const anchor = options.near
      ? boxes.find((box) => box.id === this.findDesign(options.near!).container.id)
      : undefined
    const direction = options.direction ?? "right"
    if (anchor) {
      if (direction === "below")
        return {
          x: anchor.x,
          y:
            Math.max(
              ...boxes
                .filter((box) => overlaps(box.x, box.width, anchor.x, options.width))
                .map((box) => box.y + box.height)
            ) + padding
        }
      return {
        x:
          Math.max(
            ...boxes
              .filter((box) => overlaps(box.y, box.height, anchor.y, options.height))
              .map((box) => box.x + box.width)
          ) + padding,
        y: anchor.y
      }
    }
    if (direction === "below") {
      return {
        x: Math.min(...boxes.map((box) => box.x)),
        y: Math.max(...boxes.map((box) => box.y + box.height)) + padding
      }
    }
    return {
      x: Math.max(...boxes.map((box) => box.x + box.width)) + padding,
      y: Math.min(...boxes.map((box) => box.y))
    }
  }

  private findRepeats(reference: string) {
    const { path, container } = this.findDesign(reference)
    this.emit({ kind: "read", design: key(path, container.id) })
    return findRepeats(container.root)
  }

  private extractComponent(reference: string, nodes: string | string[], options: ExtractInput): string {
    if (!options?.name) throw new TypeError("ExtractComponent(design, nodes, { name, file?, params? })")
    const { path, container } = this.findDesign(reference)
    const occurrences = [nodes].flat().map((node) => resolveInDesign(container, node).id)
    const id = uniqueId(
      options.name,
      this.all().map((entry) => entry.container.id)
    )
    const top = Math.min(
      ...this.all().map(
        (entry) => this.snapshot.bounds[key(entry.path, entry.container.id)]?.y ?? entry.container.position.y
      )
    )
    const { component, design } = extractComponent(container, occurrences, {
      id,
      name: options.name,
      position: { x: container.position.x, y: Math.round(top - 640) },
      viewports: [...new Set(resolveModes(this.modes).map((mode) => mode.viewport))],
      library: this.library(),
      paramNames: options.params
    })
    this.setContainer(path, design)
    const file = options.file ?? this.snapshot.mainDocument
    if (!file.endsWith(".par")) throw new Error(`Project files end in .par, not ${file}`)
    const target = this.documents.get(file) ?? { version: 3, containers: [] }
    this.documents.set(file, { ...target, containers: [...target.containers, component] })
    this.changed.add(file)
    this.created[options.name] = id
    this.emit({ kind: "write", design: key(file, id) })
    return id
  }

  /** What instances place: the libraries' component designs and the call's working copy of the project's, as the canvas builds it. */
  private library() {
    return projectComponentLibrary(
      this.snapshot.libraryDesigns,
      this.all().map((entry) => entry.container)
    )
  }

  /**
   * The token values frames draw with over the compiled CSS: the canvas's unsaved ones, then this call's `SetTokens`,
   * one per token and theme, the latest winning.
   */
  private tokenValues(): TokenChange[] {
    const values = new Map<string, TokenChange>()
    for (const change of [...this.snapshot.tokenOverrides, ...this.tokenChanges]) {
      const at = `${change.name} ${change.theme}`
      values.set(at, { name: change.name, theme: change.theme, value: change.value })
    }
    return [...values.values()]
  }

  private print(values: unknown[]): void {
    this.output.push(values.map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join(" "))
  }

  // Helpers -----------------------------------------------------------------------------------------------------------

  /** Validates an agent's node, gives it and everything in it fresh ids, and records the names it created. */
  private prepareNode(input: unknown, taken: Set<string>): DesignNode {
    const assign = (value: unknown, path: string): Values => {
      const node = { ...expectObject(value, path) }
      const unknown = Object.keys(node).filter((name) => !nodeKeys.has(name) && name !== "id")
      if (unknown.length > 0)
        throw new Error(`${path}: unknown properties ${unknown.join(", ")}. Nodes take ${[...nodeKeys].join(", ")}.`)
      const id = generateId(taken)
      taken.add(id)
      node.id = id
      if (typeof node.name === "string") this.created[node.name] = id
      this.inserted.add(id)
      if (Array.isArray(node.children))
        node.children = node.children.map((child, index) => assign(child, `${path}/children/${index}`))
      if (node.slots && typeof node.slots === "object") {
        node.slots = Object.fromEntries(
          Object.entries(node.slots as Values).map(([slot, children]) => [
            slot,
            (Array.isArray(children) ? children : [children]).map((child, index) =>
              assign(child, `${path}/slots/${slot}/${index}`)
            )
          ])
        )
      }
      if (node.type === "layout" && !node.children) node.children = []
      return node
    }
    return parseDesignNode(assign(input, "node"), "node")
  }

  private findDesign(reference: string): Located {
    const found = this.tryDesign(reference)
    if (!found) {
      throw new Error(
        `No design "${reference}". Designs: ${
          this.all()
            .map(({ container }) => `${container.id} (${container.name})`)
            .join(", ") || "none"
        }`
      )
    }
    return found
  }

  private tryDesign(reference: string): Located | undefined {
    const all = this.all()
    return (
      all.find(({ path, container }) => key(path, container.id) === reference) ??
      all.find(({ container }) => container.id === reference) ??
      all.find(({ container }) => container.name === reference)
    )
  }

  /** A node by `designId/nodeId`, or by node id alone when only one design has it. */
  private findNode(reference: string): Located & { node: DesignNode } {
    const slash = reference.lastIndexOf("/")
    if (slash > 0) {
      const design = this.findDesign(reference.slice(0, slash))
      const node = resolveInDesign(design.container, reference.slice(slash + 1))
      return { ...design, node }
    }
    const matches = this.all().flatMap((entry) => {
      const location = locateNode(entry.container.root, reference)
      return location ? [{ ...entry, node: location.node }] : []
    })
    if (matches.length === 1) return matches[0]!
    if (matches.length > 1) {
      throw new Error(
        `"${reference}" is in ${matches.map((match) => match.container.id).join(" and ")}; write it as design/node, e.g. "${matches[0]!.container.id}/${reference}"`
      )
    }
    throw new Error(`No node "${reference}". Paths are a node id, or design/node.`)
  }

  private setContainer(path: string, container: ContainerSpec, node?: string, state?: string, show = true): void {
    const document = this.documents.get(path)!
    this.documents.set(path, {
      ...document,
      containers: document.containers.map((candidate) => (candidate.id === container.id ? container : candidate))
    })
    this.changed.add(path)
    if (!show) return
    this.emit({
      kind: "write",
      design: key(path, container.id),
      ...(node ? { node } : {}),
      ...(state ? { state } : {})
    })
  }

  /**
   * A component's props as inferred from its source: variants with their options, own props, and (with `all`) the
   * attributes it passes through to its element.
   */
  private componentProps(component: string, options: { all?: boolean } = {}) {
    if (!this.snapshot.components.includes(component)) {
      throw new Error(`"${component}" isn't one of the project's components. Check Components().`)
    }
    const info = this.snapshot.props[component]
    if (!info) return { component, known: false, props: [] }
    const props = info.props.filter(
      (prop) => options.all || ((prop.group === "variant" || prop.group === "own") && prop.kind !== "function")
    )
    return { component, path: info.path, ...(info.import ? { import: info.import } : {}), known: true, props }
  }

  /** One of the project's icon sets' icons, read from the project's own copy of the set. */
  private async icons(id: string, options: IconOptions = {}): Promise<IconMatch[]> {
    const sets = this.snapshot.iconSets ?? []
    const set = sets.find((candidate) => candidate.id === id)
    if (!set) {
      throw new Error(
        sets.length > 0
          ? `"${id}" isn't one of the project's icon sets: ${sets.map((candidate) => candidate.id).join(", ")}`
          : "The project has no icon sets"
      )
    }
    if (!this.hooks.iconNames) throw new Error("Icon names can't be read here")
    const style = iconStyle(set, options.style)
    return findIcons(set, await this.hooks.iconNames(set.id, styleModule(set, style)), style, options)
  }

  /** Props a component doesn't declare, and values outside a prop's options. */
  private checkProps(component: string, props: Record<string, unknown> | undefined, where: string): void {
    const info = this.snapshot.props[component]
    if (!info || !props) return
    for (const [name, value] of Object.entries(props)) {
      const prop = info.props.find((candidate) => candidate.name === name)
      if (!prop) {
        if (!name.startsWith("data-"))
          this.warnings.push(`${where}: ${component} has no prop "${name}". Check Props("${component}").`)
        continue
      }
      if (prop.kind === "enum" && value !== undefined && !prop.options?.includes(value as string)) {
        this.warnings.push(
          `${where}: ${component} ${name} is one of ${prop.options?.map((option) => JSON.stringify(option)).join(", ")}, not ${JSON.stringify(value)}`
        )
      }
    }
  }

  /** Warnings for things that are valid but probably not what was meant. */
  private lint(document: CanvasDocument): void {
    const components = new Set(this.snapshot.components)
    const icons = (this.snapshot.iconSets ?? []).map((set) => `${set.id}/`)
    const tokens = new Set(this.snapshot.tokens.map((token) => token.name))
    const library = this.library()
    for (const container of document.containers) {
      const check = (node: DesignNode, where: string) => {
        if (node.type === "instance" && !library.has(node.design)) {
          this.warnings.push(`${where}: no component design "${node.design}"`)
        }
        if (
          node.type === "component" &&
          !components.has(node.component) &&
          !icons.some((prefix) => node.component.startsWith(prefix))
        ) {
          this.warnings.push(
            `${where}: "${node.component}" isn't one of the project's components; it renders as a placeholder. Check Components().`
          )
        }
        if (node.type === "component" && this.inserted.has(node.id)) this.checkProps(node.component, node.props, where)
        for (const style of [node.style, ...Object.values(node.responsive ?? {}).map((patch) => patch.style)]) {
          for (const name of tokenStyleKeys) {
            const value = style?.[name]
            if (value && !tokens.has(value))
              this.warnings.push(`${where}: ${name} "${value}" isn't a token. Use a name from GetTokens().`)
          }
          for (const [name, value] of lengthTokens(style)) {
            if (!tokens.has(value)) {
              this.warnings.push(
                `${where}: ${name} "${value}" isn't a length token. Use a spacing step (a number) instead.`
              )
            }
          }
        }
        if (
          this.inserted.has(node.id) &&
          !node.name &&
          node.type === "layout" &&
          childEntries(node).some((entry) => entry.nodes.length > 1)
        ) {
          this.warnings.push(`${where}: name layouts that group things, so the layers tree reads well`)
        }
        for (const entry of childEntries(node))
          for (const child of entry.nodes) check(child, `${container.id}/${child.id}`)
      }
      check(container.root, `${container.id}/${container.root.id}`)
      for (const state of container.states) {
        for (const [nodeId, patch] of Object.entries(state.overrides ?? {})) {
          for (const name of tokenStyleKeys) {
            const value = patch.style?.[name]
            if (value && !tokens.has(value))
              this.warnings.push(`${container.id} state ${state.id}/${nodeId}: ${name} "${value}" isn't a token`)
          }
        }
      }
    }
  }
}

interface ExtractInput {
  name: string
  file?: string
  /** Better names for the params found, by the name they were given. */
  params?: Record<string, string>
}

interface DesignInput {
  name: string
  kind?: ContainerKind
  file?: string
  x?: number
  y?: number
  root?: unknown
  baseState?: string
}

interface DesignUpdate {
  name?: string
  kind?: ContainerKind
  x?: number
  y?: number
  /** The main frame's mode. */
  mode?: string
  /** Modes shown beside the main frame. */
  showModes?: string[]
  state?: string
  allStates?: boolean
}

interface PlaceOptions {
  index?: number
  slot?: string
}

interface GetOptions {
  depth?: number
  /** Read the nodes as the board draws this state; the state the design shows when only `mode` is given. */
  state?: string
  /** Read the nodes as the board draws this mode; the design's main mode when only `state` is given. */
  mode?: string
}

interface FrameOptions {
  state?: string
  mode?: string
}

interface MatrixOptions {
  /** A state id, a list of them, or "all". Defaults to the state the design shows. */
  state?: string | string[]
  /** A mode id, a list, "shown" (what the design shows) or "all". Defaults to the primary mode. */
  mode?: string | string[]
}

interface Board {
  key: string
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  /** Not drawn yet, so its size is a guess. */
  estimated: boolean
}

interface Overlap {
  designs: [string, string]
  names: [string, string]
  width: number
  height: number
  /** Only a title overlaps: the boards themselves are clear but too close. */
  titleOnly?: true
  estimated?: true
}

/** Room above a board for its title, which the canvas draws at screen size: enough down to about 25% zoom. */
const titleBand = 160

interface SpaceOptions {
  width: number
  height: number
  direction?: "right" | "below"
  padding?: number
  near?: string
}

type Visit = (
  node: DesignNode,
  context: { design: string; path: string; depth: number; index: number; parent?: string; skipChildren(): void }
) => unknown

function key(path: string, id: string): string {
  return `${path}#${id}`
}

/** Every node's id in a design, mapped to the name it shows in the layers. */
function nodeNames(container: ContainerSpec, designName: (id: string) => string | undefined): Map<string, string> {
  const names = new Map<string, string>()
  const collect = (node: DesignNode) => {
    names.set(node.id, nodeLabel(node, designName))
    for (const entry of childEntries(node)) entry.nodes.forEach(collect)
  }
  collect(container.root)
  return names
}

function describeMode(mode: ResolvedMode) {
  return {
    id: mode.id,
    name: mode.name,
    width: mode.width,
    viewport: mode.viewport,
    classNames: mode.classNames,
    attributes: mode.attributes
  }
}

function resolveInDesign(container: ContainerSpec, reference: string): DesignNode {
  const byId = locateNode(container.root, reference)?.node
  if (byId) return byId
  const byName: DesignNode[] = []
  const visit = (node: DesignNode) => {
    if (node.name === reference) byName.push(node)
    for (const entry of childEntries(node)) entry.nodes.forEach(visit)
  }
  visit(container.root)
  if (byName.length === 1) return byName[0]!
  if (byName.length > 1)
    throw new Error(`${byName.length} layers in ${container.id} are named "${reference}"; use an id`)
  throw new Error(`No layer "${reference}" in ${container.id}`)
}

/** Whether a read asks for what the board draws rather than the stored nodes. */
function shownRead(options: GetOptions): boolean {
  return options.state !== undefined || options.mode !== undefined
}

/** A layer as it's drawn, with its children drawn too. An instance is its own node: what's inside isn't copied in. */
interface ShownLayer {
  path: string
  slot?: string
  node: DesignNode
  children: ShownLayer[]
}

/**
 * A drawn layer with its children drawn in the same scope, each through core's per-node step. An instance's contents
 * aren't expanded, so reading one costs the same however much its component holds.
 */
function drawnLayer(node: DesignNode, path: string, scope: EvalScope, viewport: string, slot?: string): ShownLayer {
  const where = slot === undefined ? { path } : { path, slot }
  const prefix = path.slice(0, path.length - node.id.length)
  const children = childEntries(node).flatMap((entry) =>
    entry.nodes.map((child) =>
      drawnLayer(drawnNode(child, scope, viewport), `${prefix}${child.id}`, scope, viewport, entry.slot)
    )
  )
  if (node.type === "layout") {
    return { ...where, node: { ...node, children: children.map((child) => child.node) }, children }
  }
  if (node.type === "component" && node.slots) {
    const slots = Object.fromEntries(
      Object.keys(node.slots).map((name) => [
        name,
        children.filter((child) => child.slot === name).map((child) => child.node)
      ])
    )
    return { ...where, node: { ...node, slots }, children }
  }
  return { ...where, node, children }
}

function elide(node: DesignNode, depth: number | undefined, level = 0): unknown {
  if (depth === undefined) return node
  const copy = { ...node } as Values
  if (node.type === "layout") {
    if (level < depth) copy.children = node.children.map((child) => elide(child, depth, level + 1))
    else copy.children = node.children.length > 0 ? ["…"] : []
  }
  if (node.type === "component" && node.slots) {
    copy.slots = Object.fromEntries(
      Object.entries(node.slots).map(([slot, nodes]) => [
        slot,
        level >= depth ? ["…"] : nodes.map((child) => elide(child, depth, level + 1))
      ])
    )
  }
  return copy
}

function toChange(change: Values): NodeChange {
  const result: NodeChange = {}
  if ("hidden" in change) result.hidden = change.hidden === null ? undefined : Boolean(change.hidden)
  if ("text" in change) result.text = change.text === null ? undefined : String(change.text as unknown)
  if (change.props !== undefined) result.props = nullsToUndefined(expectObject(change.props, "props"))
  if (change.style !== undefined)
    result.style = nullsToUndefined(expectObject(change.style, "style")) as NodeChange["style"]
  return result
}

function nullsToUndefined(values: Values): Values {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value === null ? undefined : value]))
}

function stripNulls(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value as Values)
      .filter(([, entry]) => entry !== null)
      .map(([name, entry]) => [name, name === "props" || name === "style" ? stripNulls(entry) : entry])
  )
}

function withOverrides(state: StateSpec, overrides: Record<string, NodePatch>): StateSpec {
  return Object.keys(overrides).length > 0
    ? { id: state.id, name: state.name, overrides }
    : { id: state.id, name: state.name }
}

function expectObject(value: unknown, where: string): Values {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${where}: expected an object`)
  return value as Values
}

/** The size of a board the canvas hasn't drawn: its shown frames, laid out as the canvas lays them out. */
function estimateSize(container: ContainerSpec, modes: ModeSettings): { width: number; height: number } {
  const { main, beside } = shownModes(modes, container.view)
  return boardSize(container, [main, ...beside])
}

function overlaps(start: number, size: number, otherStart: number, otherSize: number): boolean {
  return start < otherStart + otherSize && otherStart < start + size
}
