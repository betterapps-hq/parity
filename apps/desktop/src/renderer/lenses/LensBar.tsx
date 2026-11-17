import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  Kbd
} from "@buildkitgg/shadcn"
import { barOrder } from "@parity-app/lenses"
import { Columns2, SquareArrowOutDownLeft, SquareArrowOutUpRight, SquarePlus, X } from "lucide-react"
import type { KeyboardEvent } from "react"
import { Hint } from "../chrome/Hint.tsx"
import { lensDragType } from "./dock-adapter.ts"
import type { LensView } from "./registry.ts"
import type { LensActions } from "./shell.ts"

/** The window's chrome: the title bar's strip and the lens bar down the left, one surface, as the tab strip was. */
export const chromeSurface = "bg-neutral-100 dark:bg-[#0a0a0a]"

/** Where a lens shows when it isn't the one in focus, for its hint. */
const placeWords = { tab: "Open in a tab", window: "In its own window" }

/**
 * The lenses, one above another down the window's left edge, as VS Code's activity bar lists its views, on the same
 * surface as the title bar. They work as links do in a browser: a click shows the lens in the tab in focus, and
 * Ctrl+click or a middle click opens it in a new tab. The lens in the tab in focus is picked out; one open in another
 * tab or window has a dot, and clicking it goes there. A lens the project has nothing for sits at the bottom, quieter.
 * Clicking the lens in focus hides or shows the left panel, as VS Code's does. The arrow keys move between lenses, and
 * each has a menu to open it in a new tab, split it or move it to a window, and can be dragged onto the tabs, a
 * canvas's side or out of the window.
 */
export function LensBar<Id extends string>({
  lenses,
  actions
}: {
  lenses: readonly LensView<Id>[]
  actions: LensActions<Id>
}) {
  const ordered = barOrder(lenses)
  // The lens the lens bar is reached by with Tab while no lens is in focus, as with every tab closed.
  const first = ordered[0]?.id

  const button = (lens: LensView<Id>) => (
    <LensButton key={lens.id} lens={lens} actions={actions} reached={lens.id === first} />
  )

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      return
    }

    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-lens]")]
    const at = buttons.findIndex((each) => each === document.activeElement)

    const to = {
      ArrowDown: Math.min(buttons.length - 1, at + 1),
      ArrowUp: Math.max(0, at - 1),
      Home: 0,
      End: buttons.length - 1
    }[event.key]

    buttons[to]?.focus()
    event.preventDefault()
  }

  return (
    <div
      role="toolbar"
      aria-label="Lenses"
      aria-orientation="vertical"
      tabIndex={-1}
      className={`flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2 ${chromeSurface}`}
      onKeyDown={onKeyDown}
    >
      {ordered.filter((lens) => !lens.unavailable).map(button)}
      <div className="mt-auto" />
      {ordered.filter((lens) => lens.unavailable).map(button)}
    </div>
  )
}

function LensButton<Id extends string>({
  lens,
  actions,
  reached
}: {
  lens: LensView<Id>
  actions: LensActions<Id>
  /** It's the one Tab reaches while no lens is in focus. */
  reached: boolean
}) {
  const { id, name: label, Icon, shortcut: keys, unavailable: missing } = lens
  const { focus: current, elsewhere } = actions.mark(id)
  const where = elsewhere && placeWords[elsewhere]
  const said = missing?.title ?? where

  let look =
    "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground dark:hover:bg-input/20"

  if (current) {
    look = "border-border bg-background text-foreground shadow-sm dark:border-white/10 dark:bg-white/10"
  } else if (elsewhere) {
    look = "border-transparent text-foreground hover:bg-background/70 dark:hover:bg-input/20"
  } else if (missing) {
    look =
      "border-transparent text-muted-foreground/60 hover:bg-background/70 hover:text-muted-foreground dark:hover:bg-input/20"
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Hint
            label={
              <span className="flex items-center gap-1.5">
                {label} {keys && <Kbd>{keys}</Kbd>}
              </span>
            }
            detail={said}
            side="right"
          >
            <button
              type="button"
              data-lens={id}
              aria-label={said ? `${label}, ${said.toLowerCase()}` : label}
              aria-pressed={current}
              tabIndex={(actions.current ? current : reached) ? 0 : -1}
              onClick={(event) => (event.ctrlKey || event.metaKey ? actions.openTab(id) : actions.show(id))}
              onAuxClick={(event) => event.button === 1 && actions.openTab(id)}
              draggable={!missing}
              onDragStart={(event) => {
                event.dataTransfer.setData(lensDragType, id)
                event.dataTransfer.effectAllowed = "move"
              }}
              className={`relative grid size-9 place-items-center rounded-lg border outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 ${look}`}
            >
              <Icon className="size-[18px]" strokeWidth={current ? 2 : 1.75} />
              {/* The bar at the window's edge, as Layers marks its selected row and VS Code its open view. */}
              {current && (
                <span aria-hidden className="absolute inset-y-1 -left-[7px] w-0.5 rounded-r-full bg-(--canvas-layer)" />
              )}
              {elsewhere && (
                <span aria-hidden className="absolute right-1 bottom-1 size-1.5 rounded-full bg-foreground/60" />
              )}
            </button>
          </Hint>
        }
      />
      <ContextMenuContent className="w-auto min-w-52">
        <ContextMenuItem onClick={() => actions.show(id)}>
          <Icon /> Show {label}
          {keys && <ContextMenuShortcut>{keys}</ContextMenuShortcut>}
        </ContextMenuItem>
        <ContextMenuItem disabled={!actions.canOpenTab(id)} onClick={() => actions.openTab(id)}>
          <SquarePlus /> Open in new tab
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!actions.canSplit(id)} onClick={() => actions.splitRight(id)}>
          <Columns2 /> Split right
        </ContextMenuItem>
        {actions.canMoveToMain(id) ? (
          <ContextMenuItem onClick={() => actions.toMain(id)}>
            <SquareArrowOutDownLeft /> Move to main window
          </ContextMenuItem>
        ) : (
          actions.windows && (
            <ContextMenuItem disabled={!actions.canMoveToWindow(id)} onClick={() => actions.toWindow(id)}>
              <SquareArrowOutUpRight /> Move to new window
            </ContextMenuItem>
          )
        )}
        {actions.canClose(id) && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => actions.close(id)}>
              <X /> Close
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
