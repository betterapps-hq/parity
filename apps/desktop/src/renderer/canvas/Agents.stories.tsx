import type { Meta, StoryObj } from "@storybook/react-vite"
import type { PresenceEvent } from "../../shared/protocol.ts"
import { presence } from "../agent/presence.ts"
import { AppWindow } from "../App.tsx"
import { design, example, node, onCanvas } from "../stories/fixtures.tsx"

/**
 * Agents at work on the real canvas, as the project service reports their calls: each gets a cursor in its own colors
 * that travels to what it reads or changes and scans it. The cursor's own stories are under Agent.
 */
const meta = {
  title: "Parity/Canvas/Agents",
  component: AppWindow,
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AppWindow>

export default meta
type Story = StoryObj<typeof meta>

/** The calls an agent makes, as the service reports them: the call starts, touches designs, then ends. */
function call(agent: string, agentId: string, label: string, steps: Omit<PresenceEvent, "tab">[]): PresenceEvent[] {
  const tab = example().id
  return [
    { kind: "start" as const, label },
    ...steps.map((step) => ({ label, ...step })),
    { kind: "end" as const, label }
  ].map((event) => ({ tab, agent, agentId, ...event }))
}

/** One agent reviewing a screen: it reads the design, looks closer at a layer, then measures a frame. */
export const Reviewing: Story = onCanvas(["Pricing"], undefined, () =>
  presence.push(
    call("Claude Code", "claude-1", "Review pricing", [
      { kind: "read", design: design("Pricing") },
      { kind: "read", design: design("Pricing"), node: node("Pricing", "Plans") },
      { kind: "measure", design: design("Pricing"), mode: "mobile-light" }
    ])
  )
)

/** Two agents at once, each in its own colors, one reading while the other changes another design. */
export const TwoAgents: Story = onCanvas(["Dashboard", "Pricing"], undefined, () => {
  presence.push(
    call("Claude Code", "claude-1", "Tighten the dashboard", [
      { kind: "read", design: design("Dashboard") },
      { kind: "write", design: design("Dashboard") }
    ])
  )
  presence.push(
    call("Cursor", "cursor-1", "Check the plan cards", [
      { kind: "read", design: design("Pricing"), node: node("Pricing", "Plans") },
      { kind: "screenshot", design: design("Pricing") }
    ])
  )
})

/** An agent checking a design's accessibility, then reading the app's console, which has nothing on the canvas. */
export const CheckingAccessibility: Story = onCanvas(["Sign in"], undefined, () =>
  presence.push(
    call("Codex", "codex-1", "Check sign in", [
      { kind: "accessibility", design: design("Sign in") },
      { kind: "console" }
    ])
  )
)
