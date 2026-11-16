import { Button, Switch } from "@buildkitgg/shadcn-baseui-kit"
import { GripVertical, Settings2 } from "lucide-react"
import type { ReactNode } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { setLayout } from "../../chrome/layout.ts"
import { Name } from "../../chrome/Name.tsx"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import { useSortable } from "../../inspector/controls/sortable.ts"
import { type BoardData, stateNouns } from "./model.ts"
import { type BoardView, orderedModes, orderedStates, shownModes, shownStates, useSketch } from "./sketch-state.tsx"

/*
 * A design's states and modes as the inspector lists them. The canvas's menus show the same lists, so either is shown,
 * hidden and put in order the same way in both: by its switch, and by its handle or by dragging its row.
 */

/** Opens the project's modes on the inspector's Modes tab. */
export const openModes = () => setLayout({ right: true, rightTab: "modes" })

/** Opens the project's modes, as the Modes section's action and the modes menu's. `onOpen` hears it first. */
export function EditModesButton({ onOpen }: { onOpen?: () => void }) {
  return (
    <Hint label="Edit modes">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Edit modes"
        onClick={() => {
          onOpen?.()
          openModes()
        }}
      >
        <Settings2 />
      </Button>
    </Hint>
  )
}

/** `order` with the entry at `from` moved to `to`. */
function moved(order: string[], from: number, to: number): string[] {
  const next = [...order]
  const [entry] = next.splice(from, 1)
  next.splice(to, 0, entry!)

  return next
}

/**
 * The design's modes in its own order, as the app's Modes section has them: each one's switch shows it, any can be off
 * while another shows, and the first shown is drawn at full size.
 */
export function ModesList({ board, view, group }: { board: BoardData; view: BoardView; group: string }) {
  const { modes, setView } = useSketch()
  const ordered = orderedModes(view, modes)
  const shown = shownModes(view, modes)

  return (
    <ShowList
      group={group}
      entries={ordered.map((mode) => ({
        id: mode.id,
        name: mode.name,
        icon: <ModeViewportIcon of={mode} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />,
        chips: [
          `${mode.width}px`,
          ...mode.options.filter(({ variable }) => variable.kind !== "viewport").map(({ option }) => option.name)
        ]
      }))}
      only={shown.length === 1 ? shown[0]!.id : undefined}
      shown={view.shown}
      says={{ only: "At least one mode always shows", show: (name) => `Show ${name}` }}
      onMove={(from, to) =>
        setView(board.id, (current) => ({
          order: moved(
            orderedModes(current, modes).map((mode) => mode.id),
            from,
            to
          )
        }))
      }
      onShow={(id, on) =>
        setView(board.id, (current) => ({
          shown: on ? [...current.shown, id] : current.shown.filter((each) => each !== id)
        }))
      }
    />
  )
}

/**
 * The design's states in its own order: a Storybook file's stories, as many as it has, each shown or not by its switch
 * and put in order as modes are. Any can be off while another shows.
 */
export function StatesList({ board, view, group }: { board: BoardData; view: BoardView; group: string }) {
  const { setView } = useSketch()
  const ordered = orderedStates(board, view)
  const shown = shownStates(board, view)
  const { one } = stateNouns(board.kind)

  return (
    <ShowList
      group={group}
      entries={ordered.map((state) => ({ id: state.id, name: state.name }))}
      only={shown.length === 1 ? shown[0]!.id : undefined}
      shown={view.statesShown}
      says={{ only: `At least one ${one} always shows`, show: (name) => `Show ${name}` }}
      onMove={(from, to) =>
        setView(board.id, (current) => ({
          stateOrder: moved(
            orderedStates(board, current).map((state) => state.id),
            from,
            to
          )
        }))
      }
      onShow={(id, on) =>
        setView(board.id, (current) => ({
          statesShown: on ? [...current.statesShown, id] : current.statesShown.filter((each) => each !== id)
        }))
      }
    />
  )
}

/** One of a list's entries: its name, an icon before it, and chips under it. */
interface Entry {
  id: string
  name: string
  icon?: ReactNode
  chips?: string[]
}

/**
 * Entries in the design's order, a row each: its handle, its name, and a switch that shows it. A row is put in place by
 * its handle, Up and Down on it, or by dragging the row itself. `group` keeps each list's rows to themselves.
 */
function ShowList({
  group,
  entries,
  only,
  shown,
  says,
  onMove,
  onShow
}: {
  group: string
  entries: Entry[]
  /** The one entry shown, where only one is, which stays on so the design shows something. */
  only: string | undefined
  shown: string[]
  /** What a switch's hint says: the only one's, and any other's. */
  says: { only: string; show: (name: string) => string }
  onMove: (from: number, to: number) => void
  onShow: (id: string, on: boolean) => void
}) {
  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <ShowRow
          key={entry.id}
          group={group}
          entry={entry}
          only={entry.id === only}
          shown={shown.includes(entry.id)}
          says={says}
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
  only,
  shown,
  says,
  onMove,
  onShow
}: {
  group: string
  entry: Entry
  only: boolean
  shown: boolean
  says: { only: string; show: (name: string) => string }
  onMove: ((from: number, to: number) => void) | undefined
  onShow: (on: boolean) => void
}) {
  const sort = useSortable({ group, label: entry.name, onMove })

  const name = (
    <>
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
    </>
  )

  return (
    <div
      {...sort.item}
      className={`flex items-center gap-1.5 rounded-md py-1 pr-3 ${entry.chips ? "min-h-11" : "min-h-8"}`}
    >
      {onMove ? (
        // No hint: the grip and its grab cursor say what it does, as a list's handle does.
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
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{name}</div>
      <Hint label={only ? says.only : says.show(entry.name)}>
        <span className="inline-flex">
          <Switch
            size="sm"
            aria-label={`Show ${entry.name}`}
            checked={shown}
            disabled={only}
            onCheckedChange={onShow}
          />
        </span>
      </Hint>
    </div>
  )
}
