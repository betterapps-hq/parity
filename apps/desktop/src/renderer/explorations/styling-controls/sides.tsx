import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { scrubSteps } from "@parity-app/core"
import {
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Scan,
  Square,
  SquareDashed,
  SquareSplitHorizontal
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Field } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { formatNumber, stepSpacing } from "./css-values.ts"
import {
  type Message,
  MissingMark,
  notAStep,
  OffSystemMark,
  type Reading,
  type ScrubBy,
  type ScrubKeys,
  TokenMark,
  useTokens,
  ValueField
} from "./field-parts.tsx"
import {
  onStep,
  readSide,
  type Side,
  type SideRules,
  type Sides,
  sideNames,
  sideNumber,
  stepSide
} from "./sides-writes.ts"
import { lengthToken } from "./tokens.ts"

/*
 * The Four sides field (PAR-652's Four sides type) and the one-side field it's made of, shared by Padding, Margin,
 * Stroke's width, the box-model widget, the pin box's insets and Layer order. Each side is the shared ValueField.
 */

/** Which sides an edit reaches: the one typed in, the opposite one too (Alt), or all four (Alt+Shift), as Figma's. */
export type Spread = "side" | "opposite" | "all"

const spreadOf = ({ shift, alt }: ScrubKeys): Spread => {
  if (!alt) return "side"
  return shift ? "all" : "opposite"
}

/** The sides an edit to some of them reaches, as Spread says. */
export function spreadTo(indexes: readonly number[], spread: Spread): number[] {
  if (spread === "all") return [0, 1, 2, 3]
  if (spread === "opposite") return [...new Set(indexes.flatMap((index) => [index, (index + 2) % 4]))]
  return [...indexes]
}

/**
 * Dragging a side's label: a whole spacing step per 2 screen pixels, or a pixel or one per screen pixel; Shift goes ten
 * times as far, except where Alt reaches other sides, and Alt+Shift means all four instead.
 */
function sideScrub(rules: SideRules, spreads: boolean): ScrubBy {
  return {
    move: (start, dx, { shift, alt }) => {
      const further = shift && !(spreads && alt)
      if (rules.stepBy === "spacing") return stepSpacing(start, scrubSteps(dx, further))
      return start + Math.trunc(dx) * (further ? 10 : 1)
    },
    min: rules.negatives ? -Infinity : 0
  }
}

/** What a side's typing comes to: one side, or CSS's shorthand for all four. */
type SideEntry = { side: Side } | { shorthand: Sides }

export interface SideFieldProps {
  /** The accessible name, which says which side: Top padding. */
  label: string
  /** A short label inside, which scrubs: T, or an icon. */
  inner?: ReactNode
  rules: SideRules
  value: Side
  mixed?: boolean
  /** What unset comes to, muted: 0, or Auto 24 for an unpinned inset. */
  placeholder?: string
  /** What Auto, a percentage or unset comes to on the layer, measured, for what it comes to and for stepping from it. */
  measured?: number
  narrow?: boolean
  /** Borderless until hovered or focused, as the box-model widget's sides are. */
  bare?: boolean
  /** One of several sides, so Alt and Alt+Shift reach the opposite side and all four, and Alt+Down steps. */
  spreads?: boolean
  tokensOnly?: boolean
  /** What a percentage is of, for its hint: Pricing's height. */
  percentOf?: string
  /** A line its messages go to instead of its own, as the box-model widget's under itself. */
  line?: { message: Message | undefined; onMessage: (message: Message | undefined) => void }
  /** Where a grid places its row, so what it says goes under every field in the grid. */
  rowClassName?: string
  onChange: (value: Side, spread: Spread) => void
  /** Shorthand typed into this side, filling every side in CSS's order. */
  onShorthand?: (sides: Sides) => void
}

/**
 * One side, or any one value of a side's kind, on the shared ValueField: a number in the field's unit, a percentage, a
 * token as a chip, or Auto in words with what it comes to. It types like the app's fields (maths, units, `spacing-4`, a
 * token's name), and shorthand typed into it (`8 16`) fills every side. A number off the steps carries the hollow mark,
 * whose Create token adds to the project's tokens. Narrow, the unit shows on hover and what it comes to is in its hint.
 */
export function SideField({
  label,
  inner,
  rules,
  value,
  mixed = false,
  placeholder = "0",
  measured,
  narrow = false,
  bare = false,
  spreads = false,
  tokensOnly = false,
  percentOf,
  line,
  rowClassName,
  onChange,
  onShorthand
}: SideFieldProps) {
  const { tokens, create } = useTokens(rules.tokens.set)
  const tokenName = typeof value === "object" && "token" in value ? value.token : undefined
  const token = tokenName === undefined ? undefined : tokens.find((other) => other.name === tokenName)
  const own = typeof value === "object" && "number" in value ? value : undefined
  const percent = typeof value === "object" && "percent" in value ? value.percent : undefined
  const offSystem = own !== undefined && !onStep(own.number)
  const refused = offSystem && tokensOnly && own.allow === undefined
  const unit = rules.unit ?? ""
  const nearestStep = own === undefined ? 0 : Math.round(own.number)
  const useNearest = () => onChange({ number: nearestStep }, "side")
  const spreadFrom = (keys: ScrubKeys): Spread => (spreads ? spreadOf(keys) : "side")

  let shown: string | undefined
  if (value === "auto") shown = "Auto"
  else if (own) shown = formatNumber(own.number)
  else if (percent !== undefined) shown = formatNumber(percent)

  let shownUnit: string | undefined
  if (percent !== undefined) shownUnit = "%"
  else if (own && unit) shownUnit = unit

  let comesTo: string | undefined
  if (token) comesTo = token.detail
  else if ((value === "auto" || percent !== undefined) && measured !== undefined)
    comesTo = `${formatNumber(measured)}${unit}`

  // The hint carries the value's status, which a narrow field has no room to say.
  let status: string | undefined
  if (token?.deprecated) status = `Deprecated: use ${token.deprecated} instead`
  else if (tokenName !== undefined && !token) status = "Missing: the project has no token by this name now"
  else if (own?.allow !== undefined) status = `Allowed here: ${own.allow}`
  else if (offSystem) status = `Not a step. Nearest: ${nearestStep}${unit}`
  else if (percent !== undefined && percentOf) status = `${formatNumber(percent)}% of ${percentOf}`
  else if (mixed && value === undefined) status = "Mixed: the selected layers differ"

  const read = (text: string): Reading<SideEntry> => {
    const reading = readSide(text, label, rules, value, tokens)
    return "reason" in reading ? { reason: reading.reason } : { value: reading }
  }
  const commit = (entry: SideEntry) => {
    if ("side" in entry) onChange(entry.side, "side")
    else if (onShorthand) onShorthand(entry.shorthand)
    else onChange(entry.shorthand[0], "side")
  }

  return (
    <ValueField
      label={label}
      inner={inner}
      scrub={
        inner === undefined
          ? undefined
          : {
              from: () => sideNumber(value, tokens) ?? measured ?? 0,
              apply: (number, keys) => onChange({ number }, spreadFrom(keys)),
              by: sideScrub(rules, spreads)
            }
      }
      shown={shown}
      placeholder={placeholder}
      mixed={mixed}
      chip={
        tokenName === undefined
          ? undefined
          : {
              name: tokenName,
              token,
              namespace: rules.namespace,
              onRemove: () => onChange(undefined, "side"),
              onReplace: (replacement) => onChange({ token: replacement }, "side")
            }
      }
      unit={shownUnit}
      comesTo={comesTo}
      status={{
        missing: tokenName !== undefined && !token ? <MissingMark name={tokenName} /> : undefined,
        offSystem: offSystem ? (
          <OffSystemMark
            label={label}
            compact
            description={`${formatNumber(own.number)}${unit} isn't one of the project's steps or tokens.`}
            nearest={{
              name: `${nearestStep}${unit}`,
              preview: <TokenMark kind={rules.tokens.kind} value={`${nearestStep}px`} />
            }}
            allowed={own.allow}
            isTaken={(name) => tokens.some((other) => other.name === rules.namespace + name)}
            namePlaceholder="gutter"
            onUse={useNearest}
            onCreate={
              create &&
              ((name) => {
                create(lengthToken(rules.tokens.kind, rules.namespace + name, own.number))
                onChange({ token: rules.namespace + name }, "side")
              })
            }
            onAllow={(reason) =>
              onChange(reason === undefined ? { number: own.number } : { ...own, allow: reason }, "side")
            }
          />
        ) : undefined
      }}
      tokens={{
        list: tokens,
        current: tokenName,
        none: rules.unset,
        onPick: (name) => onChange(name === undefined ? undefined : { token: name }, "side")
      }}
      refusal={refused ? notAStep(`${nearestStep}${unit}`, useNearest) : undefined}
      narrow={narrow}
      bare={bare}
      altSteps={spreads}
      line={line}
      rowClassName={rowClassName}
      hint={{ detail: status }}
      // Auto in words is selected on focus, so what's typed replaces it.
      selectOnFocus={value === "auto"}
      read={read}
      onCommit={commit}
      onStep={(up, keys) =>
        onChange(stepSide(value, rules, up, keys.shift && !(spreads && keys.alt), measured, tokens), spreadFrom(keys))
      }
    />
  )
}

/**
 * One line under a group of sides too narrow to say things under themselves, as the box-model widget's and the pin
 * box's: `lineFor` is each field's `line`, by its label, and `said` what they say now, for MessageLines under the group.
 */
export function useSidesLine() {
  const [messages, setMessages] = useState<Record<string, Message | undefined>>({})
  return {
    lineFor: (label: string) => ({
      message: messages[label],
      onMessage: (message: Message | undefined) => setMessages((current) => ({ ...current, [label]: message }))
    }),
    said: Object.values(messages).filter((message): message is Message => message !== undefined)
  }
}

/** How four sides lay out: one field, vertical and horizontal, one side alone, or all four. */
type SidesForm = "one" | "two" | "top" | "right" | "bottom" | "left" | "four"

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

const icon = "size-3.5"

/**
 * Where each narrow field sits in the two-column grid, in reading order, so the grid places the fields first and what
 * they say on the rows after them, under every field.
 */
const cells = [
  "col-start-1 row-start-1",
  "col-start-2 row-start-1",
  "col-start-1 row-start-2",
  "col-start-2 row-start-2"
] as const

/**
 * Four sides, laid out in the shortest form that holds them when the layer is selected, never while editing: one
 * field, vertical and horizontal, one side alone, or four in CSS's order. The button after them switches forms, as
 * Figma's does. Mixed is per side. Hovering a field reports the sides it covers, for the canvas to highlight. What a
 * field says goes under the whole row of fields.
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
  /** A field for some of the sides: alone and wide, or narrow in a cell of the two-column grid. */
  const field = (indexes: number[], fieldLabel: string, inner: ReactNode, cell?: number) => {
    const value = indexes.every((index) => same(sides[index], sides[indexes[0]!])) ? sides[indexes[0]!] : undefined
    const isMixed = indexes.some((index) => mixed[index])
    return (
      // `contents`, so the field's message line spans the grid's whole row rather than its own column.
      <div
        key={fieldLabel}
        className="contents"
        onPointerEnter={() => onHover?.(indexes)}
        onPointerLeave={() => onHover?.(undefined)}
      >
        <SideField
          label={fieldLabel}
          inner={inner}
          rules={rules}
          value={value}
          mixed={isMixed}
          narrow={cell !== undefined}
          rowClassName={cell === undefined ? undefined : cells[cell]}
          spreads
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
  if (form === "one") fields = field([0, 1, 2, 3], label, <Scan className={icon} />)
  else if (form === "two")
    fields = [
      field([0, 2], `Vertical ${noun}`, <AlignVerticalSpaceAround className={icon} />, 0),
      field([1, 3], `Horizontal ${noun}`, <AlignHorizontalSpaceAround className={icon} />, 1)
    ]
  else if (form === "four") fields = sideNames.map((side, index) => field([index], `${side} ${noun}`, side[0], index))
  else {
    const index = singleForms.indexOf(form)
    fields = field([index], `${sideNames[index]} ${noun}`, sideNames[index]![0])
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
