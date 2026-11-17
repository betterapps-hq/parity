import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { agentColors } from "./agent-colors.ts"
import { AgentBadge, AgentPointer } from "./AgentPointer.tsx"

/**
 * Which palette each agent at work gets. The palettes themselves, for people and agents alike, are in Multiplayer's
 * Colors.
 */
const meta = {
  title: "Parity/Multiplayer/Agents/Colors",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

/**
 * Which palette agents get when they work together: each the lowest-numbered one free, so agents at work at the same
 * time always differ, two sessions of the same agent too. Past the hand-tuned twelve, palettes are generated, so they
 * never run out.
 */
function Assignment({ names }: { names: string[] }) {
  const [claimed] = useState(() => {
    const ids = names.map((name, index) => `story-${index}-${name}`)
    const palettes = ids.map((id) => agentColors.claim(id))

    for (const id of ids) {
      agentColors.release(id)
    }

    return palettes
  })

  return (
    <div className="flex flex-col items-start gap-4 bg-[#0e0e10] p-12">
      {names.map((name, index) => (
        <div key={`${name}-${index}`} className="group/cursor relative h-12" data-idle="false">
          <AgentPointer palette={claimed[index]} />
          <AgentBadge palette={claimed[index]} agent={name} label={claimed[index]!.name} />
        </div>
      ))}
    </div>
  )
}

export const WorkingTogether: StoryObj<typeof Assignment> = {
  render: (args) => <Assignment {...args} />,
  args: { names: ["Claude Code", "Claude Code", "Cursor", "Codex", "Gemini CLI", "Copilot"] }
}

/** Sixteen agents at once: the twelve hand-tuned palettes, then four generated ones, named by their hue. */
export const PastTheTunedOnes: StoryObj<typeof Assignment> = {
  render: (args) => <Assignment {...args} />,
  args: { names: Array.from({ length: 16 }, (_, index) => `Agent ${index + 1}`) }
}
