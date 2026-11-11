import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Maximize, Minus, Plus } from "lucide-react"
import type { ReactNode } from "react"
import { useValue } from "tldraw"
import { useProject } from "../canvas/context.ts"
import { actions } from "./actions.ts"
import { zoomIn, zoomOut, zoomTo100, zoomToFit } from "./commands.ts"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { CommandTip, floatingBar, pressableWide, pressMotion } from "./toolbar-parts.tsx"

/**
 * Zoom, floating at the top right of the canvas (PAR-780, PAR-795): zoom out, the level, which goes to 100%, zoom in and
 * zoom to fit. Each runs on this tab's canvas rather than whichever tab is active. Undo and Redo left it for the Edit
 * menu and their keys.
 */
export function ZoomControls() {
  const session = useProject()
  const { editor } = session
  const zoom = Math.round(useValue("zoom", () => editor?.getZoomLevel() ?? 1, [editor]) * 100)

  return (
    <div className={`absolute top-3 right-3 z-[400] flex items-center gap-0.5 ${floatingBar}`}>
      <ZoomButton
        command="zoomOut"
        disabled={!editor}
        onClick={() => void actions.zoomOut.run("toolbar", { instead: () => zoomOut(session) })}
      >
        <Minus />
      </ZoomButton>
      <CommandTip command="zoomTo100">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${keymap.zoomTo100.label}, now ${zoom}%`}
          className={`min-w-14 tabular-nums ${pressableWide}`}
          style={pressMotion}
          disabled={!editor}
          onClick={() => void actions.zoomTo100.run("toolbar", { instead: () => zoomTo100(session) })}
        >
          {zoom}%
        </Button>
      </CommandTip>
      <ZoomButton
        command="zoomIn"
        disabled={!editor}
        onClick={() => void actions.zoomIn.run("toolbar", { instead: () => zoomIn(session) })}
      >
        <Plus />
      </ZoomButton>
      <ZoomButton
        command="zoomToFit"
        disabled={!editor}
        onClick={() => void actions.zoomToFit.run("toolbar", { instead: () => zoomToFit(session) })}
      >
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
    <IconButton
      label={keymap[command].label}
      shortcut={keymap[command].keys[0]}
      disabled={disabled}
      pressable
      onClick={onClick}
    >
      {children}
    </IconButton>
  )
}
