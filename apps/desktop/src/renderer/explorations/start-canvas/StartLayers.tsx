import type { ContainerKind } from "@parity-app/core"
import { ChevronRight, Plus } from "lucide-react"
import { useProject } from "../../canvas/context.ts"
import { DesignIcon, designColor } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { type ContainerEntry, useContainerEntries } from "../../design-store.ts"
import { selectedDesigns, useSelection } from "../../selection.ts"
import { keysOf, makeNew } from "./commands.ts"

interface Group {
  title: string
  kind: ContainerKind
  entries: ContainerEntry[]
  /** The command's name, for the + and the empty row. */
  action: string
  /** What the empty row says before its action. */
  none: string
}

/**
 * The Layers tab as proposed: each group's + always shows beside its heading, with its keys in the tooltip, and an
 * empty group's row is a button that makes the first one. The count stays beside the +, and is left out at none,
 * where the row says so. A design's rows are drawn as today's, closed; this exploration changes only the headings and
 * the empty rows.
 */
export function StartLayers() {
  const session = useProject()
  const entries = useContainerEntries(session.store)
  const groups: Group[] = [
    {
      title: "Components",
      kind: "component",
      entries: entries.filter((entry) => entry.container.kind === "component"),
      action: "New component",
      none: "No components yet."
    },
    {
      title: "Screens",
      kind: "screen",
      entries: entries.filter((entry) => entry.container.kind !== "component"),
      action: "New screen",
      none: "No screens yet."
    }
  ]
  return (
    <div className="flex flex-col py-2 text-[13px]" aria-label="Layers">
      {groups.map((group) => {
        const command = group.kind === "component" ? "newComponent" : "newScreen"
        return (
          <section key={group.title} className="mb-2" aria-label={group.title}>
            <div className="flex h-7 items-center gap-1 pr-1.5 pl-3 text-xs text-muted-foreground">
              <h3 className="flex-1 font-normal">{group.title}</h3>
              {group.entries.length > 0 && <span className="tabular-nums">{group.entries.length}</span>}
              <IconButton
                label={group.action}
                shortcut={keysOf(command)}
                onClick={() => makeNew(session, group.kind)}
                className="size-6"
              >
                <Plus />
              </IconButton>
            </div>
            {group.entries.length === 0 ? (
              <button
                type="button"
                onClick={() => makeNew(session, group.kind)}
                className="group/empty mx-1.5 flex h-7 w-[calc(100%-0.75rem)] items-center gap-1 rounded-md px-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {group.none}{" "}
                <span
                  className="font-medium underline-offset-2 group-hover/empty:underline"
                  style={{ color: designColor(group.kind) }}
                >
                  {group.action}
                </span>
              </button>
            ) : (
              group.entries.map((entry) => <DesignRow key={entry.key} entry={entry} />)
            )}
          </section>
        )
      })}
    </div>
  )
}

/** A design's row, closed, as today's Layers panel draws it: selecting it selects the design on the canvas. */
function DesignRow({ entry }: { entry: ContainerEntry }) {
  const { selection } = useProject()
  const selected = selectedDesigns(useSelection(selection)).includes(entry.key)
  const { container } = entry
  const color = designColor(container.kind)
  const states = container.states.length
  return (
    <button
      type="button"
      onClick={() => selection.set({ design: entry.key })}
      aria-pressed={selected}
      className={`relative flex h-7 w-full cursor-default items-center gap-1.5 pr-2 pl-2 text-left font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/40"
      }`}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: color }} />}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
      <DesignIcon kind={container.kind} className="size-3.5 shrink-0" style={{ color }} />
      <span className="min-w-0 flex-1 truncate">{container.name}</span>
      <Hint label={states === 1 ? "1 state" : `${states} states`} wait>
        <span className="text-xs font-normal text-muted-foreground tabular-nums opacity-70">{states}</span>
      </Hint>
    </button>
  )
}
