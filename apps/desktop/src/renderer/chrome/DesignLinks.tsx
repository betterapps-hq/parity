import { Columns2 } from "lucide-react"
import { type ComponentType, type CSSProperties, use } from "react"
import { useProject } from "../canvas/context.ts"
import { lensOf } from "../lenses/lens-requests.ts"
import { ShellContext } from "../lenses/shell.ts"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { Name } from "./Name.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { revealOnceShown } from "./reveal.ts"

/** A design another lens's canvas draws, as a link lists it: its key, its name, and its kind's icon and color. */
export interface DesignLink {
  key: string
  name: string
  Icon: ComponentType<{ className?: string; style?: CSSProperties }>
  color: string
}

/**
 * Links from the selection to designs on other lenses' canvases. A click shows a design's lens in this one's place with
 * it selected and in view, as a link does; Show beside splits that lens to the right. Outside the lens shell, there's
 * nowhere to show them, so nothing is listed.
 */
export function DesignLinks({ title, links }: { title: string; links: readonly DesignLink[] }) {
  const session = useProject()
  const shell = use(ShellContext)

  if (!shell || links.length === 0) {
    return null
  }

  const { actions, lenses } = shell

  const show = (key: string, beside: boolean) => {
    // Shown first, so the selection finds it there rather than following it to its lens in this one's place.
    actions.followLink(lensOf(key), beside)
    session.selection.set({ design: key })
    revealOnceShown(key)
  }

  return (
    <PanelSection title={title}>
      <ul className="-mx-1.5 flex flex-col">
        {links.map(({ key, name, Icon, color }) => (
          <li key={key} className="group/link flex h-8 items-center gap-0.5 rounded-md hover:bg-accent/50">
            <Hint label={`Show in ${lenses.get(lensOf(key))?.name ?? "its lens"}`} wait>
              <button
                type="button"
                onClick={() => show(key, false)}
                className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Icon className="size-3.5 shrink-0" style={{ color }} />
                <Name className="min-w-0">{name}</Name>
              </button>
            </Hint>
            <span className="opacity-0 group-focus-within/link:opacity-100 group-hover/link:opacity-100">
              <IconButton label="Show beside" onClick={() => show(key, true)}>
                <Columns2 />
              </IconButton>
            </span>
          </li>
        ))}
      </ul>
    </PanelSection>
  )
}
