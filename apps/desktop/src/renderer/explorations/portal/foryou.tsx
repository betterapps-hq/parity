/**
 * For you: a digest, as the start page's For you is. Everything waiting on you is one line with its one or two actions
 * on it, so you can answer most of it from here, and what happened in your projects since you were last here follows
 * close under it. Your teammates and agents, and where to jump back in, are at the side.
 */
import { AtSign, Eye, GitMerge, MessageSquare, Package, Sparkles, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type ActivityKind, me } from "../explore-data.ts"
import { Avatar } from "../parts.tsx"
import { ActivityRow, ActivityText } from "../start-page-parts.tsx"
import { CanvasArt } from "../start/page.tsx"
import { deliverable } from "./boards.ts"
import { events, needsYou, portalProject, type PortalEvent, workingNow } from "./data.ts"
import { PortalHeader, PortalPage, PullRequestLink, SeeAll, WhereaboutsRow } from "./parts.tsx"

const kindIcons: Record<ActivityKind, typeof AtSign> = {
  mention: AtSign,
  comment: MessageSquare,
  agent: Sparkles,
  review: Eye,
  merge: GitMerge,
  publish: Package,
  invite: UserPlus
}

/** What you can do about each thing from here: the main action, and a second one where there is one. */
const actions: Record<string, { main: string; also?: string }> = {
  "jonas-mention": { main: "Reply" },
  "maya-change": { main: "See what changed" },
  "cursor-question": { main: "Answer" },
  "ivy-access": { main: "Let Ivy comment", also: "Deny" },
  "noah-seat": { main: "Approve", also: "Deny" },
  "claude-run": { main: "See what changed" },
  "priya-review": { main: "Review" }
}

/** Something waiting on you, as one line: who did what where, what they said, and what to do about it. */
function NeedsYouRow({ item }: { item: PortalEvent }) {
  const Icon = kindIcons[item.kind]
  const action = actions[item.id]!
  // A board you're building links its pull request, so you can go straight to the code.
  const pr = item.id === "maya-change" ? deliverable("website", "Pricing").code?.pr : undefined
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40">
      <span className="relative h-fit shrink-0">
        <Avatar person={item.who} size={28} />
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-background ring-1 ring-border">
          <Icon className="size-2.5 text-muted-foreground" />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px] leading-snug text-muted-foreground">
        <span className="truncate">
          <ActivityText item={item} />
        </span>
        {item.quote && <span className="line-clamp-2 text-foreground/80">{item.quote}</span>}
      </span>
      <span className="flex w-60 shrink-0 items-center justify-end gap-1">
        {pr && (
          <span className="mr-1">
            <PullRequestLink pr={pr} />
          </span>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs">
          {action.main}
        </Button>
        {action.also && (
          <Button size="sm" variant="ghost" className="h-7 text-xs">
            {action.also}
          </Button>
        )}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{item.when}</span>
      <span
        className={`size-2 shrink-0 rounded-full ${item.unread ? "bg-[oklch(0.65_0.18_250)]" : ""}`}
        aria-label={item.unread ? "Unread" : undefined}
      />
    </div>
  )
}

/** Since you were last here: what happened in your projects that doesn't need you. */
const since = events.filter((item) => !item.needsYou && item.who !== me && item.ago < 24 * 60)

export function ForYouPage() {
  return (
    <PortalPage active="home" path="kestrel">
      <div className="flex min-h-full">
        <main className="min-w-0 flex-1">
          <div className="flex max-w-3xl flex-col gap-6 px-8 py-7">
            <div className="flex flex-col gap-1">
              <PortalHeader title="For you" />
              <span className="text-sm text-muted-foreground">
                {needsYou.length} things need you. {since.length} more happened in your projects since you were last
                here.
              </span>
            </div>
            <section className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-3 pb-1">
                <h2 className="text-sm font-semibold">
                  Needs you <span className="font-normal text-muted-foreground tabular-nums">{needsYou.length}</span>
                </h2>
                <SeeAll>Inbox</SeeAll>
              </div>
              <div className="-mx-3 flex flex-col">
                {needsYou.map((item) => (
                  <NeedsYouRow key={item.id} item={item} />
                ))}
              </div>
            </section>
            <section className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-3 pb-1">
                <h2 className="text-sm font-semibold">Since you were last here</h2>
                <SeeAll>All activity</SeeAll>
              </div>
              <div className="-mx-3 flex flex-col">
                {since.map((item) => (
                  <ActivityRow key={item.id} item={item} compact />
                ))}
              </div>
            </section>
          </div>
        </main>
        <aside className="flex w-80 shrink-0 flex-col gap-7 border-l bg-neutral-50/50 p-5 dark:bg-[#0d0d0f]">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Working now</h2>
              <SeeAll>Your teams</SeeAll>
            </div>
            <div className="-mx-2 flex flex-col">
              {workingNow.map((where) => (
                <WhereaboutsRow key={where.who.name} where={where} />
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Jump back in</h2>
              <SeeAll>Recents</SeeAll>
            </div>
            {["website", "spawnkit", "dashboard"].map((id) => {
              const shown = portalProject(id)
              return (
                <div key={id} className="flex items-center gap-3">
                  <CanvasArt
                    project={shown}
                    design={shown.designs[0]!}
                    live={false}
                    className="w-20 shrink-0 rounded-md"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{shown.name}</span>
                    <span className="truncate text-xs text-muted-foreground">Edited {shown.edited}</span>
                  </span>
                </div>
              )
            })}
          </section>
        </aside>
      </div>
    </PortalPage>
  )
}
