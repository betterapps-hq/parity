import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { scrubSteps } from "@parity-app/core"
import {
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  CircleAlert,
  Hexagon,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Scan,
  Square,
  SquareDashed,
  SquareSplitHorizontal,
  TriangleAlert,
  X
} from "lucide-react"
import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef, useState } from "react"
import { Field } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { OffSystemMark } from "./field-parts.tsx"
import {
  onStep,
  readSide,
  shownNumber,
  type Side,
  type SideRules,
  type Sides,
  sideNumber,
  stepSide
} from "./sides-writes.ts"
import { lengthToken } from "./tokens.ts"

/*
 * The Four sides field (PAR-652's Four sides type) and the one-side field it's made of, shared by Padding, Margin,
 * Stroke's width, the box-model widget, the pin box's insets and Layer order.
 */

/** Which sides an edit reaches: the one typed in, the opposite one too (Alt), or all four (Alt+Shift), as Figma's. */
export type Spread = "side" | "opposite" | "all"

const spreadOf = (event: { altKey: boolean; shiftKey: boolean }): Spread => {
  if (!event.altKey) return "side"
  return event.shiftKey ? "all" : "opposite"
}

export interface FieldMessage {
  tone: "error" | "note"
  text: string
}

/**
 * Dragging a side's letter scrubs it: one whole spacing step per 2 screen pixels, or a pixel or one per screen pixel;
 * Shift goes ten times as far. Alt scrubs the opposite side too, and Alt+Shift all four.
 */
function scrubSide(
  from: () => number,
  apply: (value: number, spread: Spread) => void,
  rules: SideRules
): (event: ReactPointerEvent<HTMLElement>) => void {
  return (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const start = from()
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX
      const spread = spreadOf(moveEvent)
      // With Alt, Shift means all four sides rather than ten times as far.
      const further = moveEvent.shiftKey && !moveEvent.altKey
      const by = rules.stepBy === "spacing" ? scrubSteps(dx, further) * 4 : Math.trunc(dx) * (further ? 10 : 1)
      const next = start + by
      apply(rules.negatives ? next : Math.max(0, next), spread)
    }
    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }
}

/**
 * One side, or any one value of a side's kind: a number in the field's unit, a percentage, a token as a chip, or Auto
 * in words with what it comes to. It types like the app's fields (maths, units, `spacing-4`, a token's name), and
 * shorthand typed into it (`8 16`) fills every side. A number off the steps carries the hollow mark. Narrow, the unit
 * shows on hover and the status mark takes its place; what it comes to is in its hint.
 */
export function SideInput({
  label,
  inner,
  rules,
  value,
  mixed = false,
  placeholder = "0",
  measured,
  narrow = false,
  bare = false,
  tokensOnly = false,
  percentOf,
  onChange,
  onShorthand,
  onMessage
}: {
  /** The accessible name, which says which side: Top padding. */
  label: string
  /** A short label inside, which scrubs: T, or an icon. */
  inner?: ReactNode
  rules: SideRules
  value: Side
  mixed?: boolean
  /** What unset comes to, muted: 0, or Auto 24 for an unpinned inset. */
  placeholder?: string
  /** What Auto or unset comes to on the layer, measured, for its hint and for stepping from it. */
  measured?: number
  narrow?: boolean
  /** Borderless until hovered or focused, as the box-model widget's sides are. */
  bare?: boolean
  tokensOnly?: boolean
  /** What a percentage is of, for its hint: Pricing's height. */
  percentOf?: string
  onChange: (value: Side, spread: Spread) => void
  /** Shorthand typed into this side, filling every side in CSS's order. */
  onShorthand?: (sides: Sides) => void
  /** Says things somewhere else than under the field, as the box-model widget does under itself. */
  onMessage?: (message: FieldMessage | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState<string>()
  const [focused, setFocused] = useState(false)
  const [ownMessage, setOwnMessage] = useState<FieldMessage>()
  const input = useRef<HTMLInputElement>(null)
  const message = ownMessage
  const setMessage = (next: FieldMessage | undefined) => {
    setOwnMessage(next)
    onMessage?.(next)
  }
  const error = message?.tone === "error"
  const token =
    typeof value === "object" && "token" in value ? rules.tokens.find((other) => other.name === value.token) : undefined
  const tokenName = typeof value === "object" && "token" in value ? value.token : undefined
  const missing = tokenName !== undefined && token === undefined
  const own = typeof value === "object" && "number" in value ? value : undefined
  const percent = typeof value === "object" && "percent" in value ? value.percent : undefined
  const offSystem = own !== undefined && !onStep(own.number)
  const refused = offSystem && tokensOnly && own.allow === undefined
  const nearestStep = own === undefined ? 0 : Math.round(own.number)

  let current = "unset"
  if (value === "auto") current = measured === undefined ? "auto" : `auto, ${measured}${rules.unit ?? ""}`
  else if (tokenName) current = tokenName
  else if (own) current = `${shownNumber(own.number)}${rules.unit ?? ""}`
  else if (percent !== undefined) current = `${percent}%`

  let shown = ""
  if (value === "auto") shown = "Auto"
  else if (own) shown = shownNumber(own.number)
  else if (percent !== undefined) shown = String(percent)

  const commit = (leaving: boolean): boolean => {
    if (typed === undefined) return true
    const reading = readSide(typed, label, rules, value)
    if ("reason" in reading) {
      if (!leaving) {
        setMessage({ tone: "error", text: reading.reason })
        return false
      }
      setMessage({ tone: "note", text: `${label} is back to ${current}. ${reading.reason}.` })
    } else if ("shorthand" in reading) {
      if (onShorthand) onShorthand(reading.shorthand)
      else onChange(reading.shorthand[0], "side")
      setMessage(undefined)
    } else {
      onChange(reading.side, "side")
      setMessage(undefined)
    }
    setTyped(undefined)
    return true
  }
  const step = (up: boolean, event: { shiftKey: boolean; altKey: boolean }) => {
    setTyped(undefined)
    setMessage(undefined)
    // With Alt, Shift means all four sides rather than ten steps.
    onChange(stepSide(value, rules, up, event.shiftKey && !event.altKey, measured), spreadOf(event))
  }
  const scrub = scrubSide(
    () => sideNumber(value, rules) ?? measured ?? 0,
    (number, spread) => onChange({ number }, spread),
    rules
  )

  // A narrow field's hint carries what the value comes to and its status, which have no room in it.
  let detail: string | undefined
  if (error) detail = message.text
  else if (token?.deprecated) detail = `${token.px}${rules.unit ?? ""}. Deprecated: use ${token.deprecated} instead`
  else if (token) detail = `${token.px}${rules.unit ?? ""}`
  else if (missing) detail = "Missing: the project has no token by this name now"
  else if (own?.allow !== undefined) detail = `Allowed here: ${own.allow}`
  else if (offSystem) detail = `Not a step. Nearest: ${nearestStep}${rules.unit ?? ""}`
  else if (percent !== undefined && percentOf)
    detail = `${percent}% of ${percentOf}${measured === undefined ? "" : `, ${shownNumber(measured)}px here`}`
  else if (mixed && value === undefined) detail = "Mixed: the selected layers differ"
  else if (value === "auto" && measured !== undefined) detail = `Comes to ${measured}${rules.unit ?? ""} here`

  const showChip = tokenName !== undefined && typed === undefined
  let fieldPlaceholder = mixed ? "Mixed" : placeholder
  if (showChip) fieldPlaceholder = ""
  const unit = percent === undefined ? rules.unit : "%"

  let status: ReactNode
  if (error) status = <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />
  else if (own && offSystem && !focused)
    status = (
      <OffSystemMark
        label={label}
        compact
        description={`${shownNumber(own.number)}px isn't one of the project's steps or tokens.`}
        nearest={{ name: `${nearestStep}px` }}
        allowed={own.allow}
        isTaken={(name) => rules.tokens.some((other) => other.name === rules.namespace + name)}
        namePlaceholder="gutter"
        onUse={() => onChange({ number: nearestStep }, "side")}
        onCreate={(name) => {
          // A token of the set's kind; phase B adds it through useTokens rather than to the shared set.
          rules.tokens.push(lengthToken(rules.tokens[0]?.kind ?? "spacing", rules.namespace + name, own.number))
          onChange({ token: rules.namespace + name }, "side")
        }}
        onAllow={(reason) =>
          onChange(reason === undefined ? { number: own.number } : { ...own, allow: reason }, "side")
        }
      />
    )

  let after: ReactNode
  if (value === "auto" && measured !== undefined && !narrow && !focused)
    after = <span className="shrink-0 text-muted-foreground/70 tabular-nums">{measured}</span>
  else if (showChip && token && !narrow && !focused)
    after = <span className="shrink-0 text-muted-foreground/70 tabular-nums">{token.px}</span>
  else if ((own || percent !== undefined) && !focused && unit)
    after = (
      // In a narrow field the status mark takes the unit's place, and the unit shows on hover.
      <span className={`shrink-0 text-muted-foreground ${narrow ? "hidden group-hover/side:inline" : ""}`}>{unit}</span>
    )

  const frame = bare
    ? "h-6 border-transparent hover:border-input focus-within:border-input"
    : "h-7 border-input dark:bg-input/30"
  const list = (
    <PopoverContent className="w-48 gap-0 p-1" align="start">
      {[{ name: undefined, px: 0, deprecated: undefined }, ...rules.tokens].map((option) => (
        <button
          key={option.name ?? "none"}
          type="button"
          onClick={() => {
            onChange(option.name === undefined ? undefined : { token: option.name }, "side")
            setMessage(undefined)
            setOpen(false)
          }}
          className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent ${option.name === tokenName ? "bg-accent" : ""}`}
        >
          <span className={`min-w-0 flex-1 truncate font-mono ${option.name ? "" : "text-muted-foreground"}`}>
            {option.name ?? "None"}
          </span>
          {option.deprecated && <TriangleAlert aria-label="Deprecated" className="size-3 shrink-0 text-amber-500" />}
          <span className="text-muted-foreground tabular-nums">
            {option.name ? `${option.px}${rules.unit ?? ""}` : ""}
          </span>
        </button>
      ))}
    </PopoverContent>
  )
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Hint
          label={narrow ? `${label}: ${current}` : undefined}
          detail={narrow ? detail : undefined}
          hidden={open}
          wait
        >
          <div
            className={`group/side flex min-w-0 items-center gap-1 rounded-md border bg-transparent pl-1.5 text-xs focus-within:ring-2 ${frame} ${error || refused ? "border-destructive focus-within:ring-destructive/40" : "focus-within:ring-ring"} ${bare ? "justify-center pr-1" : ""}`}
          >
            {inner && (
              <span
                onPointerDown={scrub}
                className="flex shrink-0 cursor-ew-resize touch-none items-center text-muted-foreground select-none [&_svg]:size-3.5"
              >
                {inner}
              </span>
            )}
            {showChip && (
              // The chip: clicking it opens the tokens, and its × takes the token off.
              <span className="flex min-w-0 shrink items-center rounded-sm bg-accent">
                <PopoverTrigger
                  aria-label={`${label}: ${tokenName}${missing ? ", missing" : ""}`}
                  onKeyDown={(event) => {
                    if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey) {
                      event.preventDefault()
                      setTyped(event.key)
                      input.current?.focus()
                    } else if (event.key === "Backspace" || event.key === "Delete") {
                      event.preventDefault()
                      onChange(undefined, "side")
                      input.current?.focus()
                    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                      event.preventDefault()
                      step(event.key === "ArrowUp", event)
                    }
                  }}
                  className="flex min-w-0 items-center rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={`truncate font-mono ${missing ? "text-amber-600 line-through" : ""}`}>
                    {tokenName.replace(rules.namespace, "")}
                  </span>
                </PopoverTrigger>
                {token?.deprecated && (
                  <Hint label={`${token.name} is deprecated`} detail={`Use ${token.deprecated} instead`}>
                    <button
                      type="button"
                      aria-label={`${token.name} is deprecated. Use ${token.deprecated} instead`}
                      onClick={() => onChange({ token: token.deprecated! }, "side")}
                      className="grid size-4 shrink-0 place-items-center rounded-sm text-amber-500 outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <TriangleAlert className="size-3" />
                    </button>
                  </Hint>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${tokenName} from ${label}`}
                  onClick={() => {
                    onChange(undefined, "side")
                    input.current?.focus()
                  }}
                  className="mr-0.5 hidden size-4 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none group-hover/side:grid hover:bg-background/60 hover:text-foreground focus-visible:grid focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            <input
              ref={input}
              aria-label={label}
              aria-invalid={error || refused || undefined}
              inputMode="decimal"
              placeholder={fieldPlaceholder}
              value={typed ?? shown}
              onFocus={(event) => {
                setFocused(true)
                if (message?.tone === "note") setMessage(undefined)
                // Auto in words becomes the keyword to type over.
                if (value === "auto") {
                  setTyped("auto")
                  const target = event.currentTarget
                  requestAnimationFrame(() => target.select())
                }
              }}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (showChip && event.currentTarget.value === "" && ["Backspace", "Delete"].includes(event.key)) {
                  event.preventDefault()
                  onChange(undefined, "side")
                }
                if (event.key === "Enter" && commit(false)) event.currentTarget.blur()
                if (event.key === "Escape" && typed !== undefined) {
                  setTyped(undefined)
                  setMessage(error ? { tone: "note", text: `${label} is back to ${current}.` } : undefined)
                }
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault()
                  step(event.key === "ArrowUp", event)
                }
              }}
              onBlur={() => {
                setFocused(false)
                commit(true)
              }}
              className={`w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground ${showChip ? "min-w-1" : "min-w-4"} ${bare ? "text-center" : ""} ${refused ? "text-destructive" : ""}`}
            />
            {after}
            {status}
            {!showChip && !error && !bare && (
              // The token button, for a field holding no token: on hover or focus, as Figma's variable button shows.
              <Hint label={`Choose a ${rules.noun} token`}>
                <PopoverTrigger
                  aria-label={`${label} tokens`}
                  className="hidden size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none group-focus-within/side:grid group-hover/side:grid hover:bg-accent hover:text-foreground focus-visible:grid focus-visible:ring-2 focus-visible:ring-ring data-popup-open:grid data-popup-open:bg-accent"
                >
                  <Hexagon className="size-3.5" />
                </PopoverTrigger>
              </Hint>
            )}
            {(showChip || error || bare) && <span className="w-0.5 shrink-0" />}
          </div>
        </Hint>
        {list}
      </Popover>
      {message && !onMessage && <FieldLine message={message} />}
      {!message && refused && !onMessage && (
        <p role="alert" className="col-span-full text-[11px] leading-snug text-destructive">
          Not a step. Nearest: {nearestStep}px
        </p>
      )}
    </>
  )
}

/** What a field says, under the whole row of fields it sits in. */
export function FieldLine({ message }: { message: FieldMessage }) {
  const error = message.tone === "error"
  return (
    <p
      role={error ? "alert" : "status"}
      className={`col-span-full text-[11px] leading-snug ${error ? "text-destructive" : "text-muted-foreground"}`}
    >
      {message.text}
    </p>
  )
}

/** How four sides lay out: one field, vertical and horizontal, one side alone, or all four. */
type SidesForm = "one" | "two" | "top" | "right" | "bottom" | "left" | "four"

const sideNames = ["Top", "Right", "Bottom", "Left"] as const
const singleForms = ["top", "right", "bottom", "left"] as const

const formOptions = [
  { value: "one", label: "All", Icon: Square },
  { value: "two", label: "Vertical and horizontal", Icon: SquareSplitHorizontal },
  { value: "top", label: "Top", Icon: PanelTop },
  { value: "bottom", label: "Bottom", Icon: PanelBottom },
  { value: "left", label: "Left", Icon: PanelLeft },
  { value: "right", label: "Right", Icon: PanelRight },
  { value: "four", label: "Custom", Icon: SquareDashed }
] as const satisfies readonly { value: SidesForm; label: string; Icon: unknown }[]

const same = (a: Side, b: Side) => JSON.stringify(a) === JSON.stringify(b)

/** Whether a form can show the sides as they are. */
function holds(form: SidesForm, sides: Sides): boolean {
  if (form === "four") return true
  if (form === "one") return sides.every((side) => same(side, sides[0]))
  if (form === "two") return same(sides[0], sides[2]) && same(sides[1], sides[3])
  const index = singleForms.indexOf(form)
  return sides.every((side, other) => other === index || side === undefined)
}

/**
 * The shortest form that holds the sides: one field when they all match, two when the pairs do, one side alone when
 * only it's set, four otherwise. Padding on a layout shows at least two.
 */
function shortestForm(sides: Sides, mixed: readonly boolean[] = [], atLeastTwo = false): SidesForm {
  const known = !mixed.some(Boolean)
  if (known && holds("one", sides)) return atLeastTwo ? "two" : "one"
  const alone = sides.filter((side) => side !== undefined).length === 1
  if (known && alone && !atLeastTwo) return singleForms[sides.findIndex((side) => side !== undefined)]!
  const pairsMixedAlike = Boolean(mixed[0]) === Boolean(mixed[2]) && Boolean(mixed[1]) === Boolean(mixed[3])
  if (holds("two", sides) && pairsMixedAlike) return "two"
  return "four"
}

/** The sides for a form chosen from the menu, from the value the fields show now. */
function sidesFor(form: SidesForm, sides: Sides): Sides {
  const first = sides.find((side) => side !== undefined)
  if (form === "one") return [first, first, first, first]
  if (form === "two") {
    const vertical = sides[0] ?? sides[2]
    const horizontal = sides[1] ?? sides[3]
    return [vertical, horizontal, vertical, horizontal]
  }
  if (form === "four") return sides
  const index = singleForms.indexOf(form)
  return sides.map((_, other) => (other === index ? (sides[index] ?? first) : undefined)) as Sides
}

/** The sides an edit to some of them reaches, as Spread says. */
function spreadTo(indexes: number[], spread: Spread): number[] {
  if (spread === "all") return [0, 1, 2, 3]
  if (spread === "opposite") return [...new Set(indexes.flatMap((index) => [index, (index + 2) % 4]))]
  return indexes
}

/**
 * Four sides, laid out in the shortest form that holds them when the layer is selected, never while editing: one
 * field, vertical and horizontal, one side alone, or four in CSS's order. The button after them switches forms, as
 * Figma's does. Mixed is per side. Hovering a field reports the sides it covers, for the canvas to highlight.
 */
export function FourSidesField({
  label,
  rules,
  sides,
  mixed = [],
  atLeastTwo = false,
  placeholders,
  measured,
  hint,
  doesNothing,
  tokensOnly,
  startForm,
  customView,
  onChange,
  onHover
}: {
  /** The row's label: Padding, Margin, Width. */
  label: string
  rules: SideRules
  sides: Sides
  mixed?: readonly boolean[]
  /** Padding on a layout shows at least two fields, as Figma's does. */
  atLeastTwo?: boolean
  /** Each side's unset placeholder, as measured. */
  placeholders?: readonly string[]
  /** What each side comes to on the layer, for Auto and for stepping from unset. */
  measured?: readonly (number | undefined)[]
  hint?: string
  /** Why the row does nothing here, which dims it. */
  doesNothing?: string
  tokensOnly?: boolean
  /** The form to open in, where a story starts on Custom; otherwise the shortest that holds the sides. */
  startForm?: SidesForm
  /** Shown in place of the four fields for Custom, as Padding opens the box-model widget. */
  customView?: ReactNode
  onChange: (sides: Sides, cleared: number[]) => void
  onHover?: (sides: number[] | undefined) => void
}) {
  const [form, setForm] = useState<SidesForm>(() => startForm ?? shortestForm(sides, mixed, atLeastTwo))
  const noun = label.toLowerCase()
  const update = (indexes: number[], value: Side, spread: Spread) => {
    const reached = spreadTo(indexes, spread)
    const next = sides.map((side, index) => (reached.includes(index) ? value : side)) as Sides
    // The form changes under the pointer only when it can't show what's set now.
    if (!holds(form, next)) setForm(shortestForm(next, [], atLeastTwo))
    onChange(next, reached)
  }
  const shorthand = (next: Sides) => {
    if (!holds(form, next)) setForm(shortestForm(next, [], atLeastTwo))
    onChange(next, [0, 1, 2, 3])
  }
  const field = (indexes: number[], fieldLabel: string, inner: ReactNode, narrow: boolean) => {
    const value = indexes.every((index) => same(sides[index], sides[indexes[0]!])) ? sides[indexes[0]!] : undefined
    const isMixed = indexes.some((index) => mixed[index])
    return (
      <div
        key={fieldLabel}
        className="min-w-0"
        onPointerEnter={() => onHover?.(indexes)}
        onPointerLeave={() => onHover?.(undefined)}
      >
        <SideInput
          label={fieldLabel}
          inner={inner}
          rules={rules}
          value={value}
          mixed={isMixed}
          narrow={narrow}
          tokensOnly={tokensOnly}
          placeholder={placeholders?.[indexes[0]!] ?? "0"}
          measured={measured?.[indexes[0]!]}
          onChange={(next, spread) => update(indexes, next, spread)}
          onShorthand={shorthand}
        />
      </div>
    )
  }
  let fields: ReactNode
  if (form === "one") fields = field([0, 1, 2, 3], label, <Scan />, false)
  else if (form === "two")
    fields = [
      field([0, 2], `Vertical ${noun}`, <AlignVerticalSpaceAround />, true),
      field([1, 3], `Horizontal ${noun}`, <AlignHorizontalSpaceAround />, true)
    ]
  else if (form === "four") fields = sideNames.map((side, index) => field([index], `${side} ${noun}`, side[0], true))
  else {
    const index = singleForms.indexOf(form)
    fields = field([index], `${sideNames[index]} ${noun}`, sideNames[index]![0], false)
  }
  const custom = form === "four" && customView !== undefined
  const option = formOptions.find((other) => other.value === form)!
  return (
    <div className={doesNothing ? "opacity-50" : undefined}>
      <Field label={label} hint={[doesNothing, hint].filter(Boolean).join("\n") || undefined}>
        <div className="flex items-start gap-1">
          {!custom && (
            <div
              className={`grid min-w-0 flex-1 gap-1 ${form === "one" || singleForms.includes(form as never) ? "grid-cols-1" : "grid-cols-2"}`}
            >
              {fields}
            </div>
          )}
          {custom && <span className="h-7 flex-1 content-center text-xs text-muted-foreground">Custom, below</span>}
          <DropdownMenu>
            <Hint label={`${label} sides`}>
              <DropdownMenuTrigger
                aria-label={`${label} sides: ${option.label}`}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
              >
                <option.Icon className="size-4" />
              </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuRadioGroup
                value={form}
                onValueChange={(next) => {
                  const chosen = next as SidesForm
                  setForm(chosen)
                  const changed = sidesFor(chosen, sides)
                  if (!changed.every((side, index) => same(side, sides[index]))) onChange(changed, [0, 1, 2, 3])
                }}
              >
                {formOptions.map((choice) => (
                  <DropdownMenuRadioItem key={choice.value} value={choice.value} className="text-xs">
                    <choice.Icon className="size-3.5" />
                    {choice.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Field>
      {custom && customView}
    </div>
  )
}
