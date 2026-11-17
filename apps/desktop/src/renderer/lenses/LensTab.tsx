import type { IDockviewPanelHeaderProps } from "dockview-react"
import { X } from "lucide-react"
import { useShell } from "./shell.ts"

/** A lens's tab: its icon and name, the handle that drags it, and a close button. */
export function LensTab({ params }: IDockviewPanelHeaderProps<{ lens: string }>) {
  const { lenses, actions } = useShell()
  const lens = lenses.get(params.lens)

  if (!lens) {
    return null
  }

  const { id, name, Icon } = lens

  return (
    // A middle click closes the tab, as it does a browser's.
    <div
      className="group/tab flex h-full min-w-0 items-center gap-2 pr-1.5 pl-3"
      onAuxClick={(event) => event.button === 1 && actions.close(id)}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <button
        type="button"
        aria-label={`Close ${name}`}
        className="grid size-5 shrink-0 place-items-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-accent focus-visible:opacity-100 [.dv-active-tab_&]:opacity-100"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          actions.close(id)
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
