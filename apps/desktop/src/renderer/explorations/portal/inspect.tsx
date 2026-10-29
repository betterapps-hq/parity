/**
 * Inspect, Parity's answer to Dev Mode: a board opened from Handoff, read-only, at the version that was approved. Pick
 * anything on it to see the component it is, its file, its props as code, its states, the tokens it uses and its size.
 * Because the board is drawn from the project's own components, what it shows is the code, not a guess at it.
 */
import { Bot, ChevronRight, Copy, FileCode, Monitor } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ParityMark } from "../parts.tsx"
import { DesignRender } from "../start/renders.tsx"
import { deliverable } from "./boards.ts"
import { designOf, handoff, portalProject } from "./data.ts"
import { HandoffPill, Pills, PortalWindow } from "./parts.tsx"

const selection = "oklch(0.64 0.19 255)"
const added = "oklch(0.72 0.16 290)"

/** The render's own size: a level tile sits at a point on a 1280 by 800 map. */
const map = { width: 1280, height: 800 }
const tile = { x: 570, y: 440, size: 64 }

function share(value: number, of: number): string {
  return `${(value / of) * 100}%`
}

/** A section of the side panel: a small title, then what it shows. */
function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b px-4 py-4 last:border-0">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function CopyButton({ label }: { label: string }) {
  return (
    <button type="button" aria-label={label} className="text-muted-foreground hover:text-foreground">
      <Copy className="size-3.5" />
    </button>
  )
}

/** Marked as new, or changed, in the approved version. */
function New({ children = "new" }: { children?: string }) {
  return (
    <span className="text-[11px] whitespace-nowrap" style={{ color: added }}>
      {children}
    </span>
  )
}

const props: { name: string; value: string; type: string; added?: boolean }[] = [
  { name: "level", value: "4", type: "number" },
  { name: "stars", value: "2", type: "0 | 1 | 2 | 3" },
  { name: "locked", value: "false", type: "boolean", added: true },
  { name: "current", value: "false", type: "boolean" }
]

/** The component picked on the board. */
const selected = "LevelTile"

export function InspectPage() {
  const shown = portalProject("spawnkit")
  const design = designOf(shown, "Level select")
  // What's on the board and its tokens come from the same list Handoff reads.
  const board = deliverable("spawnkit", "Level select")
  const part = board.parts.find((candidate) => candidate.name === selected)!
  const tokens = board.tokens.filter((token) => token.usedBy.includes(selected))
  return (
    <PortalWindow path="kestrel/ember-caves/level-select/inspect?v=8">
      <div className="flex h-full flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b bg-background px-3 text-sm whitespace-nowrap">
          <ParityMark size={20} />
          <span className="font-medium">{shown.name}</span>
          <ChevronRight className="size-3.5 text-muted-foreground/60" />
          <span>{design.name}</span>
          <ChevronRight className="size-3.5 text-muted-foreground/60" />
          <span className="text-muted-foreground">Inspect</span>
          <span className="ml-1 rounded-md bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums">v8</span>
          <HandoffPill status={handoff["spawnkit/Level select"]!} />
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" className="gap-1.5">
              <Monitor /> Open in the desktop app
            </Button>
            <Button size="sm" variant="ghost">
              Share
            </Button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-background p-3">
            <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">On this board</h3>
            {board.parts.map((onBoard) => (
              <span
                key={onBoard.name}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] ${onBoard.name === selected ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                <FileCode className="size-3.5 shrink-0" />
                <span className="flex-1 truncate font-mono text-xs">{onBoard.name}</span>
                {onBoard.change && <New>{onBoard.change.toLowerCase()}</New>}
                <span className="text-[11px] tabular-nums">{onBoard.uses}</span>
              </span>
            ))}
            <div className="mt-auto flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <span className="text-foreground">Approved v{board.version}</span>
              {board.by.what}. {board.building?.who.name} is building it on {board.building?.branch}, #
              {board.building?.pr?.number}.
            </div>
          </aside>
          <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0f0f12]">
            <div className="flex justify-center pt-5">
              <Pills options={["Phone", "Tablet"]} />
            </div>
            <div className="relative mx-auto mt-5 w-[86%] max-w-[760px]">
              <span className="text-[11px] font-medium text-white/50">
                {design.name} <span className="text-white/30">Open, on a phone held sideways</span>
              </span>
              <div className="relative mt-2 rounded-[5px] shadow-[0_16px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-white/[0.06]">
                <div className="overflow-hidden rounded-[5px]">
                  <DesignRender kind={design.kind} look={shown.look} />
                </div>
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: share(tile.x - tile.size / 2, map.width),
                    top: share(tile.y - tile.size / 2, map.height),
                    width: share(tile.size, map.width),
                    height: share(tile.size, map.height),
                    boxShadow: `0 0 0 1.5px ${selection}`
                  }}
                >
                  <span
                    className="absolute -top-5 left-0 rounded-[3px] px-1 py-px font-mono text-[10px] whitespace-nowrap text-white"
                    style={{ background: selection }}
                  >
                    {selected}
                  </span>
                  <span
                    className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-[3px] px-1 py-px font-mono text-[10px] whitespace-nowrap text-white tabular-nums"
                    style={{ background: selection }}
                  >
                    64 × 64
                  </span>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-white/40">
                Pick anything on the board to inspect it. It's read-only, at the approved version.
              </p>
            </div>
          </div>
          <aside className="flex w-[22rem] shrink-0 flex-col overflow-y-auto border-l bg-background">
            <Section title="Component" action={<CopyButton label="Copy the file path" />}>
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{part.name}</span>
                {part.change && <New>{part.change.toLowerCase()}</New>}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{part.file}</span>
            </Section>
            <Section title="Code" action={<CopyButton label="Copy the code" />}>
              <pre className="rounded-lg bg-muted/50 px-3 py-2.5 font-mono text-xs leading-relaxed">
                {"<LevelTile level={4} stars={2} />"}
              </pre>
            </Section>
            <Section title="Props">
              <div className="flex flex-col gap-1.5">
                {props.map((prop) => (
                  <span key={prop.name} className="grid grid-cols-[5.5rem_3.5rem_minmax(0,1fr)] items-baseline text-xs">
                    <span className="font-mono">{prop.name}</span>
                    <span className="font-mono">{prop.value}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {prop.type}
                      {prop.added && <New />}
                    </span>
                  </span>
                ))}
              </div>
            </Section>
            <Section title="States">
              <div className="flex flex-wrap gap-1.5">
                {["Open", "Locked", "Cleared", "Current"].map((state, index) => (
                  <span
                    key={state}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${index === 0 ? "border-foreground/40 bg-muted" : "text-muted-foreground"}`}
                  >
                    {state}
                    {state === "Locked" && <New />}
                  </span>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                Each state is a frame on the board, so you can see it before you build it.
              </span>
            </Section>
            <Section title="Tokens">
              <div className="flex flex-col gap-1.5">
                {tokens.map((token) => (
                  <span key={token.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="size-3.5 shrink-0 rounded-[3px] ring-1 ring-white/10"
                      style={{ background: token.value }}
                    />
                    <span className="font-mono">{token.name}</span>
                    {token.added && <New />}
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">{token.value}</span>
                  </span>
                ))}
              </div>
            </Section>
            <Section title="Size and spacing">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <span className="text-muted-foreground">Size</span>
                <span className="font-mono">64 × 64</span>
                <span className="text-muted-foreground">Corners</span>
                <span className="font-mono">full</span>
                <span className="text-muted-foreground">Stars below</span>
                <span className="font-mono">8</span>
                <span className="text-muted-foreground">Current level</span>
                <span className="font-mono">78 × 78</span>
              </div>
            </Section>
            <div className="mt-auto flex flex-col gap-2 border-t p-4">
              <Button size="sm" className="gap-1.5">
                <Bot /> Give to your agent
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Hands your coding agent v8 of this board: its components, props, states and tokens.
              </span>
            </div>
          </aside>
        </div>
      </div>
    </PortalWindow>
  )
}
