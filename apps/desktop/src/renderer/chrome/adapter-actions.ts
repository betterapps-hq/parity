import { type ActionPage, isInnerPath, locateInner, locateNode, type ProjectAction } from "@parity-app/core"
import type { MenuPlacement } from "@parity-app/extension-api"
import type { ExtensionStatus, ProjectInfo } from "../../shared/protocol.ts"
import { boardComponent } from "../canvas/component-boards.ts"
import { projectLibrary } from "../canvas/layers.ts"
import { routePageTarget } from "../canvas/route-pages.ts"
import { commandsAt, type PlacedCommand, runCommand } from "../extensions.ts"
import { serviceCall } from "../service-call.ts"
import { request } from "../service.ts"
import type { ProjectSession } from "../workspace.ts"
import { layerComponent } from "./layer-kind.ts"

/** One of the project's adapters' actions, by its adapter and id. */
export function projectAction(info: ProjectInfo, adapter: string, id: string): ProjectAction | undefined {
  return info.actions.find((action) => action.adapter === adapter && action.id === id)
}

/** One of the project's adapters' actions as a component offers it: to run, or greyed with why it can't. */
export interface ComponentOffer {
  action: ProjectAction
  /** Why it can't act on this component, as `No story found`; none when it can. */
  unavailable?: string
}

/** An extension's command, offered as an adapter's action is, with what running it needs (PAR-1089). */
interface ExtensionAction extends ProjectAction {
  extension: { session: ProjectSession; placed: PlacedCommand }
}

/** Whether an offered action is an extension's command. */
function isExtensionAction(action: ProjectAction): action is ExtensionAction {
  return "extension" in action
}

/** The project's extensions, and where an offer shows, for the commands their manifests place there. */
export interface PlacedExtensions {
  session: ProjectSession
  extensions: readonly ExtensionStatus[]
  placement: MenuPlacement
}

/**
 * What the project's adapters and extensions offer for one of its components: every adapter action that's for
 * components, those it isn't for greyed with the action's reason rather than left out, and an action that gives no
 * reason left out where it isn't for the component; then the extensions' commands placed here, as Open in Storybook,
 * greyed with why where their `enablement` doesn't hold.
 */
export function componentOffers(
  info: ProjectInfo,
  component: string | undefined,
  placed?: PlacedExtensions
): ComponentOffer[] {
  if (!component) {
    return []
  }

  const adapters = info.actions.flatMap((action): ComponentOffer[] => {
    if (!action.components) {
      return []
    }

    if (action.components.includes(component)) {
      return [{ action }]
    }

    return action.unavailable ? [{ action, unavailable: action.unavailable }] : []
  })

  return placed ? [...adapters, ...extensionOffers(placed, component)] : adapters
}

/** The extensions' commands placed where an offer shows, for a component, as offers. */
function extensionOffers({ session, extensions, placement }: PlacedExtensions, component: string): ComponentOffer[] {
  return commandsAt(extensions, placement, { type: "component", key: component }).map((placed) => {
    const action: ExtensionAction = {
      adapter: placed.extension.id,
      id: placed.command.id,
      name: placed.command.title,
      icon: placed.extension.icon,
      progress: placed.command.starts ?? placed.command.title,
      failed: `${placed.command.title} didn't work`,
      extension: { session, placed }
    }

    return placed.enabled ? { action } : { action, unavailable: placed.disabledReason ?? "Unavailable" }
  })
}

/** What the project's adapters offer for one of the app's pages, by its route's id, as Open in browser. */
export function pageOffers(info: ProjectInfo, route: string | undefined): ComponentOffer[] {
  if (route === undefined) {
    return []
  }

  return info.actions.flatMap((action) => (action.routes?.includes(route) ? [{ action }] : []))
}

/**
 * The project's component the selection is of, whose adapters' actions it offers: one layer that draws a code
 * component, or a component's board on its own. Undefined for anything else, or for several things.
 */
export function selectionComponent(
  session: Pick<ProjectSession, "id" | "info" | "selection" | "store">
): string | undefined {
  const selected = session.selection.get()
  const entry = selected.design ? session.store.getEntry(selected.design) : undefined

  if (!entry || (selected.nodes && selected.nodes.length > 1) || (selected.designs && selected.designs.length > 1)) {
    return undefined
  }

  if (!selected.node) {
    return boardComponent(session.id, entry.container.id)
  }

  const node = isInnerPath(selected.node)
    ? locateInner(entry.container, selected.node, projectLibrary(session.store))?.node
    : locateNode(entry.container.root, selected.node)?.node

  return node && layerComponent(node, session.info.libraries)
}

/**
 * The app's page the selection is of, whose adapters' actions it offers, as Open in browser: one page, or a layer in it.
 * Undefined for anything else, or for several things.
 */
export function selectionPage(session: Pick<ProjectSession, "id" | "selection" | "store">): ActionPage | undefined {
  const selected = session.selection.get()
  const entry = selected.design ? session.store.getEntry(selected.design) : undefined

  if (!entry || (selected.nodes && selected.nodes.length > 1) || (selected.designs && selected.designs.length > 1)) {
    return undefined
  }

  return routePageTarget(session.id, entry.container)
}

/**
 * Does an adapter's action for the project, or for one of its components, saying so while it runs, and opens in the
 * browser the address it gives.
 */
export async function runAction(
  projectId: string,
  action: ProjectAction,
  component?: string,
  page?: ActionPage
): Promise<void> {
  // An extension's command runs in its host, which shows its own progress and failure.
  if (isExtensionAction(action)) {
    const { session, placed } = action.extension

    return runCommand(session, placed, component === undefined ? undefined : { type: "component", key: component })
  }

  await serviceCall({
    progress: action.progress,
    shown: { description: action.note },
    run: () => request("adapter.run", { projectId, adapter: action.adapter, action: action.id, component, page }),
    done({ open }) {
      if (!open) {
        return "dismiss"
      }

      window.open(open, "_blank")

      return { success: "Opened in your browser", description: open, duration: 3000 }
    },
    failed: {
      operation: "adapter.run",
      title: action.failed,
      description: (error) => (error instanceof Error ? error.message : String(error)).slice(0, 600)
    }
  })
}
