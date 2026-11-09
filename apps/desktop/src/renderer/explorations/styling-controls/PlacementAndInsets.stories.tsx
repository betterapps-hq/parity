import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { PositionPreview, PositionSection } from "./pin-box.tsx"
import { Playground } from "./playground.tsx"
import { layerOrderWrites, type Position, positionWrites } from "./position-writes.ts"
import type { Side } from "./sides-writes.ts"
import type { StoredObject, Writes } from "./writes.ts"

/**
 * Placement and its insets (PAR-186, PAR-652's Position and Insets). Placement's toggles are In layout, Absolute,
 * Fixed and Sticky, with Relative under More, shown as a fifth toggle once set. Out of layout, the pin box shows a
 * field on each side of a small box: an unpinned side is Auto, with its measured distance muted (Auto 176); clicking
 * a side's pin pins it at that distance, and clicking again unpins it, as Framer's pin box does. Typing in a side pins
 * it; `auto` unpins it. A percentage is of Pricing's width, or its height for Top and Bottom. Absolute and Fixed add
 * Figma's constraints as presets, each written in CSS, and Fill parent. Layer order shows by default once it isn't In
 * layout.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Placement and insets",
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

/** In layout: placed by its layout, so there's no pin box and nothing is written. Choose Absolute to take it out. */
export const InLayout: Story = { render: () => <Placement start={{ placement: "static", insets: none }} /> }

/**
 * Absolute, pinned left and top where it was: `absolute top-6 left-6`. Right and bottom are Auto, with their measured
 * distances; click their pins to pin them there.
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

/** Centered 40 right of the middle: Figma's Center keeps the offset, written `left-10 -right-10 mx-auto`. */
export const CenterWithAnOffset: Story = {
  render: () => (
    <Placement start={{ placement: "absolute", insets: [px(24), undefined, undefined, undefined], centerX: 40 }} />
  )
}

/** Scale: left and right as percentages of Pricing's width, so it grows with it. */
export const Scale: Story = {
  render: () => (
    <Placement start={{ placement: "absolute", insets: [px(24), { percent: 55 }, undefined, { percent: 7.5 }] }} />
  )
}

/** Fill parent: every side pinned at 0, `inset-0`, Webflow's Full. */
export const FillParent: Story = {
  render: () => <Placement start={{ placement: "absolute", insets: [px(0), px(0), px(0), px(0)] }} />
}

/** Half way down: `top-1/2`, a step; its hint says it's 50% of Pricing's height and what that comes to. */
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

/** `wide` typed into Top and Enter pressed: it isn't a length, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Placement start={{ placement: "absolute", insets: [px(24), undefined, undefined, px(24)] }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Top inset" })
    await userEvent.clear(field)
    await userEvent.type(field, "wide{Enter}")
  }
}
