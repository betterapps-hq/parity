/** The inbox: everything that needs you across Kestrel, and the open one beside its design, with its thread. */
import { Check, ChevronRight, ExternalLink, Monitor } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { ThreadData } from "../collaboration/collab-data.ts"
import { Thread } from "../collaboration/comments.tsx"
import { CommentPin } from "../collaboration/pins.tsx"
import { people } from "../explore-data.ts"
import { ActivityRow } from "../start-page-parts.tsx"
import { event, needsYou, portalProject } from "./data.ts"
import { Pills, PortalPage } from "./parts.tsx"
import { PricingPhoneAt } from "./pricing-render.tsx"

const { maya, jonas, priya } = people

/** What's for you but doesn't need you, newest first: a reply, a resolved thread, an invite. */
const earlier = ["jonas-reply", "lena-resolve", "sam-reply"].map(event)

/** The thread Jonas mentioned you in, on Pricing's phone board at v14, with Save 20% in the toggle. */
const toggleThread: ThreadData = {
  id: "toggle",
  design: "Pricing",
  layer: "Billing toggle",
  frame: "Phone",
  unread: true,
  comments: [
    {
      id: "toggle-1",
      author: jonas,
      when: event("jonas-mention").when,
      text: "@Andrew Craswell can we drop the annual toggle on phones? With Save 20% in it, it's wider than the {Plan cards}.",
      reactions: [{ emoji: "👍", by: [priya] }]
    },
    {
      id: "toggle-2",
      author: maya,
      when: "5 min ago",
      text: "Fine by me on phones. Desktop keeps it: that's what v14 is about."
    }
  ]
}

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
  return (
    <PortalPage active="inbox" path="kestrel/inbox">
      <div className="flex h-full">
        <div className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto border-r px-4 py-6">
          <div className="flex items-center justify-between px-1">
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <span className="text-xs text-muted-foreground">Mark all read</span>
          </div>
          <div className="px-1">
            <Pills options={["All", "Mentions", "Reviews", "Requests", "Agents"]} />
          </div>
          <h2 className="px-1 pt-1 text-xs font-medium text-muted-foreground">Needs you, {needsYou.length}</h2>
          <div className="flex flex-col gap-1">
            {needsYou.map((item, index) => (
              <div key={item.id} className={index === 0 ? "rounded-lg bg-muted/70 ring-1 ring-border" : ""}>
                <ActivityRow item={item} />
              </div>
            ))}
          </div>
          <h2 className="px-1 pt-1 text-xs font-medium text-muted-foreground">Updates for you</h2>
          <div className="flex flex-col gap-1">
            {earlier.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-5 py-3 text-sm whitespace-nowrap">
            <span className="text-muted-foreground">Kestrel website</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium">Pricing</span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Check /> Done
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Monitor /> Open in the desktop app
              </Button>
              <Button size="sm" className="gap-1.5">
                <ExternalLink /> Open the canvas
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0f0f12] px-6 pt-8">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(60% 50% at 30% 20%, oklch(0.55 0.14 ${website.look.hue} / 0.16), transparent 70%)`
                }}
              />
              <div className="relative mx-auto w-[280px]">
                <span className="text-[11px] font-medium text-white/55">
                  Pricing <span className="text-white/35">Phone, v14</span>
                </span>
                <div className="relative mt-2">
                  <div className="overflow-hidden rounded-[5px] shadow-[0_16px_40px_-10px_rgb(0_0_0/0.7)] ring-1 ring-white/10">
                    <PricingPhoneAt look={website.look} version={14} />
                  </div>
                  <Pin left="80%" top="32%">
                    <CommentPin people={[jonas, maya]} state="selected" replies={1} />
                  </Pin>
                </div>
                <p className="mt-5 text-center text-xs text-white/45">The board as it is now, with its open thread.</p>
              </div>
            </div>
            <div className="w-[23.5rem] shrink-0 overflow-y-auto border-l p-3">
              <Thread thread={toggleThread} />
            </div>
          </div>
        </div>
      </div>
    </PortalPage>
  )
}
