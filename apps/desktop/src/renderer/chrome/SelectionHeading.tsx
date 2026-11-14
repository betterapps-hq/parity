import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { ArrowUpRight, Code, ExternalLink } from "lucide-react"
import type { ReactNode } from "react"
import { textFor } from "../canvas/kinds.tsx"
import type { ComponentOffer } from "./adapter-actions.ts"
import { AdapterLogo } from "./AdapterLogo.tsx"
import { Hint } from "./Hint.tsx"
import type { HeaderAction } from "./layer-kind.ts"

/** The classes a heading's icon takes, in its tile. */
export const headingIcon = "size-5 shrink-0"

/**
 * The classes a heading's name takes, as a field or as text: the selection's title, at 15px semibold on every tab.
 * md:text-base replaces the kit field's md:text-sm.
 */
export const headingName = "min-w-0 flex-1 text-base font-semibold md:text-base"

/**
 * The head of the inspector's Design tab for a selected design or layer: its kind's icon on a tile in the kind's tint,
 * its name, and under the name what it is, in the kind's color. `detail` says more about what it is, such as which
 * component it's an instance of: on hover, and to screen readers along with the kind. What it does sits at the end of
 * the row, as `HeaderActions` and a layer's eye. `icon` takes `headingIcon`'s classes and the kind's color from the
 * heading, and `name` takes `headingName`'s classes.
 */
export function SelectionHeading({
  icon,
  color,
  kind,
  detail,
  name,
  action
}: {
  icon: ReactNode
  /** Its kind's selection color, from `kindColors`; the icon and kind take its text step (`textFor`). */
  color: string
  /** A word or two, as "Screen", "Text" or "Component instance". */
  kind: string
  detail?: string
  /** Its name, as a field to rename it or as text. */
  name: ReactNode
  /** What sits at the end of the row, as a layer's actions and eye. */
  action?: ReactNode
}) {
  const more = detail && detail !== kind ? detail : undefined

  return (
    <div className="flex items-center gap-1">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-lg"
        style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color: textFor(color) }}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-7 min-w-0 items-center">{name}</div>
        <Hint label={more} wait>
          <p className="w-fit max-w-full truncate pl-1.5 text-xs font-medium" style={{ color: textFor(color) }}>
            <span aria-hidden={more ? true : undefined}>{kind}</span>
            {more && <span className="sr-only">{more}</span>}
          </p>
        </Hint>
      </div>
      {action && <div className="flex shrink-0 items-center gap-0.5">{action}</div>}
    </div>
  )
}

const actionLooks: Record<HeaderAction, { label: string; icon: ReactNode }> = {
  "open-in-editor": { label: "Open in editor", icon: <Code /> },
  "go-to-component": { label: "Go to component", icon: <ArrowUpRight /> }
}

/**
 * What a selection's header does, as icon buttons named by their hints, in the order given: the editor's own, then the
 * adapters' actions, each with its adapter's logo, or with an external link for a page's, which opens it outside
 * Parity, as Open in browser does. One that can't act on the selection stays, faded and focusable, its hint saying why,
 * as No story found.
 */
export function HeaderActions({
  actions = [],
  onAction,
  adapterOffers = [],
  page = false,
  onAdapterAction
}: {
  actions?: readonly HeaderAction[]
  onAction?: (action: HeaderAction) => void
  adapterOffers?: readonly ComponentOffer[]
  /** The offers are for a page of the app. */
  page?: boolean
  onAdapterAction?: (offer: ComponentOffer) => void
}) {
  return [
    ...actions.map((action) => (
      <HeaderButton key={action} label={actionLooks[action].label} onClick={() => onAction?.(action)}>
        {actionLooks[action].icon}
      </HeaderButton>
    )),
    ...adapterOffers.map((offer) => (
      <HeaderButton
        key={`${offer.action.adapter}:${offer.action.id}`}
        label={offer.action.name}
        unavailable={offer.unavailable}
        onClick={() => onAdapterAction?.(offer)}
      >
        {page ? <ExternalLink /> : <AdapterLogo logo={offer.action.icon} />}
      </HeaderButton>
    ))
  ]
}

function HeaderButton({
  label,
  unavailable,
  onClick,
  children
}: {
  label: string
  /** Why it can't act, as its hint; it stays focusable rather than going quietly grey. */
  unavailable?: string | undefined
  onClick: () => void
  children: ReactNode
}) {
  if (unavailable !== undefined) {
    return (
      <Hint label={unavailable}>
        <Button
          size="icon"
          variant="ghost"
          className="size-6 shrink-0 text-muted-foreground opacity-50"
          aria-disabled
          aria-label={`${label}, unavailable: ${unavailable}`}
        >
          {children}
        </Button>
      </Hint>
    )
  }

  return (
    <Hint label={label}>
      <Button
        size="icon"
        variant="ghost"
        className="size-6 shrink-0 text-muted-foreground"
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </Button>
    </Hint>
  )
}
