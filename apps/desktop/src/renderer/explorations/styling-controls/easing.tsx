/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a curve's handles are sliders on two axes, which no input element is */
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Slider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { type KeyboardEvent, type PointerEvent, useId, useRef, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { clamp, formatNumber } from "./css-values.ts"
import { drag, MissingMark, type Reading, readUnitNumber, useTokens, useTokenSets, ValueField } from "./field-parts.tsx"
import {
  type Bezier,
  bezierCss,
  defaultCurve,
  type Easing,
  easingName,
  easingPresets,
  type EasingShape,
  easingShape,
  readEasingValue,
  type Spring,
  springSettle
} from "./motion-data.ts"
import { easingClass, easingIsLong } from "./motion-writes.ts"
import { Card, PreviewStage } from "./playground.tsx"
import { type EasingToken, easingToken, type FieldToken, hexOf } from "./tokens.ts"

/*
 * Easing and spring (PAR-652): a small curve and its name at rest; typed as a preset's name, a token's,
 * `cubic-bezier(…)` or `steps(…)`; and in its popover the curve with two handles, the presets and the project's
 * tokens, Steps, and Spring, set by time and bounce or by stiffness, damping and mass, as Framer's springs are. A spring
 * is written as `linear()`, whose class runs to hundreds of characters, so it offers Save as token first.
 */

const namespace = "ease-"

/** An easing's path in a box of `width` by `height`, with room above and below for overshoot. */
function shapePath(shape: EasingShape, width: number, height: number, low: number, high: number): string {
  const x = (value: number) => value * width
  const y = (value: number) => ((high - value) / (high - low)) * height
  if (shape.kind === "bezier") {
    const [x1, y1, x2, y2] = shape.curve
    return `M0,${y(0)} C${x(x1)},${y(y1)} ${x(x2)},${y(y2)} ${x(1)},${y(1)}`
  }
  if (shape.kind === "steps") {
    const parts = [`M0,${y(0)}`]
    for (let index = 0; index < shape.count; index++) {
      const level = (index + (shape.jump === "start" ? 1 : 0)) / shape.count
      const start = index / shape.count
      parts.push(`L${x(start)},${y(level)}`, `L${x((index + 1) / shape.count)},${y(level)}`)
    }
    parts.push(`L${x(1)},${y(1)}`)
    return parts.join(" ")
  }
  return shape.values
    .map((value, index) => `${index === 0 ? "M" : "L"}${x(index / (shape.values.length - 1))},${y(value)}`)
    .join(" ")
}

/** How far a shape reaches below 0 and above 1, so it's drawn whole. */
function reach(shape: EasingShape): { low: number; high: number } {
  if (shape.kind === "bezier") {
    return { low: Math.min(0, shape.curve[1], shape.curve[3]), high: Math.max(1, shape.curve[1], shape.curve[3]) }
  }
  if (shape.kind === "samples") return { low: Math.min(0, ...shape.values), high: Math.max(1, ...shape.values) }
  return { low: 0, high: 1 }
}

/**
 * The small curve an easing shows at rest and in its editor. The Tokens panel's own preview draws a token's curve in
 * the token list and the chip; this one draws steps too, which a value of its own can be.
 */
export function CurveThumb({
  shape,
  faint = false,
  size = 16
}: {
  shape: EasingShape
  faint?: boolean
  size?: number
}) {
  const { low, high } = reach(shape)
  return (
    <svg aria-hidden width={size} height={size} viewBox={`-1 -1 ${size + 2} ${size + 2}`} className="shrink-0">
      <rect x={0} y={0} width={size} height={size} rx={2} className="fill-muted-foreground/10" />
      <path
        d={shapePath(shape, size, size, low, high)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        className={faint ? "text-muted-foreground/60" : "text-foreground"}
      />
    </svg>
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
  if (preset) return { keyword: preset.keyword }
  const token = tokens.find((option) => option.name === words || option.name === namespace + words)
  if (token) return { token: token.name }
  if (readEasingValue(text)) return { value: text.trim().replaceAll(/\s+/g, " ") }
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
  defaultTab?: "curve" | "spring"
  onChange: (value: Easing | undefined) => void
}) {
  const { tokens, create } = useTokens("easing")
  const [open, setOpen] = useState(defaultOpen)
  const name = value !== undefined && "token" in value ? value.token : undefined
  const token = name === undefined ? undefined : tokens.find((other) => other.name === name)
  const shape = easingShape(value, tokens)
  let comesTo = token?.detail
  if (value !== undefined && "value" in value && shape.kind === "bezier") comesTo = shape.curve.join(", ")
  let current = name
  if (value !== undefined && "keyword" in value) current = easingClass(value)
  // Up and Down go through Tailwind's easings, then the project's, in order.
  const order: Easing[] = [
    ...easingPresets.map((preset) => ({ keyword: preset.keyword })),
    ...tokens.map((other) => ({ token: other.name }))
  ]
  const step = (up: boolean) => {
    const index = order.findIndex((option) => JSON.stringify(option) === JSON.stringify(value))
    const from =
      index === -1 ? order.findIndex((option) => "keyword" in option && option.keyword === "ease-in-out") : index
    onChange(order[clamp(from + (up ? 1 : -1), 0, order.length - 1)])
  }
  const read = (text: string): Reading<Easing | undefined> => {
    if (text.trim() === "") return { value: undefined }
    const easing = readEasing(text, tokens)
    if (!easing)
      return { reason: `${label} takes a preset such as Ease out, a token's name, cubic-bezier() or steps()` }
    return { value: easing }
  }
  const isTaken = (taken: string) => tokens.some((other) => other.name === taken || other.name === namespace + taken)
  const saveToken = (made: string) => {
    if (!create || value === undefined || !("spring" in value || "value" in value)) return
    const full = made.startsWith(namespace) ? made : namespace + made
    const curve = shape.kind === "bezier" ? shape.curve : undefined
    create(easingToken(full, curve, "spring" in value ? value.spring : undefined))
    onChange({ token: full })
  }
  const editor = (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={`Edit ${label.toLowerCase()}`}>
        <PopoverTrigger
          aria-label={`Edit ${label.toLowerCase()}: ${easingName(value)}`}
          className="-ml-0.5 grid size-5 shrink-0 place-items-center rounded outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
        >
          <CurveThumb shape={shape} faint={value === undefined} />
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-72 gap-0 p-0" align="start">
        <EasingEditor value={value} tokens={tokens} defaultTab={defaultTab} onChange={onChange} onSave={saveToken} />
      </PopoverContent>
    </Popover>
  )
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <ValueField
        label={label}
        inner={editor}
        shown={value === undefined || name !== undefined ? undefined : easingName(value)}
        placeholder="Default"
        mixed={mixed}
        chip={name === undefined ? undefined : { name, token, namespace, onRemove: () => onChange(undefined) }}
        comesTo={comesTo}
        status={{ missing: name !== undefined && !token ? <MissingMark name={name} /> : undefined }}
        tokens={{
          list: [...presetTokens, ...tokens],
          current,
          onPick: (next) => {
            if (next) onChange(picked(next))
          }
        }}
        inputMode="text"
        read={read}
        onCommit={onChange}
        onStep={(up) => step(up)}
      />
      {/* The editor says it too, so it isn't left under the open popover. */}
      {!open && value !== undefined && easingIsLong(value) && (
        <SaveAsToken
          says={`Writes a ${easingClass(value).length}-character class.`}
          placeholder="springy"
          isTaken={isTaken}
          onSave={saveToken}
        />
      )}
    </div>
  )
}

/** Says a class runs long and offers to save it as a token, named in a small popover. */
export function SaveAsToken({
  says,
  placeholder,
  isTaken,
  onSave
}: {
  says: string
  placeholder: string
  isTaken: (name: string) => boolean
  onSave: (name: string) => void
}) {
  const [name, setName] = useState("")
  const [open, setOpen] = useState(false)
  const id = useId()
  const taken = name.trim() !== "" && isTaken(name.trim())
  const save = () => {
    if (name.trim() === "" || taken) return
    onSave(name.trim())
    setOpen(false)
    setName("")
  }
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-[11px] leading-snug text-muted-foreground">
      {says}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="text-foreground underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring">
          Save as token
        </PopoverTrigger>
        <PopoverContent className="w-56 gap-2 p-2" align="start">
          <label htmlFor={id} className="text-xs font-medium">
            Token name
          </label>
          <Input
            id={id}
            value={name}
            placeholder={placeholder}
            aria-invalid={taken || undefined}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save()
            }}
            className="h-7 text-xs"
          />
          {taken && <p className="text-[11px] text-destructive">A token has that name already.</p>}
          <Button size="sm" className="h-7 text-xs" disabled={name.trim() === "" || taken} onClick={save}>
            Save
          </Button>
        </PopoverContent>
      </Popover>
    </p>
  )
}

const defaultSprings = {
  time: { duration: 400, bounce: 0.2 },
  physics: { stiffness: 170, damping: 26, mass: 1 }
} as const

/** The popover: Curve, with the presets, the project's tokens and Steps; and Spring. */
function EasingEditor({
  value,
  tokens,
  defaultTab,
  onChange,
  onSave
}: {
  value: Easing | undefined
  tokens: readonly EasingToken[]
  defaultTab: "curve" | "spring"
  onChange: (value: Easing) => void
  onSave: (name: string) => void
}) {
  const [tab, setTab] = useState<"curve" | "spring">(value !== undefined && "spring" in value ? "spring" : defaultTab)
  const shape = easingShape(value, tokens)
  const spring = value !== undefined && "spring" in value ? value.spring : undefined
  const isSelected = (option: Easing) => JSON.stringify(option) === JSON.stringify(value)
  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as "curve" | "spring")}>
      <TabsList className="m-2 mb-0 w-[calc(100%-1rem)]">
        <TabsTrigger value="curve" className="text-xs">
          Curve
        </TabsTrigger>
        <TabsTrigger value="spring" className="text-xs">
          Spring
        </TabsTrigger>
      </TabsList>
      <TabsContent value="curve" className="flex flex-col gap-2 p-2">
        <div className="grid grid-cols-2 gap-1">
          {easingPresets.map((preset) => (
            <Button
              key={preset.keyword}
              variant={isSelected({ keyword: preset.keyword }) ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={isSelected({ keyword: preset.keyword })}
              className="h-7 justify-start gap-1.5 px-1.5 text-xs"
              onClick={() => onChange({ keyword: preset.keyword })}
            >
              <CurveThumb shape={{ kind: "bezier", curve: preset.curve }} />
              {preset.label}
            </Button>
          ))}
        </div>
        {tokens.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="px-1 text-[11px] text-muted-foreground">{"The project's easings"}</p>
            <div className="grid grid-cols-2 gap-1">
              {tokens.map((token) => (
                <Button
                  key={token.name}
                  variant={isSelected({ token: token.name }) ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={isSelected({ token: token.name })}
                  className="h-7 justify-start gap-1.5 px-1.5 text-xs"
                  onClick={() => onChange({ token: token.name })}
                >
                  <CurveThumb shape={easingShape({ token: token.name }, tokens)} />
                  {token.name.replace(/^ease-/, "")}
                </Button>
              ))}
            </div>
          </div>
        )}
        {shape.kind === "steps" ? (
          <StepsEditor shape={shape} onChange={onChange} />
        ) : (
          <CurveEditor
            curve={shape.kind === "bezier" ? shape.curve : defaultCurve}
            onChange={(curve) => onChange({ value: bezierCss(curve) })}
          />
        )}
        {shape.kind !== "steps" && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange({ value: "steps(4)" })}>
            Steps
          </Button>
        )}
      </TabsContent>
      <TabsContent value="spring" className="flex flex-col gap-2 p-2">
        <SpringEditor spring={spring} onChange={(next) => onChange({ spring: next })} />
        {spring && (
          <SaveAsToken
            says={`Writes a ${easingClass({ spring }).length}-character class.`}
            placeholder="springy"
            isTaken={(name) => tokens.some((other) => other.name === name || other.name === namespace + name)}
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
function CurveEditor({ curve, onChange }: { curve: Bezier; onChange: (curve: Bezier) => void }) {
  const box = useRef<SVGSVGElement>(null)
  const size = 200
  const pad = 20
  const low = -0.25
  const high = 1.25
  const inner = size - pad * 2
  const x = (value: number) => pad + value * inner
  const y = (value: number) => pad + ((high - value) / (high - low)) * inner
  const move = (handle: 0 | 1, toX: number, toY: number) => {
    const next: Bezier = [...curve]
    next[handle * 2] = hundredths(clamp(toX, 0, 1))
    next[handle * 2 + 1] = hundredths(clamp(toY, low, high))
    onChange(next)
  }
  const press = (handle: 0 | 1) => (event: PointerEvent<SVGCircleElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    drag(event, {
      move: ({ clientX, clientY }) => {
        const rect = box.current!.getBoundingClientRect()
        const scale = size / rect.width
        const px = (clientX - rect.left) * scale
        const py = (clientY - rect.top) * scale
        move(handle, (px - pad) / inner, high - ((py - pad) / inner) * (high - low))
      }
    })
  }
  const key = (handle: 0 | 1) => (event: KeyboardEvent<SVGCircleElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01
    const hx = curve[handle * 2]!
    const hy = curve[handle * 2 + 1]!
    if (event.key === "ArrowLeft") move(handle, hx - step, hy)
    else if (event.key === "ArrowRight") move(handle, hx + step, hy)
    else if (event.key === "ArrowUp") move(handle, hx, hy + step)
    else if (event.key === "ArrowDown") move(handle, hx, hy - step)
    else return
    event.preventDefault()
  }
  const handles = [
    { from: [0, 0], at: [curve[0], curve[1]], name: "First handle" },
    { from: [1, 1], at: [curve[2], curve[3]], name: "Second handle" }
  ] as const
  return (
    <div className="flex flex-col items-center gap-1">
      <svg ref={box} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="touch-none">
        <rect x={x(0)} y={y(1)} width={inner} height={y(0) - y(1)} className="fill-muted/40 stroke-border" />
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="stroke-border" strokeDasharray="3 3" />
        <path
          d={`M${x(0)},${y(0)} C${x(curve[0])},${y(curve[1])} ${x(curve[2])},${y(curve[3])} ${x(1)},${y(1)}`}
          fill="none"
          className="stroke-foreground"
          strokeWidth={2}
        />
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
      </svg>
      <code className="text-[11px] text-muted-foreground">{bezierCss(curve)}</code>
    </div>
  )
}

/** Steps: how many, and whether the first jump comes at the start or the end of each. */
function StepsEditor({
  shape,
  onChange
}: {
  shape: Extract<EasingShape, { kind: "steps" }>
  onChange: (value: Easing) => void
}) {
  const id = useId()
  const write = (count: number, jump: "start" | "end") =>
    onChange({ value: jump === "end" ? `steps(${count})` : `steps(${count}, jump-start)` })
  return (
    <div className="flex flex-col gap-2">
      <div className="grid place-items-center rounded-md border bg-muted/40 p-2">
        <CurveThumb shape={shape} size={96} />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="w-12 text-xs text-muted-foreground">
          Steps
        </label>
        <Input
          id={id}
          type="number"
          min={1}
          value={shape.count}
          onChange={(event) => {
            const count = Math.max(1, Math.round(Number(event.target.value) || 1))
            write(count, shape.jump)
          }}
          className="h-7 w-16 text-xs"
        />
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Jump at"
          value={[shape.jump]}
          onValueChange={([jump]) => jump && write(shape.count, jump as "start" | "end")}
        >
          <ToggleGroupItem value="start" className="h-7 px-2 text-xs">
            Start
          </ToggleGroupItem>
          <ToggleGroupItem value="end" className="h-7 px-2 text-xs">
            End
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}

/** Spring: by time and bounce, or by stiffness, damping and mass, with the curve and how long it takes to settle. */
function SpringEditor({ spring, onChange }: { spring: Spring | undefined; onChange: (spring: Spring) => void }) {
  const mode = spring !== undefined && "stiffness" in spring ? "physics" : "time"
  const shown = spring ?? defaultSprings.time
  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        aria-label="Set the spring by"
        value={[mode]}
        onValueChange={([next]) => next && onChange({ ...defaultSprings[next as "time" | "physics"] })}
        className="w-full"
      >
        <ToggleGroupItem value="time" className="h-7 flex-1 text-xs">
          Time and bounce
        </ToggleGroupItem>
        <ToggleGroupItem value="physics" className="h-7 flex-1 text-xs">
          Physics
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="grid place-items-center rounded-md border bg-muted/40 p-2">
        <CurveThumb shape={easingShape({ spring: shown }, [])} size={120} faint={spring === undefined} />
      </div>
      <p className="text-[11px] text-muted-foreground">Settles in {springSettle(shown)}ms, which is the duration.</p>
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
  const read = (text: string): Reading<number> =>
    readUnitNumber(text, {
      units: unit ? { [unit]: 1 } : {},
      current: value,
      label,
      takes: `${label} takes a number from ${min} to ${max}`
    })
  return (
    <div className="grid grid-cols-[60px_72px_minmax(0,1fr)] items-center gap-2">
      <span id={id} className="text-xs text-muted-foreground">
        {label}
      </span>
      <ValueField
        label={label}
        shown={formatNumber(value, 2)}
        placeholder={String(min)}
        unit={unit}
        narrow
        read={read}
        onCommit={set}
        onStep={(up, { shift }) => set(value + (up ? 1 : -1) * step * (shift ? 10 : 1))}
      />
      <Slider
        aria-labelledby={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => set(Array.isArray(next) ? next[0]! : (next as number))}
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
      <p className="text-[11px] text-muted-foreground">Point at the card, or press Play, to see it change.</p>
    </div>
  )
}
