import type {
  ContainerSpec,
  DesignNode,
  EntitiesSource,
  GuestComponentSource,
  ImportedScreen,
  ProjectEntities
} from "@parity-app/core"
import { readStoryFile, type Story, type StoryFile } from "./csf.ts"

/** Story files, as Storybook's default `stories` glob finds them. */
export const storyFilePattern = /\.stories\.(?:[cm]?[jt]sx?)$/

/** The adapter's id, which each screen it imports keeps. */
export const storybookId = "storybook"

/**
 * Each story in the project's story files as a screen, grouped by its file's title. A story without a `render` of its
 * own draws the component its meta names with its args as props, as Storybook draws one; one with a `render` draws
 * that function, loaded from the story file, with its args as props. A story drawing a component that isn't one of the
 * project's isn't imported.
 */
export async function importStoryScreens(source: EntitiesSource): Promise<ProjectEntities> {
  const screens: ImportedScreen[] = []
  const sources: Record<string, GuestComponentSource> = {}

  for (const path of await source.files(storyFilePattern)) {
    const text = await source.read(path)

    if (text === undefined) {
      continue
    }

    const file = readStoryFile(text, path)
    const component = file.component && (await source.componentFor(path, file.component.specifier, file.component.name))
    const group = file.title ?? titleFromPath(path, file)

    for (const story of file.stories) {
      const ref = `${path}#${story.exportName}`
      // A story that renders itself draws its function, as a component of its own, by the story's ref.
      const drawn = story.render ? `story:${ref}` : component

      if (!drawn) {
        continue
      }

      if (story.render) {
        sources[drawn] = { path, export: story.render }
      }

      screens.push({ adapter: storybookId, ref, group, screen: storyScreen(path, story, drawn) })
    }
  }

  return { screens, sources }
}

/** A story's screen: what it draws at its own size, with its args as props, on the page's background. */
export function storyScreen(path: string, story: Story, component: string): ContainerSpec {
  const node: DesignNode = { type: "component", id: "story", component }

  // A story's own render function has no name of its own to show, so its layer takes the story's.
  if (story.render) {
    node.name = story.name
  }

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
