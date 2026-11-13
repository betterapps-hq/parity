import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  DropdownMenuItem,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import {
  type ComponentProp,
  type ContainerSpec,
  type DesignNode,
  designSlots,
  findNode,
  type InstanceNode,
  isMadeValue,
  type MadeValue as Made,
  nodePropInput,
  overrideCount,
  type ParamSpec,
  propsPanel,
  removeParam,
  renameParam,
  resetInstance,
  swapInstance
} from "@parity-app/core"
import { Pencil, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { useProject } from "../../canvas/context.ts"
import { focusOnMount } from "../../canvas/kinds.tsx"
import { projectLibrary } from "../../canvas/layers.ts"
import { BaseDesignNote } from "../../chrome/BaseDesignNote.tsx"
import { detachAndRecord, pushAndRecord } from "../../chrome/component-events.ts"
import { Hint } from "../../chrome/Hint.tsx"
import { paramValue, updateAndRecord } from "../../chrome/inspector-events.ts"
import { InstanceSlotFields } from "../../chrome/instance-slots.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import {
  booleanValue,
  numberValue,
  parseLooseValue,
  plainText,
  type PropValue,
  readPropValue,
  textValue,
  valueKind
} from "../../chrome/prop-values.ts"
import { revealSelection } from "../../chrome/reveal.ts"
import { AddProp as AddParam, NewPropRow, SlotPropRow } from "../../chrome/slot-props.tsx"
import { useComponents } from "../../components-store.ts"
import { type ContainerEntry, useContainerEntries } from "../../design-store.ts"
import { FieldGrid, nameButton, TitleMenu } from "../controls/field-row.tsx"
import { InstanceSection, type PropRow, PropRows, type PropValueRow } from "../controls/instance-section.tsx"
import type { PropPreview } from "../controls/number-field.tsx"

/** A code component placed in a design. */
type CodeNode = Extract<DesignNode, { type: "component" }>

/** Sets one prop: undefined unsets it, so its default shows. A run of Up and Down presses shares `gesture`. */
type PropEdit = (name: string, value: PropValue | undefined, gesture?: string) => void

/** An instance's props as its layer's panel edits them, in the state being edited. */
interface InstanceEdits {
  entry: ContainerEntry
  /** The instance as it's shown: of a component design, or of a code component. */
  node: InstanceNode | CodeNode
  /** A design instance as the design has it, when it's one of the design's own layers rather than a nested one. */
  own?: InstanceNode
  changed: (name: string) => boolean
  /** Props the state being edited takes away, still listed so they can be set or reset there. */
  taken?: readonly string[]
  onChange: PropEdit
  /** Shows a number prop on the canvas while it's typed or scrubbed, before it's made. */
  onPreview?: (name: string, value: number | undefined) => void
  /** Takes the preview back. */
  onCancel?: () => void
  onReset: (name: string) => void
  /** Draws the attributes a code component's instance passes on alone, as a story does. */
  only?: "attributes"
}

/**
 * Props (PAR-1030): a component design's, defined with their defaults, given as `component`; or an instance's, set,
 * with no difference between a component that's a design and one that's code. A code component's instance has
 * Attributes after it, for what it passes on to its element.
 */
export function PropsSection(props: { component: ContainerEntry } | InstanceEdits) {
  if ("component" in props) {
    return <ComponentProps entry={props.component} />
  }

  const { entry, node, own, ...edits } = props

  if (node.type === "instance") {
    return (
      <DesignInstanceProps
        entry={entry}
        node={node}
        own={own}
        changed={edits.changed}
        onChange={(name, value) => edits.onChange(name, value)}
        onReset={edits.onReset}
      />
    )
  }

  return <CodeInstanceProps node={node} {...edits} />
}

interface CodeInstanceProps {
  node: CodeNode
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
  /** Draws the attributes it passes on alone, as a story does; the panel draws both sections. */
  only?: "attributes"
}

/** A prop's value as a component layer holds it. */
type HeldValue = NonNullable<CodeNode["props"]>[string]

const groupTitles = new Map([
  ["html", "Attributes"],
  ["aria", "Accessibility"],
  ["event", "Events"]
])

/**
 * A code component's instance: the Component instance section a component design's has, with its props from what its
 * source declares:
 * variants offer their options with the default first, booleans a switch, and an unset prop is empty with its default
 * shown faintly. Attributes it passes to its element are added one at a time from a searchable list, and removed from
 * their row. Node props, `children` and a Fluent slot alike, take text or say they're set in layers (see `propsPanel`).
 */
function CodeInstanceProps({
  node,
  changed,
  taken = [],
  onChange,
  onPreview,
  onCancel,
  onReset,
  only
}: CodeInstanceProps) {
  const session = useProject()
  const info = useComponents(session.components)[node.component]
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

  // What the component passes on to its element, rather than declares: an attribute, an aria one or an event, or a
  // name it doesn't declare. Without its source, nothing can be told apart, so everything stays a prop.
  const passedOn = (name: string) => {
    const prop = known.get(name)

    return prop ? prop.group !== "own" && prop.group !== "variant" : info !== undefined
  }

  const extraRow = (name: string): PropRow => {
    const prop = known.get(name)

    return {
      ...row(name, prop),
      hint: prop ? groupTitles.get(prop.group) : undefined,
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
  }

  const rows = [
    ...main.map((prop) => ({ ...row(prop.name, prop), hint: prop.description ?? prop.type })),
    ...extra
      .values()
      .filter((name) => !passedOn(name))
      .map(extraRow)
  ]

  const attributes = extra
    .values()
    .filter(passedOn)
    .map((name) =>
      attributeRow(name, known.get(name), values[name], {
        changed: changed(name),
        onReset: () => onReset(name),
        onRemove: () => onChange(name, undefined),
        preview: preview(name)
      })
    )
    .toArray()

  const change = (name: string, value: PropValue | undefined, gesture?: string) => {
    const prop = known.get(name)

    onChange(name, prop ? propValueOf(prop, value) : value, gesture)
  }

  const add = (
    <AddProp
      props={addable}
      free={!info}
      attributes={info !== undefined}
      onAdd={(name, value) => onChange(name, value)}
    />
  )

  // Without its source, nothing can be told apart from a prop, so there's no Attributes section.
  const attributesSection = info && (
    <AttributesSection
      rows={attributes}
      addable={addable}
      onAdd={(name, value) => onChange(name, value)}
      onChange={change}
    />
  )

  if (only === "attributes") {
    return attributesSection || null
  }

  return (
    <>
      <InstanceSection
        component={node.component}
        description={info ? undefined : "Reading this component's props from its source."}
        add={info ? undefined : add}
        props={rows}
        onChange={change}
      />
      {attributesSection}
    </>
  )
}

/**
 * What a component instance passes on to its component's root element, since every component, a design's included, is
 * code underneath: attributes, aria ones and events, added one at a time from a searchable list and removed from their
 * row. Every component instance has it.
 */
function AttributesSection({
  rows,
  addable,
  onAdd,
  onChange
}: {
  rows: readonly PropRow[]
  /** The attributes the root element takes that aren't set. */
  addable: ComponentProp[]
  onAdd: (name: string, value: PropValue | undefined) => void
  onChange: (name: string, value: PropValue | undefined, gesture?: string) => void
}) {
  return (
    <PanelSection title="Attributes" action={<AddProp props={addable} free={false} attributes onAdd={onAdd} />}>
      {rows.length > 0 && (
        <FieldGrid>
          <PropRows rows={rows} onChange={onChange} />
        </FieldGrid>
      )}
    </PanelSection>
  )
}

/**
 * One attribute's row in Attributes, for its kind of value when the element declares it. Accessibility and Events say
 * what kind of attribute it is; a plain one says nothing its section doesn't. Removed by × until a state changes it.
 */
function attributeRow(
  name: string,
  prop: ComponentProp | undefined,
  held: HeldValue,
  edit: { changed: boolean; onReset: () => void; onRemove: () => void; preview?: PropPreview }
): PropRow {
  return {
    ...(prop ? propRow(prop, held, false, edit.preview) : { type: "value", value: readPropValue(held), loose: true }),
    name,
    changed: edit.changed,
    onReset: edit.onReset,
    hint: prop && prop.group !== "html" ? groupTitles.get(prop.group) : undefined,
    action: !edit.changed && (
      <Hint label={`Remove ${name}`}>
        <button type="button" onClick={edit.onRemove} className={nameButton} aria-label={`Remove ${name}`}>
          <X className="size-3" />
        </button>
      </Hint>
    )
  }
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
  attributes,
  onAdd
}: {
  props: ComponentProp[]
  free: boolean
  /** In the Attributes section, where what's added is passed on to the component's element. */
  attributes: boolean
  onAdd: (name: string, value: PropValue | undefined) => void
}) {
  const noun = attributes ? "attribute" : "prop"
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
          <Button variant="ghost" size="icon-xs" aria-label={attributes ? "Add an attribute" : "Add a prop"}>
            <Plus />
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput
            placeholder={`Search ${noun}s`}
            value={search}
            onValueChange={setSearch}
            className="h-8 text-xs"
          />
          <CommandList className="max-h-80">
            <CommandEmpty>
              {free && search ? (
                <button type="button" className="w-full px-2 text-left text-xs" onClick={() => add(search, "")}>
                  Add <code>{search}</code>
                </button>
              ) : (
                `No ${noun} matches.`
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

/**
 * An instance of a component design: which component, its state and its props, and, for one of the design's own
 * instances (`own`), its overrides, and swapping or detaching it, drawn as the approved Component instance section.
 */
function DesignInstanceProps({
  entry,
  node,
  own,
  changed,
  onChange,
  onReset
}: {
  entry: ContainerEntry
  /** The instance as it's shown. */
  node: InstanceNode
  /** The instance as the design has it, when it's one of the design's own nodes rather than a nested one. */
  own?: InstanceNode
  changed: (name: string) => boolean
  onChange: (name: string, value: PropValue | undefined) => void
  onReset: (name: string) => void
}) {
  const session = useProject()
  const { store, selection } = session
  const entries = useContainerEntries(store)
  const component = entries.find((candidate) => candidate.container.id === node.design)
  // A library's design isn't one of the project's, so it's placed and detached here but edited in the library.
  const design = component?.container ?? store.getComponentLibrary().get(node.design)

  const from = component
    ? undefined
    : session.info.libraries.find((candidate) => candidate.designs?.some((placed) => placed.id === node.design))

  if (!design) {
    return (
      <PanelSection title="Component instance">
        <p className="type-message text-destructive">The component &quot;{node.design}&quot; doesn&apos;t exist.</p>
      </PanelSection>
    )
  }

  const library = projectLibrary(store)

  // The instance's own field, as the design has it, to record what a change to it did.
  const instanceField = (name: "design") => ({
    field: `instance.${name}`,
    layers: [node.id],
    read: (container: ContainerSpec) => {
      const instance = findNode(container.root, node.id)

      return instance?.type === "instance" ? instance[name] : undefined
    }
  })

  const menu = own && {
    overrides: overrideCount(own),
    // Another component this copy could become: not the design it's in, which can't contain itself.
    swappable: entries
      .filter(
        (candidate) =>
          candidate.container.kind === "component" &&
          candidate.container.id !== entry.container.id &&
          candidate.container.id !== node.design
      )
      .map((candidate) => ({ id: candidate.container.id, name: candidate.container.name })),
    onSwap: (id: string) =>
      updateAndRecord(
        store,
        entry.key,
        "Swap instance",
        (container) => swapInstance(container, node.id, id, library),
        instanceField("design")
      ),
    onResetOverrides: () =>
      updateAndRecord(store, entry.key, "Reset overrides", (container) => resetInstance(container, node.id), {
        field: "overrides",
        layers: [node.id],
        read: (container) => {
          const instance = findNode(container.root, node.id)

          return instance?.type === "instance" ? instance.overrides : undefined
        }
      }),
    onPush: component && (() => pushAndRecord(store, entry.key, component.key, node.id)),
    onDetach: () => detachAndRecord(store, entry.key, node.id)
  }

  return (
    <InstanceSection
      component={design.name}
      onGoTo={
        component &&
        (() => {
          selection.set({ design: component.key })
          revealSelection(session)
        })
      }
      linked={from?.name}
      props={instanceRows(design.params ?? {}, node.args ?? {})}
      changed={changed}
      onResetProp={onReset}
      onChange={(name, value) => onChange(name, value)}
      menu={menu}
      note={own && <BaseDesignNote entry={entry} what="Reset overrides, Swap and Detach" />}
    >
      {own && <InstanceSlotFields entry={entry} instance={own} />}
    </InstanceSection>
  )
}

/**
 * A component design's params as an instance's prop rows, with what the instance gives each: a variant offers its
 * options with its default first, and the rest take the value their type says, with the default shown faintly.
 */
function instanceRows(
  params: NonNullable<ContainerSpec["params"]>,
  args: NonNullable<InstanceNode["args"]>
): PropRow[] {
  return Object.entries(params).map(([name, param]): PropRow => {
    const held = readPropValue(args[name])
    const fallback = readPropValue(param.default)

    if (param.type === "variant") {
      const options = (param.options ?? []).map((option) => ({ id: option.id, name: option.name }))

      return {
        name,
        type: "variant",
        value: textValue.safeParse(held).data,
        default: textValue.safeParse(param.default).data ?? options[0]?.id,
        options
      }
    }

    if (param.type === "boolean") {
      return { name, type: "boolean", value: booleanValue.safeParse(held ?? fallback).data ?? false }
    }

    if (param.type === "number") {
      return {
        name,
        type: "number",
        value: numberValue.safeParse(held).data,
        default: numberValue.safeParse(fallback).data
      }
    }

    if (param.type === "text") {
      return {
        name,
        type: "text",
        value: held === undefined ? undefined : plainText(held),
        default: fallback === undefined ? undefined : plainText(fallback)
      }
    }

    return { name, type: "value", value: held, default: fallback, loose: true }
  })
}

/**
 * A component design's props: params with their defaults, then slots, a kind of prop that takes layers, with the layout
 * each fills where a param has its default. Variants aren't listed for now (PAR-1017).
 */
function ComponentProps({ entry }: { entry: ContainerEntry }) {
  const all = Object.entries(entry.container.params ?? {})
  const params = all.filter(([, param]) => param.type !== "variant")
  const slots = designSlots(entry.container)

  return (
    <PanelSection
      title="Props"
      count={params.length + slots.length}
      description="What each instance can change."
      action={<AddParam entry={entry} />}
    >
      <div className="flex flex-col gap-2.5">
        {params.length > 0 && <ParamRows entry={entry} params={params} />}
        {slots.map((slot) => (
          <SlotPropRow key={slot.node.id} entry={entry} slot={slot} />
        ))}
        <NewPropRow entry={entry} />
      </div>
    </PanelSection>
  )
}

/** A param's row for its kind of value: its default, which an instance shows faintly until it sets its own. */
function paramRow(name: string, param: ParamSpec): PropValueRow {
  const value = readPropValue(param.default)
  const kind = valueKind(value, param.type)

  if (kind === "boolean") {
    return { type: "boolean", value: booleanValue.safeParse(value).data ?? false }
  }

  if (kind === "number") {
    return { type: "number", value: numberValue.safeParse(value).data }
  }

  if (kind === "text") {
    return { type: "text", value: textValue.safeParse(value).data, placeholder: `${name}'s default` }
  }

  return { type: "value", value, loose: kind === "any" }
}

/**
 * A component design's params in the rows an instance's props are drawn in, each with its default to edit, and a menu
 * at the end of its name's row to rename or remove it.
 */
function ParamRows({ entry, params }: { entry: ContainerEntry; params: [string, ParamSpec][] }) {
  const session = useProject()
  const [renaming, setRenaming] = useState<string>()
  const [error, setError] = useState<string>()

  const record = (label: string, name: string, change: (container: ContainerSpec) => ContainerSpec, gesture?: string) =>
    updateAndRecord(session.store, entry.key, label, change, {
      field: `params.${name}`,
      read: (container) => paramValue(container, name),
      gesture
    })

  const rename = (from: string, to: string) => {
    setRenaming(undefined)

    if (to === "" || to === from) {
      setError(undefined)

      return
    }

    try {
      record(`Rename ${from}`, from, (container) => renameParam(container, from, to))
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const rows = params.map(([name, param]): PropRow => {
    if (renaming === name) {
      return {
        name,
        type: "shown",
        shown: (
          <Input
            ref={focusOnMount}
            defaultValue={name}
            aria-label={`Rename ${name}`}
            className="h-7 px-2 font-mono text-xs"
            onBlur={(event) => rename(name, event.currentTarget.value.trim())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              } else if (event.key === "Escape") {
                setRenaming(undefined)
              }
            }}
          />
        )
      }
    }

    return {
      ...paramRow(name, param),
      name,
      hint: `${name}: ${param.type}`,
      action: (
        <TitleMenu label={`More options for ${name}`} className="size-5" menuClassName="w-40">
          <DropdownMenuItem onClick={() => setRenaming(name)}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => record(`Remove ${name}`, name, (container) => removeParam(container, name))}
          >
            <Trash2 /> Remove
          </DropdownMenuItem>
        </TitleMenu>
      )
    }
  })

  return (
    <>
      <FieldGrid>
        <PropRows
          rows={rows}
          onChange={(name, value, gesture) =>
            record(
              `Change ${name} default`,
              name,
              (container) => ({
                ...container,
                params: { ...container.params, [name]: { ...container.params![name]!, default: value } }
              }),
              gesture
            )
          }
        />
      </FieldGrid>
      {error && <p className="type-message text-destructive">{error}</p>}
    </>
  )
}
