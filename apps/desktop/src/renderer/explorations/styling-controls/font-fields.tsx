/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the font list is a combobox's listbox, its options set in each font, which a select or datalist can't draw */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  Slider,
  Toggle
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, Italic, MoveHorizontal, MoveVertical, TriangleAlert } from "lucide-react"
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { OffSystemMark } from "./color-picker.tsx"
import {
  fieldBox,
  fieldInput,
  formatNumber,
  InvalidMark,
  type Message,
  MessageLine,
  readNumber,
  scrub,
  TokenChip,
  TokenMark,
  useTyped
} from "./field-parts.tsx"
import {
  type FontFamily,
  findFont,
  genericOf,
  leadingTokens,
  moreFonts,
  projectFonts,
  type SizeToken,
  stackFamilies,
  trackingTokens,
  weightName,
  weightTokens
} from "./text-data.ts"
import { type FontValue, type LetterSpacing, type LineHeight, onStep, type WeightValue } from "./text-writes.ts"

/*
 * Text's font rows (PAR-186, design-options-values.md's Font family, Weight, and Line height and letter spacing), each
 * a field with the anatomy every field shares: the value, its unit, what it comes to, the status slot, and the token
 * chip or button.
 */

/** What a font value draws as: its first family, its stack, its token, and whether the frame can load it. */
export function resolveFont(value: FontValue | undefined, created: readonly { token: string; stack: string }[] = []) {
  if (value === undefined) return undefined
  if ("token" in value) {
    const font = projectFonts.find((each) => each.token === value.token)
    const stack = font?.stack ?? created.find((each) => each.token === value.token)?.stack ?? "sans-serif"
    return { name: font?.name ?? stackFamilies(stack)[0] ?? value.token, stack, token: value.token, missing: false }
  }
  const families = stackFamilies(value.stack)
  const first = families[0] ?? ""
  const generic = ["serif", "sans-serif", "monospace", "system-ui"].includes(first)
  return { name: first, stack: value.stack, token: undefined, missing: !generic && findFont(first) === undefined }
}

/** The project's font token nearest a stack: the one with the same generic family. */
function nearestFontToken(stack: string): FontFamily {
  const generic = genericOf(stack)
  const token = { serif: "serif", monospace: "mono", "sans-serif": "sans" }[generic]
  return projectFonts.find((font) => font.token === token) ?? projectFonts[0]!
}

interface FontOption {
  font: FontFamily
  token?: string
}

/**
 * Font family: the first family's name in its own face, with +2 when the stack has fallbacks and the stack in the
 * hint. Typing searches a list set in each font, the project's fonts first, and Up and Down move through it,
 * previewing each on the canvas; Enter takes the highlighted one, and a comma-separated stack is kept as typed. A font
 * the frame can't load is Missing, drawn in the fallback with its name struck through.
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
  const [query, setQuery] = useState<string>()
  const [highlight, setHighlight] = useState(0)
  const [message, setMessage] = useState<Message>()
  const [created, setCreated] = useState<{ token: string; stack: string }[]>([])
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const resolved = resolveFont(value, created)
  const open = query !== undefined
  const searched = (query ?? "").split(",")[0]!.trim().toLowerCase()
  const options: FontOption[] = [
    ...projectFonts.map((font) => ({ font, token: font.token })),
    ...created.map((each) => ({
      font: { name: stackFamilies(each.stack)[0] ?? each.token, stack: each.stack, weights: [400], italic: false },
      token: each.token
    })),
    ...(tokensOnly ? [] : moreFonts.map((font) => ({ font })))
  ]
  const matches = options.filter(
    (option) =>
      searched === "" ||
      option.font.name.toLowerCase().includes(searched) ||
      (option.token !== undefined && option.token.includes(searched))
  )
  const valueOf = (option: FontOption): FontValue =>
    option.token === undefined ? { stack: option.font.stack } : { token: option.token }
  // Under Tokens only, a stack of its own is refused, with the nearest font token under it.
  let refusal: Message | undefined
  if (tokensOnly && value !== undefined && "stack" in value && value.allow === undefined) {
    refusal = { tone: "error", text: `Not a token. Nearest: font-${nearestFontToken(value.stack).token}` }
  }
  const refused = refusal !== undefined
  const close = () => {
    setQuery(undefined)
    onPreview(undefined)
  }
  const choose = (option: FontOption) => {
    onChange(valueOf(option))
    setMessage(undefined)
    close()
    input.current?.blur()
  }
  const move = (by: number) => {
    if (matches.length === 0) return
    const next = (highlight + by + matches.length) % matches.length
    setHighlight(next)
    onPreview(valueOf(matches[next]!))
  }
  const commitTyped = () => {
    const text = (query ?? "").trim()
    if (text === "") {
      onChange(undefined)
      setMessage(undefined)
      close()
      return
    }
    const option = matches[highlight]
    if (!text.includes(",") && option) {
      choose(option)
      return
    }
    if (!text.includes(",")) {
      setMessage({
        tone: "error",
        text: `No font called ${text} here. Type it with a fallback, such as ${text}, sans-serif, to keep it as typed`
      })
      return
    }
    if (tokensOnly) {
      const near = nearestFontToken(text)
      setMessage({ tone: "error", text: `Not a token. Nearest: ${near.token} (${near.name})` })
      return
    }
    onChange({ stack: text })
    setMessage(undefined)
    close()
    input.current?.blur()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) setQuery("")
      else move(event.key === "ArrowDown" ? 1 : -1)
    }
    if (event.key === "Enter") commitTyped()
    if (event.key === "Escape" && open) {
      event.stopPropagation()
      close()
      setMessage(message?.tone === "error" ? { tone: "note", text: "Font is back to what it was." } : undefined)
    }
    if (event.key === "Backspace" && resolved?.token !== undefined && (query ?? "") === "") onChange(undefined)
  }
  let atRest = ""
  if (resolved !== undefined && resolved.token === undefined) atRest = resolved.name
  const fallbacks = resolved ? stackFamilies(resolved.stack).length - 1 : 0
  let placeholder = inherited.font.name
  if (mixed && value === undefined) placeholder = "Mixed"
  const error = message?.tone === "error" || refused
  let status: ReactNode
  if (message?.tone === "error") status = <InvalidMark />
  else if (resolved?.missing) {
    status = (
      <MissingFontMark
        name={resolved.name}
        fallback={genericOf(resolved.stack)}
        onReplace={(font) => onChange({ token: font.token! })}
        onAdd={() =>
          setMessage({
            tone: "note",
            text: `Put ${resolved.name}'s font files in public/fonts, and Parity adds its @font-face`
          })
        }
      />
    )
  } else if (value !== undefined && "stack" in value) {
    const near = nearestFontToken(value.stack)
    status = (
      <OffSystemMark
        compact
        label="Font"
        description={`${resolved?.name} isn't one of the project's font tokens.`}
        nearest={{ name: `font-${near.token}`, preview: <TokenMark kind="font" value={near.stack} /> }}
        allowed={value.allow}
        isTaken={(name) => projectFonts.some((font) => font.token === name) || created.some((c) => c.token === name)}
        namePlaceholder="display"
        onUse={() => onChange({ token: near.token! })}
        onCreate={(name) => {
          setCreated((current) => [...current, { token: name, stack: value.stack }])
          onChange({ token: name })
        }}
        onAllow={(allow) => onChange({ stack: value.stack, allow })}
      />
    )
  }
  const shownStack = resolved?.stack ?? inherited.font.stack
  return (
    <div className="relative">
      <Hint
        label={resolved ? `Font: ${resolved.name}` : `Font: ${inherited.font.name}, inherited from ${inherited.from}`}
        detail={resolved ? resolved.stack : `Set on ${inherited.from}. ${inherited.font.stack}`}
        hidden={open}
        wait
      >
        <label className={fieldBox(error, "pr-0.5")}>
          {resolved?.token !== undefined && (
            <TokenChip
              name={resolved.token}
              detail={resolved.name}
              preview={<TokenMark kind="font" value={resolved.stack} />}
              onRemove={() => onChange(undefined)}
            />
          )}
          <input
            ref={input}
            role="combobox"
            aria-label="Font"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-invalid={error || undefined}
            aria-activedescendant={open && matches[highlight] ? `${listId}-${highlight}` : undefined}
            value={query ?? atRest}
            placeholder={resolved?.token === undefined ? placeholder : ""}
            onFocus={(event) => {
              setQuery(resolved?.token === undefined ? (resolved?.name ?? "") : "")
              setHighlight(0)
              event.currentTarget.select()
            }}
            onBlur={() => {
              if (message?.tone !== "error") close()
            }}
            onChange={(event) => {
              setQuery(event.target.value)
              setHighlight(0)
              setMessage(undefined)
            }}
            onKeyDown={onKeyDown}
            style={{ fontFamily: open ? undefined : shownStack }}
            className={`${fieldInput} ${resolved?.missing && !open ? "text-amber-700 line-through dark:text-amber-400" : ""} ${refused ? "text-destructive" : ""}`}
          />
          {!open && fallbacks > 0 && resolved?.token === undefined && (
            <span className="shrink-0 text-muted-foreground">+{fallbacks}</span>
          )}
          {status}
        </label>
      </Hint>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Fonts"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No fonts match</p>}
          {matches.map((option, index) => {
            const first = index === 0 || (matches[index - 1]!.token === undefined) !== (option.token === undefined)
            return (
              <div key={`${option.token ?? ""}${option.font.name}`}>
                {first && (
                  <p className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">
                    {option.token === undefined ? "More fonts, added to the project when chosen" : "In the project"}
                  </p>
                )}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === highlight}
                  onPointerEnter={() => {
                    setHighlight(index)
                    onPreview(valueOf(option))
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    choose(option)
                  }}
                  className={`flex cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm ${index === highlight ? "bg-accent" : ""}`}
                >
                  <span style={{ fontFamily: option.font.stack }}>{option.font.name}</span>
                  {option.token !== undefined && (
                    <span className="font-mono text-[11px] text-muted-foreground">font-{option.token}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <MessageLine message={message ?? refusal} />
    </div>
  )
}

/** The status mark for a font the frame can't load: its menu replaces it with a project font, or adds it. */
function MissingFontMark({
  name,
  fallback,
  onReplace,
  onAdd
}: {
  name: string
  fallback: string
  onReplace: (font: FontFamily) => void
  onAdd: () => void
}) {
  return (
    <DropdownMenu>
      <Hint label="Missing font" detail={`${name} isn't in the project, so it's drawn in ${fallback}`}>
        <DropdownMenuTrigger
          aria-label={`Missing font: ${name}`}
          className="grid size-6 shrink-0 place-items-center rounded-md text-amber-600 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"
        >
          <TriangleAlert className="size-3.5" />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {name} isn&apos;t in the project, so it&apos;s drawn in {fallback}.
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">Replace font</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {projectFonts.map((font) => (
              <DropdownMenuItem key={font.name} className="text-xs" onClick={() => onReplace(font)}>
                <span style={{ fontFamily: font.stack }}>{font.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem className="text-xs" onClick={onAdd}>
          Add font
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The weight a value comes to. */
const weightOf = (value: WeightValue | undefined): number | undefined => {
  if (value === undefined) return undefined
  if ("token" in value) return weightTokens.find((token) => token.name === value.token)?.value
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
  if (font.axis) return weight >= font.axis[0] && weight <= font.axis[1] ? { kind: "face" } : { kind: "faked" }
  if (font.weights.includes(weight)) return { kind: "face" }
  // The browser synthesizes bold only when the font has no bold face; otherwise it draws the nearest face.
  if (weight >= 600 && !font.weights.some((face) => face >= 600)) return { kind: "faked" }
  const face = font.weights.reduce((best, each) => (Math.abs(each - weight) < Math.abs(best - weight) ? each : best))
  return { kind: "nearest", face }
}

/** The weight a typed or slid number is stored as: its token where one names it (600 is `semibold`). */
const weightValue = (weight: number): WeightValue => {
  const token = weightTokens.find((each) => each.value === weight)
  return token ? { token: token.name } : { value: weight }
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
  const [open, setOpen] = useState(false)
  const weight = weightOf(value)
  const shown = weight ?? inherited
  const face = weightFace(font, shown)
  const faces = font.axis ? weightTokens.map((token) => token.value as number) : font.weights
  const others = weightTokens.map((token) => token.value as number).filter((each) => !faces.includes(each))
  const number = useTyped<number>({
    label: "Weight",
    shown: String(shown),
    read: (text) => {
      const reading = readNumber(text, shown, "Weight")
      if ("reason" in reading) return { reason: reading.reason }
      if ("clear" in reading) return { reason: "Type a weight from 1 to 1000" }
      if (reading.value < 1 || reading.value > 1000) return { reason: "Weight goes from 1 to 1000" }
      return { value: Math.round(reading.value) }
    },
    onCommit: (next) => onChange(weightValue(next)),
    onStep: (up, shift) =>
      onChange(weightValue(Math.min(1000, Math.max(1, shown + (up ? 1 : -1) * (shift ? 100 : 10)))))
  })
  // Up and Down on the menu's button step through the font's weights, as a token steps through its scale.
  const step = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const at = faces.indexOf(shown)
    let index = at === -1 ? faces.findIndex((each) => each > shown) : at + (event.key === "ArrowUp" ? 1 : -1)
    if (event.shiftKey) index = event.key === "ArrowUp" ? faces.length - 1 : 0
    const next = faces[Math.min(faces.length - 1, Math.max(0, index))]
    if (next !== undefined) onChange(weightValue(next))
  }
  let label = weightName(shown)
  if (mixed && value === undefined) label = "Mixed"
  let faceNote: string | undefined
  if (face.kind === "faked") faceNote = `Faked by the browser: ${font.name} has no face this heavy`
  if (face.kind === "nearest") faceNote = `Drawn with ${weightName(face.face)}, the nearest face ${font.name} has`
  const tokenName = weight === undefined ? undefined : weightTokens.find((token) => token.value === weight)?.name
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
      <span style={{ fontFamily: font.stack, fontWeight: each }}>{weightName(each)}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{faked ? `${each}, faked` : each}</span>
    </button>
  )
  return (
    <div>
      <div className="flex items-center gap-1">
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) onPreview(undefined)
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
              <div className="flex flex-col gap-2 border-b px-2 pt-1.5 pb-2.5">
                <p className="text-[11px] text-muted-foreground">
                  {font.name} is variable: any weight from {font.axis[0]} to {font.axis[1]}
                </p>
                <div className="flex items-center gap-2">
                  <Slider
                    aria-label="Weight axis"
                    min={font.axis[0]}
                    max={font.axis[1]}
                    step={1}
                    value={shown}
                    onValueChange={(next) => onChange(weightValue(Array.isArray(next) ? next[0]! : next))}
                    className="flex-1"
                  />
                  <label className={fieldBox(number.error, "w-16 shrink-0")}>
                    <input aria-label="Weight" {...number.input} className={fieldInput} />
                  </label>
                </div>
                <MessageLine message={number.message} />
              </div>
            )}
            <p className="px-2 pt-1 text-[11px] font-medium text-muted-foreground">In {font.name}</p>
            {faces.map((each) => item(each, false))}
            {others.length > 0 && (
              <>
                <p className="mt-1 border-t px-2 pt-1.5 text-[11px] font-medium text-muted-foreground">
                  Not in {font.name}
                </p>
                {others.map((each) => item(each, weightFace(font, each).kind === "faked"))}
              </>
            )}
          </PopoverContent>
        </Popover>
        {value !== undefined && "value" in value && (
          <OffSystemMark
            compact
            label="Weight"
            description={`${value.value} isn't one of the font-weight tokens.`}
            nearest={{ name: `font-${nearestWeightToken(value.value).name}` }}
            allowed={value.allow}
            isTaken={(name) => weightTokens.some((token) => token.name === name)}
            namePlaceholder="heading"
            onUse={() => onChange({ token: nearestWeightToken(value.value).name })}
            onCreate={(name) => onChange({ token: name })}
            onAllow={(allow) => onChange({ value: value.value, allow })}
          />
        )}
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
      {face.kind === "faked" && (
        <MessageLine message={{ tone: "note", text: `Faked by the browser: ${font.name} has no face this heavy` }} />
      )}
    </div>
  )
}

const nearestWeightToken = (weight: number) =>
  weightTokens.reduce((best, token) => (Math.abs(token.value - weight) < Math.abs(best.value - weight) ? token : best))

/** The unit a line height is shown and typed in. */
type LineUnit = "×" | "px" | "%"

/** What a unit typed after a line height means; em is a multiple, as CSS's line height reads it. */
const typedUnits: Record<string, LineUnit | "em"> = { px: "px", x: "×", "×": "×", "%": "%", em: "em" }

/** The multiple a line height comes to at a font size. */
function multipleOf(lineHeight: LineHeight, fontSize: number): number {
  if ("keyword" in lineHeight) return 1.2
  if ("token" in lineHeight) return leadingTokens.find((token) => token.name === lineHeight.token)?.value ?? 1.5
  if ("multiple" in lineHeight) return lineHeight.multiple
  return lineHeight.px / fontSize
}

const unitOf = (lineHeight: LineHeight | undefined): LineUnit => {
  if (lineHeight !== undefined && "px" in lineHeight) return "px"
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
  const [unit, setUnit] = useState<LineUnit>(() => unitOf(value))
  const currentIn = (lineHeight: LineHeight | undefined, inUnit: LineUnit): number | undefined => {
    if (lineHeight === undefined) return undefined
    const multiple = multipleOf(lineHeight, fontSize)
    if (inUnit === "px") return "px" in lineHeight ? lineHeight.px : Math.round(multiple * fontSize * 100) / 100
    return inUnit === "%" ? multiple * 100 : multiple
  }
  let shown = ""
  if (value !== undefined && "keyword" in value) shown = "Auto"
  else if (value !== undefined && !("token" in value)) shown = formatNumber(currentIn(value, unit) ?? 0)
  const fromPx = (px: number): LineHeight => ({ px: Math.round(px * 100) / 100 })
  const read = (text: string): { value: LineHeight | undefined; message?: Message } | { reason: string } => {
    const trimmed = text.trim().toLowerCase()
    if (trimmed === "") return { value: undefined }
    if (trimmed === "auto" || trimmed === "normal") return { value: { keyword: "normal" } }
    const name = trimmed.replace(/^leading-/, "")
    if (leadingTokens.some((token) => token.name === name)) return { value: { token: name } }
    const step = /^spacing-(\d*\.?\d+)$/.exec(trimmed)?.[1]
    if (step !== undefined) return { value: fromPx(Number(step) * 4) }
    let typedUnit: LineUnit | "em" = unit
    let number = trimmed
    const suffix = /(px|x|×|%|em)$/.exec(trimmed)?.[1]
    if (suffix !== undefined) {
      number = trimmed.slice(0, -suffix.length)
      typedUnit = typedUnits[suffix] ?? unit
    }
    const reading = readNumber(number, currentIn(value, typedUnit === "em" ? "×" : typedUnit), "Line height")
    if ("reason" in reading) return { reason: `Line height takes a multiple (1.5), pixels (24px), a % or Auto` }
    if ("clear" in reading) return { value: undefined }
    if (reading.value < 0) return { reason: "Line height can't be negative" }
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
                typed.setMessage(undefined)
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
              typed.setMessage(undefined)
            }
          }
        }
      }
    }
    return { value: { multiple } }
  }
  const stepBy = (up: boolean, shift: boolean) => {
    if (value !== undefined && "token" in value) {
      const at = leadingTokens.findIndex((token) => token.name === value.token)
      let index = at + (up ? 1 : -1)
      if (shift) index = up ? leadingTokens.length - 1 : 0
      const next = leadingTokens[Math.min(leadingTokens.length - 1, Math.max(0, index))]!
      onChange({ token: next.name })
      return
    }
    const sign = up ? 1 : -1
    if (unit === "px") {
      const from = currentIn(value, "px") ?? size?.lineHeight ?? fontSize * 1.5
      onChange(fromPx(Math.max(0, Math.round(from) + sign * (shift ? 10 : 1))))
      return
    }
    const from = currentIn(value, "×") ?? (size ? size.lineHeight / size.px : 1.5)
    onChange({ multiple: Math.max(0, Math.round((from + sign * (shift ? 0.25 : 0.05)) * 1000) / 1000) })
  }
  const typed = useTyped<LineHeight | undefined>({
    label: "Line height",
    shown,
    read,
    onCommit: (next) => {
      if (next !== undefined && "px" in next) setUnit("px")
      else if (next !== undefined && "multiple" in next && unit === "px") setUnit("×")
      onChange(next)
    },
    onStep: stepBy
  })
  const token =
    value !== undefined && "token" in value ? leadingTokens.find((each) => each.name === value.token) : undefined
  let placeholder = "Auto"
  let after: ReactNode
  if (mixed && value === undefined) placeholder = "Mixed"
  else if (value === undefined && size) {
    placeholder = unit === "px" ? String(size.lineHeight) : formatNumber(size.lineHeight / size.px)
    after = <span className="shrink-0 text-[11px] text-muted-foreground">From size</span>
  }
  // A multiple, or pixels off the spacing steps, is a value of its own, marked; whole pixels are a step.
  let own: { multiple: number } | { px: number; allow?: string } | undefined
  if (value !== undefined && "multiple" in value) own = value
  if (value !== undefined && "px" in value && !onStep(value.px)) own = value
  const multiple = multipleOf(value ?? { multiple: 1.5 }, fontSize)
  const nearest = leadingTokens.reduce((best, each) =>
    Math.abs(each.value - multiple) < Math.abs(best.value - multiple) ? each : best
  )
  return (
    <div>
      <label className={fieldBox(typed.error, "pr-0.5")}>
        <span
          onPointerDown={scrub(
            () => currentIn(value, unit) ?? (unit === "px" ? (size?.lineHeight ?? 24) : 1.5),
            (next) => onChange(unit === "px" ? fromPx(Math.max(0, next)) : { multiple: Math.max(0, next) }),
            unit === "px" ? { step: 1, shiftStep: 10, min: 0 } : { step: 0.05, shiftStep: 0.25, min: 0 }
          )}
          className="shrink-0 cursor-ew-resize touch-none text-muted-foreground select-none"
        >
          <MoveVertical aria-hidden className="size-3.5" />
        </span>
        {token && (
          <TokenChip
            name={token.name}
            detail={`${formatNumber(token.value)}×`}
            preview={<TokenMark kind="leading" value={String(token.value)} />}
            onRemove={() => onChange(undefined)}
          />
        )}
        <input
          aria-label="Line height"
          inputMode="decimal"
          placeholder={token ? "" : placeholder}
          {...typed.input}
          onKeyDown={(event) => {
            if (token && event.currentTarget.value === "" && event.key === "Backspace") onChange(undefined)
            typed.input.onKeyDown(event)
          }}
          className={fieldInput}
        />
        {!typed.focused && after}
        {typed.error && <InvalidMark />}
        {!typed.error && own !== undefined && (
          <OffSystemMark
            compact
            label="Line height"
            description={`${shown}${unit === "px" ? "px" : "×"} isn't a leading token or a spacing step.`}
            nearest={{ name: `leading-${nearest.name}` }}
            allowed={"px" in own ? own.allow : undefined}
            isTaken={(name) => leadingTokens.some((each) => each.name === name)}
            namePlaceholder="body"
            onUse={() => onChange({ token: nearest.name })}
            onCreate={(name) => onChange({ token: name })}
            onAllow={(allow) => {
              // A multiple is a value in CSS's own terms; pixels off the steps keep why they're allowed here.
              if ("px" in own) onChange({ px: own.px, allow })
            }}
          />
        )}
        {!token && !(value !== undefined && "keyword" in value) && (
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
              if (value === undefined) return
              if (next === "px") onChange(fromPx(currentIn(value, "px") ?? 0))
              else onChange({ multiple: currentIn(value, "×") ?? 1.5 })
            }}
          />
        )}
      </label>
      <MessageLine message={typed.message} />
    </div>
  )
}

/** A field's unit, a button that opens its unit menu (the field's slot 3). */
function UnitMenu<T extends string>({
  label,
  unit,
  units,
  extra,
  onUnit
}: {
  label: string
  unit: T
  units: { unit: T; label: string }[]
  extra?: { label: string; run: () => void }
  onUnit: (unit: T) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label} unit: ${unit}`}
        className="h-full shrink-0 rounded-r-md px-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {unit}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup value={unit} onValueChange={(next) => onUnit(next as T)}>
          {units.map((each) => (
            <DropdownMenuRadioItem key={each.unit} value={each.unit} className="text-xs">
              <span className="w-5 font-mono">{each.unit}</span>
              {each.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {extra && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onClick={extra.run}>
              {extra.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type SpacingUnit = "%" | "em" | "px"

/** Letter spacing in em: a token's, a value's, or pixels at the font size. */
function emOf(spacing: LetterSpacing, fontSize: number): number {
  if ("token" in spacing) return trackingTokens.find((token) => token.name === spacing.token)?.em ?? 0
  if ("em" in spacing) return spacing.em
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
  const [unit, setUnit] = useState<SpacingUnit>(() => (value !== undefined && "px" in value ? "px" : "%"))
  const currentIn = (spacing: LetterSpacing | undefined, inUnit: SpacingUnit): number | undefined => {
    if (spacing === undefined) return undefined
    if (inUnit === "px")
      return "px" in spacing ? spacing.px : Math.round(emOf(spacing, fontSize) * fontSize * 100) / 100
    const em = emOf(spacing, fontSize)
    return inUnit === "%" ? Math.round(em * 100_000) / 1000 : em
  }
  const token =
    value !== undefined && "token" in value ? trackingTokens.find((each) => each.name === value.token) : undefined
  const shown = value === undefined || token ? "" : formatNumber(currentIn(value, unit) ?? 0)
  const store = (number: number, inUnit: SpacingUnit): LetterSpacing => {
    if (inUnit === "px") return { px: Math.round(number * 100) / 100 }
    return { em: Math.round((inUnit === "%" ? number / 100 : number) * 10_000) / 10_000 }
  }
  const typed = useTyped<LetterSpacing | undefined>({
    label: "Letter spacing",
    shown,
    read: (text) => {
      const trimmed = text.trim().toLowerCase()
      if (trimmed === "") return { value: undefined }
      const name = trimmed.replace(/^tracking-/, "")
      if (trackingTokens.some((each) => each.name === name)) return { value: { token: name } }
      let typedUnit = unit
      let number = trimmed
      const suffix = /(px|%|em)$/.exec(trimmed)?.[1] as SpacingUnit | undefined
      if (suffix !== undefined) {
        number = trimmed.slice(0, -suffix.length)
        typedUnit = suffix
      }
      const reading = readNumber(number.replaceAll("−", "-"), currentIn(value, typedUnit), "Letter spacing")
      if ("reason" in reading)
        return { reason: "Letter spacing takes a % of the font size, em, px or a tracking token" }
      if ("clear" in reading) return { value: undefined }
      if (typedUnit === "px") setUnit("px")
      else if (unit === "px") setUnit(typedUnit)
      return { value: store(reading.value, typedUnit) }
    },
    onCommit: onChange,
    onStep: (up, shift) => {
      if (token) {
        const at = trackingTokens.findIndex((each) => each.name === token.name)
        let index = at + (up ? 1 : -1)
        if (shift) index = up ? trackingTokens.length - 1 : 0
        onChange({ token: trackingTokens[Math.min(trackingTokens.length - 1, Math.max(0, index))]!.name })
        return
      }
      const by = { "%": shift ? 2.5 : 0.5, em: shift ? 0.025 : 0.005, px: shift ? 2.5 : 0.5 }[unit]
      onChange(store((currentIn(value, unit) ?? 0) + (up ? by : -by), unit))
    }
  })
  const em = value === undefined ? 0 : emOf(value, fontSize)
  const nearest = trackingTokens.reduce((best, each) => (Math.abs(each.em - em) < Math.abs(best.em - em) ? each : best))
  return (
    <div>
      <label className={fieldBox(typed.error, "pr-0.5")}>
        <span
          onPointerDown={scrub(
            () => currentIn(value, unit) ?? 0,
            (next) => onChange(store(next, unit)),
            unit === "em" ? { step: 0.005, shiftStep: 0.025 } : { step: 0.5, shiftStep: 2.5 }
          )}
          className="shrink-0 cursor-ew-resize touch-none text-muted-foreground select-none"
        >
          <MoveHorizontal aria-hidden className="size-3.5" />
        </span>
        {token && (
          <TokenChip
            name={token.name}
            detail={`${signed(token.em * 100)}%`}
            preview={<TokenMark kind="tracking" value={`${token.em}em`} />}
            onRemove={() => onChange(undefined)}
          />
        )}
        <input
          aria-label="Letter spacing"
          inputMode="decimal"
          placeholder={token ? "" : (mixed && value === undefined && "Mixed") || "0"}
          {...typed.input}
          onKeyDown={(event) => {
            if (token && event.currentTarget.value === "" && event.key === "Backspace") onChange(undefined)
            typed.input.onKeyDown(event)
          }}
          className={fieldInput}
        />
        {typed.error && <InvalidMark />}
        {!typed.error && value !== undefined && !token && (
          <OffSystemMark
            compact
            label="Letter spacing"
            description={`${shown}${unit} isn't a tracking token.`}
            nearest={{ name: `tracking-${nearest.name}` }}
            allowed={"token" in value ? undefined : value.allow}
            isTaken={(name) => trackingTokens.some((each) => each.name === name)}
            namePlaceholder="caps"
            onUse={() => onChange({ token: nearest.name })}
            onCreate={(name) => onChange({ token: name })}
            onAllow={(allow) => {
              if ("em" in value) onChange({ em: value.em, allow })
              if ("px" in value) onChange({ px: value.px, allow })
            }}
          />
        )}
        {!token && (
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
              if (value !== undefined) onChange(store(currentIn(value, next) ?? 0, next))
            }}
          />
        )}
      </label>
      <MessageLine message={typed.message} />
    </div>
  )
}
