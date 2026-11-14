import { Switch } from "@buildkitgg/shadcn-baseui-kit"
import { GripVertical } from "lucide-react"
import type { ReactNode } from "react"
import { useSortable } from "../inspector/controls/sortable.ts"
import { Hint } from "./Hint.tsx"
import { Name } from "./Name.tsx"

/** One of a list's entries: its name, an icon before it, and tags under it. */
export interface ShowEntry {
  id: string
  name: string
  icon?: ReactNode
  chips?: readonly string[]
}

/**
 * A design's modes or states in its own order, a row each: its handle, its name, and a switch that shows it (PAR-1071).
 * The Modes section and the canvas's menus list them alike. A row is put in place by its handle, Up and Down on it, or
 * by dragging the row. Any can be off while another shows; the one left showing can't be switched off. `group` keeps
 * each list's rows to themselves.
 */
export function ShowList({
  group,
  entries,
  shown,
  selected,
  only,
  onMove,
  onShow
}: {
  group: string
  entries: readonly ShowEntry[]
  shown: ReadonlySet<string>
  /** The entry selected on the canvas, which its row marks. */
  selected?: string | undefined
  /** What the hint of the switch that can't go off says: "At least one mode always shows". */
  only: string
  onMove: (from: number, to: number) => void
  onShow: (id: string, on: boolean) => void
}) {
  const showing = entries.filter((entry) => shown.has(entry.id))

  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <ShowRow
          key={entry.id}
          group={group}
          entry={entry}
          shown={shown.has(entry.id)}
          last={showing.length === 1 && showing[0] === entry}
          selected={selected === entry.id}
          only={only}
          onMove={entries.length > 1 ? onMove : undefined}
          onShow={(on) => onShow(entry.id, on)}
        />
      ))}
    </div>
  )
}

function ShowRow({
  group,
  entry,
  shown,
  last,
  selected,
  only,
  onMove,
  onShow
}: {
  group: string
  entry: ShowEntry
  shown: boolean
  /** It's the only one showing, so it stays on. */
  last: boolean
  selected: boolean
  only: string
  onMove: ((from: number, to: number) => void) | undefined
  onShow: (on: boolean) => void
}) {
  const sort = useSortable({ group, label: entry.name, onMove })

  return (
    <div
      {...sort.item}
      className={`flex items-center gap-1.5 rounded-md py-1 pr-3 ${entry.chips ? "min-h-11" : "min-h-8"} ${selected ? "bg-accent/60" : ""}`}
    >
      {onMove ? (
        // No hint: the grip and its grab cursor say what it does, as a list's handle does (list-parts.tsx).
        <button
          type="button"
          aria-label={`Move ${entry.name}`}
          aria-keyshortcuts="ArrowUp ArrowDown"
          onPointerDown={sort.handle.onPointerDown}
          onKeyDown={sort.handle.onKeyDown}
          className="grid h-7 w-3 shrink-0 cursor-grab touch-none place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical className="size-3" />
        </button>
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          {entry.icon}
          <Name>{entry.name}</Name>
        </span>
        {entry.chips && (
          <span className="flex flex-wrap gap-1">
            {entry.chips.map((chip, index) => (
              <span key={index} className="rounded bg-muted px-1.5 py-px text-2xs text-muted-foreground">
                {chip}
              </span>
            ))}
          </span>
        )}
      </div>
      <Hint label={last ? only : `Show ${entry.name}`}>
        <span className="inline-flex">
          <Switch
            size="sm"
            aria-label={`Show ${entry.name}`}
            checked={shown}
            disabled={last}
            onCheckedChange={onShow}
          />
        </span>
      </Hint>
    </div>
  )
}
