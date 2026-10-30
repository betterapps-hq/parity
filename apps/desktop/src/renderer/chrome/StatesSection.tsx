import {
  addState,
  changeCount,
  duplicateState,
  findNode,
  isBaseState,
  type NodePatch,
  removeState,
  renameState,
  resetOverride,
  type StateSpec
} from "@parity-app/core"
import { Copy, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useProject } from "../canvas/context.ts"
import { focusOnMount, kindColors, layerLabel, NodeIcon } from "../canvas/kinds.tsx"
import { activeState } from "../canvas/view.ts"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { Hint } from "./Hint.tsx"
import { PanelSection } from "./PanelSection.tsx"

/**
 * A design's states, like a Storybook file's stories. The first is the base: the design itself. Every other state
 * lists exactly what it changes, and each change can be reset.
 */
export function StatesSection({ entry }: { entry: ContainerEntry }) {
  const { store } = useProject()
  const { container, key } = entry
  const active = activeState(container)
  const allStates = container.view?.allStates ?? false
  const [renaming, setRenaming] = useState<string>()

  const view = (state: string) => store.updateView(key, (current) => ({ ...current, state, allStates: false }))
  const add = () => {
    let id = ""
    store.updateContainer(key, "Add state", (current) => {
      const result = addState(current, "New state")
      id = result.id
      return result.container
    })
    view(id)
    setRenaming(id)
  }

  return (
    <PanelSection
      title="States"
      action={
        <Button variant="ghost" size="icon-xs" aria-label="Add state" onClick={add}>
          <Plus />
        </Button>
      }
    >
      <ul className="flex flex-col gap-0.5" aria-label="States">
        {container.states.map((state, index) => (
          <StateRow
            key={state.id}
            state={state}
            base={index === 0}
            active={!allStates && state.id === active.id}
            renaming={renaming === state.id}
            onView={() => view(state.id)}
            onRename={() => setRenaming(state.id)}
            onRenamed={(name) => {
              setRenaming(undefined)
              if (name && name !== state.name) {
                store.updateContainer(key, "Rename state", (current) => renameState(current, state.id, name))
              }
            }}
            onDuplicate={() => {
              let id = ""
              store.updateContainer(key, "Duplicate state", (current) => {
                const result = duplicateState(current, state.id)
                id = result.id
                return result.container
              })
              view(id)
            }}
            onDelete={
              index === 0
                ? undefined
                : () => store.updateContainer(key, "Delete state", (current) => removeState(current, state.id))
            }
          />
        ))}
      </ul>
      <Label className="mt-3 flex items-center justify-between rounded-md px-2 text-xs font-normal text-muted-foreground">
        Show every state on the canvas
        <Switch
          size="sm"
          checked={allStates}
          onCheckedChange={(on) => store.updateView(key, (current) => ({ ...current, allStates: on }))}
        />
      </Label>
      {!isBaseState(container, active.id) && !allStates && <ChangesList entry={entry} state={active} />}
    </PanelSection>
  )
}

interface StateRowProps {
  state: StateSpec
  base: boolean
  active: boolean
  renaming: boolean
  onView(): void
  onRename(): void
  onRenamed(name: string | undefined): void
  onDuplicate(): void
  onDelete?: () => void
}

function StateRow({
  state,
  base,
  active,
  renaming,
  onView,
  onRename,
  onRenamed,
  onDuplicate,
  onDelete
}: StateRowProps) {
  const changes = changeCount(state)
  return (
    <li
      className={`group flex h-8 items-center gap-1 rounded-md pr-1 text-sm ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      }`}
    >
      {renaming ? (
        <span className="flex min-w-0 flex-1 items-center gap-2.5 pl-2">
          <RadioMark active={active} />
          <input
            ref={focusOnMount}
            defaultValue={state.name}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => onRenamed(event.currentTarget.value.trim() || undefined)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
              if (event.key === "Escape") onRenamed(undefined)
            }}
            className="h-6 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1.5 outline-none"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={onView}
          onDoubleClick={onRename}
          aria-pressed={active}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-2 text-left"
        >
          <RadioMark active={active} />
          <span className="min-w-0 flex-1 truncate">{state.name}</span>
        </button>
      )}
      <span className="shrink-0 px-1 text-xs text-muted-foreground">
        {base ? "Base" : changes === 0 ? "No changes" : `${changes} change${changes === 1 ? "" : "s"}`}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`${state.name} actions`}
            className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={!onDelete} onSelect={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function RadioMark({ active }: { active: boolean }) {
  return (
    <span
      className={`grid size-3.5 shrink-0 place-items-center rounded-full border ${active ? "border-foreground" : ""}`}
      aria-hidden
    >
      {active && <span className="size-1.5 rounded-full bg-foreground" />}
    </span>
  )
}

/** What a state changes, grouped by layer. Selecting a layer opens it for editing in this state. */
function ChangesList({ entry, state }: { entry: ContainerEntry; state: StateSpec }) {
  const { store, selection } = useProject()
  const entries = useContainerEntries(store)
  const overrides = Object.entries(state.overrides ?? {})
  return (
    <div className="mt-4">
      <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">Changes in {state.name}</div>
      {overrides.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Nothing yet. Select a layer and edit it while this state is shown.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {overrides.map(([nodeId, patch]) => {
            const node = findNode(entry.container.root, nodeId)
            return (
              <li key={nodeId} className="rounded-md border bg-muted/20 p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium hover:underline"
                    onClick={() => selection.set({ design: entry.key, node: nodeId })}
                  >
                    {node ? (
                      <NodeIcon node={node} className="size-3.5 shrink-0" style={{ color: kindColors.layer }} />
                    ) : (
                      <Pencil className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{node ? layerLabel(node, entries) : nodeId}</span>
                  </button>
                  <Hint label="Reset every change to this layer">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Reset every change to this layer"
                      onClick={() =>
                        store.updateContainer(entry.key, "Reset layer", (current) =>
                          resetOverride(current, state.id, nodeId)
                        )
                      }
                    >
                      <RotateCcw />
                    </Button>
                  </Hint>
                </div>
                <ul className="flex flex-col gap-0.5 pl-5">
                  {patchFields(patch).map((field) => (
                    <li key={field.id} className="flex items-baseline gap-2 text-xs">
                      <span className="shrink-0 text-muted-foreground">{field.label}</span>
                      <Hint label={field.value} wait>
                        <span className="min-w-0 flex-1 truncate font-mono">{field.value}</span>
                      </Hint>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function patchFields(patch: NodePatch): { id: string; label: string; value: string }[] {
  const fields: { id: string; label: string; value: string }[] = []
  if (patch.hidden !== undefined) fields.push({ id: "hidden", label: "Visible", value: patch.hidden ? "no" : "yes" })
  if (patch.text !== undefined) fields.push({ id: "text", label: "Text", value: patch.text })
  for (const [key, value] of Object.entries(patch.props ?? {})) {
    fields.push({ id: `props.${key}`, label: key === "children" ? "Label" : key, value: format(value) })
  }
  for (const [key, value] of Object.entries(patch.style ?? {})) {
    fields.push({ id: `style.${key}`, label: key, value: format(value) })
  }
  return fields
}

function format(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}
