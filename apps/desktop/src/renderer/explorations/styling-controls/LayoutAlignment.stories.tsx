import type { Meta, StoryObj } from "@storybook/react-vite"
import { LayerPreview, LayoutSection } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { Playground, useDraft } from "./playground.tsx"
import { layoutWrites } from "./writes.ts"

/**
 * Layout's direction and alignment (PAR-186): Type with Wrap beside it, and Reverse direction once it's set from More;
 * the nine-spot box, which stays physical when reversed, so its top left is the top left whichever way the layout runs
 * and what's written flips; and Baseline under it in a horizontal layout, on the first line or the last.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Layout direction and alignment",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Layout({ start }: { start: Draft }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", ...start })
  return (
    <Playground writes={layoutWrites(draft)} preview={<LayerPreview draft={draft} />}>
      <LayoutSection draft={draft} set={set} />
    </Playground>
  )
}

/** Vertical, children stretched across: `flex flex-col`, the default. */
export const Vertical: Story = { render: () => <Layout start={{ direction: "column" }} /> }

/** Horizontal, centered both ways from the box's middle spot. */
export const HorizontalCentered: Story = {
  render: () => <Layout start={{ direction: "row", justify: "center", align: "center" }} />
}

/** Horizontal, wrapping onto new lines. */
export const Wrapping: Story = { render: () => <Layout start={{ direction: "row", wrap: true }} /> }

/** Baseline, first line: the children's text lines up across the row, however large it is (`items-baseline`). */
export const Baseline: Story = { render: () => <Layout start={{ direction: "row", align: "baseline" }} /> }

/** Baseline, last line: their last lines line up (`items-baseline-last`). */
export const LastBaseline: Story = { render: () => <Layout start={{ direction: "row", align: "last baseline" }} /> }

/**
 * Reversed, from More: the Reverse toggle shows beside Type, and its hint says the reading order no longer matches
 * what's seen. The box's top-left spot still means the top left, so it writes `justify-end`.
 */
export const Reversed: Story = { render: () => <Layout start={{ direction: "row", reverse: true }} /> }

/** Baseline set in a vertical layout does nothing, so it stays, dimmed, with why in its hint. */
export const BaselineDoesNothing: Story = {
  render: () => <Layout start={{ direction: "column", align: "baseline" }} />
}
