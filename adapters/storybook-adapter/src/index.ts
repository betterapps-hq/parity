import type { EntitiesAdapter } from "@parity-app/core"
import { detectStorybook, storybookConfigFiles } from "./detect.ts"
import { storybookLogo } from "./logo.ts"
import { exportStoryScreen, importStoryScreens, storybookId } from "./screens.ts"

export { type ArgValue, readStoryFile, type Story, type StoryArgs, type StoryFile, storyName } from "./csf.ts"

export { exportStoryScreen, importStoryScreens, storyFilePattern, storyScreen, titleFolders } from "./screens.ts"

export { writeStoryArgs } from "./write.ts"

/**
 * Storybook: its stories, read from their CSF files as screens, and their args written back. Open in Storybook and its
 * status item come from its extension, `@parity-app/extension-storybook` (PAR-1089), and so do its supported versions,
 * which the adapters list reads from the extension's peer dependencies (PAR-1091).
 */
export const storybookAdapter: EntitiesAdapter = {
  id: storybookId,
  name: "Storybook",
  icon: storybookLogo,
  detect: detectStorybook,
  watches: storybookConfigFiles,
  import: importStoryScreens,
  export: exportStoryScreen
}
