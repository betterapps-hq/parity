import { FaceStack, type Presence } from "@parity-app/presence-ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { scrolls } from "../stories/canvas-kit.tsx"
import { CanvasBoard } from "../stories/CanvasBoard.tsx"
import { CanvasPane } from "../stories/CanvasPane.tsx"
import { DashboardDesign } from "../stories/DashboardDesign.tsx"
import { Themes } from "../stories/Themes.tsx"
import { useResolvedTheme } from "../theme.ts"
import { members, presences, TopRight } from "./story-kit.tsx"

/**
 * Who's here, on a bar of its own just left of the canvas's zoom, at its height, built as the toolbar and zoom are
 * (PAR-1293). Everyone is in one stack, your own face first. Faces are round for everyone: a person's picture or
 * initials on their soft gradient, an agent's sparkle on its vivid one. They overlap, and spread apart under the
 * pointer so each is easy to hit; a face rises as you point at it and says who it is. Whoever you follow comes next,
 * ringed in their color; each person's agents come just after them; anyone away is faded and last. Past four others, a
 * count opens everyone, people and agents apart. Your face opens your card, where you can present.
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

/** A labelled stack, pinned to the right. */
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
          <Row label="You, then two people: a picture and initials">
            <FaceStack here={[mia, jonas]} you={you} />
          </Row>
          <Row label="Agents beside whoever runs them">
            <FaceStack here={[mia, jonas, claude, codex]} you={you} />
          </Row>
          <Row label="Eight others: three faces, then the rest">
            <FaceStack here={[mia, jonas, priya, claude, codex, sam, theo, lena]} you={you} />
          </Row>
          <Row label="Priya away, faded and last">
            <FaceStack here={[away, mia, jonas]} you={you} />
          </Row>
          <Row label="Following Jonas, ringed and just after you">
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

/** Two of you on the canvas: one stack, beside zoom. */
export const TwoOnTheCanvas: Story = {
  render: () => (
    <Themes width={560} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={40} y={48}>
            <DashboardDesign />
          </CanvasBoard>
          <TopRight>
            <FaceStack here={[mia]} you={you} />
          </TopRight>
        </>
      )}
    </Themes>
  ),
  play: async ({ canvasElement }) => {
    for (const list of within(canvasElement).getAllByRole("list", { name: "People here" })) {
      const faces = within(list).getAllByRole("button")
      await expect(faces).toHaveLength(2)
      await expect(faces[0]).toHaveAccessibleName("You")
      await expect(faces[1]).toHaveAccessibleName(/^Mia Rossi/)

      const stack = list.parentElement?.getBoundingClientRect()
      const zoom = list.parentElement?.nextElementSibling?.getBoundingClientRect()
      await expect(stack?.top).toBe(zoom?.top)
      await expect(stack?.height).toBe(zoom?.height)
      await expect((stack?.right ?? Infinity) < (zoom?.left ?? -Infinity)).toBe(true)
    }
  }
}

/** Six others on the canvas: you, three of them, then a count of the rest, beside zoom. */
export const OnTheCanvas: Story = {
  render: () => (
    <Themes width={560} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={40} y={48}>
            <DashboardDesign />
          </CanvasBoard>
          <TopRight>
            <FaceStack here={[mia, jonas, { ...priya, away: "3 min" }, claude, codex, sam]} you={you} />
          </TopRight>
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
        <TopRight>
          <FaceStack here={here} you={you} />
        </TopRight>
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
