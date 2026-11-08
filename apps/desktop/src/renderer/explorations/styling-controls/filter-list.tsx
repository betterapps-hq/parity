import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { Braces, CircleAlert, ListOrdered, Plus, SlidersHorizontal } from "lucide-react"
import { type CSSProperties, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { BlurChoice } from "./controls.tsx"
import { CenteredSlider, ListRow, readAngle, RowMessage } from "./list-parts.tsx"
import {
  type AdjustmentKey,
  adjustments,
  type Adjustments,
  colorWords,
  drawColor,
  type FilterEntry,
  imagePreview,
  layerNumbers,
  layersOf,
  newId
} from "./lists-data.ts"
import { adjustmentWrites, filterDrawing } from "./lists-writes.ts"
import { ShadowEditor } from "./shadow-list.tsx"

/*
 * The filter list (design-options-values.md, Filter list): `filter` in Effects, and `backdrop-filter` behind the layer.
 * Layer blur, Background blur and a Drop shadow that follows the shape are entries of their own, and Adjustments is one
 * entry of sliders, so it isn't reordered: they're written in Tailwind's filter order whatever the panel shows. A
 * filter read from code in another order, or with a function twice, is one Custom entry, edited as text, with Put in
 * order where that doesn't change what's drawn.
 */

type Addable = "blur" | "backdropBlur" | "adjust" | "adjustBehind" | "dropShadow"

const addNames: Record<Addable, string> = {
  blur: "Layer blur",
  adjust: "Adjustments",
  dropShadow: "Drop shadow",
  backdropBlur: "Background blur",
  adjustBehind: "Background adjustments"
}

const behind = (entry: FilterEntry) =>
  entry.kind === "backdropBlur" || ((entry.kind === "adjust" || entry.kind === "custom") && entry.behind === true)

/** The kind an entry is added as, so + offers each once. */
function addableOf(entry: FilterEntry): Addable | undefined {
  if (entry.kind === "adjust") return entry.behind ? "adjustBehind" : "adjust"
  if (entry.kind === "custom") return undefined
  return entry.kind
}

/** Tailwind's order, which the list shows each property's entries in: blur, adjustments, then the drop shadow. */
const order = (entry: FilterEntry) => ({ custom: 0, blur: 1, backdropBlur: 1, adjust: 2, dropShadow: 3 })[entry.kind]

function newEntry(kind: Addable): FilterEntry {
  const id = newId("filter")
  if (kind === "blur" || kind === "backdropBlur") return { id, kind, value: kind === "blur" ? "blur-sm" : "blur-md" }
  if (kind === "dropShadow") {
    return {
      id,
      kind,
      shadow: {
        id: newId("shadow"),
        kind: "drop",
        follow: true,
        token: "drop-shadow-md",
        layer: { x: 0, y: 4, blur: 6, spread: 0, color: "black", alpha: 15 }
      }
    }
  }
  return { id, kind: "adjust", behind: kind === "adjustBehind", values: {} }
}

export function FilterList({
  entries,
  onChange,
  tokensOnly = false,
  openId
}: {
  entries: FilterEntry[]
  onChange: (entries: FilterEntry[]) => void
  tokensOnly?: boolean
  /** The entry whose editor is open at first, for a story. */
  openId?: string
}) {
  const taken = new Set(entries.map(addableOf))
  const set = (id: string, entry: FilterEntry) => onChange(entries.map((other) => (other.id === id ? entry : other)))
  const remove = (id: string) => onChange(entries.filter((other) => other.id !== id))
  const groups = [
    { title: "On the layer", rows: entries.filter((entry) => !behind(entry)).sort((a, b) => order(a) - order(b)) },
    { title: "Behind the layer", rows: entries.filter(behind).sort((a, b) => order(a) - order(b)) }
  ]
  return (
    <PanelSection
      title="Effects"
      action={
        <DropdownMenu>
          <Hint label="Add an effect">
            <DropdownMenuTrigger
              aria-label="Add an effect"
              className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
            >
              <Plus className="size-4" />
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end" className="w-52">
            {(Object.keys(addNames) as Addable[]).map((kind) => (
              <DropdownMenuItem
                key={kind}
                className="text-xs"
                disabled={taken.has(kind)}
                onClick={() => onChange([...entries, newEntry(kind)])}
              >
                {addNames[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {entries.length > 0 && (
        <div className="flex flex-col gap-1">
          {groups
            .filter(({ rows }) => rows.length > 0)
            .map(({ title, rows }) => (
              <div key={title} className="flex flex-col gap-0.5">
                <span className="px-4 text-[11px] text-muted-foreground">{title}</span>
                {rows.map((entry) => (
                  <FilterRow
                    key={entry.id}
                    entry={entry}
                    tokensOnly={tokensOnly}
                    startOpen={entry.id === openId}
                    onChange={(next) => set(entry.id, next)}
                    onReplace={(next) => onChange([...entries.filter((other) => other.id !== entry.id), ...next])}
                    onRemove={() => remove(entry.id)}
                  />
                ))}
              </div>
            ))}
        </div>
      )}
    </PanelSection>
  )
}

function FilterRow({
  entry,
  tokensOnly,
  startOpen,
  onChange,
  onReplace,
  onRemove
}: {
  entry: FilterEntry
  tokensOnly: boolean
  startOpen: boolean
  onChange: (entry: FilterEntry) => void
  onReplace: (entries: FilterEntry[]) => void
  onRemove: () => void
}) {
  const toggle = () => onChange({ ...entry, off: !entry.off })
  if (entry.kind === "blur" || entry.kind === "backdropBlur") {
    const label = entry.kind === "blur" ? "Layer blur" : "Background blur"
    return (
      <ListRow name={label} group="filters" index={0} off={entry.off} onToggle={toggle} onRemove={onRemove}>
        <span className="w-24 shrink-0 truncate text-xs">{label}</span>
        <div className="min-w-0 flex-1">
          <BlurChoice
            label={label}
            value={entry.value}
            tokensOnly={tokensOnly}
            onChange={(value) => onChange({ ...entry, value })}
          />
        </div>
      </ListRow>
    )
  }
  if (entry.kind === "adjust") {
    const label = entry.behind ? "Background adjustments" : "Adjustments"
    return (
      <ListRow name={label} group="filters" index={0} off={entry.off} onToggle={toggle} onRemove={onRemove}>
        <AdjustmentsEntry
          label={label}
          values={entry.values}
          startOpen={startOpen}
          behind={entry.behind ?? false}
          onChange={(values) => onChange({ ...entry, values })}
        />
      </ListRow>
    )
  }
  if (entry.kind === "dropShadow") {
    return (
      <ListRow name="Drop shadow" group="filters" index={0} off={entry.off} onToggle={toggle} onRemove={onRemove}>
        <DropShadowEntry entry={entry} tokensOnly={tokensOnly} startOpen={startOpen} onChange={onChange} />
      </ListRow>
    )
  }
  return (
    <ListRow name="Custom filter" group="filters" index={0} off={entry.off} onToggle={toggle} onRemove={onRemove}>
      <CustomEntry entry={entry} onChange={onChange} onReplace={onReplace} />
    </ListRow>
  )
}

/** Each adjustment set, in words: `Brightness +25, Saturation −10`. */
function adjustmentWords(values: Adjustments): string {
  const set = adjustments.filter((adjustment) => (values[adjustment.key] ?? 0) !== 0)
  if (set.length === 0) return "No change"
  return set
    .map((adjustment) => {
      const value = values[adjustment.key]!
      const signed = adjustment.min < 0 && value > 0 ? `+${value}` : String(value).replace("-", "−")
      return `${adjustment.label} ${signed}${adjustment.unit}`
    })
    .join(", ")
}

/** Adjustments: one entry whose summary opens its sliders. */
function AdjustmentsEntry({
  label,
  values,
  behind: isBehind,
  startOpen,
  onChange
}: {
  label: string
  values: Adjustments
  behind: boolean
  startOpen: boolean
  onChange: (values: Adjustments) => void
}) {
  const words = adjustmentWords(values)
  return (
    <Popover defaultOpen={startOpen}>
      <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-transparent pl-1 text-xs dark:bg-input/30">
        <PopoverTrigger
          aria-label={`${label}: edit`}
          className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SlidersHorizontal className="size-3.5" />
        </PopoverTrigger>
        <span className="shrink-0">Adjustments</span>
        <Hint label={label} detail={words}>
          <span className="truncate pr-1.5 text-muted-foreground">{words}</span>
        </Hint>
      </div>
      <PopoverContent className="w-72 p-3" align="start">
        <AdjustmentsEditor values={values} behind={isBehind} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The sliders: brightness, contrast and saturation centered on no change from −100 to 100, hue from −180° to 180°, then
 * grayscale, sepia and invert from 0 to 100. Each slider's hint names the class it writes; one at no change writes
 * nothing. On an image, Image's Adjustments shows the first four (`only`).
 */
export function AdjustmentsEditor({
  values,
  behind: isBehind = false,
  only,
  onChange
}: {
  values: Adjustments
  behind?: boolean
  only?: AdjustmentKey[]
  onChange: (values: Adjustments) => void
}) {
  const shown = adjustments.filter((adjustment) => only === undefined || only.includes(adjustment.key))
  return (
    <div className="flex flex-col gap-2">
      {isBehind && (
        <p className="text-[11px] text-muted-foreground">{"Brightness, contrast and saturation of what's behind"}</p>
      )}
      {shown.map((adjustment) => {
        const value = values[adjustment.key] ?? 0
        return (
          <CenteredSlider
            key={adjustment.key}
            label={adjustment.label}
            value={value}
            min={adjustment.min}
            max={adjustment.max}
            unit={adjustment.unit}
            hint={`${isBehind ? "backdrop-" : ""}${adjustmentWrites(adjustment.key, value).className}`}
            onChange={(next) => onChange({ ...values, [adjustment.key]: next === 0 ? undefined : next })}
          />
        )
      })}
    </div>
  )
}

function DropShadowEntry({
  entry,
  tokensOnly,
  startOpen,
  onChange
}: {
  entry: Extract<FilterEntry, { kind: "dropShadow" }>
  tokensOnly: boolean
  startOpen: boolean
  onChange: (entry: FilterEntry) => void
}) {
  const { shadow } = entry
  const [first] = layersOf(shadow)
  const summary =
    shadow.token === undefined
      ? `${layerNumbers(shadow.layer, false)} ${colorWords(shadow.layer)}`
      : shadow.token.replace("drop-shadow-", "")
  return (
    <Popover defaultOpen={startOpen}>
      <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-transparent pl-1 text-xs dark:bg-input/30">
        <PopoverTrigger
          aria-label="Drop shadow: edit"
          className="grid size-5 shrink-0 place-items-center rounded-sm bg-neutral-200 outline-none hover:bg-neutral-300 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden
            className="block size-3 rounded-full bg-white"
            style={{
              filter: first ? `drop-shadow(0 ${first.y / 3}px ${first.blur / 3}px ${drawColor(first)})` : undefined
            }}
          />
        </PopoverTrigger>
        <span className="shrink-0">Drop shadow</span>
        <Hint label="Follows the shape" detail="filter: drop-shadow(), last in the filter">
          <span
            className={`truncate pr-1.5 ${shadow.token === undefined ? "text-muted-foreground" : "rounded-sm bg-accent px-1 font-mono"}`}
          >
            {summary}
          </span>
        </Hint>
      </div>
      <PopoverContent className="w-72 p-2" align="start">
        <ShadowEditor
          entry={shadow}
          tokensOnly={tokensOnly}
          inFilter
          onChange={(change) => onChange({ ...entry, shadow: { ...shadow, ...change } })}
        />
      </PopoverContent>
    </Popover>
  )
}

/** The functions a filter is written with: `contrast(1.2) blur(4px)` is contrast and blur, with their arguments. */
function functionsOf(text: string): { name: string; args: string }[] | undefined {
  const found: { name: string; args: string }[] = []
  let rest = text.trim()
  while (rest.length > 0) {
    const name = /^([a-z-]+)\(/.exec(rest)?.[1]
    if (!name) return undefined
    let depth = 0
    let end = name.length
    for (; end < rest.length; end++) {
      if (rest[end] === "(") depth++
      if (rest[end] === ")") depth--
      if (depth === 0) break
    }
    if (depth !== 0) return undefined
    found.push({ name, args: rest.slice(name.length + 1, end).trim() })
    rest = rest.slice(end + 1).trim()
  }
  return found
}

const adjustmentFor: Record<string, AdjustmentKey> = {
  brightness: "brightness",
  contrast: "contrast",
  saturate: "saturate",
  "hue-rotate": "hue",
  grayscale: "grayscale",
  sepia: "sepia",
  invert: "invert"
}

/** A function's amount as a percentage: `1.25` and `125%` are both 125. */
const percentOf = (args: string) => {
  const number = Number.parseFloat(args)
  return args.trim().endsWith("%") ? number : number * 100
}

/**
 * The entries a Custom filter becomes when put in Tailwind's order, or why it stays as text. Only blur can move, since
 * blurring and then adjusting colors draws what adjusting and then blurring does; the color adjustments and a drop
 * shadow don't commute, so they must already be in Tailwind's order.
 */
export function putInOrder(text: string, isBehind: boolean): { entries: FilterEntry[] } | { reason: string } {
  const functions = functionsOf(text)
  if (!functions) return { reason: "It can't be read as a list of filter functions" }
  const names = functions.map((part) => part.name)
  const twice = names.find((name, index) => names.indexOf(name) !== index)
  if (twice) return { reason: `${twice}() is there twice, which one entry can't hold` }
  if (names.includes("drop-shadow")) return { reason: "A drop shadow inside a custom filter stays as text" }
  const unknown = names.find((name) => name !== "blur" && !(name in adjustmentFor))
  if (unknown) return { reason: `${unknown}() has no slider` }
  const colors = names.filter((name) => name !== "blur")
  const tailwindOrder = ["brightness", "contrast", "grayscale", "hue-rotate", "invert", "saturate", "sepia"]
  const sorted = [...colors].sort((a, b) => tailwindOrder.indexOf(a) - tailwindOrder.indexOf(b))
  const outOfPlace = colors.findIndex((name, index) => name !== sorted[index])
  if (outOfPlace >= 0) {
    return {
      reason: `Putting ${sorted[outOfPlace]}() before ${colors[outOfPlace]}() changes what's drawn, so it stays as text`
    }
  }
  const entries: FilterEntry[] = []
  const values: Adjustments = {}
  for (const part of functions) {
    if (part.name === "blur") {
      const px = Number.parseFloat(part.args)
      if (!part.args.endsWith("px") || !Number.isFinite(px)) return { reason: `blur(${part.args}) isn't in px` }
      entries.push({ id: newId("filter"), kind: isBehind ? "backdropBlur" : "blur", value: { px } })
      continue
    }
    const key = adjustmentFor[part.name]!
    const adjustment = adjustments.find((option) => option.key === key)!
    let value: number
    if (key === "hue") {
      const reading = readAngle(part.args)
      if ("reason" in reading) return { reason: `hue-rotate(${part.args}) isn't an angle` }
      value = reading.degrees
    } else if (key === "brightness" || key === "contrast" || key === "saturate") value = percentOf(part.args) - 100
    else value = percentOf(part.args)
    value = Math.round(value)
    if (value < adjustment.min || value > adjustment.max)
      return { reason: `${part.name}(${part.args}) is past the slider's end` }
    values[key] = value
  }
  if (Object.keys(values).length > 0) entries.push({ id: newId("filter"), kind: "adjust", behind: isBehind, values })
  return { entries }
}

/** Custom: a filter read from code, kept as text, checked by `CSS.supports`, with Put in order where it can be. */
function CustomEntry({
  entry,
  onChange,
  onReplace
}: {
  entry: Extract<FilterEntry, { kind: "custom" }>
  onChange: (entry: FilterEntry) => void
  onReplace: (entries: FilterEntry[]) => void
}) {
  const property = entry.behind ? "backdrop-filter" : "filter"
  const [typed, setTyped] = useState<string>()
  const [message, setMessage] = useState<{ tone: "error" | "note"; text: string }>()
  const error = message?.tone === "error"
  const commit = (leaving: boolean) => {
    if (typed === undefined) return true
    if (CSS.supports(property, typed)) {
      onChange({ ...entry, text: typed.trim() })
      setMessage(undefined)
    } else if (!leaving) {
      setMessage({ tone: "error", text: `${property} can't be ${typed.trim() || "empty"}` })
      return false
    } else {
      setMessage({ tone: "note", text: `The filter is back to ${entry.text}. ${property} can't be ${typed.trim()}.` })
    }
    setTyped(undefined)
    return true
  }
  const ordered = putInOrder(entry.text, entry.behind ?? false)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div
        className={`flex h-7 min-w-0 items-center gap-1 rounded-md border bg-transparent pl-1.5 text-xs focus-within:ring-2 dark:bg-input/30 ${error ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"}`}
      >
        <Hint label="Custom" detail="Read from code in an order Tailwind's utilities can't write, so it's kept as text">
          <Braces aria-label="Custom" className="size-3.5 shrink-0 text-muted-foreground" />
        </Hint>
        <input
          aria-label="Custom filter"
          aria-invalid={error || undefined}
          spellCheck={false}
          value={typed ?? entry.text}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
            if (event.key === "Escape" && typed !== undefined) {
              setTyped(undefined)
              setMessage(error ? { tone: "note", text: `The filter is back to ${entry.text}.` } : undefined)
            }
          }}
          onBlur={() => commit(true)}
          className="w-0 min-w-8 flex-1 truncate bg-transparent font-mono outline-none"
        />
        {error && <CircleAlert aria-hidden className="mr-1 size-3.5 shrink-0 text-destructive" />}
      </div>
      {!error && !message && "entries" in ordered && (
        <Hint label="Put in order" detail="Writes it as Tailwind's utilities. It draws the same, since only blur moves">
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 self-start px-1.5 text-xs"
            onClick={() => onReplace(ordered.entries)}
          >
            <ListOrdered className="size-3.5" /> Put in order
          </Button>
        </Hint>
      )}
      {message && <RowMessage tone={message.tone}>{message.text}</RowMessage>}
      {!message && "reason" in ordered && <RowMessage tone="note">{`${ordered.reason}.`}</RowMessage>}
    </div>
  )
}

/**
 * A translucent card with a picture on it, over shapes: the layer's filter changes the card and its picture, and the
 * backdrop filter what shows through it.
 */
export function FilterPreview({ entries }: { entries: FilterEntry[] }) {
  const drawing = filterDrawing(entries, drawColor)
  const style: CSSProperties = {
    width: 200,
    height: 120,
    background: "rgb(255 255 255 / 0.35)",
    filter: drawing.filter,
    backdropFilter: drawing.backdropFilter
  }
  return (
    <div
      aria-label="The layer"
      className="relative flex flex-col items-center justify-center gap-2 rounded-xl border border-white/40 text-xs text-neutral-900"
      style={style}
    >
      <span
        aria-hidden
        className="block h-12 w-32 rounded-md bg-cover bg-center"
        style={{ backgroundImage: `url("${imagePreview("/images/hero.jpg") ?? ""}")` }}
      />
      Plans
    </div>
  )
}
