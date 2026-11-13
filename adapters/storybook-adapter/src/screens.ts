import type { ContainerSpec, DesignNode, EntitiesSource, ImportedScreen } from "@parity-app/core"
import { readStoryFile, type Story, type StoryFile } from "./csf.ts"

/** Story files, as Storybook's default `stories` glob finds them. */
export const storyFilePattern = /\.stories\.(?:[cm]?[jt]sx?)$/

/** The adapter's id, which each screen it imports keeps. */
export const storybookId = "storybook"

/**
 * Each story in the project's story files as a screen, grouped by its file's title: the component its meta names,
 * with the story's args as its props, as Storybook draws a story without a `render` of its own. A story that renders
 * itself, or whose component isn't one of the project's, isn't imported yet.
 */
export async function importStoryScreens(source: EntitiesSource): Promise<ImportedScreen[]> {
  const screens: ImportedScreen[] = []

  for (const path of await source.files(storyFilePattern)) {
    const text = await source.read(path)

    if (text === undefined) {
      continue
    }

    const file = readStoryFile(text, path)
    const component = file.component && (await source.componentFor(path, file.component.specifier, file.component.name))

    if (!component) {
      continue
    }

    const group = file.title ?? titleFromPath(path, file)

    for (const story of file.stories) {
      if (!story.render) {
        screens.push({
          adapter: storybookId,
          ref: `${path}#${story.exportName}`,
          group,
          screen: storyScreen(path, story, component)
        })
      }
    }
  }

  return screens
}

/** A story's screen: its component at its own size, with its args as props, on the page's background. */
export function storyScreen(path: string, story: Story, component: string): ContainerSpec {
  const node: DesignNode = { type: "component", id: "story", component }

  if (Object.keys(story.args).length > 0) {
    node.props = story.args
  }

  return {
    id: `story:${path}#${story.exportName}`,
    name: story.name,
    kind: "screen",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      name: "Story",
      // Padded and at its own size, as Storybook's default layout draws a story.
      style: {
        padding: { step: 4 },
        alignItems: "start",
        fills: [{ type: "solid", color: { token: "background" } }],
        color: { token: "foreground" }
      },
      children: [node]
    }
  }
}

/** The title Storybook gives a file without one: its component's name, else the file's name. */
function titleFromPath(path: string, file: StoryFile): string {
  const name = file.component?.name

  if (name && name !== "default") {
    return name
  }

  return (path.split("/").at(-1) ?? path).replace(storyFilePattern, "")
}
