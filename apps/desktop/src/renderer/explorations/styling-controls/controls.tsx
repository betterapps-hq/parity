import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, LayoutTemplate, Link2, Minus, Monitor, Plus, Squircle } from "lucide-react"
import { type CSSProperties, type ReactNode, useEffect, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { ChoiceInput, PanelSelectContent } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "./color-picker.tsx"
import { formatNumber, remPx, stepSpacing } from "./css-values.ts"
import {
  type Columns,
  type Draft,
  type Length,
  type Radius,
  type Size,
  sizeCss,
  trackCss,
  placementCss,
  usedColors
} from "./data.ts"
import {
  nearestToken,
  NotBaseline,
  notAToken,
  type Reading,
  type ScrubKeys,
  unitButtonClass,
  UnitMenu,
  useTokens,
  useTokenSets,
  ValueField
} from "./field-parts.tsx"
import { CornerGlyph, EachToggle, Field, SideGlyph } from "./field-row.tsx"
import { HighlightOverlay } from "./highlight.tsx"
import { drawnStyle, PreviewStage } from "./playground.tsx"
import { lengthToken } from "./tokens.ts"
import { readLength } from "./typing.ts"
import type { StrokePosition } from "./writes.ts"

/*
 * The styling controls for PAR-186, each tried on its own in its story (Parity/Explorations/Design panel controls),
 * as PAR-652's design options pages specify them. A section here is one control with its rows; LayerPreview is the
 * canvas's stand-in, which measures what Hug and Fill come to.
 */

/** What a section's controls change: one style, and the project's Tokens only setting. */
export interface SectionProps {
  draft: Draft
  set: (change: Partial<Draft>) => void
  tokensOnly?: boolean
  /** The selected layers differ here, so an unset field shows Mixed. */
  mixed?: boolean
  /** Set in the state shown (Hover, say), with the way back to the first state's value. */
  changed?: { onReset: () => void }
}

/**
 * W and H on one line with the aspect lock between them, as Figma UI3 has it, each a size field whose unit opens its
 * menu: Fixed, Hug or Fill, then px, % or rem, Min and Max content under More units, and Add min or Add max, which each
 * add a row under the size. Locking keeps the ratio the layer has now and frees the height (Auto, set by Aspect ratio),
 * since a ratio is ignored when both sizes are set; the ratio then shows as its own row, with named ratios. Typing H
 * while locked changes W to keep the ratio.
 */
export function SizeSection({ draft, set }: SectionProps) {
  const measured = useMeasured("section[aria-label='Plans']")
  const width = draft.width ?? 520
  const height = draft.height ?? "hug"
  const ratio = draft.aspect === undefined ? undefined : ratioOf(draft.aspect)
  const lock = (on: boolean) => {
    if (!on) {
      // Unlocking fixes the height where the ratio left it, so nothing moves.
      set({ aspect: undefined, height: measured?.height })
      return
    }
    const shown = measured?.width ?? 520
    const tall = measured?.height ?? shown
    // Within a percent of a named ratio is that ratio: whole pixels can't make 16:9 exactly.
    const near = namedRatios.find((option) => Math.abs(ratioOf(option.value)! / (shown / tall) - 1) < 0.01)
    set({ aspect: near?.value ?? reducedRatio(shown, tall), height: undefined })
  }
  const limits = [
    { key: "minWidth", label: "Min width" },
    { key: "maxWidth", label: "Max width" },
    { key: "minHeight", label: "Min height" },
    { key: "maxHeight", label: "Max height" }
  ] as const
  const addLimit = (axis: "Width" | "Height", which: "min" | "max") => {
    const size = axis === "Width" ? measured?.width : measured?.height
    set({ [`${which}${axis}`]: size ?? 100 })
  }
  return (
    <PanelSection title="Size">
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1 pr-1">
          <SizeField
            axis="Width"
            value={width}
            measured={measured?.width}
            parent={measured?.parent}
            limits={{ min: draft.minWidth !== undefined, max: draft.maxWidth !== undefined }}
            onAddLimit={(which) => addLimit("Width", which)}
            onChange={(next) => set({ width: next })}
          />
          <Hint label={ratio ? "Unlock aspect ratio" : "Lock aspect ratio"}>
            <Toggle
              size="sm"
              className="size-7 min-w-7 p-0"
              aria-label="Lock aspect ratio"
              pressed={ratio !== undefined}
              onPressedChange={lock}
            >
              <Link2 />
            </Toggle>
          </Hint>
          <SizeField
            axis="Height"
            value={height}
            measured={measured?.height}
            parent={undefined}
            setBy={ratio ? "Aspect ratio" : undefined}
            limits={{ min: draft.minHeight !== undefined, max: draft.maxHeight !== undefined }}
            onAddLimit={(which) => addLimit("Height", which)}
            onChange={(next) => {
              // A length typed while locked keeps the ratio by changing the width; a mode chosen unlocks it.
              if (ratio && typeof next === "number") set({ width: Math.round(next * ratio) })
              else set({ height: next, aspect: undefined })
            }}
          />
        </div>
        {limits.map(
          ({ key, label }) =>
            draft[key] !== undefined && (
              <Field key={key} label={label}>
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <Num
                      label={label}
                      pixels
                      spacing
                      value={draft[key]}
                      min={0}
                      onChange={(next) => set({ [key]: next ?? 0 })}
                    />
                  </div>
                  <Hint label={`Remove ${label.toLowerCase()}`}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      aria-label={`Remove ${label.toLowerCase()}`}
                      onClick={() => set({ [key]: undefined })}
                    >
                      <Minus />
                    </Button>
                  </Hint>
                </div>
              </Field>
            )
        )}
        {draft.aspect !== undefined && (
          <Field label="Ratio" hint="Height follows the width at this ratio. Type 16:9, 16/9, 16x9 or 1.78">
            <RatioField aspect={draft.aspect} onChange={(aspect) => set({ aspect })} />
          </Field>
        )}
      </div>
    </PanelSection>
  )
}

/** A layer's drawn size and its parent's width, kept up to date as it changes. */
export function useMeasured(selector: string): { width: number; height: number; parent: number } | undefined {
  const [size, setSize] = useState<{ width: number; height: number; parent: number }>()
  useEffect(() => {
    const element = document.querySelector<HTMLElement>(selector)
    if (!element) return
    const measure = () => {
      const box = element.getBoundingClientRect()
      const parent = element.parentElement?.getBoundingClientRect().width ?? box.width
      setSize({ width: Math.round(box.width), height: Math.round(box.height), parent: Math.round(parent) })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.parentElement) observer.observe(element.parentElement)
    return () => observer.disconnect()
  }, [selector])
  return size
}

const sizeModeNames = { hug: "Hug", fill: "Fill", min: "Min content", max: "Max content" } as const

/** Up and Down's count of steps: one, or ten with Shift. */
const stepCount = (up: boolean, { shift }: ScrubKeys) => (up ? 1 : -1) * (shift ? 10 : 1)

/**
 * A width or height with its mode, as PAR-652's Size type has it. A length shows its number and unit; a mode shows in
 * words, with what it comes to after it, faintly (Hug 248). The unit is a button that opens the field's menu. Typing a
 * length makes it Fixed, as in Figma, and Up or Down on a mode makes it Fixed at its measured size and steps from there,
 * a whole spacing step (4px) at a time.
 */
export function SizeField({
  axis,
  value,
  measured,
  parent,
  setBy,
  limits,
  onAddLimit,
  onChange
}: {
  axis: "Width" | "Height"
  value: Size
  measured: number | undefined
  /** The parent's size on this axis, for a percentage; unset where it hugs, so a percentage means nothing. */
  parent: number | undefined
  /** Another control that sets this axis, as the aspect lock sets the height: it shows as Auto, set by it. */
  setBy?: string
  limits?: { min: boolean; max: boolean }
  onAddLimit?: (which: "min" | "max") => void
  onChange: (size: Size) => void
}) {
  const [unit, setUnit] = useState<"px" | "rem">("px")
  const fixed = typeof value === "number"
  const percent = typeof value === "object"
  let shown = ""
  if (setBy) shown = "Auto"
  else if (fixed) shown = unit === "rem" ? formatNumber(value / remPx) : String(value)
  else if (percent) shown = String(value.percent)
  else shown = sizeModeNames[value]
  let mode: string = value as string
  if (setBy) mode = "auto"
  else if (fixed || percent) mode = "fixed"
  let unitLabel: string | undefined
  if (!setBy && fixed) unitLabel = unit
  else if (!setBy && percent) unitLabel = "%"
  // What it comes to, faintly after the value: set by another control, or measured for a mode or a percentage.
  let comesTo: string | undefined
  if (setBy) comesTo = `set by ${setBy}`
  else if (!fixed && measured !== undefined) comesTo = String(measured)
  const reason = `Enter a length, Hug or Fill`
  /**
   * What's typed: Hug or Fill by name; a length with the app's maths and units (`+8`, `*2`, `1.5rem`, `spacing-4`),
   * where a bare number is in the unit shown; or a percentage, CSS's (call 10). Nothing typed keeps the size.
   */
  const read = (text: string): Reading<Size | undefined> => {
    const word = text.trim().toLowerCase()
    if (word === "") return { value: undefined }
    if (word === "hug" || word === "fit") return { value: "hug" }
    if (word === "fill") return { value: "fill" }
    const bare = /^-?(\d*\.?\d+)$/.test(word)
    let input = word
    if (bare && percent) input = `${word}%`
    else if (bare && unit === "rem") input = `${word}rem`
    const reading = readLength(input, { label: axis, current: fixed && !setBy ? value : measured, takesPercent: true })
    if ("reason" in reading) return { reason: reading.reason.startsWith("Can't read") ? reason : reading.reason }
    if ("clear" in reading) return { reason }
    if ("percent" in reading) return { value: { percent: Math.max(0, Math.round(reading.percent * 10) / 10) } }
    if (/rem\s*$/.test(word)) setUnit("rem")
    else if (/px\s*$/.test(word)) setUnit("px")
    return { value: Math.max(1, reading.px) }
  }
  const step = (up: boolean, keys: ScrubKeys) => {
    if (percent) {
      onChange({ percent: Math.max(0, value.percent + stepCount(up, keys)) })
      return
    }
    // A mode, or Auto, becomes Fixed at its measured size and steps from there.
    const from = fixed && !setBy ? value : (measured ?? 0)
    onChange(Math.max(4, stepSpacing(from, stepCount(up, keys))))
  }
  const atMeasured = measured ?? (fixed ? value : 100)
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${axis} unit and mode${unitLabel ? `: ${unitLabel}` : ""}`}
        className={unitButtonClass}
      >
        {unitLabel ?? <ChevronDown className="size-3.5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(next) => {
            if (next === "fixed") onChange(atMeasured)
            else if (next === "hug" || next === "fill") onChange(next)
          }}
        >
          <DropdownMenuRadioItem value="fixed" className="text-xs">
            Fixed
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="hug" className="text-xs">
            Hug
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fill" className="text-xs">
            Fill
          </DropdownMenuRadioItem>
          {setBy && (
            <DropdownMenuRadioItem value="auto" className="text-xs">
              Auto <span className="text-muted-foreground">set by {setBy}</span>
            </DropdownMenuRadioItem>
          )}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={(fixed && !setBy && unit) || (percent && "%") || ""}
          onValueChange={(next) => {
            if (next === "%") {
              onChange({ percent: parent ? Math.round((atMeasured / parent) * 1000) / 10 : 100 })
              return
            }
            setUnit(next as "px" | "rem")
            if (!fixed || setBy) onChange(atMeasured)
          }}
        >
          <DropdownMenuRadioItem value="px" className="text-xs">
            px
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="%" className="text-xs">
            %
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="rem" className="text-xs">
            rem
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">More units</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-36">
            <DropdownMenuRadioGroup value={value === "min" || value === "max" ? value : ""}>
              <DropdownMenuRadioItem value="min" className="text-xs" onClick={() => onChange("min")}>
                Min content
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="max" className="text-xs" onClick={() => onChange("max")}>
                Max content
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onAddLimit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" disabled={limits?.min} onClick={() => onAddLimit("min")}>
              Add min
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" disabled={limits?.max} onClick={() => onAddLimit("max")}>
              Add max
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <div className="flex min-w-0 flex-col">
      <ValueField
        label={axis}
        inner={axis[0]}
        // Dragging W or H scrubs the size a spacing step per 2 screen pixels, making a mode Fixed first.
        scrub={{
          from: () => (fixed && !setBy ? value : (measured ?? 0)),
          apply: (px) => onChange(px),
          by: { spacing: true, min: 1 }
        }}
        shown={shown}
        muted={setBy !== undefined}
        unit={menu}
        comesTo={comesTo}
        hint={setBy ? { label: `${axis} is set by ${setBy}`, detail: `${measured}px at this ratio` } : undefined}
        selectOnFocus
        read={read}
        onCommit={(next) => {
          if (next !== undefined) onChange(next)
        }}
        onStep={step}
      />
    </div>
  )
}

/** Named ratios, as Tailwind names two of them (`aspect-square`, `aspect-video`). */
const namedRatios = [
  { value: "1 / 1", name: "Square" },
  { value: "4 / 3", name: undefined },
  { value: "16 / 9", name: "Video" },
  { value: "21 / 9", name: undefined }
]

/** `16 / 9` as the field shows it, `16:9`; a ratio typed as one number stays one. */
const ratioText = (aspect: string) => aspect.replace(/\s*\/\s*/, ":")

/** Reads `16:9`, `16/9`, `16x9` or `1.78` as CSS writes a ratio (`16 / 9`, `1.78`). */
function readRatio(text: string): string | undefined {
  const pair = /^\s*(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(text)
  if (pair) return Number(pair[1]) > 0 && Number(pair[2]) > 0 ? `${Number(pair[1])} / ${Number(pair[2])}` : undefined
  const single = Number(text)
  return text.trim() !== "" && single > 0 ? String(single) : undefined
}

/**
 * The ratio, typed, with its name after it (Video) and the named ratios in its unit's menu. A ratio it can't read
 * stays, with the reason under it; Enter keeps it, and Escape puts the ratio back; leaving does too, and says why.
 */
export function RatioField({ aspect, onChange }: { aspect: string; onChange: (aspect: string) => void }) {
  const name = namedRatios.find((option) => option.value === aspect)?.name
  return (
    <ValueField
      label="Aspect ratio"
      shown={ratioText(aspect)}
      comesTo={name}
      inputMode="text"
      unit={
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Named ratios" className={unitButtonClass}>
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuRadioGroup value={aspect} onValueChange={(next) => onChange(next as string)}>
              {namedRatios.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
                  {ratioText(option.value)}
                  {option.name && <span className="text-muted-foreground">{option.name}</span>}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      read={(text): Reading<string> => {
        const ratio = readRatio(text)
        return ratio ? { value: ratio } : { reason: "Enter a ratio, such as 16:9" }
      }}
      onCommit={onChange}
    />
  )
}

/** A ratio as CSS writes it, `16 / 9`, in its lowest terms. */
function reducedRatio(width: number, height: number): string {
  const divisor = (a: number, b: number): number => (b === 0 ? a : divisor(b, a % b))
  const common = divisor(width, height) || 1
  return `${width / common} / ${height / common}`
}

/** Width over height, from `16 / 9`. */
function ratioOf(aspect: string): number | undefined {
  const [width, height = 1] = aspect.split("/").map((part) => Number(part.trim()))
  return width && height ? width / height : undefined
}

/** Corners in CSS's order, clockwise from the top left, as the file keeps them. */
const corners = ["Top left", "Top right", "Bottom right", "Bottom left"] as const
/** The corners' indices in reading order across the two-by-two grid of fields. */
const cornersAsLaidOut = [0, 1, 3, 2] as const

const sameRadius = (a: Radius | undefined, b: Radius | undefined) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Appearance's Radius, as the simpler fields lay it out (PAR-186): one field under its name, and each corner, laid out
 * where it is, once Each corner at the end of the name's row is pressed. It opens pressed when the corners differ.
 * Closing it never loses a value: corners that match become one radius again, and corners that don't stay as they are,
 * the one field saying Mixed until something's typed for them all. Corner shape's button sits beside Each corner.
 */
export function AppearanceSection({ draft, set, tokensOnly, mixed, changed }: SectionProps) {
  const radii = Array.isArray(draft.radius) ? draft.radius : [draft.radius, draft.radius, draft.radius, draft.radius]
  const alike = radii.every((radius) => sameRadius(radius, radii[0]))
  const [each, setEach] = useState(!alike)
  return (
    <PanelSection title="Appearance">
      <div className="flex flex-col gap-2.5">
        <Field
          label="Radius"
          changed={changed !== undefined}
          onReset={changed?.onReset}
          action={
            <>
              <CornerShape value={draft.cornerShape} onChange={(cornerShape) => set({ cornerShape })} />
              <EachToggle
                label="Each corner"
                parts="corners"
                pressed={each}
                onClick={() => {
                  // Corners that match become one radius again; corners that don't stay, and the field says Mixed.
                  if (each && alike && Array.isArray(draft.radius)) set({ radius: radii[0] })
                  setEach(!each)
                }}
              />
            </>
          }
        >
          {each ? (
            <div className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-1">
              {/* Laid out where each corner is: the top two, then bottom left and bottom right. */}
              {cornersAsLaidOut.map((index) => (
                <RadiusChoice
                  key={index}
                  label={`${corners[index]} radius`}
                  corner={index}
                  value={radii[index]}
                  tokensOnly={tokensOnly}
                  mixed={mixed}
                  onChange={(value) => {
                    const next = [...radii] as [Radius?, Radius?, Radius?, Radius?]
                    next[index] = value
                    set({ radius: next })
                  }}
                />
              ))}
            </div>
          ) : (
            <RadiusChoice
              label="Radius"
              value={alike ? radii[0] : undefined}
              tokensOnly={tokensOnly}
              mixed={mixed || !alike}
              mixedNote={alike ? undefined : "Mixed: the corners differ. Each corner shows them"}
              onChange={(radius) => set({ radius })}
            />
          )}
        </Field>
      </div>
    </PanelSection>
  )
}

const cornerShapes = [
  { value: "round", label: "Round" },
  { value: "squircle", label: "Squircle" },
  { value: "bevel", label: "Bevel" },
  { value: "scoop", label: "Scoop" },
  { value: "notch", label: "Notch" },
  { value: "square", label: "Square" }
] as const

/**
 * Corner shape, from its button in Radius's name row (PAR-652's Appearance): Round, as every browser draws, or Squircle, Bevel,
 * Scoop, Notch or Square, which only Chromium draws (`corner-shape`), so it's marked †; elsewhere the radius still
 * holds, drawn round.
 */
function CornerShape({
  value,
  onChange
}: {
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const shape = value ?? "round"
  return (
    <Popover>
      <Hint
        label="Corner shape"
        detail="Only Chromium draws it. Other browsers draw round corners, so the radius still holds."
      >
        <PopoverTrigger
          aria-label={`Corner shape: ${cornerShapes.find((option) => option.value === shape)?.label}`}
          className={`grid size-5 shrink-0 place-items-center rounded outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted dark:hover:bg-input/40 ${value && value !== "round" ? "bg-muted text-foreground dark:bg-input/60" : "text-muted-foreground"}`}
        >
          <Squircle className="size-3" />
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-52 gap-2 p-2" align="end">
        <p className="flex items-center gap-1 text-sm font-medium">
          Corner shape
          <NotBaseline what="Corner shape" />
        </p>
        <div className="grid grid-cols-3 gap-1">
          {cornerShapes.map((option) => (
            <Button
              key={option.value}
              variant={shape === option.value ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={shape === option.value}
              className="h-7 px-1 text-xs"
              onClick={() => onChange(option.value === "round" ? undefined : option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <p className="type-description text-muted-foreground">Other browsers draw round corners, at the same radius.</p>
      </PopoverContent>
    </Popover>
  )
}

/** A section title's + or −, for a section that starts empty: Fill, Stroke, Effects. */
function SectionButton({ adds, what, onClick }: { adds: boolean; what: string; onClick: () => void }) {
  const label = adds ? `Add ${what}` : `Remove ${what}`
  return (
    <Hint label={label}>
      <Button variant="ghost" size="icon-sm" className="size-6" aria-label={label} onClick={onClick}>
        {adds ? <Plus /> : <Minus />}
      </Button>
    </Hint>
  )
}

/**
 * Fill, a section of its own in call 5's order: the layer's fill, or a title with + until it has one, which adds
 * `bg-background`, the project's usual fill. The row stays while its token is taken off to type another.
 */
export function FillSection({
  draft,
  set,
  tokensOnly,
  fillPicker
}: SectionProps & { fillPicker?: "tokens" | "custom" }) {
  const [shown, setShown] = useState(draft.background !== undefined)
  const filled = shown || draft.background !== undefined
  return (
    <PanelSection
      title="Fill"
      action={
        <SectionButton
          adds={!filled}
          what="fill"
          onClick={() => {
            setShown(!filled)
            set(
              filled
                ? { background: undefined, backgroundAlpha: undefined, backgroundAllowed: undefined }
                : { background: "background" }
            )
          }}
        />
      }
    >
      {filled && (
        <div className="pr-1">
          <ColorInput
            label="Fill"
            tokensOnly={tokensOnly}
            used={usedColors}
            value={draft.background}
            alpha={draft.backgroundAlpha}
            open={fillPicker !== undefined}
            tab={fillPicker}
            allowed={draft.backgroundAllowed}
            onAllow={(backgroundAllowed) => set({ backgroundAllowed })}
            onChange={(background, backgroundAlpha) =>
              set({ background, backgroundAlpha, backgroundAllowed: undefined })
            }
          />
        </div>
      )}
    </PanelSection>
  )
}

const effects = [
  { key: "blur", label: "Layer blur", hint: "Blurs the layer itself", added: "blur-sm" },
  {
    key: "backdropBlur",
    label: "Background blur",
    hint: "Blurs what shows through the layer, for frosted glass",
    added: "blur-md"
  }
] as const

/**
 * Effects, a section of its own in call 5's order, with Layer blur and Background blur as PAR-652's panel names them.
 * It's a title with + until an effect is added; + offers each effect, and each row's − takes it off.
 */
export function EffectsSection({ draft, set, tokensOnly, mixed }: SectionProps) {
  // Layers whose background blurs differ show its row, Mixed.
  const [added, setAdded] = useState(() => ({
    blur: draft.blur !== undefined,
    backdropBlur: draft.backdropBlur !== undefined || (mixed ?? false)
  }))
  const shown = effects.filter((effect) => added[effect.key] || draft[effect.key] !== undefined)
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
          <DropdownMenuContent align="end" className="w-44">
            {effects.map((effect) => (
              <DropdownMenuItem
                key={effect.key}
                className="text-xs"
                disabled={shown.includes(effect)}
                onClick={() => {
                  setAdded((current) => ({ ...current, [effect.key]: true }))
                  set({ [effect.key]: effect.added })
                }}
              >
                {effect.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {shown.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {shown.map((effect) => (
            <Field key={effect.key} label={effect.label} hint={effect.hint}>
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <BlurChoice
                    label={effect.label}
                    value={draft[effect.key]}
                    tokensOnly={tokensOnly}
                    mixed={mixed}
                    onChange={(value) => set({ [effect.key]: value })}
                  />
                </div>
                <Hint label={`Remove ${effect.label.toLowerCase()}`}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7"
                    aria-label={`Remove ${effect.label.toLowerCase()}`}
                    onClick={() => {
                      setAdded((current) => ({ ...current, [effect.key]: false }))
                      set({ [effect.key]: undefined })
                    }}
                  >
                    <Minus />
                  </Button>
                </Hint>
              </div>
            </Field>
          ))}
        </div>
      )}
    </PanelSection>
  )
}

/** A radius, a token or a value of its own, with the corner's glyph inside when it's one corner's. */
export function RadiusChoice({
  label,
  corner,
  value,
  tokensOnly,
  mixed,
  mixedNote,
  onChange
}: {
  mixed?: boolean
  /** What its hint says of Mixed, where it's the corners that differ rather than the selected layers. */
  mixedNote?: string
  label: string
  corner?: 0 | 1 | 2 | 3
  value: Radius | undefined
  tokensOnly?: boolean
  onChange: (value: Radius | undefined) => void
}) {
  return (
    <LengthField
      label={label}
      kind="radius"
      takesPercent
      // Past 50%, the corners meet and the shape stops changing.
      percentMax={50}
      icon={corner === undefined ? undefined : <CornerGlyph corner={corner} />}
      // A corner's field is narrow, so what its value comes to and its status show in its hint.
      narrow={corner !== undefined}
      value={value}
      tokensOnly={tokensOnly}
      mixed={mixed}
      mixedNote={mixedNote}
      cssTakes={(length) => CSS.supports("border-radius", length)}
      onChange={onChange}
    />
  )
}

export function BlurChoice({
  label,
  value,
  tokensOnly,
  mixed,
  onChange
}: {
  mixed?: boolean
  label: string
  value: Length | undefined
  tokensOnly?: boolean
  onChange: (value: Length | undefined) => void
}) {
  return (
    <LengthField
      label={label}
      kind="blur"
      value={value}
      tokensOnly={tokensOnly}
      mixed={mixed}
      placeholder="None"
      cssTakes={(length) => CSS.supports("filter", `blur(${length})`)}
      onChange={(next) => {
        if (typeof next !== "object" || "px" in next) onChange(next)
      }}
    />
  )
}

/**
 * A length field that takes a token or a value of its own, as every field does (call 1), on the shared field. A token
 * shows as a pill naming it, with what it comes to in its hint; clicking it focuses the field, and again opens the
 * kind's tokens, as the button at the field's end does on hover or focus. Typing on the pill replaces it, Backspace
 * takes it off, and Detach keeps its value without the token. A value shows as typed, with its unit and no mark; Tokens offers the nearest token first, then
 * Create token, and Allow here under Tokens only, which refuses it. With `takesPercent`, as Radius, it takes a
 * percentage too, typed (`50%`) or from the unit's menu (px or %), which Tokens only leaves alone as sides' are: it's
 * a share of the layer, not a step off the scale. Typing a token's name (`lg`, `radius-lg`) takes the token. What's
 * typed is checked as CSS checks the property (`CSS.supports`) before it's stored. Up and Down step a token through the
 * scale and a value by a pixel or a percent. In a narrow field (`narrow`, under about 96px), the unit stays,
 * and what the value comes to and its status are in its hint.
 */
function LengthField({
  label,
  kind,
  icon,
  narrow = false,
  value,
  tokensOnly = false,
  placeholder = "0",
  mixed = false,
  mixedNote = "Mixed: the selected layers differ",
  takesPercent = false,
  percentMax = Infinity,
  cssTakes,
  onChange
}: {
  label: string
  /** The token kind and set, which is also the namespace the field leaves off a token's name (`lg` for `radius-lg`). */
  kind: "radius" | "blur"
  /** Slot 1's icon, which scrubs the value. */
  icon?: ReactNode
  narrow?: boolean
  value: Radius | undefined
  tokensOnly?: boolean
  placeholder?: string
  /** The selected layers differ here: it shows Mixed, and typing replaces every one. */
  mixed?: boolean
  /** What its hint says of Mixed. */
  mixedNote?: string
  /** It takes a percentage of the layer's size too, as Radius does, with px or % in the unit's menu. */
  takesPercent?: boolean
  /** The largest percentage that changes anything (50 for a radius); one past it stops there, without a note. */
  percentMax?: number
  /** Whether CSS takes a length here, as `CSS.supports` says for the property. */
  cssTakes: (length: string) => boolean
  onChange: (value: Radius | undefined) => void
}) {
  const { tokens, create } = useTokens(kind)
  const namespace = `${kind}-`
  const name = typeof value === "string" ? value : undefined
  const token = name === undefined ? undefined : tokens.find((other) => other.name === name)
  const own = typeof value === "object" && "px" in value ? value : undefined
  const percent = typeof value === "object" && "percent" in value ? value.percent : undefined
  const capped = (share: number) => Math.min(percentMax, Math.max(0, share))
  // The unit a bare number is typed in while the field holds no value of its own, as the menu last set it.
  const [chosenUnit, setChosenUnit] = useState<"px" | "%">("px")
  let unitNow = chosenUnit
  if (percent !== undefined) unitNow = "%"
  else if (own) unitNow = "px"
  // Deprecated tokens are neither offered as the nearest nor stepped onto: they're on their way out.
  const scale = tokens.filter((other) => other.deprecated === undefined)
  const nearestTo = (px: number) => nearestToken(tokens, (other) => other.px, px)
  const nearest = own ? nearestTo(own.px) : undefined
  const refused = own !== undefined && tokensOnly && own.allow === undefined
  const read = (text: string): Reading<Radius | undefined> => {
    const trimmed = text.trim()
    if (trimmed === "") return { value: undefined }
    const named = tokens.find((other) => other.name === trimmed || other.name === namespace + trimmed)
    if (named) return { value: named.name }
    // A number, or maths on one, with no unit typed is in the unit shown: `40` or `+10` in % is a percentage.
    if (takesPercent && unitNow === "%" && !/[a-z%]/i.test(trimmed)) {
      const sum = readLength(trimmed, { label, current: percent })
      if ("px" in sum) {
        const share = capped(Math.round(sum.px * 100) / 100)
        return cssTakes(`${share}%`) ? { value: { percent: share } } : { reason: `${label} can't be ${trimmed}%` }
      }
    }
    // The app's maths and units: `6`, `6px`, `0.5rem`, `+2`, `*2`, and `50%` where it takes one.
    const reading = readLength(trimmed, { label, current: own?.px ?? token?.px, takesPercent })
    if ("reason" in reading && reading.reason.startsWith("Can't read")) {
      const example = takesPercent ? "6px or 50%" : "6px"
      return { reason: `Enter a length, such as ${example}, or a ${kind} token` }
    }
    if ("reason" in reading) return reading
    if ("percent" in reading) {
      if (!cssTakes(`${reading.percent}%`)) return { reason: `${label} can't be ${trimmed}` }
      return { value: { percent: capped(Math.round(reading.percent * 100) / 100) } }
    }
    if (!("px" in reading)) return { value: undefined }
    if (!cssTakes(`${reading.px}px`)) return { reason: `${label} can't be ${trimmed}` }
    const near = nearestTo(reading.px)
    if (tokensOnly && near) return notAToken(near, () => onChange(near.name))
    return { value: { px: Math.round(reading.px * 100) / 100 } }
  }
  const step = (up: boolean, { shift }: ScrubKeys) => {
    if (token && scale.includes(token)) {
      // A token steps to the next of its kind in scale order; Shift goes to the first or last.
      const last = scale.length - 1
      let next = Math.min(last, Math.max(0, scale.indexOf(token) + (up ? 1 : -1)))
      if (shift) next = up ? last : 0
      onChange(scale[next]!.name)
      return
    }
    const by = (up ? 1 : -1) * (shift ? 10 : 1)
    if (percent !== undefined) {
      onChange({ percent: capped(percent + by) })
      return
    }
    const from = own?.px ?? token?.px ?? 0
    onChange({ px: Math.max(0, from + by) })
  }
  // The unit's menu keeps the number and changes its unit, as Webflow's does: 12px becomes 12%.
  const toUnit = (next: "px" | "%") => {
    setChosenUnit(next)
    if (next === "%" && own) onChange({ percent: capped(own.px) })
    else if (next === "px" && percent !== undefined) onChange({ px: percent })
  }
  let unit: ReactNode = "px"
  if (takesPercent) {
    unit = (
      <UnitMenu
        label={label}
        unit={unitNow}
        units={[
          { unit: "px", label: "Pixels" },
          { unit: "%", label: "Of the layer's size" }
        ]}
        onUnit={toUnit}
      />
    )
  }
  // A narrow field's hint carries the value's status, which has no room in the field.
  let status: string | undefined
  if (token?.deprecated) status = `Deprecated: use ${token.deprecated} instead`
  else if (name !== undefined && !token) status = "Missing: the project has no token by this name now"
  else if (own?.allow !== undefined) status = `Allowed here: ${own.allow}`
  else if (own && nearest) status = `Not a token. Nearest: ${nearest.name} (${nearest.detail})`
  else if (percent !== undefined) status = `${formatNumber(percent)}% of the layer's width across and height down`
  else if (mixed && value === undefined) status = mixedNote
  else if (value === undefined) status = "Unset"
  const shownPercent = percent === undefined ? undefined : formatNumber(percent)
  // A percentage of its own is offered no nearest token or Create token, as tokens are lengths.
  const ownPercent = shownPercent === undefined ? undefined : { text: `${shownPercent}%` }
  return (
    <ValueField
      label={label}
      inner={icon}
      // Dragging the icon, or the row's name, scrubs the value a pixel, or a percent, per screen pixel.
      scrub={{
        from: () => percent ?? own?.px ?? token?.px ?? 0,
        apply: (number) => onChange(percent === undefined ? { px: number } : { percent: capped(number) }),
        by: { step: 1, shiftStep: 10, altStep: 0.1, min: 0 }
      }}
      shown={own ? formatNumber(own.px) : shownPercent}
      placeholder={placeholder}
      mixed={mixed}
      chip={
        name === undefined
          ? undefined
          : {
              name,
              token,
              namespace,
              onRemove: () => onChange(undefined),
              onDetach: token ? () => onChange({ px: token.px }) : undefined,
              onReplace: (replacement) => onChange(replacement)
            }
      }
      unit={unit}
      unitName={unitNow}
      comesTo={token?.detail}
      own={
        own === undefined
          ? ownPercent
          : {
              text: `${formatNumber(own.px)}px`,
              nearest,
              same: nearest?.px === own.px,
              namespace,
              onCreate:
                create &&
                ((made) => {
                  create(lengthToken(kind, made, own.px))
                  onChange(made)
                }),
              tokensOnly,
              allowed: own.allow,
              onAllow: (reason) => onChange(reason === undefined ? { px: own.px } : { ...own, allow: reason })
            }
      }
      // None draws as no radius or no blur, so the scale starts from it.
      tokens={{ list: tokens, current: name, none: "None", noneValue: "0px", onPick: onChange }}
      refused={refused && nearest ? { nearest, onUse: () => onChange(nearest.name) } : undefined}
      narrow={narrow}
      hint={{ detail: status }}
      read={read}
      onCommit={onChange}
      onStep={step}
    />
  )
}

const sides = ["Top", "Right", "Bottom", "Left"] as const

/**
 * Stroke, a title with + until it's set, as PAR-652's panel starts Fill, Stroke and Effects. + adds the project's usual
 * stroke, `border-border` at 1px, and − takes it off.
 */
export function StrokeSection({ draft, set, tokensOnly }: SectionProps) {
  // A new stroke is in layout (call 2): a border. Out of layout, it's an outline at its position.
  const inLayout = draft.strokeInLayout ?? true
  const position: StrokePosition = inLayout ? "inside" : (draft.strokePosition ?? "inside")
  const widths = Array.isArray(draft.borderWidth)
    ? draft.borderWidth
    : ([0, 0, 0, 0].map(() => (draft.borderWidth as number | undefined) ?? 1) as [number, number, number, number])
  const alike = widths.every((width) => width === widths[0])
  // Each side opens pressed when the sides differ, and stays as it's left: one side alone still shows every side.
  const [each, setEach] = useState(!alike)
  const stroked = draft.border !== undefined || draft.borderWidth !== undefined
  const action = (
    <SectionButton
      adds={!stroked}
      what="stroke"
      onClick={() => {
        setEach(false)
        set(
          stroked
            ? {
                border: undefined,
                borderAlpha: undefined,
                borderAllowed: undefined,
                borderWidth: undefined,
                strokeInLayout: undefined,
                strokePosition: undefined
              }
            : { border: "border", borderWidth: 1 }
        )
      }}
    />
  )
  if (!stroked) {
    return (
      <PanelSection title="Stroke" action={action}>
        {null}
      </PanelSection>
    )
  }
  return (
    <PanelSection title="Stroke" action={action}>
      <div className="flex flex-col gap-2.5">
        <Field label="Color">
          <ColorInput
            label="Stroke"
            tokensOnly={tokensOnly}
            used={usedColors}
            value={draft.border}
            alpha={draft.borderAlpha}
            allowed={draft.borderAllowed}
            onAllow={(borderAllowed) => set({ borderAllowed })}
            onChange={(border, borderAlpha) => set({ border, borderAlpha, borderAllowed: undefined })}
          />
        </Field>
        <Field
          label="Width"
          action={
            <EachToggle
              label="Each side"
              parts="sides"
              pressed={each}
              onClick={() => {
                // Sides that match become one width again; sides that don't stay, and the field says Mixed.
                if (each && alike && Array.isArray(draft.borderWidth)) set({ borderWidth: widths[0] })
                setEach(!each)
              }}
            />
          }
        >
          {each ? (
            <div className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-1">
              {sides.map((side, index) => (
                <Num
                  key={side}
                  label={`${side} stroke width`}
                  inner={<SideGlyph side={index} />}
                  pixels
                  narrow
                  value={widths[index]}
                  min={0}
                  onChange={(value) => {
                    const next = [...widths] as [number, number, number, number]
                    next[index] = value ?? 0
                    // Only a border strokes some sides and not others, so sides that differ put the stroke in layout.
                    const differ = !next.every((width) => width === next[0])
                    set({
                      borderWidth: next,
                      ...(differ ? { strokeInLayout: undefined, strokePosition: undefined } : {})
                    })
                  }}
                />
              ))}
            </div>
          ) : (
            <Num
              label="Stroke width"
              pixels
              value={alike ? widths[0] : undefined}
              mixed={!alike}
              min={0}
              onChange={(value) => set({ borderWidth: value ?? 1 })}
            />
          )}
        </Field>
        <Field
          label="Position"
          hint="In layout, the stroke is a border, which takes up room. Out of it, it's an outline, drawn inside, centered on or outside the edge, and takes none."
        >
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <ChoiceInput
                value={position}
                options={strokePositions}
                onChange={(next) => {
                  if (!next || next === position) return
                  // Center and Outside are outlines, which stroke every side at one width.
                  if (next !== "inside") {
                    setEach(false)
                    set({ strokeInLayout: false, strokePosition: next, borderWidth: Math.max(...widths) || 1 })
                  } else set({ strokePosition: inLayout ? undefined : "inside" })
                }}
              />
            </div>
            <Hint
              label="Include in layout"
              detail={
                inLayout
                  ? "On: a border, which takes up room in the layout"
                  : "Off: an outline, which takes no room in the layout"
              }
            >
              <Toggle
                size="sm"
                className="size-7 min-w-7 shrink-0 p-0"
                aria-label="Include in layout"
                pressed={inLayout}
                onPressedChange={(on) => {
                  setEach(false)
                  set(
                    on
                      ? { strokeInLayout: undefined, strokePosition: undefined }
                      : { strokeInLayout: false, strokePosition: "inside", borderWidth: Math.max(...widths) || 1 }
                  )
                }}
              >
                <LayoutTemplate />
              </Toggle>
            </Hint>
          </div>
        </Field>
      </div>
    </PanelSection>
  )
}

const strokePositions = [
  { value: "inside", label: "Inside" },
  { value: "center", label: "Center" },
  { value: "outside", label: "Outside" }
] satisfies { value: StrokePosition; label: string }[]

const tagOptions = [
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
  { value: "h5", label: "Heading 5" },
  { value: "h6", label: "Heading 6" },
  { value: "label", label: "Label" },
  { value: "span", label: "Inline text" },
  { value: "strong", label: "Strong" }
]

/** A tag's name with the element it writes after it, in code, as the keyword menus show the CSS they write. */
function TagLabel({ label, tag }: { label: string; tag: string }) {
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="shrink-0 font-mono text-2xs text-muted-foreground">{tag}</span>
    </span>
  )
}

export function TextSection({ draft, set }: SectionProps) {
  // Unset is a paragraph, which is what the text is written as.
  const items = [
    { value: "__unset", label: <TagLabel label="Paragraph" tag="p" /> },
    ...tagOptions.map((option) => ({
      value: option.value,
      label: <TagLabel label={option.label} tag={option.value} />
    }))
  ]
  return (
    <PanelSection title="Text" description="The headline inside Plans.">
      <Field label="Tag" hint="The element the text is: what screen readers and search engines read it as">
        <Select
          items={items}
          value={draft.tag ?? "__unset"}
          onValueChange={(next) => set({ tag: next === null || next === "__unset" ? undefined : next })}
        >
          <SelectTrigger size="sm" aria-label="Tag" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <PanelSelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </PanelSelectContent>
        </Select>
      </Field>
    </PanelSection>
  )
}

/** The design's frame, typed: its width and height in this viewport. */
export function FrameSection({
  frame,
  onChange
}: {
  frame: { width: number; height: number | undefined }
  onChange: (frame: { width: number; height: number | undefined }) => void
}) {
  return (
    <PanelSection
      title="Frame"
      action={
        // Which viewport's size this is: each has its own. The selection already says which design.
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Monitor aria-hidden className="size-3.5" />
          Desktop
        </span>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Field label="Size">
          <div className="grid grid-cols-2 gap-1">
            <Num
              label="Frame width"
              inner="W"
              pixels
              value={frame.width}
              min={1}
              onChange={(width) => onChange({ ...frame, width: width ?? 1280 })}
            />
            <Num
              label="Frame height"
              inner="H"
              pixels
              value={frame.height}
              placeholder="Hug"
              min={1}
              onChange={(height) => onChange({ ...frame, height })}
            />
          </div>
        </Field>
      </div>
    </PanelSection>
  )
}

/**
 * A number typed, committed on Enter or blur, with a short label inside and a unit after: a ValueField. A length in
 * pixels (`pixels`) is shown in px or rem, chosen from its unit's menu, and takes either typed (`1rem`, `16px`); it's
 * kept in pixels whichever is shown, so 16px becomes 1rem.
 * A spacing length (`spacing`) steps to the next whole spacing step (4px) on Up and Down and scrubs a step per 2 screen
 * pixels; others step by 1, or 10 with Shift, and scrub a step per screen pixel.
 *
 * In a narrow field (`narrow`, under about 96px, as sides are), what it comes to is in its hint. Input it can't read
 * stays, outlined in the error color with a mark in the status slot and the reason under the row; Enter keeps it, and
 * Escape puts the value back; leaving does too, and says why.
 */
export function Num({
  label,
  inner,
  suffix,
  pixels = false,
  spacing = false,
  narrow = false,
  value,
  placeholder = "0",
  mixed = false,
  min = 0,
  onChange
}: {
  label: string
  /** A letter or glyph inside, which scrubs: T, or a side's glyph. */
  inner?: ReactNode
  suffix?: string
  pixels?: boolean
  spacing?: boolean
  narrow?: boolean
  value: number | undefined
  placeholder?: string
  /** The sides or layers it covers differ: it says Mixed, and typing sets them all. */
  mixed?: boolean
  min?: number
  onChange: (value: number | undefined) => void
}) {
  const [unit, setUnit] = useState<"px" | "rem">("px")
  const inRem = pixels && unit === "rem"
  let shown = value === undefined ? undefined : formatNumber(value)
  if (inRem && value !== undefined) shown = formatNumber(value / remPx)
  /**
   * What's typed: a length with the app's maths and units (`+8`, `*2`, `1.5rem`, `spacing-4`), a bare number in the
   * unit shown; or, for a count, a whole number.
   */
  const read = (text: string): Reading<number | undefined> => {
    if (pixels) {
      const bare = /^\s*-?(\d*\.?\d+)\s*$/.test(text)
      const reading = readLength(inRem && bare ? `${text}rem` : text, { label, current: value })
      if ("clear" in reading) return { value: undefined }
      if ("px" in reading) return { value: Math.max(min, reading.px) }
      return { reason: "reason" in reading ? reading.reason : "Enter a length" }
    }
    if (text.trim() === "") return { value: undefined }
    const number = Number(text)
    return Number.isFinite(number) ? { value: Math.max(min, Math.round(number)) } : { reason: "Enter a whole number" }
  }
  const from = () => value ?? Math.max(min, 0)
  let unitPart: ReactNode = suffix
  if (pixels) {
    unitPart = (
      <UnitMenu
        label={label}
        unit={unit}
        units={[
          { unit: "px", label: "Pixels" },
          { unit: "rem", label: "Root em, 16px" }
        ]}
        onUnit={setUnit}
      />
    )
  }
  return (
    <ValueField
      label={label}
      inner={inner}
      // Dragging the letter inside the field scrubs it, as Figma's labels do.
      scrub={{
        from,
        apply: (next) => onChange(next),
        by: spacing ? { spacing: true, min } : { step: 1, shiftStep: 10, min }
      }}
      shown={shown}
      placeholder={placeholder}
      mixed={mixed}
      unit={unitPart}
      narrow={narrow}
      read={read}
      onCommit={onChange}
      onStep={(up, keys) => {
        const count = stepCount(up, keys)
        onChange(Math.max(min, spacing ? stepSpacing(from(), count) : from() + count))
      }}
    />
  )
}

/* The canvas's stand-ins. */

const flipped = { start: "end", center: "center", end: "start" } as const
const flexValues = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
  "last baseline": "last baseline"
} as const

const linesValues = { center: "center", end: "flex-end", between: "space-between", stretch: "stretch" } as const

/** A grid child's own size: unset or Fill stretches it across its cell, which writes nothing. */
const cellSize = (size: Size | undefined) => (size === undefined || size === "fill" ? undefined : sizeCss(size))

const px = (pixels: number | undefined) => (pixels === undefined ? undefined : `${pixels}px`)

/** CSS's grid-template-columns for the columns: the tracks, or as many as fit, each at least the width given. */
function columnsCss(columns: Columns | undefined): string | undefined {
  if (columns === undefined) return undefined
  if (Array.isArray(columns)) return columns.map(trackCss).join(" ")
  return `repeat(auto-fit, minmax(${columns.fit}px, 1fr))`
}

export function LayerPreview({
  draft,
  childSelected = false,
  onSelectChild
}: {
  draft: Draft
  /** Whether Pro plan is selected, as a grid child; clicking it selects it where `onSelectChild` is given. */
  childSelected?: boolean
  onSelectChild?: (selected: boolean) => void
}) {
  const sets = useTokenSets()
  // The layout, for what's highlighted on it to be measured against.
  const [layout, setLayout] = useState<HTMLElement | null>(null)
  const grid = draft.columns !== undefined
  const Tag = (draft.tag ?? "p") as "p"
  const direction = `${draft.direction ?? "column"}${draft.reverse ? "-reverse" : ""}` as const
  // The box is physical, so a reversed layout writes the other end: its top is flex-end.
  const justify = draft.reverse ? flipped[draft.justify ?? "start"] : (draft.justify ?? "start")
  const gap = typeof draft.gap === "number" ? draft.gap : 0
  // A negative gap overlaps the children, as the negative margin it's written as does.
  const overlap =
    !grid && gap < 0 ? { [(draft.direction ?? "column") === "row" ? "marginInlineEnd" : "marginBlockEnd"]: gap } : {}
  const spread = draft.gap === "auto" ? `space-${draft.distribute ?? "between"}` : flexValues[justify]
  const style: CSSProperties = {
    display: grid ? "grid" : "flex",
    flexDirection: grid ? undefined : direction,
    flexWrap: draft.wrap ? "wrap" : undefined,
    justifyContent: grid ? undefined : spread,
    alignItems: grid ? draft.itemsY : flexValues[draft.align ?? "stretch"],
    justifyItems: grid ? draft.itemsX : undefined,
    alignContent: !grid && draft.wrap && draft.lines ? linesValues[draft.lines] : undefined,
    gridTemplateColumns: columnsCss(draft.columns),
    gridTemplateRows: draft.rows?.length ? draft.rows.map(trackCss).join(" ") : undefined,
    gridAutoFlow: grid && draft.dense ? "dense" : undefined,
    columnGap: Math.max(0, gap),
    rowGap: draft.rowGap ?? Math.max(0, gap),
    padding: 20,
    width: sizeCss(draft.width ?? 520),
    // A ratio only takes hold when one axis is left to it.
    height: draft.aspect ? undefined : sizeCss(draft.height),
    minWidth: px(draft.minWidth),
    maxWidth: px(draft.maxWidth) ?? "100%",
    minHeight: px(draft.minHeight),
    maxHeight: px(draft.maxHeight),
    aspectRatio: draft.aspect,
    ...drawnStyle(draft, sets),
    // The selection's outline, in the layer's color, as the canvas draws it.
    outlineColor: kindColors.layer,
    color: "#0a0a0a"
  }
  return (
    // Plans' parent, wider than Plans, so Fill and a percentage show; it hugs Plans' height.
    <PreviewStage around>
      <section ref={setLayout} aria-label="Plans" className="relative outline outline-offset-0" style={style}>
        <HighlightOverlay layout={layout} color={kindColors.layer} />
        <Tag className="m-0 text-base font-semibold" style={grid ? { gridColumn: "1 / -1" } : overlap}>
          Simple pricing for every team
        </Tag>
        {["Hobby", "Pro plan", "Team"].map((name) => {
          const pro = name === "Pro plan"
          const selected = pro && childSelected
          return (
            <button
              key={name}
              type="button"
              data-layer={name}
              aria-pressed={selected}
              onClick={() => onSelectChild?.(pro ? !childSelected : false)}
              className={`rounded-lg border border-black/10 bg-white/80 p-3 text-left text-sm ${selected ? "outline-2" : ""}`}
              style={{
                ...(selected ? { outlineColor: kindColors.layer } : {}),
                ...(grid && pro
                  ? {
                      gridColumn: placementCss(
                        draft.colStart,
                        draft.colSpan,
                        draft.endLines ? draft.colEnd : undefined
                      ),
                      gridRow: placementCss(draft.rowStart, draft.rowSpan, draft.endLines ? draft.rowEnd : undefined),
                      alignSelf: draft.alignSelf,
                      justifySelf: draft.justifySelf,
                      width: cellSize(draft.childWidth),
                      height: cellSize(draft.childHeight)
                    }
                  : { fontSize: pro ? 20 : 14, ...(name === "Team" ? {} : overlap) })
              }}
            >
              {name}
            </button>
          )
        })}
      </section>
    </PreviewStage>
  )
}

export function FramePreview({ width, height }: { width: number; height: number | undefined }) {
  const scale = 0.4
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        Pricing in Desktop, {width} × {height ?? "Hug"}
      </span>
      <div
        className="flex flex-col gap-3 overflow-hidden border bg-white p-6 shadow-sm"
        style={{ width: width * scale, height: height === undefined ? undefined : height * scale }}
      >
        <div className="h-3 w-24 rounded bg-neutral-800" />
        <div className="h-2 w-40 rounded bg-neutral-300" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-20 rounded border bg-neutral-50" />
          ))}
        </div>
      </div>
    </div>
  )
}
