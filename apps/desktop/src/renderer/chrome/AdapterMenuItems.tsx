import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@buildkitgg/shadcn-baseui-kit"
import { type ComponentOffer, runAction } from "./adapter-actions.ts"
import { AdapterLogo } from "./AdapterLogo.tsx"

/**
 * What the project's adapters offer for a component, ending a right-click menu after a separator: each with its
 * adapter's logo, and one that can't act greyed with why, as No story found. Nothing when there are none.
 */
export function AdapterMenuItems({
  offers,
  projectId,
  component
}: {
  offers: readonly ComponentOffer[]
  projectId: string
  component: string | undefined
}) {
  if (offers.length === 0) {
    return null
  }

  return (
    <>
      <ContextMenuSeparator />
      {offers.map(({ action, unavailable }) => (
        <ContextMenuItem
          key={`${action.adapter}:${action.id}`}
          disabled={unavailable !== undefined}
          onClick={() => void runAction(projectId, action, component)}
        >
          <AdapterLogo logo={action.icon} />
          {action.name}
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
