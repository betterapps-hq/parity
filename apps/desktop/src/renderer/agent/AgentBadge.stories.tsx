import type { Meta, StoryObj } from "@storybook/react-vite"
import type { PresenceEvent } from "../../shared/protocol.ts"
import { agentPalettes } from "./agent-colors.ts"
import { AgentBadge, AgentPointer } from "./AgentPointer.tsx"

type Kind = PresenceEvent["kind"]

/** The badge under an agent's arrow, on the dark canvas. */
function Badge({ palette, agent, kind, label }: { palette: string; agent: string; kind?: Kind; label: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center bg-[#0e0e10] p-12">
      <AgentBadge
        palette={agentPalettes.find((candidate) => candidate.name === palette)}
        agent={agent}
        kind={kind}
        label={label || undefined}
      />
    </div>
  )
}

/** Each kind of action, with a call that does it. */
const kinds: { kind: Kind; action: string; note: string }[] = [
  { kind: "read", action: "Review pricing", note: "Reads a design or a node in it" },
  { kind: "write", action: "Tighten the plan cards", note: "Changes a design" },
  { kind: "move", action: "Tidy the layout", note: "Drags a design's board" },
  { kind: "screenshot", action: "Screenshot Pricing", note: "Captures a frame" },
  { kind: "measure", action: "Check the spacing", note: "Measures a frame's layout" },
  { kind: "accessibility", action: "Check Pricing's accessibility", note: "Audits a frame with axe" },
  { kind: "problems", action: "Look for problems in Pricing", note: "Checks for overflow and clipping" },
  { kind: "console", action: "Read the console", note: "Reads the running app's console" },
  { kind: "board", action: "Look over the board", note: "Gets its bearings: designs, selection, overlaps" },
  { kind: "start", action: "Thinking", note: "Before a call's first step, and between calls" }
]

const meta = {
  title: "Agent/Badge",
  component: Badge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    palette: { control: "select", options: ["None", ...agentPalettes.map((palette) => palette.name)] },
    kind: { control: "select", options: kinds.map(({ kind }) => kind) }
  },
  args: { palette: "Aurora", agent: "Claude Code", kind: "read", label: "Review pricing" }
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

/** Between calls, only who the agent is. */
export const NameOnly: Story = { args: { kind: undefined, label: "" } }

/** While a call runs, what kind of thing it's doing and the call's label. */
export const WithAction: Story = {}

/** A long action truncates; the name always shows in full. */
export const LongAction: Story = {
  args: { kind: "write", label: "Rework the pricing tiers so the annual plan is the clear default for teams" }
}

/** Before the agent has a palette, for the moment before its first step plays. */
export const BeforeColors: Story = { args: { palette: "None", kind: "start", label: "" } }

const agentNames = ["Claude Code", "Cursor", "Codex", "Gemini CLI", "Copilot", "Windsurf"]

/** In every palette, each doing something different. */
export const EveryPalette: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4 bg-[#0e0e10] p-12">
      {agentPalettes.map((palette, index) => (
        <AgentBadge
          key={palette.name}
          palette={palette}
          agent={agentNames[index % agentNames.length]!}
          kind={kinds[index % kinds.length]!.kind}
          label={kinds[index % kinds.length]!.action}
        />
      ))}
    </div>
  )
}

/** The icon for each kind of action, under its arrow. */
export const ActionIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-6 bg-[#0e0e10] p-12">
      {kinds.map(({ kind, action, note }) => (
        <div key={kind} className="grid grid-cols-[14rem_1fr] items-center gap-6">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-foreground">{kind}</span>
            <span className="text-[11px] text-muted-foreground">{note}</span>
          </div>
          <div className="relative">
            <AgentPointer palette={agentPalettes[7]} />
            <AgentBadge palette={agentPalettes[7]} agent="Claude Code" kind={kind} label={action} />
          </div>
        </div>
      ))}
    </div>
  )
}
