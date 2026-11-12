import { toast } from "sonner"
import type { ProjectInfo } from "../../shared/protocol.ts"
import { reportError } from "../report-error.ts"
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
  const progress = toast.loading("Opening Storybook…", {
    description: "If it isn't running yet, it starts first; that can take a minute."
  })

  try {
    const { url } = await request("storybook.open", { projectId, component })
    window.open(url, "_blank")
    toast.success("Opened in your browser", { id: progress, description: url, duration: 3000 })
  } catch (error) {
    reportError(error, {
      operation: "storybook.open",
      title: "Couldn't open Storybook",
      id: progress,
      description: (error instanceof Error ? error.message : String(error)).slice(0, 600)
    })
  }
}
