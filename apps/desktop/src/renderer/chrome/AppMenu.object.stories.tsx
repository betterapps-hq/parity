import type { Meta } from "@storybook/react-vite"
import { expect } from "storybook/test"
import {
  hero,
  menuItems,
  menuStories,
  opened,
  pricing,
  selecting,
  unavailable,
  valueInUsersCard
} from "./app-menu-stories.tsx"
import type { AppMenu } from "./AppMenu.tsx"
import { exampleOpen } from "./chrome-fixtures.tsx"
import { formatKeys } from "./keys.ts"

/** Object: making designs and inserting, wrapping, components, order, hiding and locking. */
const meta = {
  title: "Parity/Chrome/App menu/Object",
  ...menuStories
} satisfies Meta<typeof AppMenu>

export default meta

/**
 * With nothing selected: New screen, New component and Insert are what can be done (PAR-546), the rest is unavailable,
 * and a hint says what to select for it, in the glossary's words.
 */
export const NothingSelected = opened("Object", exampleOpen, async () => {
  const [first, second] = menuItems()
  await expect(first).toHaveTextContent(`New screen${formatKeys("Ctrl Alt N")}`)
  await expect(second).toHaveTextContent(`New component${formatKeys("Ctrl Alt Shift N")}`)
  await expect(unavailable(["New screen", "New component", "Insert…", "Wrap in layout"])).toEqual({
    "New screen": false,
    "New component": false,
    "Insert…": false,
    "Wrap in layout": true
  })
})

/** With a design selected on its own: inserting into it, and making it a component. */
export const DesignSelected = opened("Object", selecting(pricing))

/** With one layer selected: wrapping and unwrapping it, ordering it among its siblings, and hiding it. */
export const OneLayer = opened("Object", selecting(hero))

/** With a layer inside an instance selected: wrapping it, ordering it, hiding it and locking it are unavailable. */
export const LayerInInstance = opened("Object", selecting(valueInUsersCard), async () => {
  const items = [
    "Wrap in layout",
    "Bring forward",
    "Send backward",
    "Bring to front",
    "Send to back",
    "Hide or show",
    "Lock or unlock"
  ]

  await expect(unavailable(items)).toEqual(Object.fromEntries(items.map((name) => [name, true])))
})
