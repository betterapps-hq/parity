import { componentBoardsFile } from "../canvas/component-boards.ts"
import { routePagesFile } from "../canvas/route-pages.ts"
import { storyLayer, storyScreensFile } from "../canvas/story-screens.ts"

/**
 * Whether a design file is read from the project's code, as its pages, its components' boards and its stories are:
 * its layers' values show, and nothing edits them.
 */
export function readFromCode(path: string): boolean {
  return path === componentBoardsFile || path === routePagesFile || path === storyScreensFile
}

/**
 * Whether a layer read from the project's code takes edits to its props, which go back to the code: what a story
 * draws, whose props are the story's args.
 */
export function writesProps(path: string, node: string): boolean {
  return path === storyScreensFile && node === storyLayer
}
