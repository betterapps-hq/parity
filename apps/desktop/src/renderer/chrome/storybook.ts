import { toast } from "sonner"
import type { ProjectSession } from "../workspace.ts"

/** Whether a component has stories in the project's Storybook. */
export function hasStories(session: ProjectSession, component: string): boolean {
  return (session.info.storybook?.stories[component]?.length ?? 0) > 0
}

/**
 * Opens a component's docs or first story in the browser, or Storybook's home without one. Storybook starts first if
 * it isn't running, which can take a minute the first time.
 */
export async function openInStorybook(session: ProjectSession, component?: string): Promise<void> {
  const progress = toast.loading("Opening Storybook…", {
    description: "If it isn't running yet, it starts first; that can take a minute."
  })
  try {
    const { url } = await window.canvasHost.request("storybook.open", { projectId: session.id, component })
    window.open(url, "_blank")
    toast.success("Opened in your browser", { id: progress, description: url, duration: 3000 })
  } catch (error) {
    toast.error("Couldn't open Storybook", {
      id: progress,
      description: (error instanceof Error ? error.message : String(error)).slice(0, 600)
    })
  }
}
