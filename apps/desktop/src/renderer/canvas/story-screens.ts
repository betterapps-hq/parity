import { addDesigns, type CanvasDocument, type ContainerSpec, previewOf, type ScreensLook } from "@parity-app/core"
import type { Selection } from "@parity-app/editor"
import type { ProjectInfo } from "@parity-app/project"
import { componentBoardsTop } from "./component-boards.ts"

/**
 * Where the screens the project's tools describe are kept among its designs, as stories: a design file of their own
 * that's never saved, since they're read from the tool's files each time the project opens.
 */
export const storyScreensFile = "(stories)"

/** Whether a design is one of the project's story files, by its key. */
export function isStoryScreen(key: string): boolean {
  return key.startsWith(`${storyScreensFile}#`)
}

/** The layer of a story file's design that draws one of its stories, by the story's export, as its provider names it. */
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
export function storyScreensDocument(info: Pick<ProjectInfo, "id" | "entities" | "documents" | "sources" | "routes">): {
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

/** A story file's design as its tool's file draws it, by the design's id, before anything's changed on the canvas. */
export function drawnStory(info: Pick<ProjectInfo, "entities">, design: string): ContainerSpec | undefined {
  return info.entities.screens?.find((each) => each.screen.id === design)?.screen
}

/** Each story file's place in Layers, by its design's id, in the folders its provider gives. */
export function storyPlaces(info: Pick<ProjectInfo, "entities">): ReadonlyMap<string, StoryPlace> {
  return new Map(
    (info.entities.screens ?? []).map((each) => [each.screen.id, { folders: (each.folders ?? []).slice(0, -1) }])
  )
}

/** How a story file's design is shown, as its provider's manifest says (PAR-1131), by the design's id. */
export function screensLook(info: Pick<ProjectInfo, "entities">, design: string): ScreensLook | undefined {
  const imported = info.entities.screens?.find((each) => each.screen.id === design)

  return imported && info.entities.looks?.[imported.adapter]
}

/** What a design's states are called: a story file's as its provider calls them, any other's states. */
export function stateNouns(
  entry: { path: string; container: Pick<ContainerSpec, "id"> },
  info: Pick<ProjectInfo, "entities">
): { one: string; many: string } {
  const look = entry.path === storyScreensFile ? screensLook(info, entry.container.id) : undefined

  return look?.states ?? { one: "state", many: "states" }
}

/** The id of the Layers group a story file's design is listed in: its provider's, by the design's id. */
export function screensGroupId(info: Pick<ProjectInfo, "entities">, design: string): string {
  const imported = info.entities.screens?.find((each) => each.screen.id === design)

  return imported ? `stories:${imported.adapter}` : "stories"
}
