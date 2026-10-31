import type {
  CanvasDocument,
  ChangeConflict,
  ComponentInfo,
  ContainerSpec,
  DesignChange,
  LibraryIcons,
  ModeSettings,
  ModesChange,
  ResolvedMode,
  ThemeVariable
} from "@parity-app/core"
import type { Token } from "@parity-app/tokens"

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
  selection: { design?: string; node?: string; mode?: string }
  /** Each design's board on the canvas, by design key, so new designs can be placed in empty space. */
  bounds: Record<string, { x: number; y: number; width: number; height: number }>
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
  /** The design key (`path#id`), for presence. */
  design: string
  tree: unknown
  /** `width` is the frame's: the design's own for this viewport, else the viewport's. */
  mode: ResolvedMode
  /** A fixed frame height; otherwise the frame is as tall as its content. */
  height?: number
  scale: number
  capture: boolean
  /** Also check the frame for accessibility issues. */
  audit?: boolean
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

export interface FrameResult {
  width: number
  height: number
  nodes: { id: string; x: number; y: number; width: number; height: number; clipped?: boolean }[]
  overflowsX: boolean
  unknownComponents: string[]
  error?: string
  /** Base64 PNG, when captured. */
  png?: string
  /** When audited. */
  issues?: AccessibilityIssue[]
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
}

/** What a call changed: each design it touched with how it found it, the modes when it set them, and token values. */
export interface AgentChangeSet {
  designs: DesignChange[]
  modes?: ModesChange
  tokens: TokenChange[]
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
}

export interface ExecResult {
  ok: boolean
  /** Lines from `Print`. */
  output: string[]
  warnings: string[]
  error?: string
  /** Set when the call failed: retry with edits to the snippet under this id. */
  editId?: string
  screenshots: Screenshot[]
  /** Names of nodes and designs created in this call, mapped to their ids. */
  created: Record<string, string>
  changes: AgentChangeSet
}
