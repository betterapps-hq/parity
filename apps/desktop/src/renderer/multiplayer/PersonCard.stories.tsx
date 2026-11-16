import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { CanvasBoard, CanvasPane, DashboardDesign, Themes, scrolls } from "../stories/canvas-kit.tsx"
import { useResolvedTheme } from "../theme.ts"
import { FaceStack } from "./FaceStack.tsx"
import type { Presence } from "./member.ts"
import { PersonCard } from "./PersonCard.tsx"
import { members, presences } from "./story-kit.tsx"

/**
 * Someone's card, opened from their face in the avatar stack: their name, where they are and what they're looking at,
 * and buttons to follow them or go to where they are. It opens with Enter or Space from a focused face, takes focus,
 * and closes with Escape back to the face. On a narrow window the cards keep their width and stack; try the toolbar's
 * viewport menu.
 */
const meta = {
  title: "Parity/Multiplayer/Person card",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya, claude } = presences

/** A card as its popover draws it, out of its popover so several can sit side by side. */
function Card({ presence, following }: { presence: Presence; following?: boolean }) {
  return (
    <div className="w-72 rounded-lg bg-popover p-3 text-sm shadow-md ring-1 ring-foreground/10">
      <PersonCard presence={presence} following={following} />
    </div>
  )
}

const cards = (
  <>
    <Card presence={mia} />
    <Card presence={jonas} following />
    <Card presence={{ ...priya, away: "12 min" }} />
    <Card presence={claude} />
  </>
)

/** Someone viewing, someone you're following, someone away (who can't be followed), and an agent at work. */
export const Cards: Story = {
  render: () => (
    <Themes width={640} height={270}>
      {() => <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4 p-4">{cards}</div>}
    </Themes>
  )
}

/** The card from a face, as it opens: Mia's face is focused and Enter opens the card. Follows the toolbar's theme. */
function FromAFaceStory() {
  const theme = useResolvedTheme()

  return (
    <div className="min-h-screen bg-background p-6">
      <CanvasPane theme={theme} width={620} height={380}>
        <CanvasBoard name="Dashboard" x={40} y={44}>
          <DashboardDesign />
        </CanvasBoard>
        <div className="absolute top-3 right-3">
          <FaceStack here={[mia, jonas, priya, claude]} following={members.jonas} />
        </div>
      </CanvasPane>
    </div>
  )
}

export const FromAFace: Story = {
  render: () => <FromAFaceStory />,
  play: async ({ canvasElement }) => {
    const face = within(canvasElement).getByRole("button", { name: /^Mia Rossi/ })
    face.focus()
    await userEvent.keyboard("{Enter}")
    const card = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(card.getByRole("button", { name: "Follow" })).toBeVisible())
  }
}
