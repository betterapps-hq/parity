import type { Token, TokenCategory } from "@parity/core"
import { Check, ChevronsUpDown, RotateCcw } from "lucide-react"
import { createContext, type ReactNode, useContext, useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { kindColors } from "../canvas/kinds.tsx"
import { Hint } from "./Hint.tsx"

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

/** One property row: label, control, and a reset button when a state overrides it. */
export function Field({ label, hint, changed, mixed = false, onReset, children }: FieldProps) {
  return (
    <div className="grid min-h-8 grid-cols-[88px_1fr_20px] items-center gap-2">
      <Hint
        label={changed ? `${label}: changed in this state` : label}
        detail={[mixed && "Different across the selected layers", hint].filter(Boolean).join("\n")}
        wait
      >
        <span
          className="truncate text-xs text-muted-foreground"
          style={changed ? { color: kindColors.agent } : undefined}
        >
          {label}
        </span>
      </Hint>
      <div className="min-w-0">
        <MixedContext value={mixed}>{children}</MixedContext>
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
    </div>
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
  onCommit(value: string): void
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

export function NumberInput({
  value,
  onCommit,
  suffix,
  placeholder,
  min = 0
}: {
  value: number | undefined
  onCommit(value: number | undefined): void
  suffix?: string
  placeholder?: string
  min?: number
}) {
  const mixed = useMixed()
  return (
    <div className="flex items-center gap-1.5">
      <Input
        key={value ?? ""}
        type="number"
        min={min}
        step={0.5}
        defaultValue={value ?? ""}
        placeholder={mixed ? "Mixed" : placeholder}
        className="h-7 w-16 px-2 text-xs tabular-nums"
        onBlur={(event) => {
          const raw = event.currentTarget.value.trim()
          const next = raw === "" ? undefined : Number(raw)
          if (next !== value && (next === undefined || Number.isFinite(next))) onCommit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      {suffix && <span className="truncate text-xs text-muted-foreground">{suffix}</span>}
    </div>
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
  onChange(value: T | undefined): void
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

export function SwitchInput({ value, onChange }: { value: boolean; onChange(value: boolean): void }) {
  return <Switch size="sm" checked={value} onCheckedChange={onChange} />
}

/** Any JSON value: booleans get a switch, numbers and strings an input, everything else JSON text. */
export function ValueInput({ value, onCommit }: { value: unknown; onCommit(value: unknown): void }) {
  if (typeof value === "boolean") return <SwitchInput value={value} onChange={onCommit} />
  if (typeof value === "number")
    return <NumberInput value={value} min={-Infinity} onCommit={(next) => onCommit(next ?? 0)} />
  if (typeof value === "string") return <TextInput value={value} onCommit={onCommit} />
  return (
    <TextInput
      mono
      value={JSON.stringify(value)}
      onCommit={(text) => {
        try {
          onCommit(JSON.parse(text))
        } catch {
          onCommit(text)
        }
      }}
    />
  )
}

/** Parses what someone typed as a prop value: JSON when it is (true, 3, "x", [..]), otherwise a string. */
export function parseLooseValue(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === "") return ""
  try {
    return JSON.parse(trimmed)
  } catch {
    return text
  }
}

const groupTitles: Record<string, string> = { semantic: "Project tokens", theme: "Theme scale" }

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
  onChange(value: string | undefined): void
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
  return <span className={`${className} shrink-0 rounded-sm border border-white/15`} style={{ background: value }} />
}
