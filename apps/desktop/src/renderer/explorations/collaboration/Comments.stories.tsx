import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { me, people } from "../explore-data.ts"
import { type CommentData, thread, threads } from "./collab-data.ts"
import { Comment, CommentsPanel, Composer, MentionMenu, Thread } from "./comments.tsx"
import { Stage } from "./stage.tsx"

/**
 * Comments, broken into their parts: one comment, the composer, the mention menu, a thread in each of its states, and
 * the list of every thread in a project. Pins, which mark where a thread is on the canvas, have their own stories.
 */
const meta = {
  title: "Parity/Explorations/Collaboration/Comments",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-white/45">{label}</span>
      {children}
    </div>
  )
}

const examples: { label: string; comment: CommentData }[] = [
  {
    label: "Plain",
    comment: { id: "a", author: people.jonas, when: "2 min ago", text: "+1, and keep the savings badge." }
  },
  {
    label: "Mentions you, links a layer, has reactions",
    comment: thread("toggle").comments[0]!
  },
  { label: "From an agent", comment: thread("toggle").comments[1]! },
  { label: "With a snapshot of the frame", comment: thread("wrap").comments[0]! },
  {
    label: "Yours, edited",
    comment: { id: "b", author: me, when: "Just now", text: "Moved the toggle above the cards.", edited: true }
  }
]

/** A comment in each of its forms. Hover one for react and more. */
export const SingleComment: Story = {
  render: () => (
    <Stage>
      <div className="flex w-[22rem] flex-col gap-5">
        {examples.map(({ label, comment }) => (
          <Labeled key={label} label={label}>
            <div className="rounded-xl border bg-popover p-1.5">
              <Comment comment={comment} />
            </div>
          </Labeled>
        ))}
      </div>
    </Stage>
  )
}

/** The composer, empty and with text. Type @ to mention someone; the camera attaches a snapshot of the frame. */
export const ComposerStates: Story = {
  render: () => (
    <Stage>
      <div className="flex w-[22rem] flex-col gap-8">
        <Labeled label="Empty">
          <Composer />
        </Labeled>
        <Labeled label="Typing a mention">
          <div className="pt-[23rem]">
            <Composer initial="Can we ask @" />
          </div>
        </Labeled>
      </div>
    </Stage>
  )
}

/**
 * Who you can mention: people in the project, someone who can't see it yet (mentioning offers to let them comment),
 * and agents, which pick up the thread and start work on what it asks.
 */
export const Mentions: Story = {
  render: () => (
    <Stage>
      <div className="flex gap-8">
        <Labeled label="Everyone">
          <MentionMenu />
        </Labeled>
        <Labeled label="After typing @c">
          <MentionMenu query="c" />
        </Labeled>
        <Labeled label="No match">
          <MentionMenu query="Alex" />
        </Labeled>
      </div>
    </Stage>
  )
}

/** A thread as it opens beside its pin. Try resolving it, reacting, or replying. */
export const OpenThread: Story = {
  render: () => (
    <Stage>
      <Thread thread={thread("toggle")} onClose={() => {}} />
    </Stage>
  )
}

/** You mentioned an agent: it says what it's doing under the thread, and Show me brings its cursor into view. */
export const AgentWorking: Story = {
  render: () => (
    <Stage>
      <Thread thread={thread("wrap")} onClose={() => {}} />
    </Stage>
  )
}

/** Resolved: who and when, Reopen, and no reply box. Resolved pins hide from the canvas unless you ask for them. */
export const Resolved: Story = {
  render: () => (
    <Stage>
      <Thread thread={thread("coupon")} onClose={() => {}} />
    </Stage>
  )
}

/** Starting a thread: where it'll be, and the composer. */
export const NewComment: Story = {
  render: () => (
    <Stage>
      <div className="pt-[22rem]">
        <Thread
          thread={{ id: "new", design: "Pricing", layer: "Plan cards", frame: "Desktop, Dark", comments: [] }}
          onClose={() => {}}
        />
      </div>
    </Stage>
  )
}

/** A long thread folds its middle, keeping the first comment and the last two. */
export const LongThread: Story = {
  render: () => {
    const long = thread("toggle")
    return (
      <Stage>
        <Thread
          thread={{
            ...long,
            comments: [
              ...long.comments,
              { id: "toggle-4", author: people.maya, when: "1 min ago", text: "Agreed on the badge." },
              {
                id: "toggle-5",
                author: me,
                when: "Just now",
                text: "@Claude Code go ahead, as a new state called Toggle above."
              }
            ]
          }}
          onClose={() => {}}
        />
      </Stage>
    )
  }
}

/** Every thread in the project, beside the inspector: open, for you, or resolved, grouped by design. */
export const Panel: Story = {
  render: () => (
    <div className="flex h-screen justify-end bg-[#0c0c0f]">
      <CommentsPanel threads={threads} selected="toggle" />
    </div>
  )
}
