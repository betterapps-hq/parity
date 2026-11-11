import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { PositionPreview, PositionSection, previewStage } from "./pin-box.tsx"
import { Playground } from "./playground.tsx"
import { layerOrderWrites, type Position, positionWrites } from "./position-writes.ts"
import type { Side } from "./sides-writes.ts"
import type { StoredObject, Writes } from "./writes.ts"

/**
 * Placement and its insets (PAR-186, PAR-652's Position and Insets). Placement's toggles are In layout, Absolute,
 * Fixed and Sticky, with Relative under More, shown as a fifth toggle once set; Layer order sits beside them, shown by
 * default when Absolute, Fixed or Sticky. Out of layout, the inset box lays the insets out as the box model lays out spacing:
 * what the layer is placed against, named in its corner (Parent, Window, Scroll area), the layer in its middle, and
 * each side's inset on a line from the edge to the layer. A pinned side's line is solid, in the layer's color; an
 * unpinned side's is dashed, and says Auto. Clicking a side's line pins it at its distance, and again unpins it, as
 * Framer's pin box does. A side's value opens its field in a popover, with room for a token's chip: typing in an
 * unpinned side pins it, `auto` unpins it, and a percentage is of the parent's width, or its height for Top and
 * Bottom. The layer's center lines center it, keeping its offset from the center, as Figma's Center does. Fill and
 * Scale, in the header, pin every side at 0, or at its share of the parent.
 */
const meta = {
  title: "Parity/Inspector/Controls/Controls/Placement and insets",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })

function Placement({
  start,
  layerOrder: startOrder,
  stopped
}: {
  start: Position
  layerOrder?: Side
  stopped?: boolean
}) {
  const [position, setPosition] = useState(start)
  const [layerOrder, setLayerOrder] = useState(startOrder)
  const [clipped, setClipped] = useState(false)
  const placed = positionWrites(position)
  const order = layerOrderWrites(layerOrder)

  const stored: StoredObject = {
    // SAFETY: Position stores an object (`{ position, inset }`) when it's set, and nothing when it isn't.
    ...(placed.stored as StoredObject | undefined)
  }

  if (order.stored !== undefined) {
    stored.zIndex = order.stored
  }

  const writes: Writes = {
    stored: placed.stored === undefined && order.stored === undefined ? undefined : stored,
    css: [...placed.css, ...order.css],
    tailwind: [...placed.tailwind, ...order.tailwind]
  }

  return (
    <Playground writes={writes} preview={<PositionPreview position={position} layerOrder={layerOrder} />}>
      <PositionSection
        position={position}
        set={setPosition}
        layerOrder={layerOrder}
        onLayerOrder={setLayerOrder}
        context="Pricing, a stacking context because it isolates"
        stage={previewStage}
        stickyStopped={
          stopped && !clipped
            ? "Plans won't stick: Main, around it, hides its overflow, which makes it the scroller."
            : undefined
        }
        onClipInstead={() => setClipped(true)}
      />
    </Playground>
  )
}

const none: Position["insets"] = [undefined, undefined, undefined, undefined]

/** In layout: placed by its layout, so there's no inset box and nothing is written. Choose Absolute to take it out. */
export const InLayout: Story = { render: () => <Placement start={{ placement: "static", insets: none }} /> }

/**
 * Absolute, pinned left and top where it was: `absolute top-6 left-6`. Right and bottom are Auto; click their lines to
 * pin them where they are.
 */
export const Absolute: Story = {
  render: () => <Placement start={{ placement: "absolute", insets: [px(24), undefined, undefined, px(24)] }} />
}

/** Pinned right and bottom, 16 from each: `absolute right-4 bottom-4`. */
export const RightAndBottom: Story = {
  render: () => <Placement start={{ placement: "absolute", insets: [undefined, px(16), px(16), undefined] }} />
}

/** Left and right, so it stretches with Pricing's width: `absolute inset-x-6 top-6`. */
export const LeftAndRight: Story = {
  render: () => <Placement start={{ placement: "absolute", insets: [px(24), px(24), undefined, px(24)] }} />
}

/** Centered across, hugging its content: `inset-x-0 mx-auto w-fit`, since an auto width between insets stretches. */
export const Center: Story = {
  render: () => (
    <Placement
      start={{
        placement: "absolute",
        insets: [px(24), undefined, undefined, undefined],
        centerX: 0,
        hugs: { width: true, height: false }
      }}
    />
  )
}

/**
 * Centered 40 right of the middle: Figma's Center keeps the offset, which the left side holds, +40px, written
 * `left-10 -right-10 mx-auto`. Right says Center.
 */
export const CenterWithAnOffset: Story = {
  render: () => (
    <Placement start={{ placement: "absolute", insets: [px(24), undefined, undefined, undefined], centerX: 40 }} />
  )
}

/**
 * Left and right as percentages of the parent's width, so it grows with it, as Figma's Scale does. Scale, in the
 * header, sets every side so, at its share of the parent where it is.
 */
export const Scale: Story = {
  render: () => (
    <Placement start={{ placement: "absolute", insets: [px(24), { percent: 55 }, undefined, { percent: 7.5 }] }} />
  )
}

/** Every side pinned at 0, `inset-0`, Webflow's Full: Fill, in the header, is pressed. */
export const FillParent: Story = {
  render: () => <Placement start={{ placement: "absolute", insets: [px(0), px(0), px(0), px(0)] }} />
}

/** Half way down: `top-1/2`, a step; its field's hint says it's 50% of the parent's height. */
export const PercentageDown: Story = {
  render: () => <Placement start={{ placement: "absolute", insets: [{ percent: 50 }, undefined, undefined, px(24)] }} />
}

/** Fixed to the window's top right, so it stays put as the page scrolls: `fixed top-4 right-4`. */
export const Fixed: Story = {
  render: () => <Placement start={{ placement: "fixed", insets: [px(16), px(16), undefined, undefined] }} />
}

/** Sticky at the top: `sticky top-0`, in layout until scrolling would take it past the line. */
export const Sticky: Story = {
  render: () => <Placement start={{ placement: "sticky", insets: [px(0), undefined, undefined, undefined] }} />
}

/**
 * Sticky inside a layout that hides its overflow, which stops it sticking: the insets dim, and the row offers Clip
 * without scrolling (`overflow: clip`), which clips the same but keeps it sticking.
 */
export const StickyStoppedByOverflow: Story = {
  render: () => <Placement start={{ placement: "sticky", insets: [px(0), undefined, undefined, undefined] }} stopped />
}

/** Relative, from More: in layout, then moved 8 right, `relative left-2`. It shows as a fifth toggle once set. */
export const Relative: Story = {
  render: () => <Placement start={{ placement: "relative", insets: [undefined, undefined, undefined, px(8)] }} />
}

/** Absolute with a layer order of 10, so Plans is drawn in front of Hero: `z-10`. */
export const WithLayerOrder: Story = {
  render: () => (
    <Placement start={{ placement: "absolute", insets: [px(40), undefined, undefined, px(100)] }} layerOrder={px(10)} />
  )
}

/**
 * Top at a spacing token, `top-inset`: the box shows what it comes to, 16px, shaded as a token is. Pressed, its field
 * opens in a popover, with the token's chip whole.
 */
export const TokenInset: Story = {
  render: () => (
    <Placement start={{ placement: "absolute", insets: [{ token: "spacing-inset" }, undefined, undefined, px(24)] }} />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Top inset/ }))
  }
}

/** `wide` typed into Top's field and Enter pressed: it isn't a length, so it stays, outlined, with the reason under. */
export const InvalidAsTyped: Story = {
  render: () => <Placement start={{ placement: "absolute", insets: [px(24), undefined, undefined, px(24)] }} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Top inset/ }))
    const field = within(document.body).getByRole("textbox", { name: "Top inset" })
    await userEvent.clear(field)
    await userEvent.type(field, "wide{Enter}")
  }
}
