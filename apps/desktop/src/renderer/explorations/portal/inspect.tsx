/**
 * Inspect, Parity's answer to Dev Mode: a board opened from Handoff, read-only, at the version that was approved. Pick
 * anything on it to see the component it is, its file, its props as code, its states, its text, the tokens it uses and
 * its size; hover something else to measure between them. Because the board is drawn from the project's own
 * components, what it shows is the code, not a guess at it.
 */
import { Bot, ChevronRight, Copy, ExternalLink, FileCode, Monitor } from "lucide-react"
import { Fragment, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { me } from "../explore-data.ts"
import { Avatar, ParityMark } from "../parts.tsx"
import { DesignRender } from "../start/renders.tsx"
import { deliverable } from "./boards.ts"
import { designOf, handoff, portalProject } from "./data.ts"
import { HandoffPill, Pills, PortalWindow, PullRequestLink } from "./parts.tsx"

const selection = "oklch(0.64 0.19 255)"
const added = "oklch(0.72 0.16 290)"
/** Measurements, in Dev Mode's red. */
const measure = "oklch(0.68 0.21 25)"

/** The render's own size: level tiles sit at points on a 1280 by 800 map. */
const map = { width: 1280, height: 800 }
const tile = { x: 570, y: 440, size: 64 }
/** The tile you're hovering: level 5, to measure to. */
const next = { x: 710, y: 520, size: 64 }

function share(value: number, of: number): string {
  return `${(value / of) * 100}%`
}

/** A box on the map, by its edges in the render's pixels. */
function box(left: number, top: number, width: number, height: number) {
  return {
    left: share(left, map.width),
    top: share(top, map.height),
    width: share(width, map.width),
    height: share(height, map.height)
  }
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

/** A file, as a link to it on GitHub. */
function FileLink({ file }: { file: string }) {
  return (
    <span className="group flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
      <span className="truncate underline decoration-muted-foreground/40 underline-offset-2 group-hover:text-foreground">
        {file}
      </span>
      <ExternalLink className="size-3 shrink-0 opacity-60" aria-label="Opens on GitHub" />
    </span>
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

/** A measurement label on the board. */
function Measure({ children, className }: { children: string; className: string }) {
  return (
    <span
      className={`absolute rounded-[3px] px-1 py-px font-mono text-[10px] whitespace-nowrap text-white tabular-nums ${className}`}
      style={{ background: measure }}
    >
      {children}
    </span>
  )
}

const props: { name: string; value: string; type: string; added?: boolean }[] = [
  { name: "level", value: "4", type: "number" },
  { name: "stars", value: "3", type: "0 | 1 | 2 | 3" },
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
  const gap = next.x - next.size / 2 - (tile.x + tile.size / 2)
  return (
    <PortalWindow path="kestrel/ember-caves/level-select/inspect?v=8">
      <div className="flex h-full flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b bg-background px-3 text-sm whitespace-nowrap">
          <ParityMark size={20} />
          <span className="text-muted-foreground hover:text-foreground">Handoff</span>
          <ChevronRight className="size-3.5 text-muted-foreground/60" />
          <span className="font-medium">{shown.name}</span>
          <ChevronRight className="size-3.5 text-muted-foreground/60" />
          <span>{design.name}</span>
          <span className="ml-1 rounded-md bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums">
            Inspect v{board.version}
          </span>
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
          <aside className="flex w-60 shrink-0 flex-col gap-1 border-r bg-background p-3">
            <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">Page</h3>
            <span className="px-2 pb-3">
              <FileLink file={board.page} />
            </span>
            <h3 className="flex items-baseline justify-between px-2 pb-1 text-xs font-medium text-muted-foreground">
              On this board <span className="font-normal">uses</span>
            </h3>
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
            <span className="px-2 pt-1 text-[11px] text-muted-foreground">New and changed are against main.</span>
            <div className="mt-auto flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 text-foreground">
                <Avatar person={board.approved!.who} size={16} />
                {board.approved!.who === me ? "You" : board.approved!.who.name} approved v{board.version},{" "}
                {board.approved!.when}
              </span>
              {board.code && (
                <span className="flex flex-col gap-1">
                  <span>
                    {board.code.who.name} is building it on{" "}
                    <span className="font-mono text-foreground">{board.code.branch}</span>
                  </span>
                  {board.code.pr && <PullRequestLink pr={board.code.pr} />}
                </span>
              )}
            </div>
          </aside>
          <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0f0f12]">
            <div className="flex justify-center pt-5">
              <Pills options={["Phone", "Tablet"]} />
            </div>
            <div className="relative mx-auto mt-5 w-[86%] max-w-[760px]">
              <span className="text-xs font-medium text-white/60">
                {design.name} <span className="text-white/40">Open, on a phone held sideways</span>
              </span>
              <div className="relative mt-2 rounded-[5px] shadow-[0_16px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-white/[0.06]">
                <div className="overflow-hidden rounded-[5px]">
                  <DesignRender kind={design.kind} look={shown.look} />
                </div>
                {/* The picked tile, with its name and size. */}
                <div
                  className="pointer-events-none absolute"
                  style={{
                    ...box(tile.x - tile.size / 2, tile.y - tile.size / 2, tile.size, tile.size),
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
                    className="absolute top-1/2 right-full mr-1 -translate-y-1/2 rounded-[3px] px-1 py-px font-mono text-[10px] whitespace-nowrap text-white tabular-nums"
                    style={{ background: selection }}
                  >
                    {tile.size} × {tile.size}
                  </span>
                </div>
                {/* The hovered tile, and the distances to it and to the stars under the picked one. */}
                <div
                  className="pointer-events-none absolute"
                  style={{
                    ...box(next.x - next.size / 2, next.y - next.size / 2, next.size, next.size),
                    boxShadow: `0 0 0 1px ${measure}`
                  }}
                />
                <div
                  className="pointer-events-none absolute border-t"
                  style={{
                    ...box(tile.x + tile.size / 2, next.y - next.size / 2, gap, 0),
                    borderColor: measure
                  }}
                >
                  <Measure className="-top-5 left-1/2 -translate-x-1/2">{String(gap)}</Measure>
                </div>
                <div
                  className="pointer-events-none absolute border-l border-dashed"
                  style={{
                    ...box(tile.x + tile.size / 2, tile.y - tile.size / 2, 0, next.y - tile.y),
                    borderColor: measure
                  }}
                />
                <div
                  className="pointer-events-none absolute border-l"
                  style={{ ...box(tile.x - tile.size / 2 - 3, tile.y + tile.size / 2, 0, 8), borderColor: measure }}
                >
                  <Measure className="top-1/2 right-1.5 -translate-y-1/2">8</Measure>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-white/55">
                Pick anything on the board to inspect it, and hover something else to measure to it. It's read-only, at
                the approved version.
              </p>
            </div>
          </div>
          <aside className="flex w-[22rem] shrink-0 flex-col overflow-y-auto border-l bg-background">
            <Section title="Component" action={<CopyButton label="Copy the file path" />}>
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{part.name}</span>
                {part.change && <New>{part.change.toLowerCase()}</New>}
              </span>
              <FileLink file={part.file} />
            </Section>
            <Section title="Code" action={<CopyButton label="Copy the code" />}>
              <pre className="rounded-lg bg-muted/50 px-3 py-2.5 font-mono text-xs leading-relaxed">
                {"<LevelTile level={4} stars={3} />"}
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
                {board.states.map((state, index) => (
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
            <Section title="Text" action={<CopyButton label="Copy the classes" />}>
              <div className="flex flex-col gap-2 text-xs">
                <span className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">The level number</span>
                  <code className="font-mono text-[11px]">text-[26px] font-black text-white</code>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">Locked, instead of the number</span>
                  <code className="font-mono text-[11px]">
                    {'<Lock className="size-6 text-(--tile-locked-foreground)" />'}
                  </code>
                </span>
              </div>
            </Section>
            <Section title="Tokens">
              <div className="flex flex-col gap-2">
                {tokens.map((token) => (
                  <span key={token.name} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs">
                    <span
                      className="mt-px size-3.5 rounded-[3px] ring-1 ring-white/10"
                      style={{ background: token.value }}
                    />
                    <span className="flex items-center gap-2">
                      <span className="font-mono">{token.name}</span>
                      {token.added && <New />}
                    </span>
                    <span className="col-start-2 font-mono text-[11px] text-muted-foreground">{token.value}</span>
                  </span>
                ))}
              </div>
            </Section>
            <Section title="Size and spacing" action={<CopyButton label="Copy the classes" />}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-1.5 text-xs">
                {[
                  ["Size", "size-16", "64px"],
                  ["Corners", "rounded-full", ""],
                  ["Bottom edge", "border-b-6", "6px"],
                  ["Stars, under the tile", "gap-2", "8px"],
                  ["Current level", "size-[78px]", "78px"],
                  ["To level 5, hovered", "", `${gap}px`]
                ].map(([label, code, px]) => (
                  <Fragment key={label}>
                    <span className="text-muted-foreground">{label}</span>
                    <code className="font-mono text-[11px]">{code}</code>
                    <span className="text-right font-mono text-[11px] text-muted-foreground tabular-nums">{px}</span>
                  </Fragment>
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Levels sit where the map puts them, in <span className="font-mono">src/levels/map.ts</span>, so the
                space between tiles comes from there, not from a class.
              </span>
            </Section>
            {board.notes && (
              <Section title="Notes">
                <span className="flex items-start gap-2 text-xs">
                  <Avatar person={board.notes.who} size={16} />
                  <span className="text-muted-foreground">
                    <span className="text-foreground">{board.notes.who.name.split(" ")[0]}:</span> {board.notes.text}
                  </span>
                </span>
              </Section>
            )}
            <Section title="Assets">
              <span className="text-xs text-muted-foreground">
                Nothing to export. The lock and stars are lucide-react's <span className="font-mono">Lock</span> and{" "}
                <span className="font-mono">Star</span>, and the tile and map are drawn in code.
              </span>
            </Section>
            <div className="mt-auto flex flex-col gap-2 border-t p-4">
              <Button size="sm" className="gap-1.5">
                <Bot /> Give to your agent
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Hands your coding agent v{board.version} of this board: its page, components, props, states, tokens and
                notes.
              </span>
            </div>
          </aside>
        </div>
      </div>
    </PortalWindow>
  )
}
