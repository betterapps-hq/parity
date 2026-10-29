import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react"
import type { PresenceEvent } from "../../shared/protocol.ts"
import { ProjectContext } from "../canvas/context.ts"
import type { ProjectSession } from "../workspace.ts"
import { AgentPresence } from "./AgentPresence.tsx"
import { heldBoards } from "./held-boards.ts"
import { presence } from "./presence.ts"

interface MockNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  color: string
}

interface MockBoard {
  key: string
  name: string
  x: number
  y: number
  w: number
  h: number
  nodes: MockNode[]
}

/** One agent call: its steps arrive together, `after` milliseconds after the previous call's, as from a real agent. */
interface Call {
  after: number
  label: string
  agent?: { name: string; id: string }
  steps: Omit<PresenceEvent, "tab" | "label">[]
}

const line = (id: string, x: number, y: number, w: number): MockNode => ({ id, x, y, w, h: 8, color: "#e4e4e7" })

const boards: MockBoard[] = [
  {
    key: "demo.par#pricing",
    name: "Pricing",
    x: 60,
    y: 80,
    w: 300,
    h: 210,
    nodes: [
      { id: "heading", x: 16, y: 16, w: 170, h: 16, color: "#d4d4d8" },
      line("intro", 16, 44, 220),
      line("detail", 16, 60, 160),
      { id: "plans", x: 16, y: 84, w: 220, h: 50, color: "#f4f4f5" },
      { id: "cta", x: 16, y: 146, w: 110, h: 30, color: "#18181b" }
    ]
  },
  {
    key: "demo.par#sign-in",
    name: "Sign in",
    x: 640,
    y: 70,
    w: 290,
    h: 230,
    nodes: [
      { id: "title", x: 20, y: 18, w: 120, h: 16, color: "#d4d4d8" },
      { id: "email", x: 20, y: 56, w: 200, h: 28, color: "#f4f4f5" },
      { id: "password", x: 20, y: 96, w: 200, h: 28, color: "#f4f4f5" },
      { id: "submit", x: 20, y: 144, w: 200, h: 32, color: "#18181b" }
    ]
  },
  {
    key: "demo.par#settings",
    name: "Settings",
    x: 340,
    y: 350,
    w: 320,
    h: 180,
    nodes: [
      { id: "heading", x: 16, y: 16, w: 120, h: 16, color: "#d4d4d8" },
      line("row-1", 16, 52, 200),
      { id: "toggle", x: 220, y: 46, w: 36, h: 20, color: "#18181b" },
      line("row-2", 16, 88, 180),
      line("row-3", 16, 120, 220)
    ]
  }
]

const claude = { name: "Claude Code", id: "claude" }
const cursor = { name: "Cursor", id: "cursor" }

/** A board's frame: a shadow root with design nodes in it, as the canvas draws them, so the cursor can find them. */
function Frame({ board }: { board: MockBoard }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
    shadow.innerHTML = board.nodes
      .map(
        (node) =>
          `<div data-canvas-node="${node.id}" style="position:absolute;left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px;border-radius:6px;background:${node.color}"></div>`
      )
      .join("")
  }, [board])
  return (
    <div
      ref={ref}
      data-frame=""
      data-design={board.key}
      data-mode="desktop"
      data-state="default"
      data-primary="true"
      className="relative h-full w-full rounded-md bg-white"
    />
  )
}

/**
 * A canvas of mock boards with agents' presence over it, playing calls as an agent would make them. Moves land on the
 * boards at once, as the design store applies them, and the boards are drawn where they're held until dragged.
 */
function Stage({ calls, note }: { calls: Call[]; note: string }) {
  const tab = `story-${useId()}`
  const session = useMemo(() => ({ id: tab }) as unknown as ProjectSession, [tab])
  const [positions, setPositions] = useState(() => new Map(boards.map((board) => [board.key, board])))
  const [run, replay] = useReducer((count: number) => count + 1, 0)
  const [, redraw] = useReducer((count: number) => count + 1, 0)

  useEffect(() => heldBoards.subscribe(redraw), [])

  useEffect(() => {
    let at = 0
    const timers = calls.map((call) => {
      at += call.after
      return setTimeout(() => {
        const agent = call.agent ?? claude
        const events = [{ kind: "start" as const }, ...call.steps, { kind: "end" as const }].map(
          (step): PresenceEvent => ({ tab, agent: agent.name, agentId: agent.id, label: call.label, ...step })
        )
        presence.push(events)
        setPositions((current) => {
          const next = new Map(current)
          for (const event of events) {
            const board = event.kind === "move" && event.design ? next.get(event.design) : undefined
            if (board && event.to) next.set(board.key, { ...board, ...event.to })
          }
          return next
        })
      }, at)
    })
    return () => timers.forEach(clearTimeout)
  }, [calls, run, tab])

  return (
    <ProjectContext.Provider value={session}>
      <div className="relative h-[600px] w-full overflow-hidden bg-[#0e0e10] font-sans text-foreground">
        {[...positions.values()].map((board) => {
          const at = heldBoards.at(tab, board.key) ?? board
          return (
            <div
              key={board.key}
              className="container-view absolute rounded-[20px] border bg-card p-5 shadow-2xl"
              data-design={board.key}
              style={{ left: at.x, top: at.y, width: board.w, height: board.h }}
            >
              <div className="absolute -top-7 left-2 text-sm font-medium text-muted-foreground">{board.name}</div>
              <Frame board={board} />
            </div>
          )
        })}
        <AgentPresence />
        <div className="absolute right-3 bottom-3 z-[500] flex max-w-md items-center gap-3 rounded-lg border bg-background/90 px-3 py-2 text-xs">
          <span className="text-muted-foreground">{note}</span>
          <button
            type="button"
            className="shrink-0 rounded-md border px-2 py-1 hover:bg-muted"
            onClick={() => {
              setPositions(new Map(boards.map((board) => [board.key, board])))
              replay()
            }}
          >
            Replay
          </button>
        </div>
      </div>
    </ProjectContext.Provider>
  )
}

const meta = {
  title: "Agent/Behavior",
  component: Stage,
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof Stage>

export default meta
type Story = StoryObj<typeof meta>

const pricing = "demo.par#pricing"
const signIn = "demo.par#sign-in"
const settings = "demo.par#settings"

export const TravelAndDwell: Story = {
  args: {
    note: "Travels on a curve from point to point, settles, then breathes over each target while it scans.",
    calls: [
      {
        after: 400,
        label: "Review the pricing page",
        steps: [
          { kind: "read", design: pricing },
          { kind: "read", design: pricing, node: "cta" },
          { kind: "read", design: signIn, node: "email" },
          { kind: "read", design: settings, node: "toggle" }
        ]
      }
    ]
  }
}

export const LingerBetweenCalls: Story = {
  args: {
    note: "After a call it stays near what it last looked at, breathing, until the next call. 20 seconds idle and it fades.",
    calls: [
      { after: 400, label: "Check the call to action", steps: [{ kind: "read", design: pricing, node: "cta" }] },
      { after: 9000, label: "Check the sign in button", steps: [{ kind: "read", design: signIn, node: "submit" }] }
    ]
  }
}

export const DragABoard: Story = {
  args: {
    note: "A moved board waits where it was until the cursor grabs it, then the two travel together.",
    calls: [
      {
        after: 400,
        label: "Tidy the layout",
        steps: [
          { kind: "move", design: settings, from: { x: 340, y: 350 }, to: { x: 640, y: 380 } },
          { kind: "move", design: pricing, from: { x: 60, y: 80 }, to: { x: 120, y: 330 } }
        ]
      }
    ]
  }
}

export const TwoAgents: Story = {
  args: {
    note: "Each agent has its own cursor and colors; agents working at once never share a palette.",
    calls: [
      {
        after: 400,
        label: "Review pricing",
        agent: claude,
        steps: [
          { kind: "read", design: pricing },
          { kind: "read", design: pricing, node: "cta" },
          { kind: "read", design: signIn, node: "submit" }
        ]
      },
      {
        after: 300,
        label: "Check settings",
        agent: cursor,
        steps: [
          { kind: "read", design: settings },
          { kind: "read", design: settings, node: "toggle" },
          { kind: "read", design: signIn, node: "email" }
        ]
      }
    ]
  }
}

export const EveryKindOfLook: Story = {
  args: {
    note: "Reads, writes, measurements and screenshots all scan their target; a measurement labels its size.",
    calls: [
      {
        after: 400,
        label: "Polish the sign in screen",
        steps: [
          { kind: "read", design: signIn },
          { kind: "write", design: signIn, node: "submit" },
          { kind: "measure", design: signIn, node: "email" },
          { kind: "screenshot", design: signIn }
        ]
      }
    ]
  }
}

export const Backlog: Story = {
  args: {
    note: "When steps pile up the cursor speeds up, so it never falls far behind the agent.",
    calls: [
      {
        after: 400,
        label: "Audit every screen",
        steps: boards.flatMap((board) =>
          board.nodes.map((node) => ({ kind: "read" as const, design: board.key, node: node.id }))
        )
      }
    ]
  }
}

export const SameTarget: Story = {
  args: {
    note: "Two agents scanning the same thing at once mix their colors.",
    calls: [
      { after: 400, label: "Review sign in", agent: claude, steps: [{ kind: "read", design: signIn }] },
      { after: 150, label: "Check sign in copy", agent: cursor, steps: [{ kind: "read", design: signIn }] }
    ]
  }
}

const six = [
  claude,
  cursor,
  { name: "Codex", id: "codex" },
  { name: "Gemini CLI", id: "gemini" },
  { name: "Copilot", id: "copilot" },
  { name: "Windsurf", id: "windsurf" }
]

export const SixAgents: Story = {
  args: {
    note: "Six agents at once: six cursors, six palettes, a strip each. Some share a target and mix.",
    calls: six.map((agent, index) => {
      const targets = boards.flatMap((board) => board.nodes.map((node) => ({ design: board.key, node: node.id })))
      const pick = (offset: number) => targets[(index * 3 + offset) % targets.length]!
      return {
        after: index === 0 ? 400 : 350,
        label: ["Review pricing", "Check settings", "Audit sign in", "Tidy copy", "Check spacing", "Review layout"][
          index
        ]!,
        agent,
        steps: [
          { kind: "read" as const, ...pick(0) },
          { kind: index % 2 === 0 ? ("write" as const) : ("read" as const), ...pick(1) },
          { kind: "read" as const, design: signIn },
          { kind: "measure" as const, ...pick(2) }
        ]
      }
    })
  }
}
