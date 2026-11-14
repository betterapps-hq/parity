import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@buildkitgg/shadcn-baseui-kit"
import type { AdapterIcon } from "@parity-app/core"
import { FileCode } from "lucide-react"
import type { ReactNode } from "react"
import { AdapterLogo } from "./AdapterLogo.tsx"

/** One of the project's adapters' actions, as a component's menu offers it. */
export interface MenuOffer {
  /** Its adapter and id, to tell it from the rest. */
  id: string
  name: string
  logo?: AdapterIcon
  /** Why it can't act on this component, as `No story found`; it's greyed with this. */
  unavailable?: string
  /** What it does first, as `Starts Storybook` while Storybook isn't running. */
  starts?: string
  run: () => void
}

export interface ComponentMenuProps {
  /** What the project's adapters offer for components, as Open in Storybook, each greyed with why where it can't act. */
  offers?: readonly MenuOffer[]
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
 * The items of a component's right-click menu in the Components panel (PAR-527): what the project's adapters offer, as
 * Open in Storybook, and View code, then what else the row offers. An item that can't act is greyed with why, rather
 * than left out, so the menu is the same for every component. Nothing when none applies, so the row has no menu.
 */
export function ComponentMenu({ offers = [], code, children }: ComponentMenuProps) {
  const opens = offers.length > 0 || code

  if (!opens && !children) {
    return null
  }

  return (
    <>
      {offers.map((offer) => (
        <ContextMenuItem key={offer.id} disabled={offer.unavailable !== undefined} onClick={offer.run}>
          <AdapterLogo logo={offer.logo} /> {offer.name}
          {offer.unavailable !== undefined && <Aside>{offer.unavailable}</Aside>}
          {offer.unavailable === undefined && offer.starts && <Aside>{offer.starts}</Aside>}
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
