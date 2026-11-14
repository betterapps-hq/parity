import { addDesigns, type CanvasDocument, type ContainerSpec, previewOf } from "@parity-app/core"
import type { Selection } from "@parity-app/editor"
import type { ProjectInfo } from "@parity-app/project"
import { componentBoardsTop } from "./component-boards.ts"

/**
 * Where the screens the project's tools describe are kept among its designs, as its Storybook stories: a design file of
 * their own that's never saved, since they're read from the tool's files each time the project opens.
 */
export const storyScreensFile = "(stories)"

/** The layer of a story file's design that draws one of its stories, by the story's export, as `storybook-adapter` names it. */
export function storyLayer(story: string): string {
  return `story:${story}`
}

/** Whether a layer of a story file's design draws one of its stories, whose props are the story's args. */
export function isStoryLayer(node: string): boolean {
  return node.startsWith("story:")
}

/** Whether a layer of a story file's design is around one of its stories, which is listed as the story. */
export function isStoryBounds(node: string): boolean {
  return node.startsWith("bounds:")
}

/**
 * The story of a story file's design that's picked: the state of the preview picked last, else the one its view shows,
 * else its first.
 */
export function pickedStory(
  design: ContainerSpec,
  selection: Pick<Selection, "state" | "previews">
): string | undefined {
  const picked = selection.previews?.at(-1)

  return (picked && previewOf(picked).state) || selection.state || design.view?.state || design.states?.[0]?.id
}

/**
 * How the story files are laid out: a board for each, down a column left of the boards and pages, each as far below the
 * last as its stories need, since a story file's board draws a row for each story.
 */
const layout = { left: -2400, story: 360, gap: 240 }

/**
 * The project's story files as a design file, or none without any: a board for each, its stories its states, down a
 * column left of everything else on the canvas.
 */
export function storyScreensDocument(info: Pick<ProjectInfo, "id" | "entities" | "documents" | "sources">): {
  path: string
  document: CanvasDocument
}[] {
  const imported = info.entities.screens ?? []

  if (imported.length === 0) {
    return []
  }

  let top = componentBoardsTop(info)

  const designs = imported.map(({ screen }) => {
    const placed = { ...screen, position: { x: layout.left, y: top } }

    top += (screen.states?.length ?? 1) * layout.story + layout.gap

    return placed
  })

  return [{ path: storyScreensFile, document: addDesigns(undefined, designs) }]
}

/** Where a story file is listed in Layers: the folders of its title above its own name, as `UI` above `Button`. */
export interface StoryPlace {
  folders: string[]
}

/** A story file's design as its Storybook file draws it, by the design's id, before anything's changed on the canvas. */
export function drawnStory(info: Pick<ProjectInfo, "entities">, design: string): ContainerSpec | undefined {
  return info.entities.screens?.find((each) => each.screen.id === design)?.screen
}

/** Each story file's place in Layers, by its design's id, as Storybook's sidebar lists them. */
export function storyPlaces(info: Pick<ProjectInfo, "entities">): ReadonlyMap<string, StoryPlace> {
  return new Map(
    (info.entities.screens ?? []).map((each) => [each.screen.id, { folders: (each.folders ?? []).slice(0, -1) }])
  )
}
