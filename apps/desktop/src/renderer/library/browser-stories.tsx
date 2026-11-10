import { type Found, isPlaceable, type pixabay, type Searched } from "@parity-app/connectors"
import type { Decorator } from "@storybook/react-vite"
import { within } from "storybook/test"
import { openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { answeringSearches } from "../stories/host.ts"
import { storyResults } from "../stories/library-results.ts"
import { openLibraryBrowser } from "./library-browser.ts"

/*
 * What the library browser's stories share, grouped by library under Parity/Library browser: opening the browser on a
 * library as the Media tab does, the stories' answers to its searches, and the page the dialog opens over.
 */

/** The stage every browser story is on: the example project's window. */
export const browserStage: Decorator = (Story) => (
  <ProjectStage>
    <Story />
  </ProjectStage>
)

/** What the stories' browser took when its button was pressed. */
let picked: readonly Found[] = []

/** What the browser took the last time its button was pressed. */
export const taken = (): readonly Found[] => picked

/** Opens the browser on a library, as the Media tab opens it on Pixabay, with the stories' answers unless `live`. */
export function opening(library: typeof pixabay, search?: Searched, live = false) {
  return async () => {
    await openProjects("example")
    picked = []

    if (!live) {
      answeringSearches(storyResults)
    }

    openLibraryBrowser({
      library: library.info,
      search,
      pick: {
        label: (count) => (count === 0 ? "Add to project" : `Add ${count} to project`),
        accepts: isPlaceable,
        take: (found) => {
          picked = found
        }
      }
    })
  }
}

/** The whole page, since the browser opens over the window rather than inside the story's own element. */
export const body = () => within(document.body)

/** The results, once they've arrived. */
export const results = () => body().findByRole("list", { name: "Results" })
