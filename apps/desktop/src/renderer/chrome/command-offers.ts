import { isInnerPath, locateInner, locateNode, type NodeRef } from "@parity-app/core"
import type { CommandTarget, LayerTarget, MenuPlacement } from "@parity-app/extension-api"
import { containerEntry } from "@parity-app/multiplayer"
import type { ExtensionStatus } from "../../shared/protocol.ts"
import { boardComponent } from "../canvas/component-boards.ts"
import { projectLibrary } from "../canvas/layers.ts"
import { type PageTarget, routePageTarget, routeRef } from "../canvas/route-pages.ts"
import { commandsAt, runCommand, whenFactsOf } from "../extensions.ts"
import type { DocSession } from "../project-doc.ts"
import type { ProjectSession } from "../workspace.ts"
import { layerComponent } from "./layer-kind.ts"

/** An extension's command as a menu offers it (PAR-1089). */
export interface OfferedCommand {
  /** Its extension's id. */
  extension: string
  id: string
  name: string
  /** Its extension's logo. */
  icon?: ExtensionStatus["icon"]
  /** Runs it in its extension's host, which shows its own progress and failure. */
  run(): Promise<void>
}

/** An extension's command as a component, page or layer offers it: to run, or greyed with why it can't. */
export interface Offer {
  command: OfferedCommand
  /** Why it can't act here, as `No story found`; none when it can. */
  unavailable?: string
}

/** The project's extensions, and where an offer shows, for the commands their manifests place there. */
export interface PlacedExtensions {
  session: ProjectSession
  extensions: readonly ExtensionStatus[]
  placement: MenuPlacement
}

/**
 * What the project's extensions offer for one of its components: the commands their manifests place here, as Open in
 * Storybook, greyed with why where their `enablement` doesn't hold.
 */
export function componentOffers(component: string | undefined, placed: PlacedExtensions): Offer[] {
  return component === undefined ? [] : extensionOffers(placed, { type: "component", key: component })
}

/** What the project's extensions offer for a layer that isn't a component's, as a command that renames it (PAR-1093). */
export function layerOffers(placed: PlacedExtensions, target: LayerTarget): Offer[] {
  return extensionOffers(placed, target)
}

/** The extensions' commands placed where an offer shows, for what it's shown for, as offers. */
function extensionOffers({ session, extensions, placement }: PlacedExtensions, target: CommandTarget): Offer[] {
  // What a `when` reads of a component: its node, owned by the renderer that draws it; of a page, its route's.
  const node = targetNode(session, target)

  return commandsAt(extensions, placement, target, whenFactsOf(session, node)).map((placed) => {
    const command: OfferedCommand = {
      extension: placed.extension.id,
      id: placed.command.id,
      name: placed.command.title,
      icon: placed.extension.icon,
      run: () => runCommand(session, placed, target)
    }

    return placed.enabled ? { command } : { command, unavailable: placed.disabledReason ?? "Unavailable" }
  })
}

/** What a `when` reads of a command's target: a component's node, a page's route, or nothing for a layer. */
function targetNode(session: ProjectSession, target: CommandTarget): NodeRef | undefined {
  if (target.type === "component") {
    return { owner: session.info.renderer.id, type: "component", key: target.key }
  }

  return target.type === "route" ? routeRef(session.info, target.key) : undefined
}

/** What the project's extensions offer for one of the app's pages, by its route's id, as the router's Open in browser. */
export function pageOffers(route: string | undefined, placed: PlacedExtensions): Offer[] {
  return route === undefined ? [] : extensionOffers(placed, { type: "route", key: route })
}

/**
 * The project's component the selection is of, whose extensions' commands it offers: one layer that draws a code
 * component, or a component's board on its own. Undefined for anything else, or for several things.
 */
export function selectionComponent(
  session: DocSession & Pick<ProjectSession, "id" | "info" | "selection">
): string | undefined {
  const selected = session.selection.get()
  const entry = selected.design ? containerEntry(session.doc, selected.design) : undefined

  if (!entry || (selected.nodes && selected.nodes.length > 1) || (selected.designs && selected.designs.length > 1)) {
    return undefined
  }

  if (!selected.node) {
    return boardComponent(session.id, entry.container.id)
  }

  const node = isInnerPath(selected.node)
    ? locateInner(entry.container, selected.node, projectLibrary(session))?.node
    : locateNode(entry.container.root, selected.node)?.node

  return node && layerComponent(node, session.info.libraries)
}

/**
 * The app's page the selection is of, whose extensions' commands it offers, as Open in browser: one page, or a layer in it.
 * Undefined for anything else, or for several things.
 */
export function selectionPage(session: Pick<ProjectSession, "id" | "selection" | "doc">): PageTarget | undefined {
  const selected = session.selection.get()
  const entry = selected.design ? containerEntry(session.doc, selected.design) : undefined

  if (!entry || (selected.nodes && selected.nodes.length > 1) || (selected.designs && selected.designs.length > 1)) {
    return undefined
  }

  return routePageTarget(session.id, entry.container)
}
