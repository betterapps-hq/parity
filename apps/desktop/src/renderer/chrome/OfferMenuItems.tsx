import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@buildkitgg/shadcn-baseui-kit"
import { ExternalLink } from "lucide-react"
import { AdapterLogo } from "./AdapterLogo.tsx"
import type { Offer } from "./command-offers.ts"

/**
 * What the project's extensions offer for a component, a page or a layer, ending a right-click menu after a separator:
 * each with its extension's logo (a page's, as Open in browser, with an external link), and one that can't act greyed
 * with why, as No story found. Nothing when there are none.
 */
export function OfferMenuItems({
  offers,
  page
}: {
  offers: readonly Offer[]
  /** Whether they're for one of the app's pages, as a router's Open in browser is. */
  page?: boolean
}) {
  if (offers.length === 0) {
    return null
  }

  return (
    <>
      <ContextMenuSeparator />
      {offers.map(({ command, unavailable }) => (
        <ContextMenuItem
          key={`${command.extension}:${command.id}`}
          disabled={unavailable !== undefined}
          onClick={() => void command.run()}
        >
          {page ? <ExternalLink /> : <AdapterLogo logo={command.icon} />}
          {command.name}
          {unavailable !== undefined && (
            <ContextMenuShortcut data-words className="pl-4 whitespace-nowrap">
              {unavailable}
            </ContextMenuShortcut>
          )}
        </ContextMenuItem>
      ))}
    </>
  )
}
