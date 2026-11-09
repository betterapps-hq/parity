import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { FramePreview, FrameSection } from "./controls.tsx"
import { Playground } from "./playground.tsx"

/**
 * A design's frame, typed (PAR-186): its width and height in the viewport shown, in pixels or rem. There's no size
 * preset: the viewport already says which size it is. Height unset hugs the design. Dragging the frame's edges sets it too. It's the design's own setting, not
 * a style, so it writes no CSS.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Frame size",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Frame({ width, height }: { width: number; height?: number }) {
  const [frame, setFrame] = useState({ width, height })
  const stored = {
    viewport: "Desktop",
    width: { value: `${frame.width}px` },
    height: frame.height === undefined ? { mode: "hug" } : { value: `${frame.height}px` }
  }
  return (
    <Playground
      writes={{ stored, css: [], tailwind: [] }}
      preview={<FramePreview width={frame.width} height={frame.height} />}
    >
      <FrameSection frame={frame} onChange={setFrame} />
    </Playground>
  )
}

/** 1280 wide, hugging the design's height. */
export const Desktop: Story = { render: () => <Frame width={1280} /> }

/** A width and height of its own, 1100 by 720. */
export const Custom: Story = { render: () => <Frame width={1100} height={720} /> }
