import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from "@buildkitgg/shadcn-baseui-kit"
import { framePresets } from "@parity-app/editor"
import { AppWindow, Component } from "lucide-react"
import { useProject } from "../../canvas/context.ts"
import { placeFrame } from "../../canvas/frame-tool.ts"
import { kindColors, textFor } from "../../canvas/kinds.tsx"
import { useContainerEntry, useModeSettings } from "../../design-store.ts"
import { useSelection } from "../../selection.ts"
import { actions } from "../actions.ts"
import { keymap, shortcutOf } from "../keymap.ts"
import { MenuArrow } from "../toolbar-parts.tsx"
import { ModeViewportIcon } from "../viewports.tsx"

/**
 * The arrow beside the frame tool, and its menu: a size for each viewport the modes use, then New screen and New
 * component, so every kind starts from the same place. A size resizes the selected frame, or adds a frame at that size
 * in the middle of the view. New screen and New component wear their kinds' colors.
 */
export function FrameMenu() {
  const session = useProject()
  const settings = useModeSettings(session.store)
  const selected = useSelection(session.selection)
  const entry = useContainerEntry(session.store, selected.design)
  const frame = entry?.container.kind === "frame" && !selected.node ? entry : undefined

  return (
    <DropdownMenu modal={false}>
      <MenuArrow label="Frame sizes, New screen and New component" />
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{frame ? "Resize the frame to" : "Frame sizes from your modes"}</DropdownMenuLabel>
          {framePresets(settings).map((preset) => (
            <DropdownMenuItem
              key={`${preset.name} ${preset.width}`}
              className="items-start"
              onClick={() => placeFrame(session, preset, frame?.key)}
            >
              <ModeViewportIcon of={preset.mode} className="mt-0.5 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{preset.name}</span>
                <span className="truncate text-xs text-muted-foreground">{preset.modes.join(", ")}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {preset.width} × {preset.height}
              </span>
            </DropdownMenuItem>
          ))}
          <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">Or drag on the canvas for any size.</p>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void actions.newScreen.run("toolbar")}>
          <AppWindow style={{ color: textFor(kindColors.screen) }} />
          {keymap.newScreen.label}
          <DropdownMenuShortcut>{shortcutOf("newScreen")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void actions.newComponent.run("toolbar")}>
          <Component style={{ color: textFor(kindColors.component) }} />
          {keymap.newComponent.label}
          <DropdownMenuShortcut>{shortcutOf("newComponent")}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
