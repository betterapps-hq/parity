import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import type { PreviewKind } from "@parity-app/tokens"
import { SlidersHorizontal } from "lucide-react"
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { swatch } from "../../chrome/token-previews.tsx"
import { arbitrary, formatNumber, lengthForm } from "./css-values.ts"
import {
  fieldBox,
  fieldInput,
  InvalidMark,
  type Message,
  MessageLine,
  MissingMark,
  type Reading,
  readNumber,
  SearchList,
  TokenChip,
  TokenMark,
  ValueField,
  wrappingText
} from "./field-parts.tsx"
import { colorTokens, type FieldToken, lengthToken, lengthVars } from "./tokens.ts"
import type { Writes } from "./writes.ts"

/*
 * Expression (PAR-186, design-options-values.md's Expression): `=` in any field opens an expression, which keeps
 * `calc()`, `min()`, `max()`, `clamp()`, `var()` and `color-mix()` as written. At rest it's a ValueField showing the
 * expression whole, cut to the field's width, and what it comes to (`calc(100% - 2rem) 648`), or `ƒ` in a field
 * under 96px. Focused, it opens over its row and
 * wraps a long expression, with completion and each `var()` drawn as a token chip; a `clamp()` opens its three fields.
 * What comes to a step or one token is stored as that, so `calc(var(--spacing) * 18)` is `{ step: 18 }`.
 */

/** The kind of preview a length token draws with: a spacing bar, a container's width, a size of text, a corner. */
function lengthKind(name: string): PreviewKind {
  if (name.startsWith("container-")) return "container"
  if (name.startsWith("text-")) return "font-size"
  if (name.startsWith("radius-")) return "radius"
  return "spacing"
}

/** The length tokens an expression can name (tokens.ts's `lengthVars`), each drawn by its kind's preview. */
const lengthTokens = Object.entries(lengthVars).map(([name, px]) => lengthToken(lengthKind(name), name, px))

/** A token named inside `var()`, without `--`: a color's as `color-primary`, a length's by its name. */
function namedToken(name: string): FieldToken | undefined {
  return (
    colorTokens.find((token) => `color-${token.name}` === name) ?? lengthTokens.find((token) => token.name === name)
  )
}

/** What a length expression is worked out against: the font size, the viewport, and what a % is of. */
export interface Basis {
  /** What 100% comes to: the parent's width for Width, the parent's font size for Font size. */
  percent: number
  fontSize?: number
  viewport?: { width: number; height: number }
}

type Lexeme =
  | { type: "number"; value: number; unit: string }
  | { type: "name"; value: string }
  | { type: "symbol"; value: string }

function lex(text: string): Lexeme[] | { reason: string } {
  const out: Lexeme[] = []
  let at = 0
  while (at < text.length) {
    const rest = text.slice(at)
    const space = /^\s+/.exec(rest)
    if (space) {
      at += space[0].length
      continue
    }
    const number = /^(\d*\.?\d+)(px|rem|em|vw|vh|%)?/i.exec(rest)
    if (number) {
      out.push({ type: "number", value: Number(number[1]), unit: (number[2] ?? "").toLowerCase() })
      at += number[0].length
      continue
    }
    const name = /^--?[a-z][\w-]*|^[a-z][\w-]*/i.exec(rest)
    if (name) {
      out.push({ type: "name", value: name[0].toLowerCase() })
      at += name[0].length
      continue
    }
    if ("+-*/(),".includes(rest[0]!)) {
      out.push({ type: "symbol", value: rest[0]! })
      at += 1
      continue
    }
    return { reason: `Can't read "${rest[0]}"` }
  }
  return out
}

/** A worked-out value: pixels, or a plain number to multiply or divide by. */
type Amount = { px: number; plain: false } | { px: number; plain: true }

/** Works out a length expression in pixels, or says why it can't. */
export function evaluateLength(text: string, basis: Basis): number | { reason: string } {
  const lexed = lex(text)
  if (!Array.isArray(lexed)) return lexed
  let at = 0
  const peek = () => lexed[at]
  const fail = (reason: string): never => {
    throw new Error(reason)
  }
  const expect = (symbol: string) => {
    const next = lexed[at]
    if (next?.type !== "symbol" || next.value !== symbol) {
      fail(symbol === ")" ? "A bracket isn't closed" : `Expected "${symbol}"`)
    }
    at += 1
  }
  const unitPx = (value: number, unit: string): Amount => {
    const viewport = basis.viewport ?? { width: 1280, height: 800 }
    const per: Record<string, number> = {
      px: 1,
      rem: 16,
      em: basis.fontSize ?? 16,
      vw: viewport.width / 100,
      vh: viewport.height / 100,
      "%": basis.percent / 100
    }
    if (unit === "") return { px: value, plain: true }
    return { px: value * per[unit]!, plain: false }
  }
  const args = (): Amount[] => {
    expect("(")
    const list = [sum()]
    while (peek()?.type === "symbol" && peek()!.value === ",") {
      at += 1
      list.push(sum())
    }
    expect(")")
    return list
  }
  const factor = (): Amount => {
    const next = peek()
    if (!next) return fail("It ends too soon")
    if (next.type === "symbol" && next.value === "-") {
      at += 1
      const operand = factor()
      return { ...operand, px: -operand.px }
    }
    if (next.type === "symbol" && next.value === "(") {
      at += 1
      const inner = sum()
      expect(")")
      return inner
    }
    if (next.type === "number") {
      at += 1
      return unitPx(next.value, next.unit)
    }
    if (next.type === "name") {
      at += 1
      if (next.value === "var") {
        expect("(")
        const variable = peek()
        if (variable?.type !== "name" || !variable.value.startsWith("--"))
          return fail("var() takes a token, such as --spacing")
        at += 1
        const name = variable.value.slice(2)
        let fallback: Amount | undefined
        if (peek()?.type === "symbol" && peek()!.value === ",") {
          at += 1
          fallback = sum()
        }
        expect(")")
        const px = lengthVars[name]
        if (px === undefined && fallback) return fallback
        if (px === undefined) return fail(`There's no --${name} token`)
        return { px, plain: false }
      }
      const list = args()
      const lengths = list.map((amount) => amount.px)
      if (next.value === "calc") {
        if (list.length !== 1) return fail("calc() takes one sum")
        return list[0]!
      }
      if (next.value === "min") return { px: Math.min(...lengths), plain: false }
      if (next.value === "max") return { px: Math.max(...lengths), plain: false }
      if (next.value === "clamp") {
        if (list.length !== 3) return fail("clamp() takes three values: least, preferred and most")
        return { px: Math.min(Math.max(lengths[1]!, lengths[0]!), lengths[2]!), plain: false }
      }
      return fail(`${next.value}() isn't a function a length takes`)
    }
    if (next.value === ")" || next.value === ",") return fail(`Something's missing before "${next.value}"`)
    return fail(`Can't read "${next.value}" there`)
  }
  const product = (): Amount => {
    let left = factor()
    while (peek()?.type === "symbol" && (peek()!.value === "*" || peek()!.value === "/")) {
      const op = peek()!.value
      at += 1
      const right = factor()
      if (op === "*") {
        if (!left.plain && !right.plain) fail("Two lengths can't be multiplied")
        left = { px: left.px * right.px, plain: left.plain && right.plain } as Amount
      } else {
        if (!right.plain) fail("Divide by a number, not a length")
        if (right.px === 0) fail("It can't divide by 0")
        left = { px: left.px / right.px, plain: left.plain } as Amount
      }
    }
    return left
  }
  function sum(): Amount {
    let left = product()
    while (peek()?.type === "symbol" && (peek()!.value === "+" || peek()!.value === "-")) {
      const op = peek()!.value
      at += 1
      const right = product()
      if (left.plain !== right.plain) fail("A length and a plain number can't be added")
      left = { px: op === "+" ? left.px + right.px : left.px - right.px, plain: left.plain } as Amount
    }
    return left
  }
  try {
    const result = sum()
    if (at < lexed.length) return { reason: `Can't read what's after ${text.slice(0, 24)}` }
    return result.px
  } catch (error) {
    return { reason: (error as Error).message }
  }
}

/** The CSS with each token's `var()` filled in, as `CSS.supports` checks it and the swatch draws it. */
export function fillTokens(text: string): string {
  return text.replaceAll(/var\(--([\w-]+)\)/g, (whole, name: string) => {
    if (name.startsWith("color-")) return colorTokens.find((token) => `color-${token.name}` === name)?.hex ?? whole
    const px = lengthVars[name]
    return px === undefined ? whole : `${px}px`
  })
}

/** What an expression is stored as: its simplest form, so it reads back the same way. */
export type Simplest = { token: string; alpha?: { step: number } } | { step: number } | { value: string }

export function simplest(text: string): Simplest {
  const trimmed = text.trim()
  const token = /^var\(--([\w-]+)\)$/.exec(trimmed)?.[1]
  if (token !== undefined && token !== "spacing") return { token: token.replace(/^color-/, "") }
  const step = /^calc\(\s*var\(--spacing\)\s*\*\s*(\d*\.?\d+)\s*\)$/.exec(trimmed)?.[1]
  if (step !== undefined) return { step: Number(step) }
  const mix = /^color-mix\(\s*in\s+oklab\s*,\s*var\(--color-([\w-]+)\)\s+(\d*\.?\d+)%\s*,\s*transparent\s*\)$/.exec(
    trimmed
  )
  if (mix) return { token: mix[1]!, alpha: { step: Number(mix[2]) } }
  // Whole pixels are a spacing step, as every length writes them.
  const px = /^(\d*\.?\d+)(px)?$/.exec(trimmed)?.[1]
  const form = px === undefined ? undefined : lengthForm(Number(px))
  if (form !== undefined && "step" in form) return form
  return { value: trimmed }
}

/** What an expression field writes, in its simplest form. */
export function expressionWrites(property: string, prefix: string, text: string | undefined): Writes {
  if (text === undefined) return { stored: undefined, css: [], tailwind: [] }
  const form = simplest(text)
  if ("step" in form) {
    return {
      stored: form,
      css: [`${property}: calc(var(--spacing) * ${form.step})`],
      tailwind: [`${prefix}-${form.step}`]
    }
  }
  if ("token" in form && form.alpha) {
    return {
      stored: form,
      css: [`${property}: color-mix(in oklab, var(--color-${form.token}) ${form.alpha.step}%, transparent)`],
      tailwind: [`${prefix}-${form.token}/${form.alpha.step}`]
    }
  }
  if ("token" in form) {
    const variable = property.includes("color") ? `--color-${form.token}` : `--${form.token}`
    return { stored: form, css: [`${property}: var(${variable})`], tailwind: [`${prefix}-(${variable})`] }
  }
  return { stored: form, css: [`${property}: ${form.value}`], tailwind: [`${prefix}-[${arbitrary(form.value)}]`] }
}

// The functions offered, each with the kinds of field it gives a value for, so a field lists only what it can take.
const functions: { name: string; detail: string; kinds: readonly ("length" | "color")[] }[] = [
  { name: "calc(", detail: "Maths that mixes units: calc(100% - 2rem)", kinds: ["length"] },
  { name: "min(", detail: "The smallest: min(100%, 40rem)", kinds: ["length"] },
  { name: "max(", detail: "The largest: max(16rem, 30vw)", kinds: ["length"] },
  { name: "clamp(", detail: "Least, preferred, most: clamp(1rem, 2vw, 2rem)", kinds: ["length"] },
  { name: "color-mix(", detail: "Two colors mixed: color-mix(in oklab, red 50%, blue)", kinds: ["color"] },
  { name: "var(--", detail: "A token", kinds: ["length", "color"] }
]

/** A completion: what it puts in, how it's named, the token it names, and what it is. */
interface Completion {
  text: string
  label: string
  token?: FieldToken
  detail?: string
}

/** The completions for what's being typed before the caret: functions, or tokens inside `var(`. */
function completionsFor(
  text: string,
  caret: number,
  kind: "length" | "color"
): { replace: number; items: Completion[] } | undefined {
  const before = text.slice(0, caret)
  const variable = /var\(--([\w-]*)$/.exec(before)
  if (variable) {
    const names = kind === "color" ? colorTokens.map((token) => `color-${token.name}`) : Object.keys(lengthVars)
    return {
      replace: variable[1]!.length,
      items: names
        .filter((name) => name.startsWith(variable[1]!))
        .slice(0, 8)
        .map((name) => {
          const token = namedToken(name)
          return { text: `${name})`, label: `--${name}`, token, detail: token?.detail }
        })
    }
  }
  // Where a value can start, at the start or an argument's, every function is offered before anything's typed, so `=`
  // shows what an expression can be.
  const starting = /(?:^|[(,])\s*$/.test(before)
  const word = starting ? "" : /(?:^|[^\w-])([a-z][\w-]*)$/i.exec(before)?.[1]
  if (word === undefined) return undefined
  const items = functions
    .filter((fn) => fn.kinds.includes(kind) && fn.name.startsWith(word.toLowerCase()) && fn.name !== `${word}(`)
    .map((fn) => ({ text: fn.name, label: fn.name.replace("(", "()").replace("var()--", "var(--"), detail: fn.detail }))
  return items.length > 0 ? { replace: word.length, items } : undefined
}

/** The expression with each `var()` drawn as a token chip, as the editor shows it under what's typed. */
function WithChips({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(/var\(--([\w-]+)\)/g)) {
    parts.push(text.slice(last, match.index))
    const name = match[1]!
    const token = namedToken(name)
    parts.push(
      <TokenChip
        key={`${match.index}`}
        name={name.replace(/^color-/, "")}
        token={token}
        struck={token === undefined}
        detail={token?.kind === "color" ? undefined : token?.detail}
      />
    )
    last = match.index + match[0].length
  }
  parts.push(text.slice(last))
  return <span className="inline-flex flex-wrap items-center gap-0.5 font-mono text-[11px]">{parts}</span>
}

/** The three values inside a top-level `clamp()`, or undefined when it isn't one. */
function clampParts(text: string): [string, string, string] | undefined {
  const inner = /^clamp\((.*)\)$/s.exec(text.trim())?.[1]
  if (inner === undefined) return undefined
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < inner.length; index++) {
    const char = inner[index]
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      parts.push(inner.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(inner.slice(start).trim())
  return parts.length === 3 ? [parts[0]!, parts[1]!, parts[2]!] : undefined
}

/**
 * A field whose value can be an expression, on ValueField. A plain length types as any length field does; `=` opens
 * the expression, widened to the row, with completion for `calc()`, `min()`, `max()`, `clamp()`, `color-mix()` and
 * tokens inside `var()`, those the field can take listed where a value starts, before anything's typed. Enter checks it with
 * `CSS.supports` and stores it in its simplest form; Escape, or Backspace with nothing typed, puts it back. Each puts
 * focus back on the field. At rest an expression shows itself whole and what it comes to, and focusing
 * it, clicking it or pressing Enter in it opens it again; a `clamp()` opens its three fields instead.
 */
export function ExpressionField({
  label,
  property,
  kind = "length",
  value,
  basis = { percent: 680 },
  narrow = false,
  onChange
}: {
  label: string
  property: string
  kind?: "length" | "color"
  /** The CSS value as written: `320px`, `calc(100% - 2rem)`, `var(--container-md)`. */
  value: string | undefined
  basis?: Basis
  /** Under 96px, as a side or a corner is, where an expression shows as ƒ. */
  narrow?: boolean
  onChange: (value: string | undefined) => void
}) {
  const [editing, setEditing] = useState<string>()
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const [message, setMessage] = useState<Message>()
  const [clampOpen, setClampOpen] = useState(false)
  const editor = useRef<HTMLTextAreaElement>(null)
  const field = useRef<HTMLDivElement>(null)
  // Set while Enter or Escape puts focus back on the field, so the editor's blur doesn't commit again.
  const returning = useRef(false)
  const listId = useId()
  const form = value === undefined ? undefined : simplest(value)
  const isExpression = form !== undefined && "value" in form && !/^\d/.test(form.value)
  const comesTo = kind === "length" && value !== undefined ? evaluateLength(value, basis) : undefined
  const completions = editing === undefined ? undefined : completionsFor(editing, caret, kind)
  const check = (text: string): string | undefined => {
    if (kind === "length") {
      const result = evaluateLength(text, basis)
      if (typeof result !== "number") return result.reason
    }
    if (!CSS.supports(property, fillTokens(text))) return `${label} can't be ${text}`
    return undefined
  }
  const open = (text: string) => {
    setEditing(text)
    setMessage(undefined)
    setHighlight(0)
    requestAnimationFrame(() => {
      editor.current?.focus()
      editor.current?.setSelectionRange(text.length, text.length)
      setCaret(text.length)
    })
  }
  /** Closes the editor, if what's typed can be stored or `leaving` puts the value back; says whether it closed. */
  const commit = (leaving: boolean): boolean => {
    if (editing === undefined) return false
    const text = editing.trim()
    if (text === "") {
      onChange(undefined)
      setEditing(undefined)
      setMessage(undefined)
      return true
    }
    const reason = check(text)
    if (reason && !leaving) {
      setMessage({ tone: "error", text: reason })
      return false
    }
    if (reason) setMessage({ tone: "note", text: `${label} is back to ${value ?? "unset"}. ${reason}.` })
    else {
      onChange(text)
      setMessage(undefined)
    }
    setEditing(undefined)
    return true
  }
  // The editor goes once it's closed, so focus goes back to the field rather than to the page.
  const backToField = () => {
    returning.current = true
    field.current?.querySelector("input")?.focus()
    returning.current = false
  }
  const accept = (index: number) => {
    if (!completions || editing === undefined) return
    const item = completions.items[index]
    if (!item) return
    const start = caret - completions.replace
    const next = `${editing.slice(0, start)}${item.text}${editing.slice(caret)}`
    const at = start + item.text.length
    setEditing(next)
    setCaret(at)
    setHighlight(0)
    requestAnimationFrame(() => editor.current?.setSelectionRange(at, at))
  }
  const onEditorKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const listOpen = completions !== undefined && completions.items.length > 0
    if (listOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault()
      const count = completions.items.length
      setHighlight((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + count) % count)
      return
    }
    if (listOpen && (event.key === "Tab" || (event.key === "Enter" && completions.replace > 0))) {
      event.preventDefault()
      accept(highlight)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      if (commit(false)) backToField()
    }
    // Backspace with nothing typed takes the `=` away too: the editor closes and the value stays as it was.
    const emptied = event.key === "Backspace" && editing === ""
    if (emptied) event.preventDefault()
    if (event.key === "Escape" || emptied) {
      event.stopPropagation()
      setEditing(undefined)
      setMessage(
        message?.tone === "error" ? { tone: "note", text: `${label} is back to ${value ?? "unset"}.` } : undefined
      )
      backToField()
    }
  }
  const came = typeof comesTo === "number" ? formatNumber(comesTo) : undefined
  const clamp = value === undefined || narrow ? undefined : clampParts(value)
  const held = form !== undefined && "token" in form && kind === "length" ? form.token : undefined
  const heldToken = held === undefined ? undefined : namedToken(held)
  const px = form !== undefined && "step" in form ? form.step * 4 : undefined
  // At rest: a plain length or step types as usual, a token is a chip, and an expression shows itself whole, so
  // what was written is still there to read when the field isn't focused.
  const atRest = isExpression || (kind === "color" && value !== undefined)
  let shown = px === undefined ? undefined : formatNumber(px)
  let restComesTo = heldToken?.detail
  let restClass = ""
  let inner: ReactNode
  let hint: { label?: string; detail?: string } = { label: "Type = for an expression" }
  if (atRest) {
    shown = form !== undefined && "token" in form ? form.token : value!.trim()
    if (narrow) shown = "ƒ"
    // Code, as it was typed; ƒ is a mark, not code.
    if (isExpression) restClass = narrow ? "text-center font-serif italic" : "font-mono"
    restComesTo = form !== undefined && "token" in form && form.alpha ? `${form.alpha.step}%` : came
    let detail = came ? `Comes to ${came}px` : "Click to edit"
    if (clamp) detail = "Opens its least, preferred and most values"
    hint = { label: `${label}: ${value}`, detail }
  }
  if (kind === "color" && value !== undefined) {
    inner = <span aria-hidden className="size-3.5 shrink-0 rounded-sm" style={swatch(fillTokens(value))} />
  }
  const read = (text: string): Reading<string | undefined> => {
    const trimmed = text.trim()
    if (trimmed === "") return { value: undefined }
    const token = lengthTokens.find((each) => each.name === trimmed || `--${each.name}` === trimmed)
    if (token) return { value: `var(--${token.name})` }
    const reading = readNumber(trimmed.replace(/px$/, ""), px, label)
    if ("reason" in reading) return { reason: `${reading.reason}. Type = for an expression` }
    if ("clear" in reading) return { value: undefined }
    return { value: `${reading.value}px` }
  }
  let onOpen: (() => void) | undefined
  if (clamp) onOpen = () => setClampOpen(true)
  else if (atRest) onOpen = () => open(value!)
  const error = message?.tone === "error"
  const editedComesTo = editing === undefined || kind !== "length" ? undefined : evaluateLength(editing, basis)
  const showList = completions !== undefined && completions.items.length > 0
  return (
    <div ref={field} className="relative">
      <ValueField
        label={label}
        inner={inner}
        shown={shown}
        placeholder="0"
        chip={held === undefined ? undefined : { name: held, token: heldToken, onRemove: () => onChange(undefined) }}
        unit={atRest ? undefined : "px"}
        comesTo={restComesTo}
        status={{ missing: held !== undefined && !heldToken ? <MissingMark name={held} /> : undefined }}
        narrow={narrow}
        hint={hint}
        description={atRest ? value : undefined}
        inputClassName={restClass}
        expression={{ onEquals: open, onOpen }}
        trailing={
          clamp && (
            <Popover open={clampOpen} onOpenChange={setClampOpen}>
              <Hint label="Least, preferred and most">
                <PopoverTrigger
                  aria-label={`${label}'s least, preferred and most`}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
                >
                  <SlidersHorizontal className="size-3.5" />
                </PopoverTrigger>
              </Hint>
              <PopoverContent align="end" className="w-64 gap-2 p-3">
                <ClampFields
                  label={label}
                  parts={clamp}
                  basis={basis}
                  onChange={(parts) => onChange(`clamp(${parts.join(", ")})`)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setClampOpen(false)
                    open(value!)
                  }}
                  className="self-start rounded px-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Edit as text
                </button>
              </PopoverContent>
            </Popover>
          )
        }
        read={read}
        onCommit={onChange}
      />
      {editing !== undefined && (
        // Focused, it opens over its row, at least 15rem wide, as Webflow's = editor opens wide.
        <div className="absolute top-0 left-0 z-30 flex w-full min-w-60 flex-col gap-1.5 rounded-md border bg-popover p-1.5 text-popover-foreground shadow-md">
          <label className={fieldBox(error, "h-auto! min-h-7 items-start! bg-background py-1.5")}>
            <span aria-hidden className="shrink-0 font-mono leading-4 text-muted-foreground">
              =
            </span>
            <textarea
              ref={editor}
              data-expression-editor
              rows={1}
              aria-label={`${label} expression`}
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={showList ? `${listId}-${highlight}` : undefined}
              aria-invalid={error || undefined}
              value={editing}
              onChange={(event) => {
                setEditing(event.target.value)
                setCaret(event.target.selectionStart ?? event.target.value.length)
                setHighlight(0)
                if (error) setMessage(undefined)
              }}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={onEditorKey}
              onBlur={() => {
                if (!returning.current) commit(true)
              }}
              className={`${fieldInput} ${wrappingText} font-mono leading-4`}
            />
            {error && <InvalidMark />}
          </label>
          {showList && (
            <SearchList
              id={listId}
              label="Completions"
              options={completions.items.map((item) => ({
                key: item.label,
                content: (
                  <>
                    <span className="flex items-center gap-1.5 font-mono">
                      {item.token && (
                        <TokenMark kind={item.token.kind} value={item.token.value} name={item.token.name} />
                      )}
                      {item.label}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">{item.detail}</span>
                  </>
                )
              }))}
              highlight={highlight}
              className="shadow-none"
              onHighlight={setHighlight}
              onPick={accept}
            />
          )}
          <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
            <WithChips text={editing} />
            {typeof editedComesTo === "number" && (
              <span className="shrink-0">Comes to {formatNumber(editedComesTo)}px</span>
            )}
            {kind === "color" && (
              <span aria-hidden className="size-3.5 shrink-0 rounded-sm" style={swatch(fillTokens(editing))} />
            )}
          </div>
          <MessageLine message={message} />
        </div>
      )}
      {editing === undefined && <MessageLine message={message} />}
    </div>
  )
}

/** A `clamp()`'s three values, least, preferred and most, each a field of its own with what it comes to. */
function ClampFields({
  label,
  parts,
  basis,
  onChange
}: {
  label: string
  parts: readonly [string, string, string]
  basis: Basis
  onChange: (parts: readonly string[]) => void
}) {
  const names = ["Least", "Preferred", "Most"] as const
  const total = evaluateLength(`clamp(${parts.join(", ")})`, basis)
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium">
        {label}: clamp
        {typeof total === "number" && <span className="text-muted-foreground"> comes to {formatNumber(total)}px</span>}
      </p>
      {names.map((name, index) => {
        const each = evaluateLength(parts[index], basis)
        return (
          <ValueField
            key={name}
            label={`${label} ${name.toLowerCase()}`}
            inner={name}
            shown={parts[index]}
            comesTo={typeof each === "number" ? formatNumber(each) : undefined}
            inputMode="text"
            inputClassName="font-mono"
            read={(text): Reading<string> => {
              const result = evaluateLength(text, basis)
              return typeof result === "number" ? { value: text.trim() } : { reason: result.reason }
            }}
            onCommit={(text) => onChange(parts.map((part, at) => (at === index ? text : part)))}
          />
        )
      })}
    </div>
  )
}
