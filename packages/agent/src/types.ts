import type {
  CanvasDocument,
  ChangeConflict,
  ComponentInfo,
  ComponentRenderStatus,
  ComponentSource,
  ContainerSpec,
  DesignChange,
  ErrorDetails,
  LeftOutExport,
  LibraryIcons,
  ModeSettings,
  ModesChange,
  ProjectDetection,
  ResolvedMode,
  ThemeVariable
} from "@parity-app/core"
import type { FoundScreen, ReferenceAdded } from "@parity-app/editor"
import type { Token } from "@parity-app/tokens"
import type { WarningGroup } from "./warnings.ts"

/** What an agent call starts from: one tab's live state. */
export interface AgentSnapshot {
  tab: string
  components: string[]
  /** The project's icon sets. An icon is a component named `<id>/<Icon>`, such as `lucide/Heart`. */
  iconSets?: IconSet[]
  tokens: Token[]
  theme: ThemeVariable[]
  modes: ModeSettings
  documents: { path: string; document: CanvasDocument }[]
  /**
   * The component designs the project's libraries bring (from their `.lib.par` canvases), which instances place as
   * they do on the canvas. A project design with the same id wins.
   */
  libraryDesigns: ContainerSpec[]
  /**
   * Every token value the canvas's unsaved edits leave different from the project's compiled CSS, so frames drawn for
   * the call show what the canvas shows.
   */
  tokenOverrides: TokenChange[]
  /** The project file new designs and components go into. */
  mainDocument: string
  /** Components' props as inferred from their source, by component; missing until inference finishes. */
  props: Record<string, ComponentInfo>
  /**
   * Where each component comes from, with the parents and sample a library part is inserted with, which `Props`
   * reports as its composition. Without it, every component's parents are unknown.
   */
  sources?: Record<string, ComponentSource>
  /** How each component drawn so far fares on the canvas, which says whether its example draws. */
  renderStatus?: Record<string, ComponentRenderStatus>
  selection: { design?: string; node?: string; mode?: string }
  /** Each design's board on the canvas, by design key, so new designs can be placed in empty space. */
  bounds: Record<string, { x: number; y: number; width: number; height: number }>
}

/** An open project, as an agent's calls name it and the CLI routes them by (PAR-514). */
export type TabSummary = {
  id: string
  name: string
  root: string
  active: boolean
  status: "loading" | "ready" | "error"
  error?: string
  designs: number
}

/**
 * A tab as the editor window gives it for an agent call: what the workspace starts from, with the tab itself in place of
 * its id, and what the reports read beside it. The workspace takes it as it is, with `tab` set to the tab's id.
 */
export type TabSnapshot = Omit<AgentSnapshot, "tab"> & {
  tab: TabSummary
  /** Opaque, and equal only while nothing has changed in this tab since it opened. */
  revision: string
  projectId: string
  guestUrl: string
  /** Components the type checker found after the guest loaded, which other pages' guests have to add themselves. */
  addedComponents?: Record<string, Pick<ComponentSource, "path" | "export">>
  /** The app's exports the type checker left out, with why. */
  leftOut?: LeftOutExport[]
  /** The part of the canvas the person is looking at. */
  viewport: { x: number; y: number; width: number; height: number; zoom: number }
  /** What detection found in the project, and where. */
  detection: ProjectDetection
}

/** What an agent touched, on its tab, with who's calling, so the editor can show it working. */
export type PresenceEvent = AgentEvent & {
  tab: string
  /** Who is calling, such as "Claude Code" or "Cursor", named on the cursor. */
  agent?: string
  /** Tells agents with the same name apart, each with its own cursor. */
  agentId?: string
}

/** A message the project's own code wrote to the console. The same message several times in a row is one entry. */
export type ConsoleEntry = {
  level: "info" | "warning" | "error" | "debug"
  text: string
  /** The script that wrote it, and the line. */
  source: string
  line: number
  /** On the person's canvas, or in the hidden window agents render in. */
  where: "canvas" | "offscreen"
  count: number
  /** When it was first and last written, in milliseconds since 1970. */
  first: number
  last: number
  /**
   * The design that wrote it, by key (`path#id`), with the state and mode it was drawn in (PAR-147): the one drawn
   * offscreen when it was written, or on the canvas, the frame whose event was being handled. None when that isn't
   * known, as for a module that logs as it loads.
   */
  design?: string
  state?: string
  mode?: string
}

/** An icon set the project has, as its `.lib.par` describes it, without the tags its icons are searched by. */
export interface IconSet {
  id: string
  name: string
  package: string
  version?: string
  icons?: Omit<LibraryIcons, "tags">
}

/** The names a set exports in one style's module, read from the project's own copy of it, and what to search them by. */
export interface IconNames {
  names: string[]
  /** The other names each icon is exported under, by the name in `names`. */
  aliases?: Record<string, string[]>
  /** Words to find each icon by, from the set's published metadata, by the icon's label. */
  tags?: Record<string, string[]>
}

/** What an agent touched, so the editor can show it working. */
export interface AgentEvent {
  kind:
    | "read"
    | "write"
    | "move"
    | "screenshot"
    | "measure"
    | "accessibility"
    | "problems"
    | "console"
    | "board"
    | "start"
    | "end"
  label?: string
  design?: string
  node?: string
  state?: string
  mode?: string
  error?: string
  /** Where a moved design's board was and where it goes, on the canvas. */
  from?: { x: number; y: number }
  to?: { x: number; y: number }
}

export interface FrameRequest {
  /** The design key (`path#id`), for presence and for the console messages the frame writes. */
  design: string
  /** The state drawn, by id, for the console messages the frame writes (PAR-147). */
  state?: string
  tree: unknown
  /** `width` is the frame's: the design's own for this viewport, else the viewport's. */
  mode: ResolvedMode
  /** A fixed frame height, which clips the frame; otherwise the frame is as tall as its content. */
  height?: number
  /**
   * The browser window the frame stands for, from core's `frameGeometry`, as the live frame on the canvas has it: what
   * viewport units and the project's window size checks measure. It keeps its height when the frame grows past it.
   */
  viewport: { width: number; height: number }
  scale: number
  capture: boolean
  /** Also check the frame for accessibility issues. */
  audit?: boolean
  /** When auditing, the color tokens to read the values of in the frame, for contrast fixes. */
  colorTokens?: string[]
  /**
   * Every token value that differs from the project's compiled CSS: the canvas's unsaved edits with this call's
   * `SetTokens` over them. The complete set, not changes, for the frame to lay over the compiled stylesheet.
   */
  tokens: TokenChange[]
}

/** A rule a frame breaks, as axe-core reports it, on the design nodes it applies to. */
export interface AccessibilityIssue {
  /** axe-core's rule id, such as `color-contrast`. */
  rule: string
  impact: AccessibilityImpact
  /** What the rule asks for, in a sentence. */
  help: string
  helpUrl: string
  /** Each node it applies to, with what's wrong there. An element inside a component counts as the component. */
  nodes: { id: string; detail: string; contrast?: ContrastDetail }[]
}

/** The colours behind a contrast failure, as axe-core measured them. */
export interface ContrastDetail {
  /** Hex colours, such as `#737373`. */
  foreground: string
  background: string
  /** The ratio found, such as 4.34 for 4.34:1. */
  ratio: number
  /** The ratio the text needs: 4.5, or 3 when it's large. */
  required: number
  /** The text's size in CSS pixels. */
  fontSize: number
  bold: boolean
  /**
   * The project's color token closest to the text's color that passes in every frame the layer was checked in, or
   * `"none"` when no token does.
   */
  fix?: TokenFix | "none"
}

/** A token to color a layer's text with, so its contrast passes. */
export interface TokenFix {
  /** The token's name, without `--`. */
  token: string
  /** What it comes to in this frame, as hex. */
  color: string
  /** The lowest ratio it reaches in the frames checked, such as 7.09 for 7.09:1. */
  ratio: number
}

export type AccessibilityImpact = "critical" | "serious" | "moderate" | "minor"

/** One accessibility issue on one node, in one state and mode. */
export interface AccessibilityFinding {
  state: string
  mode: string
  rule: string
  impact: AccessibilityImpact
  help: string
  helpUrl: string
  /** The node's id, or none when the issue is on the frame as a whole. */
  node?: string
  name?: string
  detail: string
  contrast?: ContrastDetail
}

/** A box in a frame, in CSS pixels from the frame's top left corner. */
export interface FrameBox {
  x: number
  y: number
  width: number
  height: number
}

/** A node's box as a frame draws it. */
export interface MeasuredNode extends FrameBox {
  id: string
  /** The node it's drawn inside; none for the outermost. */
  parent?: string
  /** True when part of the node is cut off by an ancestor that clips. */
  clipped?: boolean
  /** The nearest ancestor that clips and cuts part of the node off: its box, and the node it belongs to, if any. */
  clip?: FrameBox & { node?: string }
  /**
   * Where the project's code writes the element the node draws outermost, as `src/components/ui/button.tsx:44:5`, from
   * the development guest (PAR-167). None for Parity's own layers, libraries' elements and production builds.
   */
  source?: string
}

/** How far a box reaches past each edge of the one around it, in CSS pixels. Edges it stays inside are left out. */
export interface Overflow {
  left?: number
  right?: number
  top?: number
  bottom?: number
}

/** One problem in one frame. The layout kinds say which node, what it overflows, and by how much. */
export interface Problem {
  state: string
  mode: string
  kind: "render-error" | "unknown-component" | "content-wider" | "frame-overflow" | "clipped"
  /** What's wrong, in a sentence. */
  problem: string
  node?: string
  name?: string
  box?: FrameBox
  /** What the node overflows: the node that clips it, or the frame, which has no node. */
  container?: { node?: string; name?: string; box: FrameBox }
  overflow?: Overflow
}

export interface FrameResult {
  width: number
  height: number
  nodes: MeasuredNode[]
  overflowsX: boolean
  unknownComponents: string[]
  error?: string
  /** Base64 PNG, when captured. */
  png?: string
  /** When audited. */
  issues?: AccessibilityIssue[]
  /** When audited: the contrast of the frame's text, passing or failing, and its color tokens' values. */
  contrast?: FrameContrast
}

/** What a frame's text measured for contrast, and what each color token comes to there, for contrast fixes. */
export interface FrameContrast {
  /** Each color token's value in the frame, as hex, by name. Tokens the frame doesn't define are left out. */
  tokens: Record<string, string>
  /** Per node with text, the text in it with the lowest contrast. */
  texts: ContrastReading[]
}

export interface ContrastReading {
  /** The node, as issues name it: an element inside a component counts as the component. */
  id: string
  /** Hex colours, as axe-core measured them. */
  foreground: string
  background: string
  ratio: number
  required: number
  /** Whether coloring the node's own element reaches this text, rather than a color set inside it. */
  follows: boolean
}

/** How an agent call reaches the outside world: showing its work and drawing frames. */
export interface AgentHooks {
  presence(events: AgentEvent[]): void
  render(request: FrameRequest): Promise<FrameResult>
  /** An icon set's names in one style's module (`undefined` for the set's main one), for `Icons(set)`. */
  iconNames?(set: string, module: string | undefined): Promise<IconNames>
  /**
   * Applies a successful call's changes in the editor, merged with what changed there since the snapshot. Gives back
   * what conflicted, and nothing was applied when any did. Without it, the changes are only returned.
   */
  apply?(changes: AgentChangeSet): Promise<ChangeConflict[]>
  /**
   * Whether the browser takes each value for its CSS property (`CSS.supports`), which says whether a `SetTokens` value
   * is its token's kind. The agent runs without a browser; without the hook, kinds aren't checked.
   */
  supports?(queries: { property: string; value: string }[]): Promise<boolean[]>
  /**
   * A screen from a real app main found lately, for `PlaceReference`: from the connector named, or the one that finds
   * screens. Without it, references can't be placed.
   */
  screen?(id: string, connector: string | undefined): Promise<FoundScreen | undefined>
  /** Who's calling, when it says, as the references it places name it. */
  caller?: string
}

/**
 * A result a connector found, as placing takes it from main's own copy (PAR-829): what kind it is, its image and who to
 * credit. The agent names it by connector and id, so what goes in a design is what the source gave.
 */
export interface PlaceableResult {
  kind: string
  /** Whether it can go in a design: pictures can; screens from real apps and videos are for looking at. */
  placeable: boolean
  title: string
  /** Its picture, with when its link stops working for a source whose links expire. */
  image: { url: string; expiresAt?: number }
  credit: { name: string; url?: string }[]
}

/**
 * Where a result was placed: the project's folder, the design's file in it and the design's id. Main turns them into a
 * key that holds no path, so the same design is counted once and nothing about the computer leaves it.
 */
export interface PlacedIn {
  connector: string
  id: string
  project: string
  file: string
  design: string
}

/**
 * A reference on the canvas as an agent reads it (PAR-889): where it's from, why it's there, who placed it and the
 * design it's for.
 */
export interface PlacedReference {
  /** Its id on the canvas. */
  id: string
  app: string
  platform?: "ios" | "web"
  /** Its page at the source. */
  link: string
  /** Its picture's link, which may have stopped working; `expired` says when it has. */
  picture: string
  expired?: true
  query?: string
  note?: string
  /** The agent that placed it. Unset when the person did. */
  by?: string
  /**
   * The design it was placed for, or else the one it sits beside, with the file it's in. Unset when no design is near.
   */
  design?: { id: string; name: string; file: string }
}

/**
 * What a call changed: each design it touched with how it found it, the modes when it set them, token values, and the
 * references it placed.
 */
export interface AgentChangeSet {
  designs: DesignChange[]
  modes?: ModesChange
  tokens: TokenChange[]
  references?: ReferenceAdded[]
}

export interface TokenChange {
  name: string
  theme: string
  value: string
}

export interface Screenshot {
  design: string
  state: string
  mode: string
  width: number
  height: number
  png: string
  /** Each layer's box in the frame, in its CSS pixels, to cut a layer from the picture (PAR-185). */
  nodes?: MeasuredNode[]
}

export interface ExecResult {
  ok: boolean
  /** Lines from `Print`. */
  output: string[]
  /** One line per warning group, places first: what people and text-only clients read. */
  warnings: string[]
  /** The same findings as data: each category and severity once, with how many places and which. */
  warningGroups: WarningGroup[]
  error?: string
  /** Set when the call failed: why, as a stable code, with the field at fault and what to use instead. */
  details?: ErrorDetails
  /** Set when the call failed: retry with edits to the snippet under this id. */
  editId?: string
  screenshots: Screenshot[]
  /** Names of nodes and designs created in this call, mapped to their ids. */
  created: Record<string, string>
  /** The responsive, state and variant patches each `Replace` in the call threw away. Absent when none did. */
  discarded?: DiscardedPatches[]
  changes: AgentChangeSet
}

/**
 * What one `Replace` threw away. The new node has fresh ids, so patches keyed to the old node and what was inside it go
 * with it; they aren't moved onto the new one.
 */
export interface DiscardedPatches {
  /** The design's id. */
  design: string
  /** The node `Replace` swapped out, and the one that took its place. */
  replaced: string
  replacement: string
  /** Each node that had patches: its id (or `instance/inner` path) and name, and where it was patched. */
  nodes: DiscardedNode[]
}

export interface DiscardedNode {
  id: string
  name?: string
  /** Viewport ids, as `Responsive` takes them. */
  viewports?: string[]
  /** State ids, as `Update(..., { state })` takes them. */
  states?: string[]
  /** Variant options, as `param=option`. */
  variants?: string[]
}

/** A problem an agent reports (PAR-646), as the app sends it on to Sentry: what's wrong, what it's about, and frames. */
export interface AgentReport {
  message: string
  /** What it's about, as Sentry tags: tab, design, state, node and test_run, where known. */
  tags: Record<string, string>
  /** The frames of the design it names, as PNG files to attach. */
  frames: { name: string; png: string }[]
}

/** The Sentry user feedback a report became. */
export interface ReportSent {
  feedbackId: string
  link: string
  traceId?: string
  replayId?: string
  /** The files that went with it, by name. */
  attachments: string[]
}
