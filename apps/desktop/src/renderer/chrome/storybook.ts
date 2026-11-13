import type { ProjectInfo } from "../../shared/protocol.ts"
import { projectAction, runAction } from "./adapter-actions.ts"

/** Whether a component has stories in the project's Storybook. */
export function hasStories(info: ProjectInfo, component: string): boolean {
  return (info.storybook?.stories[component]?.length ?? 0) > 0
}

/**
 * Opens a component's docs or first story in the browser, or Storybook's home without one, through the Storybook
 * adapter's Open in Storybook. Storybook starts first if it isn't running, which can take a minute the first time.
 */
export async function openInStorybook(info: ProjectInfo, component?: string): Promise<void> {
  const action = projectAction(info, "storybook", "open")

  if (action) {
    await runAction(info.id, action, component)
  }
}
