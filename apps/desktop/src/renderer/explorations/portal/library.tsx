/**
 * A library's page: its components as they render, which version each project uses, and what each release changed.
 * Parity's components are the code itself, so "where is this used" is exact, down to the board, and an outdated
 * project can be updated from here or handed to an agent.
 */
import { Bot, Check, ChevronRight, Package, RefreshCw } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { people } from "../explore-data.ts"
import { Avatar } from "../parts.tsx"
import { event, portalProject } from "./data.ts"
import { Pills, PortalPage, Tabs } from "./parts.tsx"

const { lena } = people
const violet = "oklch(0.72 0.16 290)"

/** Kestrel UI's own colors, so its components look like themselves. */
const ink = "oklch(0.25 0.03 280)"
const accent = "oklch(0.58 0.2 280)"

/** A component as a small picture of itself. */
const previews: Record<string, ReactNode> = {
  Button: (
    <span className="flex gap-2">
      <span className="rounded-md px-3 py-1.5 text-[11px] font-medium text-white" style={{ background: accent }}>
        Save
      </span>
      <span className="rounded-md border border-black/15 px-3 py-1.5 text-[11px] font-medium" style={{ color: ink }}>
        Cancel
      </span>
    </span>
  ),
  Toggle: (
    <span className="flex items-center gap-3">
      <span className="flex h-5 w-9 items-center justify-end rounded-full p-0.5" style={{ background: accent }}>
        <span className="size-4 rounded-full bg-white shadow" />
      </span>
      <span className="flex h-5 w-9 items-center rounded-full bg-black/15 p-0.5">
        <span className="size-4 rounded-full bg-white shadow" />
      </span>
      <span className="flex h-4 w-7 items-center justify-end rounded-full p-0.5" style={{ background: accent }}>
        <span className="size-3 rounded-full bg-white shadow" />
      </span>
    </span>
  ),
  Menu: (
    <span
      className="flex w-28 flex-col gap-0.5 rounded-md border border-black/10 bg-white p-1 text-[10px] shadow-md"
      style={{ color: ink }}
    >
      <span className="rounded px-1.5 py-0.5" style={{ background: "oklch(0.95 0.02 280)" }}>
        Rename
      </span>
      <span className="px-1.5 py-0.5">Duplicate</span>
      <span className="px-1.5 py-0.5 text-[oklch(0.55_0.2_25)]">Delete</span>
    </span>
  ),
  Input: (
    <span className="flex w-32 items-center rounded-md border border-black/15 bg-white px-2 py-1.5 text-[10px] text-black/40">
      name@kestrel.dev
    </span>
  ),
  Badge: (
    <span className="flex gap-1.5 text-[10px] font-medium">
      <span className="rounded-full px-2 py-0.5 text-white" style={{ background: accent }}>
        New
      </span>
      <span className="rounded-full bg-black/10 px-2 py-0.5" style={{ color: ink }}>
        Draft
      </span>
    </span>
  ),
  Tabs: (
    <span className="flex rounded-md bg-black/10 p-0.5 text-[10px]" style={{ color: ink }}>
      <span className="rounded bg-white px-2 py-0.5 shadow-sm">Week</span>
      <span className="px-2 py-0.5">Month</span>
      <span className="px-2 py-0.5">Year</span>
    </span>
  ),
  Avatar: (
    <span className="flex -space-x-1.5">
      {[25, 160, 280].map((hue) => (
        <span
          key={hue}
          className="size-6 rounded-full ring-2 ring-white"
          style={{ background: `oklch(0.7 0.13 ${hue})` }}
        />
      ))}
    </span>
  ),
  Dialog: (
    <span className="flex w-32 flex-col gap-1.5 rounded-lg bg-white p-2 shadow-lg ring-1 ring-black/10">
      <span className="h-1.5 w-16 rounded-full" style={{ background: ink }} />
      <span className="h-1 w-24 rounded-full bg-black/15" />
      <span className="ml-auto h-3 w-9 rounded" style={{ background: accent }} />
    </span>
  ),
  Tooltip: (
    <span className="rounded-md px-2 py-1 text-[10px] text-white shadow" style={{ background: ink }}>
      Copied
    </span>
  )
}

const components: { name: string; uses: number; changed?: string }[] = [
  { name: "Button", uses: 214, changed: "2.4" },
  { name: "Toggle", uses: 38, changed: "2.4" },
  { name: "Menu", uses: 51, changed: "2.4" },
  { name: "Input", uses: 96 },
  { name: "Badge", uses: 73 },
  { name: "Tabs", uses: 29 },
  { name: "Avatar", uses: 64 },
  { name: "Dialog", uses: 22 },
  { name: "Tooltip", uses: 47 }
]

/** Which version of Toggle each project uses, and the boards it's on. */
const toggleUses: { project: string; version: string; boards: string[] }[] = [
  { project: "website", version: "2.4", boards: ["Pricing"] },
  { project: "docs", version: "2.4", boards: ["Docs home"] },
  { project: "dashboard", version: "2.3", boards: ["Billing", "Overview"] },
  { project: "copilot", version: "2.3", boards: ["Inbox"] }
]

function ComponentCard({ name, uses, changed }: { name: string; uses: number; changed?: string }) {
  const picked = name === "Toggle"
  return (
    <div className={`flex flex-col gap-2 rounded-xl border bg-card p-2 ${picked ? "ring-2 ring-foreground/40" : ""}`}>
      <div className="grid h-24 place-items-center rounded-lg bg-[oklch(0.97_0.005_280)]">{previews[name]}</div>
      <span className="flex items-center gap-2 px-1 text-sm">
        <span className="font-mono text-[13px]">{name}</span>
        {changed && (
          <span className="text-[11px]" style={{ color: violet }}>
            changed in {changed}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{uses} uses</span>
      </span>
    </div>
  )
}

/** The picked component: where it lives, what its last release changed, and which projects are behind. */
function ToggleDetail() {
  const behind = toggleUses.filter((use) => use.version !== "2.4")
  return (
    <aside className="flex w-[24rem] shrink-0 flex-col overflow-y-auto border-l bg-background">
      <section className="flex flex-col gap-3 border-b px-5 py-5">
        <span className="flex items-center gap-2">
          <span className="font-mono text-base font-medium">Toggle</span>
          <span className="text-[11px]" style={{ color: violet }}>
            changed in 2.4
          </span>
        </span>
        <span className="font-mono text-xs text-muted-foreground">packages/ui/src/toggle.tsx</span>
        <div className="grid h-28 place-items-center rounded-lg bg-[oklch(0.97_0.005_280)]">{previews.Toggle}</div>
        <span className="text-xs text-muted-foreground">
          Props <span className="font-mono text-foreground">checked</span>,{" "}
          <span className="font-mono text-foreground">size</span> <span style={{ color: violet }}>new</span>,{" "}
          <span className="font-mono text-foreground">disabled</span>
        </span>
      </section>
      <section className="flex flex-col gap-2 border-b px-5 py-4">
        <h3 className="text-xs font-medium text-muted-foreground">What 2.4 changed</h3>
        <span className="text-sm">A small size, and the thumb now slides instead of jumping.</span>
      </section>
      <section className="flex flex-col gap-1 border-b px-5 py-4">
        <h3 className="pb-1 text-xs font-medium text-muted-foreground">Used in</h3>
        {toggleUses.map((use) => {
          const shown = portalProject(use.project)
          const old = use.version !== "2.4"
          return (
            <div key={use.project} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{shown.name}</span>
                <span className="truncate text-xs text-muted-foreground">{use.boards.join(", ")}</span>
              </span>
              <span className={`text-xs tabular-nums ${old ? "text-[oklch(0.8_0.15_80)]" : "text-muted-foreground"}`}>
                {use.version}
              </span>
              {old ? (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
                  <RefreshCw /> Update
                </Button>
              ) : (
                <Check className="size-4 text-muted-foreground" aria-label="Up to date" />
              )}
            </div>
          )
        })}
        <span className="pt-1 text-xs text-muted-foreground">
          {behind.length} projects still use 2.3. Updating opens each project's boards at 2.4 to check before anyone
          builds it.
        </span>
      </section>
      <div className="mt-auto flex flex-col gap-2 px-5 py-4">
        <Button size="sm" className="gap-1.5">
          <RefreshCw /> Update both to 2.4
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5">
          <Bot /> Give the update to your agent
        </Button>
      </div>
    </aside>
  )
}

export function LibraryPage() {
  const library = portalProject("library")
  return (
    <PortalPage active="libraries" path="kestrel/libraries/kestrel-ui">
      <div className="flex h-full">
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-8 py-7">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Libraries <ChevronRight className="size-3" /> {library.name}
            </span>
            <div className="-mt-2 flex items-center gap-4">
              <span className="grid size-11 place-items-center rounded-xl text-white" style={{ background: accent }}>
                <Package className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <h1 className="text-xl font-semibold tracking-tight">{library.name}</h1>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  2.4, published by <Avatar person={lena} size={16} /> Lena Fischer{" "}
                  {event("lena-publish").when.toLowerCase()}. Used in 5 projects.
                </span>
              </span>
              <span className="ml-auto flex gap-2">
                <Button variant="outline">Open the canvas</Button>
                <Button>Publish 2.5</Button>
              </span>
            </div>
            <Tabs tabs={["Components", "Tokens", "Releases", "Used in"]} active="Components" />
            <div className="flex items-center justify-between">
              <Pills options={["All 9", "Changed in 2.4", "Not used yet"]} />
              <span className="text-xs text-muted-foreground">Drawn from packages/ui, as the code renders them</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {components.map((component) => (
                <ComponentCard key={component.name} {...component} />
              ))}
            </div>
          </div>
        </main>
        <ToggleDetail />
      </div>
    </PortalPage>
  )
}
