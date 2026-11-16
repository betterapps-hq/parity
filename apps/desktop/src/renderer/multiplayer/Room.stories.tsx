import type { Meta, StoryObj } from "@storybook/react-vite"
import { FaceStack } from "./FaceStack.tsx"
import { Marquee } from "./Marquee.tsx"
import { Outlined } from "./Outlined.tsx"
import { RemotePointer } from "./RemotePointer.tsx"
import {
  CanvasBoard,
  DashboardDesign,
  type Marker,
  members,
  presences,
  PricingDesign,
  Themes,
  scrolls
} from "./story-kit.tsx"

/**
 * One room, all together, to judge the system as a whole: three people and two agents on the canvas. Mia has a stat
 * card selected, Jonas is typing on Pricing, and Priya is dragging out a marquee. Claude Code is changing the heading
 * and Codex is reading Pricing. Everyone is in the stack, top-right.
 */
const meta = {
  title: "Parity/Multiplayer/Room",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya, claude, codex } = members

const mark: Marker = (id, element) => {
  if (id === "stat-revenue") {
    return <Outlined by={[mia]}>{element}</Outlined>
  }

  if (id === "heading") {
    return <Outlined by={[claude]}>{element}</Outlined>
  }

  return element
}

const here = [presences.mia, presences.jonas, presences.priya, presences.claude, presences.codex]

const pricing = { x: 400, y: 70 }
const marquee = { x: 360, y: 322 }

function Room() {
  return (
    <>
      <CanvasBoard name="Dashboard" x={40} y={56}>
        <DashboardDesign mark={mark} />
      </CanvasBoard>
      <CanvasBoard name="Pricing" x={pricing.x} y={pricing.y}>
        <Outlined by={[codex]} radius={3} tagAt="end">
          <PricingDesign />
        </Outlined>
      </CanvasBoard>
      <RemotePointer member={mia} at={{ x: 112, y: 150 }} />
      <RemotePointer member={claude} at={{ x: 150, y: 84 }} kind="write" detail="Tighten spacing" />
      <RemotePointer member={jonas} at={{ x: pricing.x + 150, y: pricing.y + 70 }} detail="Typing…" />
      <RemotePointer member={codex} at={{ x: pricing.x + 60, y: pricing.y + 150 }} kind="read" detail="Check plans" />
      <Marquee member={priya} rect={{ x: marquee.x - 160, y: marquee.y - 60, w: 160, h: 60 }} />
      <RemotePointer member={priya} at={marquee} />
      <div className="absolute top-3 right-3">
        <FaceStack here={here} />
      </div>
    </>
  )
}

export const AllTogether: Story = {
  render: () => (
    <Themes width={680} height={400}>
      {() => <Room />}
    </Themes>
  )
}
