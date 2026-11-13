import type { ProjectInfo } from "../../shared/protocol.ts"
import { serviceCall } from "../service-call.ts"
import { request } from "../service.ts"

/** Whether a component has stories in the project's Storybook. */
export function hasStories(info: ProjectInfo, component: string): boolean {
  return (info.storybook?.stories[component]?.length ?? 0) > 0
}

/**
 * Opens a component's docs or first story in the browser, or Storybook's home without one. Storybook starts first if
 * it isn't running, which can take a minute the first time.
 */
export async function openInStorybook(projectId: string, component?: string): Promise<void> {
  await serviceCall({
    progress: "Opening Storybook…",
    shown: { description: "If it isn't running yet, it starts first; that can take a minute." },
    run: () => request("storybook.open", { projectId, component }),
    done({ url }) {
      window.open(url, "_blank")

      return { success: "Opened in your browser", description: url, duration: 3000 }
    },
    failed: {
      operation: "storybook.open",
      title: "Couldn't open Storybook",
      description: (error) => (error instanceof Error ? error.message : String(error)).slice(0, 600)
    }
  })
}
