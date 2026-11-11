import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { framePx, FramePreview, FrameSection, type FrameWidth } from "./controls.tsx"
import { isFixedSize } from "./data.ts"
import { useTokens } from "./field-parts.tsx"
import { Playground } from "./playground.tsx"

/**
 * A design's frame, typed (PAR-186): its width and height in the viewport shown, which the section's header names
 * with its icon. W takes pixels or one of the project's breakpoints (`xl`, 1280), with the nearest one offered for a
 * width of its own. H takes pixels or Hug, the design's own height, as a chip with what it comes to; its chevron opens Sizing,
 * Fixed or Hug. Dragging the frame's edges sets it too. It's the design's own setting, not a style, so it writes no
 * CSS.
 */
const meta = {
  title: "Parity/Inspector/Controls/Controls/Frame size",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Frame({ width, height }: { width: FrameWidth; height?: number }) {
  const [frame, setFrame] = useState({ width, height })
  const [hugged, setHugged] = useState<number>()
  const breakpoints = useTokens("breakpoint").tokens

  const stored = {
    viewport: "Desktop",
    width: isFixedSize(frame.width) ? { value: `${frame.width}px` } : { token: frame.width.token },
    height: frame.height === undefined ? { mode: "hug" } : { value: `${frame.height}px` }
  }

  return (
    <Playground
      writes={{ stored, css: [], tailwind: [] }}
      preview={<FramePreview width={framePx(frame.width, breakpoints)} height={frame.height} onHug={setHugged} />}
    >
      <FrameSection frame={frame} hugged={hugged} onChange={setFrame} />
    </Playground>
  )
}

/** At the xl breakpoint, 1280 wide, hugging the design's height. */
export const Desktop: Story = { render: () => <Frame width={{ token: "breakpoint-xl" }} /> }

/** A width and height of its own, 1100 by 720. */
export const Custom: Story = { render: () => <Frame width={1100} height={720} /> }
