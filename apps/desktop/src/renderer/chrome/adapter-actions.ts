import { type ActionPage, isInnerPath, locateInner, locateNode, type ProjectAction } from "@parity-app/core"
import type { ProjectInfo } from "../../shared/protocol.ts"
import { boardComponent } from "../canvas/component-boards.ts"
import { projectLibrary } from "../canvas/layers.ts"
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

/**
 * What the project's adapters offer for one of its components: every action that's for components, those it isn't for
 * greyed with the action's reason rather than left out, so a component with no story still shows Open in Storybook.
 * An action that gives no reason is left out where it isn't for the component.
 */
export function componentOffers(info: ProjectInfo, component: string | undefined): ComponentOffer[] {
  if (!component) {
    return []
  }

  return info.actions.flatMap((action): ComponentOffer[] => {
    if (!action.components) {
      return []
    }

    if (action.components.includes(component)) {
      return [{ action }]
    }

    return action.unavailable ? [{ action, unavailable: action.unavailable }] : []
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
 * Does an adapter's action for the project, or for one of its components, saying so while it runs, and opens in the
 * browser the address it gives.
 */
export async function runAction(
  projectId: string,
  action: ProjectAction,
  component?: string,
  page?: ActionPage
): Promise<void> {
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
