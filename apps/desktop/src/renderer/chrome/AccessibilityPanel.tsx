import { Button, Label, Switch } from "@buildkitgg/shadcn-baseui-kit"
import type { AccessibilityFinding, AccessibilityImpact, ContrastDetail, TokenFix } from "@parity-app/agent"
import {
  type ContainerSpec,
  designStates,
  findNode,
  mapNode,
  type ModeSettings,
  shownModes,
  tokenColor
} from "@parity-app/core"
import { kindName, type Selection } from "@parity-app/editor"
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
  TriangleAlert,
  Undo2
} from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor, NodeIcon, nodeColor } from "../canvas/kinds.tsx"
import { setTabOrderShown, useTabOrderShown } from "../canvas/tab-order.ts"
import { type ContainerEntry, useContainerEntry, useHistory, useModeSettings } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { request } from "../service.ts"
import type { ProjectSession } from "../workspace.ts"
import { ruleWords } from "./accessibility-rules.ts"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { Name } from "./Name.tsx"
import { PanelError } from "./PanelError.tsx"

/** A check of one design, kept with what it checked so a later change shows it's out of date. */
type Check = { container: ContainerSpec; modes: ModeSettings } &
  /** Checking again keeps the last check's findings, to show faded until this one's arrive. */
  (
    | { status: "checking"; previous?: DoneCheck }
    | { status: "done"; findings: AccessibilityFinding[]; frames: number; warnings: string[] }
    | { status: "failed"; error: string }
  )

type DoneCheck = Extract<Check, { status: "done" }>

const checks = new Map<string, Check>()
const listeners = new Set<() => void>()
const checkKey = (session: ProjectSession, design: string) => `${session.id}\n${design}`

function setCheck(key: string, check: Check): void {
  checks.set(key, check)

  for (const listener of listeners) {
    listener()
  }
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

/** The findings to show for a check: its own, or while it checks again, the last check's. */
function findingsOf(check: Check | undefined): DoneCheck | undefined {
  if (check?.status === "done") {
    return check
  }

  if (check?.status === "checking") {
    return check.previous
  }

  return undefined
}

/** Renders the design offscreen in every state and shown mode, and checks each frame with axe-core. */
async function runCheck(session: ProjectSession, entry: ContainerEntry): Promise<void> {
  const key = checkKey(session, entry.key)
  const checked = { container: entry.container, modes: session.store.getModes() }
  const checking: Check = { ...checked, status: "checking" }
  const previous = findingsOf(checks.get(key))

  if (previous) {
    checking.previous = previous
  }

  setCheck(key, checking)

  try {
    const result = await request("accessibility.check", { projectId: session.id, design: entry.key })
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
      const words = ruleWords.get(rule)
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
      layer = { nodes: finding.node ? [finding.node] : [], name, detail, frames: [] }

      if (contrast) {
        layer.contrast = contrast
      }

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

        if (existing) {
          existing.nodes.push(...layer.nodes)
        } else {
          alike.set(same, layer)
        }
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
      <div className="type-empty flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-6 py-12 text-center text-muted-foreground">
        <MousePointerClick className="size-5" />
        Select a screen or component to check it.
        <span className="text-xs">Every state and mode is checked.</span>
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
    if (!checks.has(key)) {
      void runCheck(session, entry)
    }
  }, [entry, key, session])

  const checking = check?.status === "checking"
  const stale = check?.status === "done" && changedSince(check, container, modes)
  // While checking again, the last check's findings show faded, like out-of-date ones.
  const shown = findingsOf(check)
  let refreshLabel = "Check again"

  if (checking) {
    refreshLabel = "Checking"
  } else if (stale) {
    refreshLabel = "Check again, out of date"
  }

  const faded = stale || (checking && !!shown)
  const checkAgain = () => void runCheck(session, entry)

  return (
    <>
      {/* The findings scroll above the note, which stays at the panel's foot. */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex items-center gap-2 border-b py-2 pr-2 pl-4">
          <DesignIcon
            kind={container.kind}
            className="size-4 shrink-0"
            style={{ color: designColor(container.kind) }}
          />
          {/* The selection's title, as the Design and Code tabs show it, so switching tabs doesn't resize it. */}
          <Name className="min-w-0 flex-1 text-base font-semibold">{container.name}</Name>
          {shown && shown.findings.length > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {shown.frames === 1 ? "1 preview" : `${shown.frames} previews`}
            </span>
          )}
          <IconButton label={refreshLabel} disabled={checking} onClick={checkAgain} className="relative">
            <RefreshCw className={checking ? "animate-spin" : undefined} />
            {stale && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500" aria-hidden />}
          </IconButton>
        </div>
        <TabOrderSwitch />
        {stale && (
          <div className="flex items-center gap-2 border-b bg-amber-500/10 py-2 pr-2 pl-4 text-xs">
            <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0 flex-1">{`This ${kindName(container.kind)} changed after it was checked.`}</span>
            <Button size="xs" onClick={checkAgain}>
              Check again
            </Button>
          </div>
        )}
        {checking && shown && (
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
            Checking again
          </div>
        )}
        {checking && !shown && (
          <div className="type-empty flex flex-col items-center gap-2 px-6 py-10 text-center text-muted-foreground">
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
        {shown && (
          <div className={faded ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <Findings entry={entry} check={shown} />
          </div>
        )}
      </div>
      {shown && (
        <p className="type-description flex shrink-0 items-start gap-2 border-t px-4 py-3 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>Automated checks miss some issues. Try a keyboard and a screen reader too.</span>
        </p>
      )}
    </>
  )
}

/**
 * Whether the design changed in a way a check would see: its layers, its states or the modes it's shown in. Showing
 * another state on the canvas or moving the design doesn't count.
 */
function changedSince(check: Check, container: ContainerSpec, modes: ModeSettings): boolean {
  const shown = (settings: ModeSettings, design: ContainerSpec) => {
    const { main, beside } = shownModes(settings, design)

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
  const shown = shownModes(check.modes, check.container)
  const modes = [shown.main, ...shown.beside]
  const modeName = (id: string) => modes.find((mode) => mode.id === id)?.name ?? id
  const states = designStates(check.container)
  const stateName = (id: string) => states.find((state) => state.id === id)?.name ?? id

  // Name only what varies: the states when there's one mode, the modes when there's one state.
  const frameName = ({ state, mode }: Frame) => {
    if (modes.length === 1) {
      return stateName(state)
    }

    if (states.length === 1) {
      return modeName(mode)
    }

    return `${stateName(state)} in ${modeName(mode)}`
  }

  let every = "Every state and mode"

  if (modes.length === 1) {
    every = "Every state"
  } else if (states.length === 1) {
    every = "Every mode"
  }

  const frames = check.frames === 1 ? "1 preview" : `${check.frames} previews`

  const toggle = (rule: string) =>
    setCollapsed((current) => {
      const next = new Set(current)

      if (!next.delete(rule)) {
        next.add(rule)
      }

      return next
    })

  return (
    <div className="text-sm">
      {groups.length === 0 ? (
        <div className="type-empty flex flex-col items-center gap-2 px-6 py-10 text-center text-muted-foreground">
          <span className="grid size-9 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="size-5" />
          </span>
          <span className="font-medium text-foreground">No issues found</span>
          <span className="text-xs text-muted-foreground">{frames} checked, in every state and mode.</span>
        </div>
      ) : (
        <ImpactTally groups={groups} />
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
        <p key={warning} className="type-message flex items-start gap-2 px-4 py-2 text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {warning}
        </p>
      ))}
    </div>
  )
}

/**
 * How many rules the design breaks at each impact, worst first, in four even columns so the counts line up at any
 * width. An impact with none is shown faintly, so the columns stay put from one design to the next.
 */
function ImpactTally({ groups }: { groups: RuleGroup[] }) {
  return (
    <ul className="grid grid-cols-4 divide-x border-b" aria-label="Rules broken by impact">
      {impactOrder.map((impact) => {
        const count = groups.filter((group) => group.impact === impact).length
        const { icon: Icon, label, tone } = impactLooks[impact]

        return (
          <li
            key={impact}
            className={`flex flex-col items-center gap-0.5 py-2.5 ${count === 0 ? "text-muted-foreground/50" : tone}`}
          >
            {/* A Figure: a number read at a glance. */}
            <span className="flex items-center gap-1 text-base font-semibold tabular-nums">
              <Icon className="size-3.5" aria-hidden />
              {count}
            </span>
            <span className={`text-2xs ${count === 0 ? "" : "text-muted-foreground"}`}>{label}</span>
          </li>
        )
      })}
    </ul>
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
  onToggle: () => void
  allFrames: number
  /** What to say when a layer breaks the rule in every frame. */
  every: string
  frameName: (frame: Frame) => string
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
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Icon className={`size-4 shrink-0 ${tone}`} aria-label={label} />
        {/*
         * Each rule is one of the panel's sections, so its title is a section title's lead tone, semibold in the text
         * color. PanelSectionTitle can't hold the impact's icon in its fold, so its classes are matched here.
         */}
        <span className="min-w-0 flex-1 pl-0.5 text-xs font-semibold">{group.title}</span>
        {!open && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {layers === 1 ? "1 layer" : `${layers} layers`}
          </span>
        )}
      </button>
      {open && (
        <div className="pr-4 pb-3 pl-[46px]">
          {group.why && <p className="type-description text-muted-foreground">{group.why}</p>}
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
  frameName: (frame: Frame) => string
}) {
  const { selection, store } = useProject()
  const node = layer.nodes[0] === undefined ? undefined : findNode(container.root, layer.nodes[0])
  const name = layer.name ?? `The ${kindName(container.kind)}`
  const view = entry.container.view
  const shownState = view?.state ?? designStates(entry.container)[0]!.id

  const select = (frame: Frame) => {
    if (!view?.allStates && frame.state !== shownState) {
      const state = designStates(container).find((candidate) => candidate.id === frame.state)?.name ?? frame.state
      store.updateView(entry.key, `Show ${state}`, (current) => ({ ...current, state: frame.state }))
    }

    if (layer.nodes.length === 0) {
      selection.set({ design: entry.key })

      return
    }

    const picked: Selection = { design: entry.key, node: layer.nodes[0], state: frame.state, mode: frame.mode }

    if (layer.nodes.length > 1) {
      picked.nodes = layer.nodes
    }

    selection.set(picked)
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
      <div className="pointer-events-none relative flex min-w-0 items-center gap-1.5 text-sm">
        {node ? (
          <NodeIcon node={node} className="size-3.5 shrink-0" style={{ color: nodeColor(node) }} />
        ) : (
          <DesignIcon
            kind={container.kind}
            className="size-3.5 shrink-0"
            style={{ color: designColor(container.kind) }}
          />
        )}
        <Name className="min-w-0 flex-1">{name}</Name>
        {layer.nodes.length > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{layer.nodes.length} layers</span>
        )}
      </div>
      <div className="pointer-events-none relative">
        {layer.contrast ? <ContrastSample contrast={layer.contrast} /> : <Detail text={layer.detail} />}
      </div>
      {layer.contrast?.fix && layer.nodes.length > 0 && (
        <ContrastFixRow entry={entry} nodes={layer.nodes} contrast={layer.contrast} fix={layer.contrast.fix} />
      )}
      <div className="pointer-events-none relative mt-1.5 flex flex-wrap gap-1">
        {inEvery ? (
          <span className="rounded-sm bg-foreground/[0.07] px-1.5 py-px text-2xs text-muted-foreground">{every}</span>
        ) : (
          layer.frames.map((frame) => (
            <Hint key={`${frame.state}:${frame.mode}`} label={`Select it in ${frameName(frame)}`} wait>
              <button
                type="button"
                className="pointer-events-auto rounded-sm bg-foreground/[0.07] px-1.5 py-px text-2xs text-muted-foreground hover:bg-foreground/15 hover:text-foreground"
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
    <p className="type-description mt-0.5 break-words text-muted-foreground">
      {text.split("`").map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="rounded-sm bg-foreground/[0.07] px-1 py-px font-mono text-2xs text-foreground">
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
        className="grid h-9 w-12 shrink-0 place-items-center rounded-md border text-base"
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
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1 font-mono text-2xs/4 text-muted-foreground">
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

/**
 * The project's token that fixes the contrast, drawn on the same background, with Apply to color the layers' text with
 * it as one undoable step. Once applied, Undo shows while that's still the last step.
 */
function ContrastFixRow({
  entry,
  nodes,
  contrast,
  fix
}: {
  entry: ContainerEntry
  nodes: string[]
  contrast: ContrastDetail
  fix: TokenFix | "none"
}) {
  const session = useProject()
  const { undoLabel } = useHistory(session.store)
  const [appliedHere, setAppliedHere] = useState(false)

  if (fix === "none") {
    return (
      <p className="type-description relative mt-1.5 text-muted-foreground">
        None of the project&apos;s colors pass on this background. Try a different background.
      </p>
    )
  }

  const step = `Use ${fix.token}`
  // Another row's fix can take the same step name, so each row knows whether the last step was its own.
  const applied = appliedHere && undoLabel === step

  // A fix is only known to work once it's checked, so the design is checked again as soon as it changes.
  const checkChanged = () => {
    const changed = session.store.getEntry(entry.key)

    if (changed) {
      void runCheck(session, changed)
    }
  }

  const apply = () => {
    setAppliedHere(true)
    session.store.updateContainer(entry.key, step, (container) => ({
      ...container,
      root: nodes.reduce(
        (root, id) =>
          mapNode(root, id, (node) => ({ ...node, style: { ...node.style, color: tokenColor(fix.token) } })),
        container.root
      )
    }))
    checkChanged()
  }

  return (
    <div className="relative mt-1.5 flex items-center gap-2.5">
      <span
        className="grid h-7 w-12 shrink-0 place-items-center rounded-md border text-sm"
        style={{ color: fix.color, background: contrast.background, fontWeight: contrast.bold ? 700 : 500 }}
        aria-hidden
      >
        Aa
      </span>
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex min-w-0 items-baseline gap-1 text-foreground">
          Use
          <code className="truncate rounded-sm bg-foreground/[0.07] px-1 py-px font-mono text-2xs">{fix.token}</code>
        </div>
        <div className="mt-0.5 text-muted-foreground tabular-nums">Reaches {fix.ratio}:1</div>
      </div>
      {applied ? (
        <Button
          size="xs"
          variant="ghost"
          className="pointer-events-auto"
          onClick={() => {
            setAppliedHere(false)
            session.store.undo()
            checkChanged()
          }}
        >
          <Undo2 /> Undo
        </Button>
      ) : (
        <Button size="xs" variant="outline" className="pointer-events-auto" onClick={apply}>
          Apply
        </Button>
      )}
    </div>
  )
}

function Swatch({ color }: { color: string }) {
  return <span className="size-2.5 shrink-0 rounded-[3px] border border-foreground/20" style={{ background: color }} />
}
