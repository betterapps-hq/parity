import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { ArrowUpRight, Code } from "lucide-react"
import type { ReactNode } from "react"
import { textFor } from "../canvas/kinds.tsx"
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

/** What a selection's header does, as icon buttons named by their hints, in the order given. */
export function HeaderActions({
  actions,
  onAction
}: {
  actions: readonly HeaderAction[]
  onAction: (action: HeaderAction) => void
}) {
  return actions.map((action) => (
    <Hint key={action} label={actionLooks[action].label}>
      <Button
        size="icon"
        variant="ghost"
        className="size-6 shrink-0 text-muted-foreground"
        aria-label={actionLooks[action].label}
        onClick={() => onAction(action)}
      >
        {actionLooks[action].icon}
      </Button>
    </Hint>
  ))
}
