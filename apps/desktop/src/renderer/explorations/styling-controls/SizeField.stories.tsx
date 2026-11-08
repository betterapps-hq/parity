import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { LayerPreview, SizeSection } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { Playground, useDraft } from "./playground.tsx"
import { sizeRowWrites } from "./writes.ts"

/**
 * Size and aspect ratio (PAR-186, PAR-652's Size type), on its own. W and H take a length (typed with the app's maths
 * and units, `spacing-4` included), a percentage of the parent, or a mode from the unit button's menu: Hug and Fill,
 * with Min content and Max content under More units, each with what it comes to after it, faintly. Dragging a label
 * scrubs; Up and Down step a whole spacing step. The lock keeps the ratio the layer has, freeing H (Auto, set by
 * Aspect ratio), with the ratio in its own row. Min and max limits are added from the field's menu.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Size and aspect ratio",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Size({ start }: { start: Draft }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", ...start })
  return (
    <Playground writes={sizeRowWrites(draft)} preview={<LayerPreview draft={draft} />}>
      <SizeSection draft={draft} set={set} />
    </Playground>
  )
}

/** Fixed at 520 by 520 pixels, written as spacing steps (`w-130`). Up on W makes it 524. */
export const Fixed: Story = { render: () => <Size start={{ width: 520, height: 520 }} /> }

/** W hugs its content, with what that comes to after Hug. */
export const Hug: Story = { render: () => <Size start={{ width: "hug" }} /> }

/** W fills its parent, `w-full`. */
export const Fill: Story = { render: () => <Size start={{ width: "fill" }} /> }

/** Half the parent, typed `50%`, written as Tailwind's fraction (`w-1/2`, call 10). */
export const Percent: Story = { render: () => <Size start={{ width: { percent: 50 } }} /> }

/** Min content, from More units: as narrow as its longest word. */
export const MinContent: Story = { render: () => <Size start={{ width: "min" }} /> }

/** Locked at 16:9: H is Auto, set by Aspect ratio, and the ratio is its own row, named Video. */
export const AspectLocked: Story = { render: () => <Size start={{ width: 480, aspect: "16 / 9" }} /> }

/** Fill, kept between 320 and 640 pixels by a min and a max, each its own row with − to take it off. */
export const MinAndMax: Story = { render: () => <Size start={{ width: "fill", minWidth: 320, maxWidth: 640 }} /> }

/** `wide` typed into W and Enter pressed: it isn't a size, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Size start={{ width: 520 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Width" })
    await userEvent.clear(field)
    await userEvent.type(field, "wide{Enter}")
  }
}
