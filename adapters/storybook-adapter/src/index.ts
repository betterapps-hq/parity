import type { EntitiesAdapter } from "@parity-app/core"
import { detectStorybook, storybookConfigFiles } from "./detect.ts"
import { storybookLogo } from "./logo.ts"
import { exportStoryScreen, importStoryScreens, storybookId } from "./screens.ts"

export { type ArgValue, readStoryFile, type Story, type StoryArgs, type StoryFile, storyName } from "./csf.ts"

export { exportStoryScreen, importStoryScreens, storyFilePattern, storyScreen, titleFolders } from "./screens.ts"

export { writeStoryArgs } from "./write.ts"

/** Storybook: its stories, read from their CSF files as screens, and their args written back. */
export const storybookAdapter: EntitiesAdapter = {
  id: storybookId,
  name: "Storybook",
  icon: storybookLogo,
  detect: detectStorybook,
  watches: storybookConfigFiles,
  // Storybook 7 and later are versioned by `storybook`; before that, by its framework packages.
  versions: {
    packages: ["storybook", "@storybook/react", "@storybook/react-vite", "@storybook/core"],
    scope: "@storybook/",
    majors: [
      [6, "2020-08-11"],
      [7, "2023-03-31"],
      [8, "2024-03-11"],
      [9, "2025-05-28"],
      [10, "2025-10-28"]
    ]
  },
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
