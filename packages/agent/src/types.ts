import type { CanvasDocument, ComponentInfo, ModeSettings, ResolvedMode, ThemeVariable, Token } from "@parity-app/core"

/** What an agent call starts from: one tab's live state. */
export interface AgentSnapshot {
  tab: string
  components: string[]
  /** Icon libraries by id. An icon is a component named `<id>/<Icon>`, such as `lucide/Heart`. */
  iconLibraries?: string[]
  tokens: Token[]
  theme: ThemeVariable[]
  modes: ModeSettings
  documents: { path: string; document: CanvasDocument }[]
  /** The project file new designs and components go into. */
  mainDocument: string
  /** Components' props as inferred from their source, by component; missing until inference finishes. */
  props: Record<string, ComponentInfo>
  selection: { design?: string; node?: string; mode?: string }
  /** Each design's board on the canvas, by design key, so new designs can be placed in empty space. */
  bounds: Record<string, { x: number; y: number; width: number; height: number }>
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
  changes: {
    documents: { path: string; document: CanvasDocument }[]
    modes?: ModeSettings
    tokens: TokenChange[]
  }
}
