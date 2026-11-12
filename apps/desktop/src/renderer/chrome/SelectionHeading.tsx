import type { ReactNode } from "react"
import { textFor } from "../canvas/kinds.tsx"
import { Hint } from "./Hint.tsx"

/** The classes a heading's icon takes. */
export const headingIcon = "size-3.5 shrink-0"

/**
 * The classes a heading's name takes, as a field or as text: the selection's title, at 15px semibold on every tab.
 * md:text-base replaces the kit field's md:text-sm.
 */
export const headingName = "min-w-0 flex-1 text-base font-semibold md:text-base"

/**
 * The head of the inspector's Design tab for a selected design or layer: what it is, as its icon and kind together in
 * its kind's color, above its name, which has the line to itself. `detail` says more about what it is, such as which
 * component it's an instance of: on hover, and to screen readers along with the kind. `icon` takes `headingIcon`'s
 * classes and the kind's color from the heading, and `name` takes `headingName`'s classes.
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
  /** What sits at the end of the name's row, as a layer's eye. */
  action?: ReactNode
}) {
  const more = detail && detail !== kind ? detail : undefined

  return (
    <>
      <Hint label={more} wait>
        <p
          className="flex w-fit max-w-full items-center gap-1.5 pl-1.5 text-xs font-medium"
          style={{ color: textFor(color) }}
        >
          {icon}
          <span className="truncate" aria-hidden={more ? true : undefined}>
            {kind}
          </span>
          {more && <span className="sr-only">{more}</span>}
        </p>
      </Hint>
      <div className="mt-1 flex h-7 items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center">{name}</div>
        {action}
      </div>
    </>
  )
}
