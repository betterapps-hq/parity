import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import {
  type ComponentInfo,
  type ComponentProp,
  type DesignNode,
  isMadeValue,
  type MadeValue as Made,
  nodePropInput,
  propsPanel
} from "@parity-app/core"
import { Plus, X } from "lucide-react"
import { useState } from "react"
import { FieldGrid, nameButton } from "../inspector/controls/field-row.tsx"
import { type PropPreview, type PropRow, PropRows, type PropValueRow } from "../inspector/controls/instance-section.tsx"
import { Hint } from "./Hint.tsx"
import { PanelSection } from "./PanelSection.tsx"
import {
  booleanValue,
  numberValue,
  parseLooseValue,
  plainText,
  type PropValue,
  readPropValue,
  textValue,
  valueKind
} from "./prop-values.ts"

interface PropsSectionProps {
  node: Extract<DesignNode, { type: "component" }>
  /** What the component accepts, when its source could be read. */
  info: ComponentInfo | undefined
  changed: (name: string) => boolean
  /** Props the state being edited takes away, still listed so they can be set or reset there. */
  taken?: readonly string[]
  /** Sets a prop, as part of a gesture's one undo step when given (a number field's run of Up and Down presses). */
  onChange: (name: string, value: PropValue | undefined, gesture?: string) => void
  /** Shows a number prop on the canvas while it's typed or scrubbed, before it's made. */
  onPreview?: (name: string, value: number | undefined) => void
  /** Takes the preview back. */
  onCancel?: () => void
  onReset: (name: string) => void
}

/** A prop's value as a component layer holds it. */
type HeldValue = NonNullable<PropsSectionProps["node"]["props"]>[string]

const groupTitles = new Map([
  ["html", "Attributes"],
  ["aria", "Accessibility"],
  ["event", "Events"]
])

/**
 * A component's props, from what its source declares, in the rows the approved Component instance section draws:
 * variants offer their options with the default first, booleans a switch, and an unset prop is empty with its default
 * shown faintly. Attributes it passes to its element are added one at a time from a searchable list, and removed from
 * their row. Node props, `children` and a Fluent slot alike, take text or say they're set in layers (see `propsPanel`).
 */
export function PropsSection({
  node,
  info,
  changed,
  taken = [],
  onChange,
  onPreview,
  onCancel,
  onReset
}: PropsSectionProps) {
  const values = node.props ?? {}
  const known = new Map((info?.props ?? []).map((prop) => [prop.name, prop]))
  // Variants and own props always show; pass-through attributes only once set, or taken away in this state.
  const panel = propsPanel(info, node)
  const { main, addable, inSlot } = panel
  const listed = new Set([...main.map((prop) => prop.name), ...panel.extra])
  const extra = [...panel.extra, ...taken.filter((name) => !listed.has(name))]

  const preview = (name: string): PropPreview | undefined =>
    onPreview && onCancel ? { onPreview: (value) => onPreview(name, value), onCancel } : undefined

  const row = (name: string, prop: ComponentProp | undefined): PropRow => ({
    ...(prop
      ? propRow(prop, values[name], inSlot.has(name), preview(name))
      : { type: "value", value: readPropValue(values[name]), loose: true }),
    name,
    changed: changed(name),
    onReset: () => onReset(name)
  })

  const rows = [
    ...main.map((prop) => ({ ...row(prop.name, prop), hint: prop.description ?? prop.type })),
    ...extra.map((name) => {
      const prop = known.get(name)

      return {
        ...row(name, prop),
        hint: prop ? groupTitles.get(prop.group) : "Not a prop this component declares",
        action: !changed(name) && !inSlot.has(name) && (
          <Hint label={`Remove ${name}`}>
            <button
              type="button"
              onClick={() => onChange(name, undefined)}
              className={nameButton}
              aria-label={`Remove ${name}`}
            >
              <X className="size-3" />
            </button>
          </Hint>
        )
      }
    })
  ]

  return (
    <PanelSection
      title={`${node.component} props`}
      description={info ? undefined : "Reading this component's props from its source."}
      action={<AddProp props={addable} free={!info} onAdd={(name, value) => onChange(name, value)} />}
    >
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No props to set.</p>
      ) : (
        <FieldGrid>
          <PropRows
            rows={rows}
            onChange={(name, value, gesture) => {
              const prop = known.get(name)

              onChange(name, prop ? propValueOf(prop, value) : value, gesture)
            }}
          />
        </FieldGrid>
      )}
    </PanelSection>
  )
}

/**
 * A value the library's package makes (`createTreeCollection(...)`), which the canvas makes the way the example did. It
 * isn't edited here; removing it leaves the prop unset.
 */
function MadeValue({ value }: { value: Made }) {
  const call = value.$call

  return (
    <span className="truncate" title={call ? `${call.export} from ${call.import}` : ""}>
      Made by {call?.export}()
    </span>
  )
}

/** A prop's row for its kind of value, with its default shown faintly while it's unset. */
function propRow(
  prop: ComponentProp,
  /** The prop's value as the layer holds it, which can be one the library's package makes. */
  held: HeldValue,
  inSlot: boolean,
  preview: PropPreview | undefined
): PropValueRow {
  if (isMadeValue(held)) {
    return { type: "shown", shown: <MadeValue value={held} /> }
  }

  const value = readPropValue(held)
  const fallback = prop.default === undefined || prop.default === null ? undefined : String(prop.default)

  switch (prop.kind) {
    case "enum":
      return {
        type: "variant",
        value: value === undefined ? undefined : plainText(value),
        default: fallback,
        // Options that print the same, such as `true` and `"true"`, are one choice.
        options: [...new Set((prop.options ?? []).map(String))].map((option) => ({ id: option, name: option }))
      }
    case "boolean":
      return { type: "boolean", value: booleanValue.safeParse(value).data ?? prop.default === true }
    case "number":
      return {
        type: "number",
        value: numberValue.safeParse(value).data,
        default: numberValue.safeParse(prop.default).data,
        preview
      }
    case "string":
      return { type: "text", value: textValue.safeParse(value).data, default: fallback }
    case "node":
      if (nodePropInput(held, inSlot) === "layers") {
        return { type: "shown", shown: "Set in layers" }
      }

      // A value that isn't text (a number, `null`) is edited as one, as before slots were nodes.
      if (nodePropInput(held, inSlot) === "value") {
        return { type: "value", value, loose: valueKind(value, prop.kind) !== "json" }
      }

      return { type: "text", value: textValue.safeParse(value).data, placeholder: "Text, or layers in its slot" }
    default:
      // An object prop takes JSON; one whose type isn't known takes whatever's typed, as JSON when it reads as JSON.
      return { type: "value", value, loose: valueKind(value, prop.kind) !== "json" }
  }
}

/** What a row's change stores for its prop: an option as the component declares it, and a boolean at its default unset. */
function propValueOf(prop: ComponentProp, value: PropValue | undefined): PropValue | undefined {
  if (prop.kind === "enum" && value !== undefined) {
    return prop.options?.find((option) => String(option) === plainText(value))
  }

  if (prop.kind === "boolean" && value === (prop.default ?? false)) {
    return undefined
  }

  return value
}

/** Adds a prop: one the component declares, picked from a searchable list, or any name when the props aren't known. */
function AddProp({
  props,
  free,
  onAdd
}: {
  props: ComponentProp[]
  free: boolean
  onAdd: (name: string, value: PropValue | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const groups = Map.groupBy(props, (prop) => prop.group)

  const add = (name: string, value: PropValue | undefined) => {
    onAdd(name, value)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label="Add a prop">
            <Plus />
          </Button>
        }
      />
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

              if (!list?.length) {
                return null
              }

              return (
                <CommandGroup
                  key={group}
                  heading={group === "own" || group === "variant" ? "Props" : groupTitles.get(group)}
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
function initialValue(prop: ComponentProp): PropValue | undefined {
  if (prop.default !== undefined && prop.default !== null) {
    return prop.default
  }

  if (prop.kind === "boolean") {
    return true
  }

  if (prop.kind === "enum") {
    return prop.options?.[0]
  }

  if (prop.kind === "number") {
    return 0
  }

  return ""
}
