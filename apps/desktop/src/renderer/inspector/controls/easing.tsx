/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a curve's handles are sliders on two axes, which no input element is */
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Slider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject, useId, useRef, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { AppSelect } from "../../chrome/AppSelect.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { GroupLabel } from "../../chrome/PanelSection.tsx"
import { EasingArt, easingRange, easingScale, useReducedMotion } from "../../chrome/token-previews.tsx"
import { clamp, formatNumber, sameValue } from "./css-values.ts"
import {
  arrowMoves,
  drag,
  useLiveEdits,
  MissingMark,
  moveThroughRows,
  type Reading,
  type ScrubKeys,
  stepToken,
  tokenNamed,
  useLiveRow,
  useTokens,
  useTokenSets,
  ValueField
} from "./field-parts.tsx"
import { Field, FieldGrid, type Segment, Segments } from "./field-row.tsx"
import { CreateTokenNote } from "./list-parts.tsx"
import {
  type Bezier,
  bezierCss,
  defaultCurve,
  type Easing,
  easingName,
  easingPresets,
  type EasingPlot,
  easingPlot,
  plotCss,
  readEasingValue,
  type Spring,
  springSettle
} from "./motion-data.ts"
import { easingClass, easingIsLong } from "./motion-writes.ts"
import { NumberField } from "./number-field.tsx"
import { Card, PreviewStage } from "./preview-card.tsx"
import { type EasingToken, easingToken, type FieldToken, hexOf } from "./tokens.ts"
import { optionNamed } from "./typing.ts"

/*
 * Easing and spring (PAR-652): a small curve and its name at rest; typed as a preset's name, a token's,
 * `cubic-bezier(…)` or `steps(…)`; and in its popover a tab for each way to set it, each starting with the same graph:
 * Curve, with two handles, the presets and the project's tokens; Steps; and Spring, set by time and bounce or by
 * stiffness, damping and mass, as Framer's springs are. Every curve here is the Tokens panel's easing mark (EasingArt).
 * A spring is written as `linear()`, whose class runs to hundreds of characters, so it offers Create token first, in
 * the token list as any value of its own does and in the note under the field.
 */

const namespace = "ease-"

/** The editor's graph: one size for a curve, steps or a spring. */
const graphSize = 200

/**
 * The room up its side an editor's graph keeps for a curve's handles. They stay inside it, so the scale holds still
 * while they're dragged; a spring that overshoots further widens it.
 */
const graphRoom = { low: -0.25, high: 1.25 }

/**
 * The graph each of the editor's tabs starts with: the easing's mark (EasingArt), as every easing preview draws it, at
 * the editor's size in a box, with a curve's handles put in as `children`. It plays while the editor's open, as a
 * token's detail does.
 */
function EasingGraph({
  plot,
  faint = false,
  duration,
  svgRef,
  children
}: {
  plot: EasingPlot
  faint?: boolean
  /** How long one ride takes, where the easing has a time of its own (a spring's). */
  duration?: number
  svgRef?: RefObject<SVGSVGElement | null>
  children?: ReactNode
}) {
  const reduced = useReducedMotion()

  return (
    <div className="grid place-items-center rounded-md border bg-muted/40 p-2 text-foreground">
      <EasingArt
        value={plotCss(plot)}
        width={graphSize}
        height={graphSize}
        room={graphRoom}
        faint={faint}
        playing={!reduced}
        duration={duration}
        svgRef={svgRef}
      >
        {children}
      </EasingArt>
    </div>
  )
}

/** What a graph comes to, under it: the CSS it writes, or how long a spring takes. */
function GraphCaption({ children }: { children: ReactNode }) {
  return <p className="type-description text-muted-foreground">{children}</p>
}

/**
 * The easing's mark (EasingArt) from a plot, at a field's size: the curve a field, a preset or a transition shows, which
 * plays while it's live (hovered or focused).
 */
export function CurveThumb({
  plot,
  faint = false,
  size = 16,
  playing = false,
  duration
}: {
  plot: EasingPlot
  faint?: boolean
  size?: number
  playing?: boolean
  /** How long one ride takes, where it's a real one (a transition's duration). */
  duration?: number
}) {
  return (
    <EasingArt value={plotCss(plot)} width={size} height={size} faint={faint} playing={playing} duration={duration} />
  )
}

/** Tailwind's easings as the token list offers them: by the class each writes, drawn from its own curve. */
const presetTokens: FieldToken[] = easingPresets.map((preset) => ({
  name: easingClass({ keyword: preset.keyword }),
  kind: "easing",
  value: bezierCss(preset.curve),
  detail: preset.label
}))

/** The easing a token list's name stands for: one of Tailwind's by its class, or a project token. */
function picked(name: string): Easing {
  const preset = easingPresets.find((option) => easingClass({ keyword: option.keyword }) === name)

  return preset ? { keyword: preset.keyword } : { token: name }
}

/** Reads an easing typed: a preset's name, a token's, `cubic-bezier(…)` or `steps(…)`. */
function readEasing(text: string, tokens: readonly EasingToken[]): Easing | undefined {
  const words = text
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_]+/g, "-")

  const preset = easingPresets.find(
    (option) =>
      option.keyword === words ||
      option.label.toLowerCase().replaceAll(" ", "-") === words ||
      `ease-${option.keyword}` === words
  )

  if (preset) {
    return { keyword: preset.keyword }
  }

  const token = tokenNamed(tokens, words, namespace)

  if (token) {
    return { token: token.name }
  }

  if (readEasingValue(text)) {
    return { value: text.trim().replaceAll(/\s+/g, " ") }
  }

  return undefined
}

export function EasingField({
  label,
  value,
  mixed,
  defaultOpen = false,
  defaultTab = "curve",
  onChange
}: {
  label: string
  value: Easing | undefined
  mixed?: boolean
  defaultOpen?: boolean
  defaultTab?: EditorTab
  onChange: (value: Easing | undefined) => void
}) {
  const { tokens, create } = useTokens("easing")
  const [open, setOpen] = useState(defaultOpen)
  const name = value !== undefined && "token" in value ? value.token : undefined
  const token = name === undefined ? undefined : tokens.find((other) => other.name === name)
  const plot = easingPlot(value, tokens)
  let comesTo = token?.detail

  if (value !== undefined && "value" in value && plot.kind === "bezier") {
    comesTo = plot.curve.join(", ")
  }

  let current = name

  if (value !== undefined && "keyword" in value) {
    current = easingClass(value)
  }

  // One of Tailwind's easings is a chip, as a project token is, since the list offers both alike: Backspace takes it
  // off whole and typing replaces it, rather than its name being text to erase a letter at a time.
  const preset = presetTokens.find((option) => option.name === current)
  const chipName = name ?? preset?.name

  if (preset) {
    comesTo = preset.detail
  }

  // Up and Down go through Tailwind's easings, then the project's, in order, Shift to the first or last; a curve of its
  // own or none steps from Ease in out.
  const listed = [...presetTokens, ...tokens]

  const step = (up: boolean, { shift }: ScrubKeys) => {
    const held =
      listed.find((option) => option.name === current) ??
      presetTokens.find((option) => option.name === easingClass({ keyword: "ease-in-out" }))

    if (held) {
      onChange(picked(stepToken(listed, held, up, shift).name))
    }
  }

  const read = (text: string): Reading<Easing | undefined> => {
    if (text.trim() === "") {
      return { value: undefined }
    }

    const easing = readEasing(text, tokens)

    if (!easing) {
      return { reason: `Enter a preset, a token, cubic-bezier() or steps()` }
    }

    return { value: easing }
  }

  const isTaken = (full: string) => tokenNamed(tokens, full) !== undefined
  // A curve or spring of its own, which Create token makes a token of.
  const own = value !== undefined && ("spring" in value || "value" in value) ? value : undefined

  // Makes a token of the easing of its own, by the whole name given (`ease-springy`), and takes it.
  const saveToken = (full: string) => {
    if (!create || own === undefined) {
      return
    }

    const curve = plot.kind === "bezier" ? plot.curve : undefined
    create(easingToken(full, curve, "spring" in own ? own.spring : undefined))
    onChange({ token: full })
  }

  // While the field's hovered or focused, its curve plays, as a transition entry's does.
  const { live, rowProps } = useLiveRow()

  const editor = (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={`Edit ${label.toLowerCase()}`}>
        <PopoverTrigger
          aria-label={`Edit ${label.toLowerCase()}: ${easingName(value)}`}
          className="-ml-0.5 grid size-5 shrink-0 place-items-center rounded outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
        >
          <CurveThumb plot={plot} faint={value === undefined} playing={live(label)} />
        </PopoverTrigger>
      </Hint>
      <PopoverContent aria-label={label} className="w-72 gap-0 p-0" align="start">
        <EasingEditor
          value={value}
          tokens={tokens}
          defaultTab={defaultTab}
          onChange={onChange}
          isTaken={isTaken}
          onSave={saveToken}
        />
      </PopoverContent>
    </Popover>
  )

  return (
    <div className="flex min-w-0 flex-col gap-1" {...rowProps(label)}>
      <ValueField
        label={label}
        inner={editor}
        shown={value === undefined || chipName !== undefined ? undefined : easingName(value)}
        placeholder="Default"
        mixed={mixed}
        chip={
          chipName === undefined
            ? undefined
            : { name: chipName, token: token ?? preset, namespace, onRemove: () => onChange(undefined) }
        }
        comesTo={comesTo}
        status={{ missing: name !== undefined && !token ? <MissingMark name={name} /> : undefined }}
        own={
          own === undefined
            ? undefined
            : { text: easingName(own), namespace, onCreate: create === undefined ? undefined : saveToken }
        }
        tokens={{
          list: listed,
          current,
          onPick: (next) => {
            if (next) {
              onChange(picked(next))
            }
          }
        }}
        inputMode="text"
        read={read}
        onCommit={onChange}
        onStep={step}
      />
      {/* The editor says it too, so it isn't left under the open popover. */}
      {!open && value !== undefined && easingIsLong(value) && (
        <CreateTokenNote
          says={writtenLong(value)}
          namespace={namespace}
          placeholder="springy"
          isTaken={isTaken}
          onSave={saveToken}
        />
      )}
    </div>
  )
}

/**
 * Why a long easing is written as an arbitrary value, said as the shadow list and a repeating gradient say theirs, before
 * Create token.
 */
const writtenLong = (easing: Easing) =>
  "spring" in easing
    ? "Tailwind has no utility for springs, so this is written as an arbitrary value."
    : "Tailwind has no utility for this curve, so it's written as an arbitrary value."

/** The note and Create token under a value written long, by the name the transition list knows it by. */

const defaultSprings = {
  time: { duration: 400, bounce: 0.2 },
  physics: { stiffness: 170, damping: 26, mass: 1 }
} as const

/** How a spring is set: by time and bounce, or by its physics. */
const springModes = ["time", "physics"] as const

const springModeItems = [
  { value: "time", label: "Time and bounce" },
  { value: "physics", label: "Physics" }
]

/** The popover's tabs: each a way to set an easing, with its own graph and what sets it. */
const editorTabs = ["curve", "steps", "spring"] as const

type EditorTab = (typeof editorTabs)[number]

/** The steps a Steps tab shows before any are set. */
const defaultSteps: Extract<EasingPlot, { kind: "steps" }> = { kind: "steps", count: 4, jump: "end" }

/** Where each step's jump comes: at its start or its end. */
const jumps = [
  { value: "start", label: "Start", detail: "Each step jumps as it starts: steps(n, jump-start)" },
  { value: "end", label: "End", detail: "Each step jumps as it ends: steps(n)" }
] as const satisfies readonly Segment<"start" | "end">[]

/** The popover: Curve, with the presets, the project's tokens and Steps; and Spring. */
function EasingEditor({
  value,
  tokens,
  defaultTab,
  onChange,
  isTaken,
  onSave
}: {
  value: Easing | undefined
  tokens: readonly EasingToken[]
  defaultTab: EditorTab
  onChange: (value: Easing) => void
  isTaken: (full: string) => boolean
  /** Makes a token of the easing, by the whole name given. */
  onSave: (full: string) => void
}) {
  const [tab, setTab] = useState<EditorTab>(() => {
    if (value !== undefined && "spring" in value) {
      return "spring"
    }

    return easingPlot(value, tokens).kind === "steps" ? "steps" : defaultTab
  })

  const plot = easingPlot(value, tokens)
  const spring = value !== undefined && "spring" in value ? value.spring : undefined
  const isSelected = (option: Easing) => sameValue(option, value)
  const { live, rowProps } = useLiveRow()

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        const picked = optionNamed(editorTabs, next)

        if (picked) {
          setTab(picked)
        }
      }}
    >
      <TabsList className="m-2 mb-0 w-[calc(100%-1rem)]">
        <TabsTrigger value="curve" className="text-xs">
          Curve
        </TabsTrigger>
        <TabsTrigger value="steps" className="text-xs">
          Steps
        </TabsTrigger>
        <TabsTrigger value="spring" className="text-xs">
          Spring
        </TabsTrigger>
      </TabsList>
      <TabsContent value="curve" className="flex flex-col gap-2 p-2">
        {/* Each tab starts with its graph, drawn the same, and what sets it comes under it. One the easing isn't yet
            shows its default, faint, as Spring does. */}
        <CurveEditor
          curve={plot.kind === "bezier" ? plot.curve : defaultCurve}
          faint={value === undefined || plot.kind !== "bezier"}
          onChange={(curve) => onChange({ value: bezierCss(curve) })}
        />
        {/* One list to pick from, as a token menu is: the current one marked, Up and Down moving through every row,
            Home and End to the first and last. */}
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the arrow keys of the buttons inside, handled once for them all */}
        <div className="flex flex-col gap-2" onKeyDown={moveThroughRows}>
          <div className="grid grid-cols-2 gap-1">
            {easingPresets.map((preset) => (
              <Button
                key={preset.keyword}
                variant={isSelected({ keyword: preset.keyword }) ? "secondary" : "ghost"}
                size="sm"
                aria-current={isSelected({ keyword: preset.keyword }) || undefined}
                className="h-7 justify-start gap-1.5 px-1.5 text-xs"
                onClick={() => onChange({ keyword: preset.keyword })}
                {...rowProps(preset.keyword)}
              >
                <CurveThumb plot={{ kind: "bezier", curve: preset.curve }} playing={live(preset.keyword)} />
                {preset.label}
              </Button>
            ))}
          </div>
          {tokens.length > 0 && (
            <div className="flex flex-col gap-1">
              <GroupLabel as="p" className="px-1">
                {"The project's easings"}
              </GroupLabel>
              <div className="grid grid-cols-2 gap-1">
                {tokens.map((token) => (
                  <Button
                    key={token.name}
                    variant={isSelected({ token: token.name }) ? "secondary" : "ghost"}
                    size="sm"
                    aria-current={isSelected({ token: token.name }) || undefined}
                    className="h-7 justify-start gap-1.5 px-1.5 text-xs"
                    onClick={() => onChange({ token: token.name })}
                    {...rowProps(token.name)}
                  >
                    <CurveThumb plot={easingPlot({ token: token.name }, tokens)} playing={live(token.name)} />
                    {token.name.replace(/^ease-/, "")}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="steps" className="flex flex-col gap-2 p-2">
        <StepsEditor plot={plot.kind === "steps" ? plot : undefined} onChange={onChange} />
      </TabsContent>
      <TabsContent value="spring" className="flex flex-col gap-2 p-2">
        <SpringEditor spring={spring} onChange={(next) => onChange({ spring: next })} />
        {spring && (
          <CreateTokenNote
            says={writtenLong({ spring })}
            namespace={namespace}
            placeholder="springy"
            isTaken={isTaken}
            onSave={onSave}
          />
        )}
      </TabsContent>
    </Tabs>
  )
}

/** A number to two decimals, as a curve's handles are kept. */
const hundredths = (value: number) => Number(formatNumber(value, 2))

/** The curve, with its two handles dragged or moved with the arrow keys (0.01, Shift 0.1). */
function CurveEditor({
  curve,
  faint = false,
  onChange
}: {
  curve: Bezier
  faint?: boolean
  onChange: (curve: Bezier) => void
}) {
  const live = useLiveEdits()
  const box = useRef<SVGSVGElement>(null)
  const plot: EasingPlot = { kind: "bezier", curve }
  // The handles go on the scale the graph draws the curve on, so they land on it.
  const { low, high } = easingRange(plotCss(plot), graphRoom.low, graphRoom.high)
  const { x, y, pad, across } = easingScale(graphSize, graphSize, low, high)

  const move = (handle: 0 | 1, toX: number, toY: number) => {
    const next: Bezier = [...curve]
    next[handle * 2] = hundredths(clamp(toX, 0, 1))
    next[handle * 2 + 1] = hundredths(clamp(toY, low, high))
    onChange(next)
  }

  const press = (handle: 0 | 1) => (event: PointerEvent<SVGCircleElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    drag(event, {
      runs: live,
      move: ({ clientX, clientY }) => {
        const rect = box.current!.getBoundingClientRect()
        const scale = graphSize / rect.width
        const px = (clientX - rect.left) * scale
        const py = (clientY - rect.top) * scale
        move(handle, (px - pad) / across, high - ((py - pad) / across) * (high - low))
      }
    })
  }

  const key = (handle: 0 | 1) => (event: KeyboardEvent<SVGCircleElement>) => {
    const arrow = arrowMoves.get(event.key)

    if (!arrow) {
      return
    }

    event.preventDefault()
    const step = event.shiftKey ? 0.1 : 0.01
    // Up raises the curve, though it's down the screen that y counts.
    move(handle, curve[handle * 2]! + arrow[0] * step, curve[handle * 2 + 1]! - arrow[1] * step)
  }

  const handles = [
    { from: [0, 0], at: [curve[0], curve[1]], name: "First handle" },
    { from: [1, 1], at: [curve[2], curve[3]], name: "Second handle" }
  ] as const

  return (
    <div className="flex flex-col gap-2">
      <EasingGraph plot={plot} faint={faint} svgRef={box}>
        {handles.map((handle, index) => (
          <g key={handle.name}>
            <line
              x1={x(handle.from[0])}
              y1={y(handle.from[1])}
              x2={x(handle.at[0])}
              y2={y(handle.at[1])}
              stroke={kindColors.layer}
              strokeWidth={1.5}
            />
            <circle
              role="slider"
              tabIndex={0}
              aria-label={handle.name}
              // Both axes are in the words; the number is y, within the room the graph keeps.
              aria-valuemin={low}
              aria-valuemax={high}
              aria-valuenow={handle.at[1]}
              aria-valuetext={`x ${handle.at[0]}, y ${handle.at[1]}`}
              cx={x(handle.at[0])}
              cy={y(handle.at[1])}
              r={6}
              fill="white"
              stroke={kindColors.layer}
              strokeWidth={2}
              onPointerDown={press(index === 0 ? 0 : 1)}
              onKeyDown={key(index === 0 ? 0 : 1)}
              className="cursor-grab outline-none focus-visible:stroke-[3]"
            />
          </g>
        ))}
      </EasingGraph>
      <GraphCaption>
        <code className="font-mono">{bezierCss(curve)}</code>
      </GraphCaption>
    </div>
  )
}

/** Steps: how many, and whether the first jump comes at the start or the end of each. */
function StepsEditor({
  plot,
  onChange
}: {
  plot: Extract<EasingPlot, { kind: "steps" }> | undefined
  onChange: (value: Easing) => void
}) {
  const shown = plot ?? defaultSteps

  const write = (count: number, jump: "start" | "end") =>
    onChange({ value: jump === "end" ? `steps(${count})` : `steps(${count}, jump-start)` })

  const count = (next: number | undefined) => next !== undefined && write(next, shown.jump)

  return (
    <div className="flex flex-col gap-2">
      <EasingGraph plot={shown} faint={plot === undefined} />
      <GraphCaption>
        <code className="font-mono">{plotCss(shown)}</code>
      </GraphCaption>
      <FieldGrid>
        <Field label="Steps" half>
          <NumberField label="Steps" whole min={1} past="refuse" required value={shown.count} onChange={count} />
        </Field>
        <Field label="Jump at" half>
          <Segments label="Jump at" value={shown.jump} options={jumps} onChange={(jump) => write(shown.count, jump)} />
        </Field>
      </FieldGrid>
    </div>
  )
}

/** Spring: by time and bounce, or by stiffness, damping and mass, with the curve and how long it takes to settle. */
function SpringEditor({ spring, onChange }: { spring: Spring | undefined; onChange: (spring: Spring) => void }) {
  const mode = spring !== undefined && "stiffness" in spring ? "physics" : "time"
  const shown = spring ?? defaultSprings.time
  const id = useId()

  return (
    <div className="flex flex-col gap-2">
      {/* It rides at the spring's own time, which is the transition's duration. */}
      <EasingGraph
        plot={easingPlot({ spring: shown }, [])}
        faint={spring === undefined}
        duration={springSettle(shown)}
      />
      <GraphCaption>Settles in {springSettle(shown)}ms, which is the duration.</GraphCaption>
      {/* How it's set is a choice among its rows, as its numbers are, rather than tabs inside the popover's tabs. */}
      <div className="grid grid-cols-[60px_minmax(0,1fr)] items-center gap-2">
        <span id={id} className="text-xs text-muted-foreground">
          Set by
        </span>
        <AppSelect
          variant="panel"
          aria-labelledby={id}
          className="w-full"
          items={springModeItems}
          value={mode}
          onValueChange={(next) => {
            const picked = optionNamed(springModes, next ?? undefined)

            if (picked && picked !== mode) {
              onChange({ ...defaultSprings[picked] })
            }
          }}
        />
      </div>
      {"duration" in shown ? (
        <>
          <SpringNumber
            label="Time"
            unit="ms"
            value={shown.duration}
            min={50}
            max={2000}
            step={10}
            onChange={(duration) => onChange({ duration, bounce: shown.bounce })}
          />
          <SpringNumber
            label="Bounce"
            value={shown.bounce}
            min={0}
            max={0.9}
            step={0.05}
            onChange={(bounce) => onChange({ duration: shown.duration, bounce })}
          />
        </>
      ) : (
        <>
          <SpringNumber
            label="Stiffness"
            value={shown.stiffness}
            min={1}
            max={1000}
            step={1}
            onChange={(stiffness) => onChange({ ...shown, stiffness })}
          />
          <SpringNumber
            label="Damping"
            value={shown.damping}
            min={1}
            max={100}
            step={1}
            onChange={(damping) => onChange({ ...shown, damping })}
          />
          <SpringNumber
            label="Mass"
            value={shown.mass}
            min={0.1}
            max={10}
            step={0.1}
            onChange={(mass) => onChange({ ...shown, mass })}
          />
        </>
      )}
    </div>
  )
}

/** One of a spring's numbers: typed, stepped, or dragged on its slider, kept within its range on its steps. */
function SpringNumber({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string
  unit?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  const id = useId()
  const set = (next: number) => onChange(clamp(Number(formatNumber(Math.round(next / step) * step)), min, max))

  return (
    <div className="grid grid-cols-[60px_72px_minmax(0,1fr)] items-center gap-2">
      <span id={id} className="text-xs text-muted-foreground">
        {label}
      </span>
      <NumberField
        label={label}
        min={min}
        max={max}
        places={2}
        required
        unit={unit}
        step={step}
        scrubs={false}
        value={value}
        placeholder={String(min)}
        narrow
        onChange={(next) => next !== undefined && set(next)}
      />
      <Slider
        aria-labelledby={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => {
          // SAFETY: the slider has one thumb, so a value that isn't a list of one is that thumb's number.
          set(Array.isArray(next) ? next[0]! : (next as number))
        }}
      />
    </div>
  )
}

/**
 * A card that moves when the pointer is over it, or when Play is pressed, with a transition, so an easing, duration
 * and delay can be felt. What it changes on hover follows what the transition covers. It's drawn on the preview
 * stage, so a change of opacity or shadow shows against the shapes behind.
 */
export function HoverCard({
  transition,
  changes = ["transform"]
}: {
  transition: string
  changes?: readonly ("colors" | "opacity" | "transform" | "shadow")[]
}) {
  const [on, setOn] = useState(false)
  const colors = useTokenSets().color
  const colored = on && changes.includes("colors")

  return (
    <div className="flex flex-col items-start gap-3">
      <PreviewStage>
        <div
          className="relative h-24 w-56 rounded-lg border border-dashed border-muted-foreground/40 p-3"
          onPointerEnter={() => setOn(true)}
          onPointerLeave={() => setOn(false)}
        >
          <Card
            style={{
              width: 80,
              height: 64,
              borderRadius: 8,
              transition,
              translate: on && changes.includes("transform") ? "120px 0" : "0 0",
              opacity: on && changes.includes("opacity") ? 0.35 : 1,
              backgroundColor: hexOf(colored ? "blue-600" : "card", colors),
              color: hexOf(colored ? "primary-foreground" : "foreground", colors),
              boxShadow:
                on && changes.includes("shadow") ? "0 12px 24px -4px rgb(0 0 0 / 0.35)" : "0 1px 2px rgb(0 0 0 / 0.1)"
            }}
          />
        </div>
      </PreviewStage>
      <Button variant="outline" size="sm" className="h-7 text-xs" aria-pressed={on} onClick={() => setOn(!on)}>
        {on ? "Play back" : "Play"}
      </Button>
      <p className="type-description text-muted-foreground">Point at the card, or press Play, to see it change.</p>
    </div>
  )
}
