import type { EntitiesAdapter, PackageManifest } from "@parity-app/core"
import { storybookLogo } from "./logo.ts"
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
  icon: storybookLogo,
  detect,
  import: importStoryScreens,
  export: exportStoryScreen,
  status: ({ version, entities }) => {
    const stories = entities?.screens?.length ?? 0

    return [
      {
        value: stories.toLocaleString(),
        words: stories === 1 ? " story" : " stories",
        hint: version ? `Storybook ${version}` : "Storybook",
        detail: "Click to open it",
        opens: { tool: "storybook" }
      }
    ]
  }
}
