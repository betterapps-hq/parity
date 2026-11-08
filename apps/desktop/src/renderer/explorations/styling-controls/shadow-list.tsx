import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Toggle,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, ChevronRight, Ellipsis, Plus, RotateCcw, Unlink } from "lucide-react"
import { type CSSProperties, type ReactNode, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "./color-picker.tsx"
import { Num } from "./controls.tsx"
import { usedColors } from "./data.ts"
import { ListRow, moved, OffsetPad, RowMessage } from "./list-parts.tsx"
import {
  allShadowTokens,
  colorWords,
  drawColor,
  layerNumbers,
  layersOf,
  type ListColor,
  newId,
  type ShadowEntry,
  type ShadowKind,
  type ShadowLayer,
  type ShadowToken,
  tokensFor
} from "./lists-data.ts"
import { shadowDrawing, shadowsFitSlots, shadowTarget } from "./lists-writes.ts"

/*
 * Effects' shadow list (design-options-values.md, Shadow list): drop shadows, inner shadows and rings, in two groups,
 * Inside then Outside, top first as Tailwind paints them, each dragged within its group. A drop shadow that follows
 * the shape is the filter's, listed after them. Each entry's card opens its editor: X, Y, blur, spread and color with
 * the offset pad, or a ring's width, color and Inset. A shadow token is a chip whose layers fold under a disclosure;
 * only its color can be overridden, as Tailwind can (`shadow-lg shadow-black/20`), and the rest offers Detach.
 */

/** The color a part changed on the layer is drawn in, beside the token it overrides. */
const overrideColor = kindColors.component

const kindNames: Record<ShadowKind, string> = { drop: "Drop shadow", inner: "Inner shadow", ring: "Ring" }

/** A token's name without the namespace the field implies: `md` for `shadow-md`. */
const shortName = (token: string) => token.replace(/^(inset-shadow|drop-shadow|text-shadow|shadow)-/, "")

/** Which group an entry is listed and dragged in. */
function groupOf(entry: ShadowEntry): "inside" | "outside" | "follow" {
  if (entry.kind === "inner" || (entry.kind === "ring" && entry.inset)) return "inside"
  if (entry.kind === "drop" && entry.follow) return "follow"
  return "outside"
}

/** Inside, then Outside, then what follows the shape, keeping each group's order. */
const inGroups = (entries: ShadowEntry[]) => [
  ...entries.filter((entry) => groupOf(entry) === "inside"),
  ...entries.filter((entry) => groupOf(entry) === "outside"),
  ...entries.filter((entry) => groupOf(entry) === "follow")
]

const defaultLayer: ShadowLayer = { x: 0, y: 4, blur: 12, spread: -2, color: "black", alpha: 10 }

/** What + and the section's menu add, as the list's usual entries. */
function newEntry(kind: ShadowKind | "follow", onText: boolean): ShadowEntry {
  const id = newId("shadow")
  if (kind === "ring")
    return { id, kind: "ring", width: 1, layer: { ...defaultLayer, color: "ring", alpha: undefined } }
  if (kind === "inner") return { id, kind: "inner", token: "inset-shadow-sm", layer: defaultLayer }
  if (kind === "follow") return { id, kind: "drop", follow: true, token: "drop-shadow-md", layer: defaultLayer }
  return { id, kind: "drop", token: onText ? "text-shadow-sm" : "shadow-sm", layer: defaultLayer }
}

export interface ShadowText {
  /** Whether the text layer has a fill or stroke, which gives a drop shadow a Shadow of toggle. */
  hasFill: boolean
  shadowOf: "text" | "box"
  onShadowOf: (shadowOf: "text" | "box") => void
}

export function ShadowList({
  entries,
  onChange,
  mixed = false,
  tokensOnly = false,
  text,
  saved,
  onSave,
  openId
}: {
  entries: ShadowEntry[]
  onChange: (entries: ShadowEntry[]) => void
  mixed?: boolean
  tokensOnly?: boolean
  /** On a text layer, a drop shadow shadows the text (`text-shadow`) unless Shadow of is Box. */
  text?: ShadowText
  saved: ShadowToken[]
  onSave: (token: ShadowToken) => void
  openId?: string
}) {
  const ordered = inGroups(entries)
  const onText = text !== undefined && text.shadowOf === "text"
  const add = (kind: ShadowKind | "follow") => {
    const added = newEntry(kind, onText)
    if (mixed) {
      onChange([added])
      return
    }
    // Each goes on top of its kind, so Tailwind's order holds: a drop shadow on top of the drop shadows, below any rings.
    let at = -1
    if (kind === "inner") at = 0
    if (kind === "ring") at = ordered.findIndex((entry) => groupOf(entry) !== "inside")
    if (kind === "drop") {
      at = ordered.findIndex((entry) => entry.kind === "drop" && groupOf(entry) === "outside")
      if (at < 0) at = ordered.findIndex((entry) => groupOf(entry) === "follow")
    }
    if (at < 0) at = ordered.length
    onChange(inGroups([...ordered.slice(0, at), added, ...ordered.slice(at)]))
  }
  const fits = shadowsFitSlots(ordered, onText)
  const set = (id: string, change: Partial<ShadowEntry>) =>
    onChange(ordered.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))
  const groups = (["inside", "outside", "follow"] as const).map((group) => ({
    group,
    rows: ordered.filter((entry) => groupOf(entry) === group)
  }))
  const titles = { inside: "Inside", outside: onText ? "Outside, on the text" : "Outside", follow: "Follows the shape" }
  const saveAsToken = () => {
    const box = ordered.filter((entry) => !entry.off && shadowTarget(entry, onText) === "box")
    const layers = box.flatMap((entry) =>
      entry.kind === "ring"
        ? [{ ...entry.layer, x: 0, y: 0, blur: 0, spread: entry.width ?? 1, inset: entry.inset }]
        : layersOf(entry, saved).map((part) => ({ ...part, inset: entry.kind === "inner" }))
    )
    const name = `shadow-saved-${saved.length + 1}`
    onSave({ name, layers })
    onChange([
      { id: newId("shadow"), kind: "drop", token: name, layer: defaultLayer },
      ...ordered.filter((entry) => !box.includes(entry))
    ])
  }
  return (
    <PanelSection
      title="Effects"
      action={
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More effects"
              className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
            >
              <Ellipsis className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem className="text-xs" onClick={() => add("inner")}>
                Add inner shadow
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => add("ring")}>
                Add ring
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => add("follow")}>
                Add drop shadow that follows the shape
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Hint label={mixed ? "Replace every layer's shadows with one" : "Add drop shadow"}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              aria-label="Add drop shadow"
              onClick={() => add("drop")}
            >
              <Plus />
            </Button>
          </Hint>
        </div>
      }
    >
      {mixed && (
        <Hint label="The selected layers have different shadows" detail="+ replaces them all with one">
          <p className="px-1 text-xs text-muted-foreground">Several shadows</p>
        </Hint>
      )}
      {!mixed && entries.length > 0 && (
        <div className="flex flex-col gap-1">
          {groups
            .filter(({ rows }) => rows.length > 0)
            .map(({ group, rows }) => (
              <div key={group} className="flex flex-col gap-0.5">
                <span className="px-4 text-[11px] text-muted-foreground">{titles[group]}</span>
                {rows.map((entry, index) => (
                  <ShadowRow
                    key={entry.id}
                    entry={entry}
                    index={index}
                    group={group}
                    tokensOnly={tokensOnly}
                    text={text}
                    saved={saved}
                    startOpen={entry.id === openId}
                    onChange={(change) => set(entry.id, change)}
                    onMove={(from, to) => {
                      if (to < 0 || to >= rows.length) return
                      const reordered = moved(rows, from, to)
                      onChange(
                        inGroups(ordered.map((other) => (groupOf(other) === group ? reordered.shift()! : other)))
                      )
                    }}
                    onRemove={() => onChange(ordered.filter((other) => other.id !== entry.id))}
                  />
                ))}
              </div>
            ))}
          {!fits && (
            <div className="flex flex-col items-start gap-1 px-4">
              <RowMessage tone="note">
                {
                  "Tailwind's slots hold one inner shadow, inset ring, ring and drop shadow each, in that order, so these shadows are written as one arbitrary value."
                }
              </RowMessage>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={saveAsToken}>
                Save as token
              </Button>
            </div>
          )}
        </div>
      )}
    </PanelSection>
  )
}

/** A small card with the entry's shadow on it, scaled down, so its color and spread show. */
function ShadowCard({ entry, saved }: { entry: ShadowEntry; saved: ShadowToken[] }) {
  const drawing = shadowDrawing([{ ...entry, off: false }], drawColor, saved)
  const scaled = (css: string) => css.replace(/(-?\d+(?:\.\d+)?)px/g, (_, number: string) => `${Number(number) / 2}px`)
  const style: CSSProperties = {
    boxShadow: drawing.boxShadow ? scaled(drawing.boxShadow) : undefined,
    filter: drawing.dropShadow ? scaled(drawing.dropShadow) : undefined
  }
  return <span aria-hidden className="block size-3 rounded-[3px] bg-white" style={style} />
}

function ShadowRow({
  entry,
  index,
  group,
  tokensOnly,
  text,
  saved,
  startOpen,
  onChange,
  onMove,
  onRemove
}: {
  entry: ShadowEntry
  index: number
  group: string
  tokensOnly: boolean
  text: ShadowText | undefined
  saved: ShadowToken[]
  startOpen: boolean
  onChange: (change: Partial<ShadowEntry>) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(startOpen)
  const onText = text !== undefined && text.shadowOf === "text"
  const name = `${kindNames[entry.kind]} ${index + 1}`
  const spread = entry.kind !== "drop" || (!entry.follow && !onText)
  const layers = layersOf(entry, saved)
  let summary: ReactNode
  if (entry.kind === "ring") summary = `${entry.width ?? 1}px ${colorWords(entry.layer)}`
  else if (entry.token === undefined) summary = `${layerNumbers(entry.layer, spread)} ${colorWords(entry.layer)}`
  else {
    summary = (
      <span className="relative shrink-0 rounded-sm bg-accent px-1 py-0.5 font-mono">
        {shortName(entry.token)}
        {entry.colorOverride && (
          <span
            aria-label="Its color is overridden"
            className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full"
            style={{ background: overrideColor }}
          />
        )}
      </span>
    )
  }
  const fullSummary = layers.map((part) => `${layerNumbers(part, spread)} ${colorWords(part)}`).join(", ")
  return (
    <ListRow
      name={name}
      group={group}
      index={index}
      off={entry.off}
      onMove={onMove}
      onToggle={() => onChange({ off: !entry.off })}
      onRemove={onRemove}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-transparent pl-1 text-xs dark:bg-input/30">
          <PopoverTrigger
            aria-label={`${name}: edit`}
            className="grid size-5 shrink-0 place-items-center rounded-sm bg-neutral-200 outline-none hover:bg-neutral-300 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShadowCard entry={entry} saved={saved} />
          </PopoverTrigger>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`${name} type: ${kindNames[entry.kind]}`}
              className="flex shrink-0 items-center gap-0.5 rounded-sm px-0.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              {entry.kind === "ring" && entry.inset ? "Inset ring" : kindNames[entry.kind]}
              <ChevronDown className="size-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuRadioGroup
                value={entry.kind}
                onValueChange={(kind) => {
                  const next = newEntry(kind as ShadowKind, onText)
                  onChange({
                    kind: next.kind,
                    token: next.token,
                    width: next.width,
                    layer: next.kind === "ring" ? next.layer : entry.layer,
                    colorOverride: undefined,
                    follow: undefined,
                    inset: undefined
                  })
                }}
              >
                {(Object.keys(kindNames) as ShadowKind[]).map((kind) => (
                  <DropdownMenuRadioItem key={kind} value={kind} className="text-xs">
                    {kindNames[kind]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Hint label={entry.token ?? kindNames[entry.kind]} detail={fullSummary}>
            <span className="flex min-w-0 items-center gap-1 truncate pr-1.5 tabular-nums">{summary}</span>
          </Hint>
        </div>
        <PopoverContent className="w-72 p-2" align="start">
          <ShadowEditor entry={entry} tokensOnly={tokensOnly} text={text} saved={saved} onChange={onChange} />
        </PopoverContent>
      </Popover>
    </ListRow>
  )
}

/**
 * One shadow's editor: a token with its layers under a disclosure and its color overridable, or the offset pad with X,
 * Y, blur and spread, and the color; Follow shape for a drop shadow, Shadow of on a text layer with a fill, and a
 * ring's width, color and Inset.
 */
export function ShadowEditor({
  entry,
  tokensOnly = false,
  text,
  saved = [],
  inFilter = false,
  onChange
}: {
  entry: ShadowEntry
  tokensOnly?: boolean
  text?: ShadowText
  saved?: ShadowToken[]
  /** In the filter list, where a drop shadow always follows the shape, so Follow shape isn't offered. */
  inFilter?: boolean
  onChange: (change: Partial<ShadowEntry>) => void
}) {
  const onText = text !== undefined && text.shadowOf === "text"
  const tokens = [...tokensFor(entry, onText), ...(entry.kind === "drop" && !entry.follow && !onText ? saved : [])]
  const layer = entry.layer
  const setLayer = (change: Partial<ShadowLayer>) => onChange({ layer: { ...layer, ...change } })
  const spread = entry.kind === "inner" || (entry.kind === "drop" && !entry.follow && !onText)
  if (entry.kind === "ring") {
    return (
      <div className="flex flex-col gap-2">
        <EditorRow label="Width">
          <Num
            label="Ring width"
            pixels
            value={entry.width ?? 1}
            min={0}
            onChange={(width) => onChange({ width: Math.round(width ?? 1) })}
          />
        </EditorRow>
        <EditorRow label="Color">
          <ColorInput
            label="Ring color"
            value={layer.color}
            alpha={layer.alpha}
            tokensOnly={tokensOnly}
            used={usedColors}
            onChange={(color, alpha) => setLayer({ color: color ?? layer.color, alpha })}
          />
        </EditorRow>
        <EditorRow label="Inside">
          <Hint label="Inset" detail="Draws the ring inside the edge: inset-ring">
            <Toggle
              variant="outline"
              size="sm"
              className="h-7 self-start px-2 text-xs"
              aria-label="Inset"
              pressed={entry.inset ?? false}
              onPressedChange={(inset) => onChange({ inset: inset || undefined })}
            >
              Inset
            </Toggle>
          </Hint>
        </EditorRow>
      </div>
    )
  }
  const token = entry.token
  return (
    <div className="flex flex-col gap-2">
      <EditorRow label="Token">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Shadow token: ${token ?? "Custom"}`}
            className="flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent dark:bg-input/30"
          >
            <span className="font-mono">{token ?? "Custom"}</span>
            <ChevronDown className="ml-auto size-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuRadioGroup
              value={token ?? ""}
              onValueChange={(next) => onChange({ token: next as string, colorOverride: undefined })}
            >
              {tokens.map((option) => (
                <DropdownMenuRadioItem key={option.name} value={option.name} className="gap-2 text-xs">
                  <span className="grid size-4 place-items-center rounded-sm bg-neutral-200">
                    <ShadowCard entry={{ ...entry, token: option.name, colorOverride: undefined }} saved={saved} />
                  </span>
                  <span className="font-mono">{option.name}</span>
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {layerNumbers(option.layers[0]!, spread)}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {token !== undefined && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-xs" onClick={() => detach(entry, saved, onChange)}>
                  <Unlink className="size-3.5" /> Detach
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </EditorRow>
      {token !== undefined ? (
        <TokenParts entry={entry} tokensOnly={tokensOnly} saved={saved} spread={spread} onChange={onChange} />
      ) : (
        <>
          <div className="flex items-start gap-2">
            <OffsetPad x={layer.x} y={layer.y} onChange={(x, y) => setLayer({ x, y })} />
            <div className="grid flex-1 grid-cols-2 gap-1">
              <Num
                label="X offset"
                inner="X"
                pixels
                narrow
                min={-999}
                value={layer.x}
                onChange={(x) => setLayer({ x: x ?? 0 })}
              />
              <Num
                label="Y offset"
                inner="Y"
                pixels
                narrow
                min={-999}
                value={layer.y}
                onChange={(y) => setLayer({ y: y ?? 0 })}
              />
              <Num
                label="Blur"
                inner="B"
                pixels
                narrow
                value={layer.blur}
                onChange={(blur) => setLayer({ blur: blur ?? 0 })}
              />
              {spread && (
                <Num
                  label="Spread"
                  inner="S"
                  pixels
                  narrow
                  min={-999}
                  value={layer.spread}
                  onChange={(next) => setLayer({ spread: next ?? 0 })}
                />
              )}
            </div>
          </div>
          <EditorRow label="Color">
            <ColorInput
              label="Shadow color"
              value={layer.color}
              alpha={layer.alpha}
              tokensOnly={tokensOnly}
              used={usedColors}
              onChange={(color, alpha) => setLayer({ color: color ?? layer.color, alpha })}
            />
          </EditorRow>
        </>
      )}
      {entry.kind === "drop" && !onText && !inFilter && (
        <EditorRow label="Follow shape">
          <Hint
            label="Follow shape"
            detail="Shadows what's drawn rather than the box, with no spread: filter: drop-shadow(), the filter's last entry"
          >
            <Switch
              aria-label="Follow shape"
              checked={entry.follow ?? false}
              onCheckedChange={(follow) => {
                const next = follow ? "drop-shadow-md" : "shadow-sm"
                onChange({
                  follow: follow || undefined,
                  token: token === undefined ? undefined : next,
                  colorOverride: undefined
                })
              }}
            />
          </Hint>
        </EditorRow>
      )}
      {entry.kind === "drop" && text?.hasFill && (
        <EditorRow label="Shadow of">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Shadow of"
            value={[text.shadowOf]}
            onValueChange={([shadowOf]) => shadowOf && text.onShadowOf(shadowOf as "text" | "box")}
          >
            <Hint label="Text" detail="Shadows the letters: text-shadow">
              <ToggleGroupItem value="text" className="h-7 px-2 text-xs">
                Text
              </ToggleGroupItem>
            </Hint>
            <Hint label="Box" detail="Shadows the fill's box: box-shadow">
              <ToggleGroupItem value="box" className="h-7 px-2 text-xs">
                Box
              </ToggleGroupItem>
            </Hint>
          </ToggleGroup>
        </EditorRow>
      )}
    </div>
  )
}

/** A token's own layers written as the entry's values, so every part can be edited. */
function detach(entry: ShadowEntry, saved: ShadowToken[], onChange: (change: Partial<ShadowEntry>) => void) {
  const [first] = layersOf(entry, saved)
  onChange({ token: undefined, colorOverride: undefined, layer: first ?? entry.layer })
}

function EditorRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * A composite token's parts (design-options-values.md, Composite token), folded under a disclosure in the token's
 * color. Its color can be overridden on the layer, shown in the override color with a reset arrow and a dot on the
 * chip; the offsets, blur and spread can't be in Tailwind, so changing them offers Detach.
 */
function TokenParts({
  entry,
  tokensOnly,
  saved,
  spread,
  onChange
}: {
  entry: ShadowEntry
  tokensOnly: boolean
  saved: ShadowToken[]
  spread: boolean
  onChange: (change: Partial<ShadowEntry>) => void
}) {
  const [open, setOpen] = useState(true)
  const token = [...allShadowTokens, ...saved].find((option) => option.name === entry.token)
  const own = token?.layers[0] ?? entry.layer
  const color: ListColor = entry.colorOverride ?? { color: own.color, alpha: own.alpha }
  const overridden = entry.colorOverride !== undefined
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-1">
      <CollapsibleTrigger className="flex items-center gap-1 self-start rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {`${token?.layers.length ?? 1} ${token?.layers.length === 1 ? "layer" : "layers"} in ${entry.token}`}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1 border-l-2 pl-2" style={{ borderColor: "var(--primary)" }}>
        {(token?.layers ?? [entry.layer]).map((part, index) => (
          <div key={index} className="flex items-center justify-between gap-2 text-xs tabular-nums">
            <span>{`Layer ${index + 1}`}</span>
            <span className="text-muted-foreground">{layerNumbers(part, spread)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[88px_1fr] items-center gap-2">
          <span
            className="flex items-center gap-0.5 text-xs"
            style={overridden ? { color: overrideColor } : { color: "var(--muted-foreground)" }}
          >
            Color
            {overridden && (
              <Hint label={`Reset to ${entry.token}'s color`}>
                <button
                  type="button"
                  aria-label={`Reset color to ${entry.token}'s`}
                  onClick={() => onChange({ colorOverride: undefined })}
                  className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <RotateCcw className="size-3" />
                </button>
              </Hint>
            )}
          </span>
          <ColorInput
            label="Shadow color"
            value={color.color}
            alpha={color.alpha}
            tokensOnly={tokensOnly}
            used={usedColors}
            onChange={(next, alpha) =>
              onChange({ colorOverride: next === undefined ? undefined : { color: next, alpha } })
            }
          />
        </div>
        <RowMessage tone="note">
          {"Tailwind overrides only a shadow token's color. To change its offsets, blur or spread, detach it."}
        </RowMessage>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 self-start text-xs"
          onClick={() => detach(entry, saved, onChange)}
        >
          <Unlink className="size-3.5" /> Detach
        </Button>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A card drawn with the shadows, over shapes, and a line of text for a text shadow. */
export function ShadowPreview({
  entries,
  onText = false,
  filled = true,
  saved = []
}: {
  entries: ShadowEntry[]
  onText?: boolean
  /** Whether the layer has a fill; a text layer without one shows only its letters. */
  filled?: boolean
  saved?: ShadowToken[]
}) {
  const drawing = shadowDrawing(entries, drawColor, saved)
  const textShadow = onText ? drawing.textShadow : undefined
  const boxShadow = onText
    ? shadowDrawing(
        entries.filter((entry) => entry.kind !== "drop"),
        drawColor,
        saved
      ).boxShadow
    : drawing.boxShadow
  return (
    <div
      aria-label="The layer"
      className={`relative grid place-items-center rounded-xl font-semibold text-neutral-900 ${onText ? "text-3xl" : "text-xs"} ${filled ? "bg-white" : ""}`}
      style={{
        width: 200,
        height: 120,
        boxShadow: boxShadow || undefined,
        filter: drawing.dropShadow || undefined,
        textShadow: textShadow || undefined
      }}
    >
      Plans
    </div>
  )
}
