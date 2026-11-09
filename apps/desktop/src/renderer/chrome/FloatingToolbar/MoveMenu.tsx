import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from "@buildkitgg/shadcn-baseui-kit"
import { isTool } from "../../selection.ts"
import { actions } from "../actions.ts"
import { keymap } from "../keymap.ts"
import { formatKeys } from "../keys.ts"
import { MenuArrow } from "../toolbar-parts.tsx"
import { type PointerTool, pointerTools, toolIcons } from "./tools.ts"

interface MoveMenuProps {
  /** The pointer tool the button beside it shows. */
  current: PointerTool
}

/** The arrow beside Move and select, and its menu: Move and select, Hand, or Interact. */
export function MoveMenu({ current }: MoveMenuProps) {
  return (
    <DropdownMenu modal={false}>
      <MenuArrow label="Move and select, Hand or Interact" />
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-56">
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => {
            if (isTool(value)) {
              void actions[value].run("toolbar")
            }
          }}
        >
          {pointerTools.map((tool) => {
            const Icon = toolIcons[tool]

            return (
              <DropdownMenuRadioItem key={tool} value={tool}>
                <Icon />
                {keymap[tool].label}
                <DropdownMenuShortcut>{formatKeys(keymap[tool].keys[0])}</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">Or hold Space and drag to pan with any tool.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
