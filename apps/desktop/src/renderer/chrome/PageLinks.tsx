import { componentUses } from "@parity-app/editor"
import { AppWindow, Bookmark, Component, Route } from "lucide-react"
import { useMemo } from "react"
import { boardKeyOf, isComponentBoard } from "../canvas/component-boards.ts"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import { isRoutePage } from "../canvas/route-pages.ts"
import { isStoryScreen } from "../canvas/story-screens.ts"
import { type ContainerEntry, useContainerEntries } from "../project-doc.ts"
import { type DesignLink, DesignLinks } from "./DesignLinks.tsx"

/**
 * A page's links to the other lenses: the components it places, each on its board in Components, its route's own first.
 */
export function PageLinks({ entry, route: id }: { entry: ContainerEntry; route: string }) {
  const session = useProject()
  const own = session.info.routes.find((each) => each.id === id)?.component
  const placed = [...componentUses([entry.container.root]).keys()]

  const links = [...new Set(own === undefined ? placed : [own, ...placed])].flatMap((component): DesignLink[] => {
    const board = boardKeyOf(session.id, component)

    return board ? [{ key: board, name: component, Icon: Component, color: kindColors.component }] : []
  })

  return <DesignLinks title="Components" links={links} />
}

/**
 * Where one of the project's components is used: each page, screen, story and component designed that places it, as
 * links to their lenses.
 */
export function ComponentUses({ component }: { component: string }) {
  const session = useProject()
  const entries = useContainerEntries(session)

  const links = useMemo(
    () =>
      entries.flatMap((entry): DesignLink[] =>
        !isComponentBoard(entry.key) && componentUses([entry.container.root]).has(component)
          ? [{ key: entry.key, name: entry.container.name, ...kindLook(entry) }]
          : []
      ),
    [entries, component]
  )

  return <DesignLinks title="Used in" links={links} />
}

/** How a link draws a design: a page with the route icon, a story with the story's, a component with the component's. */
function kindLook(entry: ContainerEntry): Pick<DesignLink, "Icon" | "color"> {
  if (isRoutePage(entry.key)) {
    return { Icon: Route, color: kindColors.screen }
  }

  if (isStoryScreen(entry.key)) {
    return { Icon: Bookmark, color: "var(--canvas-story)" }
  }

  return entry.container.kind === "component"
    ? { Icon: Component, color: kindColors.component }
    : { Icon: AppWindow, color: kindColors.screen }
}
