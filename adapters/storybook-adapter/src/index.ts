import type { EntitiesAdapter, PackageManifest } from "@parity-app/core"
import { importStoryScreens, storybookId } from "./screens.ts"

export { type ArgValue, readStoryFile, type Story, type StoryArgs, type StoryFile, storyName } from "./csf.ts"

export { importStoryScreens, storyFilePattern, storyScreen } from "./screens.ts"

/** Whether a project depends on Storybook. */
function detect(pkg: PackageManifest): boolean {
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some(
    (name) => name === "storybook" || name.startsWith("@storybook/")
  )
}

/** Storybook: its stories, read from their CSF files, as screens. */
export const storybookAdapter: EntitiesAdapter = {
  id: storybookId,
  name: "Storybook",
  detect,
  import: async (source) => ({ screens: await importStoryScreens(source) })
}
