import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { ArrowLeftRight, ChevronDown, Image as ImageIcon, Minus, Plus, Repeat, RotateCw } from "lucide-react"
import { type CSSProperties, type PointerEvent, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { PanelSelectContent, Swatch } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { GroupLabel, PanelSection } from "../../chrome/PanelSection.tsx"
import { checker } from "../../chrome/token-previews.tsx"
import { AngleField } from "./angle.tsx"
import { ColorInput } from "./color-picker.tsx"
import { clamp, gradientCss } from "./css-values.ts"
import { usedColors } from "./data.ts"
import { drag, MessageLine, PercentField, TokenChip, TokenList, useTokens } from "./field-parts.tsx"
import { ListRow, type ListRowProps, moved, TypeMenu, type TypeOption } from "./list-parts.tsx"
import {
  drawListColor,
  type GradientPaint,
  gradientDirections,
  imagePreview,
  type ImageFit,
  type ImagePaint,
  type Interpolation,
  type ListColor,
  newId,
  type Paint,
  type PaintEntry,
  projectImages,
  type Stop
} from "./lists-data.ts"
import {
  imageSizeCss,
  layerCss,
  paintIsArbitrary,
  paintLayers,
  resolveGradient,
  simpleGradient
} from "./lists-writes.ts"
import { angleDegrees, angleOf } from "./motion-data.ts"
import { Card } from "./playground.tsx"
import { PositionInBox } from "./position-box.tsx"
import { type ColorToken, type GradientToken, gradientToken, gradientTokens } from "./tokens.ts"

/*
 * Fill's paint stack (design-options-values.md, Paint stack): solids, gradients and images, top first, as CSS paints
 * them. Each entry is a list row: a gradient's strip or an image's thumbnail, which opens its editor, its type menu, its
 * summary or token chip, a gradient's alpha, the eye and −. A solid is the color field, whose swatch opens the color
 * picker, after its type's glyph. A gradient's editor has the bar of stops, the Stops list, the angle with Flip and
 * Rotate 90°, Repeat and the interpolation; an image's has the project's images, the fit and its position in the box.
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

/** Every type a fill can be, in the type menu's order. */
const paintTypes: TypeOption<PaintKind>[] = (["solid", "linear", "radial", "angular", "image"] as const).map(
  (kind) => ({
    value: kind,
    label: kindNames[kind],
    glyph: <TypeGlyph kind={kind} />
  })
)

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
  if (paint.repeat) return "No utility for repeating gradients, so it's an arbitrary value."
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
  return `Written as ${prefix}-[…]: from, via and to can't hold ${listed}.`
}

/** A gradient as a preview draws it, with the project's colors. */
const drawnGradient = (paint: GradientPaint, colors: readonly ColorToken[]) =>
  gradientCss(paint, (stop) => drawListColor(stop, colors))

/** A gradient over chrome's checkerboard, so a translucent stop shows as one, as a swatch does. */
const overChecker = (image: string): CSSProperties => ({
  ...checker,
  backgroundImage: `${image}, ${checker.backgroundImage}`,
  backgroundSize: `auto, ${checker.backgroundSize}`
})

/** The gradient a bar of stops draws: the stops left to right, whatever the gradient's kind. */
const barGradient = (paint: GradientPaint, colors: readonly ColorToken[]) =>
  drawnGradient({ ...paint, kind: "linear", angle: 90, repeat: false }, colors)

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
            <MessageLine
              message={{
                tone: "note",
                text: "Too many layers for Tailwind's utilities, so it's one arbitrary value."
              }}
            />
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
  const row = {
    name,
    group: "fills",
    index,
    off: entry.off,
    onMove,
    onToggle: () => onChange({ off: !entry.off }),
    onRemove
  }
  if (isGradient(paint)) {
    return (
      <GradientRow
        row={row}
        paint={paint}
        tokensOnly={tokensOnly}
        saved={saved}
        onSave={onSave}
        startOpen={startOpen}
        onChange={setPaint}
        onKind={(kind) => setPaint(changeKind(paint, kind))}
      />
    )
  }
  if (paint.kind === "image") {
    return (
      <ListRow
        {...row}
        preview={
          <span
            className="block h-4 w-6 rounded-sm bg-cover bg-center"
            style={{ backgroundImage: `url("${imagePreview(paint.src) ?? ""}")` }}
          />
        }
        details={{
          content: <ImageEditor paint={paint} onChange={setPaint} />,
          defaultOpen: startOpen,
          className: "w-64 p-2"
        }}
        type={
          <TypeMenu
            label={name}
            value={paint.kind}
            options={paintTypes}
            onChange={(kind) => setPaint(changeKind(paint, kind))}
          />
        }
      >
        <span className="truncate">{paint.src.replace("/images/", "")}</span>
        <span className="ml-auto text-muted-foreground">{fitNames[paint.fit]}</span>
      </ListRow>
    )
  }
  // A solid is the color field, whose swatch is its preview and opens the color picker, after its type's glyph.
  return (
    <ListRow
      {...row}
      type={
        <TypeMenu
          label={name}
          value={paint.kind}
          options={paintTypes}
          compact
          onChange={(kind) => setPaint(changeKind(paint, kind))}
        />
      }
    >
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
    </ListRow>
  )
}

/**
 * A gradient's row: its strip, which opens the editor, its type, its angle or token chip, and every stop's alpha as
 * one percentage, Mixed while the stops' alphas differ.
 */
function GradientRow({
  row,
  paint,
  tokensOnly,
  saved,
  onSave,
  startOpen,
  onChange,
  onKind
}: {
  row: Omit<ListRowProps, "children">
  paint: GradientPaint
  tokensOnly: boolean
  saved: GradientToken[]
  onSave: (token: GradientToken) => void
  startOpen: boolean
  onChange: (paint: GradientPaint) => void
  onKind: (kind: PaintKind) => void
}) {
  const { tokens: colors } = useTokens("color")
  const resolved = resolveGradient(paint, saved)
  const angled = resolved.kind === "linear" || resolved.kind === "angular"
  let summary = resolved.repeat ? "Repeating" : ""
  if (angled) summary = `${resolved.angle}°${resolved.repeat ? ", repeating" : ""}`
  const alphas = new Set(resolved.stops.map((stop) => stop.alpha))
  const mixed = alphas.size > 1
  const token = [...gradientTokens, ...saved].find((other) => other.name === paint.token)
  return (
    <ListRow
      {...row}
      preview={<span className="block h-4 w-6 rounded-sm" style={overChecker(drawnGradient(resolved, colors))} />}
      details={{
        content: (
          <GradientEditor paint={paint} tokensOnly={tokensOnly} saved={saved} onSave={onSave} onChange={onChange} />
        ),
        defaultOpen: startOpen,
        className: "w-72 gap-0 p-0"
      }}
      type={<TypeMenu label={row.name} value={resolved.kind} options={paintTypes} onChange={onKind} />}
      after={
        <PercentField
          label={`${row.name} opacity`}
          value={mixed ? undefined : [...alphas][0]}
          places={0}
          mixed={mixed}
          hint={{
            label: "Every stop's opacity",
            detail: mixed ? "The stops' opacities differ" : "Written after each stop's color, as from-blue-500/50"
          }}
          rowClassName="col-start-2 row-start-1 w-14"
          onChange={(next) => {
            // Opaque is unset, so 100% writes nothing after the colors.
            const alpha = next === undefined || next >= 100 ? undefined : next
            onChange({ ...resolved, token: undefined, stops: resolved.stops.map((stop) => ({ ...stop, alpha })) })
          }}
        />
      }
    >
      {paint.token === undefined ? (
        <span className="truncate text-muted-foreground tabular-nums">{summary}</span>
      ) : (
        <TokenChip name={paint.token} token={token} namespace="gradient-" preview={null} struck={!token} />
      )}
    </ListRow>
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
  const [tokensOpen, setTokensOpen] = useState(false)
  // Editing a token's part detaches it, and says so.
  const edit = (change: Partial<GradientPaint>) => {
    if (paint.token !== undefined) setDetached(paint.token)
    onChange({ ...resolved, ...change, token: undefined })
  }
  const setStops = (stops: Stop[]) => edit({ stops })
  const sorted = [...resolved.stops].sort((a, b) => a.position - b.position)
  // A token is written as its own class, so only the fill's own stops can be too long for from, via and to.
  const long = paint.token === undefined && !simpleGradient(resolved)
  const center = resolved.center ?? [50, 50]
  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Gradient type"
          value={[resolved.kind]}
          onValueChange={([kind]) => {
            const picked = (["linear", "radial", "angular"] as const).find((option) => option === kind)
            if (picked) edit({ kind: picked })
          }}
        >
          {(["linear", "radial", "angular"] as const).map((kind) => (
            <ToggleGroupItem key={kind} value={kind} className="h-7 px-2 text-xs">
              {kindNames[kind]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Popover open={tokensOpen} onOpenChange={setTokensOpen}>
          <PopoverTrigger
            aria-label="Gradient tokens"
            className="ml-auto flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
          >
            Tokens <ChevronDown className="size-3" />
          </PopoverTrigger>
          <PopoverContent className="w-56 gap-0 p-1" align="end">
            <TokenList
              label="Gradient"
              tokens={[...gradientTokens, ...saved]}
              current={paint.token}
              none="Custom"
              onPick={(name) => {
                // Custom keeps the token's stops as the fill's own: it detaches it.
                setDetached(name === undefined ? paint.token : undefined)
                onChange({ ...resolved, token: name })
                setTokensOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {paint.token !== undefined && (
        <MessageLine message={{ tone: "note", text: `Uses ${paint.token}. Editing a stop detaches it.` }} />
      )}
      {detached !== undefined && paint.token === undefined && (
        <MessageLine message={{ tone: "note", text: `Detached from ${detached}.` }} />
      )}
      <StopsBar paint={resolved} selected={selected} onSelect={setSelected} onChange={setStops} />
      {(resolved.kind === "linear" || resolved.kind === "angular") && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-1">
          <AngleField
            label={resolved.kind === "linear" ? "Angle" : "Start angle"}
            value={angleOf(resolved.angle)}
            // A linear gradient's named directions read as their angles: `to right` is 90°.
            keywords={resolved.kind === "linear" ? gradientDirections : undefined}
            onChange={(angle) => edit({ angle: angleDegrees(angle) })}
          />
          <Hint label="Flip" detail="Reverses the stops">
            <Button
              variant="ghost"
              size="icon-sm"
              className="col-start-2 row-start-1 size-7"
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
              className="col-start-3 row-start-1 size-7"
              aria-label="Rotate 90°"
              onClick={() => edit({ angle: resolved.angle + 90 })}
            >
              <RotateCw />
            </Button>
          </Hint>
        </div>
      )}
      {(resolved.kind === "radial" || resolved.kind === "angular") && (
        <div className="grid grid-cols-2 gap-x-1">
          {(["X", "Y"] as const).map((axis, which) => (
            <PercentField
              key={axis}
              label={`Center ${axis}`}
              inner={axis}
              value={center[which]}
              placeholder="50"
              onChange={(value) => {
                const next: [number, number] = [...center]
                next[which] = value ?? 50
                edit({ center: next })
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
          onValueChange={(interpolation) => {
            const picked = blends.find((blend) => blend.value === interpolation)
            if (picked) edit({ interpolation: picked.value })
          }}
        >
          <SelectTrigger size="sm" aria-label="Blend colors in" className="ml-auto h-7 px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <PanelSelectContent>
            {blends.map((blend) => (
              <SelectItem key={blend.value} value={blend.value}>
                {blend.label}
              </SelectItem>
            ))}
          </PanelSelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <GroupLabel>Stops</GroupLabel>
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
            className={`grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-x-1 rounded-md ${selected === stop.id ? "bg-accent/50" : ""}`}
          >
            <PercentField
              label={`Stop ${index + 1} position`}
              value={stop.position}
              placeholder="0"
              rowClassName="col-start-1 row-start-1"
              onChange={(position) =>
                setStops(
                  resolved.stops.map((other) => (other.id === stop.id ? { ...other, position: position ?? 0 } : other))
                )
              }
            />
            <div className="col-start-2 row-start-1 min-w-0">
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
            </div>
            <Hint label={resolved.stops.length > 2 ? "Remove stop" : "A gradient needs two stops"}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="col-start-3 row-start-1 size-7"
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
          <MessageLine message={{ tone: "note", text: longReason(resolved) }} />
          <Button
            variant="outline"
            size="sm"
            className="h-7 self-start text-xs"
            onClick={() => {
              const name = `gradient-saved-${saved.length + 1}`
              // The fill's own stops become the token's paint.
              onSave(gradientToken(name, resolved))
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
  const { tokens: colors } = useTokens("color")
  const [leaving, setLeaving] = useState<string>()
  const sorted = [...paint.stops].sort((a, b) => a.position - b.position)
  const setStop = (id: string, change: Partial<Stop>) =>
    onChange(paint.stops.map((stop) => (stop.id === id ? { ...stop, ...change } : stop)))
  const dragStop = (event: PointerEvent<HTMLButtonElement>, stop: Stop) => {
    onSelect(stop.id)
    let off = false
    let stops = paint.stops
    drag(event, {
      within: event.currentTarget.parentElement,
      move: (point) => {
        // Dragged well off the bar, it's removed when let go, as Figma's stops are.
        off = paint.stops.length > 2 && Math.abs(point.dy) > 28
        setLeaving(off ? stop.id : undefined)
        stops = paint.stops.map((other) =>
          other.id === stop.id ? { ...other, position: Math.round(point.x * 100) } : other
        )
        onChange(stops)
      },
      end: (_, cancelled) => {
        setLeaving(undefined)
        if (off && !cancelled) onChange(stops.filter((other) => other.id !== stop.id))
      }
    })
  }
  const dragHint = (event: PointerEvent<HTMLButtonElement>, from: Stop, to: Stop) =>
    drag(event, {
      within: event.currentTarget.parentElement,
      move: (point) => setStop(from.id, { hint: clamp(Math.round(point.x * 100), from.position + 1, to.position - 1) })
    })
  return (
    <div className="flex flex-col gap-0.5 px-1.5">
      <Hint label="Click to add a stop">
        <button
          type="button"
          aria-label="Add a stop where clicked"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const position = clamp(Math.round(((event.clientX - box.left) / box.width) * 100), 0, 100)
            const before = [...sorted].reverse().find((stop) => stop.position <= position) ?? sorted[0]!
            const added = { ...before, id: newId("stop"), position, hint: undefined }
            onSelect(added.id)
            onChange([...paint.stops, added])
          }}
          className="block h-5 w-full cursor-copy rounded-sm border outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={overChecker(barGradient(paint, colors))}
        />
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
                  setStop(stop.id, { hint: clamp(Math.round(at) + step, stop.position + 1, after.position - 1) })
                }}
                className={`absolute top-1 size-2 -translate-x-1/2 touch-none rotate-45 border outline-none focus-visible:ring-2 focus-visible:ring-ring ${stop.hint === undefined ? "border-muted-foreground/60 bg-background" : "border-foreground bg-foreground"}`}
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
                setStop(stop.id, { position: clamp(stop.position + step, 0, 100) })
              }
              if ((event.key === "Delete" || event.key === "Backspace") && paint.stops.length > 2) {
                event.preventDefault()
                onChange(paint.stops.filter((other) => other.id !== stop.id))
              }
            }}
            className={`absolute top-0 grid size-4 -translate-x-1/2 touch-none place-items-center rounded-sm border-2 border-background bg-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${leaving === stop.id ? "opacity-30" : ""}`}
            // The selected stop is outlined in the layer's color, as the canvas's selection is.
            style={{ left: `${stop.position}%`, ...(selected === stop.id ? { borderColor: kindColors.layer } : {}) }}
          >
            <Swatch value={drawListColor(stop, colors)} className="size-2.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

const fits: readonly ImageFit[] = ["fill", "fit", "crop", "tile"]
const fitNames: Record<ImageFit, string> = { fill: "Fill", fit: "Fit", crop: "Crop", tile: "Tile" }
const fitHints: Record<ImageFit, string> = {
  fill: "Covers the box, cropping what doesn't fit: background-size: cover",
  fit: "Shows the whole image inside the box: background-size: contain",
  crop: "At a scale of its own: background-size as a percentage",
  tile: "Repeats at its own size: background-repeat: repeat"
}

/** An image fill's editor: the project's images, the fit, Crop's scale, and where the image sits in the box. */
function ImageEditor({ paint, onChange }: { paint: ImagePaint; onChange: (paint: ImagePaint) => void }) {
  const [x, y] = paint.position
  return (
    <div className="flex flex-col gap-2">
      <fieldset className="grid grid-cols-3 gap-1" aria-label="The project's images">
        {projectImages.map((image) => {
          const src = `/images/${image.name}`
          const chosen = paint.src === src
          return (
            <Hint key={image.name} label={image.name} detail="In public/images/">
              <button
                type="button"
                aria-label={image.name}
                aria-pressed={chosen}
                onClick={() => onChange({ ...paint, src })}
                className="h-12 rounded-md border bg-cover bg-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
                // The chosen image is ringed in the layer's color, as the canvas's selection is.
                style={{
                  backgroundImage: `url("${image.preview}")`,
                  ...(chosen ? { boxShadow: `0 0 0 2px ${kindColors.layer}` } : {})
                }}
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
        onValueChange={([fit]) => {
          const picked = fits.find((option) => option === fit)
          if (picked) onChange({ ...paint, fit: picked })
        }}
      >
        {fits.map((fit) => (
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
          placeholder="150"
          value={paint.scale}
          onChange={(scale) => onChange({ ...paint, scale })}
        />
      )}
      <PositionInBox
        label="Image position"
        value={{ x, y }}
        // Unset is the center, where an image sits unless it's placed.
        onChange={(position) => onChange({ ...paint, position: position ? [position.x, position.y] : [50, 50] })}
      />
    </div>
  )
}

/** The card drawn with the fills, so translucent fills show the stage's shapes behind. */
export function PaintPreview({ entries, saved = [] }: { entries: PaintEntry[]; saved?: GradientToken[] }) {
  const { tokens: colors } = useTokens("color")
  const draw = (value: ListColor) => drawListColor(value, colors)
  const { base, images } = paintLayers(entries, saved)
  const withImage = images.some((entry) => entry.paint.kind === "image")
  const each = (pick: (paint: ImagePaint) => string, other: string) =>
    images.map((entry) => (entry.paint.kind === "image" ? pick(entry.paint) : other)).join(", ")
  const style: CSSProperties = {
    borderRadius: 12,
    boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.1)",
    backgroundColor: base ? draw(base) : undefined,
    backgroundImage:
      images.length > 0
        ? images
            .map((entry) =>
              layerCss(
                entry.paint,
                draw,
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
  return <Card style={style} />
}
