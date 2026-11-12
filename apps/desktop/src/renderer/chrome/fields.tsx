import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch
} from "@buildkitgg/shadcn-baseui-kit"
import { type TokenCategory } from "@parity-app/core"
import { type Token } from "@parity-app/tokens"
import { Check, ChevronsUpDown } from "lucide-react"
import { useId, useState } from "react"
import { useFieldName, useMixed } from "../inspector/controls/field-row.tsx"
import { NumberProp, type PropPreview } from "../inspector/controls/number-field.tsx"
import { NameInput } from "./Name.tsx"
import {
  numberValue,
  plainText,
  type PropValue,
  readValue,
  showValue,
  type ValueKind,
  valueKind
} from "./prop-values.ts"
import { swatch } from "./token-previews.tsx"

/**
 * A text input that commits on blur or Enter, so typing doesn't write a file per keystroke. One that edits a name
 * (`name`) shows it in a name's letters, through `NameInput` (docs/typography.md: Names keep their letters).
 */
export function TextInput({
  value,
  label,
  onCommit,
  placeholder,
  multiline = false,
  mono = false,
  name = false
}: {
  value: string
  /** Its accessible name, where its field's label doesn't name it. */
  label?: string
  onCommit: (value: string) => void
  placeholder?: string
  multiline?: boolean
  mono?: boolean
  /** It edits a name, which a single-line field shows in a name's letters. */
  name?: boolean
}) {
  const mixed = useMixed()
  const named = useFieldName(label)
  const className = `h-7 px-2 text-xs ${mono ? "font-mono" : ""}`

  if (multiline) {
    return (
      <textarea
        key={value}
        {...named}
        defaultValue={value}
        placeholder={mixed ? "Mixed" : placeholder}
        rows={1}
        onBlur={(event) => event.currentTarget.value !== value && onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        className="field-sizing-content max-h-36 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      />
    )
  }

  const Control = name ? NameInput : Input

  return (
    <Control
      key={value}
      {...named}
      defaultValue={value}
      placeholder={mixed ? "Mixed" : placeholder}
      className={className}
      onBlur={(event) => event.currentTarget.value !== value && onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function SwitchInput({
  value,
  label,
  onChange
}: {
  value: boolean
  /** Its accessible name, where its field's label doesn't name it. */
  label?: string
  onChange: (value: boolean) => void
}) {
  const named = useFieldName(label)

  return <Switch size="sm" checked={value} {...named} onCheckedChange={onChange} />
}

/** A prop's value as a number field holds it: a number, or unset. */
function numberOrUnset(value: PropValue | undefined): number | undefined {
  return numberValue.safeParse(value).data
}

/**
 * A prop's or param's value, edited so it keeps its type: a switch for a boolean, a number field for a number, text
 * for text, and JSON for the rest. `kind` says which, from what the value is declared to take (`valueKind`); without
 * it, the value's own type decides. A number previews on the canvas when given `preview`.
 */
export function ValueInput({
  value,
  title,
  kind = valueKind(value),
  preview,
  onCommit
}: {
  value: PropValue | undefined
  /** Its accessible name, where its field's label doesn't name it. */
  title?: string
  kind?: ValueKind
  preview?: PropPreview
  onCommit: (value: PropValue | undefined, gesture?: string) => void
}) {
  if (kind === "boolean") {
    return <SwitchInput value={value === true} label={title} onChange={onCommit} />
  }

  if (kind === "number") {
    return <NumberProp label={title ?? "Value"} value={numberOrUnset(value)} preview={preview} onChange={onCommit} />
  }

  if (kind === "text") {
    return <TextInput value={value === undefined ? "" : plainText(value)} label={title} onCommit={onCommit} />
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
  value: PropValue | undefined
  kind: "json" | "any"
  title: string | undefined
  onCommit: (value: PropValue | undefined) => void
}) {
  const shown = showValue(value, kind)
  const [error, setError] = useState<string>()
  const id = useId()
  const named = useFieldName(title)

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Input
        key={shown}
        defaultValue={shown}
        {...named}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id : undefined}
        className="h-7 px-2 font-mono text-xs"
        onBlur={(event) => {
          const text = event.currentTarget.value
          const read = text === shown ? undefined : readValue(text, kind)
          setError(read && "error" in read ? read.error : undefined)

          if (read && "value" in read) {
            onCommit(read.value)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
      />
      {error && (
        <p id={id} role="alert" className="type-message text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const groupTitles = new Map([
  ["semantic", "Semantic"],
  ["theme", "Primitive"]
])

/**
 * Picks a token by name, searching the project's tokens of the given categories. Colors show swatches. The button is
 * named for its property and what it shows ("Fill, primary", "Text color, None"), since its text alone is the value.
 */
export function TokenInput({
  label,
  value,
  drawn,
  tokens,
  categories,
  onChange
}: {
  /** The property it sets, as a screen reader names it: "Fill", or "Text color" where the row says only Color. */
  label: string
  /** The token's name, or a value written out (`#2563eb`), which it shows as text. */
  value: string | undefined
  /** What a color that isn't one of the tokens draws as, for its swatch. */
  drawn?: string
  tokens: Token[]
  categories: TokenCategory[]
  onChange: (value: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const mixed = useMixed()
  const choices = tokens.filter((token) => categories.includes(token.category))
  const current = choices.find((token) => token.name === value)
  const groups = Map.groupBy(choices, (token) => token.source)
  const shown = value ?? (mixed ? "Mixed" : "None")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`${label}, ${shown}`}
            className="h-7 w-full justify-between gap-1.5 px-2 text-xs font-normal"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {value && categories.includes("color") && (
                <Swatch value={current?.values.default ?? drawn ?? `var(--${value})`} />
              )}
              {/* A token's name is code; None and Mixed are words, so they keep the panel's font. */}
              <span className={`truncate ${value ? "font-mono" : "text-muted-foreground"}`}>{shown}</span>
            </span>
            <ChevronsUpDown className="size-3 opacity-50" />
          </Button>
        }
      />
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
              <CommandGroup key={source} heading={groupTitles.get(source)}>
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
