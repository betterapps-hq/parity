import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"
import type { Redline } from "./Redline.tsx"
import { RedlineView } from "./Redline.tsx"

/**
 * The distances measured between two layers, while Alt is held or a layer snaps: a red line, and beside it the distance
 * in pixels with the spacing step it comes to. The label sits off the line, so the line shows between layers a few
 * pixels apart (PAR-558).
 */
const meta = {
  title: "Parity/Canvas/Distances",
  component: RedlineView,
  parameters: { layout: "centered" },
  decorators: [
    (Story, { parameters }) => (
      <div className="relative h-[150px] w-[260px] overflow-hidden rounded-md border border-neutral-200 bg-white">
        {(parameters.boxes as Box[]).map((box, index) => (
          <div
            key={index}
            className="absolute rounded-sm bg-neutral-100 outline outline-1 outline-neutral-300"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
        ))}
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof RedlineView>

export default meta

type Story = StoryObj<typeof meta>

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const story = (boxes: Box[], line: Redline): Story => ({ args: { line }, parameters: { boxes } })

/** Two layers side by side: the label sits below the line, centred on it. */
export const SideBySide: Story = story(
  [
    { x: 16, y: 40, w: 60, h: 70 },
    { x: 184, y: 40, w: 60, h: 70 }
  ],
  { x1: 76, y1: 75, x2: 184, y2: 75, px: 108, steps: 27 }
)

/** One layer above another: the label sits to the right of the line. */
export const Stacked: Story = story(
  [
    { x: 70, y: 10, w: 120, h: 30 },
    { x: 70, y: 110, w: 120, h: 30 }
  ],
  { x1: 130, y1: 40, x2: 130, y2: 110, px: 70, steps: 17.5 }
)

/** Two layers 4px apart: the line between them stays in sight, with the label below it. */
export const CloseTogether: Story = {
  ...story(
    [
      { x: 58, y: 40, w: 70, h: 70 },
      { x: 132, y: 40, w: 70, h: 70 }
    ],
    { x1: 128, y1: 75, x2: 132, y2: 75, px: 4, steps: 1 }
  ),
  play: async ({ canvasElement }) => {
    const label = within(canvasElement).getByText("4px").parentElement!
    // The label starts below the line, so it never covers it.
    const line = label.previousElementSibling!.getBoundingClientRect()
    await expect(label.getBoundingClientRect().top).toBeGreaterThan(line.bottom)
    await expect(within(label).getByText("spacing-1")).toBeVisible()
  }
}

/** Two layers stacked 2px apart: the label sits to the right of the line. */
export const CloseTogetherStacked: Story = story(
  [
    { x: 70, y: 30, w: 120, h: 44 },
    { x: 70, y: 76, w: 120, h: 44 }
  ],
  { x1: 130, y1: 74, x2: 130, y2: 76, px: 2, steps: 0.5 }
)

/** A distance that isn't a step on the spacing scale says so. */
export const OffScale: Story = story(
  [
    { x: 40, y: 40, w: 80, h: 70 },
    { x: 133, y: 40, w: 80, h: 70 }
  ],
  { x1: 120, y1: 75, x2: 133, y2: 75, px: 13 }
)
