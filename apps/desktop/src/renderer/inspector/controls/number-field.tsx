import { formatNumber } from "@parity-app/style-schema"
import { type ReactNode, useId, useRef } from "react"
import { initialSession, reduceSession, type SessionEffect } from "./edit-session.ts"
import {
  type FieldHint,
  type LiveEdits,
  LiveEditsContext,
  type MenuKeywords,
  type OwnValue,
  type ScrubBy,
  type ScrubKeys,
  type StatusMarks,
  tokenChip,
  ValueField,
  type ValueFieldProps
} from "./field-parts.tsx"
import { type NumberRules, readNumberText, settleNumber, stepNumber } from "./number-rules.ts"
import { stepToken, tokenNamed } from "./token-scale.ts"
import type { OpacityToken } from "./tokens.ts"

/** What a number field reads besides numbers, by a reader of its own: an opacity token's name, a count's Fit. */
export interface OtherValue<X> {
  read: (text: string) => X | undefined
  commit: (other: X) => void
}

/** What a number field holds while it's edited: a number, unset, or something else it reads (`OtherValue`). */
type Held<X> = number | undefined | { other: X }

/** What `ValueField` takes that a number field passes on as it is: its look, chip, tokens, hint and line. */
type Passed<X> = Omit<
  ValueFieldProps<Held<X>>,
  "label" | "read" | "onCommit" | "onStep" | "shown" | "scrub" | "unit" | "placeholder"
>

export type NumberFieldProps<X = never> = NumberRules &
  Passed<X> & {
    value: number | undefined
    /** What unset shows, faintly. */
    placeholder?: string
    /** What unset counts as for maths and steps: the placeholder's number unless said. */
    unsetIs?: number
    /** The value maths works from, where a preview on the canvas shows another (`NumberProp`). */
    current?: () => number | undefined
    /** What shows after the number, where it isn't the unit it reads: a unit menu. */
    unitShown?: ReactNode
    /** Whether dragging its label or inner glyph scrubs it; it does unless said. */
    scrubs?: boolean
    /** How a drag of its label moves it, where it isn't by its steps: a spacing step per 2 screen pixels. */
    scrubBy?: ScrubBy
    /** Where Up or Down from a number goes, where it isn't by the rules' steps: the next spacing step. */
    stepBy?: (own: number, up: boolean, keys: ScrubKeys) => number
    /** Up or Down of its own, as a field holding a token steps through tokens: true when it took the press. */
    stepOwn?: (up: boolean, keys: ScrubKeys) => boolean
    other?: OtherValue<X>
    onChange: (value: number | undefined) => void
  }

/**
 * A number field: `ValueField` with what it takes given as rules (`NumberRules`) rather than a reader of its own, so
 * every number reads the app's maths, steps with Up and Down (Shift for more), scrubs, and says what it takes the same
 * way. Past either end it stops there, or is refused where the rules say; empty, it's unset unless it's required. Text
 * it can't read stays, with the reason under it, and nothing changes.
 */
export function NumberField<X = never>(props: NumberFieldProps<X>) {
  const {
    label,
    called,
    min,
    max,
    whole,
    places,
    past,
    required,
    unit,
    words,
    alsoTakes,
    step,
    shiftStep,
    altStep,
    value,
    placeholder,
    unsetIs,
    current,
    unitShown,
    scrubs = true,
    scrubBy,
    stepBy,
    stepOwn,
    other,
    onChange,
    ...field
  } = props

  const rules: NumberRules = {
    label,
    called,
    min,
    max,
    whole,
    places,
    past,
    required,
    unit,
    words,
    alsoTakes,
    step,
    shiftStep,
    altStep
  }

  const own = () => (current ? current() : value)
  const from = () => own() ?? unsetIs ?? (Number(placeholder) || 0)
  const settle = (number: number) => settleNumber(number, rules)
  const by: ScrubBy = scrubBy ?? { step: step ?? 1, shiftStep: shiftStep ?? (step ?? 1) * 10, min, max }

  return (
    <ValueField<Held<X>>
      {...field}
      label={label}
      shown={value === undefined ? undefined : formatNumber(value, whole ? 0 : (places ?? 3))}
      placeholder={placeholder}
      unit={unitShown ?? unit}
      scrub={scrubs ? { from, apply: (next) => onChange(settle(next)), by } : undefined}
      read={(text) => {
        const read = other?.read(text)

        return read === undefined ? readNumberText(text, rules, from()) : { value: { other: read } }
      }}
      onCommit={(next) => (next instanceof Object ? other?.commit(next.other) : onChange(next))}
      onStep={(up, keys) => {
        if (!stepOwn?.(up, keys)) {
          onChange(stepBy ? settle(stepBy(from(), up, keys)) : stepNumber(from(), up, keys, rules))
        }
      }}
    />
  )
}

/** Shows a number on the canvas while it's typed or scrubbed, before it's made, and takes it back. */
export interface PropPreview {
  onPreview: (value: number | undefined) => void
  onCancel: () => void
}

/**
 * A number a design holds outside its style, as a prop or a prop's default: a `NumberField` in an edit session of its
 * own (`edit-session.ts`), as the style sections are in theirs. A run of Up and Down presses is one undo step, made in
 * one gesture that `onChange` is given, and Escape takes it back. With `preview`, what's typed or scrubbed shows on the
 * canvas before it's made, and maths works from the value as it was before the preview (PAR-203). Empty, it's unset,
 * and `placeholder`, what unset comes to, shows faintly.
 */
export function NumberProp({
  label,
  value,
  placeholder,
  preview,
  onChange
}: {
  label: string
  value: number | undefined
  placeholder?: number
  preview?: PropPreview
  /** Makes a change, as part of a gesture's one undo step when given: a run of Up and Down presses. */
  onChange: (value: number | undefined, gesture?: string) => void
}) {
  const id = useId()
  // The value before a preview began, which maths works from while the canvas shows the preview.
  const before = useRef<{ value: number | undefined }>(undefined)
  const session = useRef(initialSession)
  // The values a field's change came to, while it runs, and the run of presses under way: its gesture and where it began.
  const gathering = useRef<(number | undefined)[]>(undefined)
  const run = useRef<{ gesture: string; from: number | undefined }>(undefined)
  const runs = useRef(0)

  const apply = (effect: SessionEffect<number | undefined>) => {
    switch (effect.type) {
      case "preview":
        before.current ??= { value }

        return preview?.onPreview(effect.edits.at(-1))
      case "unpreview":
        before.current = undefined

        return preview?.onCancel()
      case "make":
        before.current = undefined

        return onChange(effect.edits.at(-1), effect.inRun ? run.current?.gesture : undefined)
      case "beginRun":
        run.current = { gesture: `${id}-${(runs.current += 1)}`, from: value }

        return
      case "endRun":
        run.current = undefined

        return
      case "revertRun":
        // Back where it began, in its own gesture, the run leaves no undo step.
        if (run.current) {
          onChange(run.current.from, run.current.gesture)
        }

        run.current = undefined
    }
  }

  const live: LiveEdits = {
    send: (event, change) => {
      const edits: (number | undefined)[] = []
      gathering.current = edits

      try {
        change?.()
      } finally {
        gathering.current = undefined
      }

      const update = reduceSession(
        session.current,
        event.type === "step" ? { type: "step", edits, target: id } : { ...event, edits }
      )

      session.current = update.state
      update.effects.forEach(apply)
    }
  }

  const make = (next: number | undefined) => {
    if (gathering.current) {
      gathering.current.push(next)
    } else {
      before.current = undefined
      onChange(next)
    }
  }

  return (
    <LiveEditsContext value={live}>
      <NumberField
        label={label}
        value={value}
        placeholder={placeholder === undefined ? "" : formatNumber(placeholder)}
        unsetIs={placeholder}
        current={() => (before.current ? before.current.value : value)}
        onChange={make}
      />
    </LiveEditsContext>
  )
}

/**
 * A percentage, as opacity, a color's alpha, scale and a gradient stop's position take one: a `NumberField` that reads
 * `50` or `50%`, steps by 1 (10 with Shift, a quarter with Alt), scrubs by its inner label, and stops at its range. It
 * can hold an opacity token, whose name typed picks it and which Up and Down step through.
 */
export function PercentField({
  label,
  value,
  placeholder = "100",
  unsetIs,
  min = 0,
  max = 100,
  places = 2,
  inner,
  narrow,
  mixed,
  disabled,
  hint,
  rowClassName,
  keywords,
  tokens,
  options,
  status,
  own,
  onChange
}: {
  label: string
  value: number | undefined
  /** What unset shows, faintly. */
  placeholder?: string
  /** What unset counts as for maths and steps: the placeholder's number unless said. */
  unsetIs?: number
  min?: number
  max?: number
  /** Decimals kept: 0 for a color's alpha, as `bg-primary/50` takes whole percentages. */
  places?: number
  inner?: ReactNode
  narrow?: boolean
  mixed?: boolean
  disabled?: boolean
  hint?: FieldHint
  rowClassName?: string
  /** Words it also reads as percentages, as a position's X reads `left` as 0 and `right` as 100. */
  keywords?: Readonly<Record<string, number>>
  /**
   * The opacity tokens it offers, as Opacity and a color's alpha do: the one it holds (`current`) is its chip, typing a
   * token's name (`muted`, `opacity-muted`) picks it, and Up and Down step through them in order.
   */
  tokens?: { list: readonly OpacityToken[]; current?: string; onPick: (name: string | undefined) => void }
  /** Values it offers from its chevron, as a list of rows under a heading, as a preview's Zoom offers Fit and 100%. */
  options?: MenuKeywords & { name: string }
  /** Slot 5's marks. */
  status?: StatusMarks
  /** A value of its own, which its token list offers the nearest token and Create token for. */
  own?: OwnValue
  onChange: (value: number | undefined) => void
}) {
  const held = tokens?.current === undefined ? undefined : tokens.list.find((token) => token.name === tokens.current)

  return (
    <NumberField<{ token: string }>
      label={label}
      value={value}
      placeholder={placeholder}
      unsetIs={held?.percent ?? unsetIs}
      min={min}
      max={max}
      places={places}
      unit="%"
      words={keywords}
      altStep={0.25}
      scrubs={inner !== undefined}
      inner={inner}
      narrow={narrow}
      mixed={mixed}
      disabled={disabled}
      hint={hint}
      rowClassName={rowClassName}
      chip={tokenChip(tokens?.current, held, {
        pick: (name) => tokens?.onPick(name),
        detach: (token) => onChange(token.percent)
      })}
      comesTo={held?.detail}
      status={status}
      own={own}
      tokens={
        tokens || options
          ? {
              list: tokens?.list ?? [],
              current: tokens?.current,
              onPick: (name: string | undefined) => tokens?.onPick(name),
              keywords: options,
              name: options?.name
            }
          : undefined
      }
      other={{
        read: (text) => {
          const token = tokenNamed(tokens?.list, text.trim().toLowerCase(), "opacity-")

          return token && { token: token.name }
        },
        commit: ({ token }) => tokens?.onPick(token)
      }}
      // A token steps to the next in the list's order, Shift to the first or last, as every token does.
      stepOwn={(up, { shift }) => {
        if (!tokens || !held) {
          return false
        }

        tokens.onPick(stepToken(tokens.list, held, up, shift).name)

        return true
      }}
      onChange={onChange}
    />
  )
}
