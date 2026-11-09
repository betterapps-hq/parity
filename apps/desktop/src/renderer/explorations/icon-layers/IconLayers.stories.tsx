import type { Meta, StoryObj } from "@storybook/react-vite"
import { revealSelection } from "../../chrome/reveal.ts"
import { design, example, frameDesigns, node, openProjects } from "../../stories/fixtures.tsx"
import { type IconOption, IconLayersStage } from "./stage.tsx"

/**
 * One fixed icon for every icon layer (PAR-793). An icon, such as the Plus in Dashboard's New project button, is a
 * component from the project's icon set, so the app draws it with the component Box, as it draws Button. Drawing each
 * icon's own glyph was ruled out: Lucide has the kind icons Layers already uses, such as AppWindow, Type and Rows3,
 * and glyphs such as X and Plus look like a row's buttons. So every icon layer shows one icon that means "icon", in
 * the component purple, since an icon is changed through its props as a component is. The layer's name says which.
 *
 * Pick one of the five in the bar above the window. It changes the icon wherever a layer's kind shows: Layers, the
 * inspector's heading, Select layer in the canvas menu, and Search actions (Ctrl K). Everything else is the app.
 */
const meta = {
  title: "Parity/Explorations/Icon layers",
  parameters: { layout: "fullscreen" },
  loaders: [() => openProjects("example")],
  play: async () => {
    await frameDesigns("Dashboard")
    const session = example()
    session.selection.set({ design: design("Dashboard"), node: node("Dashboard", "lucide/Plus") })
    revealSelection(session)
  }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Each option starts with Dashboard's Plus icon selected, so Layers is open to it and the inspector shows it. */
const startingOn = (option: IconOption): Story => ({ render: () => <IconLayersStage initial={option} /> })

/** Smile, the icon of the Icons tab, so one icon means "icon" wherever it shows. */
export const Smile = startingOn("smile")

/** A sticker: a graphic placed on top of a design. */
export const Sticker = startingOn("sticker")

/** A heart, a glyph every icon set draws. */
export const Heart = startingOn("heart")

/** An asterisk, a symbol that stands for no one thing. */
export const Asterisk = startingOn("asterisk")

/** A feather, after Feather, the set Lucide grew from. */
export const Feather = startingOn("feather")
