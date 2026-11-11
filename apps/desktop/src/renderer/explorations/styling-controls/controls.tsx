import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { ChevronDown, LayoutTemplate, Link2, Monitor, Squircle } from "lucide-react"
import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { ChoiceInput, PanelSelectContent } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "./color-picker.tsx"
import { formatNumber, remPx, sameValue, stepCount, stepSpacing } from "./css-values.ts"
import {
  type Columns,
  contentSizeWords,
  type Draft,
  isFixedSize,
  isLengthToken,
  isSizeMode,
  isTokenSize,
  type Length,
  placementCss,
  type Radius,
  type Size,
  sizeCss,
  type SizeMode,
  trackCss,
  typedContentSizes,
  usedColors
} from "./data.ts"
import {
  type FieldChip,
  moveThroughRows,
  nearestToken,
  NotBaseline,
  ownLength,
  type Reading,
  type ScrubKeys,
  tokenChip,
  tokenNamed,
  type TokensShown,
  tokenStatus,
  stepToken,
  unitButtonClass,
  UnitMenu,
  usePercentUnit,
  useTokens,
  useTokenSets,
  ValueField
} from "./field-parts.tsx"
import { CornerGlyph, EachToggle, Field, nameMenuButton, SectionButton } from "./field-row.tsx"
import { HighlightOverlay } from "./highlight.tsx"
import { RemoveButton } from "./list-parts.tsx"
import { drawnStyle, PreviewStage } from "./playground.tsx"
import { sideNumber, sideRules, type Sides } from "./sides-writes.ts"
import { FourSidesField } from "./sides.tsx"
import type { LengthToken } from "./tokens.ts"
import { isBareNumber, readLength } from "./typing.ts"
import { oneEverySide, type StrokePosition } from "./writes.ts"

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
 * W and H on one line with the aspect lock between them, as Figma UI3 has it, each a size field: a word as a chip, and
 * the Sizing menu at its end, Fixed, Hug, Fill, Min and Max content, then Add min or Add max, which each add a row
 * under the size. Locking keeps the ratio the layer has now and frees the height (Auto, set by Aspect ratio),
 * since a ratio is ignored when both sizes are set; the ratio then shows as its own row, with named ratios. Typing H
 * while locked changes W to keep the ratio.
 */
export function SizeSection({
  draft,
  set,
  measured,
  tokensShown
}: SectionProps & {
  /** The layer's drawn size and its parent's width, from the canvas. */
  measured?: Measured
  tokensShown?: TokensShown
}) {
  // An unset width shows what the layer comes to, and writes nothing until it's changed.
  const width = draft.width ?? measured?.width ?? 100
  const height = draft.height ?? "hug"
  const ratio = draft.aspect === undefined ? undefined : ratioOf(draft.aspect)

  const lock = (on: boolean) => {
    if (!on) {
      // Unlocking fixes the height where the ratio left it, so nothing moves.
      set({ aspect: undefined, height: measured?.height })

      return
    }

    const shown = measured?.width ?? (isFixedSize(width) ? width : 100)
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
            tokensShown={tokensShown}
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
            tokensShown={tokensShown}
            value={height}
            measured={measured?.height}
            parent={undefined}
            setBy={ratio ? "Aspect ratio" : undefined}
            limits={{ min: draft.minHeight !== undefined, max: draft.maxHeight !== undefined }}
            onAddLimit={(which) => addLimit("Height", which)}
            onChange={(next) => {
              // A length typed while locked keeps the ratio by changing the width; a mode chosen unlocks it.
              if (ratio && isFixedSize(next)) {
                set({ width: Math.round(next * ratio) })
              } else {
                set({ height: next, aspect: undefined })
              }
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
                  <RemoveButton label={`Remove ${label.toLowerCase()}`} onClick={() => set({ [key]: undefined })} />
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

/** A layer's drawn size and its parent's width, as the canvas measures them. */
export interface Measured {
  width: number
  height: number
  parent: number
}

/** Reports an element's drawn size and its parent's width each time either changes, as the canvas measures a layer. */
function useMeasure(element: HTMLElement | null, onMeasure: ((measured: Measured) => void) | undefined) {
  useEffect(() => {
    if (!element || !onMeasure) {
      return
    }

    const measure = () => {
      const box = element.getBoundingClientRect()
      const parent = element.parentElement?.getBoundingClientRect().width ?? box.width
      onMeasure({ width: Math.round(box.width), height: Math.round(box.height), parent: Math.round(parent) })
    }

    const observer = new ResizeObserver(measure)
    observer.observe(element)

    if (element.parentElement) {
      observer.observe(element.parentElement)
    }

    return () => observer.disconnect()
  }, [element, onMeasure])
}

/** The sizes in words, each with what it does, in W's and H's Sizing menu and their chips' hints. */
const sizeWords = (within: string): Record<SizeMode, { name: string; detail: string }> => ({
  hug: { name: "Hug", detail: "Fits its content" },
  fill: { name: "Fill", detail: `Fills its ${within}` },
  ...contentSizeWords
})

/** What each word typed reads as. */
const typedSizes = new Map<string, SizeMode>([
  ["hug", "hug"],
  ["fit", "hug"],
  ["fit-content", "hug"],
  ["fill", "fill"],
  ...typedContentSizes
])

/**
 * W or H, as PAR-652's Size type has it, for a layer and for a grid child alike: a number in its unit, or a word as a
 * chip, Hug, Fill, or Min or Max content, with what it comes to faintly in the chip, as Gap's Auto is. The chevron at
 * the end is always there and opens Sizing: Fixed, the words, and Add min and Add max where the field takes limits. The
 * unit, after a number, is only ever a unit: px, % of its parent or cell, or rem. Backspace on a chip leaves it Fixed
 * at what it came to, ready to type over; typing a length makes it Fixed, as in Figma, and Up or Down on a word makes it
 * Fixed at what it comes to and steps from there, a whole spacing step (4px) at a time. Set by another control, as the
 * aspect lock sets H, it says Auto faintly, with what it comes to; its hint and Sizing say what sets it.
 *
 * It takes the project's spacing and container tokens too, as Tailwind's `w-*` and `h-*` do (`w-gutter`, `w-md`):
 * Sizing lists them under the words, smallest first, with the token nearest a length of its own above them and
 * Create token under them. A token shows as its pill, typed by name (`gutter`, `container-md`), and Up and Down step
 * through the scale.
 */
export function SizeField({
  axis,
  value,
  measured,
  parent,
  within = "parent",
  setBy,
  limits,
  onAddLimit,
  tokensShown,
  onChange
}: {
  axis: "Width" | "Height"
  value: Size
  measured: number | undefined
  /** The parent's size on this axis, for a percentage; unset where it hugs, so a percentage means nothing. */
  parent: number | undefined
  /** What Fill fills and a percentage is of: the layer's parent, or a grid child's cell. */
  within?: "parent" | "cell"
  /** Another control that sets this axis, as the aspect lock sets the height: it shows as Auto, set by it. */
  setBy?: string
  limits?: { min: boolean; max: boolean }
  onAddLimit?: (which: "min" | "max") => void
  /** How Sizing shows the tokens under the words. */
  tokensShown?: TokensShown
  onChange: (size: Size) => void
}) {
  const [unit, setUnit] = useState<"px" | "rem">("px")
  const spacing = useTokens("spacing")
  const containers = useTokens("container").tokens
  const tokens = [...spacing.tokens, ...containers]
  const words = sizeWords(within)
  const mode = !setBy && isSizeMode(value) ? value : undefined
  const fixed = !setBy && isFixedSize(value) ? value : undefined
  const named = !setBy && isTokenSize(value) ? value.token : undefined
  const token = named === undefined ? undefined : tokens.find((each) => each.name === named)
  const percent = !setBy && !isFixedSize(value) && !isSizeMode(value) && "percent" in value ? value.percent : undefined
  // What it is in pixels where it says, and what Fixed starts at: the size it is now, as Figma's Fixed keeps it.
  const length = fixed ?? token?.px
  const now = Math.max(1, Math.round(length ?? measured ?? 100))
  const of = axis === "Width" ? "width" : "height"
  let shown: string | undefined

  if (setBy) {
    shown = "Auto"
  } else if (mode !== undefined) {
    shown = words[mode].name
  } else if (fixed !== undefined) {
    shown = unit === "rem" ? formatNumber(fixed / remPx) : String(fixed)
  } else if (percent !== undefined) {
    shown = formatNumber(percent)
  }

  // What Auto or a percentage comes to, faintly after it, as a chip has it; what sets Auto is in its hint and Sizing.
  const comesTo = (setBy || percent !== undefined) && measured !== undefined ? String(measured) : undefined

  const reason = "Enter a length, Hug or Fill"

  /**
   * What's typed: Fixed, or a word by name; a length with the app's maths and units (`+8`, `*2`, `1.5rem`, `spacing-4`),
   * where a bare number is in the unit shown; or a percentage, CSS's (call 10). Nothing typed, as Backspace on the
   * chip leaves it, keeps the size.
   */
  const read = (text: string): Reading<Size | undefined> => {
    const typed = text.trim().toLowerCase()

    if (typed === "") {
      return { value: undefined }
    }

    if (typed === "fixed") {
      return { value: now }
    }

    const word = typedSizes.get(typed)

    if (word !== undefined) {
      return { value: word }
    }

    const typedToken = tokenNamed(tokens, typed, "spacing-") ?? tokenNamed(containers, typed, "container-")

    if (typedToken) {
      return { value: { token: typedToken.name } }
    }

    const bare = isBareNumber(typed)
    let input = typed

    if (bare && percent !== undefined) {
      input = `${typed}%`
    } else if (bare && unit === "rem") {
      input = `${typed}rem`
    }

    const reading = readLength(input, { label: axis, current: length ?? measured, takesPercent: true })

    if ("reason" in reading) {
      return { reason: reading.reason.startsWith("Can't read") ? reason : reading.reason }
    }

    if ("clear" in reading) {
      return { reason }
    }

    if ("percent" in reading) {
      return { value: { percent: Math.max(0, Math.round(reading.percent * 10) / 10) } }
    }

    if (/rem\s*$/.test(typed)) {
      setUnit("rem")
    } else if (/px\s*$/.test(typed)) {
      setUnit("px")
    }

    return { value: Math.max(1, reading.px) }
  }

  const step = (up: boolean, keys: ScrubKeys) => {
    if (percent !== undefined) {
      onChange({ percent: Math.max(0, percent + stepCount(up, keys.shift)) })

      return
    }

    // A token steps to the next in scale order; Shift goes to the first or last.
    if (token) {
      onChange({ token: stepToken(tokens, token, up, keys.shift).name })

      return
    }

    // A word, or Auto, becomes Fixed at what it comes to and steps from there.
    onChange(Math.max(4, stepSpacing(length ?? measured ?? 0, stepCount(up, keys.shift))))
  }

  const toUnit = (next: "px" | "%" | "rem") => {
    if (next === "%") {
      onChange({ percent: parent ? Math.round((now / parent) * 1000) / 10 : 100 })

      return
    }

    setUnit(next)

    if (percent !== undefined) {
      onChange(Math.max(1, Math.round(measured ?? now)))
    }
  }

  const auto = setBy
    ? [{ key: "auto", name: "Auto", detail: `Set by ${setBy}`, current: true, onPick: () => undefined }]
    : []

  let chip: FieldChip | undefined = tokenChip(named, token, {
    // Backspace on a token's pill leaves it Fixed at what it came to, as on a word's.
    pick: (name) => onChange(name === undefined ? now : { token: name }),
    detach: (each) => onChange(each.px)
  })

  if (mode !== undefined) {
    chip = {
      name: words[mode].name,
      keyword: { detail: measured === undefined ? undefined : String(measured), about: words[mode].detail },
      onRemove: () => onChange(now)
    }
  }

  let hint: { label?: string; detail?: string } | undefined

  if (setBy) {
    hint = { label: `${axis} is set by ${setBy}`, detail: `${measured}px at this ratio` }
  } else if (named !== undefined) {
    hint = { detail: tokenStatus(named, token, undefined) ?? token?.detail }
  }

  return (
    <div className="flex min-w-0 flex-col">
      <ValueField
        label={axis}
        inner={axis[0]}
        // Dragging W or H scrubs the size a spacing step per 2 screen pixels, making a word Fixed first.
        scrub={{ from: () => length ?? measured ?? 0, apply: (px) => onChange(px), by: { spacing: true, min: 1 } }}
        shown={shown}
        muted={setBy !== undefined}
        chip={chip}
        unit={
          fixed === undefined && percent === undefined ? undefined : (
            <UnitMenu
              label={axis}
              unit={percent === undefined ? unit : "%"}
              units={[
                { unit: "px", label: "Pixels" },
                { unit: "%", label: `Of its ${within}'s ${of}` },
                { unit: "rem", label: "Root em, 16px" }
              ]}
              onUnit={toUnit}
            />
          )
        }
        comesTo={comesTo ?? token?.detail}
        hint={hint}
        own={
          fixed === undefined
            ? undefined
            : ownLength({
                px: fixed,
                unit: "px",
                tokens,
                kind: "spacing",
                namespace: "spacing-",
                create: spacing.create,
                tokensOnly: false,
                allow: undefined,
                onToken: (name) => onChange({ token: name }),
                onAllow: () => undefined
              })
        }
        tokens={{
          name: "Sizing",
          list: tokens,
          current: named,
          shown: tokensShown,
          keywords: {
            heading: axis,
            rows: [
              ...auto,
              {
                key: "fixed",
                name: "Fixed",
                detail: `${now}px`,
                current: !setBy && mode === undefined && named === undefined,
                onPick: () => {
                  if (setBy || mode !== undefined || named !== undefined) {
                    onChange(now)
                  }
                }
              },
              ...(["hug", "fill", "min", "max"] as const).map((each) => ({
                key: each,
                name: words[each].name,
                detail: words[each].detail,
                current: mode === each,
                onPick: () => onChange(each)
              }))
            ],
            actions: onAddLimit && [
              { key: "min", name: "Add min", disabled: limits?.min, onPick: () => onAddLimit("min") },
              { key: "max", name: "Add max", disabled: limits?.max, onPick: () => onAddLimit("max") }
            ]
          },
          onPick: (name) => {
            if (name !== undefined) {
              onChange({ token: name })
            }
          }
        }}
        selectOnFocus
        read={read}
        onCommit={(next) => {
          if (next !== undefined) {
            onChange(next)
          }
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

  if (pair) {
    return Number(pair[1]) > 0 && Number(pair[2]) > 0 ? `${Number(pair[1])} / ${Number(pair[2])}` : undefined
  }

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
            <DropdownMenuRadioGroup value={aspect} onValueChange={(next: string) => onChange(next)}>
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

/** A radius for each corner, from the top left, clockwise, as a style holds them. */
type CornerRadii = [Radius?, Radius?, Radius?, Radius?]

/**
 * Appearance's Radius, as the simpler fields lay it out (PAR-186): one field under its name, and each corner, laid out
 * where it is, once Each corner at the end of the name's row is pressed. It opens pressed when the corners differ.
 * Closing it never loses a value: corners that match become one radius again, and corners that don't stay as they are,
 * the one field saying Mixed until something's typed for them all. Corner shape's button sits beside Each corner.
 */
export function AppearanceSection({ draft, set, tokensOnly, mixed, changed }: SectionProps) {
  const radii: CornerRadii = Array.isArray(draft.radius)
    ? draft.radius
    : [draft.radius, draft.radius, draft.radius, draft.radius]

  const alike = radii.every((radius) => sameValue(radius, radii[0]))
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
              <CornerStyle value={draft.cornerStyle} onChange={(cornerStyle) => set({ cornerStyle })} />
              <EachToggle
                label="Each corner"
                parts="corners"
                pressed={each}
                onClick={() => {
                  // Corners that match become one radius again; corners that don't stay, and the field says Mixed.
                  if (each && alike && Array.isArray(draft.radius)) {
                    set({ radius: radii[0] })
                  }

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
                    const next: CornerRadii = [...radii]
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

const cornerStyles = [
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
function CornerStyle({
  value,
  onChange
}: {
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const current = value ?? "round"
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint
        label="Corner shape"
        detail="Only Chromium draws it. Other browsers draw round corners, so the radius still holds."
      >
        <PopoverTrigger
          aria-label={`Corner shape: ${cornerStyles.find((option) => option.value === current)?.label}`}
          // Shaded while a shape other than Round is set, as a pressed toggle in a name row is.
          data-set={current === "round" ? undefined : ""}
          className={`${nameMenuButton} dark:hover:bg-input/40 data-set:bg-muted data-set:text-foreground dark:data-set:bg-input/60`}
        >
          <Squircle />
        </PopoverTrigger>
      </Hint>
      <PopoverContent aria-label="Corner shape" className="w-52 gap-1 p-1" align="end">
        <p className="flex items-center gap-1 px-2 pt-1 text-sm font-medium">
          Corner shape
          <NotBaseline what="Corner shape" />
        </p>
        {/* One list of choices, as a token list is: the current one marked, Up and Down moving through them. */}
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the arrow keys of the buttons inside, handled once for them all */}
        <div className="flex flex-col" onKeyDown={moveThroughRows}>
          {cornerStyles.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-current={current === option.value || undefined}
              className={`flex w-full items-center rounded-sm px-2 py-1 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent ${current === option.value ? "bg-accent" : ""}`}
              onClick={() => {
                onChange(option.value === "round" ? undefined : option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="px-2 pb-1 type-description text-muted-foreground">
          Other browsers draw round corners, at the same radius.
        </p>
      </PopoverContent>
    </Popover>
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
        if (next === undefined || isLengthToken(next) || "px" in next) {
          onChange(next)
        }
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
  const name = value !== undefined && isLengthToken(value) ? value : undefined
  const token = name === undefined ? undefined : tokens.find((other) => other.name === name)
  const own = value !== undefined && !isLengthToken(value) && "px" in value ? value : undefined
  const percent = value !== undefined && !isLengthToken(value) && "percent" in value ? value.percent : undefined
  const capped = (share: number) => Math.min(percentMax, Math.max(0, share))

  // The unit a bare number is typed in while the field holds no value of its own, as the menu last set it.
  const percentUnit = usePercentUnit(own?.px, percent, {
    px: (px) => onChange({ px }),
    percent: (share) => onChange({ percent: capped(share) })
  })

  const unitNow = percentUnit.unit

  // Deprecated tokens aren't offered under Tokens only: they're on their way out.
  const scale = tokens.filter((other) => other.deprecated === undefined)
  const nearestTo = (px: number) => nearestToken(tokens, (other) => other.px, px)
  const nearest = own ? nearestTo(own.px) : undefined
  const refused = own !== undefined && tokensOnly && own.allow === undefined

  const read = (text: string): Reading<Radius | undefined> => {
    const trimmed = text.trim()

    if (trimmed === "") {
      return { value: undefined }
    }

    const named = tokenNamed(tokens, trimmed, namespace)

    if (named) {
      return { value: named.name }
    }

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

    if ("reason" in reading) {
      return reading
    }

    if ("percent" in reading) {
      if (!cssTakes(`${reading.percent}%`)) {
        return { reason: `${label} can't be ${trimmed}` }
      }

      return { value: { percent: capped(Math.round(reading.percent * 100) / 100) } }
    }

    if (!("px" in reading)) {
      return { value: undefined }
    }

    if (!cssTakes(`${reading.px}px`)) {
      return { reason: `${label} can't be ${trimmed}` }
    }

    // Locked to tokens, the field's `locked` turns a value of its own away before it gets here, offering the nearest.
    return { value: { px: Math.round(reading.px * 100) / 100 } }
  }

  const step = (up: boolean, { shift }: ScrubKeys) => {
    if (token) {
      // A token steps to the next of its kind in scale order; Shift goes to the first or last.
      onChange(stepToken(tokens, token, up, shift).name)

      return
    }

    const by = stepCount(up, shift)

    if (percent !== undefined) {
      onChange({ percent: capped(percent + by) })

      return
    }

    onChange({ px: Math.max(0, (own?.px ?? 0) + by) })
  }

  // The unit's menu keeps the number and changes its unit, as Webflow's does: 12px becomes 12%.
  const unit: ReactNode = takesPercent ? percentUnit.menu(label, "the layer's size") : "px"

  // A narrow field's hint carries the value's status, which has no room in the field.
  let status: string | undefined

  if (own && nearest) {
    status = `Nearest token: ${nearest.name}, ${nearest.detail}`
  } else if (percent !== undefined) {
    status = `${formatNumber(percent)}% of the layer's width across and height down`
  } else if (mixed && value === undefined) {
    status = mixedNote
  } else if (value === undefined) {
    status = "Unset"
  }

  status = tokenStatus(name, token, own?.allow) ?? status

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
      chip={tokenChip(name, token, { namespace, pick: onChange, detach: (each) => onChange({ px: each.px }) })}
      unit={unit}
      unitName={unitNow}
      comesTo={token?.detail}
      own={
        own === undefined
          ? ownPercent
          : ownLength({
              px: own.px,
              unit: "px",
              tokens,
              kind,
              namespace,
              create,
              tokensOnly,
              allow: own.allow,
              onToken: onChange,
              onAllow: (reason) => onChange(reason === undefined ? { px: own.px } : { ...own, allow: reason })
            })
      }
      // None draws as no radius or no blur, so the scale starts from it.
      tokens={{ list: tokens, current: name, none: "None", noneValue: "0px", onPick: onChange }}
      refused={refused && nearest ? { nearest, onUse: () => onChange(nearest.name) } : undefined}
      locked={
        tokensOnly
          ? {
              tokens: scale,
              nearestTo: (text) => {
                const reading = readLength(text, { label, current: own?.px ?? token?.px, takesPercent })

                return "px" in reading ? nearestTo(reading.px) : undefined
              }
            }
          : undefined
      }
      narrow={narrow}
      hint={{ detail: status }}
      read={read}
      onCommit={onChange}
      onStep={step}
    />
  )
}

/**
 * Stroke, a title with + until it's set, as PAR-652's panel starts Fill, Stroke and Effects. + adds the project's usual
 * stroke, `border-border` at 1px, and − takes it off.
 */
/** One width on every side, as an outline draws it. */
const everySide = (px: number): Sides => [{ number: px }, { number: px }, { number: px }, { number: px }]

export function StrokeSection({ draft, set, tokensOnly }: SectionProps) {
  const borderWidths = useTokens("borderWidth").tokens
  // A new stroke is in layout (call 2): a border. Out of layout, it's an outline at its position.
  const inLayout = draft.strokeInLayout ?? true
  const position: StrokePosition = inLayout ? "inside" : (draft.strokePosition ?? "inside")

  const widths = draft.borderWidth ?? oneEverySide
  const widest = Math.max(...widths.map((side) => sideNumber(side, borderWidths) ?? 0)) || 1
  // An outline strokes every side at one width: the sides as they are where they match, a token kept, or the widest.
  const outlined = widths.every((side) => sameValue(side, widths[0])) ? widths : everySide(widest)
  const stroked = draft.border !== undefined || draft.borderWidth !== undefined

  const action = (
    <SectionButton
      adds={!stroked}
      what="stroke"
      onClick={() => {
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
            : { border: "border", borderWidth: oneEverySide }
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
        <FourSidesField
          label="Width"
          rules={sideRules.border}
          together="one"
          sides={widths}
          tokensOnly={tokensOnly}
          onChange={(next) => {
            const change: Partial<Draft> = { borderWidth: next }

            // Only a border strokes some sides and not others, so sides that differ put the stroke in layout.
            if (!next.every((side) => sameValue(side, next[0]))) {
              change.strokeInLayout = undefined
              change.strokePosition = undefined
            }

            set(change)
          }}
        />
        <Field
          label="Position"
          hint="In layout, the stroke is a border, which takes up room. Out of it, it's an outline, drawn inside, centered on or outside the edge, and takes none."
        >
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <ChoiceInput
                label="Stroke position"
                value={position}
                options={strokePositions}
                onChange={(next) => {
                  if (!next || next === position) {
                    return
                  }

                  // Center and Outside are outlines, which stroke every side at one width.
                  if (next !== "inside") {
                    set({ strokeInLayout: false, strokePosition: next, borderWidth: outlined })
                  } else {
                    set({ strokePosition: inLayout ? undefined : "inside" })
                  }
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
                  set(
                    on
                      ? { strokeInLayout: undefined, strokePosition: undefined }
                      : { strokeInLayout: false, strokePosition: "inside", borderWidth: outlined }
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
] as const

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

/** A frame's width: pixels of its own, or a breakpoint's name. */
export type FrameWidth = number | { token: string }

/** A frame's width in pixels, from its breakpoint where it has one. */
export const framePx = (width: FrameWidth, breakpoints: readonly LengthToken[]) =>
  isFixedSize(width) ? width : (breakpoints.find((each) => each.name === width.token)?.px ?? 1280)

/** How much smaller than life the frame's preview draws it. */
const frameScale = 0.4

/** The design's frame, typed: its width and height in this viewport. */
export function FrameSection({
  frame,
  hugged,
  onChange
}: {
  frame: { width: FrameWidth; height: number | undefined }
  /** The design's own height, what Hug comes to, from the canvas. */
  hugged?: number
  onChange: (frame: { width: FrameWidth; height: number | undefined }) => void
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
            <FrameWidthField width={frame.width} onChange={(width) => onChange({ ...frame, width })} />
            <FrameHeightField
              height={frame.height}
              hugged={hugged}
              onChange={(height) => onChange({ ...frame, height })}
            />
          </div>
        </Field>
      </div>
    </PanelSection>
  )
}

/**
 * A frame's W: pixels, or one of the project's breakpoints, the widths its design is drawn at, as a pill (`xl`) with
 * what it comes to in its hint. Its tokens list the breakpoints, with the one nearest a width of its own first, and
 * Create token. Typing a breakpoint's name (`xl`) takes it, and Up and Down step through them.
 */
function FrameWidthField({ width, onChange }: { width: FrameWidth; onChange: (width: FrameWidth) => void }) {
  const { tokens, create } = useTokens("breakpoint")
  const namespace = "breakpoint-"
  const named = isFixedSize(width) ? undefined : width.token
  const token = named === undefined ? undefined : tokens.find((each) => each.name === named)
  const own = isFixedSize(width) ? width : undefined
  const px = framePx(width, tokens)
  const reason = "Enter a width, or a breakpoint such as xl"

  const read = (text: string): Reading<FrameWidth> => {
    const typedToken = tokenNamed(tokens, text, namespace)

    if (typedToken) {
      return { value: { token: typedToken.name } }
    }

    const reading = readLength(text, { label: "Frame width", current: px })

    if ("px" in reading) {
      return { value: Math.max(1, Math.round(reading.px)) }
    }

    return { reason: "reason" in reading && !reading.reason.startsWith("Can't read") ? reading.reason : reason }
  }

  const step = (up: boolean, { shift }: ScrubKeys) => {
    if (token) {
      onChange({ token: stepToken(tokens, token, up, shift).name })

      return
    }

    onChange(Math.max(1, px + stepCount(up, shift)))
  }

  return (
    <ValueField
      label="Frame width"
      inner="W"
      scrub={{ from: () => px, apply: (next) => onChange(next), by: { step: 1, shiftStep: 10, min: 1 } }}
      shown={own === undefined ? undefined : String(own)}
      chip={tokenChip(named, token, {
        namespace,
        // Backspace on the pill leaves the width it came to, ready to type over.
        pick: (name) => onChange(name === undefined ? px : { token: name }),
        detach: (each) => onChange(each.px)
      })}
      unit={own === undefined ? undefined : "px"}
      comesTo={token?.detail}
      hint={named === undefined ? undefined : { detail: tokenStatus(named, token, undefined) ?? token?.detail }}
      own={
        own === undefined
          ? undefined
          : ownLength({
              px: own,
              unit: "px",
              tokens,
              kind: "breakpoint",
              namespace,
              create,
              tokensOnly: false,
              allow: undefined,
              onToken: (name) => onChange({ token: name }),
              onAllow: () => undefined
            })
      }
      tokens={{
        list: tokens,
        current: named,
        onPick: (name) => {
          if (name !== undefined) {
            onChange({ token: name })
          }
        }
      }}
      selectOnFocus
      read={read}
      onCommit={onChange}
      onStep={step}
    />
  )
}

/**
 * A frame's H: pixels, or Hug, the design's own height, as a chip with what it comes to faintly, as W and H elsewhere
 * have it. Its chevron opens Sizing: Fixed and Hug. Backspace on Hug leaves it Fixed at what it came to.
 */
function FrameHeightField({
  height,
  hugged,
  onChange
}: {
  height: number | undefined
  hugged: number | undefined
  onChange: (height: number | undefined) => void
}) {
  const now = Math.max(1, Math.round(height ?? hugged ?? 800))
  const hug = height === undefined

  const read = (text: string): Reading<number | undefined> => {
    const typed = text.trim().toLowerCase()

    if (typedSizes.get(typed) === "hug") {
      return { value: undefined }
    }

    if (typed === "fixed") {
      return { value: now }
    }

    const reading = readLength(text, { label: "Frame height", current: now })

    if ("px" in reading) {
      return { value: Math.max(1, Math.round(reading.px)) }
    }

    return { reason: "Enter a height, or Hug" }
  }

  return (
    <ValueField
      label="Frame height"
      inner="H"
      scrub={{ from: () => now, apply: (next) => onChange(next), by: { step: 1, shiftStep: 10, min: 1 } }}
      shown={height === undefined ? undefined : String(height)}
      chip={
        hug
          ? {
              name: "Hug",
              keyword: { detail: hugged === undefined ? undefined : String(hugged), about: "Fits its design" },
              onRemove: () => onChange(now)
            }
          : undefined
      }
      unit={hug ? undefined : "px"}
      tokens={{
        name: "Sizing",
        list: [],
        keywords: {
          heading: "Frame height",
          rows: [
            {
              key: "fixed",
              name: "Fixed",
              detail: `${now}px`,
              current: !hug,
              onPick: () => {
                if (hug) {
                  onChange(now)
                }
              }
            },
            { key: "hug", name: "Hug", detail: "Fits its design", current: hug, onPick: () => onChange(undefined) }
          ]
        },
        onPick: () => undefined
      }}
      selectOnFocus
      read={read}
      onCommit={onChange}
      onStep={(up, { shift }) => onChange(Math.max(1, now + stepCount(up, shift)))}
    />
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

  if (inRem && value !== undefined) {
    shown = formatNumber(value / remPx)
  }

  /**
   * What's typed: a length with the app's maths and units (`+8`, `*2`, `1.5rem`, `spacing-4`), a bare number in the
   * unit shown; or, for a count, a whole number.
   */
  const read = (text: string): Reading<number | undefined> => {
    if (pixels) {
      const bare = isBareNumber(text)
      const reading = readLength(inRem && bare ? `${text}rem` : text, { label, current: value })

      if ("clear" in reading) {
        return { value: undefined }
      }

      if ("px" in reading) {
        return { value: Math.max(min, reading.px) }
      }

      return { reason: "reason" in reading ? reading.reason : "Enter a length" }
    }

    if (text.trim() === "") {
      return { value: undefined }
    }

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
        const count = stepCount(up, keys.shift)
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
const cellSize = (size: Size | undefined, tokens: readonly LengthToken[]) =>
  size === undefined || size === "fill" ? undefined : sizeCss(size, tokens)

const px = (pixels: number | undefined) => (pixels === undefined ? undefined : `${pixels}px`)

/** CSS's grid-template-columns for the columns: the tracks, or as many as fit, each at least the width given. */
function columnsCss(columns: Columns | undefined): string | undefined {
  if (columns === undefined) {
    return undefined
  }

  if (Array.isArray(columns)) {
    return columns.map(trackCss).join(" ")
  }

  return `repeat(auto-fit, minmax(${columns.fit}px, 1fr))`
}

export function LayerPreview({
  draft,
  childSelected = false,
  onSelectChild,
  onMeasure,
  onMeasureChild
}: {
  draft: Draft
  /** Whether Pro plan is selected, as a grid child; clicking it selects it where `onSelectChild` is given. */
  childSelected?: boolean
  onSelectChild?: (selected: boolean) => void
  /** Called with Plans' drawn size and its parent's width each time they change, as the canvas measures a layer. */
  onMeasure?: (measured: Measured) => void
  /** Called with Pro plan's drawn size and its parent's width each time they change. */
  onMeasureChild?: (measured: Measured) => void
}) {
  const sets = useTokenSets()
  const sizeTokens = [...sets.spacing, ...sets.container]
  // The layout, for what's highlighted on it to be measured against.
  const [layout, setLayout] = useState<HTMLElement | null>(null)
  const [child, setChild] = useState<HTMLElement | null>(null)
  useMeasure(layout, onMeasure)
  useMeasure(child, onMeasureChild)
  const grid = draft.columns !== undefined
  const Tag = tagOptions.find((option) => option.value === draft.tag)?.value ?? "p"
  const direction = `${draft.direction ?? "column"}${draft.reverse ? "-reverse" : ""}` as const
  // The box is physical, so a reversed layout writes the other end: its top is flex-end.
  const justify = draft.reverse ? flipped[draft.justify ?? "start"] : (draft.justify ?? "start")
  const gap = draft.gap === "auto" ? 0 : (sideNumber(draft.gap, sets.spacing) ?? 0)
  const rowGap = draft.rowGap === "auto" ? undefined : sideNumber(draft.rowGap, sets.spacing)

  // A negative gap overlaps the children, as the negative margin it's written as does: on their start side, reversed.
  const marginSide = `${(draft.direction ?? "column") === "row" ? "marginInline" : "marginBlock"}${draft.reverse ? "Start" : "End"}`
  const overlap = !grid && !draft.wrap && gap < 0 ? { [marginSide]: gap } : {}

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
    gridAutoRows: grid && !draft.rows?.length && draft.autoRows ? trackCss(draft.autoRows) : undefined,
    gridAutoFlow: grid && draft.dense ? "dense" : undefined,
    columnGap: Math.max(0, gap),
    rowGap: rowGap ?? Math.max(0, gap),
    padding: 20,
    width: sizeCss(draft.width ?? 520, sizeTokens),
    // A ratio only takes hold when one axis is left to it.
    height: draft.aspect ? undefined : sizeCss(draft.height, sizeTokens),
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
          let cell: CSSProperties = { fontSize: pro ? 20 : 14 }

          if (grid && pro) {
            cell = {
              gridColumn: placementCss(draft.colStart, draft.colSpan, draft.endLines ? draft.colEnd : undefined),
              gridRow: placementCss(draft.rowStart, draft.rowSpan, draft.endLines ? draft.rowEnd : undefined),
              alignSelf: draft.alignSelf,
              justifySelf: draft.justifySelf,
              width: cellSize(draft.childWidth, sizeTokens),
              height: cellSize(draft.childHeight, sizeTokens)
            }
          } else if (name !== "Team") {
            cell = { ...cell, ...overlap }
          }

          return (
            <button
              key={name}
              ref={pro ? setChild : undefined}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectChild?.(pro ? !childSelected : false)}
              className={`rounded-lg border border-black/10 bg-white/80 p-3 text-left text-sm ${selected ? "outline-2" : ""}`}
              style={{ outlineColor: selected ? kindColors.layer : undefined, ...cell }}
            >
              {name}
            </button>
          )
        })}
      </section>
    </PreviewStage>
  )
}

export function FramePreview({
  width,
  height,
  onHug
}: {
  width: number
  height: number | undefined
  /** Called with the design's own height, life size, each time it changes. */
  onHug?: (height: number) => void
}) {
  const [frame, setFrame] = useState<HTMLElement | null>(null)
  const report = useCallback((measured: Measured) => onHug?.(Math.round(measured.height / frameScale)), [onHug])
  useMeasure(frame, onHug && report)

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        Pricing in Desktop, {width} × {height ?? "Hug"}
      </span>
      <div
        ref={setFrame}
        className="flex flex-col gap-3 overflow-hidden border bg-white p-6 shadow-sm"
        style={{ width: width * frameScale, height: height === undefined ? undefined : height * frameScale }}
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
