import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Member } from "./member.ts"
import { Outlined } from "./Outlined.tsx"
import { RemotePointer } from "./RemotePointer.tsx"
import { CanvasBoard, DashboardDesign, type Marker, members, Themes, scrolls } from "./story-kit.tsx"

/**
 * Other people's selections: the layer outlined in their color, with their name on a tag at its top-left corner. When
 * several people have the same layer, each gets a ring, the first nearest, and their tags line up. An agent's tag has
 * a sparkle. Each ring has a hairline of its palette's ink outside it, so light colors hold an edge on a white design.
 */
const meta = {
  title: "Parity/Multiplayer/Selections",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya, claude } = members

const selected = new Map<string, Member[]>([
  ["heading", [claude]],
  ["stat-revenue", [mia]],
  ["chart", [jonas, priya]],
  ["table", [mia, jonas, priya]]
])

const mark: Marker = (id, element) => {
  const by = selected.get(id)

  return by ? <Outlined by={by}>{element}</Outlined> : element
}

/** Mia on a stat card, Jonas and Priya both on the chart, all three on the table, and Claude Code on the heading. */
export const OnADesign: Story = {
  render: () => (
    <Themes width={520} height={420}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={60} y={52}>
            <DashboardDesign mark={mark} />
          </CanvasBoard>
          <RemotePointer member={mia} at={{ x: 28, y: 196 }} />
          <RemotePointer member={jonas} at={{ x: 372, y: 228 }} />
          <RemotePointer member={claude} at={{ x: 190, y: 86 }} kind="write" detail="Tighten spacing" />
        </>
      )}
    </Themes>
  )
}
