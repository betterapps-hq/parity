import { isDeepStrictEqual } from "node:util"
import {
  addState,
  alternativeLimit,
  boardRoot,
  type CanvasDocument,
  childEntries,
  childNodes,
  closest,
  CodedError,
  type ContainerKind,
  type ComponentLibrary,
  type ContainerSpec,
  deleteNode,
  type DesignChange,
  dropPatches,
  designModes,
  type DesignNode,
  type ImageNode,
  type VideoNode,
  editInner,
  editNode,
  type EvalScope,
  drawnNode,
  type EvalContext,
  extractComponent,
  findNode,
  findRepeats,
  findState,
  frameGeometry,
  type FrameSize,
  shownModes,
  generateId,
  insertNode,
  isInnerPath,
  locateEffective,
  locateInner,
  locateNode,
  mapNode,
  type ModeSettings,
  modeSettings,
  modesReport,
  moveNode,
  type NodeChange,
  nodeIds,
  type InstanceNode,
  type NodePatch,
  nodeTree,
  parseCanvasDocument,
  plainObject,
  type PropValues,
  projectComponentLibrary,
  radiusKeywords,
  removeState,
  renameState,
  resetInner,
  resolveDesign,
  type ReferenceSpec,
  type ResolvedMode,
  resolveModes,
  type StateSpec,
  tidyPatch,
  uniqueId,
  unknownReference,
  walkNodes,
  withFreshIds
} from "@parity-app/core"
import {
  type Bounds,
  componentComposition,
  type DroppedParts,
  newDesign,
  type ReferenceAdded,
  type ReferenceAnchor,
  nearestBox,
  referenceBounds,
  referenceExpired,
  referenceFrom,
  referenceRow,
  referenceSize,
  turnInto
} from "@parity-app/editor"
import {
  builtOn,
  categorize,
  checkTokenEdit,
  type CssSupports,
  previewKind,
  substituteReferences
} from "@parity-app/tokens"
import { z } from "zod"
import {
  copyOptions,
  type DesignInput,
  designInput,
  designReference,
  type DesignUpdate,
  designUpdate,
  documentPlacement,
  extractNodes,
  extractOptions,
  getOptions,
  type GetOptions,
  getPath,
  iconOptions,
  matrixOptions,
  type MatrixOptions,
  newState,
  nodeReference,
  type PatchInput,
  patchInput,
  type PlaceOptions,
  placeOptions,
  propsOptions,
  readArgument,
  referenceOptions,
  readFields,
  screenshotOptions,
  spaceOptions,
  stateUpdate,
  tokenFilter,
  tokenValues,
  type UpdateChange,
  updateChange,
  updateOptions
} from "./arguments.ts"
import {
  type Board,
  type CanvasPoint,
  boardOverlaps,
  canvasBoards,
  emptySpace,
  estimateSize,
  type Overlap,
  overlapWarnings,
  type SpaceOptions
} from "./boards.ts"
import { accessibilityFindings, addContrastFixes, frameProblems, nodeNames } from "./frames.ts"
import { describeIconSets, findIcons, type IconMatch, type IconOptions, iconStyle, styleModule } from "./icons.ts"
import { lintDocument, propWarnings } from "./lint.ts"
import type {
  AccessibilityFinding,
  AgentChangeSet,
  AgentEvent,
  AgentHooks,
  AgentSnapshot,
  DiscardedNode,
  DiscardedPatches,
  ExecResult,
  FrameContrast,
  PlacedReference,
  Problem,
  Screenshot,
  TokenChange
} from "./types.ts"
import { groupWarnings, type Warning, type WarningCategory, warningLine } from "./warnings.ts"

interface Located {
  path: string
  container: ContainerSpec
}

/** How a design's board is shown: its state, mode and the modes beside it. */
type ContainerView = NonNullable<ContainerSpec["view"]>

/** What `componentComposition` reads a component's composition from. */
type CompositionSources = Parameters<typeof componentComposition>[1]

/** What `Print` writes as it is; anything else is written as JSON. */
const printedText = z.string()

/**
 * The patches replacing `removed` threw away: the responsive patches on it and what was inside it, and every state and
 * variant patch the design had before and hasn't after, keyed by node (or `instance/inner` path).
 */
function discardedPatches(before: ContainerSpec, removed: DesignNode, after: ContainerSpec): DiscardedNode[] {
  const nodes = new Map<string, DiscardedNode>()

  const entry = (id: string): DiscardedNode => {
    let found = nodes.get(id)

    if (!found) {
      const name = findNode(before.root, id.split("/")[0]!)?.name
      found = name ? { id, name } : { id }
      nodes.set(id, found)
    }

    return found
  }

  const visit = (node: DesignNode) => {
    const viewports = Object.keys(node.responsive ?? {})

    if (viewports.length > 0) {
      entry(node.id).viewports = viewports
    }

    for (const child of childNodes(node)) {
      visit(child)
    }
  }

  visit(removed)

  for (const state of before.states) {
    const kept = after.states.find((candidate) => candidate.id === state.id)?.overrides ?? {}

    for (const key of Object.keys(state.overrides ?? {})) {
      if (!(key in kept)) {
        ;(entry(key).states ??= []).push(state.id)
      }
    }
  }

  for (const [param, spec] of Object.entries(before.params ?? {})) {
    for (const option of spec.options ?? []) {
      const kept = after.params?.[param]?.options?.find((candidate) => candidate.id === option.id)?.overrides ?? {}

      for (const key of Object.keys(option.overrides ?? {})) {
        if (!(key in kept)) {
          ;(entry(key).variants ??= []).push(`${param}=${option.id}`)
        }
      }
    }
  }

  return [...nodes.values()]
}

/** The functions a snippet can call, as globals, as the workspace's `api()` returns them. */
export type AgentApi = ReturnType<AgentWorkspace["api"]>

export type { MatrixOptions } from "./arguments.ts"

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
  /** What the call found worth fixing, by category; `result` groups them. */
  private readonly found: Warning[] = []
  readonly screenshots: Screenshot[] = []
  readonly created: Record<string, string> = {}
  /** What each `Replace` threw away, reported so the agent can put back what it still wants. */
  private readonly discarded: DiscardedPatches[] = []
  private readonly pending: AgentEvent[] = []
  private flushScheduled = false
  private readonly inserted = new Set<string>()
  /** Designs this call changed or moved, by key, whose overlaps it reports. */
  private readonly touched = new Set<string>()
  /** References this call placed, in order. */
  private readonly references: ReferenceAdded[] = []
  /** The reference this call placed last beside each design, by the design's key, which the next one goes after. */
  private readonly lastReference = new Map<string, Bounds>()

  private readonly snapshot: AgentSnapshot
  private readonly hooks: AgentHooks
  private readonly label: string

  constructor(snapshot: AgentSnapshot, hooks: AgentHooks, label: string) {
    this.snapshot = snapshot
    this.hooks = hooks
    this.label = label
    this.documents = new Map(snapshot.documents.map(({ path, document }) => [path, structuredClone(document)]))
    this.modes = structuredClone(snapshot.modes)
  }

  /**
   * The functions a snippet can call, as globals. Each checks its arguments with its schema in `arguments.ts` before it
   * reads them, since a snippet can pass anything.
   */
  api() {
    const design = (value: string) => readArgument(designReference, value, "design")
    const path = (value: string) => readArgument(nodeReference, value, "path")
    const parent = (value: string) => readArgument(nodeReference, value, "parent")
    const text = (value: string, name: string) => readArgument(z.string(), value, name)

    return {
      document: "document",
      Designs: () => this.listDesigns(),
      GetDesign: (reference: string) => this.getDesign(design(reference)),
      Get: (...args: unknown[]) => this.get(args),
      Components: () => [...this.snapshot.components].sort(),
      Props: (component: string, options?: z.infer<typeof propsOptions>) =>
        this.componentProps(text(component, "component"), readFields(propsOptions, options, "options")),
      Icons: (set?: string, options?: z.infer<typeof iconOptions>) =>
        set === undefined
          ? describeIconSets(this.snapshot.iconSets ?? [])
          : this.icons(text(set, "set"), readFields(iconOptions, options, "options")),
      GetTokens: (filter?: z.infer<typeof tokenFilter>) => this.getTokens(readFields(tokenFilter, filter, "filter")),
      GetModes: (reference?: string) => this.getModes(readArgument(designReference.optional(), reference, "design")),
      Selection: () => this.selection(),
      CreateDesign: (spec: DesignInput) => this.createDesign(readFields(designInput, spec, "spec")),
      UpdateDesign: (reference: string, update: DesignUpdate) =>
        this.updateDesign(design(reference), readFields(designUpdate, update, "update")),
      DeleteDesign: (reference: string) => this.deleteDesign(design(reference)),
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the snippet API's edge: the node is whatever a snippet passed, which `prepareNode` checks
      Insert: (into: string, node: unknown, options?: PlaceOptions | z.infer<typeof documentPlacement>) =>
        this.insert(parent(into), node, options),
      Update: (reference: string, change: UpdateChange, options?: z.infer<typeof updateOptions>) =>
        this.update(
          path(reference),
          readFields(updateChange, change, "change"),
          readFields(updateOptions, options, "options")
        ),
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the snippet API's edge: the node is whatever a snippet passed, which `prepareNode` checks
      Replace: (reference: string, node: unknown) => this.replace(path(reference), node),
      Move: (reference: string, into: string, options?: PlaceOptions) =>
        this.move(path(reference), parent(into), readFields(placeOptions, options, "options")),
      Copy: (reference: string, into: string, options?: z.infer<typeof copyOptions>) =>
        this.copy(path(reference), parent(into), readFields(copyOptions, options, "options")),
      Delete: (reference: string) => this.delete(path(reference)),
      Responsive: (reference: string, viewport: string, patch: PatchInput | null) =>
        this.responsive(
          path(reference),
          text(viewport, "viewport"),
          readArgument(patchInput.nullable(), patch, "patch")
        ),
      AddState: (reference: string, spec: z.infer<typeof newState>) =>
        this.addState(design(reference), readFields(newState, spec, "spec")),
      UpdateState: (reference: string, state: string, spec: z.infer<typeof stateUpdate>) =>
        this.updateState(design(reference), text(state, "state"), readFields(stateUpdate, spec, "spec")),
      DeleteState: (reference: string, state: string) => this.deleteState(design(reference), text(state, "state")),
      SetModes: (settings: ModeSettings) => this.setModes(readFields(modeSettings, settings, "settings")),
      SetTokens: (values: z.input<typeof tokenValues>) =>
        this.setTokens(readArgument(tokenValues, values, "SetTokens")),
      Measure: (reference: string, options?: MatrixOptions) =>
        this.measure(design(reference), readFields(matrixOptions, options, "options")),
      Problems: (reference: string, options?: MatrixOptions) =>
        this.problems(design(reference), readFields(matrixOptions, options, "options")),
      Screenshot: (reference: string, options?: z.infer<typeof screenshotOptions>) =>
        this.screenshot(design(reference), readFields(screenshotOptions, options, "options")),
      Accessibility: (reference: string, options?: MatrixOptions) =>
        this.accessibility(design(reference), readFields(matrixOptions, options, "options")),
      References: (reference?: string) =>
        this.listReferences(readArgument(designReference.optional(), reference, "design")),
      PlaceReference: (id: string, options?: z.infer<typeof referenceOptions>) =>
        this.placeReference(text(id, "id"), readFields(referenceOptions, options ?? {}, "options")),
      FindEmptySpace: (options: z.infer<typeof spaceOptions>) =>
        this.findEmptySpace(readFields(spaceOptions, options, "options")),
      Overlaps: (reference?: string) => this.overlaps(readArgument(designReference.optional(), reference, "design")),
      Print: (...values: unknown[]) => this.print(values),
      FindRepeats: (reference: string) => this.findRepeats(design(reference)),
      ExtractComponent: (reference: string, nodes: string | string[], options: z.infer<typeof extractOptions>) =>
        this.extractComponent(
          design(reference),
          readArgument(extractNodes, nodes, "nodes"),
          readFields(extractOptions, options, "options")
        )
    }
  }

  result(): Pick<
    ExecResult,
    "changes" | "created" | "output" | "warnings" | "warningGroups" | "screenshots" | "discarded"
  > {
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

      this.found.push(...this.lint(document))
    }

    const groups = groupWarnings([...this.found, ...overlapWarnings(this.boards(), this.touched)])

    const designs = [...this.changed].flatMap((path) => this.designChanges(path))

    const changes: AgentChangeSet =
      this.modesChanged && !isDeepStrictEqual(this.modes, this.snapshot.modes)
        ? { designs, modes: { base: this.snapshot.modes, after: this.modes }, tokens: this.tokenChanges }
        : { designs, tokens: this.tokenChanges }

    if (this.references.length > 0) {
      changes.references = this.references
    }

    const head = {
      changes,
      created: this.created,
      output: this.output,
      warnings: groups.map(warningLine),
      warningGroups: groups
    }

    return this.discarded.length > 0
      ? { ...head, discarded: this.discarded, screenshots: this.screenshots }
      : { ...head, screenshots: this.screenshots }
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

      if (!base || !isDeepStrictEqual(base, container)) {
        changes.push({ path, id: container.id, base: base ?? null, after: container })
      }
    }

    const kept = new Set(after.map((container) => container.id))

    for (const [id, base] of before) {
      if (!kept.has(id)) {
        changes.push({ path, id, base, after: null })
      }
    }

    return changes
  }

  emit(event: AgentEvent): void {
    if ((event.kind === "write" || event.kind === "move") && event.design) {
      this.touched.add(event.design)
    }

    this.pending.push({ label: this.label, ...event })

    if (this.flushScheduled) {
      return
    }

    this.flushScheduled = true
    queueMicrotask(() => this.flush())
  }

  flush(): void {
    this.flushScheduled = false

    if (this.pending.length > 0) {
      this.hooks.presence(this.pending.splice(0))
    }
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

      const placed = {
        id: container.id,
        name: container.name,
        kind: container.kind ?? "screen",
        file: path,
        x: container.position.x,
        y: container.position.y
      }

      const where = bounds ? { ...placed, width: Math.round(bounds.width), height: Math.round(bounds.height) } : placed

      return {
        ...where,
        states: container.states.map((state) => ({ id: state.id, name: state.name })),
        showing: {
          state: container.view?.state ?? container.states[0]!.id,
          mode: shownModes(this.modes, container).main.id,
          beside: shownModes(this.modes, container).beside.map((mode) => mode.id)
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

  /** `Get(path, options?)`, `Get(path, visit, options?)` or `Get(visit)`. */
  private get(args: unknown[]): ElidedNode | unknown[] {
    const [first, second, third] = args
    const visitFirst = visitFunction.safeParse(first).data

    if (visitFirst) {
      return this.visit(undefined, visitFirst)
    }

    const reference = readArgument(getPath, first, "path")
    const visitSecond = visitFunction.safeParse(second).data

    if (visitSecond) {
      return this.visit(reference, visitSecond, readFields(getOptions, third, "options"))
    }

    const options = readFields(getOptions, second, "options") ?? {}

    if (shownRead(options)) {
      const { layer, read } = this.shownLayer(reference, options)
      this.emit(read)

      return elide(structuredClone(layer.node), options.depth)
    }

    const design = this.tryDesign(reference)
    const found = design ? { ...design, node: design.container.root } : this.findNode(reference)
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

      if (value !== undefined) {
        results.push(value)
      }

      return !skip
    }

    if (reference !== undefined && shownRead(options)) {
      const { container, layer: start, read } = this.shownLayer(reference, options)
      this.emit({ kind: "read", design: read.design })

      const walk = (layer: ShownLayer, depth: number, index: number, parent: string | undefined) => {
        if (!call(container.id, layer.node, layer.path, depth, index, parent)) {
          return
        }

        for (const [position, child] of layer.children.entries()) {
          // Its index in its slot, as the stored walk gives it.
          const index = layer.children.slice(0, position).filter((sibling) => sibling.slot === child.slot).length
          walk(child, depth + 1, index, layer.path)
        }
      }

      walk(start, 0, 0, undefined)

      return results
    }

    const scopes = reference ? [this.walkFrom(reference)] : this.all().map(fromRoot)

    for (const { start, ...scope } of scopes) {
      this.emit({ kind: "read", design: key(scope.path, scope.container.id) })

      const walk = (node: DesignNode, depth: number, index: number, parent: string | undefined) => {
        if (!call(scope.container.id, node, node.id, depth, index, parent)) {
          return
        }

        for (const entry of childEntries(node)) {
          for (const [childIndex, child] of entry.nodes.entries()) {
            walk(child, depth + 1, childIndex, node.id)
          }
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
  private shownLayer(reference: string, options: NonNullable<GetOptions>) {
    const found = this.findLayer(reference)
    const { container } = found
    const mode = this.designMode(container, options.mode)

    const context: EvalContext = {
      state: this.shownState(container, options.state),
      viewport: mode.viewport,
      library: this.library()
    }

    const located = locateEffective(container, found.layer, context)

    if (!located) {
      throw new CodedError(`No layer "${found.layer}" in ${container.id}`, { code: "unknown_node", field: "path" })
    }

    const layer = drawnLayer(located.shown, found.layer, located.scope, mode.viewport, located.location.slot)
    const design = key(found.path, container.id)
    const node = found.layer === container.root.id ? undefined : found.layer.split("/")[0]

    return {
      container,
      layer,
      read: node ? { kind: "read" as const, design, node } : { kind: "read" as const, design }
    }
  }

  /** A layer by reference, as a path `locateEffective` takes: a design's root, its node, or a node inside an instance. */
  private findLayer(reference: string): Located & { layer: string } {
    const design = this.tryDesign(reference)

    if (design) {
      return { ...design, layer: design.container.root.id }
    }

    for (let slash = reference.indexOf("/"); slash > 0; slash = reference.indexOf("/", slash + 1)) {
      const found = this.tryDesign(reference.slice(0, slash))

      if (!found) {
        continue
      }

      return { ...found, layer: layerPath(found.container, reference.slice(slash + 1), this.library()) }
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

  /**
   * The project's tokens, then the framework keywords the style fields also take (`radius-full`), each as a token with
   * `source: "keyword"`. A keyword the project declares a variable for is its token instead.
   */
  private tokensAndKeywords(): { name: string; category: string; source: string; values: Record<string, string> }[] {
    const names = new Set(this.snapshot.tokens.map((token) => token.name))

    const keywords = Object.entries(radiusKeywords)
      .filter(([name]) => !names.has(name))
      .map(([name, value]) => ({ name, category: "radius", source: "keyword", values: { default: value } }))

    return [...this.snapshot.tokens, ...keywords]
  }

  private getTokens(filter: z.infer<typeof tokenFilter> = {}) {
    return this.tokensAndKeywords()
      .filter(
        (token) =>
          (!filter.category || token.category === filter.category) &&
          (!filter.source || token.source === filter.source) &&
          (!filter.search || token.name.includes(filter.search))
      )
      .map((token) => ({
        name: token.name,
        category: token.category,
        source: token.source,
        values: { ...token.values }
      }))
  }

  /**
   * The project's modes, as set (`settings`, to change and pass to SetModes) and resolved, with what each design's
   * board shows. Naming a design gives just that one, with each of its frames' sizes. Reading changes nothing.
   */
  private getModes(reference?: string) {
    const designs =
      reference === undefined
        ? this.all().map(({ container }) => designModes(this.modes, container))
        : [designModes(this.modes, this.findDesign(reference).container, true)]

    return { settings: structuredClone(this.modes), ...modesReport(this.modes), designs }
  }

  private selection() {
    const { design, node, mode } = this.snapshot.selection
    const located = design ? this.all().find((entry) => key(entry.path, entry.container.id) === design) : undefined

    return { design: located?.container.id, node, mode }
  }

  // Designs -----------------------------------------------------------------------------------------------------------

  private createDesign(spec: DesignInput): string {
    const kind = spec.kind ?? "screen"
    const taken = this.all().map((entry) => entry.container.id)
    const id = uniqueId(spec.name, taken)
    const path = spec.file ?? this.snapshot.mainDocument
    const size = frameSizeInput(spec, kind, spec.name)
    const ids = new Set<string>()

    // Without a root, a frame starts as the editor starts one, and anything else as a page.
    const page = {
      type: "layout",
      name: "Page",
      style: { padding: [10, 12], gap: 6, background: "background", foreground: "foreground" },
      children: []
    }

    const root =
      !spec.root && kind === "frame"
        ? newDesign("frame", [], { x: 0, y: 0 }).root
        : this.prepareNode(spec.root ?? page, ids, "root")

    if (kind === "frame" && root.type !== "layout") {
      throw new CodedError("A frame's root is a layout", { code: "invalid_input", field: "root" })
    }

    const design: ContainerSpec = {
      id,
      name: spec.name,
      kind,
      position: { x: spec.x ?? 0, y: spec.y ?? 0 },
      root,
      states: [{ id: "default", name: spec.baseState ?? "Default" }]
    }

    if (size) {
      design.size = size
    }

    // A frame's board is as big as the frame; other designs get room for a page.
    const room = kind === "frame" ? estimateSize(design, this.modes) : { width: 1400, height: 1000 }
    const place = spec.x === undefined || spec.y === undefined ? this.findEmptySpace(room) : undefined
    const container = place ? { ...design, position: { x: spec.x ?? place.x, y: spec.y ?? place.y } } : design
    const document = this.documents.get(path) ?? { version: 3, containers: [] }
    this.documents.set(path, { ...document, containers: [...document.containers, container] })
    this.changed.add(path)
    this.created[spec.name] = id
    this.emit({ kind: "write", design: key(path, id) })

    return id
  }

  private updateDesign(reference: string, update: DesignUpdate): void {
    const { path, container: found } = this.findDesign(reference)
    let container = found

    if (update.kind && update.kind !== (found.kind ?? "screen")) {
      const turned = turnInto(found, update.kind, this.modes)
      container = turned.design
      const lost = describeDropped(turned.dropped)

      if (lost) {
        this.warn("kind_changed", `${found.name} is a frame now. ${lost}`)
      }
    }

    const frame = container.kind === "frame"
    const viewKeys = (["mode", "showModes", "state", "allStates"] as const).filter((name) => update[name] !== undefined)

    if (frame && viewKeys.length > 0) {
      const message = `${container.name} is a frame, shown only in the primary mode and its one state`
      throw new CodedError(`${message}, so it takes no ${viewKeys.join(" or ")}.`, {
        code: "invalid_input",
        field: viewKeys[0]
      })
    }

    const size = frameSizeInput(update, container.kind ?? "screen", container.name, container.size)
    const modeIds = new Set(this.modes.modes.map((mode) => mode.id))

    for (const mode of [...(update.showModes ?? []), ...(update.mode ? [update.mode] : [])]) {
      if (!modeIds.has(mode)) {
        throw unknownReference("unknown_mode", `No mode "${mode}". Modes: ${[...modeIds].join(", ")}`, mode, [
          ...modeIds
        ])
      }
    }

    if (update.state) {
      findState(container, update.state)
    }

    const main = update.mode ?? shownModes(this.modes, container).main.id
    const primary = this.modes.modes[0]?.id
    const from = container.position
    const to = { x: update.x ?? from.x, y: update.y ?? from.y }

    if (to.x !== from.x || to.y !== from.y) {
      this.emit({ kind: "move", design: key(path, container.id), from, to })
    }

    // A move alone shows as the board being dragged, not as a change to it.
    const onlyMoved = Object.keys(update).every((name) => name === "x" || name === "y")

    const next: ContainerSpec = { ...container }

    if (update.name) {
      next.name = update.name
    }

    next.position = to

    if (size) {
      next.size = size
    }

    if (!frame) {
      const view: ContainerView = { ...container.view }

      if (update.mode) {
        view.mode = update.mode === primary ? undefined : update.mode
      }

      view.modes = (update.showModes ?? container.view?.modes ?? []).filter((mode) => mode !== main)

      if (update.state) {
        view.state = update.state
      }

      if (update.allStates !== undefined) {
        view.allStates = update.allStates
      }

      next.view = view
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

  /** Into `document`, the node becomes a design, and the options are `CreateDesign`'s. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the snippet API's edge: the node and options as a snippet passed them, checked here
  private insert(parent: string, input: unknown, given: unknown): string {
    if (parent === "document") {
      const placed = readFields(documentPlacement, given, "options")
      const name = z.object({ name: z.string() }).safeParse(input).data?.name ?? "Untitled"

      return this.createDesign({ name, ...placed, root: input })
    }

    const options = readFields(placeOptions, given, "options") ?? {}
    const target = this.tryDesign(parent)
    const found = target ? { ...target, node: target.container.root } : this.findNode(parent)
    const node = this.prepareNode(input, nodeIds(found.container.root), "node")
    const root = insertNode(found.container.root, found.node.id, node, options)
    this.setContainer(found.path, { ...found.container, root }, node.id)

    return node.id
  }

  private update(path: string, input: UpdateChange, options: z.infer<typeof updateOptions> = {}): void {
    const found = this.findLayer(path)

    if (isInnerPath(found.layer)) {
      this.updateInner(found, input, options)

      return
    }

    const { path: file, container } = found
    const node = findNode(container.root, found.layer)!
    const { args, ...change } = input

    if (args) {
      change.props = { ...change.props, ...args }
    }

    const stateId = options.state === undefined ? container.states[0]!.id : findState(container, options.state).id
    const base = stateId === container.states[0]!.id

    const renames = (["name", "tag", "component", "src", "alt", "credit"] as const).filter(
      (name) => change[name] !== undefined
    )

    const picture = (["src", "alt", "credit"] as const).find((name) => change[name] !== undefined)

    if (picture && node.type !== "image" && node.type !== "video") {
      throw new CodedError(`Only an image or a video has ${picture}; a component takes its picture as a prop`, {
        code: "invalid_input",
        field: picture
      })
    }

    if (!base && renames.length > 0) {
      throw new CodedError("A state can only change hidden, text, props, style and unset", {
        code: "invalid_input",
        field: renames[0]
      })
    }

    if (node.type === "component" && change.props) {
      this.checkProps(change.component ?? node.component, change.props, `${container.id}/${node.id}`)
    }

    let next = editNode(container, stateId, node.id, toChange(change), kept)

    if (base && renames.length > 0) {
      next = {
        ...next,
        root: mapNode(next.root, node.id, (current) => {
          const updated = { ...current }

          if (change.name === null) {
            delete updated.name
          } else if (change.name !== undefined) {
            updated.name = change.name
          }

          if (updated.type === "text" && change.tag === null) {
            delete updated.tag
          } else if (updated.type === "text" && change.tag) {
            updated.tag = change.tag
          }

          if (updated.type === "component" && change.component !== undefined) {
            updated.component = change.component
          }

          if (updated.type === "image" || updated.type === "video") {
            pictured(updated, change)
          }

          return updated
        })
      }
    }

    this.setContainer(file, next, node.id, base ? undefined : stateId)
  }

  /**
   * Changes a layer inside an instance, as the editor does: in a state, the state's patch for its path; in the base
   * state, that copy's override. A text, prop or visibility the component binds sets the instance's param instead.
   */
  private updateInner(
    found: Located & { layer: string },
    input: UpdateChange,
    options: NonNullable<z.infer<typeof updateOptions>>
  ): void {
    const { path: file, container, layer } = found
    const { args, ...change } = input

    if (args) {
      change.props = { ...change.props, ...args }
    }

    const renamed = (["name", "tag", "component"] as const).find((name) => change[name] !== undefined)

    if (renamed) {
      throw new CodedError(
        "Inside an instance, only hidden, text, props, style and unset change; edit the component to change the rest",
        { code: "invalid_input", field: renamed }
      )
    }

    const library = this.library()
    const stateId = options.state === undefined ? container.states[0]!.id : findState(container, options.state).id
    const inner = locateInner(container, layer, library)!

    if (inner.node.type === "component" && change.props) {
      this.checkProps(inner.node.component, change.props, `${container.id}/${layer}`)
    }

    const next = editInner(container, stateId, layer, toChange(change), library, kept)
    const base = stateId === container.states[0]!.id
    this.setContainer(file, next, layer.split("/")[0], base ? undefined : stateId)
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the snippet API's edge: the node as a snippet passed it, which `prepareNode` checks
  private replace(path: string, input: unknown): string {
    const { path: file, container, node } = this.findNode(path)
    const location = locateNode(container.root, node.id)!
    const parent = location.ancestors.at(-1)
    const ids = nodeIds(container.root)
    const replacement = this.prepareNode(input, ids, "node")
    let next: ContainerSpec

    if (parent) {
      const withoutOld = deleteNode(container, node.id)
      const root = insertNode(withoutOld.root, parent.id, replacement, { index: location.index, slot: location.slot })
      next = { ...withoutOld, root }
    } else {
      next = {
        ...dropPatches(container, nodeIds(node)),
        root: replacement,
        states: container.states.map((state) => ({ id: state.id, name: state.name }))
      }
    }

    this.setContainer(file, next, replacement.id)
    const nodes = discardedPatches(container, node, next)

    if (nodes.length > 0) {
      this.discarded.push({ design: container.id, replaced: node.id, replacement: replacement.id, nodes })
    }

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

  private copy(path: string, parent: string, options: z.infer<typeof copyOptions> = {}): string {
    const source = this.findNode(path)
    const target = this.tryDesign(parent)
    const to = target ? { ...target, node: target.container.root } : this.findNode(parent)
    const copy = withFreshIds(structuredClone(source.node), nodeIds(to.container.root))

    if (options.name) {
      copy.name = options.name
    }

    const root = insertNode(to.container.root, to.node.id, copy, options)
    this.setContainer(to.path, { ...to.container, root }, copy.id)

    if (copy.name) {
      this.created[copy.name] = copy.id
    }

    return copy.id
  }

  private delete(path: string): void {
    const design = this.tryDesign(path)

    if (design) {
      throw new Error(`"${path}" is a design; use DeleteDesign`)
    }

    const { path: file, container, node } = this.findNode(path)

    if (node.id === container.root.id) {
      throw new Error("A design's root can't be deleted; use Replace or DeleteDesign")
    }

    this.setContainer(file, deleteNode(container, node.id), node.id)
  }

  /**
   * A viewport's patch on a node, merged over what it has key by key, where `null` takes one value away; `null` for the
   * patch takes the whole of it away.
   */
  private responsive(path: string, viewport: string, input: PatchInput | null): void {
    const viewports = new Set(
      this.modes.variables
        .filter((variable) => variable.kind === "viewport")
        .flatMap((variable) => variable.options.map((option) => option.id))
    )

    if (!viewports.has(viewport)) {
      throw unknownReference(
        "unknown_viewport",
        `No viewport "${viewport}". Viewports: ${[...viewports].join(", ")}`,
        viewport,
        [...viewports],
        "viewport"
      )
    }

    const { path: file, container, node } = this.findNode(path)

    const root = mapNode(container.root, node.id, (current) => {
      const responsive = { ...current.responsive }
      const patch = input === null ? undefined : mergePatch(responsive[viewport], input)

      if (patch) {
        responsive[viewport] = patch
      } else {
        delete responsive[viewport]
      }

      if (Object.keys(responsive).length === 0) {
        const { responsive: _emptied, ...rest } = current

        return rest
      }

      return { ...current, responsive }
    })

    this.setContainer(file, { ...container, root }, node.id)
  }

  // States ------------------------------------------------------------------------------------------------------------

  private addState(reference: string, spec: z.infer<typeof newState>): string {
    const { path, container } = this.findDesign(reference)
    const added = addState(container, spec.name)
    const next = this.applyChanges(added.container, added.id, spec.changes)
    this.setContainer(path, next, undefined, added.id)

    return added.id
  }

  private updateState(reference: string, stateId: string, spec: z.infer<typeof stateUpdate>): void {
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

  /**
   * State changes keyed by node id or name, or by a path inside an instance (`instance/inner`); `null` takes back the
   * state's change to a node.
   */
  private applyChanges(
    container: ContainerSpec,
    stateId: string,
    changes: Record<string, PatchInput | null> | undefined
  ): ContainerSpec {
    let next = container
    const library = this.library()

    for (const [reference, value] of Object.entries(changes ?? {})) {
      const path = layerPath(next, reference, library)

      if (isInnerPath(path)) {
        next =
          value === null
            ? resetInner(next, stateId, path, library)
            : editInner(next, stateId, path, toChange(value), library, kept)
        continue
      }

      if (value === null) {
        const state = findState(next, stateId)
        const overrides = { ...state.overrides }
        delete overrides[path]
        next = withStateOverrides(next, stateId, overrides)
        continue
      }

      next = editNode(next, stateId, path, toChange(value), kept)
    }

    return next
  }

  // Modes and tokens --------------------------------------------------------------------------------------------------

  private setModes(settings: ModeSettings): void {
    this.modes = structuredClone(settings)
    this.modesChanged = true
  }

  /**
   * Sets token values, refusing any the token detail would: a bracket or quote left open, a reference to no token, or
   * a token built on itself. Nothing in the call is kept when one is refused. Whether each value is its kind's (a color
   * a color) needs the browser, so `checkTokenKinds` asks once the snippet has finished, before anything is applied.
   */
  private setTokens(values: z.infer<typeof tokenValues>): void {
    const changes: TokenChange[] = []

    for (const [rawName, value] of Object.entries(values)) {
      const name = rawName.replace(/^--/, "")

      for (const [theme, themed] of Object.entries(value)) {
        changes.push({ name, theme, value: themed.trim() })
      }
    }

    // Checked with the whole call's values in, so one token may refer to another set beside it.
    const reading = this.tokenReading([...this.tokenChanges, ...changes])

    for (const change of changes) {
      const problem = reading.problem(change, () => true)

      if (problem) {
        throw refusedToken(change, problem)
      }
    }

    this.tokenChanges.push(...changes)
  }

  /**
   * Refuses the call when a value it sets isn't its token's kind, as the token detail does, asking `hooks.supports`
   * (the browser's `CSS.supports`) about every value at once. Without the hook, kinds aren't checked.
   */
  async checkTokenKinds(): Promise<void> {
    const hooks = this.hooks

    if (!hooks.supports || this.tokenChanges.length === 0) {
      return
    }

    const latest = new Map(this.tokenChanges.map((change) => [`${change.name} ${change.theme}`, change]))
    const reading = this.tokenReading(this.tokenChanges)
    const asked: { property: string; value: string }[] = []

    for (const change of latest.values()) {
      reading.problem(change, (property, value) => {
        asked.push({ property, value })

        return true
      })
    }

    if (asked.length === 0) {
      return
    }

    const answers = await hooks.supports(asked)
    const known = new Map(asked.map((query, index) => [`${query.property}\n${query.value}`, answers[index] ?? false]))

    for (const change of latest.values()) {
      const problem = reading.problem(change, (property, value) => known.get(`${property}\n${value}`) ?? true)

      if (problem) {
        throw refusedToken(change, problem)
      }
    }
  }

  /**
   * The project's tokens with the canvas's unsaved values and `changes` laid over them, and the token detail's checks
   * on a change against them. A token comes to its value with every reference filled in; a step of a scale to its
   * base times its factor. A token the project doesn't have yet takes its kind from its name and value.
   */
  private tokenReading(changes: readonly TokenChange[]) {
    const tokens = new Map(this.snapshot.tokens.map((token) => [token.name, { ...token, values: { ...token.values } }]))

    for (const change of [...this.snapshot.tokenOverrides, ...changes]) {
      const token = tokens.get(change.name)

      if (token) {
        token.values[change.theme] = change.value
      } else {
        tokens.set(change.name, {
          name: change.name,
          category: categorize(change.name, change.value),
          source: "semantic",
          values: { [change.theme]: change.value }
        })
      }
    }

    const comesTo = (name: string, theme: string, depth = 0): string | undefined => {
      const token = tokens.get(name)

      if (!token) {
        return undefined
      }

      const value = token.values[theme] ?? token.values.default ?? Object.values(token.values)[0] ?? ""

      if (depth > 8) {
        return value
      }

      if (token.derived) {
        const base = comesTo(token.derived.from, theme, depth + 1)

        if (base !== undefined) {
          return `calc(${base} * ${token.derived.factor})`
        }
      }

      return substituteReferences(value, (reference) => comesTo(reference, theme, depth + 1))
    }

    const lookup = (name: string, theme = "default") => comesTo(name, theme)

    // A token's kind comes from what the project has, not what the call types, as the detail's does.
    const kindOf = (name: string) => {
      const known = this.snapshot.tokens.find((token) => token.name === name) ?? tokens.get(name)!

      return previewKind(known, undefined, lookup)
    }

    return {
      problem: (change: TokenChange, supports: CssSupports) =>
        checkTokenEdit({
          name: change.name,
          kind: kindOf(change.name),
          values: {},
          drafts: { [change.theme]: change.value },
          lookup: comesTo,
          references: (name, theme) => builtOn(tokens.get(name), theme),
          supports
        }).problems[change.theme]
    }
  }

  // Rendering ---------------------------------------------------------------------------------------------------------

  private frameMode(modeId: string | undefined): ResolvedMode {
    const modes = resolveModes(this.modes)

    if (!modeId) {
      return modes[0]!
    }

    const mode = modes.find((candidate) => candidate.id === modeId)

    if (!mode) {
      const ids = modes.map((candidate) => candidate.id)
      throw unknownReference("unknown_mode", `No mode "${modeId}". Modes: ${ids.join(", ")}`, modeId, ids, "mode")
    }

    return mode
  }

  /** The mode a design is drawn in: the one named, else its main one. A frame is drawn only in the primary mode. */
  private designMode(container: ContainerSpec, modeId: string | undefined): ResolvedMode {
    const main = shownModes(this.modes, container).main

    if (!modeId) {
      return main
    }

    const mode = this.frameMode(modeId)

    if (container.kind === "frame" && mode.id !== main.id) {
      throw new CodedError(`${container.name} is a frame, drawn only in the primary mode, ${main.id}.`, {
        code: "invalid_input",
        field: "mode",
        alternatives: [main.id]
      })
    }

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
    const viewportMode = this.designMode(container, options.mode)
    // The frame and its window as the canvas draws them, so a frame measured or captured here matches the live one.
    const size = frameGeometry(container, viewportMode)
    const mode = { ...viewportMode, width: size.width }
    const designKey = key(path, container.id)
    this.emit({ kind: look, design: designKey, state: state.id, mode: mode.id })
    this.flush()

    const tree = resolveDesign(boardRoot(container), state, mode.viewport, this.library(), {
      params: container.params,
      choices: container.view?.variants
    })

    const drawn = {
      design: designKey,
      state: state.id,
      tree,
      mode,
      height: size.height,
      viewport: size.viewport,
      scale,
      capture: look === "screenshot"
    }

    const request =
      look === "accessibility"
        ? { ...drawn, audit: true, colorTokens: this.colorTokens().map((token) => token.name) }
        : drawn

    const frame = await this.hooks.render({ ...request, tokens: this.tokenValues() })

    return { container, state, mode, frame }
  }

  private async measure(reference: string, options: MatrixOptions = {}) {
    const one = this.oneFrame(this.findDesign(reference).container, options)
    const { container, state, mode, frame } = await this.render(reference, one, "measure")

    if (frame.error) {
      throw new Error(`The frame failed to render: ${frame.error}`)
    }

    const names = nodeNames(container, this.designName)

    return {
      state: state.id,
      mode: mode.id,
      width: frame.width,
      height: frame.height,
      overflowsX: frame.overflowsX,
      nodes: frame.nodes.map((node) => ({ ...node, name: names.get(node.id) }))
    }
  }

  /**
   * Measure draws one frame, so a list, "all" or "shown" (which the checks take) fails before anything renders, saying
   * so and naming the ids it does take.
   */
  private oneFrame(container: ContainerSpec, options: NonNullable<MatrixOptions>): FrameOptions {
    const shown = shownModes(this.modes, container)

    const choices = {
      state: {
        ids: container.states.map((state) => state.id),
        listed: `States in ${container.name}: ${container.states.map((state) => `${state.id} (${state.name})`).join(", ")}.`,
        matrix: 'a list or "all"'
      },
      mode: {
        ids: container.kind === "frame" ? [shown.main.id] : shown.all.map((mode) => mode.id),
        listed:
          container.kind === "frame"
            ? `${container.name} is a frame, drawn only in the primary mode, ${shown.main.id}.`
            : `Modes: ${shown.all.map((mode) => mode.id).join(", ")}.`,
        matrix: 'a list, "shown" or "all"'
      }
    }

    const one: FrameOptions = {}

    for (const field of ["state", "mode"] as const) {
      const value = options[field]

      if (value === undefined) {
        continue
      }

      if (!Array.isArray(value) && value !== "all" && !(field === "mode" && value === "shown")) {
        one[field] = value
        continue
      }

      const given = Array.isArray(value) ? "a list" : JSON.stringify(value)
      const { ids, listed, matrix: takes } = choices[field]
      throw new CodedError(
        `Measure lays out one frame, so ${field} takes one ${field} id, not ${given}. To compare ${field}s, call ` +
          `Measure once for each; Problems, Screenshot and Accessibility take ${takes}. ${listed}`,
        { code: "invalid_input", field, alternatives: ids.slice(0, alternativeLimit) }
      )
    }

    return one
  }

  private async problems(reference: string, options: MatrixOptions = {}): Promise<Problem[]> {
    const { container } = this.findDesign(reference)
    const found: Problem[] = []

    for (const state of this.statesFor(container, options.state)) {
      for (const mode of this.modesFor(container, options.mode)) {
        const { frame } = await this.render(reference, { state: state.id, mode: mode.id }, "problems")
        found.push(...frameProblems(container, state, mode, frame, this.designName))
      }
    }

    return found
  }

  private async screenshot(reference: string, options: z.infer<typeof screenshotOptions> = {}): Promise<number> {
    const { container } = this.findDesign(reference)
    const scale = Math.min(Math.max(options.scale ?? 1, 0.25), 3)
    let count = 0

    for (const state of this.statesFor(container, options.state)) {
      for (const mode of this.modesFor(container, options.mode)) {
        const { frame } = await this.render(reference, { state: state.id, mode: mode.id }, "screenshot", scale)

        if (frame.error) {
          this.warn(
            "render_failed",
            `failed to render: ${frame.error}`,
            `${container.name} (${state.name}, ${mode.name})`
          )
        }

        if (!frame.png) {
          continue
        }

        this.screenshots.push({
          design: container.id,
          state: state.id,
          mode: mode.id,
          width: frame.width,
          height: frame.height,
          png: frame.png,
          nodes: frame.nodes
        })
        count++
      }
    }

    return count
  }

  private colorTokens() {
    return this.snapshot.tokens.filter((token) => token.category === "color")
  }

  /**
   * What axe-core finds in each frame, one finding per node, in the frame's own size and at 1x. Automated checks catch
   * only some issues, so an empty list isn't a pass. Each contrast failure carries its fix from the project's tokens.
   */
  private async accessibility(reference: string, options: MatrixOptions = {}): Promise<AccessibilityFinding[]> {
    const { container } = this.findDesign(reference)
    const names = nodeNames(container, this.designName)
    const found: AccessibilityFinding[] = []
    const contrast: FrameContrast[] = []
    // Each contrast failure on a layer of this design, with what its frame measured.
    const inFrame = new Map<AccessibilityFinding, FrameContrast>()

    for (const state of this.statesFor(container, options.state)) {
      for (const mode of this.modesFor(container, options.mode)) {
        const { frame } = await this.render(reference, { state: state.id, mode: mode.id }, "accessibility")

        if (frame.error) {
          this.warn(
            "render_failed",
            `failed to render: ${frame.error}`,
            `${container.name} (${state.name}, ${mode.name})`
          )
          continue
        }

        if (frame.contrast) {
          contrast.push(frame.contrast)
        }

        const read = accessibilityFindings(names, state, mode, frame)
        found.push(...read.found)

        for (const [finding, measured] of read.contrast) {
          inFrame.set(finding, measured)
        }
      }
    }

    const preferred = new Set(
      this.colorTokens()
        .filter((token) => token.source === "semantic")
        .map((token) => token.name)
    )

    addContrastFixes(container, inFrame, contrast, preferred)

    return found
  }

  private statesFor(container: ContainerSpec, option: string | string[] | undefined): StateSpec[] {
    if (option === "all") {
      return container.states
    }

    const ids = option === undefined ? [container.view?.state ?? container.states[0]!.id] : [option].flat()

    return ids.map((id) => findState(container, id))
  }

  private modesFor(container: ContainerSpec, option: string | string[] | undefined): ResolvedMode[] {
    const shown = shownModes(this.modes, container)

    // Every mode a frame can be drawn in is its one.
    if (option === "all") {
      return container.kind === "frame" ? [shown.main] : shown.all
    }

    if (option === "shown") {
      return [shown.main, ...shown.beside]
    }

    const ids = option === undefined ? [shown.main.id] : [option].flat()

    return ids.map((id) => this.designMode(container, id))
  }

  /** Every design's board on the canvas: where this call leaves it, as big as it was last drawn or estimated. */
  private boards(): Board[] {
    return canvasBoards(this.all(), this.snapshot.bounds, this.modes)
  }

  /** Boards that overlap, each pair once; only those involving one design when it's given. */
  private overlaps(reference?: string): Overlap[] {
    return boardOverlaps(this.boards(), reference === undefined ? undefined : this.findDesign(reference).container.id)
  }

  /** Notes a finding for the result, with the node or frame it's about kept apart from what to do. */
  private warn(category: WarningCategory, message: string, at?: string): void {
    this.found.push(at === undefined ? { category, message } : { category, message, at })
  }

  /**
   * Places a screen main found lately beside a design, as a reference to look at (PAR-840): after the last one this call
   * placed beside it, or in a new row under any already there. It names the agent that placed it, with its note.
   */
  private async placeReference(id: string, options: z.infer<typeof referenceOptions>): Promise<string> {
    const screen = await this.hooks.screen?.(id, options.connector)

    if (!screen) {
      throw new CodedError(
        `Parity hasn't found the screen ${id} lately. Search with find_references, then place one of its screens by id.`,
        { code: "invalid_input", field: "id" }
      )
    }

    const near = options.near ?? this.snapshot.selection.design

    if (near === undefined) {
      throw new CodedError('Name the design the reference is for: PlaceReference(id, { near: "pricing" }).', {
        code: "invalid_input",
        field: "options/near"
      })
    }

    const { path, container } = this.findDesign(near)
    const document = this.documents.get(path)!
    const all = [...this.documents.values()].flatMap((each) => each.references ?? [])
    const designKey = key(path, container.id)
    const previous = this.lastReference.get(designKey)

    const boxes = this.boards().map(boardBox)
    const beside = boxes.find((box) => box.key === designKey)
    let anchor: ReferenceAnchor = beside ? { beside } : { around: container.position }

    if (previous) {
      anchor = { after: previous }
    }

    const [position] = referenceRow(anchor, [referenceSize(screen)], all.map(referenceBounds), boxes)

    const taken = new Set(all.map((each) => each.id))
    const origin = { by: this.hooks.caller, note: options.note, design: container.id }
    const reference = referenceFrom(screen, generateId(taken), position!, origin)

    this.documents.set(path, { ...document, references: [...(document.references ?? []), reference] })
    this.references.push({ path, reference })
    this.lastReference.set(designKey, referenceBounds(reference))

    return reference.id
  }

  /**
   * The references on the canvas (PAR-889), each with the design it's for: the one it was placed for while that design
   * is still there, or else the one it sits beside, within `nearbyGap` of its board. Only one design's when `reference`
   * names it.
   */
  private listReferences(reference?: string): PlacedReference[] {
    const only = reference === undefined ? undefined : this.findDesign(reference)
    const documents = [...this.documents].filter(([, document]) => (document.references ?? []).length > 0)

    // Most projects have none, and get_app_state asks on every call, so the boards aren't worked out for nothing.
    if (documents.length === 0) {
      return []
    }

    const boxes = this.boards().map(boardBox)
    const now = Date.now()

    return documents.flatMap(([path, document]) =>
      (document.references ?? []).flatMap((each) => {
        const placedFor = each.design && boxes.find((box) => box.key === key(path, each.design!))
        const design = placedFor || nearestBox(referenceBounds(each), boxes, nearbyGap)

        if (only && design?.key !== key(only.path, only.container.id)) {
          return []
        }

        return [placedReference(each, design, now)]
      })
    )
  }

  private findEmptySpace(options: SpaceOptions): CanvasPoint {
    const boards = this.boards()
    const near = options.near === undefined ? undefined : this.findDesign(options.near).container.id

    return emptySpace(
      boards,
      options,
      boards.find((board) => board.id === near)
    )
  }

  private findRepeats(reference: string) {
    const { path, container } = this.findDesign(reference)
    this.emit({ kind: "read", design: key(path, container.id) })

    return findRepeats(container.root)
  }

  private extractComponent(
    reference: string,
    nodes: string | string[],
    options: z.infer<typeof extractOptions>
  ): string {
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
    this.output.push(values.map((value) => printedText.safeParse(value).data ?? JSON.stringify(value)).join(" "))
  }

  // Helpers -----------------------------------------------------------------------------------------------------------

  /**
   * Checks an agent's node as a node tree, once it and everything in it have fresh ids, and records the names it
   * created. `name` is the parameter it came in, which starts the field of an error in it.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the snippet API's edge: a node as a snippet passed it, checked here
  private prepareNode(input: unknown, taken: Set<string>, name: string): DesignNode {
    const node = readArgument(nodeTree, withNewIds(input, taken), name)
    const library = this.library()
    walkNodes(node, (each) => {
      if (each.name !== undefined) {
        this.created[each.name] = each.id
      }

      if (each.type === "instance" && each.overrides) {
        each.overrides = overridesById(each, library)
      }

      this.inserted.add(each.id)
    })

    return node
  }

  private findDesign(reference: string): Located {
    const found = this.tryDesign(reference)

    if (!found) {
      const all = this.all()
      throw unknownReference(
        "unknown_design",
        `No design "${reference}". Designs: ${
          all.map(({ container }) => `${container.id} (${container.name})`).join(", ") || "none"
        }`,
        reference,
        all.map(({ container }) => container.id),
        "design"
      )
    }

    return found
  }

  /** Where a walk of `reference` starts: a design's root, or the node it names. */
  private walkFrom(reference: string): Located & { start: DesignNode } {
    const design = this.tryDesign(reference)

    if (design) {
      return fromRoot(design)
    }

    const { node, ...found } = this.findNode(reference)

    return { ...found, start: node }
  }

  private tryDesign(reference: string): Located | undefined {
    const all = this.all()

    return (
      all.find(({ path, container }) => key(path, container.id) === reference) ??
      all.find(({ container }) => container.id === reference) ??
      all.find(({ container }) => container.name === reference)
    )
  }

  /**
   * A node by `designId/nodeId`, with the file and id of the design it's in, or nothing when the reference names none,
   * for a caller that checks a node before changing it, as placing a picture does.
   */
  locate(reference: string): { node: DesignNode; design: { path: string; id: string } } | undefined {
    try {
      const { node, path, container } = this.findNode(reference)

      return { node, design: { path, id: container.id } }
    } catch {
      return undefined
    }
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

    if (matches.length === 1) {
      return matches[0]!
    }

    if (matches.length > 1) {
      throw new CodedError(
        `"${reference}" is in ${matches.map((match) => match.container.id).join(" and ")}; write it as design/node, e.g. "${matches[0]!.container.id}/${reference}"`,
        {
          code: "ambiguous_reference",
          alternatives: closest(
            reference,
            matches.map((match) => `${match.container.id}/${reference}`)
          )
        }
      )
    }

    throw new CodedError(`No node "${reference}". Paths are a node id, or design/node.`, { code: "unknown_node" })
  }

  private setContainer(path: string, container: ContainerSpec, node?: string, state?: string, show = true): void {
    const document = this.documents.get(path)!
    this.documents.set(path, {
      ...document,
      containers: document.containers.map((candidate) => (candidate.id === container.id ? container : candidate))
    })
    this.changed.add(path)

    if (!show) {
      return
    }

    const event: AgentEvent = { kind: "write", design: key(path, container.id) }

    if (node) {
      event.node = node
    }

    if (state) {
      event.state = state
    }

    this.emit(event)
  }

  /**
   * A component's props as inferred from its source: variants with their options, own props, and (with `all`) the
   * attributes it passes through to its element. With them, its composition: the parents it needs, the parts it holds,
   * its slots, and an example `Insert` takes as it is.
   */
  private componentProps(component: string, options: z.infer<typeof propsOptions> = {}) {
    if (!this.snapshot.components.includes(component)) {
      throw unknownReference(
        "unknown_component",
        `"${component}" isn't one of the project's components. Check Components().`,
        component,
        this.snapshot.components,
        "component"
      )
    }

    const known: CompositionSources = { sources: this.snapshot.sources ?? {}, props: this.snapshot.props }

    if (this.snapshot.renderStatus) {
      known.renderStatus = this.snapshot.renderStatus
    }

    const { component: _component, ...composition } = componentComposition(component, known)

    const info = this.snapshot.props[component]

    if (!info) {
      return { component, known: false, props: [], composition }
    }

    const props = info.props.filter(
      (prop) => options.all || ((prop.group === "variant" || prop.group === "own") && prop.kind !== "function")
    )

    const where = info.import ? { component, path: info.path, import: info.import } : { component, path: info.path }

    return { ...where, known: true, props, composition }
  }

  /** One of the project's icon sets' icons, read from the project's own copy of the set. */
  private async icons(id: string, options: IconOptions = {}): Promise<IconMatch[]> {
    const sets = this.snapshot.iconSets ?? []
    const set = sets.find((candidate) => candidate.id === id)

    if (!set) {
      throw unknownReference(
        "unknown_icon_set",
        sets.length > 0
          ? `"${id}" isn't one of the project's icon sets: ${sets.map((candidate) => candidate.id).join(", ")}`
          : "The project has no icon sets",
        id,
        sets.map((candidate) => candidate.id)
      )
    }

    if (!this.hooks.iconNames) {
      throw new Error("Icon names can't be read here")
    }

    const style = iconStyle(set, options.style)

    return findIcons(set, await this.hooks.iconNames(set.id, styleModule(set, style)), style, options)
  }

  /** Props a component doesn't declare, and values outside a prop's options. */
  private checkProps(component: string, props: PropValues | undefined, where: string): void {
    this.found.push(...propWarnings(this.snapshot.props[component], component, props, where))
  }

  /** Warnings for things in a document that are valid but probably not what was meant. */
  private lint(document: CanvasDocument): Warning[] {
    return lintDocument(document, {
      components: this.snapshot.components,
      tokens: this.snapshot.tokens,
      iconSets: this.snapshot.iconSets,
      library: this.library(),
      props: this.snapshot.props,
      inserted: this.inserted
    })
  }
}

interface FrameOptions {
  state?: string
  mode?: string
}

/** Where `Get` is in its walk, as a visit function is told. */
interface VisitContext {
  design: string
  path: string
  depth: number
  index: number
  parent?: string
  skipChildren(): void
}

// oxlint-disable-next-line anti-slop/no-unknown-returns -- a snippet's visit function returns whatever it likes, which `Get` hands back
type Visit = (node: DesignNode, context: VisitContext) => unknown

/** A function a snippet passed `Get` to call for every node. */
// oxlint-disable-next-line anti-slop/no-runtime-typeof -- the snippet runs in its own vm context, whose functions aren't instances of this one's `Function`
const visitFunction = z.custom<Visit>((value) => typeof value === "function")

/**
 * How far from a design's board, in canvas pixels, a reference that doesn't say which design it's for can sit and still
 * be read as for it: a web reference's width and the gap before it, so the first of a row placed beside a design counts.
 */
const nearbyGap = 1600

/** A board's box on the canvas, with its key, the file it's in, its id and name. */
function boardBox(board: Board): Bounds & Pick<Board, "key" | "id" | "name"> & { file: string } {
  return {
    key: board.key,
    // A key is the file and the id, joined by `#`.
    file: board.key.slice(0, board.key.length - board.id.length - 1),
    id: board.id,
    name: board.name,
    minX: board.x,
    minY: board.y,
    maxX: board.x + board.width,
    maxY: board.y + board.height
  }
}

/** A reference as an agent reads it, for `design`, with what's unset left out. */
function placedReference(
  reference: ReferenceSpec,
  design: { id: string; name: string; file: string } | undefined,
  now: number
): PlacedReference {
  const placed: PlacedReference = {
    id: reference.id,
    app: reference.app,
    link: reference.link,
    picture: reference.image.url
  }

  if (reference.platform) {
    placed.platform = reference.platform
  }

  if (referenceExpired(reference, now)) {
    placed.expired = true
  }

  for (const field of ["query", "note", "by"] as const) {
    const value = reference[field]

    if (value) {
      placed[field] = value
    }
  }

  if (design) {
    placed.design = { id: design.id, name: design.name, file: design.file }
  }

  return placed
}

function key(path: string, id: string): string {
  return `${path}#${id}`
}

/**
 * A layer's path, the way the canvas names it, from a reference: one of the design's own layers by id or name, or one
 * inside an instance by the instance, then the layer in its component, each by id or name (`Person/title`).
 */
function layerPath(container: ContainerSpec, reference: string, library: ComponentLibrary): string {
  const [first = "", ...inner] = reference.split("/")
  const node = resolveInDesign(container, first)

  return innerIds(node, inner, library, [node.id], container.id).join("/")
}

/**
 * The path to the layers `steps` name inside an instance, each by id or name, through nested instances, after `ids`,
 * the path to `node` in the design `where`.
 */
function innerIds(
  node: DesignNode,
  steps: readonly string[],
  library: ComponentLibrary,
  ids: readonly string[],
  where: string
): string[] {
  let holder = node
  const path = [...ids]

  for (const step of steps) {
    const component = holder.type === "instance" ? library.get(holder.design) : undefined

    if (!component) {
      throw new CodedError(
        holder.type === "instance"
          ? `${path.join("/")} in ${where} is an instance of ${holder.design}, which isn't in the project`
          : `${path.join("/")} in ${where} isn't an instance, so nothing is inside it`,
        { code: "unknown_node", field: "path" }
      )
    }

    holder = resolveInDesign(component, step)
    path.push(holder.id)
  }

  return path
}

/**
 * An instance's overrides keyed by the ids of the layers they change, `inner` or `nested/inner`, from keys that name
 * each step by id or name (PAR-887). An instance of a design the project doesn't have keeps its keys.
 */
function overridesById(instance: InstanceNode, library: ComponentLibrary): Record<string, NodePatch> {
  const overrides = instance.overrides ?? {}

  if (!library.get(instance.design)) {
    return overrides
  }

  return Object.fromEntries(
    Object.entries(overrides).map(([key, patch]) => [
      innerIds(instance, key.split("/"), library, [], instance.design).join("/"),
      patch
    ])
  )
}

function resolveInDesign(container: ContainerSpec, reference: string): DesignNode {
  const byId = locateNode(container.root, reference)?.node

  if (byId) {
    return byId
  }

  const byName: DesignNode[] = []

  const visit = (node: DesignNode) => {
    if (node.name === reference) {
      byName.push(node)
    }

    for (const entry of childEntries(node)) {
      entry.nodes.forEach(visit)
    }
  }

  visit(container.root)

  if (byName.length === 1) {
    return byName[0]!
  }

  if (byName.length > 1) {
    throw new CodedError(`${byName.length} layers in ${container.id} are named "${reference}"; use an id`, {
      code: "ambiguous_reference",
      alternatives: closest(
        reference,
        byName.map((node) => `${container.id}/${node.id}`)
      )
    })
  }

  throw new CodedError(`No layer "${reference}" in ${container.id}`, { code: "unknown_node" })
}

/** Whether a read asks for what the board draws rather than the stored nodes. */
function shownRead(options: NonNullable<GetOptions>): boolean {
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

/** A node as `Get` gives it to a depth: past the depth, a layout's children and a component's slots are `["…"]`. */
type ElidedNode = Omit<DesignNode, "children" | "slots"> & {
  children?: (ElidedNode | "…")[]
  slots?: Record<string, (ElidedNode | "…")[]>
}

function elide(node: DesignNode, depth: number | undefined, level = 0): ElidedNode {
  if (depth === undefined) {
    return node
  }

  const copy: ElidedNode = { ...node }

  if (node.type === "layout") {
    if (level < depth) {
      copy.children = node.children.map((child) => elide(child, depth, level + 1))
    } else {
      copy.children = node.children.length > 0 ? ["…"] : []
    }
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

/**
 * How an agent's changes are written into a state's patch or an instance's override: every value it names is kept, even
 * one equal to what's under it, so the state goes on showing it when the base changes (PAR-882).
 */
const kept = { keepEqual: true } as const

/** A patch as `editNode` takes it, where `undefined` takes away what `null` did. */
function toChange(change: PatchInput): NodeChange {
  const result: NodeChange = {}

  if (change.hidden !== undefined) {
    result.hidden = change.hidden ?? undefined
  }

  if (change.text !== undefined) {
    result.text = change.text ?? undefined
  }

  if (change.props) {
    result.props = nullsToUndefined(change.props)
  }

  if (change.style) {
    result.style = nullsToUndefined(change.style)
  }

  if (change.unset) {
    result.unset = change.unset
  }

  return result
}

function nullsToUndefined<T extends object>(values: T): { [K in keyof T]: Exclude<T[K], null> | undefined } {
  // SAFETY: the entries are `values`' own with each `null` made `undefined`; `Object.fromEntries` only knows it has
  // string keys.
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, value === null ? undefined : value])
  ) as { [K in keyof T]: Exclude<T[K], null> | undefined }
}

/**
 * A viewport's patch with `input` merged over it: `hidden` and `text` replaced, props and style key by key, and the
 * keys `unset` lists added to what it takes away. `null` takes a value away, or everything `unset` held. A key is never
 * both set and taken away, so the later call wins. A patch left with nothing is no patch.
 */
function mergePatch(current: NodePatch | undefined, input: PatchInput): NodePatch | undefined {
  const next: NodePatch = { ...current }

  if (input.hidden !== undefined) {
    next.hidden = input.hidden ?? undefined
  }

  if (input.text !== undefined) {
    next.text = input.text ?? undefined
  }

  const unset = input.unset === null ? undefined : current?.unset
  next.props = mergeKeys(current?.props, input.props, input.unset?.props)
  next.style = mergeKeys(current?.style, input.style, input.unset?.style)

  next.unset = {
    props: takenKeys(unset?.props, Object.keys(input.props ?? {}), input.unset?.props),
    style: takenKeys(unset?.style, Object.keys(input.style ?? {}), input.unset?.style)
  }

  const tidied = tidyPatch(next)

  return Object.keys(tidied).length > 0 ? tidied : undefined
}

/** Values with `input`'s merged over them, where `null` takes one away, less the keys `taken` lists. */
function mergeKeys<T extends object>(
  current: T | undefined,
  input: { [K in keyof T]?: T[K] | null } | undefined,
  taken: readonly string[] | undefined
): T {
  const merged = Object.entries({ ...current, ...input })

  // SAFETY: every entry is one of `current`'s or `input`'s, less the `null` ones, so each key holds its own type;
  // `Object.fromEntries` only knows it has string keys.
  return Object.fromEntries(merged.filter(([key, value]) => value !== null && !taken?.includes(key))) as T
}

/** The keys a patch takes away: those it did, less the ones `given` now sets, plus those `added` lists. */
function takenKeys<K extends string>(
  kept: readonly K[] | undefined,
  given: readonly string[],
  added: readonly K[] | undefined
): K[] {
  return [...new Set([...(kept ?? []).filter((key) => !given.includes(key)), ...(added ?? [])])]
}

/**
 * A node an agent gave, with a fresh id on it and on every node in its children and slots. A slot holding one node
 * holds a list of it, and a layout without children holds none. Anything that isn't an object is left for the check.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- the snippet API's edge: a node as a snippet passed it, before `prepareNode` checks it
function withNewIds(value: unknown, taken: Set<string>): unknown {
  const node = plainObject.safeParse(value).data

  return node ? objectWithNewIds(node, taken) : value
}

/** An object an agent gave as a node, with fresh ids on it and on the nodes inside it, as `withNewIds` gives it. */
function objectWithNewIds(node: z.infer<typeof plainObject>, taken: Set<string>): z.infer<typeof plainObject> {
  const id = generateId(taken)
  taken.add(id)
  const copy: z.infer<typeof plainObject> = { ...node, id }

  if (Array.isArray(copy.children)) {
    copy.children = copy.children.map((child) => withNewIds(child, taken))
  }

  const slots = plainObject.safeParse(copy.slots).data

  if (slots) {
    copy.slots = Object.fromEntries(
      Object.entries(slots).map(([slot, children]) => [
        slot,
        (Array.isArray(children) ? children : [children]).map((child) => withNewIds(child, taken))
      ])
    )
  }

  if (copy.type === "layout" && copy.children === undefined) {
    copy.children = []
  }

  return copy
}

/** A design, with its root to start a walk from. */
function fromRoot(located: Located): Located & { start: DesignNode } {
  return { ...located, start: located.container.root }
}

/** The design with one state's overrides replaced. */
function withStateOverrides(
  container: ContainerSpec,
  stateId: string,
  overrides: Record<string, NodePatch>
): ContainerSpec {
  return {
    ...container,
    states: container.states.map((candidate) =>
      candidate.id === stateId ? withOverrides(candidate, overrides) : candidate
    )
  }
}

function withOverrides(state: StateSpec, overrides: Record<string, NodePatch>): StateSpec {
  return Object.keys(overrides).length > 0
    ? { id: state.id, name: state.name, overrides }
    : { id: state.id, name: state.name }
}

/** A token value refused as the token detail refuses it, naming the token, its theme and the problem. */
function refusedToken(change: TokenChange, problem: string): CodedError {
  const field = `SetTokens/${change.name}/${change.theme}`

  return new CodedError(`${field}: ${problem}`, { code: "invalid_input", field })
}

/**
 * A frame's size from the `width` and `height` a call gives, over the size it has; none when it gives neither. Only a
 * frame takes them, since screens and components size their frames per viewport.
 */
function frameSizeInput(
  input: { width?: number; height?: number },
  kind: ContainerKind,
  name: string,
  current: FrameSize = {}
): FrameSize | undefined {
  const given = (["width", "height"] as const).filter((side) => input[side] !== undefined)

  if (given.length === 0) {
    return undefined
  }

  if (kind !== "frame") {
    throw new CodedError(`${name} is a ${kind}; only a frame takes a width and height.`, {
      code: "invalid_input",
      field: given[0]
    })
  }

  const size: FrameSize = { ...current }

  for (const side of given) {
    size[side] = input[side]
  }

  return size
}

/** What becoming a frame left behind, in a sentence for each kind of thing, or none when nothing went. */
function describeDropped(dropped: DroppedParts): string | undefined {
  const lines = [
    ["States", dropped.states.map((state) => state.name)],
    ["Modes", dropped.modes],
    ["Params", dropped.params],
    ["Variants", dropped.variants]
  ] as const

  const said = lines.flatMap(([what, names]) => (names.length > 0 ? [`${what} dropped: ${names.join(", ")}.`] : []))

  return said.length > 0 ? said.join(" ") : undefined
}

/**
 * Sets an image's picture or a video's footage, its description and its credit from an Update, where `null` takes the
 * description or credit away.
 */
function pictured(image: ImageNode | VideoNode, change: UpdateChange): void {
  if (change.src !== undefined) {
    image.src = change.src
  }

  if (change.alt === null) {
    delete image.alt
  } else if (change.alt !== undefined) {
    image.alt = change.alt
  }

  if (change.credit === null) {
    delete image.credit
  } else if (change.credit !== undefined) {
    image.credit = change.credit
  }
}
