import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { Marquee } from "./Marquee.tsx"
import { hairline, type Member } from "./member.ts"
import { RemotePointer } from "./RemotePointer.tsx"
import { CanvasBoard, DashboardDesign, members, Themes, scrolls } from "./story-kit.tsx"

/**
 * Someone dragging out a marquee: the area tinted in their color, edged in it, and their pointer at the corner they're
 * dragging. The layers it touches get a faint outline in their color, so you can see what they're about to select.
 */
const meta = {
  title: "Parity/Multiplayer/Marquee",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { jonas, priya } = members

/** A faint outline on a layer someone's marquee touches. */
function Touched({ member, children }: { member: Member; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span
        className="pointer-events-none absolute -inset-px rounded-[9px]"
        style={{ border: `1px solid ${member.palette.color}`, boxShadow: hairline(member.palette.ink) }}
      />
    </div>
  )
}

/** Jonas drags a marquee across two of the stat cards, while Priya drags one up from below the board. */
export const Dragging: Story = {
  render: () => (
    <Themes width={480} height={330}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={48} y={44}>
            <DashboardDesign
              mark={(id, element) => {
                if (id === "stat-revenue" || id === "stat-users") {
                  return <Touched member={jonas}>{element}</Touched>
                }

                return id === "table" ? <Touched member={priya}>{element}</Touched> : element
              }}
            />
          </CanvasBoard>
          <Marquee member={jonas} rect={{ x: 40, y: 96, w: 180, h: 66 }} />
          <RemotePointer member={jonas} at={{ x: 220, y: 162 }} />
          <Marquee member={priya} rect={{ x: 250, y: 236, w: 170, h: 74 }} />
          <RemotePointer member={priya} at={{ x: 250, y: 236 }} />
        </>
      )}
    </Themes>
  )
}
