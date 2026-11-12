import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input
} from "@buildkitgg/shadcn-baseui-kit"
import {
  addValueProp,
  childrenSlot,
  type ContainerSpec,
  type DesignSlot,
  freeSlotName,
  type LayoutNode,
  type ParamSpec,
  propNameProblem,
  setSlot,
  slotName,
  slotPlaceProblem,
  slotProblem,
  type ValuePropType,
  findNode,
  walkNodes
} from "@parity-app/core"
import { Braces, Columns3, Hash, type LucideIcon, Plus, Rows3, SquareDashed, ToggleRight, Type, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { useProject } from "../canvas/context.ts"
import { focusOnMount, kindColors } from "../canvas/kinds.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { Hint } from "./Hint.tsx"
import { paramValue, updateAndRecord } from "./inspector-events.ts"
import { refuseNewProp, startNewProp, useNewProp } from "./new-prop.ts"
import { booleanValue, textValue, type ValueKind } from "./prop-values.ts"
import { revealSelection } from "./reveal.ts"
import { focusSlot, refuseSlotName, slotFocused, useSlotFocus } from "./slot-focus.ts"

const slotColor = kindColors.component
const tint = (percent: number) => `color-mix(in oklch, ${slotColor} ${percent}%, transparent)`

const kindIcons: Record<ValueKind | "slot", LucideIcon> = {
  text: Type,
  number: Hash,
  boolean: ToggleRight,
  json: Braces,
  any: Braces,
  slot: SquareDashed
}

/**
 * A prop's type, as a small tile before its name: a slot's in the component color, so slots stand out among params.
 * The name beside it says the type in words.
 */
export function PropTile({ kind }: { kind: ValueKind | "slot" }) {
  const Icon = kindIcons[kind]

  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center rounded-[5px] border bg-muted/60 text-muted-foreground"
      style={kind === "slot" ? { color: slotColor, borderColor: tint(40), background: tint(10) } : undefined}
    >
      <Icon className="size-3" />
    </span>
  )
}

function LayoutIcon({ node }: { node: LayoutNode }) {
  const Icon = node.style?.flexDirection === "row" ? Columns3 : Rows3

  return <Icon className="size-3 shrink-0" />
}

/** The component design's layouts that can become a slot: not one already, and not inside or around one. */
function freeLayouts(container: ContainerSpec): LayoutNode[] {
  const list: LayoutNode[] = []
  walkNodes(container.root, (node) => {
    if (node.type === "layout" && node.slot === undefined && !slotPlaceProblem(container, node.id)) {
      list.push(node)
    }
  })

  return list
}

/** The slot a layout is, as `inspector.changed` records it (PAR-713). */
function slotField(nodeId: string) {
  return {
    field: "slot",
    layers: [nodeId],
    read: (container: ContainerSpec) => {
      const node = findNode(container.root, nodeId)

      return node?.type === "layout" ? node.slot : undefined
    }
  }
}

/** The value props Add offers, as Props shows their kinds. */
const valueKinds: { type: ValuePropType; label: string; icon: LucideIcon }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "number", label: "Number", icon: Hash },
  { type: "boolean", label: "Toggle", icon: ToggleRight }
]

/**
 * Props' Add: a value prop of a kind, Text, Number or Toggle, whose name is then typed in a new row; or a slot, made
 * from one of the component's layouts and named after it, with its name focused to rename. Resting on a layout
 * outlines it on the canvas. With no layout left that can be one, slots aren't offered: Make slot on a layout says why.
 */
export function AddProp({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const { container, key } = entry
  const layouts = freeLayouts(container)
  const hover = (node?: string) => session.selection.setHover(node ? { design: key, node } : undefined)

  return (
    <DropdownMenu onOpenChange={(open) => !open && hover()}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" aria-label="Add a prop">
            <Plus /> Add
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Value</DropdownMenuLabel>
          {valueKinds.map(({ type, label, icon: Icon }) => (
            <DropdownMenuItem key={type} onClick={() => startNewProp(key, type)}>
              <Icon /> {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {layouts.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Slot from a layout</DropdownMenuLabel>
              {layouts.map((node) => (
                <DropdownMenuItem
                  key={node.id}
                  onPointerEnter={() => hover(node.id)}
                  onFocus={() => hover(node.id)}
                  onClick={() => {
                    const name = freeSlotName(container, node.id)

                    if (!name) {
                      return
                    }

                    updateAndRecord(
                      session.store,
                      key,
                      "Make slot",
                      (current) => setSlot(current, node.id, name),
                      slotField(node.id)
                    )
                    focusSlot(key, node.id)
                  }}
                >
                  <LayoutIcon node={node} /> {node.name ?? "Layout"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The row a new value prop's name is typed in, at the end of Props, with its kind's tile: Enter adds it, with a default
 * for its kind to change in the row it becomes; Escape, or leaving it empty, doesn't. A name that can't be used stays
 * typed, with the reason under it.
 */
export function NewPropRow({ entry }: { entry: ContainerEntry }) {
  const { store } = useProject()
  const adding = useNewProp(entry.key)

  if (!adding) {
    return null
  }

  const kind = valueKinds.find((each) => each.type === adding.type)!

  const add = (text: string) => {
    const name = slotName(text)

    if (!name) {
      return startNewProp(entry.key, undefined)
    }

    const problem = propNameProblem(entry.container, name)

    if (problem) {
      return refuseNewProp(problem)
    }

    updateAndRecord(store, entry.key, `Add ${name}`, (current) => addValueProp(current, name, adding.type), {
      field: `params.${name}`,
      read: (current) => paramValue(current, name)
    })
    startNewProp(entry.key, undefined)
  }

  return (
    <div>
      <div className="grid grid-cols-[20px_96px_1fr] items-center gap-2 px-1">
        <PropTile kind={adding.type} />
        <Input
          ref={focusOnMount}
          placeholder="Name"
          aria-label={`New ${kind.label.toLowerCase()} prop's name`}
          aria-invalid={adding.error ? true : undefined}
          aria-describedby={adding.error ? "new-prop-error" : undefined}
          className="-ml-1 h-7 min-w-0 px-1 font-mono text-xs"
          onBlur={(event) => add(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              add(event.currentTarget.value)
            }

            if (event.key === "Escape") {
              startNewProp(entry.key, undefined)
            }
          }}
        />
        <span className="truncate text-xs text-muted-foreground">{kind.label}, Enter to add</span>
      </div>
      {adding.error && (
        <p id="new-prop-error" role="alert" className="type-message px-1 pt-1 text-destructive">
          {adding.error}
        </p>
      )}
    </div>
  )
}

/**
 * A slot in Props, lined up with the params: its tile, its name to rename, and where a param has its default, the
 * layout it fills, which selects that layout. Hovering it outlines the layout on the canvas, and an × inside that field
 * removes it on hover or focus. A refused name stays typed, with the reason under it.
 */
export function SlotPropRow({ entry, slot }: { entry: ContainerEntry; slot: DesignSlot }) {
  const session = useProject()
  const { key, container } = entry
  const { node, name } = slot
  const focus = useSlotFocus(key)
  const mine = focus?.node === node.id
  const error = mine ? focus.error : undefined
  const errorId = `slot-error-${node.id}`
  const input = useRef<HTMLInputElement>(null)
  const wantsFocus = mine && focus.focus === true
  useEffect(() => {
    if (!wantsFocus) {
      return
    }

    input.current?.scrollIntoView({ block: "nearest" })
    input.current?.select()
    slotFocused()
  }, [wantsFocus])
  const hover = (on: boolean) => session.selection.setHover(on ? { design: key, node: node.id } : undefined)

  const rename = (text: string) => {
    const next = slotName(text)

    if (!next || next === name) {
      return refuseSlotName(key, node.id, undefined)
    }

    const problem = slotProblem(container, node.id, next)

    if (problem) {
      return refuseSlotName(key, node.id, problem)
    }

    refuseSlotName(key, node.id, undefined)
    updateAndRecord(session.store, key, "Rename slot", (current) => setSlot(current, node.id, next), slotField(node.id))
  }

  return (
    <div className="group" onPointerEnter={() => hover(true)} onPointerLeave={() => hover(false)}>
      <div className="grid grid-cols-[20px_96px_1fr] items-center gap-2 px-1">
        <PropTile kind="slot" />
        <Input
          ref={input}
          key={name}
          defaultValue={name}
          aria-label={`${name} slot name`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="-ml-1 h-7 min-w-0 border-transparent bg-transparent px-1 font-mono text-xs shadow-none hover:border-input dark:bg-transparent"
          onBlur={(event) => rename(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter renames even when the window isn't focused, where blurring the field fires no blur.
            if (event.key === "Enter") {
              rename(event.currentTarget.value)
            }
          }}
        />
        {/* The × sits inside the field, so showing it never changes the field's width. */}
        <div className="relative min-w-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full min-w-0 justify-start px-2 pr-7 text-xs font-normal"
            aria-label={`Select ${node.name ?? "its layout"}`}
            onFocus={() => hover(true)}
            onBlur={() => hover(false)}
            onClick={() => {
              session.selection.set({ design: key, node: node.id })
              revealSelection(session)
            }}
          >
            <LayoutIcon node={node} />
            <span className="truncate">{node.name ?? "Layout"}</span>
          </Button>
          <Hint label={`Remove the ${name} slot`}>
            <button
              type="button"
              aria-label={`Remove the ${name} slot`}
              className="absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent hover:text-foreground"
              onClick={() =>
                updateAndRecord(
                  session.store,
                  key,
                  "Remove slot",
                  (current) => setSlot(current, node.id, undefined),
                  slotField(node.id)
                )
              }
            >
              <X className="size-3" />
            </button>
          </Hint>
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="type-message px-1 pt-1 text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** The component's name as code calls it: "App top bar" is AppTopBar. */
function codeName(name: string): string {
  const pascal = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join("")

  return /^[A-Za-z]/.test(pascal) ? pascal : `Component${pascal}`
}

interface CodeLine {
  text: string
  slot?: DesignSlot
  muted?: boolean
}

/** A slot's line in the component color, the tags muted, and params as text. */
function lineColor(line: CodeLine): string | undefined {
  if (line.slot) {
    return slotColor
  }

  return line.muted ? "var(--muted-foreground)" : undefined
}

function paramCode(name: string, param: ParamSpec): string {
  const value = param.default
  const flag = booleanValue.safeParse(value)

  if (flag.success) {
    return flag.data ? name : `${name}={false}`
  }

  const text = textValue.safeParse(value)

  if (text.success) {
    return `${name}="${text.data}"`
  }

  if (value === undefined) {
    return `${name}={…}`
  }

  return `${name}={${JSON.stringify(value)}}`
}

/**
 * How an instance of the component reads in code, with each param's default and each slot: the one `childrenSlot`
 * picks between the tags, the others as props that take layers. Hovering a slot's line outlines its layout.
 */
export function CodeLines({ entry, slots }: { entry: ContainerEntry; slots: DesignSlot[] }) {
  const session = useProject()
  const tag = codeName(entry.container.name)
  const params = Object.entries(entry.container.params ?? {})
  const children = childrenSlot(slots)
  const lines: CodeLine[] = [{ text: `<${tag}`, muted: true }]

  for (const [name, param] of params) {
    lines.push({ text: `  ${paramCode(name, param)}` })
  }

  for (const slot of slots) {
    if (slot !== children) {
      lines.push({ text: `  ${slot.name}={<>…</>}`, slot })
    }
  }

  if (children) {
    lines.push({ text: ">", muted: true })
    lines.push({ text: `  {/* ${children.name} */}`, slot: children })
    lines.push({ text: `</${tag}>`, muted: true })
  } else {
    lines.push({ text: "/>", muted: true })
  }

  return (
    <pre className="type-code overflow-x-auto rounded-md border bg-muted/40 py-2 font-mono">
      {lines.map((line, index) => (
        <div
          key={index}
          className="px-2"
          onPointerEnter={
            line.slot ? () => session.selection.setHover({ design: entry.key, node: line.slot!.node.id }) : undefined
          }
          onPointerLeave={line.slot ? () => session.selection.setHover(undefined) : undefined}
          style={{ color: lineColor(line) }}
        >
          {line.text}
        </div>
      ))}
    </pre>
  )
}

/**
 * A layout of a component design, in its layer panel's header: Make slot beside Make component, the other thing a
 * layer can become. Once it's a slot, its name goes to it in the component's Props, and × makes it a plain layout. A
 * layout inside a slot, or around one, can't be one, and says why.
 */
export function MakeSlot({ entry, node }: { entry: ContainerEntry; node: LayoutNode }) {
  const session = useProject()
  const { store } = session
  const place = slotPlaceProblem(entry.container, node.id)

  if (node.slot === undefined) {
    const name = freeSlotName(entry.container, node.id)

    // Unavailable, it stays focusable and says why, rather than going quietly grey.
    if (place || !name) {
      return (
        <Hint label={place ?? "No slot name is free"}>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 opacity-50"
            aria-disabled
            aria-label={`Make slot, unavailable: ${place ?? "No slot name is free"}`}
          >
            <SquareDashed /> Make slot
          </Button>
        </Hint>
      )
    }

    return (
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() =>
          updateAndRecord(
            store,
            entry.key,
            "Make slot",
            (current) => setSlot(current, node.id, name),
            slotField(node.id)
          )
        }
      >
        <SquareDashed style={{ color: slotColor }} /> Make slot
      </Button>
    )
  }

  const slot = node.slot

  // The kit's button group, with the same small outline buttons as Make component beside it, so the two line up.
  return (
    <ButtonGroup className="min-w-0 flex-1">
      <Button
        variant="outline"
        size="sm"
        className="min-w-0 flex-1 justify-start"
        aria-label={`Edit the ${slot} slot in ${entry.container.name}'s props`}
        onClick={() => {
          session.selection.set({ design: entry.key })
          focusSlot(entry.key, node.id)
        }}
      >
        <SquareDashed style={{ color: slotColor }} />
        <span className="truncate font-mono" style={{ color: slotColor }}>
          {slot}
        </span>
      </Button>
      <Hint label={`Remove the ${slot} slot`}>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Remove the ${slot} slot`}
          onClick={() =>
            updateAndRecord(
              store,
              entry.key,
              "Remove slot",
              (current) => setSlot(current, node.id, undefined),
              slotField(node.id)
            )
          }
        >
          <X />
        </Button>
      </Hint>
    </ButtonGroup>
  )
}
