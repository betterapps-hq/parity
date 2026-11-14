import {
  type ComponentNode,
  type ContainerSpec,
  type DesignNode,
  type EntitiesSource,
  type FileWrite,
  type GuestComponentSource,
  type ImportedScreen,
  isMadeValue,
  type ProjectEntities
} from "@parity-app/core"
import { readStoryFile, type Story, type StoryArgs, type StoryFile } from "./csf.ts"
import { writeStoryArgs } from "./write.ts"

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

      const screen: ImportedScreen = {
        adapter: storybookId,
        ref,
        group,
        folders: titleFolders(group),
        screen: storyScreen(path, story, drawn)
      }

      if (component) {
        screen.component = component
      }

      screens.push(screen)
    }
  }

  return { screens, sources }
}

/**
 * A story's screen: what it draws at its own size, with its args as props, on the page's background. It's a frame that
 * hugs the story, padded as Storybook's default layout draws one, rather than a screen as wide as a viewport.
 */
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
    kind: "frame",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      name: "Story",
      // Padded and at its own size, as Storybook's default layout draws a story.
      style: {
        width: { size: "hug" },
        padding: { step: 4 },
        alignItems: "start",
        fills: [{ type: "solid", color: { token: "background" } }],
        color: { token: "foreground" }
      },
      children: [node]
    }
  }
}

/**
 * A story's screen, as edited, written back to its file: the props of what it draws as the story's args. The rest of
 * the screen is Storybook's to lay out, so nothing else is written.
 */
export async function exportStoryScreen(
  screen: ImportedScreen,
  edited: ContainerSpec,
  source: EntitiesSource
): Promise<FileWrite[]> {
  const [path, exportName] = splitRef(screen.ref)
  const drawn = edited.root.type === "layout" ? edited.root.children.find((child) => child.id === "story") : undefined
  const text = path && (await source.read(path))

  if (!exportName || !text || drawn?.type !== "component") {
    return []
  }

  const written = writeStoryArgs(text, exportName, storyArgs(drawn.props ?? {}), path)

  return written === text ? [] : [{ path, text: written }]
}

/** Props as a story's args: their JSON values, leaving out values the package makes (`$call`) and dates (`$date`). */
function storyArgs(props: NonNullable<ComponentNode["props"]>): StoryArgs {
  const json = Object.entries(props).filter(([, value]) => !isMadeValue(value) && !dateValue(value))

  // SAFETY: a sample's props without made values and dates are plain JSON, which is what a story's args hold.
  return Object.fromEntries(json) as StoryArgs
}

/** Whether a prop is a date, which a story's args can't hold as JSON. */
function dateValue(value: NonNullable<ComponentNode["props"]>[string]): boolean {
  return JSON.stringify(value)?.startsWith('{"$date"') ?? false
}

/** A story's ref as its file and its export's name. */
function splitRef(ref: string): [string, string | undefined] {
  const at = ref.lastIndexOf("#")

  return at === -1 ? [ref, undefined] : [ref.slice(0, at), ref.slice(at + 1)]
}

/**
 * The folders Storybook's sidebar lists a title's stories in: one for each part of it, split at `/`, the last the
 * component's, as `UI` then `Button` for `UI/Button`.
 */
export function titleFolders(title: string): string[] {
  return title
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
}

/** The title Storybook gives a file without one: its component's name, else the file's name. */
function titleFromPath(path: string, file: StoryFile): string {
  const name = file.component?.name

  if (name && name !== "default") {
    return name
  }

  return (path.split("/").at(-1) ?? path).replace(storyFilePattern, "")
}
