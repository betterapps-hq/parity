import type { EntitiesAdapter, PackageManifest } from "@parity-app/core"
import { exportStoryScreen, importStoryScreens, storybookId } from "./screens.ts"

export { type ArgValue, readStoryFile, type Story, type StoryArgs, type StoryFile, storyName } from "./csf.ts"

export { exportStoryScreen, importStoryScreens, storyFilePattern, storyScreen } from "./screens.ts"

export { writeStoryArgs } from "./write.ts"

/** Whether a project depends on Storybook. */
function detect(pkg: PackageManifest): boolean {
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some(
    (name) => name === "storybook" || name.startsWith("@storybook/")
  )
}

/** Storybook: its stories, read from their CSF files as screens, and their args written back. */
export const storybookAdapter: EntitiesAdapter = {
  id: storybookId,
  name: "Storybook",
  detect,
  import: importStoryScreens,
  export: exportStoryScreen
}
