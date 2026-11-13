import { componentBoardsFile } from "../canvas/component-boards.ts"
import { routePagesFile } from "../canvas/route-pages.ts"
import { storyScreensFile } from "../canvas/story-screens.ts"

/**
 * Whether a design file is read from the project's code, as its pages, its components' boards and its stories are:
 * its layers' values show, and nothing edits them.
 */
export function readFromCode(path: string): boolean {
  return path === componentBoardsFile || path === routePagesFile || path === storyScreensFile
}
