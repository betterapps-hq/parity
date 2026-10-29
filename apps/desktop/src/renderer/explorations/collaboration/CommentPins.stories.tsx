import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { me, people } from "../explore-data.ts"
import { MiniScreen } from "../parts.tsx"
import { thread } from "./collab-data.ts"
import { commentBlue, Thread } from "./comments.tsx"
import {
  AreaComment,
  CommentCursor,
  CommentModeBar,
  CommentPin,
  LayerOutline,
  PinCluster,
  PinPreview,
  PlacedPin
} from "./pins.tsx"
import { Board, type Marker, PricingDesign, Stage } from "./stage.tsx"

/**
 * Pins mark where a thread is on the canvas, the way Figma and Velt do: on a point, on a layer (the pin follows the
 * layer through every mode and state), or on an area. The thread itself is in the Comments stories.
 */
const meta = {
  title: "Parity/Explorations/Collaboration/Comment pins",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const states: { label: string; note: string; pin: ReactNode }[] = [
  { label: "New", note: "One person, no replies", pin: <CommentPin people={[people.maya]} /> },
  { label: "Unread", note: "Something you haven't seen", pin: <CommentPin people={[people.maya]} state="unread" /> },
  {
    label: "With replies",
    note: "Up to three people, then the count",
    pin: <CommentPin people={[people.maya, people.claude, people.jonas]} replies={2} />
  },
  {
    label: "Open",
    note: "Its thread is showing",
    pin: <CommentPin people={[people.maya, people.claude, people.jonas]} replies={2} state="selected" />
  },
  {
    label: "Agent working",
    note: "Glows in the agent's color",
    pin: <CommentPin people={[people.priya, me, people.claude]} replies={1} state="working" />
  },
  { label: "Resolved", note: "Hidden unless you show resolved", pin: <CommentPin people={[]} state="resolved" /> },
  { label: "Placing", note: "Yours, before you've written it", pin: <CommentPin people={[]} state="draft" /> },
  {
    label: "Merged",
    note: "Zoomed out, nearby pins combine",
    pin: <PinCluster count={4} people={[people.maya, people.priya]} unread />
  }
]

/** Every state a pin can be in. */
export const PinStates: Story = {
  render: () => (
    <Stage>
      <div className="grid w-fit grid-cols-4 gap-4">
        {states.map(({ label, note, pin }) => (
          <div key={label} className="flex w-44 flex-col gap-4 rounded-xl border border-white/10 p-4">
            <div className="flex h-10 items-end">{pin}</div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{note}</span>
            </div>
          </div>
        ))}
      </div>
    </Stage>
  )
}

/** Hovering a pin: the first comment and who's in the thread, without opening it. */
export const HoverPreview: Story = {
  render: () => (
    <Stage>
      <div className="flex items-start gap-2 pt-16">
        <CommentPin people={[people.maya, people.claude, people.jonas]} replies={2} state="unread" />
        <div className="-mt-10">
          <PinPreview thread={thread("toggle")} />
        </div>
      </div>
    </Stage>
  )
}

/** Pins a layer's thread at its top-right corner, and outlines it while the thread is open. */
function pinned(name: string, element: ReactNode, pin: ReactNode, outlined: boolean) {
  const placed = <span className="absolute top-0 left-full z-10 -translate-y-full pl-0.5">{pin}</span>
  return outlined ? (
    <LayerOutline name={name}>
      {element}
      {placed}
    </LayerOutline>
  ) : (
    <div className="relative w-fit">
      {element}
      {placed}
    </div>
  )
}

const marked: Marker = (id, element) => {
  if (id === "toggle")
    return pinned(
      "Billing toggle",
      element,
      <CommentPin people={[people.maya, people.claude, people.jonas]} replies={2} state="selected" />,
      true
    )
  if (id === "plan-team-name")
    return pinned(
      "Plan name",
      element,
      <CommentPin people={[people.priya, me, people.claude]} replies={1} state="working" />,
      false
    )
  if (id === "signin") return pinned("Sign in", element, <CommentPin people={[people.lena]} state="unread" />, false)
  return element
}

/**
 * On a board: a layer's thread open beside its pin with the layer outlined, an agent at work on another, an unread one
 * on Sign in, and an area comment across the plans' features.
 */
export const OnABoard: Story = {
  render: () => (
    <Stage>
      <Board name="Pricing" frame="Desktop, Dark">
        <PricingDesign mark={marked} />
        <AreaComment x={28} y={318} width={664} height={66}>
          <CommentPin people={[people.sam]} state="unread" />
        </AreaComment>
        <div className="absolute top-[52px] left-[560px] z-20">
          <Thread thread={thread("toggle")} onClose={() => {}} />
        </div>
      </Board>
    </Stage>
  )
}

/** Comment mode: the bar along the top, the layer under the cursor outlined, and where a click would pin. */
export const PlacingAComment: Story = {
  render: () => (
    <Stage className="flex flex-col items-center gap-8">
      <CommentModeBar />
      <Board name="Pricing" frame="Desktop, Dark">
        <PricingDesign
          mark={(id, element) =>
            id === "plan-team" ? (
              <div className="relative h-full">
                {element}
                <span
                  className="pointer-events-none absolute -inset-1 rounded-[14px] border-[1.5px] border-dashed"
                  style={{ borderColor: commentBlue }}
                />
                <span
                  className="absolute -top-6 -left-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                  style={{ background: commentBlue }}
                >
                  Plan card
                </span>
                <div className="absolute top-[46%] left-[52%] z-10 -translate-y-full">
                  <CommentCursor hint="Click to comment on Plan card" />
                </div>
              </div>
            ) : (
              element
            )
          }
        />
      </Board>
    </Stage>
  )
}

function SmallBoard({
  name,
  kind,
  hue,
  children
}: {
  name: string
  kind: "marketing" | "dashboard" | "docs" | "marketplace"
  hue: number
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-white/50">{name}</span>
      <div className="relative h-[150px] w-[240px] rounded-md ring-1 ring-white/10">
        <div className="absolute inset-0 overflow-hidden rounded-md">
          <MiniScreen kind={kind} hue={hue} />
        </div>
        {children}
      </div>
    </div>
  )
}

/** Zoomed out to the whole board: nearby pins merge into one with a count, so a busy design stays readable. */
export const ZoomedOut: Story = {
  render: () => (
    <Stage>
      <div className="grid w-fit grid-cols-3 gap-x-10 gap-y-12">
        <SmallBoard name="Pricing" kind="marketing" hue={162}>
          <PlacedPin x={150} y={40}>
            <PinCluster count={4} people={[people.maya, people.priya]} unread />
          </PlacedPin>
        </SmallBoard>
        <SmallBoard name="Checkout" kind="marketplace" hue={30}>
          <PlacedPin x={170} y={100}>
            <CommentPin people={[people.lena]} />
          </PlacedPin>
        </SmallBoard>
        <SmallBoard name="Dashboard" kind="dashboard" hue={250}>
          <PlacedPin x={60} y={70}>
            <PinCluster count={2} people={[people.sam, people.claude]} />
          </PlacedPin>
          <PlacedPin x={200} y={30}>
            <CommentPin people={[people.priya, people.claude]} state="working" />
          </PlacedPin>
        </SmallBoard>
        <SmallBoard name="Docs" kind="docs" hue={290} />
        <SmallBoard name="Pricing, mobile" kind="marketing" hue={162}>
          <PlacedPin x={110} y={60}>
            <CommentPin people={[people.priya, me]} replies={1} />
          </PlacedPin>
        </SmallBoard>
      </div>
    </Stage>
  )
}
