import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@buildkitgg/shadcn-baseui-kit"
import { BookOpen, FileCode } from "lucide-react"
import type { ReactNode } from "react"
export interface ComponentMenuProps {
  /** Its stories, when the project has a Storybook: whether it has any, whether Storybook is running, and opening them. */
  storybook?: { stories: boolean; running: boolean; open: () => void }
  /** Its code, for a component: whether the project has a file of it, and opening that in the person's editor. */
  code?: { file: boolean; open: () => void }
  /** What else the row offers, as a library design's two ways to insert, after the rest. */
  children?: ReactNode
}

/** Why an item can't act, or what it does first, on the right of the item. */
function Aside({ children }: { children: string }) {
  return (
    <ContextMenuShortcut data-words className="pl-4 whitespace-nowrap">
      <span>{children}</span>
    </ContextMenuShortcut>
  )
}

/**
 * The items of a component's right-click menu in the Components panel (PAR-527): View in Storybook and View code, then
 * what else the row offers. An item that can't act is greyed with why, rather than left out, so the menu is the same
 * for every component. Nothing when none applies, so the row has no menu.
 */
export function ComponentMenu({ storybook, code, children }: ComponentMenuProps) {
  const opens = storybook || code
  if (!opens && !children) return null
  return (
    <>
      {storybook && (
        <ContextMenuItem disabled={!storybook.stories} onClick={storybook.open}>
          <BookOpen /> View in Storybook
          {!storybook.stories && <Aside>No stories</Aside>}
          {storybook.stories && !storybook.running && <Aside>Starts Storybook</Aside>}
        </ContextMenuItem>
      )}
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
