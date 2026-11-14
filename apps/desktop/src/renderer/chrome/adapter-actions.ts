import { isInnerPath, locateInner, locateNode, type ProjectAction } from "@parity-app/core"
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

/** The adapters' actions for one of the project's components, as its layers offer them. */
export function componentActions(info: ProjectInfo, component: string | undefined): ProjectAction[] {
  return component ? info.actions.filter((action) => action.components?.includes(component)) : []
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
export async function runAction(projectId: string, action: ProjectAction, component?: string): Promise<void> {
  await serviceCall({
    progress: action.progress,
    shown: { description: action.note },
    run: () => request("adapter.run", { projectId, adapter: action.adapter, action: action.id, component }),
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
