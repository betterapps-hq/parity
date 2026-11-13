import { layersSelection } from "@parity-app/editor"
import type { Meta } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { actions } from "./actions.ts"
import { hero, menuStories, opened, selecting, unavailable, valueInUsersCard } from "./app-menu-stories.tsx"
import type { AppMenu } from "./AppMenu.tsx"
import { renameDesign } from "./chrome-fixtures.tsx"

/** Edit: history, the clipboard, copying pictures and styles, then what changes or selects what's selected. */
const meta = {
  title: "Parity/Chrome/App menu/Edit",
  ...menuStories
} satisfies Meta<typeof AppMenu>

export default meta

const body = () => within(document.body)

/** After renaming a design, with a layer selected: Undo names the rename, and the rest apply to the layer. */
export const LayerSelected = opened(
  "Edit",
  selecting(
    () => layersSelection(design("Pricing (annual)"), [node("Pricing (annual)", "Hero")]),
    () => renameDesign("Pricing", "Pricing (annual)")
  )
)

/** With nothing selected and nothing done yet: only pasting and selecting all are available. */
export const NothingSelected = opened("Edit")

/** After a rename and a move, with the move undone: Undo names the rename and Redo the move. */
export const AfterUndo = opened(
  "Edit",
  selecting(
    () => ({ design: design("Pricing (annual)") }),
    () => {
      renameDesign("Pricing", "Pricing (annual)")
      const key = design("Pricing (annual)")
      const { position } = example().store.getEntry(key)!.container
      example().store.setPosition(key, { x: position.x + 400, y: position.y })
      example().store.undo()
    }
  )
)

/**
 * After wrapping a layer in a layout: Repeat names what it would do again, with its keys (PAR-180). With another layer
 * selected, it wraps that one too.
 */
export const AfterWrapping = opened(
  "Edit",
  async () => {
    await selecting(hero)()
    void actions.wrap.run("key")
  },
  async () => {
    await expect(body().getByRole("menuitem", { name: /^Repeat wrap in layout/ })).toBeEnabled()
  }
)

/**
 * With a layer inside an instance selected: Cut, Copy, Duplicate and Delete are unavailable, as the canvas and Layers
 * menus have them, since they can't act on it (PAR-971). Pasting over it or to replace it stays, and says why it can't.
 */
export const LayerInInstance = opened("Edit", selecting(valueInUsersCard), async () => {
  await expect(unavailable(["Cut", "Copy", "Duplicate", "Delete", "Paste over selection", "Paste to replace"])).toEqual(
    {
      Cut: true,
      Copy: true,
      Duplicate: true,
      Delete: true,
      "Paste over selection": false,
      "Paste to replace": false
    }
  )
})
