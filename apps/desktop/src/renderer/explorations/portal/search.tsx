/**
 * Search results, from the search field down the side or Ctrl K's "See all results": everything in Kestrel you can
 * open, grouped by kind, with the matching part marked. Components come from each project's code, with their files,
 * so a developer can search for a component and land on every board that uses it.
 */
import { Component, MessageSquare, Settings } from "lucide-react"
import type { ReactNode } from "react"
import { people } from "../explore-data.ts"
import { Avatar } from "../parts.tsx"
import { DesignRender } from "../start/renders.tsx"
import { designOf, event, handoff, portalProject } from "./data.ts"
import { HandoffPill, Pills, PortalPage, searchQuery } from "./parts.tsx"

const { jonas, sam } = people

/** A name with the part that matches the search marked. */
function Match({ text }: { text: string }) {
  const at = text.toLowerCase().indexOf(searchQuery)
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-[oklch(0.7_0.16_275)]/30 px-px text-foreground">
        {text.slice(at, at + searchQuery.length)}
      </mark>
      {text.slice(at + searchQuery.length)}
    </>
  )
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="flex items-baseline gap-2 px-2 pb-1 text-sm font-semibold">
        {title} <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  )
}

const designs: { project: string; design: string; found: string }[] = [
  { project: "website", design: "Pricing", found: "Plans that grow with your team" },
  { project: "dashboard", design: "Billing", found: "Team plan, and the plan cards" },
  { project: "library", design: "Components", found: "PlanCard in Kestrel UI's examples" }
]

const components: { name: string; project: string; file: string; uses: string }[] = [
  { name: "PlanCard", project: "website", file: "src/components/pricing/plan-card.tsx", uses: "3 uses on Pricing" },
  { name: "PlanCard", project: "dashboard", file: "src/billing/PlanCard.tsx", uses: "3 uses on Billing" },
  { name: "PlanBadge", project: "dashboard", file: "src/billing/PlanBadge.tsx", uses: "1 use on Billing" }
]

export function SearchPage() {
  const mention = event("jonas-mention")
  return (
    <PortalPage active="search" path={`kestrel/search?q=${searchQuery}`}>
      <div className="flex min-h-full">
        <main className="min-w-0 flex-1">
          <div className="flex max-w-3xl flex-col gap-6 px-8 py-7">
            <h1 className="text-xl font-semibold tracking-tight">
              9 results for “{searchQuery}” <span className="font-normal text-muted-foreground">in Kestrel</span>
            </h1>
            <Pills options={["All 9", "Designs 3", "Components 3", "Comments 2", "Settings 1"]} />
            <Group title="Designs" count={designs.length}>
              {designs.map((hit) => {
                const shown = portalProject(hit.project)
                const design = designOf(shown, hit.design)
                const status = handoff[`${hit.project}/${hit.design}`]
                return (
                  <div
                    key={`${hit.project}/${hit.design}`}
                    className="flex items-center gap-4 rounded-lg px-2 py-2 hover:bg-muted/40"
                  >
                    <span className="w-28 shrink-0 overflow-hidden rounded-[4px] ring-1 ring-border">
                      <DesignRender kind={design.kind} look={shown.look} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {design.name} <span className="font-normal text-muted-foreground">in {shown.name}</span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        <Match text={hit.found} />
                      </span>
                    </span>
                    {status && <HandoffPill status={status} />}
                  </div>
                )
              })}
            </Group>
            <Group title="Components" count={components.length}>
              {components.map((hit) => (
                <div
                  key={`${hit.project}/${hit.name}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40"
                >
                  <Component className="size-4 shrink-0 text-[oklch(0.7_0.2_304)]" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[13px]">
                        <Match text={hit.name} />
                      </span>
                      <span className="text-xs text-muted-foreground">{portalProject(hit.project).name}</span>
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{hit.file}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{hit.uses}</span>
                </div>
              ))}
            </Group>
            <Group title="Comments" count={2}>
              {[
                { who: jonas, where: "Pricing in Kestrel website", text: mention.quote!, when: mention.when },
                {
                  who: sam,
                  where: "Billing in Cloud console",
                  text: event("sam-comment").quote!,
                  when: event("sam-comment").when
                }
              ].map((hit) => (
                <div key={hit.text} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
                  <Avatar person={hit.who} size={24} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                    <span>
                      <Match text={hit.text} />
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MessageSquare className="size-3" /> {hit.who.name} on {hit.where}, {hit.when.toLowerCase()}
                    </span>
                  </span>
                </div>
              ))}
            </Group>
            <Group title="Settings" count={1}>
              <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
                <Settings className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col gap-0.5 text-sm">
                  <span>
                    <Match text="Plans" />, in Billing
                  </span>
                  <span className="text-xs text-muted-foreground">Kestrel is on Organization</span>
                </span>
              </div>
            </Group>
          </div>
        </main>
        <aside className="flex w-64 shrink-0 flex-col gap-5 border-l px-5 py-7 text-sm">
          {[
            ["Project", "All projects"],
            ["Team", "Any team"],
            ["Changed", "Any time"],
            ["By", "Anyone"]
          ].map(([label, value]) => (
            <span key={label} className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="rounded-md border px-2.5 py-1.5 text-xs">{value}</span>
            </span>
          ))}
          <span className="text-xs text-muted-foreground">
            Search finds what you can open. Projects you can't see stay out of the results.
          </span>
        </aside>
      </div>
    </PortalPage>
  )
}
