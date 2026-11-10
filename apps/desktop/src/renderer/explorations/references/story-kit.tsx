import type { Found } from "@parity-app/connectors"
import { within } from "storybook/test"
import { setLayout } from "../../chrome/layout.ts"
import { design, example, openProjects } from "../../stories/fixtures.tsx"
import { sampleFound } from "./data.ts"
import { ReferencesWorkspace, type Start } from "./workspace.tsx"

/* What the stories of each library share: how one opens the window, and where it looks for what it draws. */

/** Opens the example with Pricing selected, or with nothing selected, on a tab of the left panel. */
export const opening =
  (selected: boolean, leftTab = "layers") =>
  async () => {
    await openProjects("example")
    example().selection.set(selected ? { design: design("Pricing") } : {})
    setLayout({ leftTab })
  }

/** The window, started where a story asks. */
export function workspace(start: Start = {}) {
  return () => <ReferencesWorkspace start={start} />
}

/** The whole page, since the browser opens over the window rather than inside the story's own element. */
export const body = () => within(document.body)

/** Samples as a search would return them, leaving out any id that isn't one. */
export const found = (...ids: string[]): Found[] => ids.flatMap((id) => sampleFound(id) ?? [])
