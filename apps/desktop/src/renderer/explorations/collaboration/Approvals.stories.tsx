import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { me, people } from "../explore-data.ts"
import { type CommentData, proposalThread, type ThreadData } from "./collab-data.ts"
import { Thread } from "./comments.tsx"
import { CommentPin } from "./pins.tsx"
import { Stage } from "./stage.tsx"

/**
 * Approving a proposed change in a thread. An agent, or anyone set to propose changes, says what it will do, and an
 * editor approves or declines it with a click instead of replying "go ahead". Approving sets it to work; declining
 * tells it, with why when you say.
 */
const meta = {
  title: "Parity/Explorations/Collaboration/Approvals",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** What the agent says once it has an answer: done after approving, understood after declining. */
function followUp(proposing: CommentData): CommentData {
  const approved = proposing.proposal!.status === "approved"
  return {
    id: `${proposing.id}-reply`,
    author: proposing.author,
    when: "Just now",
    text: approved
      ? "Done. Toggle above is a new state on Pricing: the {Billing toggle} sits above the {Plan cards} as a segmented control."
      : proposing.proposal!.reason
        ? "Understood. I'll leave the toggle where it is, and won't try this again unless someone asks."
        : "Okay, I'll leave the toggle where it is."
  }
}

/**
 * Plays the agent's side: once the proposal is decided it answers, after working for a few seconds when approved. In
 * Parity the agent does this itself, through the MCP server.
 */
function useAgent(thread: ThreadData, setThread: (change: (current: ThreadData) => ThreadData) => void) {
  const proposing = thread.comments.find((comment) => comment.proposal && comment.proposal.status !== "waiting")
  const answered = !!proposing && thread.comments.some((comment) => comment.id === `${proposing.id}-reply`)
  useEffect(() => {
    if (!proposing || answered) return undefined
    const timer = window.setTimeout(
      () =>
        setThread((current) => ({
          ...current,
          working: undefined,
          comments: [...current.comments, followUp(proposing)]
        })),
      proposing.proposal!.status === "approved" ? 3500 : 900
    )
    return () => window.clearTimeout(timer)
  }, [proposing, answered, setThread])
}

function Live({ initial, canApprove = true }: { initial: ThreadData; canApprove?: boolean }) {
  const [thread, setThread] = useState(initial)
  useAgent(thread, setThread)
  const waiting = thread.comments.some((comment) => comment.proposal?.status === "waiting")
  return (
    <Stage className="flex items-start gap-4">
      <div className="pt-1">
        <CommentPin
          people={[people.maya, people.claude]}
          replies={thread.comments.length - 1}
          state={waiting ? "waiting" : thread.working ? "working" : "selected"}
        />
      </div>
      <Thread thread={thread} onChange={setThread} canApprove={canApprove} onClose={() => {}} />
    </Stage>
  )
}

/**
 * Claude Code proposes what it would do about Maya's question. Approve, and it gets to work, then says when it's done;
 * Decline, and say why if you like, and it leaves things as they are. The pin is amber while it waits.
 */
export const WaitingForApproval: Story = { render: () => <Live initial={proposalThread} /> }

/** Approving: the proposal folds to who approved it, and the agent's at work under the thread until it reports back. */
export const Approving: Story = {
  render: () => <Live initial={proposalThread} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Approve" }))
    await expect(within(canvasElement).getByText(/approved this/)).toBeInTheDocument()
  }
}

/** Declining asks why, optionally; the agent sees the reason, and the proposal folds to who declined it and why. */
export const Declining: Story = {
  render: () => <Live initial={proposalThread} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Decline" }))
    await expect(within(canvasElement).getByRole("textbox", { name: /Why, for Claude Code/ })).toBeInTheDocument()
  }
}

const decided = (status: "approved" | "declined", reason?: string): ThreadData => {
  const [question, proposing] = proposalThread.comments
  const answered = {
    ...proposing!,
    proposal: { ...proposing!.proposal!, status, by: me, when: "4 min ago", reason }
  }
  return { ...proposalThread, comments: [question!, answered, { ...followUp(answered), when: "2 min ago" }] }
}

/** After each: approved and done, and declined with a reason. */
export const Decided: Story = {
  render: () => (
    <Stage className="flex flex-wrap items-start gap-8">
      <Thread thread={decided("approved")} onClose={() => {}} />
      <Thread
        thread={decided("declined", "The toggle needs to stay next to the prices, or people miss it.")}
        onClose={() => {}}
      />
    </Stage>
  )
}

/** Someone who can only comment sees the proposal, but not Approve or Decline: it waits for an editor. */
export const CanOnlyComment: Story = { render: () => <Live initial={proposalThread} canApprove={false} /> }
