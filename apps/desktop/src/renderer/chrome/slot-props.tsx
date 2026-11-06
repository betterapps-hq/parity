import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import {
  type ContainerSpec,
  defaultSlot,
  type DesignSlot,
  freeSlotName,
  type LayoutNode,
  type ParamSpec,
  setSlot,
  slotName,
  slotPlaceProblem,
  slotProblem,
  walkNodes
} from "@parity-app/core"
import {
  Braces,
  ChevronRight,
  Columns3,
  Hash,
  type LucideIcon,
  Plus,
  Rows3,
  SquareDashed,
  ToggleRight,
  Trash2,
  Type,
  X
} from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { Hint } from "./Hint.tsx"
import type { ValueKind } from "./prop-values.ts"
import { revealSelection } from "./reveal.ts"
import { openSlotRow, refuseSlotRow, useOpenSlotRow } from "./slot-focus.ts"

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

/** A component design's slots in the order code takes them: named ones first, then children, between the tags. */
export function slotsInCodeOrder(slots: DesignSlot[]): DesignSlot[] {
  return slots.toSorted((a, b) => Number(a.name === defaultSlot) - Number(b.name === defaultSlot))
}

/**
 * Updates a component design's slot in the store as one undoable step, opening its row under its new name, or says in
 * the row why it can't: a name that's taken or isn't usable, or a layout that can't be one.
 */
function useSlotEdit(entry: ContainerEntry, row: string) {
  const { store } = useProject()
  return (label: string, node: string, name: string | undefined, typed = false) => {
    let problem = name === undefined ? undefined : slotProblem(entry.container, node, name)
    // Children is chosen, never typed, so a named slot can't quietly become it.
    if (typed && name === defaultSlot) problem = "That's the children slot. Choose Children instead."
    if (problem) {
      refuseSlotRow(entry.key, row, problem)
      return
    }
    store.updateContainer(entry.key, label, (current) => setSlot(current, node, name))
    openSlotRow(entry.key, name)
  }
}

/**
 * A slot's row in Props: its tile, name and layout. Hovering it outlines the layout on the canvas; opening it sets
 * what kind of slot it is, its name, and removes it.
 */
export function SlotRow({ entry, slot }: { entry: ContainerEntry; slot: DesignSlot }) {
  const session = useProject()
  const openRow = useOpenSlotRow(entry.key)
  const open = openRow?.slot === slot.name
  const error = open ? openRow.error : undefined
  const { node, name } = slot
  const edit = useSlotEdit(entry, name)
  const named = name !== defaultSlot
  const LayoutIcon = node.style?.direction === "row" ? Columns3 : Rows3
  const errorId = `slot-error-${node.id}`
  const hover = (on: boolean) => session.selection.setHover(on ? { design: entry.key, node: node.id } : undefined)
  return (
    <li onPointerEnter={() => hover(true)} onPointerLeave={() => hover(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${name}, a slot in ${node.name ?? "a layout"}`}
        onClick={() => openSlotRow(entry.key, open ? undefined : name)}
        onFocus={() => hover(true)}
        onBlur={() => hover(false)}
        className="flex h-8 w-full items-center gap-2 rounded-md px-1 text-left text-xs hover:bg-accent/50 aria-expanded:bg-accent/50"
      >
        <PropTile kind="slot" />
        <span className="w-24 truncate font-mono">{name}</span>
        <span className="ml-auto flex min-w-0 items-center gap-1 text-muted-foreground">
          <LayoutIcon className="size-3 shrink-0" />
          <span className="truncate">{node.name ?? "Layout"}</span>
        </span>
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="mx-1 mt-1 mb-2 flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
          <div className="grid grid-cols-[64px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">Kind</span>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              aria-label={`${name} slot kind`}
              value={[named ? "named" : "children"]}
              onValueChange={([value]) => {
                if (value === "children" && named) edit("Rename slot", node.id, defaultSlot)
                if (value === "named" && !named) {
                  const next = freeSlotName(entry.container, node.id, slotName(node.name ?? "") || "content")
                  if (next) edit("Rename slot", node.id, next)
                }
              }}
            >
              <ToggleGroupItem value="children" className="h-6 px-2 text-xs">
                Children
              </ToggleGroupItem>
              <ToggleGroupItem value="named" className="h-6 px-2 text-xs">
                Named
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="text-xs text-muted-foreground">
            {named
              ? "A separate prop that takes layers. Keep it for small parts, like actions or an icon."
              : "Layers nested inside the component. In code, they go between its tags."}
          </p>
          {named && (
            <div className="grid grid-cols-[64px_1fr] items-center gap-2">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input
                key={name}
                defaultValue={name}
                aria-label="Slot name"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="h-7 px-2 font-mono text-xs"
                onBlur={(event) => {
                  const next = slotName(event.currentTarget.value)
                  if (!next || next === name) return
                  edit("Rename slot", node.id, next, true)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur()
                }}
              />
            </div>
          )}
          <div className="grid grid-cols-[64px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">Layout</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 justify-start px-2 text-xs"
              aria-label={`Select ${node.name ?? "its layout"}`}
              onClick={() => {
                session.selection.set({ design: entry.key, node: node.id })
                revealSelection(session)
              }}
            >
              <LayoutIcon /> <span className="truncate">{node.name ?? "Layout"}</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Its own layers show until an instance fills it.</p>
          {error && (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 self-start px-2 text-xs text-muted-foreground"
            onClick={() => edit("Remove slot", node.id, undefined)}
          >
            <Trash2 /> Remove slot
          </Button>
        </div>
      )}
    </li>
  )
}

/** The component design's layouts that can become a slot: not one already, and not inside or around one. */
function freeLayouts(container: ContainerSpec): LayoutNode[] {
  const list: LayoutNode[] = []
  walkNodes(container.root, (node) => {
    if (node.type === "layout" && node.slot === undefined && !slotPlaceProblem(container, node.id)) list.push(node)
  })
  return list
}

/**
 * Props' Add slot: the component's layouts that can be one, by name. Resting on one outlines it on the canvas; choosing
 * it makes it a slot, children while that's free, and opens its row.
 */
export function AddSlotMenu({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const { store } = session
  const layouts = freeLayouts(entry.container)
  const hover = (node?: string) => session.selection.setHover(node ? { design: entry.key, node } : undefined)
  return (
    <DropdownMenu onOpenChange={(open) => !open && hover()}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
            <Plus /> Add slot
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        {layouts.length === 0 && (
          <DropdownMenuItem disabled>No layout in {entry.container.name} can be a slot</DropdownMenuItem>
        )}
        {layouts.map((node) => {
          const Icon = node.style?.direction === "row" ? Columns3 : Rows3
          return (
            <DropdownMenuItem
              key={node.id}
              onPointerEnter={() => hover(node.id)}
              onFocus={() => hover(node.id)}
              onClick={() => {
                const name = freeSlotName(entry.container, node.id)
                if (!name) return
                store.updateContainer(entry.key, "Make slot", (current) => setSlot(current, node.id, name))
                openSlotRow(entry.key, name)
              }}
            >
              <Icon /> {node.name ?? "Layout"}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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

/** A slot's line in the component color, the tags muted, and params as text. */
function lineColor(line: { slot?: DesignSlot; muted?: boolean }): string | undefined {
  if (line.slot) return slotColor
  return line.muted ? "var(--muted-foreground)" : undefined
}

function paramCode(name: string, param: ParamSpec): string {
  const value = param.default
  if (typeof value === "boolean") return value ? name : `${name}={false}`
  if (typeof value === "string") return `${name}="${value}"`
  if (value === undefined) return `${name}={…}`
  return `${name}={${JSON.stringify(value)}}`
}

/**
 * How an instance of the component reads in code, with each param's default and each slot: named ones as props that
 * take layers, and children between the tags. Hovering a slot's line outlines its layout.
 */
export function CodeLines({ entry, slots }: { entry: ContainerEntry; slots: DesignSlot[] }) {
  const session = useProject()
  const tag = codeName(entry.container.name)
  const params = Object.entries(entry.container.params ?? {})
  const children = slots.find((slot) => slot.name === defaultSlot)
  const lines: { text: string; slot?: DesignSlot; muted?: boolean }[] = [{ text: `<${tag}`, muted: true }]
  for (const [name, param] of params) lines.push({ text: `  ${paramCode(name, param)}` })
  for (const slot of slots.filter((each) => each !== children)) lines.push({ text: `  ${slot.name}={<>…</>}`, slot })
  if (children) {
    lines.push({ text: ">", muted: true })
    lines.push({ text: `  {/* ${children.node.name ?? "children"} */}`, slot: children })
    lines.push({ text: `</${tag}>`, muted: true })
  } else {
    lines.push({ text: "/>", muted: true })
  }
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/40 py-2 font-mono text-[11px] leading-5">
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
 * layer can become. Once it's a slot, its name opens its row in the component's Props, and × makes it a plain layout.
 * A layout inside a slot, or around one, can't be one, and says why.
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
        onClick={() => store.updateContainer(entry.key, "Make slot", (current) => setSlot(current, node.id, name))}
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
          openSlotRow(entry.key, slot)
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
            store.updateContainer(entry.key, "Remove slot", (current) => setSlot(current, node.id, undefined))
          }
        >
          <X />
        </Button>
      </Hint>
    </ButtonGroup>
  )
}
