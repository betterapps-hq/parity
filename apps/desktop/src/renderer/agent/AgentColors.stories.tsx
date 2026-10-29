import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useRef, useState } from "react"
import { type AgentPalette, agentColors, agentPalettes } from "./agent-colors.ts"
import { AgentBadge, AgentPointer } from "./AgentPointer.tsx"
import { Scanner, scanMs } from "./scanner.ts"

/** A palette's scan, played again and again over a mock screen. */
function ScanSample({ palette }: { palette: AgentPalette }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const scanner = new Scanner(canvas)
    const play = () =>
      scanner.scan({
        box: () => {
          const area = canvas.getBoundingClientRect()
          const screen = screenRef.current?.getBoundingClientRect()
          return screen
            ? { x: screen.left - area.left, y: screen.top - area.top, w: screen.width, h: screen.height }
            : { x: 0, y: 0, w: 0, h: 0 }
        },
        radius: 8,
        palette,
        agent: palette.name,
        ms: scanMs
      })
    play()
    const timer = setInterval(play, scanMs + 700)
    return () => {
      clearInterval(timer)
      scanner.dispose()
    }
  }, [palette])

  return (
    <div className="relative p-6">
      <div ref={screenRef} className="flex h-28 w-52 flex-col gap-2 rounded-lg bg-white p-3">
        <div className="h-2.5 w-1/2 rounded bg-zinc-300" />
        <div className="h-2 w-4/5 rounded bg-zinc-200" />
        <div className="h-2 w-3/5 rounded bg-zinc-200" />
        <div className="mt-auto h-6 w-20 rounded-md bg-zinc-900" />
      </div>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />
    </div>
  )
}

/** One palette: its name, its stops, the cursor and badge in it, and its scan. */
function PaletteRow({ palette }: { palette: AgentPalette }) {
  return (
    <div className="grid grid-cols-[9rem_14rem_1fr_auto] items-center gap-8 border-b border-white/10 py-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{palette.name}</span>
        <span className="text-xs text-muted-foreground">
          cursor {palette.color}, ink {palette.ink}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <div
          className="h-3 rounded-full"
          style={{ background: `linear-gradient(90deg, ${palette.stops.join(", ")})` }}
        />
        <div className="flex gap-2">
          {palette.stops.map((stop) => (
            <span key={stop} className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
              <span className="size-3 rounded-sm" style={{ background: stop }} />
              {stop}
            </span>
          ))}
        </div>
      </div>
      <div className="relative h-12">
        <AgentPointer palette={palette} />
        <AgentBadge palette={palette} agent="Claude Code" label="Review pricing" />
      </div>
      <ScanSample palette={palette} />
    </div>
  )
}

const meta = {
  title: "Agent/Colors",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Every palette an agent can get, with its cursor, badge and scan. */
export const Palettes: Story = {
  render: () => (
    <div className="bg-[#0e0e10] px-12 py-8">
      {agentPalettes.map((palette) => (
        <PaletteRow key={palette.name} palette={palette} />
      ))}
    </div>
  )
}

/**
 * Which palette agents get when they work together. A name only picks the palette an agent prefers; agents at work
 * at the same time always get different ones, so two sessions of the same agent differ too.
 */
function Assignment({ names }: { names: string[] }) {
  const [claimed] = useState(() => {
    const ids = names.map((name, index) => `story-${index}-${name}`)
    const palettes = ids.map((id, index) => agentColors.claim(id, names[index]!))
    for (const id of ids) agentColors.release(id)
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
