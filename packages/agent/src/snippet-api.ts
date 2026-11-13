import type {
  ComponentProp,
  RepeatCandidate,
  ContainerSpec,
  DesignModes,
  DesignNode,
  ModeSettings,
  ModesReport
} from "@parity-app/core"
import type { ComponentComposition } from "@parity-app/editor"
import type { z } from "zod"
import type {
  copyOptions,
  DesignInput,
  DesignUpdate,
  documentPlacement,
  extractNodes,
  extractOptions,
  GetOptions,
  iconOptions,
  MatrixOptions,
  newState,
  ParamInput,
  ParamUpdate,
  PatchInput,
  PlaceOptions,
  propsOptions,
  referenceOptions,
  screenshotOptions,
  spaceOptions,
  stateUpdate,
  tokenFilter,
  tokenValues,
  UpdateChange,
  updateOptions
} from "./arguments.ts"
import type { CanvasPoint, Overlap } from "./boards.ts"
import type { IconMatch, IconSetSummary } from "./icons.ts"
import type { AccessibilityFinding, NodeLayout, PlacedReference, Problem } from "./types.ts"

/**
 * The functions an `execute` snippet calls, as globals. This interface is the snippet API's single source of truth:
 * `Workspace.api()` implements it, and `packages/cli/skills/reference.md` is generated from it and the types it names
 * (PAR-958). Give every function and every field a doc comment, since the reference shows them to agents.
 */
export interface SnippetApi {
  /**
   * Every design: its id, name, kind, file, place on the canvas, states and what its board shows.
   * @category Reading
   */
  Designs: () => DesignSummary[]

  /**
   * A whole design, as the document format in document.md describes it.
   * @category Reading
   */
  GetDesign: (design: string) => ContainerSpec

  /**
   * Reads a node, or walks nodes collecting what a function returns.
   * @category Reading
   */
  Get: {
    /**
     * A design's root or a node. `depth` cuts children off with `"…"`; `state` (a component's) and `mode` read it as
     * that frame draws it.
     */
    (path: string, options?: GetOptions): ReadNode
    /**
     * Walks the nodes under `path` and returns what `visit` returns for each, leaving out `undefined`. Given `state` or
     * `mode`, it walks the nodes as that frame draws them.
     */
    (path: string, visit: Visit, options?: GetOptions): unknown[]
    /** Walks every design's nodes and returns what `visit` returns for each, leaving out `undefined`. */
    (visit: Visit): unknown[]
  }

  /**
   * The components designs can use, sorted.
   * @category Reading
   */
  Components: () => string[]

  /**
   * A component's props, read from its source, and what it needs around it and holds. `all` adds the props it passes
   * through to its element.
   * @category Reading
   */
  Props: (component: string, options?: PropsOptions) => PropsInfo

  /**
   * The project's icon sets, or one set's icons.
   * @category Reading
   */
  Icons: {
    /** The project's icon sets, with their styles. */
    (): IconSetSummary[]
    /** A set's icons, as component nodes name them. */
    (set: string, options?: IconOptions): Promise<IconMatch[]>
  }

  /**
   * The project's tokens, filtered. Given `nearest`, only those it compares with, nearest first.
   * @category Reading
   */
  GetTokens: (filter?: TokenFilterOptions) => Token[]

  /**
   * The modes as set and resolved, with what each design's board shows. Naming a design gives just that one, with each
   * of its frames' sizes.
   * @category Reading
   */
  GetModes: (design?: string) => ModesInfo

  /**
   * What the person has selected on the canvas.
   * @category Reading
   */
  Selection: () => Selected

  /**
   * Makes a design and returns its id.
   * @category Designs
   */
  CreateDesign: (spec: DesignInput) => string

  /**
   * Renames, moves, resizes or changes what a design's board shows.
   * @category Designs
   */
  UpdateDesign: (design: string, update: DesignUpdate) => void

  /** @category Designs */
  DeleteDesign: (design: string) => void

  /**
   * Insert into this to make a new design of the node: `Insert(document, node, { name? })`.
   * @category Designs
   */
  document: "document"

  /**
   * Adds a node, with everything inside it, as the last child of `parent` or at `index`, and returns its id. Into
   * `document`, it makes a design of the node.
   * @category Nodes
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the snippet API's edge: the node is whatever a snippet passed, which `Insert` and `Replace` check
  Insert: (parent: string, node: unknown, options?: PlaceOptions | DocumentPlacement) => string

  /**
   * Changes a node in the base design, or in a component's state given `state`.
   * @category Nodes
   */
  Update: (path: string, change: UpdateChange, options?: UpdateOptions) => void

  /**
   * Swaps a node for a new one in the same place and returns its id.
   * @category Nodes
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the snippet API's edge: the node is whatever a snippet passed, which `Insert` and `Replace` check
  Replace: (path: string, node: unknown) => string

  /**
   * Reorders or reparents a node within one design.
   * @category Nodes
   */
  Move: (path: string, parent: string, options?: PlaceOptions) => void

  /**
   * Copies a node, with everything inside it, as a paste does, and returns the copy's id.
   * @category Nodes
   */
  Copy: (path: string, parent: string, options?: CopyOptions) => string

  /** @category Nodes */
  Delete: (path: string) => void

  /**
   * Sets a node's patch for one viewport, or with `null` takes it away.
   * @category Nodes
   */
  Responsive: (path: string, viewport: string, patch: PatchInput | null) => void

  /**
   * Adds a state to a component and returns its id. `changes` are keyed by node id or name. Only a component has
   * states, to show it in its variations; a screen or a frame has none.
   * @category States
   */
  AddState: (component: string, spec: StateInput) => string

  /** Renames a component's state or changes what it changes. @category States */
  UpdateState: (component: string, state: string, spec: StateUpdate) => void

  /** @category States */
  DeleteState: (component: string, state: string) => void

  /**
   * Parts of a design that repeat with the same structure, to make a component of.
   * @category Components
   */
  FindRepeats: (design: string) => RepeatCandidate[]

  /**
   * Makes a component design of repeated nodes and replaces each with an instance, returning the new design's id.
   * @category Components
   */
  ExtractComponent: (design: string, nodes: ExtractNodes, options: ExtractOptions) => string

  /** @category Components */
  AddParam: (design: string, name: string, spec: ParamInput) => void

  /** @category Components */
  UpdateParam: (design: string, name: string, change: ParamUpdate) => void

  /** @category Components */
  DeleteParam: (design: string, name: string) => void

  /**
   * Replaces the project's modes.
   * @category Modes and tokens
   */
  SetModes: (settings: ModeSettings) => void

  /**
   * Sets token values by name: one value for the default theme, or one per theme. A name the project doesn't have
   * adds a token.
   * @category Modes and tokens
   */
  SetTokens: (values: TokenValues) => void

  /**
   * Renders frames offscreen and returns how many it took; the pictures come back with the result.
   * @category Checking
   */
  Screenshot: (design: string, options?: ScreenshotOptions) => Promise<number>

  /**
   * Lays out one frame: one state id and one mode id.
   * @category Checking
   */
  Measure: (design: string, options?: MatrixOptions) => Promise<Layout>

  /**
   * Checks frames for render errors, overflow, clipping, squeezing, unknown components and content drawn outside them.
   * @category Checking
   */
  Problems: (design: string, options?: MatrixOptions) => Promise<Problem[]>

  /**
   * axe-core's findings in each frame, per node.
   * @category Checking
   */
  Accessibility: (design: string, options?: MatrixOptions) => Promise<AccessibilityFinding[]>

  /**
   * An empty place on the canvas for a design of this size.
   * @category The canvas
   */
  FindEmptySpace: (options: SpaceOptions) => CanvasPoint

  /**
   * Designs that overlap on the canvas, all or one's.
   * @category The canvas
   */
  Overlaps: (design?: string) => Overlap[]

  /**
   * What's placed beside designs to look at, all or one's.
   * @category The canvas
   */
  References: (design?: string) => PlacedReference[]

  /**
   * Places a screen `find_references` found beside a design, and returns its id.
   * @category The canvas
   */
  PlaceReference: (id: string, options?: ReferenceOptions) => Promise<string>

  /**
   * Writes values to the call's output. Objects print as JSON.
   * @category The canvas
   */
  Print: (...values: unknown[]) => void
}

/** A design as `Designs()` lists it. Only a component has states, so only a component lists them. */
export type DesignSummary = ScreenSummary | ComponentSummary

/** What `Designs()` says about every design. */
interface SummaryFields {
  id: string
  name: string
  /** The project file it's in. */
  file: string
  /** Where it is on the canvas. */
  x: number
  y: number
  /** Its board's size, as the canvas last drew it. Unset until it's drawn. */
  width?: number
  height?: number
  /** How many nodes it has. */
  nodes: number
}

/** A screen or a frame: drawn as its layers are, with no states. */
export interface ScreenSummary extends SummaryFields {
  kind: "screen" | "frame"
  /** Its main frame's mode and the modes beside it. */
  showing: { mode: string; beside: string[] }
}

/** A component, with the states it's shown in. */
export interface ComponentSummary extends SummaryFields {
  kind: "component"
  /** Each state, the base first, by the id other functions take and the name it shows. */
  states: { id: string; name: string }[]
  /** The state its board shows, its main frame's mode and the modes beside it. */
  showing: { state: string; mode: string; beside: string[] }
}

/** A node as `Get` reads it, with children past `depth` cut off as `"…"`. */
export type ReadNode = Omit<DesignNode, "children" | "slots"> & {
  children?: (ReadNode | "…")[]
  slots?: Record<string, (ReadNode | "…")[]>
}

/** What `Get` calls for every node it walks; what it returns, unless `undefined`, is collected. */
// oxlint-disable-next-line anti-slop/no-unknown-returns -- a snippet's visit function returns whatever it likes, which `Get` hands back
export type Visit = (node: DesignNode, at: VisitContext) => unknown

/** Where `Get` is in its walk, as `visit` is told. */
export interface VisitContext {
  /** The design's id. */
  design: string
  /** The node's path, as `design/node`. */
  path: string
  /** How deep it is below where the walk started. */
  depth: number
  /** Its index among its parent's children, or in its slot. */
  index: number
  /** The id of the node it's in; unset for the first node visited. */
  parent?: string
  /** Leaves out the nodes inside this one. */
  skipChildren(): void
}

/** A component's props, as `Props` reads them. */
export interface PropsInfo {
  component: string
  /** The module it's written in, from the project root. Unset when its source isn't known. */
  path?: string
  /** What the project's code imports it from, when something does. */
  import?: string
  /** Whether its source was read; when it wasn't, `props` is empty. */
  known: boolean
  props: ComponentProp[]
  composition: Omit<ComponentComposition, "component">
}

/** A token as `GetTokens` lists it. */
export interface Token {
  /** Its name, without `--`. */
  name: string
  category: string
  /** The stylesheet or library it comes from. */
  source: string
  /** Its value in each theme, by theme. */
  values: Record<string, string>
  /** Given `nearest`: how far it is, in pixels for a length, in OKLab for a color (under 0.02 looks the same). */
  distance?: number
}

/** The project's modes as `GetModes` reads them. */
export interface ModesInfo extends ModesReport {
  /** The modes as set: change them and pass them to `SetModes`. */
  settings: ModeSettings
  /** What each design's board shows, or the one design's when it's named. */
  designs: DesignModes[]
}

/** What the person has selected. Each is unset when nothing is. */
export interface Selected {
  /** The design's id. */
  design?: string
  /** The node's id. */
  node?: string
  /** The mode of the frame it's selected in. */
  mode?: string
}

/** One frame's layout, as `Measure` gives it. */
export interface Layout {
  /** The state and mode it drew. */
  state: string
  mode: string
  /** The frame's size, in CSS pixels. */
  width: number
  height: number
  /** Whether its content is wider than the frame. */
  overflowsX: boolean
  /** Every node it draws, outermost first. */
  nodes: NodeLayout[]
}

/**
 * A style in a patch: the style keys document.md describes, where `null` takes a value away. Only the reference uses it,
 * to name that type rather than print every style key where a patch takes one.
 * @public
 */
export type PatchStyle = NonNullable<PatchInput["style"]>

export type PropsOptions = z.infer<typeof propsOptions>

export type IconOptions = z.infer<typeof iconOptions>

export type TokenFilterOptions = z.infer<typeof tokenFilter>

export type DocumentPlacement = z.infer<typeof documentPlacement>

export type UpdateOptions = z.infer<typeof updateOptions>

export type CopyOptions = z.infer<typeof copyOptions>

export type StateInput = z.infer<typeof newState>

export type StateUpdate = z.infer<typeof stateUpdate>

export type ExtractNodes = z.infer<typeof extractNodes>

export type ExtractOptions = z.infer<typeof extractOptions>

export type TokenValues = z.input<typeof tokenValues>

export type ScreenshotOptions = z.infer<typeof screenshotOptions>

export type SpaceOptions = z.infer<typeof spaceOptions>

export type ReferenceOptions = z.infer<typeof referenceOptions>
