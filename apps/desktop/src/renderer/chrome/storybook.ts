import { request } from "../service.ts"
import { notify } from "../toasts.tsx"
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
  const progress = notify.progress("Opening Storybook…", { description: "Starting it can take a minute." })
  try {
    const { url } = await request("storybook.open", { projectId: session.id, component })
    window.open(url, "_blank")
    // The browser coming forward says it opened.
    notify.close(progress)
  } catch (error) {
    notify.failed("Couldn't open Storybook", {
      id: progress,
      description: "It stopped while starting.",
      details: (error instanceof Error ? error.message : String(error)).slice(-2000)
    })
  }
}
