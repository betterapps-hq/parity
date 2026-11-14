import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@buildkitgg/shadcn-baseui-kit"
import { FileCode } from "lucide-react"
import type { ReactNode } from "react"

/** An extension's command in a component's menu, as Open in Storybook, greyed with why when it can't run. */
export interface MenuCommand {
  id: string
  title: string
  icon: ReactNode
  /** Why it's greyed, when it can't run for this component. */
  disabledReason?: string
  run: () => void
}

export interface ComponentMenuProps {
  /** Extensions' commands for it, from their manifests. */
  commands?: readonly MenuCommand[]
  /** Its code, for a component: whether the project has a file of it, and opening that in the person's editor. */
  code?: { file: boolean; open: () => void }
  /** What else the row offers, as a library design's two ways to insert, after the rest. */
  children?: ReactNode
}

/** Why an item can't act, on the right of the item. */
function Aside({ children }: { children: string }) {
  return (
    <ContextMenuShortcut data-words className="pl-4 whitespace-nowrap">
      <span>{children}</span>
    </ContextMenuShortcut>
  )
}

/**
 * The items of a component's right-click menu in the Components panel (PAR-527): extensions' commands, such as Open in
 * Storybook, and View code, then what else the row offers. An item that can't act is greyed with why, rather than left
 * out, so the menu is the same for every component. Nothing when none applies, so the row has no menu.
 */
export function ComponentMenu({ commands = [], code, children }: ComponentMenuProps) {
  const opens = commands.length > 0 || code

  if (!opens && !children) {
    return null
  }

  return (
    <>
      {commands.map((command) => (
        <ContextMenuItem key={command.id} disabled={command.disabledReason !== undefined} onClick={command.run}>
          {command.icon} {command.title}
          {command.disabledReason !== undefined && <Aside>{command.disabledReason}</Aside>}
        </ContextMenuItem>
      ))}
      {code && (
        <ContextMenuItem disabled={!code.file} onClick={code.open}>
          <FileCode /> View code
          {!code.file && <Aside>Not in the project</Aside>}
        </ContextMenuItem>
      )}
      {opens && children && <ContextMenuSeparator />}
      {children}
    </>
  )
}
