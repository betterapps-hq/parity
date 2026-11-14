import type { ProjectAction } from "@parity-app/core"
import type { ProjectInfo } from "../../shared/protocol.ts"
import { serviceCall } from "../service-call.ts"
import { request } from "../service.ts"

/** One of the project's adapters' actions, by its adapter and id. */
export function projectAction(info: ProjectInfo, adapter: string, id: string): ProjectAction | undefined {
  return info.actions.find((action) => action.adapter === adapter && action.id === id)
}

/** The adapters' actions for one of the project's components, as its layers offer them. */
export function componentActions(info: ProjectInfo, component: string | undefined): ProjectAction[] {
  return component ? info.actions.filter((action) => action.components?.includes(component)) : []
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
