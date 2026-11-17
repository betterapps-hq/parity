import { AgentBadge, AgentPointer } from "@parity-app/presence-ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { PresenceEvent } from "../../shared/protocol.ts"
import { agentPalettes } from "./agent-colors.ts"

type State = "rest" | "pressed" | "idle"

/** An agent's cursor as the canvas draws it: the arrow, with its badge underneath. */
function Cursor({
  palette,
  state,
  agent,
  kind,
  label,
  light
}: {
  palette: string
  state: State
  agent: string
  kind?: PresenceEvent["kind"]
  label: string
  light: boolean
}) {
  const colors = agentPalettes.find((candidate) => candidate.name === palette)

  return (
    <div className={`flex min-h-64 items-center justify-center p-16 ${light ? "bg-white" : "bg-[#0e0e10]"}`}>
      <div className="group/cursor relative" data-idle={state === "idle"}>
        <AgentPointer palette={colors} pressed={state === "pressed"} />
        <AgentBadge palette={colors} agent={agent} kind={kind} label={label || undefined} />
      </div>
    </div>
  )
}

const meta = {
  title: "Parity/Multiplayer/Agents/Cursor",
  component: Cursor,
  parameters: { layout: "fullscreen" },
  argTypes: {
    palette: { control: "select", options: agentPalettes.map((palette) => palette.name) },
    state: { control: "inline-radio", options: ["rest", "pressed", "idle"] },
    kind: {
      control: "select",
      options: ["read", "write", "move", "screenshot", "measure", "accessibility", "problems", "console", "board"]
    }
  },
  args: { palette: "Aurora", state: "rest", agent: "Claude Code", kind: "read", label: "Review pricing", light: false }
} satisfies Meta<typeof Cursor>

export default meta

type Story = StoryObj<typeof meta>

/** Travelling or looking at something. */
export const Default: Story = {}

/** Pressed in while it drags a board. */
export const Pressed: Story = { args: { state: "pressed", kind: "move", label: "Tidy the layout" } }

/** Waiting for the agent's next call: it breathes, with a soft pulse around it. */
export const Idle: Story = { args: { state: "idle", kind: undefined, label: "" } }

/** Over a light design, as it often is. */
export const OnLight: Story = { args: { light: true } }
