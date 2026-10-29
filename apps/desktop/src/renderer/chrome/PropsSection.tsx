import type { ComponentInfo, ComponentProp, DesignNode } from "@parity/core"
import { Plus, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  ChoiceInput,
  Field,
  NumberInput,
  numberRules,
  parseLooseValue,
  SwitchInput,
  TextInput,
  ValueInput
} from "./fields.tsx"
import { PanelSection } from "./PanelSection.tsx"

interface PropsSectionProps {
  node: Extract<DesignNode, { type: "component" }>
  /** What the component accepts, when its source could be read. */
  info: ComponentInfo | undefined
  changed(name: string): boolean
  onChange(name: string, value: unknown): void
  onReset(name: string): void
}

const groupTitles = { html: "Attributes", aria: "Accessibility", event: "Events" } as const

/**
 * A component's props, from what its source declares: variants offer their options, booleans a switch, and every prop
 * shows its default when unset. Attributes it passes to its element are added one at a time from a searchable list.
 */
export function PropsSection({ node, info, changed, onChange, onReset }: PropsSectionProps) {
  const values = node.props ?? {}
  const known = new Map((info?.props ?? []).map((prop) => [prop.name, prop]))
  const isLabel = (name: string) => name === "children" && typeof values.children === "string"
  // Variants and own props always show; pass-through attributes only once set.
  const main = (info?.props ?? []).filter(
    (prop) => (prop.group === "variant" || prop.group === "own") && prop.kind !== "function" && !isLabel(prop.name)
  )
  const shown = new Set(main.map((prop) => prop.name))
  const extra = Object.keys(values).filter((name) => !shown.has(name) && !isLabel(name))
  const addable = (info?.props ?? []).filter(
    (prop) => !shown.has(prop.name) && !Object.hasOwn(values, prop.name) && prop.kind !== "function"
  )

  return (
    <PanelSection
      title={`${node.component} props`}
      description={info ? undefined : "Reading this component's props from its source."}
      action={<AddProp props={addable} free={!info} onAdd={(name, value) => onChange(name, value)} />}
    >
      <div className="flex flex-col gap-1">
        {main.length === 0 && extra.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">No props to set.</p>
        )}
        {main.map((prop) => (
          <Field
            key={prop.name}
            label={prop.name}
            changed={changed(prop.name)}
            onReset={() => onReset(prop.name)}
            hint={prop.description ?? prop.type}
          >
            <PropInput prop={prop} value={values[prop.name]} onChange={(value) => onChange(prop.name, value)} />
          </Field>
        ))}
        {extra.map((name) => {
          const prop = known.get(name)
          return (
            <div key={name} className="group relative">
              <Field
                label={name}
                changed={changed(name)}
                onReset={() => onReset(name)}
                hint={prop ? groupTitles[prop.group as keyof typeof groupTitles] : "Not a prop this component declares"}
              >
                {prop ? (
                  <PropInput prop={prop} value={values[name]} onChange={(value) => onChange(name, value)} />
                ) : (
                  <ValueInput value={values[name]} onCommit={(value) => onChange(name, value)} />
                )}
              </Field>
              {!changed(name) && (
                <button
                  type="button"
                  onClick={() => onChange(name, undefined)}
                  className="absolute top-1.5 right-0 grid size-5 place-items-center rounded text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                  aria-label={`Remove ${name}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </PanelSection>
  )
}

/** The right control for a prop's kind of value, with its default as the placeholder. */
function PropInput({ prop, value, onChange }: { prop: ComponentProp; value: unknown; onChange(value: unknown): void }) {
  const fallback = prop.default === undefined || prop.default === null ? undefined : String(prop.default)
  switch (prop.kind) {
    case "enum":
      return (
        <ChoiceInput
          value={value === undefined ? undefined : String(value)}
          // Options that print the same, such as `true` and `"true"`, are one choice.
          options={[...new Set((prop.options ?? []).map(String))].map((option) => ({ value: option, label: option }))}
          placeholder={fallback ? `${fallback} (default)` : "Not set"}
          onChange={(next) => {
            const option = prop.options?.find((candidate) => String(candidate) === next)
            onChange(option)
          }}
        />
      )
    case "boolean":
      return (
        <SwitchInput
          value={typeof value === "boolean" ? value : prop.default === true}
          onChange={(next) => onChange(next === (prop.default ?? false) ? undefined : next)}
        />
      )
    case "number":
      return (
        <NumberInput
          value={typeof value === "number" ? value : undefined}
          rules={numberRules}
          title={prop.name}
          placeholder={fallback ?? ""}
          // Maths that works from the value there starts from the default when the prop isn't set.
          blank={() => (typeof prop.default === "number" ? prop.default : undefined)}
          onCommit={(update) => onChange(update(typeof value === "number" ? value : undefined))}
        />
      )
    case "string":
      return (
        <TextInput
          value={typeof value === "string" ? value : ""}
          placeholder={fallback ?? ""}
          onCommit={(next) => onChange(next === "" ? undefined : next)}
        />
      )
    case "node":
      return typeof value === "string" || value === undefined ? (
        <TextInput
          value={typeof value === "string" ? value : ""}
          placeholder="Text, or layers in its slot"
          onCommit={(next) => onChange(next === "" ? undefined : next)}
        />
      ) : (
        <span className="text-xs text-muted-foreground">Set in layers</span>
      )
    default:
      return <ValueInput value={value ?? ""} onCommit={onChange} />
  }
}

/** Adds a prop: one the component declares, picked from a searchable list, or any name when the props aren't known. */
function AddProp({
  props,
  free,
  onAdd
}: {
  props: ComponentProp[]
  free: boolean
  onAdd(name: string, value: unknown): void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const groups = Map.groupBy(props, (prop) => prop.group)
  const add = (name: string, value: unknown) => {
    onAdd(name, value)
    setOpen(false)
    setSearch("")
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Add a prop">
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search props" value={search} onValueChange={setSearch} className="h-8 text-xs" />
          <CommandList className="max-h-80">
            <CommandEmpty>
              {free && search ? (
                <button type="button" className="w-full px-2 text-left text-xs" onClick={() => add(search, "")}>
                  Add <code>{search}</code>
                </button>
              ) : (
                "No prop matches."
              )}
            </CommandEmpty>
            {(["own", "variant", "html", "aria"] as const).map((group) => {
              const list = groups.get(group)
              if (!list?.length) return null
              return (
                <CommandGroup
                  key={group}
                  heading={group === "own" || group === "variant" ? "Props" : groupTitles[group]}
                >
                  {list.map((prop) => (
                    <CommandItem
                      key={prop.name}
                      value={prop.name}
                      onSelect={() => add(prop.name, initialValue(prop))}
                      className="gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono">{prop.name}</span>
                      <span className="text-muted-foreground">{prop.kind === "enum" ? "options" : prop.kind}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
            {free && search && (
              <CommandGroup heading="Any prop">
                <CommandItem
                  value={`__free:${search}`}
                  onSelect={() => add(search, parseLooseValue(""))}
                  className="text-xs"
                >
                  Add <code>{search}</code>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** A starting value for a newly added prop, so it shows something right away. */
function initialValue(prop: ComponentProp): unknown {
  if (prop.default !== undefined && prop.default !== null) return prop.default
  if (prop.kind === "boolean") return true
  if (prop.kind === "enum") return prop.options?.[0]
  if (prop.kind === "number") return 0
  return ""
}
