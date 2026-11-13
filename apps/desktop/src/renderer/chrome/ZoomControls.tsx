import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Maximize, Minus, Plus } from "lucide-react"
import type { ReactNode } from "react"
import { useValue } from "tldraw"
import { useProject } from "../canvas/context.ts"
import { useContainerEntries, useNotes } from "../design-store.ts"
import { actions, commandsFor } from "./actions.ts"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { CommandTip, floatingBar, pressableWide, pressMotion } from "./toolbar-parts.tsx"

/**
 * Zoom, floating at the top right of the canvas (PAR-780, PAR-795): zoom out, the level, which goes to 100%, zoom in and
 * zoom to fit. Each runs on this tab's canvas rather than whichever tab is active, when the command can there: zoom to
 * fit needs something on the canvas. Undo and Redo left it for the Edit menu and their keys.
 */
export function ZoomControls() {
  const session = useProject()
  const { editor } = session
  const zoom = Math.round(useValue("zoom", () => editor?.getZoomLevel() ?? 1, [editor]) * 100)

  // Zoom to fit has nothing to fit until the canvas holds a design or a note.
  useContainerEntries(session.store)
  useNotes(session.store)
  const states = commandsFor(session)

  const run = (command: "zoomIn" | "zoomOut" | "zoomTo100" | "zoomToFit") =>
    void actions[command].run("toolbar", { session })

  return (
    <div className={`absolute top-3 right-3 z-[400] flex items-center gap-0.5 ${floatingBar}`}>
      <ZoomButton command="zoomOut" disabled={!states.zoomOut.enabled} onClick={() => run("zoomOut")}>
        <Minus />
      </ZoomButton>
      <CommandTip command="zoomTo100">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${keymap.zoomTo100.label}, now ${zoom}%`}
          className={`min-w-14 tabular-nums ${pressableWide}`}
          style={pressMotion}
          disabled={!states.zoomTo100.enabled}
          onClick={() => run("zoomTo100")}
        >
          {zoom}%
        </Button>
      </CommandTip>
      <ZoomButton command="zoomIn" disabled={!states.zoomIn.enabled} onClick={() => run("zoomIn")}>
        <Plus />
      </ZoomButton>
      <ZoomButton command="zoomToFit" disabled={!states.zoomToFit.enabled} onClick={() => run("zoomToFit")}>
        <Maximize />
      </ZoomButton>
    </div>
  )
}

interface ZoomButtonProps {
  command: "zoomOut" | "zoomIn" | "zoomToFit"
  disabled: boolean
  onClick: () => void
  children: ReactNode
}

function ZoomButton({ command, disabled, onClick, children }: ZoomButtonProps) {
  return (
    <IconButton label={keymap[command].label} shortcut={command} disabled={disabled} pressable onClick={onClick}>
      {children}
    </IconButton>
  )
}
