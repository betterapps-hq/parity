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
 * Which palette agents get when they work together. A name only picks the palette an agent prefers; agents at work
 * at the same time always get different ones, so two sessions of the same agent differ too.
 */
function Assignment({ names }: { names: string[] }) {
  const [claimed] = useState(() => {
    const ids = names.map((name, index) => `story-${index}-${name}`)
    const palettes = ids.map((id, index) => agentColors.claim(id, names[index]!))

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
