import { ImageUp, SquareDashedMousePointer, SquarePlus } from "lucide-react"
import { type ReactNode, useId } from "react"
import { Kbd } from "@/components/ui/kbd"
import { useProject } from "../../canvas/context.ts"
import { DesignIcon, kindColors } from "../../canvas/kinds.tsx"
import { openQuickInsert } from "../../chrome/QuickInsert.tsx"
import { useContainerEntries, useNotes } from "../../design-store.ts"
import { keysOf, makeNew, type StartCommand } from "./commands.ts"

/** Whether the active tab's canvas has nothing on it: no screen, no component and no note. */
export function useCanvasEmpty(): boolean {
  const { store } = useProject()
  const entries = useContainerEntries(store)
  const notes = useNotes(store)
  return entries.length === 0 && notes.length === 0
}

interface Tile {
  command: StartCommand
  label: string
  description: string
  color: string
  icon: (props: { className: string }) => ReactNode
  run: () => void
}

function ScreenIcon({ className }: { className: string }) {
  return <DesignIcon kind="screen" className={className} />
}

function ComponentIcon({ className }: { className: string }) {
  return <DesignIcon kind="component" className={className} />
}

/**
 * How to start, in the middle of an empty canvas: a tile for each kind of thing to make, each with its keys, and below
 * them the other ways in, Insert and an image. It goes once anything is on the canvas, and the canvas around it still
 * pans, zooms and takes a drop. With `frames`, Draw a frame joins the tiles, as it will once PAR-540's frames exist.
 */
export function CanvasStart({ frames = false, onDrawFrame }: { frames?: boolean; onDrawFrame?: () => void }) {
  const session = useProject()
  const empty = useCanvasEmpty()
  const heading = useId()
  if (!empty) return null
  const tiles: Tile[] = [
    {
      command: "newScreen",
      label: "New screen",
      description: "A page of your app, shown in each of its modes",
      color: kindColors.screen,
      icon: ScreenIcon,
      run: () => makeNew(session, "screen")
    },
    {
      command: "newComponent",
      label: "New component",
      description: "A reusable piece to place in your screens",
      color: kindColors.component,
      icon: ComponentIcon,
      run: () => makeNew(session, "component")
    },
    ...(frames
      ? [
          {
            command: "drawFrame" as const,
            label: "Draw a frame",
            description: "A sketch at any size, to turn into a screen or component later",
            color: kindColors.layer,
            icon: SquareDashedMousePointer,
            run: () => onDrawFrame?.()
          }
        ]
      : [])
  ]
  return (
    // Only the start takes the pointer; around it, the canvas behind pans, zooms and takes drops as usual.
    <div className="pointer-events-none absolute inset-0 z-[300] grid place-items-center p-8">
      <section aria-labelledby={heading} className="flex w-full max-w-[40rem] flex-col items-center gap-5">
        <h2 id={heading} className="text-[15px] font-semibold text-foreground">
          {frames ? "Start with a screen, a component or a frame" : "Start with a screen or a component"}
        </h2>
        <div
          className="pointer-events-auto grid w-full gap-3"
          style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
        >
          {tiles.map((tile) => (
            <StartTile key={tile.command} tile={tile} />
          ))}
        </div>
        <ul className="pointer-events-auto flex flex-col items-stretch gap-0.5 text-[13px] text-muted-foreground">
          <li>
            <button
              type="button"
              onClick={openQuickInsert}
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <SquarePlus className="size-4 shrink-0" />
              <span className="flex-1 text-left">Insert a layout, text or a component</span>
              <Kbd className="ml-6">/</Kbd>
            </button>
          </li>
          <li className="flex h-8 items-center gap-2.5 px-2.5">
            <ImageUp className="size-4 shrink-0" />
            <span className="flex-1">Drop or paste an image here</span>
            <Kbd className="ml-6">Ctrl V</Kbd>
          </li>
        </ul>
      </section>
    </div>
  )
}

function StartTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon
  return (
    <button
      type="button"
      onClick={tile.run}
      className="group flex min-h-36 flex-col items-start gap-3 rounded-xl border bg-background/90 p-4 text-left shadow-sm backdrop-blur outline-none transition-colors hover:border-foreground/25 hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span
        className="grid size-9 place-items-center rounded-lg"
        style={{ color: tile.color, background: `color-mix(in oklch, ${tile.color} 14%, transparent)` }}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{tile.label}</span>
        <span className="text-xs leading-snug text-muted-foreground">{tile.description}</span>
      </span>
      <Kbd className="mt-auto">{keysOf(tile.command)}</Kbd>
    </button>
  )
}
