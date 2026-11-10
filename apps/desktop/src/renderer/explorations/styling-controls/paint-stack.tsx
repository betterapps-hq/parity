import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch
} from "@buildkitgg/shadcn-baseui-kit"
import { ArrowLeftRight, ChevronDown, Minus, Plus } from "lucide-react"
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
import { Field, FieldGrid } from "./field-row.tsx"
import { addImageFile, DropCover, ImageEditor, useImageDrop } from "./image-fill.tsx"
import { EntryType, ListRow, type ListRowProps, moved, TypeMenu, type TypeOption } from "./list-parts.tsx"
import {
  drawListColor,
  type GradientKind,
  type GradientPaint,
  gradientDirections,
  imageName,
  imagePreview,
  type ImagePaint,
  type Interpolation,
  type ListColor,
  newId,
  type Paint,
  type PaintEntry,
  type Stop
} from "./lists-data.ts"
import { imageSizeCss, layerCss, paintLayers, resolveGradient, simpleGradient } from "./lists-writes.ts"
import { angleDegrees, angleOf } from "./motion-data.ts"
import { Card } from "./playground.tsx"
import type { Carried } from "./sortable.ts"
import { type ColorToken, type GradientToken, gradientToken, gradientTokens } from "./tokens.ts"

/*
 * Fill's paint stack (design-options-values.md, Paint stack): solids, gradients and images, top first, as CSS paints
 * them. + opens a menu of the types, each drawn as the fill it adds, and the fill it adds opens its editor. Each entry is
 * a list row: a gradient's strip or an image's thumbnail with its type and summary or token chip, which opens its
 * editor, a gradient's alpha, the eye and −. A solid is the color field, whose swatch opens the color picker. A
 * gradient's editor names its kind in a menu (Linear, Radial or Angular), then has the bar of stops, its settings named
 * above each (the angle, the center, the blend, Repeat), and apart from them the Stops list with Flip.
 * An image's is in image-fill.tsx, and an image dropped on the section adds an image fill. A fill's type is picked as
 * it's added, so neither the picker nor an editor offers the others.
 */

const kindNames = { solid: "Solid", linear: "Linear", radial: "Radial", angular: "Angular", image: "Image" } as const

/** How a gradient blends its colors, `in oklab` unless another is chosen. */
const blends: { value: Interpolation; label: string }[] = [
  { value: "oklab", label: "OKLab" },
  { value: "oklch", label: "OKLCH" },
  { value: "srgb", label: "sRGB" }
]

type PaintKind = keyof typeof kindNames

const isGradient = (paint: Paint): paint is GradientPaint =>
  paint.kind === "linear" || paint.kind === "radial" || paint.kind === "angular"

/** Every type a fill can be, in the order + lists them. */
const paintKinds = ["solid", "linear", "radial", "angular", "image"] as const satisfies readonly PaintKind[]

/** What each type draws, under its name in +, for whoever doesn't know a gradient's kinds by name. */
const kindDetails: Record<PaintKind, string> = {
  solid: "One color",
  linear: "Along a line",
  radial: "Out from the center",
  angular: "Around the center",
  image: "A picture"
}

/** A gradient's kinds, which the menu at the top of its editor switches between, keeping its stops. */
const gradientKinds = ["linear", "radial", "angular"] as const satisfies readonly GradientKind[]

/**
 * What a fill of each type starts as, in the project's palette, so it shows on any layer and in either theme, and + can
 * draw it as it'll be: blue-600, or a gradient from white to blue-600, light to dark so its shape shows at a glance
 * (a line, a glow, a sweep), in two stops so it's written as utilities; an image, the project's first.
 */
function newPaint(kind: PaintKind): Paint {
  if (kind === "solid") {
    return { kind: "solid", color: "blue-600" }
  }

  if (kind === "image") {
    return { kind: "image", src: "/images/hero.jpg", fit: "fill", position: [50, 50] }
  }

  return {
    kind,
    angle: kind === "angular" ? 0 : 90,
    stops: [
      { id: newId("stop"), position: 0, color: "white" },
      { id: newId("stop"), position: 100, color: "blue-600" }
    ]
  }
}

/** Each type as + draws it: the fill it adds. */
const samples: Record<PaintKind, Paint> = {
  solid: newPaint("solid"),
  linear: newPaint("linear"),
  radial: newPaint("radial"),
  angular: newPaint("angular"),
  image: newPaint("image")
}

/**
 * A paint as a menu draws it to pick by its look, in the project's colors, over chrome's checkerboard where it's clear:
 * the fill a type in + adds, or the gradient as each kind in its kind menu.
 */
function PaintSample({ paint, colors }: { paint: Paint; colors: readonly ColorToken[] }) {
  let look: CSSProperties = { backgroundImage: `url("${paint.kind === "image" ? imagePreview(paint.src) : ""}")` }

  if (paint.kind === "solid") {
    look = { background: drawListColor(paint, colors) }
  } else if (isGradient(paint)) {
    look = overChecker(drawnGradient(paint, colors))
  }

  return (
    <span
      aria-hidden
      className="block h-8 w-12 shrink-0 rounded-md bg-cover bg-center inset-ring inset-ring-foreground/15"
      style={look}
    />
  )
}

/** Why a gradient is written as one value rather than from, via and to, naming what makes it so. */
function longReason(paint: GradientPaint): string {
  if (paint.repeat) {
    return "Tailwind has no utility for repeating gradients, so this is written as an arbitrary value."
  }

  const prefix = { linear: "bg-linear", radial: "bg-radial", angular: "bg-conic" }[paint.kind]

  const parts = [
    paint.stops.length > 3 && `${paint.stops.length} stops`,
    paint.stops.some((stop) => stop.hint !== undefined) && "a color hint",
    !Number.isInteger(paint.angle) && `an angle of ${paint.angle}°`,
    paint.kind === "angular" &&
      paint.center !== undefined &&
      (paint.center[0] !== 50 || paint.center[1] !== 50) &&
      "a center off the middle"
  ].filter((part) => part !== false)

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
  onPreview,
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
  /** The fills in the order a fill's being carried over, for the layer to draw before it's let go; nothing after. */
  onPreview?: (entries: PaintEntry[] | undefined) => void
  /** The entry whose editor is open at first, for a story. */
  openId?: string
}) {
  const { tokens: colors } = useTokens("color")
  // The fill + just added, whose editor opens as it's drawn, so it's set up straight away.
  const [added, setAdded] = useState<string>()

  const update = (id: string, paint: Partial<PaintEntry>) =>
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...paint } : entry)))

  const put = (paint: Paint) => {
    const entry: PaintEntry = { id: newId("fill"), paint }
    setAdded(entry.id)
    onChange(mixed ? [entry] : [entry, ...entries])
  }

  const add = (kind: PaintKind) => put(newPaint(kind))

  // An image dropped on the section is added to the project and becomes a fill on top, as Figma's does.
  const drop = useImageDrop((file) => {
    put({ kind: "image", src: addImageFile(file), fit: "fill", position: [50, 50] })
  })

  return (
    <div className="relative" {...drop.handlers}>
      <PanelSection
        title="Fill"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Hint label={mixed ? "Replace every layer's fills with one" : "Add fill"}>
                  <Button variant="ghost" size="icon-sm" className="size-6" aria-label="Add fill">
                    <Plus />
                  </Button>
                </Hint>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              {paintKinds.map((kind) => (
                <DropdownMenuItem key={kind} className="gap-3 text-xs" onClick={() => add(kind)}>
                  <PaintSample paint={samples[kind]} colors={colors} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">{kindNames[kind]}</span>
                    <span className="truncate text-muted-foreground">{kindDetails[kind]}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
                startOpen={entry.id === openId || entry.id === added}
                onChange={(change) => update(entry.id, change)}
                // One fill has nothing to move past, so it has no handle.
                onMove={
                  entries.length > 1
                    ? (from, to) => {
                        if (to >= 0 && to < entries.length) {
                          onChange(moved(entries, from, to))
                        }
                      }
                    : undefined
                }
                onCarry={(carried) => onPreview?.(carried && moved(entries, carried.from, carried.to))}
                onRemove={() => onChange(entries.filter((other) => other.id !== entry.id))}
              />
            ))}
          </div>
        )}
      </PanelSection>
      {drop.over && (
        <DropCover
          label={mixed ? "Drop to replace every layer's fills" : "Drop to add an image fill"}
          className="inset-0"
        />
      )}
    </div>
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
  onCarry,
  onRemove
}: {
  entry: PaintEntry
  index: number
  tokensOnly: boolean
  saved: GradientToken[]
  onSave: (token: GradientToken) => void
  startOpen: boolean
  onChange: (change: Partial<PaintEntry>) => void
  onMove?: (from: number, to: number) => void
  onCarry: (carried: Carried) => void
  onRemove: () => void
}) {
  const { paint } = entry
  const name = `Fill ${index + 1}`
  const setPaint = (next: Paint) => onChange({ paint: next })

  const row = {
    name,
    group: "fills",
    off: entry.off,
    onMove,
    onCarry,
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
          // Room for three images a row, and the search over them.
          defaultOpen: startOpen,
          className: "w-72 p-2"
        }}
        title="Image"
      >
        <span className="truncate">{imageName(paint.src)}</span>
      </ListRow>
    )
  }

  // A solid is the color field, whose swatch is its preview and opens the color picker.
  return (
    <ListRow {...row}>
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
 * A gradient's row: its strip, its type and its angle or token chip, which open the editor, and every stop's alpha as
 * one percentage, Mixed while the stops' alphas differ.
 */
function GradientRow({
  row,
  paint,
  tokensOnly,
  saved,
  onSave,
  startOpen,
  onChange
}: {
  row: Omit<ListRowProps, "children">
  paint: GradientPaint
  tokensOnly: boolean
  saved: GradientToken[]
  onSave: (token: GradientToken) => void
  startOpen: boolean
  onChange: (paint: GradientPaint) => void
}) {
  const { tokens: colors } = useTokens("color")
  const resolved = resolveGradient(paint, saved)
  const angled = resolved.kind === "linear" || resolved.kind === "angular"
  let summary = resolved.repeat ? "Repeating" : ""

  if (angled) {
    summary = `${resolved.angle}°${resolved.repeat ? ", repeating" : ""}`
  }

  const alphas = new Set(resolved.stops.map((stop) => stop.alpha))
  const mixed = alphas.size > 1
  const token = [...gradientTokens, ...saved].find((other) => other.name === paint.token)

  return (
    <ListRow
      {...row}
      preview={<span className="block h-4 w-6 rounded-sm" style={overChecker(drawnGradient(resolved, colors))} />}
      details={{
        content: (
          <GradientEditor
            name={row.name}
            paint={paint}
            tokensOnly={tokensOnly}
            saved={saved}
            onSave={onSave}
            onChange={onChange}
          />
        ),
        defaultOpen: startOpen,
        className: "w-72 gap-0 p-0"
      }}
      title={kindNames[resolved.kind]}
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
        <span className="truncate">{summary}</span>
      ) : (
        <span className="flex min-w-0 text-foreground">
          <TokenChip name={paint.token} token={token} namespace="gradient-" preview={null} struck={!token} />
        </span>
      )}
    </ListRow>
  )
}

/**
 * A gradient's editor: its kind in a menu, as an entry's type is in Effects, the bar of stops, the angle or center,
 * Repeat and how colors blend, then the Stops list. A gradient token's stops show here too; editing one detaches it,
 * writing its stops as the fill's own.
 */
export function GradientEditor({
  name,
  paint,
  tokensOnly = false,
  saved = [],
  onSave,
  onChange
}: {
  /** The fill's name, for its kind menu's accessible name: "Fill 1". */
  name: string
  paint: GradientPaint
  tokensOnly?: boolean
  saved?: GradientToken[]
  onSave?: (token: GradientToken) => void
  onChange: (paint: GradientPaint) => void
}) {
  const { tokens: colors } = useTokens("color")
  const resolved = resolveGradient(paint, saved)
  const [selected, setSelected] = useState(resolved.stops[0]?.id)

  // Each kind drawn with this gradient's own stops, so the menu shows what switching to it would look like.
  const kinds: TypeOption<GradientKind>[] = gradientKinds.map((kind) => ({
    value: kind,
    label: kindNames[kind],
    detail: kindDetails[kind],
    glyph: <PaintSample paint={{ ...resolved, kind }} colors={colors} />
  }))

  const [detached, setDetached] = useState<string>()
  const [tokensOpen, setTokensOpen] = useState(false)

  // Editing a token's part detaches it, and says so.
  const edit = (change: Partial<GradientPaint>) => {
    if (paint.token !== undefined) {
      setDetached(paint.token)
    }

    onChange({ ...resolved, ...change, token: undefined })
  }

  const setStops = (stops: Stop[]) => edit({ stops })
  const sorted = [...resolved.stops].sort((a, b) => a.position - b.position)
  // A token is written as its own class, so only the fill's own stops can be too long for from, via and to.
  const long = paint.token === undefined && !simpleGradient(resolved)
  const center = resolved.center ?? [50, 50]
  // A gradient needs two stops, so − shows only on a third, rather than sitting there disabled.
  const removable = resolved.stops.length > 2

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <EntryType>
          {/* Another kind keeps the stops, and detaches a token, as editing does. */}
          <TypeMenu label={name} value={resolved.kind} options={kinds} onChange={(kind) => edit({ kind })} />
        </EntryType>
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
      {/* The gradient's own settings, each named above its control, apart from its stops below. */}
      <FieldGrid className="pt-1">
        {(resolved.kind === "linear" || resolved.kind === "angular") && (
          <Field label={resolved.kind === "linear" ? "Angle" : "Start angle"}>
            <AngleField
              label={resolved.kind === "linear" ? "Angle" : "Start angle"}
              value={angleOf(resolved.angle)}
              // A linear gradient's named directions read as their angles: `to right` is 90°.
              keywords={resolved.kind === "linear" ? gradientDirections : undefined}
              // Only a gradient's direction matters, so it comes back round past 360°.
              wraps
              onChange={(angle) => edit({ angle: angleDegrees(angle) })}
            />
          </Field>
        )}
        {(resolved.kind === "radial" || resolved.kind === "angular") && (
          <Field label="Center">
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
          </Field>
        )}
        <Field label="Blend" hint="How the colors mix between stops: in oklab, Tailwind's own" half>
          <Select
            items={blends}
            value={resolved.interpolation ?? "oklab"}
            onValueChange={(interpolation) => {
              const picked = blends.find((blend) => blend.value === interpolation)

              if (picked) {
                edit({ interpolation: picked.value })
              }
            }}
          >
            <SelectTrigger size="sm" aria-label="Blend colors in" className="h-7 w-full px-2 text-xs">
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
        </Field>
        <Field label="Repeat" hint="Repeats the stops past the last: repeating-linear-gradient and its kin" half>
          <div className="flex h-7 items-center">
            <Switch
              size="sm"
              aria-label="Repeat"
              checked={resolved.repeat ?? false}
              onCheckedChange={(repeat) => edit({ repeat: repeat || undefined })}
            />
          </div>
        </Field>
      </FieldGrid>
      <div className="-mx-2 mt-1 border-t" />
      <div className="flex items-center justify-between">
        <GroupLabel>Stops</GroupLabel>
        <span className="flex items-center">
          <Hint label="Flip" detail="Reverses the stops">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              aria-label="Flip"
              onClick={() =>
                setStops(resolved.stops.map((stop) => ({ ...stop, position: 100 - stop.position, hint: undefined })))
              }
            >
              <ArrowLeftRight />
            </Button>
          </Hint>
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
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {sorted.map((stop, index) => (
          <div
            key={stop.id}
            onFocusCapture={() => setSelected(stop.id)}
            className={`grid ${removable ? "grid-cols-[3.5rem_minmax(0,1fr)_auto]" : "grid-cols-[3.5rem_minmax(0,1fr)]"} items-start gap-x-1 rounded-md ${selected === stop.id ? "bg-accent/50" : ""}`}
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
            {removable && (
              <Hint label="Remove stop">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="col-start-3 row-start-1 size-7"
                  aria-label={`Remove stop ${index + 1}`}
                  onClick={() => setStops(resolved.stops.filter((other) => other.id !== stop.id))}
                >
                  <Minus />
                </Button>
              </Hint>
            )}
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

        if (off && !cancelled) {
          onChange(stops.filter((other) => other.id !== stop.id))
        }
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

          if (after.position - stop.position < 4) {
            return null
          }

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
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                    return
                  }

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
            style={{ left: `${stop.position}%`, borderColor: selected === stop.id ? kindColors.layer : undefined }}
          >
            <Swatch value={drawListColor(stop, colors)} className="size-2.5" />
          </button>
        ))}
      </div>
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
        : undefined
  }

  if (withImage) {
    style.backgroundSize = each(imageSizeCss, "auto")
    style.backgroundPosition = each((paint) => paint.position.map((value) => `${value}%`).join(" "), "0% 0%")
    style.backgroundRepeat = each((paint) => (paint.fit === "tile" ? "repeat" : "no-repeat"), "repeat")
  }

  return <Card style={style} />
}
