import { componentUses } from "@parity-app/editor"
import { Component } from "lucide-react"
import { boardKeyOf } from "../canvas/component-boards.ts"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import type { ContainerEntry } from "../project-doc.ts"
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
