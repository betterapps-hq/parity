import { Popover, PopoverContent, PopoverTrigger, Slider, Toggle } from "@buildkitgg/shadcn-baseui-kit"
import { ALargeSmall, ChevronDown, Italic, MoveHorizontal, MoveVertical, TriangleAlert } from "lucide-react"
import { type KeyboardEvent, type ReactNode, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { GroupLabel } from "../../chrome/PanelSection.tsx"
import { clamp, formatNumber, lengthForm } from "./css-values.ts"
import {
  fieldBox,
  type Message,
  MessageLine,
  MissingMark,
  nearestToken,
  type Reading,
  readNumber,
  type ScrubKeys,
  type SearchOption,
  UnitMenu,
  useTokens,
  ValueField
} from "./field-parts.tsx"
import { type FontFamily, findFont, genericOf, moreFonts, stackFamilies, weightName } from "./text-data.ts"
import type { FontSize, FontValue, LetterSpacing, LineHeight, WeightValue } from "./text-writes.ts"
import {
  type FontToken,
  fontToken,
  fontTokens,
  type LeadingToken,
  leadingToken,
  type SizeToken,
  sizeTokens,
  type TrackingToken,
  trackingToken,
  type WeightToken
} from "./tokens.ts"

/*
 * Text's font rows (PAR-186, design-options-values.md's Font family, Weight, and Line height and letter spacing), each
 * a ValueField with the anatomy every field shares: the value, its unit, what it comes to, the status slot, and the
 * token chip or button.
 */

/** A token's neighbour in its list's order, Shift going to the first or last, as Up and Down step every token. */
function stepThrough<T extends { name: string }>(list: readonly T[], at: T, up: boolean, { shift }: ScrubKeys): T {
  const last = list.length - 1
  let index = clamp(list.indexOf(at) + (up ? 1 : -1), 0, last)

  if (shift) {
    index = up ? last : 0
  }

  return list[index] ?? at
}

/** What a font value draws as: its first family's name, its stack, its token, and whether the frame can load it. */
export function resolveFont(value: FontValue | undefined, tokens: readonly FontToken[] = fontTokens) {
  if (value === undefined) {
    return undefined
  }

  if ("token" in value) {
    const token = tokens.find((each) => each.name === value.token)

    return {
      name: token?.detail ?? value.token,
      stack: token?.stack ?? "sans-serif",
      token: value.token,
      missing: false
    }
  }

  const first = stackFamilies(value.stack)[0] ?? ""
  const generic = ["serif", "sans-serif", "monospace", "system-ui"].includes(first)

  return { name: first, stack: value.stack, token: undefined, missing: !generic && findFont(first) === undefined }
}

/** The project's font token nearest a stack: the first with the same generic family. */
function nearestFontToken(stack: string, tokens: readonly FontToken[]): FontToken | undefined {
  const generic = genericOf(stack)

  return tokens.find((token) => genericOf(token.stack) === generic) ?? tokens[0]
}

/** A font the list offers: one of the project's tokens, or one of More fonts, which choosing adds to the project. */
interface FontOption {
  name: string
  stack: string
  token?: string
}

/**
 * Font family: the first family's name in its own face, with +2 when the stack has fallbacks and the stack in the
 * hint. Focused, it lists the fonts, set in each, the project's first; typing searches them, and Up and Down move
 * through them, previewing each on the canvas; Enter takes the highlighted one, and a comma-separated stack is kept as
 * typed. A font the frame can't load is Missing, drawn in the fallback with its name struck through.
 */
export function FontFamilyField({
  value,
  inherited,
  mixed = false,
  tokensOnly = false,
  onChange,
  onPreview
}: {
  value: FontValue | undefined
  /** The font the layer inherits while unset, and the layer it's from. */
  inherited: { font: FontFamily; from: string }
  mixed?: boolean
  tokensOnly?: boolean
  onChange: (value: FontValue | undefined) => void
  onPreview: (value: FontValue | undefined) => void
}) {
  const { tokens, create } = useTokens("font")
  // What Add font says it'll do, under the row.
  const [note, setNote] = useState<Message>()

  const change = (next: FontValue | undefined) => {
    setNote(undefined)
    onChange(next)
  }

  const resolved = resolveFont(value, tokens)
  const held = value !== undefined && "token" in value ? value.token : undefined
  const heldToken = tokens.find((token) => token.name === held)
  const own = value !== undefined && "stack" in value ? value : undefined

  const fonts: FontOption[] = [
    ...tokens.map((token) => ({ name: token.detail, stack: token.stack, token: token.name })),
    ...(tokensOnly ? [] : moreFonts)
  ]

  const valueOf = (font: FontOption): FontValue =>
    font.token === undefined ? { stack: font.stack } : { token: font.token }

  const options = (text: string): (SearchOption & { value: FontValue })[] => {
    // A comma means a stack, kept as typed, so the list steps aside.
    if (text.includes(",")) {
      return []
    }

    const searched = text.trim().toLowerCase()

    return fonts.flatMap((font) => {
      const found =
        searched === "" ||
        font.name.toLowerCase().includes(searched) ||
        (font.token !== undefined && font.token.includes(searched))

      if (!found) {
        return []
      }

      return [
        {
          key: `${font.token ?? ""}${font.name}`,
          value: valueOf(font),
          group: font.token === undefined ? "More fonts, added to the project when chosen" : "In the project",
          content: (
            <>
              <span className="text-sm" style={{ fontFamily: font.stack }}>
                {font.name}
              </span>
              {font.token !== undefined && (
                <span className="font-mono text-2xs text-muted-foreground">font-{font.token}</span>
              )}
            </>
          )
        }
      ]
    })
  }

  const read = (text: string): Reading<FontValue | undefined> => {
    const typed = text.trim()

    if (typed === "") {
      return { value: undefined }
    }

    if (!typed.includes(",")) {
      const words = typed.toLowerCase()

      const named = fonts.find(
        (font) =>
          font.name.toLowerCase() === words ||
          (font.token !== undefined && (font.token === words || `font-${font.token}` === words))
      )

      if (named) {
        return { value: valueOf(named) }
      }

      return {
        reason: `No font named ${typed}. To use it anyway, add a fallback, such as ${typed}, sans-serif`
      }
    }

    // Locked to tokens, the field's `locked` turns a value of its own away before it gets here, offering the nearest.
    return { value: { stack: typed } }
  }

  const fallbacks = own ? stackFamilies(own.stack).length - 1 : 0
  let comesTo = heldToken?.detail

  if (fallbacks > 0) {
    comesTo = `+${fallbacks}`
  }

  const near = own ? nearestFontToken(own.stack, tokens) : undefined
  let missing: ReactNode

  if (held !== undefined && !heldToken) {
    missing = <MissingMark name={held} />
  } else if (own && resolved?.missing) {
    const fallback = genericOf(own.stack)
    missing = (
      <MissingMark
        name={resolved.name}
        description={`${resolved.name} isn't in the project, so it's drawn in ${fallback}.`}
        actions={[
          ...tokens.map((token) => ({
            label: `Replace with ${token.detail}`,
            run: () => change({ token: token.name })
          })),
          {
            label: "Add font",
            run: () =>
              setNote({
                tone: "note",
                text: `To load ${resolved.name}, add its font files to public/fonts.`
              })
          }
        ]}
      />
    )
  }

  return (
    <div>
      <ValueField
        label="Font"
        shown={own ? resolved?.name : undefined}
        placeholder={inherited.font.name}
        mixed={mixed}
        chip={
          held === undefined
            ? undefined
            : {
                name: held,
                token: heldToken,
                onRemove: () => change(undefined),
                onDetach: heldToken ? () => change({ stack: heldToken.stack }) : undefined,
                onReplace: (replacement) => change({ token: replacement })
              }
        }
        comesTo={comesTo}
        status={{ missing }}
        own={
          own === undefined
            ? undefined
            : {
                text: resolved?.name ?? own.stack,
                nearest: near,
                onCreate:
                  create &&
                  ((name) => {
                    create(fontToken(name, resolved?.name ?? name, own.stack))
                    change({ token: name })
                  }),
                tokensOnly,
                allowed: own.allow,
                onAllow: (allow) => change({ stack: own.stack, allow })
              }
        }
        refused={
          tokensOnly && own && own.allow === undefined && near
            ? { nearest: near, onUse: () => change({ token: near.name }) }
            : undefined
        }
        search={{
          label: "Fonts",
          options,
          empty: (text) => (text.includes(",") ? undefined : "No fonts match"),
          onHighlight: onPreview
        }}
        // Locked, its search lists only the tokens (`options`), and a token's font typed by name is the token.
        locked={
          tokensOnly
            ? {
                tokens,
                nearestTo: (text) => nearestFontToken(text, tokens),
                takes: (text) => tokens.some((token) => token.detail.toLowerCase() === text.toLowerCase())
              }
            : undefined
        }
        hint={{
          label: resolved ? `Font: ${resolved.name}` : `Font: ${inherited.font.name}, inherited from ${inherited.from}`,
          detail: resolved ? resolved.stack : `Set on ${inherited.from}. ${inherited.font.stack}`
        }}
        inputMode="text"
        // The family's name in its own face; a font the frame can't load in the fallback, struck through.
        inputStyle={{ fontFamily: resolved?.stack ?? inherited.font.stack }}
        inputClassName={
          resolved?.missing
            ? "text-amber-700 line-through focus:text-foreground focus:no-underline dark:text-amber-400"
            : ""
        }
        selectOnFocus
        read={read}
        onCommit={change}
      />
      <MessageLine message={note} />
    </div>
  )
}

/** The weight a value comes to. */
const weightOf = (value: WeightValue | undefined, tokens: readonly WeightToken[]): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  if ("token" in value) {
    return tokens.find((token) => token.name === value.token)?.weight
  }

  return value.value
}

/** How a font draws a weight: with its own face, the nearest face, or faked by the browser (`font-synthesis`). */
export function weightFace(
  font: FontFamily,
  weight: number
):
  | { kind: "face" }
  | { kind: "nearest"; face: number }
  | {
      kind: "faked"
    } {
  if (font.axis) {
    return weight >= font.axis[0] && weight <= font.axis[1] ? { kind: "face" } : { kind: "faked" }
  }

  if (font.weights.includes(weight)) {
    return { kind: "face" }
  }

  // The browser synthesizes bold only when the font has no bold face; otherwise it draws the nearest face.
  if (weight >= 600 && !font.weights.some((face) => face >= 600)) {
    return { kind: "faked" }
  }

  const face = font.weights.reduce((best, each) => (Math.abs(each - weight) < Math.abs(best - weight) ? each : best))

  return { kind: "nearest", face }
}

/**
 * Weight and style: the weight's name (Semibold), with its number and class in the hint, and Italic beside it. Its
 * menu lists the font's weights first; a variable font adds a number field and a slider over its weight axis. A weight
 * the font has no face for is drawn with the nearest one, or faked by the browser, and the field says so.
 */
export function WeightField({
  font,
  value,
  italic,
  inherited = 400,
  mixed = false,
  onChange,
  onItalic,
  onPreview
}: {
  font: FontFamily
  value: WeightValue | undefined
  italic: boolean | undefined
  inherited?: number
  mixed?: boolean
  onChange: (value: WeightValue | undefined) => void
  onItalic: (italic: boolean | undefined) => void
  onPreview: (weight: number | undefined) => void
}) {
  const { tokens } = useTokens("weight")
  const [open, setOpen] = useState(false)
  const weight = weightOf(value, tokens)
  const shown = weight ?? inherited
  const face = weightFace(font, shown)
  const faces = font.axis ? tokens.map((token) => token.weight) : font.weights
  const others = tokens.map((token) => token.weight).filter((each) => !faces.includes(each))

  /** The weight a typed or slid number is stored as: its token where one names it (600 is `semibold`). */
  const weightValue = (number: number): WeightValue => {
    const token = tokens.find((each) => each.weight === number)

    return token ? { token: token.name } : { value: number }
  }

  // Up and Down on the menu's button step through the font's weights, as a token steps through its scale.
  const step = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return
    }

    event.preventDefault()
    const at = faces.indexOf(shown)
    let index = at === -1 ? faces.findIndex((each) => each > shown) : at + (event.key === "ArrowUp" ? 1 : -1)

    if (event.shiftKey) {
      index = event.key === "ArrowUp" ? faces.length - 1 : 0
    }

    const next = faces[clamp(index, 0, faces.length - 1)]

    if (next !== undefined) {
      onChange(weightValue(next))
    }
  }

  let label = weightName(shown, tokens)

  if (mixed && value === undefined) {
    label = "Mixed"
  }

  let faceNote: string | undefined

  if (face.kind === "faked") {
    faceNote = `Faked by the browser: ${font.name} has no face this heavy`
  }

  if (face.kind === "nearest") {
    faceNote = `Drawn with ${weightName(face.face, tokens)}, the nearest face ${font.name} has`
  }

  const tokenName = weight === undefined ? undefined : tokens.find((token) => token.weight === weight)?.name
  const italicFaked = italic === true && !font.italic

  const item = (each: number, faked: boolean) => (
    <button
      key={each}
      type="button"
      aria-pressed={each === weight}
      onPointerEnter={() => onPreview(each)}
      onFocus={() => onPreview(each)}
      onClick={() => {
        onChange(weightValue(each))
        setOpen(false)
        onPreview(undefined)
      }}
      className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${each === weight ? "bg-accent" : ""}`}
    >
      <span style={{ fontFamily: font.stack, fontWeight: each }}>{weightName(each, tokens)}</span>
      <span className="text-2xs text-muted-foreground tabular-nums">{faked ? `${each}, faked` : each}</span>
    </button>
  )

  return (
    <div>
      <div className="flex items-center gap-1">
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)

            if (!next) {
              onPreview(undefined)
            }
          }}
        >
          <Hint
            label={`Weight: ${label}`}
            detail={[
              `${shown}${tokenName ? `, font-${tokenName}` : ""}`,
              weight === undefined && !mixed ? "Inherited" : undefined,
              faceNote
            ]
              .filter(Boolean)
              .join("\n")}
            wait
          >
            <PopoverTrigger
              aria-label={`Weight: ${label}`}
              onKeyDown={step}
              className={`${fieldBox(false, "flex-1 justify-between pr-1 text-left outline-none")} data-popup-open:ring-2 data-popup-open:ring-ring`}
            >
              <span
                className={`truncate ${weight === undefined ? "text-muted-foreground" : ""}`}
                style={{ fontWeight: shown, fontFamily: font.stack }}
              >
                {label}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {face.kind === "faked" && (
                  <TriangleAlert aria-label="Faked by the browser" className="size-3.5 text-amber-600" />
                )}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </span>
            </PopoverTrigger>
          </Hint>
          <PopoverContent align="start" className="w-60 gap-1 p-1">
            {font.axis && (
              <div className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-2 border-b px-2 pt-1.5 pb-2.5">
                <p className="col-span-full pb-2 type-description text-muted-foreground">
                  {font.name} is variable: any weight from {font.axis[0]} to {font.axis[1]}
                </p>
                <Slider
                  aria-label="Weight axis"
                  min={font.axis[0]}
                  max={font.axis[1]}
                  step={1}
                  value={shown}
                  onValueChange={(next) => onChange(weightValue(Array.isArray(next) ? next[0]! : next))}
                />
                <ValueField
                  label="Weight"
                  shown={String(shown)}
                  selectOnFocus
                  read={(text): Reading<number> => {
                    const reading = readNumber(text, shown, "Weight")

                    if ("reason" in reading) {
                      return { reason: reading.reason }
                    }

                    if ("clear" in reading) {
                      return { reason: "Enter a weight from 1 to 1000" }
                    }

                    if (reading.value < 1 || reading.value > 1000) {
                      return { reason: "Weight goes from 1 to 1000" }
                    }

                    return { value: Math.round(reading.value) }
                  }}
                  onCommit={(next) => onChange(weightValue(next))}
                  onStep={(up, { shift }) =>
                    onChange(weightValue(clamp(shown + (up ? 1 : -1) * (shift ? 100 : 10), 1, 1000)))
                  }
                />
              </div>
            )}
            <GroupLabel as="p" className="px-2 pt-1">
              In {font.name}
            </GroupLabel>
            {faces.map((each) => item(each, false))}
            {others.length > 0 && (
              <>
                <GroupLabel as="p" className="mt-1 border-t px-2 pt-1.5">
                  Not in {font.name}
                </GroupLabel>
                {others.map((each) => item(each, weightFace(font, each).kind === "faked"))}
              </>
            )}
          </PopoverContent>
        </Popover>
        <Hint label="Italic" detail={italicFaked ? `Faked by the browser: ${font.name} has no italic` : undefined}>
          <Toggle
            variant="outline"
            size="sm"
            className="h-7 px-2"
            aria-label="Italic"
            pressed={italic ?? false}
            onPressedChange={(pressed) => onItalic(pressed || undefined)}
          >
            <Italic />
            {italicFaked && <TriangleAlert aria-label="Faked by the browser" className="size-3 text-amber-600" />}
          </Toggle>
        </Hint>
      </div>
      {face.kind === "faked" && <MessageLine message={{ tone: "note", text: faceNote ?? "" }} />}
    </div>
  )
}

/** The unit a line height is shown and typed in. */
type LineUnit = "×" | "px" | "%"

/** What a unit typed after a line height means; em is a multiple, as CSS's line height reads it. */
const typedUnits = new Map<string, LineUnit | "em">([
  ["px", "px"],
  ["x", "×"],
  ["×", "×"],
  ["%", "%"],
  ["em", "em"]
])

/** The multiple a line height comes to at a font size, a leading token's from the project's tokens. */
function multipleOf(lineHeight: LineHeight, fontSize: number, tokens: readonly LeadingToken[]): number {
  if ("keyword" in lineHeight) {
    return 1.2
  }

  if ("token" in lineHeight) {
    return tokens.find((token) => token.name === lineHeight.token)?.multiple ?? 1.5
  }

  if ("multiple" in lineHeight) {
    return lineHeight.multiple
  }

  return lineHeight.px / fontSize
}

const unitOf = (lineHeight: LineHeight | undefined): LineUnit => {
  if (lineHeight !== undefined && "px" in lineHeight) {
    return "px"
  }

  return "×"
}

/**
 * Line height: Auto for `normal`, a multiple with × (1.5×), or px, where whole pixels are spacing steps (`leading-6`)
 * and a leading token is a chip. A typed % becomes its multiple. Unset beside a size token, the size's paired value
 * shows faintly, labeled From size. A multiple above 4 asks whether pixels were meant, and pixels below 4 a multiple.
 */
export function LineHeightField({
  value,
  size,
  fontSize = 16,
  mixed = false,
  onChange
}: {
  value: LineHeight | undefined
  /** The text's size token, whose paired line height shows while this is unset. */
  size: SizeToken | undefined
  /** The text's size in pixels, for converting between a multiple and pixels. */
  fontSize?: number
  mixed?: boolean
  onChange: (value: LineHeight | undefined) => void
}) {
  const { tokens, create } = useTokens("leading")
  const [unit, setUnit] = useState<LineUnit>(() => unitOf(value))

  const currentIn = (lineHeight: LineHeight | undefined, inUnit: LineUnit): number | undefined => {
    if (lineHeight === undefined) {
      return undefined
    }

    const multiple = multipleOf(lineHeight, fontSize, tokens)

    if (inUnit === "px") {
      return "px" in lineHeight ? lineHeight.px : Math.round(multiple * fontSize * 100) / 100
    }

    return inUnit === "%" ? multiple * 100 : multiple
  }

  const held = value !== undefined && "token" in value ? value.token : undefined
  const token = tokens.find((each) => each.name === held)
  let shown: string | undefined

  if (value !== undefined && "keyword" in value) {
    shown = "Auto"
  } else if (value !== undefined && held === undefined) {
    shown = formatNumber(currentIn(value, unit) ?? 0)
  }

  const fromPx = (px: number): LineHeight => ({ px: Math.round(px * 100) / 100 })

  const read = (text: string): Reading<LineHeight | undefined> => {
    const trimmed = text.trim().toLowerCase()

    if (trimmed === "") {
      return { value: undefined }
    }

    if (trimmed === "auto" || trimmed === "normal") {
      return { value: { keyword: "normal" } }
    }

    const name = trimmed.replace(/^leading-/, "")

    if (tokens.some((each) => each.name === name)) {
      return { value: { token: name } }
    }

    const step = /^spacing-(\d*\.?\d+)$/.exec(trimmed)?.[1]

    if (step !== undefined) {
      return { value: fromPx(Number(step) * 4) }
    }

    let typedUnit: LineUnit | "em" = unit
    let number = trimmed
    const suffix = /(px|x|×|%|em)$/.exec(trimmed)?.[1]

    if (suffix !== undefined) {
      number = trimmed.slice(0, -suffix.length)
      typedUnit = typedUnits.get(suffix) ?? unit
    }

    const reading = readNumber(number, currentIn(value, typedUnit === "em" ? "×" : typedUnit), "Line height")

    if ("reason" in reading) {
      return { reason: `Enter a multiple (1.5), pixels (24px), a percentage or Auto` }
    }

    if ("clear" in reading) {
      return { value: undefined }
    }

    if (reading.value < 0) {
      return { reason: "Line height can't be negative" }
    }

    if (typedUnit === "px") {
      const px = reading.value

      if (px > 0 && px < 4) {
        return {
          value: fromPx(px),
          message: {
            tone: "note",
            text: `Did you mean ${formatNumber(px)}×?`,
            action: {
              label: `Use ${formatNumber(px)}×`,
              run: () => {
                setUnit("×")
                onChange({ multiple: px })
              }
            }
          }
        }
      }

      return { value: fromPx(px) }
    }

    const multiple = typedUnit === "%" ? reading.value / 100 : reading.value

    if (multiple > 4) {
      return {
        value: { multiple },
        message: {
          tone: "note",
          text: `Did you mean ${formatNumber(multiple)}px?`,
          action: {
            label: `Use ${formatNumber(multiple)}px`,
            run: () => {
              setUnit("px")
              onChange(fromPx(multiple))
            }
          }
        }
      }
    }

    return { value: { multiple } }
  }

  const step = (up: boolean, keys: ScrubKeys) => {
    if (token) {
      onChange({ token: stepThrough(tokens, token, up, keys).name })

      return
    }

    const sign = up ? 1 : -1

    if (unit === "px") {
      const from = currentIn(value, "px") ?? size?.lineHeight ?? fontSize * 1.5
      onChange(fromPx(Math.max(0, Math.round(from) + sign * (keys.shift ? 10 : 1))))

      return
    }

    const from = currentIn(value, "×") ?? (size ? size.lineHeight / size.px : 1.5)
    onChange({ multiple: Math.max(0, Math.round((from + sign * (keys.shift ? 0.25 : 0.05)) * 1000) / 1000) })
  }

  let placeholder = "Auto"
  let comesTo = token?.detail

  if (value === undefined && size && !mixed) {
    placeholder = unit === "px" ? String(size.lineHeight) : formatNumber(size.lineHeight / size.px)
    comesTo = "From size"
  }

  // A multiple, or pixels off the spacing steps, is a value of its own, marked; whole pixels are a step.
  let own: { multiple: number } | { px: number; allow?: string } | undefined

  if (value !== undefined && "multiple" in value) {
    own = value
  }

  if (value !== undefined && "px" in value && !("step" in lengthForm(value.px))) {
    own = value
  }

  const multiple = multipleOf(value ?? { multiple: 1.5 }, fontSize, tokens)
  const nearest = nearestToken(tokens, (each) => each.multiple, multiple)
  const auto = value !== undefined && "keyword" in value

  return (
    <ValueField
      label="Line height"
      inner={<MoveVertical aria-hidden className="size-3.5" />}
      scrub={{
        from: () => currentIn(value, unit) ?? (unit === "px" ? (size?.lineHeight ?? 24) : 1.5),
        apply: (next) => onChange(unit === "px" ? fromPx(next) : { multiple: next }),
        by: unit === "px" ? { step: 1, shiftStep: 10, min: 0 } : { step: 0.05, shiftStep: 0.25, min: 0 }
      }}
      shown={shown}
      placeholder={placeholder}
      mixed={mixed}
      chip={
        held === undefined
          ? undefined
          : {
              name: held,
              token,
              onRemove: () => onChange(undefined),
              onDetach: token ? () => onChange({ multiple: token.multiple }) : undefined,
              onReplace: (name) => onChange({ token: name })
            }
      }
      unit={
        auto ? undefined : (
          <UnitMenu
            label="Line height"
            unit={unit}
            units={[
              { unit: "×", label: "Multiple of the font size" },
              { unit: "px", label: "Pixels" },
              { unit: "%", label: "Percentage of the font size" }
            ]}
            extra={{ label: "Auto (normal)", run: () => onChange({ keyword: "normal" }) }}
            onUnit={(next) => {
              setUnit(next)

              if (value === undefined) {
                return
              }

              if (next === "px") {
                onChange(fromPx(currentIn(value, "px") ?? 0))
              } else {
                onChange({ multiple: currentIn(value, "×") ?? 1.5 })
              }
            }}
          />
        )
      }
      comesTo={comesTo}
      own={
        own === undefined
          ? undefined
          : {
              text: `${shown}${unit === "px" ? "px" : "×"}`,
              nearest,
              same: nearest?.multiple === multiple,
              onCreate:
                create &&
                ((name) => {
                  create(leadingToken(name, Math.round(multiple * 1000) / 1000))
                  onChange({ token: name })
                }),
              allowed: "px" in own ? own.allow : undefined,
              // A multiple is a value in CSS's own terms; pixels off the steps keep why they're allowed here.
              onAllow: "px" in own ? (allow) => onChange({ px: own.px, allow }) : undefined
            }
      }
      tokens={{
        list: tokens,
        current: held,
        onPick: (name) => onChange(name === undefined ? undefined : { token: name })
      }}
      read={read}
      onCommit={(next) => {
        if (next !== undefined && "px" in next) {
          setUnit("px")
        } else if (next !== undefined && "multiple" in next && unit === "px") {
          setUnit("×")
        }

        onChange(next)
      }}
      onStep={step}
    />
  )
}

/** A text size in pixels: a token's, or its own. */
export function sizePx(size: FontSize, tokens: readonly SizeToken[] = sizeTokens): number {
  return "token" in size ? (tokens.find((token) => token.name === size.token)?.px ?? 16) : size.px
}

/**
 * Text's size (design-options-panel.md's Size): a font size token as a pill (`xl`, which comes to 20px), or pixels of
 * its own, typed or with maths. Up and Down step a token through the scale and pixels by 1, Shift 10; the icon scrubs.
 */
export function FontSizeField({
  value,
  inherited = 16,
  mixed = false,
  onChange
}: {
  value: FontSize | undefined
  /** The size the text inherits while unset, shown faintly. */
  inherited?: number
  mixed?: boolean
  onChange: (value: FontSize | undefined) => void
}) {
  const { tokens, create } = useTokens("size")
  const held = value !== undefined && "token" in value ? value.token : undefined
  const token = tokens.find((each) => each.name === held)
  const own = value !== undefined && "px" in value ? value : undefined
  const px = value === undefined ? undefined : sizePx(value, tokens)

  const read = (text: string): Reading<FontSize | undefined> => {
    const trimmed = text.trim().toLowerCase()

    if (trimmed === "") {
      return { value: undefined }
    }

    const name = trimmed.replace(/^text-/, "")

    if (tokens.some((each) => each.name === name)) {
      return { value: { token: name } }
    }

    const reading = readNumber(trimmed.replace(/px$/, ""), px, "Size")

    if ("reason" in reading) {
      return { reason: "Enter pixels, such as 20, or a text size token" }
    }

    if ("clear" in reading) {
      return { value: undefined }
    }

    if (reading.value <= 0) {
      return { reason: "Enter a number above 0" }
    }

    return { value: { px: Math.round(reading.value * 100) / 100 } }
  }

  const nearest = px === undefined ? undefined : nearestToken(tokens, (each) => each.px, px)

  return (
    <ValueField
      label="Size"
      inner={<ALargeSmall aria-hidden className="size-3.5" />}
      scrub={{
        from: () => px ?? inherited,
        apply: (next) => onChange({ px: Math.max(1, next) }),
        by: { step: 1, shiftStep: 10 }
      }}
      shown={own === undefined ? undefined : formatNumber(own.px)}
      placeholder={formatNumber(inherited)}
      mixed={mixed}
      chip={
        held === undefined
          ? undefined
          : {
              name: held,
              token,
              onRemove: () => onChange(undefined),
              onDetach: token ? () => onChange({ px: token.px }) : undefined,
              onReplace: (name) => onChange({ token: name })
            }
      }
      unit="px"
      comesTo={token ? `${formatNumber(token.px)}px` : undefined}
      own={
        own === undefined
          ? undefined
          : {
              text: `${formatNumber(own.px)}px`,
              nearest,
              same: nearest?.px === own.px,
              onCreate:
                create &&
                ((name) => {
                  create({
                    name,
                    kind: "font-size",
                    value: `${own.px}px`,
                    detail: `${own.px}px`,
                    px: own.px,
                    lineHeight: Math.round(own.px * 1.5)
                  })
                  onChange({ token: name })
                }),
              allowed: own.allow,
              onAllow: (allow) => onChange({ px: own.px, allow })
            }
      }
      tokens={{
        list: tokens,
        current: held,
        onPick: (name) => onChange(name === undefined ? undefined : { token: name })
      }}
      read={read}
      onCommit={onChange}
      onStep={(up, keys) => {
        if (token) {
          onChange({ token: stepThrough(tokens, token, up, keys).name })

          return
        }

        const by = keys.shift ? 10 : 1
        onChange({ px: Math.max(1, (px ?? inherited) + (up ? by : -by)) })
      }}
    />
  )
}

type SpacingUnit = "%" | "em" | "px"

/** Letter spacing in em: a token's, a value's, or pixels at the font size. */
function emOf(spacing: LetterSpacing, fontSize: number, tokens: readonly TrackingToken[]): number {
  if ("token" in spacing) {
    return tokens.find((token) => token.name === spacing.token)?.em ?? 0
  }

  if ("em" in spacing) {
    return spacing.em
  }

  return spacing.px / fontSize
}

/** A signed number with a real minus sign, as what a value comes to shows it. */
const signed = (value: number) => (value < 0 ? `−${formatNumber(-value)}` : formatNumber(value))

/**
 * Letter spacing: a percentage of the font size, as Figma's is (`tight` shows −2.5%), written as em, or pixels when
 * typed in pixels. Tracking tokens are chips. Up and Down step 0.5%, Shift 2.5%.
 */
export function LetterSpacingField({
  value,
  fontSize = 16,
  mixed = false,
  onChange
}: {
  value: LetterSpacing | undefined
  fontSize?: number
  mixed?: boolean
  onChange: (value: LetterSpacing | undefined) => void
}) {
  const { tokens, create } = useTokens("tracking")
  const [unit, setUnit] = useState<SpacingUnit>(() => (value !== undefined && "px" in value ? "px" : "%"))

  const currentIn = (spacing: LetterSpacing | undefined, inUnit: SpacingUnit): number | undefined => {
    if (spacing === undefined) {
      return undefined
    }

    if (inUnit === "px") {
      return "px" in spacing ? spacing.px : Math.round(emOf(spacing, fontSize, tokens) * fontSize * 100) / 100
    }

    const em = emOf(spacing, fontSize, tokens)

    return inUnit === "%" ? Math.round(em * 100_000) / 1000 : em
  }

  const held = value !== undefined && "token" in value ? value.token : undefined
  const token = tokens.find((each) => each.name === held)
  const shown = value === undefined || held !== undefined ? undefined : formatNumber(currentIn(value, unit) ?? 0)

  const store = (number: number, inUnit: SpacingUnit): LetterSpacing => {
    if (inUnit === "px") {
      return { px: Math.round(number * 100) / 100 }
    }

    return { em: Math.round((inUnit === "%" ? number / 100 : number) * 10_000) / 10_000 }
  }

  const read = (text: string): Reading<LetterSpacing | undefined> => {
    const trimmed = text.trim().toLowerCase()

    if (trimmed === "") {
      return { value: undefined }
    }

    const name = trimmed.replace(/^tracking-/, "")

    if (tokens.some((each) => each.name === name)) {
      return { value: { token: name } }
    }

    let typedUnit = unit
    let number = trimmed
    const suffix = /(px|%|em)$/.exec(trimmed)?.[1]

    if (suffix === "px" || suffix === "%" || suffix === "em") {
      number = trimmed.slice(0, -suffix.length)
      typedUnit = suffix
    }

    const reading = readNumber(number.replaceAll("−", "-"), currentIn(value, typedUnit), "Letter spacing")

    if ("reason" in reading) {
      return { reason: "Enter a percentage, em, pixels or a tracking token" }
    }

    if ("clear" in reading) {
      return { value: undefined }
    }

    if (typedUnit === "px") {
      setUnit("px")
    } else if (unit === "px") {
      setUnit(typedUnit)
    }

    return { value: store(reading.value, typedUnit) }
  }

  const em = value === undefined ? 0 : emOf(value, fontSize, tokens)
  const nearest = nearestToken(tokens, (each) => each.em, em)

  return (
    <ValueField
      label="Letter spacing"
      inner={<MoveHorizontal aria-hidden className="size-3.5" />}
      scrub={{
        from: () => currentIn(value, unit) ?? 0,
        apply: (next) => onChange(store(next, unit)),
        by: unit === "em" ? { step: 0.005, shiftStep: 0.025 } : { step: 0.5, shiftStep: 2.5 }
      }}
      shown={shown}
      placeholder="0"
      mixed={mixed}
      chip={
        held === undefined
          ? undefined
          : {
              name: held,
              token,
              onRemove: () => onChange(undefined),
              onDetach: token ? () => onChange({ em: token.em }) : undefined,
              onReplace: (name) => onChange({ token: name })
            }
      }
      unit={
        <UnitMenu
          label="Letter spacing"
          unit={unit}
          units={[
            { unit: "%", label: "Percentage of the font size" },
            { unit: "em", label: "Em, the font size" },
            { unit: "px", label: "Pixels" }
          ]}
          onUnit={(next) => {
            setUnit(next)

            if (value !== undefined) {
              onChange(store(currentIn(value, next) ?? 0, next))
            }
          }}
        />
      }
      comesTo={token ? `${signed(token.em * 100)}%` : undefined}
      own={
        value === undefined || "token" in value
          ? undefined
          : {
              text: `${shown}${unit}`,
              nearest,
              same: nearest?.em === em,
              onCreate:
                create &&
                ((name) => {
                  create(trackingToken(name, Math.round(em * 10_000) / 10_000))
                  onChange({ token: name })
                }),
              allowed: value.allow,
              onAllow: (allow) => {
                if ("em" in value) {
                  onChange({ em: value.em, allow })
                }

                if ("px" in value) {
                  onChange({ px: value.px, allow })
                }
              }
            }
      }
      tokens={{
        list: tokens,
        current: held,
        onPick: (name) => onChange(name === undefined ? undefined : { token: name })
      }}
      read={read}
      onCommit={onChange}
      onStep={(up, keys) => {
        if (token) {
          onChange({ token: stepThrough(tokens, token, up, keys).name })

          return
        }

        const by = { "%": keys.shift ? 2.5 : 0.5, em: keys.shift ? 0.025 : 0.005, px: keys.shift ? 2.5 : 0.5 }[unit]
        onChange(store((currentIn(value, unit) ?? 0) + (up ? by : -by), unit))
      }}
    />
  )
}
