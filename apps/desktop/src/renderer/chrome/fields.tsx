import {
  applyFieldInput,
  type FieldNote,
  type FieldRules,
  formatFieldValue,
  readFieldInput,
  scrubSteps,
  stepFieldValue,
  summarizeFieldNotes,
  type Token,
  type TokenCategory
} from "@parity-app/core"
import { Check, ChevronsUpDown, RotateCcw } from "lucide-react"
import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { kindColors } from "../canvas/kinds.tsx"
import { Hint } from "./Hint.tsx"
import {
  type FieldEffect,
  type FieldEvent,
  fieldText,
  initialFieldState,
  type Reading,
  reduceField
} from "./number-field.ts"
import { readValue, showValue, type ValueKind, valueKind } from "./prop-values.ts"
import { swatch } from "./token-previews.tsx"

interface FieldProps {
  label: string
  /** Says more about the property, on hover. */
  hint?: string
  /** The value differs from the base design in the state being edited. */
  changed?: boolean
  /** The selected layers have different values for it. */
  mixed?: boolean
  onReset?: () => void
  children: ReactNode
}

const MixedContext = createContext(false)

/** Whether the field an input sits in has different values across the selected layers. */
export function useMixed(): boolean {
  return useContext(MixedContext)
}

/** Starts scrubbing a field from a pointer pressed on a label. */
type Scrub = (event: ReactPointerEvent<HTMLElement>) => void

/** Number fields in a row without a label of their own, which the row's label scrubs. */
const ScrubContext = createContext<((scrub: Scrub) => () => void) | undefined>(undefined)

/** What a field says under itself: why it can't read what's typed, or what it did with a value. */
interface FieldMessage {
  tone: "error" | "note"
  text: string
}

/** Lets a row's fields say things under the whole row, where there's room, by the id each describes itself with. */
const MessageContext = createContext<((id: string, message: FieldMessage | undefined) => void) | undefined>(undefined)

/**
 * One property row: label, control, and a reset button when a state overrides it. When the row holds one number field
 * without a label of its own, dragging the row's label scrubs it, as Figma's labels do. What its fields say shows under
 * the row.
 */
export function Field({ label, hint, changed, mixed = false, onReset, children }: FieldProps) {
  const scrubs = useRef(new Set<Scrub>())
  const [scrub, setScrub] = useState<Scrub>()
  const register = useCallback((added: Scrub) => {
    scrubs.current.add(added)
    const only = () => setScrub(() => (scrubs.current.size === 1 ? [...scrubs.current][0] : undefined))
    only()
    return () => {
      scrubs.current.delete(added)
      only()
    }
  }, [])
  const [messages, setMessages] = useState<ReadonlyMap<string, FieldMessage>>(new Map())
  const say = useCallback((id: string, message: FieldMessage | undefined) => {
    setMessages((current) => {
      const was = current.get(id)
      if (was?.text === message?.text && was?.tone === message?.tone) return current
      const next = new Map(current)
      if (message) next.set(id, message)
      else next.delete(id)
      return next
    })
  }, [])
  return (
    <div className="grid min-h-8 grid-cols-[88px_1fr_20px] items-center gap-2">
      <Hint
        label={changed ? `${label}: changed in this state` : label}
        detail={[mixed && "Different across the selected layers", hint, scrub && "Drag to change it"]
          .filter(Boolean)
          .join("\n")}
        wait
      >
        <span
          className={`truncate text-xs text-muted-foreground ${scrub ? "cursor-ew-resize touch-none select-none" : ""}`}
          style={changed ? { color: kindColors.agent } : undefined}
          onPointerDown={scrub}
        >
          {label}
        </span>
      </Hint>
      <div className="min-w-0">
        <ScrubContext value={register}>
          <MessageContext value={say}>
            <MixedContext value={mixed}>{children}</MixedContext>
          </MessageContext>
        </ScrubContext>
      </div>
      {changed && onReset ? (
        <Hint label="Reset to the base design">
          <button
            type="button"
            onClick={onReset}
            className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Reset ${label} to the base design`}
          >
            <RotateCcw className="size-3" />
          </button>
        </Hint>
      ) : (
        <span />
      )}
      {messages.size > 0 && (
        <div className="col-span-2 col-start-2 -mt-1 flex flex-col gap-0.5 pb-1">
          {[...messages].map(([id, message]) => (
            <FieldMessageLine key={id} id={id} message={message} />
          ))}
        </div>
      )}
    </div>
  )
}

function FieldMessageLine({ id, message }: { id: string; message: FieldMessage }) {
  const error = message.tone === "error"
  return (
    <p
      id={id}
      role={error ? "alert" : "status"}
      className={`text-[11px] leading-snug ${error ? "text-destructive" : "text-muted-foreground"}`}
    >
      {message.text}
    </p>
  )
}

/** A text input that commits on blur or Enter, so typing doesn't write a file per keystroke. */
export function TextInput({
  value,
  onCommit,
  placeholder,
  multiline = false,
  mono = false
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  multiline?: boolean
  mono?: boolean
}) {
  const mixed = useMixed()
  const className = `h-7 px-2 text-xs ${mono ? "font-mono" : ""}`
  if (multiline) {
    return (
      <textarea
        key={value}
        defaultValue={value}
        placeholder={mixed ? "Mixed" : placeholder}
        rows={Math.min(6, Math.max(1, Math.ceil(value.length / 28)))}
        onBlur={(event) => event.currentTarget.value !== value && onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      />
    )
  }
  return (
    <Input
      key={value}
      defaultValue={value}
      placeholder={mixed ? "Mixed" : placeholder}
      className={className}
      onBlur={(event) => event.currentTarget.value !== value && onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
    />
  )
}

/** What a number or length field holds: a number in what it stores (steps for lengths), a token's name, or nothing. */
export type FieldValue = number | string | undefined

/**
 * An edit from a number field, worked out from a layer's own value: the same for every layer unless what was typed
 * uses the value there (`+8`, `Mixed*2`, `50%`, a step or a scrub). A value it can't work from stays as it is.
 */
export type FieldUpdate = (current: FieldValue) => FieldValue

export interface NumberFieldProps {
  /** What it holds; undefined when unset, or when the selected layers differ (then it shows Mixed). */
  value: FieldValue
  rules: FieldRules
  /** Its accessible name. */
  title: string
  /** Length token names it takes as typed. */
  tokens?: readonly string[]
  placeholder?: string
  /** What an unset value counts as when an edit works from it: 0 for padding, a layer's measured width. */
  blank?: () => number | undefined
  /** A letter or two inside the field, which scrubs it when dragged. Without one, the row's label does. */
  inner?: string
  /** Inside the field, after the value. */
  suffix?: ReactNode
  /** Inside the field's border, at its end, such as a token picker. */
  after?: ReactNode
  /** Shows a token name in a code font. */
  mono?: boolean
  className?: string
  /** Said on hovering the field, such as the step a length is. */
  hint?: string
  /** Shows an edit on the canvas while it's typed or scrubbed, without making it. */
  onPreview?: (update: FieldUpdate) => void
  /** Takes the preview back. */
  onCancel?: () => void
  /** Makes the edit, as one undo step. */
  onCommit: (update: FieldUpdate) => void
}

/**
 * A number or length field that takes what people type: units, maths, the value there (`+8`, `Mixed+8`), Up and Down
 * (Shift for ten), and dragging its label to scrub. The canvas previews while typing or scrubbing; Enter commits and
 * keeps focus; input it can't read stays, with the reason under it; and what's typed survives the value changing
 * underneath. The rules are in `@parity-app/core`'s fields.ts and the behaviour in number-field.ts.
 */
export function NumberField({
  value,
  rules,
  title,
  tokens,
  placeholder,
  blank,
  inner,
  suffix,
  after,
  mono = false,
  className = "",
  hint,
  onPreview,
  onCancel,
  onCommit
}: NumberFieldProps) {
  const mixed = useMixed()
  const register = useContext(ScrubContext)
  const say = useContext(MessageContext)
  const input = useRef<HTMLInputElement>(null)
  const messageId = useId()
  const [state, setState] = useState(initialFieldState)
  useEffect(() => say?.(messageId, state.message), [say, messageId, state.message])
  useEffect(() => () => say?.(messageId, undefined), [say, messageId])
  const current = useRef(state)
  const previewing = useRef(false)
  const [selecting, setSelecting] = useState(0)
  const shown = mixed && value === undefined ? "Mixed" : formatFieldValue(value, rules)

  /** A value as a number to work from: its own, or what unset counts as; a token has none. */
  const numeric = (from: FieldValue) => {
    if (typeof from === "number") return from
    return from === undefined ? blank?.() : undefined
  }

  const read = (text: string): Reading => {
    const typed = readFieldInput(text, rules, tokens)
    if (typed.type === "unreadable") return { ok: false, reason: typed.reason }
    // With layers that differ, what works from the value is worked out for each; it can't be checked against one.
    if (mixed && value === undefined && typed.type === "maths" && typed.relative) return { ok: true }
    const outcome = applyFieldInput(typed, numeric(value), rules)
    return outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason }
  }

  /**
   * The edit for some text, then `step` steps from what it comes to, and what it did to values that didn't fit,
   * gathered as it's worked out. Without text, it steps from the value there.
   */
  const editFor = (text: string | undefined, step = 0) => {
    const typed = text === undefined ? undefined : readFieldInput(text, rules, tokens)
    const notes: FieldNote[] = []
    const kept: string[] = []
    const update: FieldUpdate = (from) => {
      if (!typed && step === 0) return from
      let base = numeric(from)
      if (typed) {
        const outcome = applyFieldInput(typed, base, rules)
        if (!outcome.ok) {
          kept.push(outcome.reason)
          return from
        }
        if (step === 0) {
          if (outcome.note) notes.push(outcome.note)
          return outcome.value
        }
        base = typeof outcome.value === "number" ? outcome.value : undefined
      }
      return base === undefined ? from : stepFieldValue(base, step, rules)
    }
    const summary = () => {
      const note = summarizeFieldNotes(notes, rules)
      const skipped =
        kept.length > 0
          ? `${kept.length === 1 ? "A layer" : `${kept.length} layers`} kept its value: ${kept[0]}`
          : undefined
      return [note, skipped].filter(Boolean).join(". ") || undefined
    }
    return { update, summary }
  }

  const run = (effect: FieldEffect) => {
    switch (effect.type) {
      case "preview":
        previewing.current = true
        onPreview?.(editFor(effect.text).update)
        return
      case "cancel":
        if (previewing.current) onCancel?.()
        previewing.current = false
        return
      case "commit": {
        const { update, summary } = editFor(effect.text)
        onCommit(update)
        previewing.current = false
        return dispatch({ type: "committed", note: summary() })
      }
      case "step": {
        const { update, summary } = editFor(effect.from, effect.count)
        onCommit(update)
        previewing.current = false
        return dispatch({ type: "committed", note: summary() })
      }
      case "select":
        return setSelecting((count) => count + 1)
      case "blur":
        return input.current?.blur()
    }
  }

  function dispatch(event: FieldEvent) {
    const update = reduceField(current.current, event, read)
    current.current = update.state
    setState(update.state)
    for (const effect of update.effects) run(effect)
  }

  // Enter keeps the field, with its text selected once the committed value shows.
  useLayoutEffect(() => {
    if (selecting > 0) input.current?.select()
  }, [selecting])

  // A preview doesn't outlive its field, as when the selection changes while typing.
  const cancel = useRef(onCancel)
  cancel.current = onCancel
  useEffect(
    () => () => {
      if (previewing.current) cancel.current?.()
    },
    []
  )

  const scrub = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const start = event.clientX
    let steps = 0
    let update: FieldUpdate | undefined
    dispatch({ type: "scrubStart" })
    const move = (moveEvent: PointerEvent) => {
      const next = scrubSteps(moveEvent.clientX - start, moveEvent.shiftKey)
      if (next === steps) return
      steps = next
      update = editFor(undefined, steps).update
      previewing.current = true
      onPreview?.(update)
      const own = mixed && value === undefined ? undefined : update(value)
      dispatch({ type: "scrubMove", text: own === undefined ? shown : formatFieldValue(own, rules) })
    }
    const stop = (commit: boolean) => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", up)
      handle.removeEventListener("pointercancel", cancelled)
      window.removeEventListener("keydown", key, true)
      dispatch({ type: "scrubEnd" })
      if (commit && steps !== 0) {
        const { update: final, summary } = editFor(undefined, steps)
        onCommit(final)
        previewing.current = false
        dispatch({ type: "committed", note: summary() })
      } else run({ type: "cancel" })
      // A press without a drag is a click: on a label inside the field, it goes to the field.
      if (steps === 0 && inner) input.current?.focus()
    }
    const up = () => stop(true)
    const cancelled = () => stop(false)
    const key = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return
      keyEvent.preventDefault()
      keyEvent.stopPropagation()
      stop(false)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up)
    handle.addEventListener("pointercancel", cancelled)
    window.addEventListener("keydown", key, true)
  }

  // Without a label of its own, the row's label scrubs it.
  const latest = useRef(scrub)
  latest.current = scrub
  useEffect(() => (inner || !register ? undefined : register((event) => latest.current(event))), [inner, register])

  const error = state.message?.tone === "error"
  const box = (
    <div
      data-invalid={error ? "" : undefined}
      className="group flex h-7 min-w-0 items-center rounded-md border border-input shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-[invalid]:border-destructive data-[invalid]:ring-destructive/20 dark:bg-input/30"
    >
      {inner && (
        <span
          className="shrink-0 cursor-ew-resize touch-none pl-1.5 text-[10px] text-muted-foreground select-none"
          onPointerDown={scrub}
        >
          {inner}
        </span>
      )}
      <Input
        ref={input}
        aria-label={title}
        aria-invalid={error || undefined}
        aria-describedby={state.message ? messageId : undefined}
        value={fieldText(state, shown)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className={`h-6 min-w-0 flex-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent ${
          mono || typeof value === "string" ? "font-mono" : "tabular-nums"
        }`}
        onChange={(event) => dispatch({ type: "type", text: event.currentTarget.value })}
        onBlur={() => dispatch({ type: "blur" })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            dispatch({ type: "enter" })
          } else if (event.key === "Escape") {
            event.preventDefault()
            dispatch({ type: "escape" })
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            dispatch({ type: "step", count: (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1) })
          }
        }}
      />
      {suffix && (
        <span className="pointer-events-none shrink-0 pr-1.5 text-[10px] text-muted-foreground group-focus-within:hidden">
          {suffix}
        </span>
      )}
      {after}
    </div>
  )
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      {hint ? (
        <Hint label={hint} wait>
          {box}
        </Hint>
      ) : (
        box
      )}
      {/* In a row, the row says it, under its whole width. */}
      {state.message && !say && <FieldMessageLine id={messageId} message={state.message} />}
    </div>
  )
}

/** A number on its own, such as opacity or max lines, with what it's in after it (`%`). */
export function NumberInput({
  value,
  rules,
  title,
  onCommit,
  onPreview,
  onCancel,
  blank,
  suffix,
  placeholder
}: Pick<
  NumberFieldProps,
  "value" | "rules" | "title" | "onCommit" | "onPreview" | "onCancel" | "blank" | "placeholder"
> & {
  suffix?: string
}) {
  return (
    <NumberField
      value={value}
      rules={rules}
      title={title}
      placeholder={placeholder}
      blank={blank}
      suffix={suffix}
      className="w-24"
      onCommit={onCommit}
      onPreview={onPreview}
      onCancel={onCancel}
    />
  )
}

export function ChoiceInput<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Default"
}: {
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (value: T | undefined) => void
  placeholder?: string
}) {
  const mixed = useMixed()
  return (
    <Select
      value={value ?? (mixed ? "" : "__unset")}
      onValueChange={(next) => onChange(next === "__unset" ? undefined : (next as T))}
    >
      <SelectTrigger size="sm" className="h-7 w-full text-xs">
        <SelectValue placeholder="Mixed" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__unset">
          <span className="text-muted-foreground">{placeholder}</span>
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function SwitchInput({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <Switch size="sm" checked={value} onCheckedChange={onChange} />
}

/** Rules for a number a prop or param takes: any number, with maths. */
export const numberRules: FieldRules = { kind: "number" }

/**
 * A prop's or param's value, edited so it keeps its type: a switch for a boolean, a number field for a number, text
 * for text, and JSON for the rest. `kind` says which, from what the value is declared to take (`valueKind`); without
 * it, the value's own type decides.
 */
export function ValueInput({
  value,
  title = "Value",
  kind = valueKind(value),
  onCommit
}: {
  value: unknown
  title?: string
  kind?: ValueKind
  onCommit: (value: unknown) => void
}) {
  if (kind === "boolean") return <SwitchInput value={value === true} onChange={onCommit} />
  if (kind === "number") {
    const current = typeof value === "number" ? value : undefined
    return (
      <NumberInput
        value={current}
        rules={numberRules}
        title={title}
        onCommit={(update) => {
          const next = update(current)
          if (next !== current) onCommit(next)
        }}
      />
    )
  }
  if (kind === "text") {
    return <TextInput value={value === undefined ? "" : String(value as unknown)} onCommit={onCommit} />
  }
  return <ParsedInput value={value} kind={kind} title={title} onCommit={onCommit} />
}

/**
 * JSON, or any value, typed as text. What doesn't parse stays in the field with the reason under it, and nothing is
 * changed, so a value never turns into the string that was typed.
 */
function ParsedInput({
  value,
  kind,
  title,
  onCommit
}: {
  value: unknown
  kind: "json" | "any"
  title: string
  onCommit: (value: unknown) => void
}) {
  const shown = showValue(value, kind)
  const [error, setError] = useState<string>()
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Input
        key={shown}
        defaultValue={shown}
        aria-label={title}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id : undefined}
        className="h-7 px-2 font-mono text-xs"
        onBlur={(event) => {
          const text = event.currentTarget.value
          const read = text === shown ? undefined : readValue(text, kind)
          setError(read && "error" in read ? read.error : undefined)
          if (read && "value" in read) onCommit(read.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      {error && (
        <p id={id} role="alert" className="text-[11px] leading-snug text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const groupTitles: Record<string, string> = { semantic: "Semantic", theme: "Primitive" }

/** Picks a token by name, searching the project's tokens of the given categories. Colors show swatches. */
export function TokenInput({
  value,
  tokens,
  categories,
  onChange
}: {
  value: string | undefined
  tokens: Token[]
  categories: TokenCategory[]
  onChange: (value: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const mixed = useMixed()
  const choices = tokens.filter((token) => categories.includes(token.category))
  const current = choices.find((token) => token.name === value)
  const groups = Map.groupBy(choices, (token) => token.source)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 w-full justify-between gap-1.5 px-2 text-xs font-normal">
          <span className="flex min-w-0 items-center gap-1.5">
            {value && categories.includes("color") && <Swatch value={current?.values.default ?? `var(--${value})`} />}
            <span className={`truncate font-mono ${value ? "" : "text-muted-foreground"}`}>
              {value ?? (mixed ? "Mixed" : "None")}
            </span>
          </span>
          <ChevronsUpDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tokens" className="h-8 text-xs" />
          <CommandList className="max-h-72">
            <CommandEmpty>No token matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none"
                onSelect={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
                className="text-xs text-muted-foreground"
              >
                None
              </CommandItem>
            </CommandGroup>
            {[...groups].map(([source, list]) => (
              <CommandGroup key={source} heading={groupTitles[source]}>
                {list.map((token) => (
                  <CommandItem
                    key={token.name}
                    value={token.name}
                    onSelect={() => {
                      onChange(token.name)
                      setOpen(false)
                    }}
                    className="gap-2 text-xs"
                  >
                    {token.category === "color" && <Swatch value={token.values.default ?? ""} />}
                    <span className="min-w-0 flex-1 truncate font-mono">{token.name}</span>
                    {token.category !== "color" && (
                      <span className="max-w-20 truncate text-muted-foreground">{token.values.default}</span>
                    )}
                    {token.name === value && <Check className="size-3.5" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function Swatch({ value, className = "size-3.5" }: { value: string; className?: string }) {
  return <span className={`${className} shrink-0 rounded-sm`} style={swatch(value)} />
}
