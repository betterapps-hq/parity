import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { userEvent, within } from "storybook/test"
import { Button } from "@/components/ui/button"
import { me, people } from "../explore-data.ts"
import { TitleBarActions } from "../start-page-parts.tsx"
import {
  AgentCursor,
  ConnectionBanner,
  Facepile,
  FollowFrame,
  type Here,
  LayerRow,
  PersonCursor,
  PresenceCard,
  SelectionOutline,
  Spotlight
} from "./presence.tsx"
import { Board, type Marker, PricingDesign, Stage } from "./stage.tsx"

/**
 * Who else is here, and what they're doing: avatars in the title bar, cursors and selections on the canvas, following
 * someone, presenting, and what happens when the connection drops. People wear the agents' palettes, so everyone on the
 * canvas reads the same way.
 */
const meta = {
  title: "Parity/Explorations/Collaboration/Presence",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const here: Here[] = [
  { person: people.maya, where: "Pricing, Desktop Dark", doing: "Editing Plan card", kind: "write" },
  { person: people.claude, where: "Pricing, Mobile", doing: "Try shorter plan names at 360", kind: "write" },
  { person: people.jonas, where: "Pricing, Desktop Dark", doing: "Looking at Billing toggle", kind: "read" },
  { person: people.priya, where: "Checkout, Mobile", away: "12 min" }
]

const crowd: Here[] = [
  ...here,
  { person: people.sam, where: "Dashboard, Desktop" },
  { person: people.lena, where: "Checkout, Desktop" },
  { person: people.cursor, where: "Dashboard, Empty", doing: "Add an empty state", kind: "write" }
]

function TitleBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-white/45">{label}</span>
      <div className="flex h-10 w-[34rem] items-center justify-end gap-3 rounded-md border border-white/10 bg-[#0a0a0a] px-3">
        {children}
        <Button size="sm" className="h-7">
          Share
        </Button>
        <TitleBarActions />
      </div>
    </div>
  )
}

/** The title bar's avatars: a few people and an agent, a crowd, and while following someone. Click one to see more. */
export const TitleBarAvatars: Story = {
  render: () => (
    <Stage className="flex flex-col gap-8">
      <TitleBar label="Three people and an agent, one of them away">
        <Facepile here={here} />
      </TitleBar>
      <TitleBar label="Everyone else, counted">
        <Facepile here={crowd} />
      </TitleBar>
      <TitleBar label="Following Maya">
        <Facepile here={here} following={people.maya} />
      </TitleBar>
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("button", { name: /^Maya Chen/ })[0]!)
  }
}

/** What clicking an avatar shows: someone editing, an agent at work, someone looking, and someone away. */
export const PersonCards: Story = {
  render: () => (
    <Stage className="flex flex-wrap items-start gap-4">
      {here.map((entry) => (
        <div key={entry.person.name} className="rounded-xl border bg-popover p-3 shadow-xl">
          <PresenceCard here={entry} />
        </div>
      ))}
    </Stage>
  )
}

const selections: Marker = (id, element) => {
  if (id === "plan-team") return <SelectionOutline people={[people.maya]}>{element}</SelectionOutline>
  if (id === "toggle") return <SelectionOutline people={[people.jonas, people.priya]}>{element}</SelectionOutline>
  if (id === "h1") return <SelectionOutline people={[people.claude]}>{element}</SelectionOutline>
  return element
}

/**
 * Cursors and selections on a board: Maya editing the Team card, Jonas and Priya both on the toggle, and Claude Code
 * working on the heading, its badge saying what it's doing.
 */
export const CursorsAndSelections: Story = {
  render: () => (
    <Stage>
      <Board name="Pricing" frame="Desktop, Dark">
        <PricingDesign mark={selections} />
        <div className="absolute top-[300px] left-[400px]">
          <PersonCursor person={people.maya} />
        </div>
        <div className="absolute top-[175px] left-[470px]">
          <PersonCursor person={people.jonas} />
        </div>
        <div className="absolute top-[118px] left-[560px]">
          <AgentCursor agent={people.claude} kind="write" label="Tighten the heading" />
        </div>
      </Board>
    </Stage>
  )
}

/** Following Maya: the canvas framed in her color goes where she goes, until you press Esc or pan yourself. */
export const Following: Story = {
  render: () => (
    <div className="h-screen">
      <FollowFrame person={people.maya}>
        <Stage className="h-full pt-16">
          <Board name="Pricing" frame="Desktop, Dark">
            <PricingDesign mark={(id, element) => (id === "plan-team" ? selections(id, element) : element)} />
            <div className="absolute top-[300px] left-[400px]">
              <PersonCursor person={people.maya} />
            </div>
          </Board>
        </Stage>
      </FollowFrame>
    </div>
  )
}

/** Presenting: asking everyone to follow you for a walkthrough, and the invitation as others see it. */
export const Presenting: Story = {
  render: () => (
    <Stage className="flex flex-col gap-6">
      <Spotlight presenter={people.maya} />
      <Spotlight presenter={me} following={[people.jonas, people.priya, people.sam]} />
    </Stage>
  )
}

/** The Layers panel marks layers someone else has selected with their color. */
export const InTheLayersPanel: Story = {
  render: () => (
    <Stage>
      <div className="w-64 rounded-lg border bg-background p-1.5">
        <LayerRow name="Pricing" />
        <LayerRow name="Header" depth={1} />
        <LayerRow name="Main" depth={1} />
        <LayerRow name="Heading" depth={2} selectedBy={[people.claude]} />
        <LayerRow name="Billing toggle" depth={2} selectedBy={[people.jonas, people.priya]} />
        <LayerRow name="Plan cards" depth={2} />
        <LayerRow name="Starter" depth={3} />
        <LayerRow name="Team" depth={3} selectedBy={[people.maya]} selected />
        <LayerRow name="Scale" depth={3} />
        <LayerRow name="Footer" depth={1} />
      </div>
    </Stage>
  )
}

/** When the connection drops, and when it comes back. */
export const Connection: Story = {
  render: () => (
    <Stage className="flex flex-col gap-4">
      <ConnectionBanner state="offline" />
      <ConnectionBanner state="reconnecting" />
    </Stage>
  )
}
