import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  Switch
} from "@buildkitgg/shadcn-baseui-kit"
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
  type StateSpec,
  targetPatches
} from "@parity-app/core"
import { activeState } from "@parity-app/editor"
import { Copy, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useState } from "react"
import { useProject } from "../canvas/context.ts"
import { focusOnMount, kindColors, layerLabel, NodeIcon } from "../canvas/kinds.tsx"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { Hint } from "./Hint.tsx"
import { statesValue, updateAndRecord } from "./inspector-events.ts"
import { Name } from "./Name.tsx"
import { GroupLabel, PanelSection } from "./PanelSection.tsx"
import { textValue } from "./prop-values.ts"

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

  // A change to the states records them all, by id and name, before and after (PAR-713).
  const states = { field: "states", read: statesValue }

  const view = (state: string, name = container.states.find(({ id }) => id === state)?.name ?? state) =>
    store.updateView(key, `Show ${name}`, (current) => ({ ...current, state, allStates: false }))

  const add = () => {
    let id = ""
    updateAndRecord(
      store,
      key,
      "Add state",
      (current) => {
        const result = addState(current, "New state")
        id = result.id

        return result.container
      },
      states
    )
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
                updateAndRecord(store, key, "Rename state", (current) => renameState(current, state.id, name), states)
              }
            }}
            onDuplicate={() => {
              let id = ""
              updateAndRecord(
                store,
                key,
                "Duplicate state",
                (current) => {
                  const result = duplicateState(current, state.id)
                  id = result.id

                  return result.container
                },
                states
              )
              view(id)
            }}
            onDelete={
              index === 0
                ? undefined
                : () => updateAndRecord(store, key, "Delete state", (current) => removeState(current, state.id), states)
            }
          />
        ))}
      </ul>
      <Label className="mt-3 flex items-center justify-between rounded-md px-2 text-xs font-normal text-muted-foreground">
        Show every state on the canvas
        <Switch
          size="sm"
          checked={allStates}
          onCheckedChange={(on) =>
            store.updateView(key, on ? "Show every state" : `Show ${active.name}`, (current) => ({
              ...current,
              allStates: on
            }))
          }
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
  onView: () => void
  onRename: () => void
  onRenamed: (name: string | undefined) => void
  onDuplicate: () => void
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
  // The first state is what the others change, so it has nothing to count.
  const changes = changeCount(state)
  let summary = `${changes} change${changes === 1 ? "" : "s"}`

  if (base) {
    summary = ""
  } else if (changes === 0) {
    summary = "No changes"
  }

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
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }

              if (event.key === "Escape") {
                onRenamed(undefined)
              }
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
          <Name className="min-w-0 flex-1">{state.name}</Name>
        </button>
      )}
      {summary && <span className="shrink-0 px-1 text-xs text-muted-foreground">{summary}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`${state.name} actions`}
              className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={!onDelete} onClick={onDelete}>
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
      <GroupLabel as="div" className="mb-2 px-1">
        Changes in {state.name}
      </GroupLabel>
      {overrides.length === 0 ? (
        <p className="type-description px-1 text-muted-foreground">
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
                    <Name>{node ? layerLabel(node, entries, store.getComponentLibrary()) : nodeId}</Name>
                  </button>
                  <Hint label="Reset every change to this layer">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Reset every change to this layer"
                      onClick={() =>
                        updateAndRecord(
                          store,
                          entry.key,
                          "Reset layer",
                          (current) => resetOverride(current, state.id, nodeId),
                          {
                            field: "overrides",
                            layers: [nodeId],
                            state: state.id,
                            read: (current) => targetPatches(current, state.id)?.[nodeId]
                          }
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

  if (patch.hidden !== undefined) {
    fields.push({ id: "hidden", label: "Visible", value: patch.hidden ? "no" : "yes" })
  }

  if (patch.text !== undefined) {
    fields.push({ id: "text", label: "Text", value: patch.text })
  }

  for (const [key, value] of Object.entries(patch.props ?? {})) {
    fields.push({ id: `props.${key}`, label: key === "children" ? "Label" : key, value: format(value) })
  }

  for (const [key, value] of Object.entries(patch.style ?? {})) {
    fields.push({ id: `style.${key}`, label: key, value: format(value) })
  }

  return fields
}

/** A patched value as its row shows it: text as itself, anything else as JSON. */
function format<Value>(value: Value): string {
  const text = textValue.safeParse(value)

  return text.success ? text.data : JSON.stringify(value)
}
