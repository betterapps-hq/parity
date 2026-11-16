import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { FaceStack, type Presence } from "./presence-parts.tsx"
import { CanvasBoard, DashboardDesign, members, presences, Themes } from "./story-kit.tsx"

/**
 * Who's here, on the canvas's top-right edge: up to four faces, then a count of the rest. A face is a picture or
 * initials on the person's own gradient, so it matches their pointer. Someone away is faded and moves to the end; the
 * person you're following gets a ring in their color and moves to the front. Click a face, or focus it and press Enter,
 * for their card.
 */
const meta = {
  title: "Parity/Multiplayer/Avatar stack",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya, claude, codex, sam, lena, theo } = presences

/** A labelled stack, pinned to the right as it is on the canvas. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

const away: Presence = { ...priya, away: "8 min" }

/** Each state of the stack: a few people, a crowd counted, someone away, following someone, pictures and initials. */
export const States: Story = {
  render: () => (
    <Themes width={480} height={350}>
      {() => (
        <div className="flex flex-col py-1">
          <Row label="Two people: a picture and initials">
            <FaceStack here={[mia, jonas]} />
          </Row>
          <Row label="Four, two of them agents">
            <FaceStack here={[mia, jonas, claude, codex]} />
          </Row>
          <Row label="Eight: four faces, then the rest">
            <FaceStack here={[mia, jonas, priya, claude, codex, sam, theo, lena]} />
          </Row>
          <Row label="Priya away, faded and last">
            <FaceStack here={[away, mia, jonas]} />
          </Row>
          <Row label="Following Jonas, ringed and first">
            <FaceStack here={[mia, jonas, priya]} following={members.jonas} />
          </Row>
        </div>
      )}
    </Themes>
  )
}

/** The stack where it lives, on the canvas's top-right edge, over the boards. */
export const OnTheCanvas: Story = {
  render: () => (
    <Themes width={560} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={40} y={40}>
            <DashboardDesign />
          </CanvasBoard>
          <div className="absolute top-3 right-3">
            <FaceStack here={[mia, jonas, { ...priya, away: "3 min" }, claude, codex, sam]} />
          </div>
        </>
      )}
    </Themes>
  )
}

/** On a narrow window, the stack keeps its corner and its four faces, and the boards pass under it. */
export const Narrow: Story = {
  render: () => (
    <Themes width={340} height={300}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={20} y={28}>
            <DashboardDesign />
          </CanvasBoard>
          <div className="absolute top-2 right-2">
            <FaceStack here={[mia, jonas, priya, claude, codex, sam]} size={24} />
          </div>
        </>
      )}
    </Themes>
  )
}
