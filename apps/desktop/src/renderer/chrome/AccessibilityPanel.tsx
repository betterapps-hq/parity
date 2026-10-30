import type { AccessibilityFinding, AccessibilityImpact, ContrastDetail } from "@parity-app/agent"
import { type ContainerSpec, findNode, type ModeSettings, shownModes } from "@parity-app/core"
import {
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  Keyboard,
  LoaderCircle,
  type LucideIcon,
  MousePointerClick,
  OctagonAlert,
  RefreshCw,
  TriangleAlert
} from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor, NodeIcon, nodeColor } from "../canvas/kinds.tsx"
import { setTabOrderShown, useTabOrderShown } from "../canvas/tab-order.ts"
import { type ContainerEntry, useContainerEntry, useModeSettings } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import type { ProjectSession } from "../workspace.ts"
import { ruleWords } from "./accessibility-rules.ts"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { PanelError } from "./PanelError.tsx"

/** A check of one design, kept with what it checked so a later change shows it's out of date. */
type Check = { container: ContainerSpec; modes: ModeSettings } & (
  | { status: "checking" }
  | { status: "done"; findings: AccessibilityFinding[]; frames: number; warnings: string[] }
  | { status: "failed"; error: string }
)

const checks = new Map<string, Check>()
const listeners = new Set<() => void>()
const checkKey = (session: ProjectSession, design: string) => `${session.id}\n${design}`

function setCheck(key: string, check: Check): void {
  checks.set(key, check)
  for (const listener of listeners) listener()
}

function useCheck(key: string): Check | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => checks.get(key)
  )
}

/** Renders the design offscreen in every state and shown mode, and checks each frame with axe-core. */
async function runCheck(session: ProjectSession, entry: ContainerEntry): Promise<void> {
  const key = checkKey(session, entry.key)
  const checked = { container: entry.container, modes: session.store.getModes() }
  setCheck(key, { ...checked, status: "checking" })
  try {
    const result = await window.canvasHost.request("accessibility.check", { projectId: session.id, design: entry.key })
    setCheck(key, { ...checked, status: "done", ...result })
  } catch (error) {
    setCheck(key, { ...checked, status: "failed", error: error instanceof Error ? error.message : String(error) })
  }
}

const impactOrder: AccessibilityImpact[] = ["critical", "serious", "moderate", "minor"]

const impactLooks: Record<AccessibilityImpact, { label: string; icon: LucideIcon; tone: string }> = {
  critical: { label: "critical", icon: OctagonAlert, tone: "text-destructive" },
  serious: { label: "serious", icon: TriangleAlert, tone: "text-orange-600 dark:text-orange-400" },
  moderate: { label: "moderate", icon: CircleAlert, tone: "text-amber-600 dark:text-amber-400" },
  minor: { label: "minor", icon: Info, tone: "text-muted-foreground" }
}

type Frame = { state: string; mode: string }

/** One layer that breaks a rule, or several alike, such as the rows of a list. */
interface LayerGroup {
  nodes: string[]
  name?: string
  detail: string
  contrast?: ContrastDetail
  frames: Frame[]
}

/** One rule a design breaks, and the layers that break it. */
interface RuleGroup {
  rule: string
  impact: AccessibilityImpact
  title: string
  why: string
  helpUrl: string
  layers: LayerGroup[]
}

function groupFindings(findings: AccessibilityFinding[]): RuleGroup[] {
  const groups = new Map<string, RuleGroup & { byNode: Map<string, LayerGroup> }>()
  for (const finding of findings) {
    let group = groups.get(finding.rule)
    if (!group) {
      const { rule, impact, help, helpUrl } = finding
      const words = ruleWords[rule]
      group = {
        rule,
        impact,
        title: words?.title ?? help,
        why: words?.why ?? "",
        helpUrl,
        layers: [],
        byNode: new Map()
      }
      groups.set(finding.rule, group)
    }
    // A layer's problem can differ by frame, such as its contrast in dark mode, so each problem is its own entry.
    const key = `${finding.node ?? ""}\n${finding.detail}`
    let layer = group.byNode.get(key)
    if (!layer) {
      const { name, detail, contrast } = finding
      layer = { nodes: finding.node ? [finding.node] : [], name, detail, ...(contrast ? { contrast } : {}), frames: [] }
      group.byNode.set(key, layer)
    }
    layer.frames.push({ state: finding.state, mode: finding.mode })
  }
  return [...groups.values()]
    .map(({ byNode, ...group }) => {
      const alike = new Map<string, LayerGroup>()
      for (const layer of byNode.values()) {
        const same = JSON.stringify([layer.name, layer.detail, layer.frames])
        const existing = alike.get(same)
        if (existing) existing.nodes.push(...layer.nodes)
        else alike.set(same, layer)
      }
      return { ...group, layers: [...alike.values()] }
    })
    .sort((a, b) => impactOrder.indexOf(a.impact) - impactOrder.indexOf(b.impact) || b.layers.length - a.layers.length)
}

/** The Accessibility tab: automated checks of the selected design, in every state and the modes it shows. */
export function AccessibilityPanel() {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)
  if (!entry) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
        <MousePointerClick className="size-5" />
        Select a design to check its accessibility.
        <span className="text-xs">Every state is checked, in the modes the design shows.</span>
      </div>
    )
  }
  return <DesignCheck entry={entry} />
}

function DesignCheck({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const modes = useModeSettings(session.store)
  const key = checkKey(session, entry.key)
  const check = useCheck(key)
  const { container } = entry

  // The first look at a design checks it; after that, checking again is the person's call.
  useEffect(() => {
    if (!checks.has(key)) void runCheck(session, entry)
  }, [entry, key, session])

  const checking = check?.status === "checking"
  const stale = check && check.status !== "checking" && changedSince(check, container, modes)
  const checkAgain = () => void runCheck(session, entry)
  return (
    <>
      <div className="flex items-center gap-2 border-b py-2 pr-2 pl-4">
        <DesignIcon kind={container.kind} className="size-4 shrink-0" style={{ color: designColor(container.kind) }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{container.name}</span>
        <IconButton label={checking ? "Checking" : "Check again"} disabled={checking} onClick={checkAgain}>
          <RefreshCw className={checking ? "animate-spin" : undefined} />
        </IconButton>
      </div>
      <TabOrderSwitch />
      {stale && (
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex-1">The design changed since this check.</span>
          <button type="button" className="font-medium text-foreground hover:underline" onClick={checkAgain}>
            Check again
          </button>
        </div>
      )}
      {checking && (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
          Checking every state and mode
        </div>
      )}
      {check?.status === "failed" && (
        <div className="p-4">
          <PanelError
            title={`Couldn't check ${container.name}`}
            action={
              <Button size="xs" variant="outline" onClick={checkAgain}>
                <RefreshCw /> Check again
              </Button>
            }
          >
            {check.error}
          </PanelError>
        </div>
      )}
      {check?.status === "done" && <Findings entry={entry} check={check} />}
    </>
  )
}

/**
 * Whether the design changed in a way a check would see: its layers, its states or the modes it's shown in. Showing
 * another state on the canvas or moving the design doesn't count.
 */
function changedSince(check: Check, container: ContainerSpec, modes: ModeSettings): boolean {
  const shown = (settings: ModeSettings, design: ContainerSpec) => {
    const { main, beside } = shownModes(settings, design.view)
    return [main, ...beside].map((mode) => mode.id).join(" ")
  }
  return (
    check.container.root !== container.root ||
    check.container.states !== container.states ||
    check.modes !== modes ||
    shown(check.modes, check.container) !== shown(modes, container)
  )
}

/** Shows the order Tab moves through the design, numbered on the canvas. */
function TabOrderSwitch() {
  const shown = useTabOrderShown()
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      <Keyboard className="size-3.5 shrink-0 text-muted-foreground" />
      <Label htmlFor="tab-order" className="min-w-0 flex-1 text-xs font-normal">
        Show tab order on the canvas
      </Label>
      <Switch id="tab-order" size="sm" checked={shown} onCheckedChange={setTabOrderShown} />
    </div>
  )
}

function Findings({ entry, check }: { entry: ContainerEntry; check: Extract<Check, { status: "done" }> }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const groups = groupFindings(check.findings)
  const shown = shownModes(check.modes, check.container.view)
  const modes = [shown.main, ...shown.beside]
  const modeName = (id: string) => modes.find((mode) => mode.id === id)?.name ?? id
  const stateName = (id: string) => check.container.states.find((state) => state.id === id)?.name ?? id
  // Name only what varies: the states when there's one mode, the modes when there's one state.
  const frameName = ({ state, mode }: Frame) =>
    modes.length === 1
      ? stateName(state)
      : check.container.states.length === 1
        ? modeName(mode)
        : `${stateName(state)} in ${modeName(mode)}`
  const every =
    modes.length === 1 ? "Every state" : check.container.states.length === 1 ? "Every mode" : "Every state and mode"
  const frames = check.frames === 1 ? "1 frame" : `${check.frames} frames`
  const toggle = (rule: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(rule)) next.add(rule)
      return next
    })

  return (
    <div className="text-sm">
      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="grid size-9 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="size-5" />
          </span>
          <span className="font-medium">No issues found</span>
          <span className="text-xs text-muted-foreground">{frames} checked, every state in the modes it shows.</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs">
          {impactOrder.map((impact) => {
            const count = groups.filter((group) => group.impact === impact).length
            if (count === 0) return null
            const { icon: Icon, label, tone } = impactLooks[impact]
            return (
              <span key={impact} className={`flex items-center gap-1 font-medium ${tone}`}>
                <Icon className="size-3.5" />
                {count} {label}
              </span>
            )
          })}
          <span className="ml-auto text-muted-foreground">{frames} checked</span>
        </div>
      )}
      {groups.map((group) => (
        <RuleSection
          key={group.rule}
          entry={entry}
          container={check.container}
          group={group}
          open={!collapsed.has(group.rule)}
          onToggle={() => toggle(group.rule)}
          allFrames={check.frames}
          every={every}
          frameName={frameName}
        />
      ))}
      {check.warnings.map((warning) => (
        <p key={warning} className="flex items-start gap-2 px-4 py-2 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {warning}
        </p>
      ))}
      <p className="flex items-start gap-2 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Checked with axe-core against WCAG 2.2 AA. Automated checks find some issues, not all, so try the design with
          a keyboard and a screen reader too.
        </span>
      </p>
    </div>
  )
}

function RuleSection({
  entry,
  container,
  group,
  open,
  onToggle,
  allFrames,
  every,
  frameName
}: {
  entry: ContainerEntry
  /** The design as it was checked. */
  container: ContainerSpec
  group: RuleGroup
  open: boolean
  onToggle(): void
  allFrames: number
  /** What to say when a layer breaks the rule in every frame. */
  every: string
  frameName(frame: Frame): string
}) {
  const { icon: Icon, label, tone } = impactLooks[group.impact]
  const layers = group.layers.reduce((count, layer) => count + Math.max(layer.nodes.length, 1), 0)
  return (
    <section className="border-b">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-start gap-1.5 py-2.5 pr-4 pl-2 text-left hover:bg-accent/50"
        onClick={onToggle}
      >
        <ChevronRight
          className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-label={label} />
        <span className="min-w-0 flex-1 pl-0.5 text-[13px] leading-snug font-medium">{group.title}</span>
        {!open && (
          <span className="mt-px shrink-0 text-xs text-muted-foreground tabular-nums">
            {layers === 1 ? "1 layer" : `${layers} layers`}
          </span>
        )}
      </button>
      {open && (
        <div className="pr-4 pb-3 pl-[46px]">
          {group.why && <p className="text-xs leading-normal text-muted-foreground">{group.why}</p>}
          <ul className="mt-2 flex flex-col gap-0.5">
            {group.layers.map((layer) => (
              <LayerRow
                key={`${layer.nodes.join(" ")}\n${layer.detail}`}
                entry={entry}
                container={container}
                layer={layer}
                allFrames={allFrames}
                every={every}
                frameName={frameName}
              />
            ))}
          </ul>
          <a
            href={group.helpUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            How to fix it
            <ArrowUpRight className="size-3" />
          </a>
        </div>
      )}
    </section>
  )
}

/**
 * A layer that breaks the rule, with what's wrong and the frames it's wrong in. Clicking it selects the layer, in the
 * state the canvas shows when that's one of them, else in the first; clicking a frame selects it there. Either way the
 * canvas shows that state, as picking it under States does.
 */
function LayerRow({
  entry,
  container,
  layer,
  allFrames,
  every,
  frameName
}: {
  entry: ContainerEntry
  container: ContainerSpec
  layer: LayerGroup
  allFrames: number
  every: string
  frameName(frame: Frame): string
}) {
  const { selection, store } = useProject()
  const node = layer.nodes[0] === undefined ? undefined : findNode(container.root, layer.nodes[0])
  const name = layer.name ?? "The design"
  const view = entry.container.view
  const shownState = view?.state ?? entry.container.states[0]?.id
  const select = (frame: Frame) => {
    if (!view?.allStates && frame.state !== shownState) {
      store.updateView(entry.key, (current) => ({ ...current, state: frame.state }))
    }
    selection.set(
      layer.nodes.length > 0
        ? {
            design: entry.key,
            node: layer.nodes[0],
            ...(layer.nodes.length > 1 ? { nodes: layer.nodes } : {}),
            state: frame.state,
            mode: frame.mode
          }
        : { design: entry.key }
    )
  }
  const inEvery = layer.frames.length === allFrames && allFrames > 1
  return (
    <li className="relative -mx-2 rounded-md px-2 py-1.5 hover:bg-accent">
      <button
        type="button"
        aria-label={`Select ${name}`}
        className="absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => select(layer.frames.find((frame) => frame.state === shownState) ?? layer.frames[0]!)}
      />
      <div className="pointer-events-none relative flex min-w-0 items-center gap-1.5 text-[13px]">
        {node ? (
          <NodeIcon node={node} className="size-3.5 shrink-0" style={{ color: nodeColor(node) }} />
        ) : (
          <DesignIcon
            kind={container.kind}
            className="size-3.5 shrink-0"
            style={{ color: designColor(container.kind) }}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {layer.nodes.length > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{layer.nodes.length} layers</span>
        )}
      </div>
      <div className="pointer-events-none relative">
        {layer.contrast ? <ContrastSample contrast={layer.contrast} /> : <Detail text={layer.detail} />}
      </div>
      <div className="pointer-events-none relative mt-1.5 flex flex-wrap gap-1">
        {inEvery ? (
          <span className="rounded-sm bg-foreground/[0.07] px-1.5 py-px text-[11px] text-muted-foreground">
            {every}
          </span>
        ) : (
          layer.frames.map((frame) => (
            <Hint key={`${frame.state}:${frame.mode}`} label={`Select it in ${frameName(frame)}`} wait>
              <button
                type="button"
                className="pointer-events-auto rounded-sm bg-foreground/[0.07] px-1.5 py-px text-[11px] text-muted-foreground hover:bg-foreground/15 hover:text-foreground"
                onClick={() => select(frame)}
              >
                {frameName(frame)}
              </button>
            </Hint>
          ))
        )}
      </div>
    </li>
  )
}

/** What's wrong, with code in backticks set as code. */
function Detail({ text }: { text: string }) {
  return (
    <p className="mt-0.5 text-xs leading-normal break-words text-muted-foreground">
      {text.split("`").map((part, index) =>
        index % 2 === 1 ? (
          <code
            key={index}
            className="rounded-sm bg-foreground/[0.07] px-1 py-px font-mono text-[11px] text-foreground"
          >
            {part}
          </code>
        ) : (
          part
        )
      )}
    </p>
  )
}

/** The failing colours as a sample of text, with the ratio found and the ratio needed. */
function ContrastSample({ contrast }: { contrast: ContrastDetail }) {
  const { foreground, background, ratio, required, fontSize, bold } = contrast
  return (
    <div className="mt-1.5 flex items-center gap-2.5">
      <span
        className="grid h-9 w-12 shrink-0 place-items-center rounded-md border text-[15px]"
        style={{ color: foreground, background, fontWeight: bold ? 700 : 500 }}
        aria-hidden
      >
        Aa
      </span>
      <div className="min-w-0 text-xs">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-semibold text-foreground tabular-nums">{ratio}:1</span>
          <span className="text-muted-foreground">
            needs {required}:1 for {fontSize}px{bold ? " bold" : ""} text
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1 font-mono text-[11px] text-muted-foreground">
          <Swatch color={foreground} />
          {foreground}
          <span className="px-0.5 font-sans">on</span>
          <Swatch color={background} />
          {background}
        </div>
      </div>
    </div>
  )
}

function Swatch({ color }: { color: string }) {
  return <span className="size-2.5 shrink-0 rounded-[3px] border border-foreground/20" style={{ background: color }} />
}
