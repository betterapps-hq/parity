import { Button } from "@buildkitgg/shadcn"
import { Maximize, Minus, Plus } from "lucide-react"
import type { ReactNode } from "react"
import { useValue } from "tldraw"
import { useProject } from "../canvas/context.ts"
import { useContainerEntries, useNotes } from "../project-doc.ts"
import { actions, commandsFor } from "./actions.ts"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { CommandTip, floatingBar, pressableWide, pressMotion } from "./toolbar-parts.tsx"

/**
 * Zoom, floating at the top right of the canvas (PAR-780, PAR-795), last in the row `CanvasTopRight` lays out: zoom
 * out, the level, which goes to 100%, zoom in and zoom to fit. Each runs on this tab's canvas rather than whichever tab
 * is active, when the command can there: zoom to fit needs something on the canvas. Undo and Redo left it for the Edit
 * menu and their keys.
 */
export function ZoomControls() {
  const session = useProject()
  const { editor } = session
  const zoom = Math.round(useValue("zoom", () => editor?.getZoomLevel() ?? 1, [editor]) * 100)

  // Zoom to fit has nothing to fit until the canvas holds a design or a note.
  useContainerEntries(session)
  useNotes(session)
  const states = commandsFor(session)

  return (
    <ZoomBar
      zoom={zoom}
      enabled={(command) => states[command].enabled}
      onRun={(command) => void actions[command].run("toolbar", { session })}
    />
  )
}

type ZoomCommand = "zoomIn" | "zoomOut" | "zoomTo100" | "zoomToFit"

interface ZoomBarProps {
  /** The zoom level, in percent. */
  zoom: number
  enabled: (command: ZoomCommand) => boolean
  onRun: (command: ZoomCommand) => void
}

/** Zoom's bar as it's drawn, given the level and which commands can run: what `ZoomControls` and stories show. */
export function ZoomBar({ zoom, enabled, onRun }: ZoomBarProps) {
  return (
    <div className={`pointer-events-auto flex items-center gap-0.5 ${floatingBar}`}>
      <ZoomButton command="zoomOut" disabled={!enabled("zoomOut")} onClick={() => onRun("zoomOut")}>
        <Minus />
      </ZoomButton>
      <CommandTip command="zoomTo100">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${keymap.zoomTo100.label}, now ${zoom}%`}
          className={`min-w-14 tabular-nums ${pressableWide}`}
          style={pressMotion}
          disabled={!enabled("zoomTo100")}
          onClick={() => onRun("zoomTo100")}
        >
          {zoom}%
        </Button>
      </CommandTip>
      <ZoomButton command="zoomIn" disabled={!enabled("zoomIn")} onClick={() => onRun("zoomIn")}>
        <Plus />
      </ZoomButton>
      <ZoomButton command="zoomToFit" disabled={!enabled("zoomToFit")} onClick={() => onRun("zoomToFit")}>
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

/**
 * The canvas's top-right row: what extensions draw there, such as the live room's avatar stack, then zoom, at the same
 * height (PAR-1293). On a canvas narrower than 676px, zoom stays in the corner and the rest moves to a row below it,
 * where a banner at the top centre (presence-ui's `CanvasBanner`) knows to keep clear of it.
 */
export function CanvasTopRight({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-[400] flex items-center justify-end gap-2 @max-[676px]:flex-col-reverse @max-[676px]:items-end">
      {children}
    </div>
  )
}
