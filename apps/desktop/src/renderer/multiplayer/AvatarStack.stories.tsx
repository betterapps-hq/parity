import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { scrolls } from "../stories/canvas-kit.tsx"
import { CanvasBoard } from "../stories/CanvasBoard.tsx"
import { CanvasPane } from "../stories/CanvasPane.tsx"
import { DashboardDesign } from "../stories/DashboardDesign.tsx"
import { Themes } from "../stories/Themes.tsx"
import { useResolvedTheme } from "../theme.ts"
import { FaceStack } from "./FaceStack.tsx"
import type { Presence } from "./member.ts"
import { members, presences } from "./story-kit.tsx"

/**
 * Who's here, on a bar of its own at the canvas's top-right, built as the toolbar and zoom are. Faces are round for
 * everyone: a person's picture or initials on their soft gradient, an agent's sparkle on its vivid one. They overlap,
 * and spread apart under the pointer so each is easy to hit; a face rises as you point at it and says who it is.
 * Whoever you follow comes first, ringed in their color; each person's agents come just after them; anyone away is
 * faded and last. Past four, a count opens everyone, people and agents apart. Your own face ends the bar, past an
 * etched line, and opens your card, where you can present.
 */
const meta = {
  title: "Parity/Multiplayer/Avatar stack",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya, claude, codex, sam, lena, theo } = presences
const { you } = members

/** A labelled stack, pinned to the right as it is on the canvas. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-border/60 px-4 py-3 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

const away: Presence = { ...priya, away: "8 min" }

/** Each state of the bar: a few here, agents beside the people running them, a crowd counted, away, following. */
export const States: Story = {
  render: () => (
    <Themes width={520} height={420}>
      {() => (
        <div className="flex flex-col py-1">
          <Row label="Two people, a picture and initials">
            <FaceStack here={[mia, jonas]} you={you} />
          </Row>
          <Row label="Agents beside whoever runs them">
            <FaceStack here={[mia, jonas, claude, codex]} you={you} />
          </Row>
          <Row label="Eight: three faces, then the rest">
            <FaceStack here={[mia, jonas, priya, claude, codex, sam, theo, lena]} you={you} />
          </Row>
          <Row label="Priya away, faded and last">
            <FaceStack here={[away, mia, jonas]} you={you} />
          </Row>
          <Row label="Following Jonas, ringed and first">
            <FaceStack here={[mia, jonas, priya]} following={members.jonas} you={you} />
          </Row>
          <Row label="Just you">
            <FaceStack here={[]} you={you} />
          </Row>
        </div>
      )}
    </Themes>
  )
}

/** The bar where it lives, on the canvas's top-right, over the boards. */
export const OnTheCanvas: Story = {
  render: () => (
    <Themes width={560} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={40} y={48}>
            <DashboardDesign />
          </CanvasBoard>
          <div className="absolute top-3 right-3">
            <FaceStack here={[mia, jonas, { ...priya, away: "3 min" }, claude, codex, sam]} you={you} />
          </div>
        </>
      )}
    </Themes>
  )
}

/** A canvas with the bar on it, for the stories that point at it. Follows the toolbar's theme. */
function Pointed({ here }: { here: Presence[] }) {
  const theme = useResolvedTheme()

  return (
    <div className="min-h-screen bg-background p-6">
      <CanvasPane theme={theme} width={620} height={420}>
        <CanvasBoard name="Dashboard" x={40} y={48}>
          <DashboardDesign />
        </CanvasBoard>
        <div className="absolute top-3 right-3">
          <FaceStack here={here} you={you} />
        </div>
      </CanvasPane>
    </div>
  )
}

/** Pointing at Jonas: the faces spread apart, Jonas's rises, and a tooltip names him. */
export const PointingAtAFace: Story = {
  render: () => <Pointed here={[mia, jonas, claude, codex]} />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("button", { name: /^Jonas Weber/ }))
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByText("Jonas Weber", { selector: "span" })).toBeVisible())
  }
}

/** The count opened: everyone here, people and then agents, each with whose it is, and Follow on hover. */
export const Everyone: Story = {
  render: () => <Pointed here={[mia, jonas, priya, claude, codex, sam, theo, lena]} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /more, of 8 here/ }))
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByText("8 here")).toBeVisible())
  }
}

/** Your own face opened: you as everyone sees you, Present to everyone, and whether to show their pointers. */
export const YourCard: Story = {
  render: () => <Pointed here={[mia, jonas, claude]} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "You" }))
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByRole("button", { name: /Present to everyone/ })).toBeVisible())
  }
}
