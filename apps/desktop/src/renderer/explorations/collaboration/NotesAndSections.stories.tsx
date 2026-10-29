import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { me, people, type ScreenKind } from "../explore-data.ts"
import { MiniScreen } from "../parts.tsx"
import {
  Callout,
  CalloutNumber,
  Leader,
  ReviewRequest,
  reviewStatusOrder,
  Section,
  StickyNote,
  stickyColors,
  TextNote
} from "./notes.tsx"
import { Board, PricingDesign, Stage } from "./stage.tsx"

/**
 * Notes and sections for annotating the canvas. None of it is part of a design, so none of it ships: text notes for
 * labels, sticky notes for discussion, callouts for spec attached to a layer, and sections that group boards and carry
 * a review status.
 */
const meta = {
  title: "Parity/Explorations/Collaboration/Notes and sections",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const stickyText: Record<string, string> = {
  yellow: "Should Team be the default plan?",
  orange: "Copy for the annual savings badge",
  pink: "Try a version without the toggle",
  violet: "Ask legal about the price footnote",
  blue: "Plans come from plans.ts, not the design",
  green: "Approved by marketing on Friday",
  gray: "Parking lot"
}

/** Sticky notes in each color, with their author. */
export const StickyNotes: Story = {
  render: () => (
    <Stage>
      <div className="flex flex-wrap gap-6">
        {stickyColors.map((color, index) => (
          <StickyNote
            key={color}
            color={color}
            author={[people.maya, me, people.jonas, people.priya][index % 4]}
            size={180}
          >
            {stickyText[color]}
          </StickyNote>
        ))}
      </div>
    </Stage>
  )
}

function Explained({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="flex w-72 flex-col gap-5">
      <div className="flex min-h-48 items-start">{children}</div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{note}</span>
      </div>
    </div>
  )
}

/** The three kinds of note, and what each is for. */
export const NoteKinds: Story = {
  render: () => (
    <Stage>
      <div className="flex gap-12">
        <Explained
          title="Text note"
          note="Titles, labels and a flow's explanation, right on the canvas. Parity has these today."
        >
          <TextNote>Checkout flow, from cart to receipt</TextNote>
        </Explained>
        <Explained
          title="Sticky note"
          note="Discussion, ideas and to-dos beside the designs. Each has an author; agents can read them, and add them."
        >
          <StickyNote author={people.maya}>Should Team be the default plan?</StickyNote>
        </Explained>
        <Explained
          title="Callout"
          note="Spec attached to a layer, that moves with it. Pinned properties stay current, and builders and agents read callouts as part of the design."
        >
          <Callout n={1} category="Behavior" layer="Billing toggle" author={me}>
            Annual is the default. Switching updates every price without moving the cards.
          </Callout>
        </Explained>
      </div>
    </Stage>
  )
}

/** Where the design sits in the callouts' box. */
const origin: [number, number] = [300, 64]
const at = (x: number, y: number): [number, number] => [origin[0] + x, origin[1] + y]

const callouts: {
  n: number
  side: "left" | "right"
  top: number
  target: [number, number]
  node: ReactNode
}[] = [
  {
    n: 1,
    side: "left",
    top: 120,
    target: at(254, 180),
    node: (
      <Callout n={1} category="Behavior" layer="Billing toggle" author={me}>
        Annual is the default. Switching updates every price without moving the cards.
      </Callout>
    )
  },
  {
    n: 2,
    side: "left",
    top: 330,
    target: at(32, 330),
    node: (
      <Callout
        n={2}
        category="Layout"
        layer="Plan cards"
        properties={[
          ["Columns", "3, then 1 under 640"],
          ["Gap", "16"],
          ["Padding", "20"]
        ]}
      >
        Cards keep equal heights; the featured one doesn't grow.
      </Callout>
    )
  },
  {
    n: 3,
    side: "right",
    top: 110,
    target: at(553, 248),
    node: (
      <Callout n={3} category="Content" layer="Plan name" author={people.priya}>
        Stays on one line down to 360 px. Below that, use the short name.
      </Callout>
    )
  },
  {
    n: 4,
    side: "right",
    top: 300,
    target: at(557, 274),
    node: (
      <Callout n={4} category="Data" layer="Plan price" properties={[["Source", "plans.scale.price"]]}>
        Per member, for the billing period shown. Annual prices are the monthly price times 0.8.
      </Callout>
    )
  }
]

/** Callouts on a board: each attached to a layer by a leader line, with its number on the layer. */
export const Callouts: Story = {
  render: () => (
    <Stage>
      <div className="relative h-[620px] w-[1300px]">
        <div className="absolute" style={{ left: origin[0], top: 40 }}>
          <Board name="Pricing" frame="Desktop">
            <PricingDesign />
          </Board>
        </div>
        {callouts.map((callout) => (
          <Leader key={callout.n} from={[callout.side === "left" ? 256 : 1044, callout.top + 22]} to={callout.target} />
        ))}
        {callouts.map((callout) => (
          <div
            key={callout.n}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: callout.target[0], top: callout.target[1] }}
          >
            <CalloutNumber n={callout.n} />
          </div>
        ))}
        {callouts.map((callout) => (
          <div
            key={callout.n}
            className="absolute"
            style={{ left: callout.side === "left" ? 0 : 1044, top: callout.top }}
          >
            {callout.node}
          </div>
        ))}
      </div>
    </Stage>
  )
}

/** A section's header in each review status, with its reviewers and whether they've approved. */
export const SectionStatuses: Story = {
  render: () => (
    <Stage className="flex flex-col gap-5">
      {reviewStatusOrder.map((status, index) => (
        <Section
          key={status}
          className="h-28 w-[40rem]"
          title={["Onboarding", "Pricing", "Settings", "Checkout"][index]!}
          hue={[300, 250, 30, 150][index]}
          status={status}
          comments={[0, 3, 5, 0][index]}
          reviewers={
            status === "draft"
              ? undefined
              : [
                  { person: me, approved: status === "approved" },
                  { person: people.jonas, approved: status !== "changes" }
                ]
          }
        />
      ))}
    </Stage>
  )
}

/** Asked to review a section: it arrives in the inbox and on the section, and the decision sets its status. */
export const AskedToReview: Story = {
  render: () => (
    <Stage>
      <ReviewRequest from={people.maya} section="Pricing" designs={4} comments={3}>
        The toggle moved above the cards, and Team is the default now. Good to go?
      </ReviewRequest>
    </Stage>
  )
}

function SmallBoard({ name, kind, hue, phone }: { name: string; kind: ScreenKind; hue: number; phone?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-white/50">{name}</span>
      <div
        className={`relative overflow-hidden rounded-md ring-1 ring-white/10 ${phone ? "h-[200px] w-[100px]" : "h-[150px] w-[240px]"}`}
      >
        <MiniScreen kind={kind} hue={hue} dark={phone} />
      </div>
    </div>
  )
}

/** Sections on the canvas: each groups its boards and notes, with where it is in review. A text note titles the lot. */
export const SectionsOnTheCanvas: Story = {
  render: () => (
    <Stage className="flex flex-col gap-8">
      <TextNote>Q4 launch: pricing and checkout</TextNote>
      <div className="flex flex-wrap items-start gap-8">
        <Section
          title="Pricing"
          status="review"
          comments={3}
          reviewers={[{ person: me }, { person: people.jonas, approved: true }]}
        >
          <div className="flex items-start gap-5">
            <SmallBoard name="Pricing" kind="marketing" hue={162} />
            <SmallBoard name="Pricing, mobile" kind="marketing" hue={162} phone />
            <StickyNote author={people.maya} size={150}>
              Should Team be the default plan?
            </StickyNote>
          </div>
        </Section>
        <Section
          title="Checkout"
          status="approved"
          hue={150}
          reviewers={[
            { person: me, approved: true },
            { person: people.lena, approved: true }
          ]}
        >
          <div className="flex items-start gap-5">
            <SmallBoard name="Cart" kind="marketplace" hue={30} />
            <SmallBoard name="Receipt" kind="docs" hue={30} />
          </div>
        </Section>
      </div>
      <Section title="Onboarding" status="draft" hue={300} className="w-fit">
        <div className="flex items-start gap-5">
          <SmallBoard name="Welcome" kind="collab" hue={300} />
          <SmallBoard name="Invite your team" kind="library" hue={300} />
          <StickyNote color="pink" author={me} size={150}>
            Copy isn't final
          </StickyNote>
        </div>
      </Section>
    </Stage>
  )
}
