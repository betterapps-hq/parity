import { scrubSteps } from "@parity-app/core"
import { type ReactNode, useState } from "react"
import { formatNumber, sameValue, stepSpacing } from "./css-values.ts"
import {
  asToken,
  type MenuKeywords,
  nearestToken,
  notAStep,
  ownLength,
  type Reading,
  type ScrubBy,
  type ScrubKeys,
  type SharedLine,
  tokenChip,
  tokenStatus,
  usePercentUnit,
  useTokens,
  type Unstorable,
  Unstored,
  ValueField
} from "./field-parts.tsx"
import { EachToggle, Field, PairGlyph, SideGlyph } from "./field-row.tsx"
import {
  onStep,
  readSide,
  type Side,
  type SideRules,
  type Sides,
  sideNames,
  sideNumber,
  sideShown,
  stepSide
} from "./sides-writes.ts"
import { isBareNumber } from "./typing.ts"

/*
 * The Four sides field (PAR-652's Four sides type) and the one-side field it's made of, shared by Padding, Margin,
 * Stroke's width, the box-model widget, the inset box and Layer order. Each side is the shared ValueField.
 */

/** Which sides an edit reaches: the one typed in, the opposite one too (Alt), or all four (Alt+Shift), as Figma's. */
export type Spread = "side" | "opposite" | "all"

const spreadOf = ({ shift, alt }: ScrubKeys): Spread => {
  if (!alt) {
    return "side"
  }

  return shift ? "all" : "opposite"
}

/** The sides an edit to some of them reaches, as Spread says. */
export function spreadTo(indexes: readonly number[], spread: Spread): number[] {
  if (spread === "all") {
    return [0, 1, 2, 3]
  }

  if (spread === "opposite") {
    return [...new Set(indexes.flatMap((index) => [index, (index + 2) % 4]))]
  }

  return [...indexes]
}

/** The four sides with those an edit reached set to its value. */
export function setSides(sides: Sides, reached: readonly number[], value: Side): Sides {
  const at = (index: number) => (reached.includes(index) ? value : sides[index])

  return [at(0), at(1), at(2), at(3)]
}

/**
 * Dragging a side's label: a whole spacing step per 2 screen pixels, or a pixel, a percent or one per screen pixel;
 * Shift goes ten times as far, except where Alt reaches other sides, and Alt+Shift means all four instead.
 */
function sideScrub(rules: SideRules, spreads: boolean, percent: boolean): ScrubBy {
  return {
    move: (start, dx, { shift, alt }) => {
      const further = shift && !(spreads && alt)

      if (rules.stepBy === "spacing" && !percent) {
        return stepSpacing(start, scrubSteps(dx, further))
      }

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
  /** Where the layers differ, works out what uses the value there from each one's own pixels (`ValueField`'s). */
  each?: (update: (px: number) => number) => void
  /** A short label inside, which scrubs: T, or an icon. */
  inner?: ReactNode
  rules: SideRules
  value: Side
  mixed?: boolean
  /** What its hint says of Mixed, where it's the sides it covers that differ rather than the selected layers. */
  mixedNote?: string
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
  line?: SharedLine
  /** Where a grid places its row, so what it says goes under every field in the grid. */
  rowClassName?: string
  onChange: (value: Side, spread: Spread) => void
  /** Shorthand typed into this side, filling every side in CSS's order. */
  onShorthand?: (sides: Sides) => void
  /** What the hint says when the value has nothing else to: that a negative gap overlaps. */
  note?: string
  /**
   * Auto as the kind offers it, where it does more than one thing: rows for it above the tokens in the field's menu,
   * what its chip says after Auto and in its hint, and what taking the chip off puts back. Gap's spreads the children.
   */
  auto?: { keywords: MenuKeywords; detail: string; about: string; onRemove: () => void }
}

/**
 * One side, or any one value of a side's kind, on the shared ValueField: a number in the field's unit, a percentage, a
 * token as a chip, or Auto as a chip too, with what it comes to faintly after it. It types like the app's fields
 * (maths, units, `spacing-4`, a token's name), and shorthand typed into it (`8 16`) fills every side. A number of its
 * own has no mark: its token list offers the nearest token first, then Create token. Where the side takes a percentage,
 * its unit is a menu of px and %, which keeps the number, as Radius's does, and a number typed bare is in the unit
 * shown. Narrow, what it comes to is in its hint.
 */
export function SideField({
  label,
  inner,
  rules,
  value,
  mixed = false,
  each,
  mixedNote = "Mixed: the selected layers differ",
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
  onShorthand,
  note,
  auto
}: SideFieldProps) {
  const { tokens, create } = useTokens(rules.tokens.set)
  // `auto` is the one form that isn't an object.
  const form = value === "auto" ? undefined : value
  const tokenName = form && "token" in form ? form.token : undefined
  const token = tokenName === undefined ? undefined : tokens.find((other) => other.name === tokenName)
  const own = form && "number" in form ? form : undefined
  const percent = form && "percent" in form ? form.percent : undefined
  const offSystem = own !== undefined && !onStep(own.number)
  const refused = offSystem && tokensOnly && own.allow === undefined
  const unit = rules.unit ?? ""
  const nearestStep = own === undefined ? 0 : Math.round(own.number)
  const useNearest = () => onChange({ number: nearestStep }, "side")
  const spreadFrom = (keys: ScrubKeys): Spread => (spreads ? spreadOf(keys) : "side")

  // A token is its chip, so the text shows nothing of it.
  const shown = tokenName === undefined ? sideShown(value, tokens, rules.unit)?.number : undefined

  // The unit a bare number is typed in: the value's, or the one last chosen from the menu while the side was unset.
  const percentUnit = usePercentUnit(own?.number, percent, {
    px: (number) => onChange({ number }, "side"),
    percent: (share) => onChange({ percent: share }, "side")
  })

  const unitNow = percentUnit.unit
  // A percentage scrubs as a percentage, and so does unset with % chosen from the menu.
  const scrubsPercent = percent !== undefined || (value === undefined && rules.percent && unitNow === "%")
  let shownUnit: ReactNode

  if (rules.percent) {
    shownUnit = percentUnit.menu(label, percentOf ?? "the parent's width")
  } else if (percent !== undefined) {
    shownUnit = "%"
  } else {
    shownUnit = unit
  }

  let comesTo: string | undefined

  if (token) {
    comesTo = token.detail
  } else if (
    ((value === undefined && (narrow || rules.unset === "Auto")) || value === "auto" || percent !== undefined) &&
    measured !== undefined
  ) {
    comesTo = `${formatNumber(measured)}${unit}`
  }

  // The hint carries the value's status, which a narrow field has no room to say.
  let status: string | undefined

  if (offSystem) {
    status = `Nearest step: ${nearestStep}${unit}`
  } else if (percent !== undefined && percentOf) {
    status = `${formatNumber(percent)}% of ${percentOf}`
  } else if (mixed && value === undefined) {
    status = mixedNote
  }

  status = tokenStatus(tokenName, token, own?.allow) ?? status

  // A token is a chip, and so is Auto, a word the field holds whole: Backspace takes it off, and typing replaces it.
  let chip = tokenChip(tokenName, token, {
    namespace: rules.namespace,
    pick: (name) => onChange(asToken(name), "side"),
    detach: (each) => onChange({ number: each.px }, "side")
  })

  if (!chip && value === "auto") {
    chip = {
      name: "Auto",
      // What Auto comes to stays in sight, faintly in the chip; a narrow field's hint says it instead.
      keyword: { detail: auto?.detail ?? (narrow ? undefined : comesTo), about: auto?.about },
      onRemove: auto?.onRemove ?? (() => onChange(undefined, "side"))
    }
  }

  const read = (text: string): Reading<SideEntry> => {
    const bare = isBareNumber(text)

    const reading = readSide(
      rules.percent && unitNow === "%" && bare ? `${text.trim()}%` : text,
      label,
      rules,
      value,
      tokens
    )

    return "reason" in reading ? { reason: reading.reason } : { value: reading }
  }

  const commit = (entry: SideEntry) => {
    if ("side" in entry) {
      onChange(entry.side, "side")
    } else if (onShorthand) {
      onShorthand(entry.shorthand)
    } else {
      onChange(entry.shorthand[0], "side")
    }
  }

  return (
    <ValueField
      label={label}
      inner={inner}
      scrub={
        bare
          ? undefined
          : {
              from: () => (scrubsPercent ? (percent ?? 0) : (sideNumber(value, tokens) ?? measured ?? 0)),
              apply: (number, keys) => onChange(scrubsPercent ? { percent: number } : { number }, spreadFrom(keys)),
              by: sideScrub(rules, spreads, scrubsPercent)
            }
      }
      shown={shown}
      placeholder={placeholder}
      mixed={mixed}
      each={each}
      chip={chip}
      unit={shownUnit}
      unitName={rules.percent ? unitNow : undefined}
      comesTo={comesTo}
      own={
        own === undefined
          ? undefined
          : ownLength({
              px: own.number,
              unit,
              tokens,
              kind: rules.tokens.kind,
              namespace: rules.namespace,
              create,
              tokensOnly,
              allow: own.allow,
              onToken: (name) => onChange({ token: name }, "side"),
              onAllow: (reason) =>
                onChange(reason === undefined ? { number: own.number } : { ...own, allow: reason }, "side")
            })
      }
      tokens={{
        keywords: auto?.keywords,
        list: tokens,
        current: tokenName,
        none: rules.unset,
        // None is no padding, margin or stroke, which the previews draw; Auto is worked out, so it has none.
        noneValue: rules.unset === "None" ? "0px" : undefined,
        onPick: (name) => onChange(asToken(name), "side")
      }}
      refusal={refused ? notAStep(`${nearestStep}${unit}`, useNearest) : undefined}
      // Locked, a side still takes a step on the scale as typed, as Tokens only allows, besides its tokens.
      locked={
        tokensOnly
          ? {
              tokens,
              // Read as the field reads it, so `1rem`, `+8` and `spacing-4` find the token nearest what they come to.
              nearestTo: (text) => {
                const reading = read(text)
                const typed = "value" in reading && "side" in reading.value ? reading.value.side : undefined
                const px = sideNumber(typed, tokens)

                return px === undefined ? undefined : nearestToken(tokens, (each) => each.px, px)
              },
              takes: (text) => {
                const reading = read(text)

                if ("reason" in reading) {
                  return false
                }

                const entries = "side" in reading.value ? [reading.value.side] : reading.value.shorthand

                return entries.every(
                  (entry) => entry === undefined || entry === "auto" || !("number" in entry) || onStep(entry.number)
                )
              }
            }
          : undefined
      }
      narrow={narrow}
      bare={bare}
      altSteps={spreads}
      line={line}
      rowClassName={rowClassName}
      hint={{ detail: status ?? note }}
      read={read}
      onCommit={commit}
      onStep={(up, keys) =>
        onChange(stepSide(value, rules, up, keys.shift && !(spreads && keys.alt), measured, tokens), spreadFrom(keys))
      }
    />
  )
}

/** What four sides show together, before Each side opens them: vertical and horizontal, or one field for all four. */
export type Together = "pair" | "one"

/** Whether the fields shown together can show the sides as they are, without saying Mixed. */
function fitsTogether(together: Together, sides: Sides, mixed: readonly boolean[]): boolean {
  const alike = (a: number, b: number) => sameValue(sides[a], sides[b]) && Boolean(mixed[a]) === Boolean(mixed[b])

  if (together === "one") {
    return alike(0, 1) && alike(0, 2) && alike(0, 3)
  }

  return alike(0, 2) && alike(1, 3)
}

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
 * Four sides under one name, as the simpler fields lay them out (PAR-186): vertical and horizontal together, or one
 * field for all four, and each side once Each side is pressed, as Figma's padding is. A pair whose sides differ says
 * Mixed rather than taking one of them, so closing Each side never loses a value; typing sides that differ into one
 * (`8 16 8 0`) opens every side, to show them. Mixed is per side. Hovering a field reports the sides it covers, for the
 * canvas to highlight. What a field says goes under the whole row of fields.
 */
export function FourSidesField({
  label,
  rules,
  sides,
  mixed = [],
  together = "pair",
  placeholders,
  measured,
  hint,
  doesNothing,
  tokensOnly,
  eachSide,
  onChange,
  onHover
}: {
  /** The row's label: Padding, Margin, Width. */
  label: string
  rules: SideRules
  sides: Sides
  mixed?: readonly boolean[]
  /** What shows before Each side: vertical and horizontal (Padding, Margin), or one field (Stroke's width). */
  together?: Together
  /** Each side's unset placeholder, as measured. */
  placeholders?: readonly string[]
  /** What each side comes to on the layer, for Auto and for stepping from unset. */
  measured?: readonly (number | undefined)[]
  hint?: string
  /** Why the row does nothing here, which dims it. */
  doesNothing?: string
  tokensOnly?: boolean
  /** Where a side of its own is something the document may not store yet, as a stroke's width per side. */
  eachSide?: Unstorable
  onChange: (sides: Sides, cleared: number[]) => void
  onHover?: (sides: number[] | undefined) => void
}) {
  const [each, setEach] = useState(() => !fitsTogether(together, sides, mixed))
  // The sides last shown, and the sides this field last wrote, so sides that come from elsewhere (another selection,
  // an undo) work out Each side afresh, while the field's own edits leave it as it is.
  const [shownFor, setShownFor] = useState({ sides, mixed })
  const [wrote, setWrote] = useState<Sides>()
  const noun = label.toLowerCase()

  if (!sameValue(shownFor, { sides, mixed })) {
    setShownFor({ sides, mixed })

    if (!sameValue(sides, wrote)) {
      setEach(!fitsTogether(together, sides, mixed))
    }
  }

  const write = (next: Sides, reached: number[]) => {
    setWrote(next)
    onChange(next, reached)
  }

  const update = (indexes: number[], value: Side, spread: Spread) => {
    const reached = spreadTo(indexes, spread)
    write(setSides(sides, reached, value), reached)
  }

  const shorthand = (next: Sides) => {
    write(next, [0, 1, 2, 3])

    // Sides typed that differ open every side, to show them; nothing closes it under the pointer.
    if (!fitsTogether(together, next, [])) {
      setEach(true)
    }
  }

  /** A field for some of the sides: alone and wide, or narrow in a cell of the two-column grid. */
  const field = (indexes: number[], fieldLabel: string, inner: ReactNode, cell?: number) => {
    const first = indexes[0]!
    const alike = indexes.every((index) => sameValue(sides[index], sides[first]))
    const isMixed = !alike || indexes.some((index) => mixed[index])

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
          value={alike ? sides[first] : undefined}
          mixed={isMixed}
          mixedNote={alike ? undefined : "Mixed: these sides differ. Each side shows them"}
          narrow={cell !== undefined}
          rowClassName={cell === undefined ? undefined : cells[cell]}
          spreads
          tokensOnly={tokensOnly}
          placeholder={placeholders?.[first] ?? "0"}
          measured={measured?.[first]}
          onChange={(next, spread) => update(indexes, next, spread)}
          onShorthand={shorthand}
        />
      </div>
    )
  }

  let fields: ReactNode

  if (each) {
    fields = sideNames.map((side, index) => field([index], `${side} ${noun}`, <SideGlyph side={index} />, index))
  } else if (together === "pair") {
    fields = [
      field([0, 2], `Vertical ${noun}`, <PairGlyph />, 0),
      field([1, 3], `Horizontal ${noun}`, <PairGlyph across />, 1)
    ]
  } else {
    fields = field([0, 1, 2, 3], label, undefined)
  }

  return (
    <div className={doesNothing ? "opacity-50" : undefined}>
      <Field
        label={label}
        hint={[doesNothing, hint].filter(Boolean).join("\n") || undefined}
        action={
          eachSide ? (
            <Unstored part={eachSide}>
              <EachToggle label="Each side" parts="sides" pressed={each} onClick={() => setEach(!each)} />
            </Unstored>
          ) : (
            <EachToggle label="Each side" parts="sides" pressed={each} onClick={() => setEach(!each)} />
          )
        }
      >
        <div className={`grid min-w-0 gap-x-2 gap-y-1 ${together === "one" && !each ? "grid-cols-1" : "grid-cols-2"}`}>
          {fields}
        </div>
      </Field>
    </div>
  )
}
