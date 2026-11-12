import { Checkbox, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { validate } from "@parity-app/style"
import { Minus, Plus } from "lucide-react"
import { type ChangeEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { GroupLabel, PanelSection } from "../../chrome/PanelSection.tsx"
import { swatch } from "../../chrome/token-previews.tsx"
import { ColorEditor } from "./color-picker.tsx"
import { arbitrary, clamp, formatNumber, isPlainColor } from "./css-values.ts"
import { CurveThumb } from "./easing.tsx"
import { fillTokens } from "./expression.tsx"
import {
  comboboxProps,
  InvalidMark,
  type Message,
  MessageLine,
  NotBaseline,
  type Reading,
  readNumber,
  SearchList,
  TokenMark,
  ValueField,
  wrappingText
} from "./field-parts.tsx"
import { type Bezier, bezierCss, type EasingPlot, readEasingValue } from "./motion-data.ts"
import { colorTokens, lengthVars } from "./tokens.ts"
import type { StoredObject, Writes } from "./writes.ts"

/*
 * The CSS section (PAR-186, design-options-values.md's Raw CSS value and design-options-panel.md's CSS): a list of
 * declarations, one a row, `property: value` in the code font, checked with `CSS.supports` after filling in tokens.
 * Above them, Classes shows the layer's classes as Copy as Tailwind writes them; typing or pasting classes or
 * declarations gives each to the control that owns it and keeps the rest as rows. What can't be read is listed.
 */

export interface CssRow {
  id: number
  property: string
  value: string
  /** Off without deleting: kept in the file, but not drawn or written. */
  off?: boolean
}

/** A declaration a control owns, given to it rather than kept as a row. */
export interface Owned {
  property: string
  value: string
  control: string
  tailwind: string
}

/** The layer's CSS: the rows, what went to the controls, and classes Parity can't read, kept as From the code. */
export interface CssModel {
  rows: CssRow[]
  owned: Owned[]
  fromCode: string[]
}

let nextId = 100

/** Properties a control owns, and its name, so typing or pasting one gives it there. */
const owners = new Map([
  ["padding", "Spacing's Padding"],
  ["margin", "Spacing's Margin"],
  ["gap", "Layout's Gap"],
  ["display", "Layout's Type"],
  ["background-color", "Fill"],
  ["color", "Text's Color"],
  ["border-radius", "Appearance's Radius"],
  ["opacity", "Appearance's Opacity"],
  ["mix-blend-mode", "Appearance's Blend mode"],
  ["overflow", "Appearance's Clip content"],
  ["font-family", "Text's Font"],
  ["font-size", "Text's Size"],
  ["font-weight", "Text's Weight"],
  ["line-height", "Text's Line height"],
  ["letter-spacing", "Text's Letter spacing"],
  ["text-align", "Text's Align"],
  ["width", "Size's Width"],
  ["height", "Size's Height"],
  ["cursor", "Interaction's Cursor"],
  ["box-shadow", "Effects"],
  ["transition", "Motion's Transitions"]
])

/** Properties and values other browsers lack, marked † (principle 7), with who draws them. */
const notBaseline = new Map([
  ["interpolate-size", "Chromium"],
  ["field-sizing", "Chromium"],
  ["corner-plot", "Chromium"],
  ["reading-flow", "Chromium"],
  ["text-box", "Chromium and Safari"],
  ["anchor-name", "Chromium"],
  ["position-anchor", "Chromium"],
  ["position-area", "Chromium"],
  ["row-rule", "Chromium"],
  ["animation-timeline", "Chromium and Safari"],
  ["text-wrap: pretty", "Chromium and Safari"],
  ["interpolate-size: allow-keywords", "Chromium"]
])

/** Keywords a property takes, for completing its value. */
const valueKeywords = new Map([
  ["interpolate-size", ["allow-keywords", "numeric-only"]],
  ["field-sizing", ["content", "fixed"]],
  ["text-wrap", ["wrap", "nowrap", "balance", "pretty"]],
  ["pointer-events", ["none", "auto"]],
  ["user-select", ["none", "text", "all", "auto"]],
  ["scroll-behavior", ["smooth", "auto"]],
  ["overscroll-behavior", ["contain", "none", "auto"]],
  [
    "transition-timing-function",
    ["ease", "ease-in", "ease-out", "ease-in-out", "linear", "cubic-bezier(0.2, 0.8, 0.2, 1)"]
  ],
  ["animation-timing-function", ["ease", "ease-in", "ease-out", "ease-in-out", "linear"]],
  ["accent-color", ["auto", "var(--color-primary)"]],
  ["caret-color", ["auto", "var(--color-primary)"]],
  ["isolation", ["isolate", "auto"]],
  ["content-visibility", ["auto", "hidden", "visible"]],
  ["will-change", ["transform", "opacity", "auto"]]
])

/** Every property this browser knows, for completing names, read from a computed style. */
let known: string[] | undefined

function knownProperties(): string[] {
  known ??= [...getComputedStyle(document.documentElement)].filter((name) => !name.startsWith("-")).sort()

  return known
}

const isColorProperty = (property: string) => property.endsWith("color") || property === "fill" || property === "stroke"

/** What a value completes to: the property's keywords, then tokens of the kind it takes, written as `var()`. */
function valueCandidates(property: string): { label: string; detail?: string }[] {
  const keywords = (valueKeywords.get(property) ?? []).map((label) => ({ label }))

  const tokens = isColorProperty(property)
    ? colorTokens.slice(0, 12).map((token) => ({ label: `var(--color-${token.name})`, detail: token.hex }))
    : Object.entries(lengthVars).map(([name, px]) => ({ label: `var(--${name})`, detail: `${px}px` }))

  return [...keywords, ...tokens]
}

/** The Tailwind prefix of each spacing or size property a control owns, as `p` for padding. */
const ownedPrefixes = new Map([
  ["padding", "p"],
  ["margin", "m"],
  ["gap", "gap"],
  ["width", "w"],
  ["height", "h"]
])

/** A Tailwind class for a declaration a control owns, as that control writes it. */
function ownedClass(property: string, value: string): string {
  const step = /^(\d+)px$/.exec(value)?.[1]
  const prefix = ownedPrefixes.get(property)

  if (prefix && step !== undefined && Number(step) % 1 === 0) {
    return `${prefix}-${Number(step) / 4}`
  }

  const token = /^var\(--color-([\w-]+)\)$/.exec(value)?.[1]

  if (property === "background-color" && token) {
    return `bg-${token}`
  }

  if (property === "color" && token) {
    return `text-${token}`
  }

  if (property === "display" && ["flex", "grid", "block", "inline-flex"].includes(value)) {
    return value
  }

  if (property === "display" && value === "none") {
    return "hidden"
  }

  if (property === "cursor") {
    return `cursor-${value}`
  }

  if (property === "opacity" && /^\d+%$/.test(value)) {
    return `opacity-${value.slice(0, -1)}`
  }

  return `[${property}:${arbitrary(value)}]`
}

/** The property each spacing or size utility's prefix sets, as `p` sets padding. */
const spacingProperties = new Map([
  ["p", "padding"],
  ["m", "margin"],
  ["gap", "gap"],
  ["w", "width"],
  ["h", "height"]
])

/** Reads a Tailwind class back into the declaration it writes, where Parity knows the utility. */
function readClass(name: string): { property: string; value: string } | undefined {
  const bare = name.replace(/^[a-z-]+:/, "")
  const arbitrary = /^\[([a-z-]+):(.+)\]$/.exec(bare)

  if (arbitrary) {
    return { property: arbitrary[1]!, value: arbitrary[2]!.replaceAll("_", " ") }
  }

  const spacing = /^(p|m|gap|w|h)-(\d+(?:\.\d+)?)$/.exec(bare)
  const spacingProperty = spacing && spacingProperties.get(spacing[1])

  if (spacing && spacingProperty) {
    return { property: spacingProperty, value: `${Number(spacing[2]) * 4}px` }
  }

  const axis = /^(px|py)-(\d+(?:\.\d+)?)$/.exec(bare)

  if (axis) {
    return { property: axis[1] === "px" ? "padding-inline" : "padding-block", value: `${Number(axis[2]) * 4}px` }
  }

  if (["flex", "grid", "block", "inline-flex"].includes(bare)) {
    return { property: "display", value: bare }
  }

  if (bare === "hidden") {
    return { property: "display", value: "none" }
  }

  const radius = /^rounded(?:-(sm|md|lg|xl|2xl|full))?$/.exec(bare)

  if (radius) {
    return { property: "border-radius", value: `var(--radius-${radius[1] ?? "sm"})` }
  }

  const color = /^(bg|text)-([a-z]+(?:-[a-z0-9]+)*)(?:\/(\d+))?$/.exec(bare)

  if (color && colorTokens.some((token) => token.name === color[2])) {
    const variable = `var(--color-${color[2]})`
    const value = color[3] ? `color-mix(in oklab, ${variable} ${color[3]}%, transparent)` : variable

    return { property: color[1] === "bg" ? "background-color" : "color", value }
  }

  const size = /^text-(xs|sm|base|lg|xl|2xl)$/.exec(bare)

  if (size) {
    return { property: "font-size", value: `var(--text-${size[1]})` }
  }

  const weight = /^font-(normal|medium|semibold|bold)$/.exec(bare)

  if (weight) {
    return { property: "font-weight", value: `var(--font-weight-${weight[1]})` }
  }

  const opacity = /^opacity-(\d+)$/.exec(bare)

  if (opacity) {
    return { property: "opacity", value: `${opacity[1]}%` }
  }

  const cursor = /^cursor-([a-z-]+)$/.exec(bare)

  if (cursor) {
    return { property: "cursor", value: cursor[1]! }
  }

  return undefined
}

/** A state prefix on a class (`hover`, from `hover:`). */
const stateOf = (name: string) => /^([a-z-]+):/.exec(name)?.[1]

/** A state as the States menu names it: Hover, Focus visible. */
const stateName = (prefix: string) => {
  const words = prefix.replaceAll("-", " ")

  return `${words[0]!.toUpperCase()}${words.slice(1)}`
}

/**
 * Sorts pasted or typed text into the model: declarations (`a: b;`) or a string of classes. Each declaration a control
 * owns goes to it; the rest of what reads becomes rows; classes Parity can't read are kept as From the code; and
 * declarations that can't be read are listed, not dropped.
 */
export function sortIn(text: string, model: CssModel) {
  const owned = [...model.owned]
  const rows = [...model.rows]
  const fromCode = [...model.fromCode]
  const unreadable: string[] = []
  let given = 0
  let kept = 0

  const take = (property: string, value: string, tailwind?: string) => {
    const control = owners.get(property)

    if (control) {
      const name = tailwind ?? ownedClass(property, value)
      // A new value replaces the control's value in the same state; another state's stays.
      const others = owned.filter((each) => each.property !== property || stateOf(each.tailwind) !== stateOf(name))
      owned.splice(0, owned.length, ...others, { property, value, control, tailwind: name })
      given += 1

      return
    }

    const at = rows.findIndex((row) => row.property === property)

    if (at === -1) {
      rows.push({ id: nextId++, property, value })
    } else {
      rows[at] = { ...rows[at]!, value }
    }

    kept += 1
  }

  // Declarations have a space after their colon or end in a semicolon; a class's state prefix (`hover:`) has neither.
  if (text.includes(";") || /^[\s{]*[a-z-]+\s*:\s/i.test(text)) {
    for (const part of text.split(/[;\n]/)) {
      const declaration = /^\s*([a-z-]+)\s*:\s*(.+?)\s*$/i.exec(part)

      if (!declaration) {
        if (part.trim() !== "" && !/^[{}]/.test(part.trim())) {
          unreadable.push(part.trim())
        }

        continue
      }

      const [, property, value] = declaration

      if (takes(property.toLowerCase(), fillTokens(value))) {
        take(property.toLowerCase(), value)
      } else {
        unreadable.push(`${property}: ${value}`)
      }
    }
  } else {
    for (const name of text.split(/\s+/).filter(Boolean)) {
      const read = readClass(name)

      if (read && (stateOf(name) === undefined || owners.has(read.property))) {
        take(read.property, read.value, name)
      } else if (!fromCode.includes(name)) {
        fromCode.push(name)
      }
    }
  }

  const parts = [
    given > 0 && `${given} went to ${given === 1 ? "its control" : "their controls"}`,
    kept > 0 && `${kept} kept as ${kept === 1 ? "a row" : "rows"}`,
    unreadable.length > 0 && `couldn't read ${unreadable.join(", ")}`
  ].filter(Boolean)

  return { model: { rows, owned, fromCode }, summary: parts.join(", ") }
}

/** What the section writes: what each control was given, the rows that are on, and From the code's classes. */
export function cssWrites(model: CssModel): Writes {
  const on = model.rows.filter((row) => !row.off && row.property !== "" && rowReason(row) === undefined)
  const empty = model.owned.length === 0 && model.rows.length === 0 && model.fromCode.length === 0

  if (empty) {
    return { stored: undefined, css: [], tailwind: [] }
  }

  const stored: StoredObject = {}

  if (model.owned.length > 0) {
    stored.controls = Object.fromEntries(model.owned.map((each) => [each.tailwind, { [each.property]: each.value }]))
  }

  stored.css = model.rows.flatMap((row) => {
    if (row.property === "") {
      return []
    }

    const declaration: StoredObject = { property: row.property, value: row.value }

    if (row.off) {
      declaration.off = true
    }

    return [declaration]
  })

  if (model.fromCode.length > 0) {
    stored.fromCode = model.fromCode
  }

  return {
    stored,
    css: [
      ...model.owned.map(
        (each) =>
          `${stateOf(each.tailwind) ? `&:${stateOf(each.tailwind)} { ` : ""}${each.property}: ${each.value}${stateOf(each.tailwind) ? " }" : ""}`
      ),
      ...on.map((row) => `${row.property}: ${row.value}`)
    ],
    tailwind: [
      ...model.owned.map((each) => each.tailwind),
      ...on.map((row) => `[${row.property}:${arbitrary(row.value)}]`),
      ...model.fromCode
    ]
  }
}

/**
 * Whether a property takes a value: by its grammar in the ledger, then by the browser, which can refuse what a grammar
 * allows.
 */
function takes(property: string, value: string): boolean {
  return validate(property, value).valid && CSS.supports(property, value)
}

/** Why a row can't be written: an unknown property, or a value it doesn't take. */
function rowReason(row: CssRow): string | undefined {
  if (row.property === "") {
    return undefined
  }

  const custom = row.property.startsWith("--")

  if (!custom && !takes(row.property, "initial")) {
    return `${row.property} isn't a CSS property this browser knows`
  }

  if (row.value.trim() === "") {
    return `Give ${row.property} a value`
  }

  if (!takes(row.property, fillTokens(row.value))) {
    return `${row.property} can't be ${row.value}`
  }

  return undefined
}

interface Candidate {
  label: string
  detail?: string
  mark?: string
}

/** A text input with completion from a list: Up and Down move through it, and Tab or Enter take the highlighted one. */
function Completing({
  label,
  value,
  candidates,
  placeholder,
  className = "",
  sizeToContent = false,
  focusOnMount = false,
  wrap = false,
  onCommit
}: {
  label: string
  value: string
  candidates: (text: string) => Candidate[]
  placeholder?: string
  className?: string
  /** As wide as what's in it, as a property's name is, so its value has the rest of the line. */
  sizeToContent?: boolean
  /** Focused once it's drawn, as a row added with + is typed into at once. */
  focusOnMount?: boolean
  /**
   * Wraps onto more lines as it grows, as a declaration's value does (`box-shadow` with two layers), rather than
   * scrolling out of sight: a text box whose completions are announced through `aria-activedescendant`.
   */
  wrap?: boolean
  onCommit: (text: string) => void
}) {
  const [typed, setTyped] = useState<string>()
  const [highlight, setHighlight] = useState(0)
  const listId = useId()
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    if (focusOnMount) {
      input.current?.focus()
    }
  }, [focusOnMount])
  const list = typed === undefined ? [] : candidates(typed).slice(0, 8)
  const open = list.length > 0 && !(list.length === 1 && list[0]!.label === typed)

  const finish = (text: string) => {
    setTyped(undefined)
    onCommit(text)
  }

  const shared = {
    "aria-label": label,
    // The same combobox, one line or wrapping: it says whether its completions are open, and which is highlighted.
    ...comboboxProps({ listId, open, highlight }),
    ref: input,
    value: typed ?? value,
    placeholder,
    spellCheck: false,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setTyped(event.target.value)
      setHighlight(0)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault()
        setHighlight((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length)
      }

      if (open && (event.key === "Tab" || event.key === "Enter")) {
        event.preventDefault()
        finish(list[highlight]!.label)

        return
      }

      if (event.key === "Enter") {
        // A value is one line of CSS, so Enter commits it rather than starting another.
        event.preventDefault()

        if (typed !== undefined) {
          finish(typed)
        }
      }

      if (event.key === "Escape") {
        setTyped(undefined)
      }
    },
    onBlur: () => {
      if (typed !== undefined) {
        finish(typed)
      }
    }
  }

  const text = "bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground"

  return (
    <div className={`relative min-w-0 ${className}`}>
      {wrap ? (
        <textarea {...shared} rows={1} className={`${wrappingText} block w-full ${text}`} />
      ) : (
        <input
          {...shared}
          className={`${sizeToContent ? "field-sizing-content max-w-full min-w-[8ch]" : "w-full min-w-0"} ${text}`}
        />
      )}
      {open && (
        <SearchList
          id={listId}
          label={`${label} completions`}
          options={list.map((item) => ({
            key: item.label,
            content: (
              <>
                <span className="flex min-w-0 items-center gap-0.5 font-mono text-xs">
                  <span className="truncate">{item.label}</span>
                  {item.mark && <NotBaseline what={item.label} browsers={item.mark} />}
                </span>
                {item.detail && <span className="shrink-0 text-muted-foreground">{item.detail}</span>}
              </>
            )
          }))}
          highlight={highlight}
          className="absolute top-full left-0 z-30 mt-1 w-56"
          onHighlight={setHighlight}
          onPick={(index) => finish(list[index]!.label)}
        />
      )}
    </div>
  )
}

/**
 * CSS's own named easings, as a browser draws `transition-timing-function: ease-in` (Tailwind's `ease-in` is a
 * different curve, motion-data.ts's `easingPresets`).
 */
const cssEasings = new Map<string, Bezier>([
  ["ease", [0.25, 0.1, 0.25, 1]],
  ["ease-in", [0.42, 0, 1, 1]],
  ["ease-out", [0, 0, 0.58, 1]],
  ["ease-in-out", [0.42, 0, 0.58, 1]],
  ["linear", [0, 0, 1, 1]]
])

/** The easing a timing function draws, a curve or steps, read as the Easing field reads one; nothing where it isn't one. */
function easingOf(value: string): EasingPlot | undefined {
  const keyword = cssEasings.get(value.trim())

  if (keyword) {
    return { kind: "bezier", curve: keyword }
  }

  return readEasingValue(value)
}

const handles = ["Start handle x", "Start handle y", "End handle x", "End handle y"] as const

/** Each handle's place in the grid's first row, so a message under one spans the row below all four. */
const handleColumns = ["col-start-1", "col-start-2", "col-start-3", "col-start-4"] as const

/**
 * A curve's four numbers, each a field: typed with the app's maths, Up and Down by 0.01 (Shift 0.1), as the Easing
 * field's handles move. A handle's x stays from 0 to 1, as `cubic-bezier()` takes it.
 */
function CurveFields({ curve, onChange }: { curve: Bezier; onChange: (curve: Bezier) => void }) {
  const set = (index: number, number: number) => {
    const next: Bezier = [...curve]
    next[index] = index % 2 === 0 ? clamp(number, 0, 1) : number
    onChange(next)
  }

  return (
    <div className="grid grid-cols-4 gap-1">
      {handles.map((label, index) => (
        <ValueField
          key={label}
          label={label}
          shown={formatNumber(curve[index]!)}
          narrow
          rowClassName={`row-start-1 ${handleColumns[index]}`}
          read={(text): Reading<number> => {
            const reading = readNumber(text, curve[index], label)

            if ("clear" in reading) {
              return { reason: "Enter a number, such as 0.5" }
            }

            if ("reason" in reading) {
              return reading
            }

            if (index % 2 === 0 && (reading.value < 0 || reading.value > 1)) {
              return { reason: `${label} goes from 0 to 1` }
            }

            return { value: reading.value }
          }}
          onCommit={(number) => set(index, number)}
          onStep={(up, { shift }) => set(index, curve[index]! + (up ? 1 : -1) * (shift ? 0.1 : 0.01))}
        />
      ))}
    </div>
  )
}

/**
 * The inline preview in a value, as DevTools' Styles pane has them: a swatch for a color, a curve for a timing
 * function, a card for a shadow. Clicking one opens that type's editor.
 */
function InlinePreview({ row, onValue }: { row: CssRow; onValue: (value: string) => void }) {
  const filled = fillTokens(row.value)
  const easing = easingOf(row.value)
  let preview: ReactNode
  let editor: ReactNode

  if (easing) {
    preview = <CurveThumb plot={easing} size={12} />
    editor = (
      <div className="flex flex-col gap-2">
        <span className="grid h-24 place-items-center rounded bg-muted">
          <CurveThumb plot={easing} size={80} />
        </span>
        {easing.kind === "bezier" && (
          <CurveFields curve={easing.curve} onChange={(curve) => onValue(bezierCss(curve))} />
        )}
      </div>
    )
  } else if (row.property === "box-shadow" && CSS.supports("box-shadow", filled)) {
    preview = <TokenMark kind="shadow" value={filled} width={14} height={14} />
    editor = <TokenMark kind="shadow" value={filled} width={230} height={96} />
  } else if (CSS.supports("color", filled) && !/^(inherit|initial|unset|currentcolor|transparent)$/i.test(row.value)) {
    preview = <span className="block size-3 rounded-sm" style={swatch(filled)} />
    editor = isPlainColor(filled) ? (
      <ColorEditor value={filled} alpha={undefined} onChange={(next) => onValue(next)} />
    ) : (
      <div className="h-16 rounded" style={swatch(filled)} />
    )
  }

  if (!preview) {
    return null
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Edit ${row.property}'s value`}
        className="grid size-4 shrink-0 place-items-center rounded hover:bg-accent"
      >
        {preview}
      </PopoverTrigger>
      <PopoverContent aria-label={`${row.property}'s value`} align="start" className="w-64 p-3">
        {editor}
      </PopoverContent>
    </Popover>
  )
}

/** One declaration: its off checkbox, property and value, the value's preview and mark, and −. */
function Row({
  row,
  focus,
  onChange,
  onRemove,
  onOwned
}: {
  row: CssRow
  focus: boolean
  onChange: (row: CssRow) => void
  onRemove: () => void
  onOwned: (row: CssRow) => void
}) {
  const reason = rowReason(row)
  const owner = owners.get(row.property)
  const baseline = notBaseline.get(`${row.property}: ${row.value.trim()}`) ?? notBaseline.get(row.property)
  let message: Message | undefined

  if (reason) {
    message = { tone: "error", text: reason }
  } else if (owner) {
    message = {
      tone: "note",
      text: `${owner} sets ${row.property}.`,
      action: { label: "Move it there", run: () => onOwned(row) }
    }
  }

  return (
    <div className={row.off ? "opacity-50" : ""}>
      {/* A long declaration wraps its value onto a second line rather than cutting it, as DevTools' Styles pane does. */}
      <div
        className={`flex min-h-7 items-start gap-1.5 rounded-md border py-1 pr-1 pl-1.5 text-xs dark:bg-input/30 ${reason === undefined ? "" : "border-destructive"}`}
      >
        <Hint label={row.off ? "Turn on" : "Turn off without deleting"}>
          <Checkbox
            aria-label={`${row.property || "Declaration"} on`}
            checked={!row.off}
            onCheckedChange={(checked) => onChange({ ...row, off: !checked || undefined })}
            className="mt-0.5"
          />
        </Hint>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5">
          <Completing
            label="Property"
            value={row.property}
            placeholder="property"
            className="max-w-full"
            sizeToContent
            focusOnMount={focus}
            candidates={(text) =>
              knownProperties()
                .filter((name) => name.startsWith(text.toLowerCase()) && text !== "")
                .map((name) => ({ label: name, mark: notBaseline.get(name) }))
            }
            onCommit={(property) => onChange({ ...row, property: property.trim().toLowerCase() })}
          />
          <span className="font-mono text-xs text-muted-foreground">:</span>
          <span className="flex max-w-full min-w-28 grow items-center gap-1">
            <InlinePreview row={row} onValue={(value) => onChange({ ...row, value })} />
            <Completing
              label={`${row.property || "Property"} value`}
              value={row.value}
              placeholder="value"
              className="grow"
              wrap
              candidates={(text) =>
                valueCandidates(row.property)
                  .filter((each) => each.label.startsWith(text))
                  .map((each) => ({ ...each, mark: notBaseline.get(`${row.property}: ${each.label}`) }))
              }
              onCommit={(value) => onChange({ ...row, value: value.trim().replace(/;$/, "") })}
            />
          </span>
        </div>
        {baseline && <NotBaseline what={row.property} browsers={baseline} />}
        {reason && <InvalidMark />}
        <Hint label="Remove">
          <button
            type="button"
            aria-label={`Remove ${row.property || "declaration"}`}
            onClick={onRemove}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Minus className="size-3.5" />
          </button>
        </Hint>
      </div>
      <MessageLine message={message} />
    </div>
  )
}

/**
 * The CSS section: Classes at the top, a view of the same keys as Copy as Tailwind writes them, then a row per
 * declaration, From the code's classes read-only, and what's gone to the controls. + adds a row; pasting declarations
 * or classes anywhere in it sorts them.
 */
export function CssSection({ model, onChange }: { model: CssModel; onChange: (model: CssModel) => void }) {
  const [focusId, setFocusId] = useState<number>()
  const [classes, setClasses] = useState<string>()
  const [summary, setSummary] = useState<string>()
  const written = cssWrites(model).tailwind.join(" ")

  const paste = (text: string): boolean => {
    const looksSorted = text.includes(";") || /\s/.test(text.trim())

    if (!looksSorted) {
      return false
    }

    const sorted = sortIn(text, model)
    onChange(sorted.model)
    setSummary(sorted.summary)

    return true
  }

  const readClasses = (text: string) => {
    // Classes are a view of the same keys: what's typed replaces them, keeping rows that are off, which aren't written.
    const base: CssModel = { rows: model.rows.filter((row) => row.off), owned: [], fromCode: [] }
    const sorted = sortIn(text.trim(), base)
    onChange(sorted.model)
    setSummary(sorted.summary || undefined)
  }

  return (
    <PanelSection
      title="CSS"
      action={
        <Hint label="Add a declaration">
          <button
            type="button"
            aria-label="Add a declaration"
            onClick={() => {
              const id = nextId++
              setFocusId(id)
              onChange({ ...model, rows: [...model.rows, { id, property: "", value: "" }] })
            }}
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-4" />
          </button>
        </Hint>
      }
    >
      {/* Pasting declarations or classes into a row sorts them; the Classes field reads its own text when it's left. */}
      <div
        className="flex flex-col gap-1.5"
        onPaste={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("[data-classes]")) {
            return
          }

          if (paste(event.clipboardData.getData("text"))) {
            event.preventDefault()
          }
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Classes</span>
          <textarea
            data-classes
            aria-label="Classes"
            rows={2}
            spellCheck={false}
            value={classes ?? written}
            placeholder="Type or paste classes"
            onChange={(event) => setClasses(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.blur()
              }

              if (event.key === "Escape") {
                setClasses(undefined)
              }
            }}
            onBlur={() => {
              if (classes !== undefined && classes !== written) {
                readClasses(classes)
              }

              setClasses(undefined)
            }}
            className="field-sizing-content min-h-12 resize-y rounded-md border bg-transparent px-1.5 py-1 type-code font-mono outline-none focus:ring-2 focus:ring-ring dark:bg-input/30"
          />
        </label>
        {model.rows.map((row) => (
          <Row
            key={row.id}
            row={row}
            focus={row.id === focusId}
            onChange={(next) =>
              onChange({ ...model, rows: model.rows.map((each) => (each.id === row.id ? next : each)) })
            }
            onRemove={() => onChange({ ...model, rows: model.rows.filter((each) => each.id !== row.id) })}
            onOwned={(moved) => {
              const rest = { ...model, rows: model.rows.filter((each) => each.id !== moved.id) }
              const sorted = sortIn(`${moved.property}: ${moved.value};`, rest)
              onChange(sorted.model)
              setSummary(sorted.summary)
            }}
          />
        ))}
        {model.fromCode.map((name) => (
          <Hint
            key={name}
            label="From the code"
            detail="A class Parity can't read into a control. It's kept as written"
          >
            <div className="flex min-h-7 items-center justify-between gap-2 rounded-md border border-dashed px-1.5 py-1">
              <span className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">{name}</span>
              <span className="shrink-0 text-2xs text-muted-foreground">From the code</span>
            </div>
          </Hint>
        ))}
        {model.owned.length > 0 && (
          <div className="flex flex-col gap-0.5 pt-1">
            <GroupLabel>In their controls</GroupLabel>
            {model.owned.map((each) => (
              <div key={each.tailwind} className="flex items-start justify-between gap-2 px-0.5 text-xs">
                <span className="min-w-0 font-mono [overflow-wrap:anywhere]">{each.tailwind}</span>
                <span className="shrink-0 text-muted-foreground">
                  {stateOf(each.tailwind) ? `${each.control}, ${stateName(stateOf(each.tailwind)!)}` : each.control}
                </span>
              </div>
            ))}
          </div>
        )}
        {summary && <MessageLine message={{ tone: "note", text: `Pasted: ${summary}` }} />}
      </div>
    </PanelSection>
  )
}

/** Starts a story's model with a fresh id per row. */
export function cssModel(rows: Omit<CssRow, "id">[], fromCode: string[] = [], owned: Owned[] = []): CssModel {
  return { rows: rows.map((row) => ({ ...row, id: nextId++ })), owned, fromCode }
}
