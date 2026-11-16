import type { Meta, StoryObj } from "@storybook/react-vite"
import { FaceStack, Marquee, Outlined, RemotePointer } from "./presence-parts.tsx"
import { CanvasBoard, DashboardDesign, type Marker, members, presences, PricingDesign, Themes } from "./story-kit.tsx"

/**
 * One room, all together, to judge the system as a whole: three people and two agents on the canvas. Mia has a stat
 * card selected, Jonas is typing on Pricing, and Priya is dragging out a marquee. Claude Code is changing the heading
 * and Codex is reading Pricing. Everyone is in the stack, top-right.
 */
const meta = {
  title: "Parity/Multiplayer/Room",
  parameters: { layout: "fullscreen" }
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

function Room({ narrow }: { narrow?: boolean }) {
  const pricing = narrow ? { x: 40, y: 380 } : { x: 400, y: 70 }
  const marquee = narrow ? { x: 300, y: 322 } : { x: 360, y: 322 }

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
        <FaceStack here={here} size={narrow ? 24 : 28} />
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

/** The same room on a narrow window, the Pricing board below the Dashboard. */
export const Narrow: Story = {
  render: () => (
    <Themes width={380} height={600}>
      {() => <Room narrow />}
    </Themes>
  )
}
