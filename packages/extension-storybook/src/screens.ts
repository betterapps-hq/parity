import {
  type ComponentNode,
  type ContainerSpec,
  type DesignNode,
  type EntitiesSource,
  type FileWrite,
  findNode,
  type GuestComponentSource,
  type ImportedScreen,
  isMadeValue,
  type ProjectEntities,
  type StateSpec
} from "@parity-app/core"
import { readStoryFile, type Story, type StoryArgs, type StoryFile } from "./csf.ts"
import type { ComponentStoryFile } from "./storybook.ts"
import { writeStoryArgs } from "./write.ts"

/** Story files, as Storybook's default `stories` glob finds them. */
export const storyFilePattern = /\.stories\.(?:[cm]?[jt]sx?)$/

/** The adapter's id, which each screen it imports keeps. */
export const storybookId = "storybook"

/**
 * Each of the project's story files as a design of its own, its stories its states, listed by the file's title. A story
 * without a `render` of its own draws the component its meta names with its args as props, as Storybook draws one; one
 * with a `render` draws that function, loaded from the story file, with its args as props. A story drawing a component
 * that isn't one of the project's isn't imported, nor is a file with none left.
 */
export async function importStoryScreens(source: EntitiesSource): Promise<ProjectEntities> {
  return (await importStories(source)).entities
}

/**
 * The screens and code `importStoryScreens` gives, and the project's story files by the component each one's meta
 * names, when that's one of the project's components (PAR-1128).
 */
export async function importStories(
  source: EntitiesSource
): Promise<{ entities: ProjectEntities; stories: Record<string, ComponentStoryFile[]> }> {
  const screens: ImportedScreen[] = []
  const sources: Record<string, GuestComponentSource> = {}
  const byComponent: Record<string, ComponentStoryFile[]> = {}

  for (const path of await source.files(storyFilePattern)) {
    const text = await source.read(path)

    if (text === undefined) {
      continue
    }

    const file = readStoryFile(text, path)
    const component = file.component && (await source.componentFor(path, file.component.specifier, file.component.name))
    const group = file.title ?? titleFromPath(path, file)

    if (component) {
      const listed: ComponentStoryFile = { path, exports: file.stories.map((story) => story.exportName) }

      if (file.title) {
        listed.title = file.title
      }

      ;(byComponent[component] ??= []).push(listed)
    }

    const stories = file.stories.flatMap((story) => {
      // A story that renders itself draws its function, as a component of its own, by the story's ref.
      const drawn = story.render ? `story:${path}#${story.exportName}` : component

      if (!drawn) {
        return []
      }

      if (story.render) {
        sources[drawn] = { path, export: story.render }
      }

      return [{ story, drawn }]
    })

    if (stories.length === 0) {
      continue
    }

    const screen: ImportedScreen = {
      adapter: storybookId,
      ref: path,
      group,
      folders: titleFolders(group),
      screen: storyFileDesign(path, group, stories)
    }

    if (component) {
      screen.component = component
    }

    screens.push(screen)
  }

  return { entities: { screens, sources }, stories: byComponent }
}

/** The id of the layer that draws a story in its file's design, by the story's export. */
export function storyLayerId(exportName: string): string {
  return `story:${exportName}`
}

/** The id of the layer around a story, which can be dragged to another size, by the story's export. */
export function storyBoundsId(exportName: string): string {
  return `bounds:${exportName}`
}

/**
 * A story file's design: each story what it draws at its own size, with its args as props, inside bounds of its own,
 * on the page's background, and a state for each story that shows its bounds alone, each a row on its board. Its root hugs the story, padded as
 * Storybook's default layout draws one, so each mode's frame is only as wide as the story, while the story lays out in
 * the mode's whole window, as in Storybook's canvas.
 */
export function storyFileDesign(
  path: string,
  title: string,
  stories: readonly { story: Story; drawn: string }[]
): ContainerSpec {
  const children = stories.map(({ story, drawn }): DesignNode => {
    const node: DesignNode = { type: "component", id: storyLayerId(story.exportName), component: drawn }

    // A story's own render function has no name of its own to show, so its layer takes the story's.
    if (story.render) {
      node.name = story.name
    }

    if (Object.keys(story.args).length > 0) {
      node.props = story.args
    }

    // Around what the story draws, at its size until it's dragged to another, to see how the story responds there,
    // whether or not its component takes a size of its own.
    return {
      type: "layout",
      id: storyBoundsId(story.exportName),
      name: story.name,
      style: { alignItems: "start" },
      children: [node]
    }
  })

  return {
    id: `story:${path}`,
    name: title.split("/").at(-1)?.trim() || title,
    kind: "story",
    position: { x: 0, y: 0 },
    // Every story shows, a row each, as Storybook's sidebar lists them all.
    view: { allStates: true },
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
      children
    },
    states: stories.map(({ story }) => ({
      id: story.exportName,
      name: story.name,
      overrides: Object.fromEntries(
        stories.flatMap((other) =>
          other.story === story ? [] : [[storyBoundsId(other.story.exportName), { hidden: true }] as const]
        )
      )
    }))
  }
}

/**
 * A story file's design, as edited, written back to its file: the props each story draws, in its own state, as the
 * story's args. The rest of the design is Storybook's to lay out, so nothing else is written.
 */
export async function exportStoryScreen(
  screen: ImportedScreen,
  edited: ContainerSpec,
  source: EntitiesSource
): Promise<FileWrite[]> {
  const path = screen.ref
  const text = await source.read(path)

  if (text === undefined) {
    return []
  }

  const written = (edited.states ?? []).reduce((current, state) => {
    const drawn = findNode(edited.root, storyLayerId(state.id))

    if (drawn?.type !== "component") {
      return current
    }

    return writeStoryArgs(current, state.id, storyArgs(stateProps(drawn, state, storyLayerId(state.id))), path)
  }, text)

  return written === text ? [] : [{ path, text: written }]
}

/** A layer's props as a state draws it: its own, with what the state's patch sets over them and takes away. */
function stateProps(node: ComponentNode, state: StateSpec, id: string): NonNullable<ComponentNode["props"]> {
  const patch = state.overrides?.[id]
  const props = { ...node.props, ...patch?.props }

  for (const name of patch?.unset?.props ?? []) {
    delete props[name]
  }

  return props
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
