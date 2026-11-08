import {
  Button,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { ArrowLeftRight, ChevronDown, Image as ImageIcon, Minus, Plus, Repeat, RotateCw, Unlink } from "lucide-react"
import { type CSSProperties, type PointerEvent, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { Checker, ColorInput } from "./color-picker.tsx"
import { usedColors } from "./data.ts"
import { AngleField, ListRow, moved, NineSpot, PercentField, RowMessage } from "./list-parts.tsx"
import {
  drawColor,
  type GradientKind,
  type GradientPaint,
  type GradientToken,
  gradientTokens,
  imagePreview,
  type ImageFit,
  type ImagePaint,
  type Interpolation,
  newId,
  type Paint,
  type PaintEntry,
  projectImages,
  type Stop
} from "./lists-data.ts"
import {
  gradientCss,
  imageSizeCss,
  layerCss,
  paintIsArbitrary,
  paintLayers,
  resolveGradient,
  simpleGradient
} from "./lists-writes.ts"

/*
 * Fill's paint stack (design-options-values.md, Paint stack): solids, gradients and images, top first, as CSS paints
 * them. Each entry is a row: its type menu, its preview, which opens its editor, its value or token, its alpha, the eye
 * and −. A gradient's editor has the bar of stops, the Stops list, the angle with Flip and Rotate 90°, Repeat and the
 * interpolation; an image's has the project's images, the fit and a nine-spot position.
 */

const kindNames = { solid: "Solid", linear: "Linear", radial: "Radial", angular: "Angular", image: "Image" } as const

/** How a gradient blends its colors, `in oklab` unless another is chosen. */
const blends: { value: Interpolation; label: string }[] = [
  { value: "oklab", label: "In OKLab" },
  { value: "oklch", label: "In OKLCH" },
  { value: "srgb", label: "In sRGB" }
]
type PaintKind = keyof typeof kindNames

const isGradient = (paint: Paint): paint is GradientPaint =>
  paint.kind === "linear" || paint.kind === "radial" || paint.kind === "angular"

const glyphs: Record<Exclude<PaintKind, "image">, string> = {
  solid: "currentColor",
  linear: "linear-gradient(90deg, currentColor, transparent)",
  radial: "radial-gradient(circle, currentColor, transparent 75%)",
  angular: "conic-gradient(currentColor, transparent, currentColor)"
}

/** A small mark for each type, for the type menu. */
function TypeGlyph({ kind }: { kind: PaintKind }) {
  if (kind === "image") return <ImageIcon className="size-3.5" />
  return (
    <span
      aria-hidden
      className="block size-3.5 rounded-sm border border-current/40"
      style={{ background: glyphs[kind] }}
    />
  )
}

/** A paint changed to another type, keeping its colors: a solid becomes a gradient from it to it at 0%. */
function changeKind(paint: Paint, kind: PaintKind): Paint {
  if (paint.kind === kind) return paint
  const first = isGradient(paint) ? paint.stops[0] : undefined
  const color = paint.kind === "solid" ? { color: paint.color || "primary", alpha: paint.alpha } : first
  if (kind === "solid") return { kind: "solid", color: color?.color ?? "primary", alpha: color?.alpha }
  if (kind === "image") return { kind: "image", src: "/images/hero.jpg", fit: "fill", position: [50, 50] }
  if (isGradient(paint)) return { ...paint, kind, token: undefined }
  return {
    kind,
    angle: kind === "angular" ? 0 : 90,
    stops: [
      { id: newId("stop"), position: 0, color: color?.color ?? "primary", alpha: color?.alpha },
      { id: newId("stop"), position: 100, color: color?.color ?? "primary", alpha: 0 }
    ]
  }
}

/** Why a gradient is written as one value rather than from, via and to, naming what makes it so. */
function longReason(paint: GradientPaint): string {
  if (paint.repeat) return "A repeating gradient has no utility, so it's written as an arbitrary value."
  const prefix = { linear: "bg-linear", radial: "bg-radial", angular: "bg-conic" }[paint.kind]
  const parts = [
    paint.stops.length > 3 && `${paint.stops.length} stops`,
    paint.stops.some((stop) => stop.hint !== undefined) && "a color hint",
    !Number.isInteger(paint.angle) && `an angle of ${paint.angle}°`,
    paint.kind === "angular" &&
      paint.center !== undefined &&
      (paint.center[0] !== 50 || paint.center[1] !== 50) &&
      "a center off the middle"
  ].filter((part): part is string => typeof part === "string")
  const listed = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]
  return `From, via and to can't hold ${listed}, so it's written inside the utility: ${prefix}-[…].`
}

/** The gradient a bar of stops draws: the stops left to right, whatever the gradient's kind. */
const barGradient = (paint: GradientPaint) =>
  gradientCss({ ...paint, kind: "linear", angle: 90, repeat: false }, drawColor)

const checker: CSSProperties = { background: "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 8px 8px" }

export function PaintStack({
  entries,
  onChange,
  mixed = false,
  tokensOnly = false,
  saved,
  onSave,
  openId
}: {
  entries: PaintEntry[]
  onChange: (entries: PaintEntry[]) => void
  /** The selected layers' fills differ: "Several fills", with + replacing them all. */
  mixed?: boolean
  tokensOnly?: boolean
  /** Gradient tokens saved from this story, beside the project's. */
  saved: GradientToken[]
  onSave: (token: GradientToken) => void
  /** The entry whose editor is open at first, for a story. */
  openId?: string
}) {
  const update = (id: string, paint: Partial<PaintEntry>) =>
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...paint } : entry)))
  const add = () => {
    const added: PaintEntry = { id: newId("fill"), paint: { kind: "solid", color: "background" } }
    onChange(mixed ? [added] : [added, ...entries])
  }
  const arbitrary = paintIsArbitrary(entries, saved)
  return (
    <PanelSection
      title="Fill"
      action={
        <Hint label={mixed ? "Replace every layer's fills with one" : "Add fill"}>
          <Button variant="ghost" size="icon-sm" className="size-6" aria-label="Add fill" onClick={add}>
            <Plus />
          </Button>
        </Hint>
      }
    >
      {mixed && (
        <Hint label="The selected layers have different fills" detail="+ replaces them all with one">
          <p className="px-1 text-xs text-muted-foreground">Several fills</p>
        </Hint>
      )}
      {!mixed && entries.length > 0 && (
        <div className="flex flex-col gap-1">
          {entries.map((entry, index) => (
            <PaintRow
              key={entry.id}
              entry={entry}
              index={index}
              tokensOnly={tokensOnly}
              saved={saved}
              onSave={onSave}
              startOpen={entry.id === openId}
              onChange={(change) => update(entry.id, change)}
              onMove={(from, to) => {
                if (to >= 0 && to < entries.length) onChange(moved(entries, from, to))
              }}
              onRemove={() => onChange(entries.filter((other) => other.id !== entry.id))}
            />
          ))}
          {arbitrary && (
            <RowMessage tone="note">
              {
                "Tailwind's utilities hold one gradient or image over the fill color, so these fills are written as one arbitrary value."
              }
            </RowMessage>
          )}
        </div>
      )}
    </PanelSection>
  )
}

function PaintRow({
  entry,
  index,
  tokensOnly,
  saved,
  onSave,
  startOpen,
  onChange,
  onMove,
  onRemove
}: {
  entry: PaintEntry
  index: number
  tokensOnly: boolean
  saved: GradientToken[]
  onSave: (token: GradientToken) => void
  startOpen: boolean
  onChange: (change: Partial<PaintEntry>) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}) {
  const { paint } = entry
  const name = `Fill ${index + 1}`
  const setPaint = (next: Paint) => onChange({ paint: next })
  return (
    <ListRow
      name={name}
      group="fills"
      index={index}
      off={entry.off}
      onMove={onMove}
      onToggle={() => onChange({ off: !entry.off })}
      onRemove={onRemove}
    >
      <DropdownMenu>
        <Hint label={`${kindNames[paint.kind]}: change type`}>
          <DropdownMenuTrigger
            aria-label={`${name} type: ${kindNames[paint.kind]}`}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
          >
            <TypeGlyph kind={paint.kind} />
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuRadioGroup
            value={paint.kind}
            onValueChange={(kind) => setPaint(changeKind(paint, kind as PaintKind))}
          >
            {(Object.keys(kindNames) as PaintKind[]).map((kind) => (
              <DropdownMenuRadioItem key={kind} value={kind} className="gap-2 text-xs">
                <TypeGlyph kind={kind} />
                {kindNames[kind]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {paint.kind === "solid" && (
        <div className="min-w-0 flex-1">
          <ColorInput
            label={name}
            value={paint.color === "" ? undefined : paint.color}
            alpha={paint.alpha}
            allowed={paint.allowed}
            tokensOnly={tokensOnly}
            used={usedColors}
            open={startOpen}
            onAllow={(allowed) => setPaint({ ...paint, allowed })}
            onChange={(color, alpha) => setPaint({ kind: "solid", color: color ?? "", alpha })}
          />
        </div>
      )}
      {isGradient(paint) && (
        <GradientRow
          name={name}
          paint={paint}
          tokensOnly={tokensOnly}
          saved={saved}
          onSave={onSave}
          startOpen={startOpen}
          onChange={setPaint}
        />
      )}
      {paint.kind === "image" && <ImageRow name={name} paint={paint} startOpen={startOpen} onChange={setPaint} />}
    </ListRow>
  )
}

/** A gradient's row: its strip, which opens the editor, its token chip or kind and angle, and every stop's alpha. */
function GradientRow({
  name,
  paint,
  tokensOnly,
  saved,
  onSave,
  startOpen,
  onChange
}: {
  name: string
  paint: GradientPaint
  tokensOnly: boolean
  saved: GradientToken[]
  onSave: (token: GradientToken) => void
  startOpen: boolean
  onChange: (paint: GradientPaint) => void
}) {
  const [open, setOpen] = useState(startOpen)
  const resolved = resolveGradient(paint, saved)
  const angled = paint.kind === "linear" || paint.kind === "angular"
  const summary = `${kindNames[paint.kind]}${angled ? ` ${resolved.angle}°` : ""}${resolved.repeat ? ", repeating" : ""}`
  const alphas = new Set(resolved.stops.map((stop) => stop.alpha ?? 100))
  const alpha = alphas.size === 1 ? [...alphas][0] : undefined
  const [typed, setTyped] = useState<string>()
  const commitAlpha = () => {
    if (typed === undefined) return
    const number = Number(typed.replace("%", "").trim())
    setTyped(undefined)
    if (typed.trim() === "" || !Number.isFinite(number)) return
    const next = Math.min(100, Math.max(0, Math.round(number)))
    onChange({
      ...resolved,
      token: undefined,
      stops: resolved.stops.map((stop) => ({ ...stop, alpha: next === 100 ? undefined : next }))
    })
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border bg-transparent pl-1 text-xs dark:bg-input/30">
          <PopoverTrigger
            aria-label={`${name}: ${paint.token ?? summary}, edit`}
            className="block h-4 w-6 shrink-0 overflow-hidden rounded-sm border outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={checker}
          >
            <span className="block size-full" style={{ background: gradientCss(resolved, drawColor) }} />
          </PopoverTrigger>
          {paint.token === undefined ? (
            <span className="truncate">{summary}</span>
          ) : (
            <Hint label={paint.token} detail="A gradient token. Editing its stops detaches it">
              <span className="truncate rounded-sm bg-accent px-1 py-0.5 font-mono">
                {paint.token.replace("gradient-", "")}
              </span>
            </Hint>
          )}
        </div>
        <PopoverContent className="w-72 gap-0 p-0" align="start">
          <GradientEditor paint={paint} tokensOnly={tokensOnly} saved={saved} onSave={onSave} onChange={onChange} />
        </PopoverContent>
      </Popover>
      <Hint label="Every stop's alpha" detail={alpha === undefined ? "The stops' alphas differ" : undefined}>
        <label className="flex h-7 w-12 shrink-0 items-center rounded-md border bg-transparent px-1 text-xs focus-within:ring-2 focus-within:ring-ring dark:bg-input/30">
          <input
            aria-label={`${name} alpha`}
            inputMode="numeric"
            placeholder="Mixed"
            value={typed ?? (alpha === undefined ? "" : String(alpha))}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
              if (event.key === "Escape") setTyped(undefined)
            }}
            onBlur={commitAlpha}
            className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none placeholder:text-muted-foreground"
          />
          {(alpha !== undefined || typed !== undefined) && <span className="pl-0.5 text-muted-foreground">%</span>}
        </label>
      </Hint>
    </>
  )
}

/**
 * A gradient's editor: its kind, the bar of stops, the angle or center, Repeat and how colors blend, then the Stops
 * list. A gradient token's stops show here too; editing one detaches it, writing its stops as the fill's own.
 */
export function GradientEditor({
  paint,
  tokensOnly = false,
  saved = [],
  onSave,
  onChange
}: {
  paint: GradientPaint
  tokensOnly?: boolean
  saved?: GradientToken[]
  onSave?: (token: GradientToken) => void
  onChange: (paint: GradientPaint) => void
}) {
  const resolved = resolveGradient(paint, saved)
  const [selected, setSelected] = useState(resolved.stops[0]?.id)
  const [detached, setDetached] = useState<string>()
  // Editing a token's part detaches it, and says so.
  const edit = (change: Partial<GradientPaint>) => {
    if (paint.token !== undefined) setDetached(paint.token)
    onChange({ ...resolved, ...change, token: undefined })
  }
  const setStops = (stops: Stop[]) => edit({ stops })
  const sorted = [...resolved.stops].sort((a, b) => a.position - b.position)
  const tokens = [...gradientTokens, ...saved]
  const long = !simpleGradient(resolved)
  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Gradient type"
          value={[paint.kind]}
          onValueChange={([kind]) => kind && edit({ kind: kind as GradientKind })}
        >
          {(["linear", "radial", "angular"] as const).map((kind) => (
            <ToggleGroupItem key={kind} value={kind} className="h-7 px-2 text-xs">
              {kindNames[kind]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Gradient tokens"
            className="ml-auto flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
          >
            Tokens <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup
              value={paint.token ?? ""}
              onValueChange={(token) => {
                setDetached(undefined)
                onChange({ ...resolved, token: token as string })
              }}
            >
              {tokens.map((token) => (
                <DropdownMenuRadioItem key={token.name} value={token.name} className="gap-2 text-xs">
                  <span
                    aria-hidden
                    className="block h-3 w-5 rounded-sm border"
                    style={{ background: gradientCss(token.paint as GradientPaint, drawColor) }}
                  />
                  {token.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {paint.token !== undefined && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-xs" onClick={() => onChange({ ...resolved, token: undefined })}>
                  <Unlink className="size-3.5" /> Detach
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {paint.token !== undefined && (
        <RowMessage tone="note">{`Uses ${paint.token}. Editing a stop detaches it.`}</RowMessage>
      )}
      {detached !== undefined && paint.token === undefined && (
        <RowMessage tone="note">{`Detached from ${detached}: these stops are the fill's own now.`}</RowMessage>
      )}
      <StopsBar paint={resolved} selected={selected} onSelect={setSelected} onChange={setStops} />
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1">
        {(paint.kind === "linear" || paint.kind === "angular") && (
          <>
            <AngleField
              label={paint.kind === "linear" ? "Angle" : "Start angle"}
              value={resolved.angle}
              onChange={(angle) => edit({ angle })}
            />
            <Hint label="Flip" detail="Reverses the stops">
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7"
                aria-label="Flip"
                onClick={() =>
                  setStops(resolved.stops.map((stop) => ({ ...stop, position: 100 - stop.position, hint: undefined })))
                }
              >
                <ArrowLeftRight />
              </Button>
            </Hint>
            <Hint label="Rotate 90°">
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7"
                aria-label="Rotate 90°"
                onClick={() => edit({ angle: resolved.angle + 90 })}
              >
                <RotateCw />
              </Button>
            </Hint>
          </>
        )}
      </div>
      {(paint.kind === "radial" || paint.kind === "angular") && (
        <div className="grid grid-cols-2 gap-1">
          {(["X", "Y"] as const).map((axis, which) => (
            <PercentField
              key={axis}
              label={`Center ${axis}`}
              inner={axis}
              value={(resolved.center ?? [50, 50])[which]}
              onChange={(value) => {
                const center = [...(resolved.center ?? [50, 50])] as [number, number]
                center[which] = value
                edit({ center })
              }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <Hint label="Repeat" detail="Writes repeating-linear-gradient and its kin">
          <Toggle
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            aria-label="Repeat"
            pressed={resolved.repeat ?? false}
            onPressedChange={(repeat) => edit({ repeat: repeat || undefined })}
          >
            <Repeat /> Repeat
          </Toggle>
        </Hint>
        <Select
          items={blends}
          value={resolved.interpolation ?? "oklab"}
          onValueChange={(interpolation) => edit({ interpolation: interpolation as Interpolation })}
        >
          <SelectTrigger size="sm" aria-label="Blend colors in" className="ml-auto h-7 px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {blends.map((blend) => (
              <SelectItem key={blend.value} value={blend.value}>
                {blend.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground uppercase">Stops</span>
        <Hint label="Add stop">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            aria-label="Add stop"
            onClick={() => {
              const gaps = sorted.slice(1).map((stop, index) => ({
                at: (stop.position + sorted[index]!.position) / 2,
                size: stop.position - sorted[index]!.position,
                from: sorted[index]!
              }))
              const widest = gaps.reduce((best, gap) => (gap.size > best.size ? gap : best), gaps[0]!)
              const added = { ...widest.from, id: newId("stop"), position: Math.round(widest.at), hint: undefined }
              setSelected(added.id)
              setStops([...resolved.stops, added])
            }}
          >
            <Plus />
          </Button>
        </Hint>
      </div>
      <div className="flex flex-col gap-1">
        {sorted.map((stop, index) => (
          <div
            key={stop.id}
            onFocusCapture={() => setSelected(stop.id)}
            className={`grid grid-cols-[56px_1fr_auto] items-start gap-1 rounded-md ${selected === stop.id ? "bg-accent/50" : ""}`}
          >
            <PercentField
              label={`Stop ${index + 1} position`}
              value={stop.position}
              onChange={(position) =>
                setStops(resolved.stops.map((other) => (other.id === stop.id ? { ...other, position } : other)))
              }
            />
            <ColorInput
              label={`Stop ${index + 1} color`}
              value={stop.color}
              alpha={stop.alpha}
              tokensOnly={tokensOnly}
              used={usedColors}
              onChange={(color, alpha) =>
                setStops(
                  resolved.stops.map((other) =>
                    other.id === stop.id ? { ...other, color: color ?? other.color, alpha } : other
                  )
                )
              }
            />
            <Hint label={resolved.stops.length > 2 ? "Remove stop" : "A gradient needs two stops"}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7"
                aria-label={`Remove stop ${index + 1}`}
                disabled={resolved.stops.length <= 2}
                onClick={() => setStops(resolved.stops.filter((other) => other.id !== stop.id))}
              >
                <Minus />
              </Button>
            </Hint>
          </div>
        ))}
      </div>
      {long && onSave && (
        <div className="flex flex-col gap-1">
          <RowMessage tone="note">{longReason(resolved)}</RowMessage>
          <Button
            variant="outline"
            size="sm"
            className="h-7 self-start text-xs"
            onClick={() => {
              const name = `gradient-saved-${saved.length + 1}`
              onSave({ name, paint: { ...resolved, token: undefined } as GradientToken["paint"] })
              onChange({ ...resolved, token: name })
            }}
          >
            Save as token
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * The bar of stops: click the bar to add one, drag a stop along it to move it or off it to remove it, and drag the
 * diamond between two stops to set where they blend halfway (a color hint). A stop moves 1% with Left and Right, 10%
 * with Shift, and Delete removes it.
 */
function StopsBar({
  paint,
  selected,
  onSelect,
  onChange
}: {
  paint: GradientPaint
  selected: string | undefined
  onSelect: (id: string) => void
  onChange: (stops: Stop[]) => void
}) {
  const [leaving, setLeaving] = useState<string>()
  const sorted = [...paint.stops].sort((a, b) => a.position - b.position)
  const percentAt = (clientX: number, box: DOMRect) =>
    Math.min(100, Math.max(0, Math.round(((clientX - box.left) / box.width) * 100)))
  const setStop = (id: string, change: Partial<Stop>) =>
    onChange(paint.stops.map((stop) => (stop.id === id ? { ...stop, ...change } : stop)))
  const dragStop = (event: PointerEvent<HTMLButtonElement>, stop: Stop) => {
    const box = event.currentTarget.parentElement!.getBoundingClientRect()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    onSelect(stop.id)
    let off = false
    let stops = paint.stops
    const onMove = (next: globalThis.PointerEvent) => {
      // Dragged well off the bar, it's removed when let go, as Figma's stops are.
      off = paint.stops.length > 2 && Math.abs(next.clientY - (box.top + box.height / 2)) > 28
      setLeaving(off ? stop.id : undefined)
      stops = paint.stops.map((other) =>
        other.id === stop.id ? { ...other, position: percentAt(next.clientX, box) } : other
      )
      onChange(stops)
    }
    const onUp = () => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
      setLeaving(undefined)
      if (off) onChange(stops.filter((other) => other.id !== stop.id))
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
  }
  const dragHint = (event: PointerEvent<HTMLButtonElement>, from: Stop, to: Stop) => {
    const box = event.currentTarget.parentElement!.getBoundingClientRect()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const onMove = (next: globalThis.PointerEvent) => {
      const at = Math.min(to.position - 1, Math.max(from.position + 1, percentAt(next.clientX, box)))
      setStop(from.id, { hint: at })
    }
    const onUp = () => {
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
    }
    target.addEventListener("pointermove", onMove)
    target.addEventListener("pointerup", onUp)
  }
  return (
    <div className="flex flex-col gap-0.5 px-1.5">
      <Hint label="Click to add a stop">
        <button
          type="button"
          aria-label="Add a stop where clicked"
          onClick={(event) => {
            const position = percentAt(event.clientX, event.currentTarget.getBoundingClientRect())
            const before = [...sorted].reverse().find((stop) => stop.position <= position) ?? sorted[0]!
            const added = { ...before, id: newId("stop"), position, hint: undefined }
            onSelect(added.id)
            onChange([...paint.stops, added])
          }}
          className="block h-5 w-full cursor-copy overflow-hidden rounded-sm border outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={checker}
        >
          <span className="block size-full" style={{ background: barGradient(paint) }} />
        </button>
      </Hint>
      <div className="relative h-4">
        {sorted.slice(0, -1).map((stop, index) => {
          const after = sorted[index + 1]!
          if (after.position - stop.position < 4) return null
          const at = stop.hint ?? (stop.position + after.position) / 2
          return (
            <Hint
              key={`hint-${stop.id}`}
              label="Midpoint"
              detail="Drag to move where these stops blend halfway; double-click to center it"
            >
              <button
                type="button"
                aria-label={`Midpoint between stop ${index + 1} and ${index + 2}: ${Math.round(at)}%`}
                onPointerDown={(event) => dragHint(event, stop, after)}
                onDoubleClick={() => setStop(stop.id, { hint: undefined })}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                  event.preventDefault()
                  const step = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1)
                  setStop(stop.id, {
                    hint: Math.min(after.position - 1, Math.max(stop.position + 1, Math.round(at) + step))
                  })
                }}
                className={`absolute top-1 size-2 -translate-x-1/2 rotate-45 border outline-none focus-visible:ring-2 focus-visible:ring-ring ${stop.hint === undefined ? "border-muted-foreground/60 bg-background" : "border-foreground bg-foreground"}`}
                style={{ left: `${at}%` }}
              />
            </Hint>
          )
        })}
        {sorted.map((stop, index) => (
          <button
            key={stop.id}
            type="button"
            aria-label={`Stop ${index + 1}: ${stop.position}%`}
            aria-pressed={selected === stop.id}
            onPointerDown={(event) => dragStop(event, stop)}
            onFocus={() => onSelect(stop.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault()
                const step = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1)
                setStop(stop.id, { position: Math.min(100, Math.max(0, stop.position + step)) })
              }
              if ((event.key === "Delete" || event.key === "Backspace") && paint.stops.length > 2) {
                event.preventDefault()
                onChange(paint.stops.filter((other) => other.id !== stop.id))
              }
            }}
            className={`absolute top-0 grid size-4 -translate-x-1/2 touch-none place-items-center rounded-sm border-2 bg-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === stop.id ? "border-[#0d99ff]" : "border-background"} ${leaving === stop.id ? "opacity-30" : ""}`}
            style={{ left: `${stop.position}%` }}
          >
            <Checker hex={drawColor({ color: stop.color })} alpha={stop.alpha} className="size-2.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

/** An image fill's row: its thumbnail, which opens the editor, its name and its fit. */
function ImageRow({
  name,
  paint,
  startOpen,
  onChange
}: {
  name: string
  paint: ImagePaint
  startOpen: boolean
  onChange: (paint: ImagePaint) => void
}) {
  const file = paint.src.replace("/images/", "")
  return (
    <Popover defaultOpen={startOpen}>
      <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-transparent pl-1 text-xs dark:bg-input/30">
        <PopoverTrigger
          aria-label={`${name}: ${file}, edit`}
          className="block h-4 w-6 shrink-0 overflow-hidden rounded-sm border bg-cover bg-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundImage: `url("${imagePreview(paint.src) ?? ""}")` }}
        />
        <span className="truncate">{file}</span>
        <span className="ml-auto pr-1.5 text-muted-foreground">{fitNames[paint.fit]}</span>
      </div>
      <PopoverContent className="w-64 p-2" align="start">
        <ImageEditor paint={paint} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}

const fitNames: Record<ImageFit, string> = { fill: "Fill", fit: "Fit", crop: "Crop", tile: "Tile" }
const fitHints: Record<ImageFit, string> = {
  fill: "Covers the box, cropping what doesn't fit: background-size: cover",
  fit: "Shows the whole image inside the box: background-size: contain",
  crop: "At a scale of its own: background-size as a percentage",
  tile: "Repeats at its own size: background-repeat: repeat"
}

/** An image fill's editor: the project's images, the fit, Crop's scale, and where the image sits. */
function ImageEditor({ paint, onChange }: { paint: ImagePaint; onChange: (paint: ImagePaint) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <fieldset className="grid grid-cols-3 gap-1" aria-label="The project's images">
        {projectImages.map((image) => {
          const src = `/images/${image.name}`
          return (
            <Hint key={image.name} label={image.name} detail="In public/images/">
              <button
                type="button"
                aria-label={image.name}
                aria-pressed={paint.src === src}
                onClick={() => onChange({ ...paint, src })}
                className={`h-12 rounded-md border bg-cover bg-center outline-none focus-visible:ring-2 focus-visible:ring-ring ${paint.src === src ? "ring-2 ring-[#0d99ff]" : ""}`}
                style={{ backgroundImage: `url("${image.preview}")` }}
              />
            </Hint>
          )
        })}
      </fieldset>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        aria-label="Fit"
        value={[paint.fit]}
        onValueChange={([fit]) => fit && onChange({ ...paint, fit: fit as ImageFit })}
      >
        {(Object.keys(fitNames) as ImageFit[]).map((fit) => (
          <Hint key={fit} label={fitNames[fit]} detail={fitHints[fit]}>
            <ToggleGroupItem value={fit} className="h-7 flex-1 px-2 text-xs">
              {fitNames[fit]}
            </ToggleGroupItem>
          </Hint>
        ))}
      </ToggleGroup>
      {paint.fit === "crop" && (
        <PercentField
          label="Scale"
          inner="Scale"
          min={1}
          max={1000}
          value={paint.scale ?? 150}
          onChange={(scale) => onChange({ ...paint, scale })}
        />
      )}
      <NineSpot
        label="Image position"
        value={paint.position}
        onChange={(position) => onChange({ ...paint, position })}
      />
    </div>
  )
}

/** A card drawn with the fills, over shapes, so translucent fills show what's behind. */
export function PaintPreview({ entries, saved = [] }: { entries: PaintEntry[]; saved?: GradientToken[] }) {
  const { base, images } = paintLayers(entries, saved)
  const withImage = images.some((entry) => entry.paint.kind === "image")
  const each = (pick: (paint: ImagePaint) => string, other: string) =>
    images.map((entry) => (entry.paint.kind === "image" ? pick(entry.paint) : other)).join(", ")
  const style: CSSProperties = {
    width: 200,
    height: 120,
    backgroundColor: base ? drawColor(base) : undefined,
    backgroundImage:
      images.length > 0
        ? images
            .map((entry) =>
              layerCss(
                entry.paint,
                drawColor,
                entry.paint.kind === "image" ? `"${imagePreview(entry.paint.src) ?? ""}"` : undefined
              )
            )
            .join(", ")
        : undefined,
    ...(withImage
      ? {
          backgroundSize: each(imageSizeCss, "auto"),
          backgroundPosition: each((paint) => paint.position.map((value) => `${value}%`).join(" "), "0% 0%"),
          backgroundRepeat: each((paint) => (paint.fit === "tile" ? "repeat" : "no-repeat"), "repeat")
        }
      : {})
  }
  return (
    <div
      aria-label="The layer"
      className="relative grid place-items-center rounded-xl border border-black/10 text-xs text-neutral-900"
      style={style}
    >
      Plans
    </div>
  )
}
