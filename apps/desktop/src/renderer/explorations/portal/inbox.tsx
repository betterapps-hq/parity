/** The inbox: everything that needs you across Kestrel, and the open one beside its design, with its thread. */
import { Check, ChevronRight, ExternalLink, Monitor } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { thread } from "../collaboration/collab-data.ts"
import { Thread } from "../collaboration/comments.tsx"
import { CommentPin } from "../collaboration/pins.tsx"
import { type Activity, me, people } from "../explore-data.ts"
import { ActivityRow } from "../start-page-parts.tsx"
import { DesignRender } from "../start/renders.tsx"
import { designOf, portalProject } from "./data.ts"
import { Pills, PortalPage } from "./parts.tsx"

const { maya, jonas, priya, sam, lena, claude, cursor } = people

const today: Activity[] = [
  {
    id: "maya-mention",
    kind: "mention",
    who: maya,
    project: "Kestrel website",
    design: "Pricing",
    action: "mentioned you on",
    quote: "@Andrew can we drop the annual toggle here? It fights with the plan cards.",
    when: "8 min ago",
    day: "Today",
    unread: true
  },
  {
    id: "cursor-question",
    kind: "agent",
    who: cursor,
    project: "Walkies",
    action: "is waiting on you in",
    quote: "Should bookings take payment up front, or after the walk?",
    when: "20 min ago",
    day: "Today",
    unread: true
  },
  {
    id: "claude-review",
    kind: "agent",
    who: claude,
    project: "Cloud console",
    design: "Billing",
    action: "wants your review on",
    quote: "Tighten the plan cards: 2 designs changed.",
    when: "1 h ago",
    day: "Today",
    unread: true
  },
  {
    id: "priya-review",
    kind: "review",
    who: priya,
    project: "Help center",
    design: "Docs home",
    action: "asked you to review",
    when: "2 h ago",
    day: "Today",
    unread: true
  }
]

const earlier: Activity[] = [
  {
    id: "jonas-reply",
    kind: "comment",
    who: jonas,
    project: "Ember Caves",
    design: "Level select",
    action: "replied to you on",
    quote: "Pushed the new tiles. The locked state reads much better now.",
    when: "Yesterday",
    day: "Yesterday"
  },
  {
    id: "lena-reply",
    kind: "comment",
    who: lena,
    project: "Kestrel website",
    design: "Checkout",
    action: "resolved your thread on",
    quote: "Perfect.",
    when: "Yesterday",
    day: "Yesterday"
  },
  {
    id: "sam-invite",
    kind: "invite",
    who: sam,
    project: "Relay",
    action: "invited you to",
    when: "2 days ago",
    day: "This week"
  }
]

/** A pin on the preview, its point at a share of the design's width and height. */
function Pin({ left, top, children }: { left: string; top: string; children: ReactNode }) {
  return (
    <div className="absolute z-10 -translate-y-full" style={{ left, top }}>
      {children}
    </div>
  )
}

export function InboxPage() {
  const website = portalProject("website")
  const pricing = designOf(website, "Pricing")
  return (
    <PortalPage active="inbox" path="kestrel/inbox">
      <div className="flex h-full">
        <div className="flex w-[400px] shrink-0 flex-col gap-4 overflow-y-auto border-r px-4 py-6">
          <div className="flex items-center justify-between px-1">
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <span className="text-xs text-muted-foreground">Mark all read</span>
          </div>
          <div className="px-1">
            <Pills options={["All", "Mentions", "Reviews", "Agents"]} />
          </div>
          <h2 className="px-1 pt-1 text-xs font-medium text-muted-foreground">Today</h2>
          <div className="flex flex-col gap-1">
            {today.map((item, index) => (
              <div key={item.id} className={index === 0 ? "rounded-lg bg-muted/70 ring-1 ring-border" : ""}>
                <ActivityRow item={item} />
              </div>
            ))}
          </div>
          <h2 className="px-1 pt-1 text-xs font-medium text-muted-foreground">Earlier</h2>
          <div className="flex flex-col gap-1">
            {earlier.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-5 py-3 text-sm">
            <span className="text-muted-foreground">Kestrel website</span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="font-medium">Pricing</span>
            <span className="ml-2 text-xs text-muted-foreground">Billing toggle, Desktop</span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Check /> Done
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Monitor /> Open in the desktop app
              </Button>
              <Button size="sm" className="gap-1.5">
                <ExternalLink /> Open on the canvas
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0f0f12] px-10 pt-12">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(60% 50% at 30% 20%, oklch(0.55 0.14 ${website.look.hue} / 0.16), transparent 70%)`
                }}
              />
              <div className="relative mx-auto max-w-[600px]">
                <span className="text-[11px] font-medium text-white/55">
                  Pricing <span className="text-white/35">Desktop</span>
                </span>
                <div className="relative mt-2">
                  <div className="overflow-hidden rounded-[5px] shadow-[0_16px_40px_-10px_rgb(0_0_0/0.7)] ring-1 ring-white/10">
                    <DesignRender kind={pricing.kind} look={website.look} />
                  </div>
                  <Pin left="61%" top="27%">
                    <CommentPin people={[maya, claude, jonas]} state="selected" replies={2} />
                  </Pin>
                  <Pin left="38%" top="58%">
                    <CommentPin people={[priya, me]} state="working" replies={1} />
                  </Pin>
                  <Pin left="86%" top="9%">
                    <CommentPin people={[lena]} state="unread" />
                  </Pin>
                </div>
                <p className="mt-5 text-center text-xs text-white/45">
                  A preview of the board as it is now. Open it on the canvas to reply in place.
                </p>
              </div>
            </div>
            <div className="w-[380px] shrink-0 overflow-y-auto border-l p-3">
              <Thread thread={{ ...thread("toggle"), frame: "Desktop" }} />
            </div>
          </div>
        </div>
      </div>
    </PortalPage>
  )
}
