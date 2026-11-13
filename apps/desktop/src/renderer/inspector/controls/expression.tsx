import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import {
  type Basis,
  evaluateLength as evaluate,
  expressionForm,
  formatNumber,
  isReadFailure,
  remPx
} from "@parity-app/style-schema"
import type { PreviewKind } from "@parity-app/tokens"
import { SlidersHorizontal } from "lucide-react"
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { numberValue } from "../../chrome/prop-values.ts"
import { swatch } from "../../chrome/token-previews.tsx"
import { arbitrary } from "./css-values.ts"
import {
  comboboxProps,
  fieldBox,
  type FieldHint,
  fieldInput,
  InvalidMark,
  type Message,
  MessageLine,
  MissingMark,
  type Reading,
  readUnitNumber,
  SearchList,
  TokenChip,
  TokenMark,
  tokenNamed,
  ValueField,
  wrappingText
} from "./field-parts.tsx"
import { colorTokens, lengthVars } from "./stand-in-tokens.ts"
import { type FieldToken, lengthToken } from "./tokens.ts"
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
  if (name.startsWith("container-")) {
    return "container"
  }

  if (name.startsWith("text-")) {
    return "font-size"
  }

  if (name.startsWith("radius-")) {
    return "radius"
  }

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

/** A length expression worked out in pixels against the length tokens an expression can name, or why it can't be. */
export const evaluateLength = (text: string, basis: Basis) => evaluate(text, basis, lengthVars)

/** The CSS with each token's `var()` filled in, as `CSS.supports` checks it and the swatch draws it. */
export function fillTokens(text: string): string {
  return text.replaceAll(/var\(--([\w-]+)\)/g, (whole, name: string) => {
    if (name.startsWith("color-")) {
      return colorTokens.find((token) => `color-${token.name}` === name)?.hex ?? whole
    }

    const px = lengthVars[name]

    return px === undefined ? whole : `${px}px`
  })
}

/** What an expression field writes, in its simplest form. */
export function expressionWrites(property: string, prefix: string, text: string | undefined): Writes {
  if (text === undefined) {
    return { stored: undefined, css: [], tailwind: [] }
  }

  const form = expressionForm(text)

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

  if (word === undefined) {
    return undefined
  }

  const items = functions.flatMap((fn) =>
    fn.kinds.includes(kind) && fn.name.startsWith(word.toLowerCase()) && fn.name !== `${word}(`
      ? [{ text: fn.name, label: fn.name.replace("(", "()").replace("var()--", "var(--"), detail: fn.detail }]
      : []
  )

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

  return <span className="inline-flex flex-wrap items-center gap-0.5 font-mono text-2xs">{parts}</span>
}

/** The three values inside a top-level `clamp()`, or undefined when it isn't one. */
function clampParts(text: string): [string, string, string] | undefined {
  const inner = /^clamp\((.*)\)$/s.exec(text.trim())?.[1]

  if (inner === undefined) {
    return undefined
  }

  const parts: string[] = []
  let depth = 0
  let start = 0

  for (let index = 0; index < inner.length; index++) {
    const char = inner[index]

    if (char === "(") {
      depth += 1
    }

    if (char === ")") {
      depth -= 1
    }

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
  const form = value === undefined ? undefined : expressionForm(value)
  const isExpression = form !== undefined && "value" in form && !/^\d/.test(form.value)

  const comesTo =
    kind === "length" && value !== undefined ? numberValue.safeParse(evaluateLength(value, basis)).data : undefined

  const completions = editing === undefined ? undefined : completionsFor(editing, caret, kind)

  const check = (text: string): string | undefined => {
    if (kind === "length") {
      const result = evaluateLength(text, basis)

      if (isReadFailure(result)) {
        return result.reason
      }
    }

    if (!CSS.supports(property, fillTokens(text))) {
      return `${label} can't be ${text}`
    }

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

  /** Closes the editor if what's typed can be stored, on Enter or leaving; says whether it closed. */
  const commit = (): boolean => {
    if (editing === undefined) {
      return false
    }

    const text = editing.trim()

    if (text === "") {
      onChange(undefined)
      setEditing(undefined)
      setMessage(undefined)

      return true
    }

    const reason = check(text)

    // What it can't read stays as typed, leaving or not, with the reason in the error's red.
    if (reason) {
      setMessage({ tone: "error", text: reason })

      return false
    }

    onChange(text)
    setMessage(undefined)

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
    if (!completions || editing === undefined) {
      return
    }

    const item = completions.items[index]

    if (!item) {
      return
    }

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

      if (commit()) {
        backToField()
      }
    }

    // Backspace with nothing typed takes the `=` away too: the editor closes and the value stays as it was.
    const emptied = event.key === "Backspace" && editing === ""

    if (emptied) {
      event.preventDefault()
    }

    if (event.key === "Escape" || emptied) {
      event.stopPropagation()
      setEditing(undefined)
      setMessage(undefined)
      backToField()
    }
  }

  const came = comesTo === undefined ? undefined : formatNumber(comesTo)
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
  let hint: FieldHint = { label: "Type = for an expression" }

  if (atRest) {
    shown = form !== undefined && "token" in form ? form.token : value!.trim()

    if (narrow) {
      shown = "ƒ"
    }

    // Code, as it was typed; ƒ is a mark, not code.
    if (isExpression) {
      restClass = narrow ? "text-center font-serif italic" : "font-mono"
    }

    restComesTo = form !== undefined && "token" in form && form.alpha ? `${form.alpha.step}%` : came
    let detail = came ? `Comes to ${came}px` : "Click to edit"

    if (clamp) {
      detail = "Opens its least, preferred and most values"
    }

    hint = { label: `${label}: ${value}`, detail }
  }

  if (kind === "color" && value !== undefined) {
    inner = <span aria-hidden className="size-3.5 shrink-0 rounded-sm" style={swatch(fillTokens(value))} />
  }

  const read = (text: string): Reading<string | undefined> => {
    const trimmed = text.trim()

    if (trimmed === "") {
      return { value: undefined }
    }

    const token = tokenNamed(lengthTokens, trimmed, "--")

    if (token) {
      return { value: `var(--${token.name})` }
    }

    const takes = "Type = for an expression"
    const reading = readUnitNumber(trimmed, { units: { px: 1, rem: remPx }, current: px ?? 0, label, takes })

    if ("reason" in reading) {
      return reading
    }

    return { value: `${reading.value}px` }
  }

  let onOpen: (() => void) | undefined

  if (clamp) {
    onOpen = () => setClampOpen(true)
  } else if (atRest) {
    onOpen = () => open(value!)
  }

  // An expression starts with ƒ, so it reads as one before its text does, and the mark opens it, as clicking the text
  // does. A narrow field's whole value is already ƒ.
  if (isExpression && !narrow && kind === "length") {
    inner = (
      <button
        type="button"
        aria-label={`Edit ${label}'s expression`}
        onClick={() => onOpen?.()}
        className="-ml-1 grid size-5 shrink-0 place-items-center rounded-sm font-serif text-sm text-muted-foreground italic outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        ƒ
      </button>
    )
  }

  const error = message?.tone === "error"

  const editedComesTo =
    editing === undefined || kind !== "length" ? undefined : numberValue.safeParse(evaluateLength(editing, basis)).data

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
              <PopoverContent
                aria-label={`${label}'s least, preferred and most`}
                align="end"
                className="w-64 gap-2 p-3"
              >
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
            <span aria-hidden className="shrink-0 type-code font-mono text-muted-foreground">
              =
            </span>
            <textarea
              ref={editor}
              data-expression-editor
              rows={1}
              aria-label={`${label} expression`}
              {...comboboxProps({ listId, open: showList, highlight })}
              aria-invalid={error || undefined}
              value={editing}
              onChange={(event) => {
                setEditing(event.target.value)
                setCaret(event.target.selectionStart ?? event.target.value.length)
                setHighlight(0)

                if (error) {
                  setMessage(undefined)
                }
              }}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={onEditorKey}
              onBlur={() => {
                if (!returning.current) {
                  commit()
                }
              }}
              className={`${fieldInput} ${wrappingText} type-code font-mono`}
            />
            {error && <InvalidMark />}
          </label>
          {showList && (
            <SearchList
              id={listId}
              label="Completions"
              options={completions.items.map((item, index) => ({
                key: item.label,
                content: (
                  <>
                    <span className="flex items-center gap-1.5 font-mono">
                      {item.token && (
                        // The highlighted completion plays, as a token list's live row does.
                        <TokenMark
                          kind={item.token.kind}
                          value={item.token.value}
                          name={item.token.name}
                          playing={index === highlight}
                        />
                      )}
                      {item.label}
                    </span>
                    <span className="truncate text-2xs text-muted-foreground">{item.detail}</span>
                  </>
                )
              }))}
              highlight={highlight}
              className="shadow-none"
              onHighlight={setHighlight}
              onPick={accept}
            />
          )}
          <div className="flex items-center justify-between gap-2 px-1 text-2xs text-muted-foreground">
            <WithChips text={editing} />
            {editedComesTo !== undefined && <span className="shrink-0">Comes to {formatNumber(editedComesTo)}px</span>}
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
  const total = numberValue.safeParse(evaluateLength(`clamp(${parts.join(", ")})`, basis)).data

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">
        {label}: clamp
        {total !== undefined && <span className="text-muted-foreground"> comes to {formatNumber(total)}px</span>}
      </p>
      {names.map((name, index) => {
        const each = numberValue.safeParse(evaluateLength(parts[index], basis)).data

        return (
          <ValueField
            key={name}
            label={`${label} ${name.toLowerCase()}`}
            inner={name}
            shown={parts[index]}
            comesTo={each === undefined ? undefined : formatNumber(each)}
            inputMode="text"
            inputClassName="font-mono"
            read={(text): Reading<string> => {
              const result = evaluateLength(text, basis)

              return isReadFailure(result) ? { reason: result.reason } : { value: text.trim() }
            }}
            onCommit={(text) => onChange(parts.map((part, at) => (at === index ? text : part)))}
          />
        )
      })}
    </div>
  )
}
