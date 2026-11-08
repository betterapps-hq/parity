/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the completions are a combobox's listbox of functions and tokens, each with what it is beside it, which a datalist can't draw */
import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import type { PreviewKind } from "@parity-app/tokens"
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { swatch } from "../../chrome/token-previews.tsx"
import { colorTokens } from "./data.ts"
import {
  fieldBox,
  fieldInput,
  formatNumber,
  InvalidMark,
  type Message,
  MessageLine,
  readNumber,
  TokenChip,
  TokenMark
} from "./field-parts.tsx"
import type { Writes } from "./writes.ts"

/*
 * Expression (PAR-186, design-options-values.md's Expression): `=` in any field opens an expression, which keeps
 * `calc()`, `min()`, `max()`, `clamp()`, `var()` and `color-mix()` as written. At rest it's the function's name and what
 * it comes to (`clamp 24`), or `ƒ` in a field under 96px. Focused, it widens to the row, with completion and each
 * `var()` drawn as a token chip; a `clamp()` opens its three fields. What comes to a step or one token is stored as
 * that, so `calc(var(--spacing) * 18)` is `{ step: 18 }`.
 */

/** The length tokens an expression can name, in pixels. */
export const lengthVars: Record<string, number> = {
  spacing: 4,
  "container-sm": 384,
  "container-md": 448,
  "container-lg": 512,
  "text-base": 16,
  "text-xl": 20,
  "radius-lg": 10
}

/** The kind of preview a length token draws with: a spacing bar, a container's width, a size of text, a corner. */
function lengthKind(name: string): PreviewKind {
  if (name.startsWith("container-")) return "container"
  if (name.startsWith("text-")) return "font-size"
  if (name.startsWith("radius-")) return "radius"
  return "spacing"
}

/** A length token's preview, as the Tokens panel draws it. */
function LengthMark({ name }: { name: string }) {
  return <TokenMark kind={lengthKind(name)} value={`${lengthVars[name] ?? 0}px`} name={name} />
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
  const px = /^(\d*\.?\d+)(px)?$/.exec(trimmed)?.[1]
  if (px !== undefined && Number.isInteger(Number(px))) return { step: Number(px) / 4 }
  return { value: trimmed }
}

/** An expression in a Tailwind class's brackets: no spaces inside brackets or around commas and operators, `_` for the rest. */
export function arbitrary(text: string): string {
  return text
    .trim()
    .replaceAll(/\(\s+/g, "(")
    .replaceAll(/\s+\)/g, ")")
    .replaceAll(/\s*,\s*/g, ",")
    .replaceAll(/\s+([+\-*/])\s+/g, "$1")
    .replaceAll(/\s+/g, "_")
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

const functions = [
  { name: "calc(", detail: "Maths that mixes units: calc(100% - 2rem)" },
  { name: "min(", detail: "The smallest: min(100%, 40rem)" },
  { name: "max(", detail: "The largest: max(16rem, 30vw)" },
  { name: "clamp(", detail: "Least, preferred, most: clamp(1rem, 2vw, 2rem)" },
  { name: "color-mix(", detail: "Two colors mixed: color-mix(in oklab, red 50%, blue)" },
  { name: "var(--", detail: "A token" }
]

/** The completions for what's being typed before the caret: functions, or tokens inside `var(`. */
function completionsFor(text: string, caret: number, kind: "length" | "color") {
  const before = text.slice(0, caret)
  const variable = /var\(--([\w-]*)$/.exec(before)
  if (variable) {
    const names = kind === "color" ? colorTokens.map((token) => `color-${token.name}`) : Object.keys(lengthVars)
    return {
      replace: variable[1]!.length,
      items: names
        .filter((name) => name.startsWith(variable[1]!))
        .slice(0, 8)
        .map((name) => ({
          text: `${name})`,
          label: `--${name}`,
          token: kind === "color" ? undefined : name,
          color: kind === "color" ? colorTokens.find((token) => `color-${token.name}` === name)?.hex : undefined,
          detail:
            kind === "color"
              ? colorTokens.find((token) => `color-${token.name}` === name)?.hex
              : `${lengthVars[name]}px`
        }))
    }
  }
  const word = /(?:^|[^\w-])([a-z][\w-]*)$/i.exec(before)?.[1]
  if (word === undefined) return undefined
  const items = functions
    .filter((fn) => fn.name.startsWith(word.toLowerCase()) && fn.name !== `${word}(`)
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
    const color = colorTokens.find((token) => `color-${token.name}` === name)
    parts.push(
      <TokenChip
        key={`${match.index}`}
        name={name.replace(/^color-/, "")}
        detail={color ? undefined : `${lengthVars[name] ?? "?"}px`}
        preview={color ? <span className="size-3 rounded-sm" style={swatch(color.hex)} /> : <LengthMark name={name} />}
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
 * A field whose value can be an expression. A plain length types as any length field does; `=` opens the expression,
 * widened to the row, with completion for `calc()`, `min()`, `max()`, `clamp()`, `color-mix()` and tokens inside
 * `var()`. Enter checks it with `CSS.supports` and stores it in its simplest form; Escape puts it back.
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
  const [plain, setPlain] = useState<string>()
  const editor = useRef<HTMLInputElement>(null)
  const listId = useId()
  const form = value === undefined ? undefined : simplest(value)
  const isExpression = form !== undefined && "value" in form && !/^\d/.test(form.value)
  const fn = isExpression ? (/^([a-z-]+)\(/.exec(value!.trim())?.[1] ?? value!.trim()) : undefined
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
  const commit = (leaving: boolean) => {
    if (editing === undefined) return
    const text = editing.trim()
    if (text === "") {
      onChange(undefined)
      setEditing(undefined)
      setMessage(undefined)
      return
    }
    const reason = check(text)
    if (reason && !leaving) {
      setMessage({ tone: "error", text: reason })
      return
    }
    if (reason) setMessage({ tone: "note", text: `${label} is back to ${value ?? "unset"}. ${reason}.` })
    else {
      onChange(text)
      setMessage(undefined)
    }
    setEditing(undefined)
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
  const onEditorKey = (event: KeyboardEvent<HTMLInputElement>) => {
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
      commit(false)
    }
    if (event.key === "Escape") {
      event.stopPropagation()
      setEditing(undefined)
      setMessage(
        message?.tone === "error" ? { tone: "note", text: `${label} is back to ${value ?? "unset"}.` } : undefined
      )
    }
  }
  // At rest: a plain length or step types as usual, a token is a chip, and an expression shows its function.
  let rest: ReactNode
  const came = typeof comesTo === "number" ? formatNumber(comesTo) : undefined
  const clamp = value === undefined ? undefined : clampParts(value)
  if (isExpression && narrow) {
    rest = (
      <Hint label={`${label}: ${value}`} detail={came ? `Comes to ${came}px` : undefined}>
        <button
          type="button"
          aria-label={`${label}: ${value}`}
          onClick={() => open(value!)}
          className={fieldBox(false, "w-full justify-center font-serif italic outline-none")}
        >
          {"ƒ"}
        </button>
      </Hint>
    )
  } else if (isExpression && clamp) {
    rest = (
      <Popover>
        <Hint label={`${label}: ${value}`} detail="Opens its least, preferred and most values" wait>
          <PopoverTrigger
            aria-label={`${label}: ${value}`}
            className={`${fieldBox(false, "w-full justify-between outline-none")} data-popup-open:ring-2 data-popup-open:ring-ring`}
          >
            <span>{fn}</span>
            <span className="text-muted-foreground tabular-nums">{came}</span>
          </PopoverTrigger>
        </Hint>
        <PopoverContent align="start" className="w-64 gap-2 p-3">
          <ClampFields
            label={label}
            parts={clamp}
            basis={basis}
            onChange={(parts) => onChange(`clamp(${parts.join(", ")})`)}
          />
          <button
            type="button"
            onClick={() => open(value!)}
            className="self-start rounded px-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Edit as text
          </button>
        </PopoverContent>
      </Popover>
    )
  } else if (isExpression || (kind === "color" && value !== undefined)) {
    rest = (
      <Hint label={`${label}: ${value}`} detail={came ? `Comes to ${came}px` : "Click to edit"} wait>
        <button
          type="button"
          aria-label={`${label}: ${value}`}
          onClick={() => open(value!)}
          className={fieldBox(false, "w-full justify-between outline-none")}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {kind === "color" && (
              <span aria-hidden className="size-3.5 shrink-0 rounded-sm" style={swatch(fillTokens(value!))} />
            )}
            <span className="truncate">{form && "token" in form && kind === "color" ? `${form.token}` : fn}</span>
            {form && "token" in form && form.alpha && <span className="text-muted-foreground">{form.alpha.step}%</span>}
          </span>
          {came && <span className="text-muted-foreground tabular-nums">{came}</span>}
        </button>
      </Hint>
    )
  } else if (form !== undefined && "token" in form) {
    rest = (
      <label className={fieldBox(false)}>
        <TokenChip
          name={form.token}
          detail={`${lengthVars[form.token] ?? ""}px`}
          preview={<LengthMark name={form.token} />}
          onRemove={() => onChange(undefined)}
        />
        <input
          aria-label={label}
          value=""
          onChange={(event) => open(event.target.value.replace(/^=/, ""))}
          onKeyDown={(event) => {
            if (event.key === "Backspace") onChange(undefined)
          }}
          className={fieldInput}
        />
      </label>
    )
  } else {
    const px = form !== undefined && "step" in form ? form.step * 4 : undefined
    rest = (
      <label className={fieldBox(false)}>
        <input
          aria-label={label}
          inputMode="decimal"
          placeholder="0"
          value={plain ?? (px === undefined ? "" : formatNumber(px))}
          onChange={(event) => {
            const text = event.target.value
            if (text.startsWith("=")) {
              setPlain(undefined)
              open(text.slice(1))
            } else setPlain(text)
          }}
          onBlur={() => setPlain(undefined)}
          onKeyDown={(event) => {
            // = opens an expression, starting from nothing.
            if (event.key === "=") {
              event.preventDefault()
              setPlain(undefined)
              open("")
              return
            }
            if (event.key !== "Enter" || plain === undefined) return
            const reading = readNumber(plain.replace(/px$/, ""), px, label)
            if ("value" in reading) onChange(`${reading.value}px`)
            if ("clear" in reading) onChange(undefined)
            if ("reason" in reading) setMessage({ tone: "error", text: `${reading.reason}. Type = for an expression` })
            else setMessage(undefined)
            setPlain(undefined)
          }}
          className={fieldInput}
        />
        <Hint label="Type = for an expression">
          <span className="shrink-0 text-muted-foreground">px</span>
        </Hint>
      </label>
    )
  }
  const error = message?.tone === "error"
  const editedComesTo = editing === undefined || kind !== "length" ? undefined : evaluateLength(editing, basis)
  return (
    <div className="relative">
      {rest}
      {editing !== undefined && (
        // Focused, it widens to the row, label and all, as Webflow's = editor opens wide.
        <div className="absolute top-0 -left-24 z-30 flex w-[calc(100%+6rem)] flex-col gap-1.5 rounded-md border bg-popover p-1.5 text-popover-foreground shadow-md">
          <label className={fieldBox(error, "bg-background")}>
            <span aria-hidden className="shrink-0 font-mono text-muted-foreground">
              =
            </span>
            <input
              ref={editor}
              role="combobox"
              aria-label={`${label} expression`}
              aria-expanded={completions !== undefined && completions.items.length > 0}
              aria-controls={listId}
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
              onBlur={() => commit(true)}
              className={`${fieldInput} font-mono`}
            />
            {error && <InvalidMark />}
          </label>
          {completions !== undefined && completions.items.length > 0 && (
            <div id={listId} role="listbox" aria-label="Completions" className="flex flex-col rounded border p-0.5">
              {completions.items.map((item, index) => (
                <div
                  key={item.label}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === highlight}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    accept(index)
                  }}
                  onPointerEnter={() => setHighlight(index)}
                  className={`flex cursor-default items-center justify-between gap-2 rounded-sm px-1.5 py-1 text-xs ${index === highlight ? "bg-accent" : ""}`}
                >
                  <span className="flex items-center gap-1.5 font-mono">
                    {"token" in item && item.token !== undefined && <LengthMark name={item.token} />}
                    {"color" in item && item.color !== undefined && (
                      <span aria-hidden className="size-3 shrink-0 rounded-sm" style={swatch(item.color)} />
                    )}
                    {item.label}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">{item.detail}</span>
                </div>
              ))}
            </div>
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

/** A `clamp()`'s three fields: least, preferred and most, each its own expression, and what the clamp comes to. */
function ClampFields({
  label,
  parts,
  basis,
  onChange
}: {
  label: string
  parts: [string, string, string]
  basis: Basis
  onChange: (parts: [string, string, string]) => void
}) {
  const [typed, setTyped] = useState<[string?, string?, string?]>([])
  const [message, setMessage] = useState<Message>()
  const names = ["Least", "Preferred", "Most"] as const
  const total = evaluateLength(`clamp(${parts.join(", ")})`, basis)
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium">
        {label}: clamp
        {typeof total === "number" && <span className="text-muted-foreground"> comes to {formatNumber(total)}px</span>}
      </p>
      {names.map((name, index) => {
        const commit = () => {
          const text = typed[index]
          if (text === undefined) return
          const result = evaluateLength(text, basis)
          if (typeof result !== "number") {
            setMessage({ tone: "error", text: `${name}: ${result.reason}` })
            return
          }
          const next = [...parts] as [string, string, string]
          next[index] = text.trim()
          onChange(next)
          setMessage(undefined)
          setTyped([])
        }
        const each = evaluateLength(parts[index]!, basis)
        return (
          <label key={name} className="grid grid-cols-[64px_1fr] items-center gap-2 text-xs">
            <span className="text-muted-foreground">{name}</span>
            <span className={fieldBox(false)}>
              <input
                aria-label={`${label} ${name.toLowerCase()}`}
                value={typed[index] ?? parts[index]}
                onChange={(event) => {
                  const next = [...typed] as [string?, string?, string?]
                  next[index] = event.target.value
                  setTyped(next)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commit()
                }}
                onBlur={commit}
                className={`${fieldInput} font-mono`}
              />
              {typeof each === "number" && (
                <span className="shrink-0 text-muted-foreground tabular-nums">{formatNumber(each)}</span>
              )}
            </span>
          </label>
        )
      })}
      <MessageLine message={message} />
    </div>
  )
}
