import type { Meta, StoryObj } from "@storybook/react-vite"
import { RadiusRow } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { Playground, useDraft } from "./playground.tsx"
import { CardPreview } from "./preview-card.tsx"
import { inState, radiusWrites } from "./writes.ts"

/**
 * Radius, Appearance's row (`RadiusRow`): one radius field (Fields › Token length) under its name, and each corner, laid
 * out where it is, once Each corner at the end of the name's row is pressed. It opens pressed when the corners differ,
 * and the one field says Mixed if they still differ when it's closed. The button beside Each corner opens Corner shape,
 * marked † as Chromium only.
 */
const meta = {
  title: "Parity/Inspector/Rows/Radius",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Radius({ start, hover = false }: { start: Draft; hover?: boolean }) {
  const [draft, set] = useDraft(start)
  const written = radiusWrites(draft.radius, draft.cornerStyle)

  return (
    <Playground
      writes={hover ? inState(written, "hover") : written}
      preview={<CardPreview draft={{ ...draft, background: "card" }} cornerStyle={draft.cornerStyle} />}
    >
      <RadiusRow
        draft={draft}
        set={set}
        changed={hover ? { onReset: () => set({ radius: "radius-lg" }) } : undefined}
      />
    </Playground>
  )
}

/** One radius for every corner, radius-lg. */
export const OneRadius: Story = { render: () => <Radius start={{ radius: "radius-lg" }} /> }

/** One radius, with what the row stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...OneRadius, parameters: { demo: true } }

/** Each corner its own, laid out where it is: the top two at 2xl, the bottom two at sm. */
export const PerCorner: Story = {
  render: () => <Radius start={{ radius: ["radius-2xl", "radius-2xl", "radius-sm", "radius-sm"] }} />
}

/** Set on Hover: the label takes the state color, with a reset arrow back to `radius-lg`. */
export const SetInAState: Story = { render: () => <Radius start={{ radius: "radius-xl" }} hover /> }

/** A squircle: Corner shape, from the button beside Each corner, is Chromium only (†); others draw round corners. */
export const Squircle: Story = {
  render: () => <Radius start={{ radius: "radius-2xl", cornerStyle: "squircle" }} />
}
