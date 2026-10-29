import type { Meta, StoryObj } from "@storybook/react-vite"
import { AtSign, BellOff, Check, MessageSquare, Settings, Sparkles, X } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { activity, me, people, type Person } from "./explore-data.ts"
import { Avatar, ExploreWindow, type MockTab, MiniScreen } from "./parts.tsx"
import { ActivityRow, TitleBarActions } from "./start-page-parts.tsx"

/**
 * Where notifications go once people collaborate: proposals for an inbox across projects, comments in place on the
 * canvas, a project's own activity, and what interrupts in the moment. Each is shown over an open project.
 */
const meta = {
  title: "Parity/Explorations/Notifications",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const tabs: MockTab[] = [
  { id: "home", title: "Home", home: true, badge: 3 },
  { id: "website", title: "Buildkit website" },
  { id: "dashboard", title: "Better Apps dashboard" }
]

/** Lines standing in for a panel's rows. */
function PanelLines({ count, inset = false }: { count: number; inset?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 p-3">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="h-2 rounded-full bg-muted"
          style={{ width: `${55 + ((index * 37) % 40)}%`, marginLeft: inset && index % 3 ? 14 : 0 }}
        />
      ))}
    </div>
  )
}

/** A comment's pin on a board: who started it, and how many replies. */
function Pin({
  person,
  replies,
  style,
  active
}: {
  person: Person
  replies?: number
  style: CSSProperties
  active?: boolean
}) {
  return (
    <div className="absolute flex items-center gap-1" style={style}>
      <span
        className={`flex items-center gap-1 rounded-full rounded-bl-none bg-background p-0.5 pr-2 shadow-lg ring-1 ${active ? "ring-2 ring-[oklch(0.65_0.18_250)]" : "ring-border"}`}
      >
        <Avatar person={person} size={22} />
        {replies !== undefined && <span className="text-[11px] text-muted-foreground">{replies}</span>}
      </span>
    </div>
  )
}

/** An open project, simplified: layers, the canvas with two boards, the inspector and the status bar. */
function Project({ children, right, pins = true }: { children?: ReactNode; right?: ReactNode; pins?: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="w-56 shrink-0 border-r">
          <div className="border-b px-3 py-2 text-xs font-medium">Layers</div>
          <PanelLines count={14} inset />
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0c0c0f]">
          <div className="absolute top-[10%] left-[6%] flex w-[52%] flex-col gap-2">
            <span className="text-xs font-medium text-white/60">Pricing</span>
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl ring-1 ring-white/10">
              <MiniScreen kind="marketing" hue={162} />
            </div>
          </div>
          <div className="absolute top-[14%] left-[64%] flex w-[16%] flex-col gap-2">
            <span className="text-xs font-medium text-white/60">Pricing, mobile</span>
            <div className="relative aspect-[9/18] overflow-hidden rounded-xl ring-1 ring-white/10">
              <MiniScreen kind="marketing" hue={162} dark />
            </div>
          </div>
          {pins && (
            <>
              <Pin person={people.maya} replies={2} style={{ left: "38%", top: "34%" }} active />
              <Pin person={people.jonas} style={{ left: "16%", top: "52%" }} />
              <Pin person={people.priya} replies={1} style={{ left: "75%", top: "22%" }} />
            </>
          )}
          {children}
        </div>
        {right ?? (
          <div className="w-64 shrink-0 border-l">
            <div className="border-b px-3 py-2 text-xs font-medium">Design</div>
            <PanelLines count={12} />
          </div>
        )}
      </div>
      <div className="flex h-7 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
        <span>Better Apps dashboard</span>
        <span className="ml-auto">Saved</span>
      </div>
    </div>
  )
}

/**
 * Inbox in the title bar: a bell beside your avatar, on every tab, opens notifications from every project. Mentions and
 * replies come first; activity and agents' work each have their own view.
 */
export const TitleBarInbox: Story = {
  render: () => (
    <ExploreWindow tabs={tabs} active="dashboard" actions={<TitleBarActions />}>
      <Project />
      <div className="absolute top-1 right-[156px] z-10 flex w-[25rem] flex-col overflow-hidden rounded-xl border bg-popover shadow-2xl">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="text-sm font-semibold">Inbox</span>
          <span className="ml-auto text-xs text-muted-foreground">Mark all read</span>
          <Settings className="size-4 text-muted-foreground" />
        </div>
        <div className="flex gap-1 border-b px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 font-medium">
            <AtSign className="size-3.5" /> For you <span className="text-xs text-muted-foreground">3</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-muted-foreground">
            <MessageSquare className="size-3.5" /> All
          </span>
          <span className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-muted-foreground">
            <Sparkles className="size-3.5" /> Agents
          </span>
        </div>
        <div className="flex max-h-[30rem] flex-col gap-0.5 overflow-y-auto p-2">
          <span className="px-3 pt-1 pb-1 text-xs font-medium text-muted-foreground">Today</span>
          {activity
            .filter((item) => item.day === "Today")
            .map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          <span className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">Earlier</span>
          {activity
            .filter((item) => item.day !== "Today")
            .map((item) => (
              <ActivityRow key={item.id} item={item} compact />
            ))}
        </div>
        <div className="flex items-center gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <BellOff className="size-3.5" /> Pause notifications
          <span className="ml-auto">Email a daily summary</span>
        </div>
      </div>
    </ExploreWindow>
  )
}

/** A comment thread, open beside its pin. */
function Thread() {
  return (
    <div className="absolute top-[30%] left-[44%] z-10 flex w-80 flex-col rounded-xl border bg-popover shadow-2xl">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        Pricing, Plan cards
        <span className="ml-auto flex gap-2">
          <Check className="size-3.5" />
          <X className="size-3.5" />
        </span>
      </div>
      <div className="flex flex-col gap-3 p-3">
        {[
          {
            who: people.maya,
            text: "@Andrew can we drop the annual toggle here? It fights with the plan cards.",
            when: "8 min ago"
          },
          {
            who: people.claude,
            text: "I can move it above the cards as a segmented control. Want me to try it in a new state?",
            when: "6 min ago"
          },
          { who: people.jonas, text: "+1, and keep the savings badge.", when: "2 min ago" }
        ].map((comment) => (
          <div key={comment.when} className="flex gap-2.5">
            <Avatar person={comment.who} size={24} />
            <div className="flex min-w-0 flex-col gap-0.5 text-sm">
              <span className="text-xs">
                <span className="font-medium">{comment.who.name}</span>{" "}
                <span className="text-muted-foreground">{comment.when}</span>
              </span>
              <span className="text-foreground/90">{comment.text}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="m-3 mt-0 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
        Reply, @ to mention
      </div>
    </div>
  )
}

/** A notification that arrives while you work: only for mentions and replies to you. */
function Toast({ who, children, action }: { who: Person; children: ReactNode; action: string }) {
  return (
    <div className="flex w-[23rem] gap-3 rounded-xl border bg-popover p-3 shadow-2xl">
      <Avatar person={who} size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <span className="text-muted-foreground">{children}</span>
        <div className="flex gap-2">
          <Button size="xs">{action}</Button>
          <Button size="xs" variant="ghost">
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * In place on the canvas: comments are pins on the boards, a thread opens beside its pin (agents can answer there too),
 * and a mention or reply from another project arrives as a toast you can act on. The Home tab's dot says there's more.
 */
export const OnTheCanvas: Story = {
  render: () => (
    <ExploreWindow tabs={tabs} active="dashboard" actions={<TitleBarActions />}>
      <Project>
        <Thread />
      </Project>
      <div className="absolute right-4 bottom-12 z-10">
        <Toast who={people.jonas} action="Open">
          <span className="font-medium text-foreground">Jonas Weber</span> replied on{" "}
          <span className="font-medium text-foreground">Level select</span> in SpawnKit: “Pushed the new tiles.”
        </Toast>
      </div>
    </ExploreWindow>
  )
}

/**
 * A project's own activity, as a panel beside the inspector: its comments, changes and agents' runs, filtered to this
 * project. The cross-project inbox stays in the title bar.
 */
export const ProjectActivityPanel: Story = {
  render: () => (
    <ExploreWindow tabs={tabs} active="dashboard" actions={<TitleBarActions />}>
      <Project
        right={
          <div className="flex w-80 shrink-0 flex-col border-l">
            <div className="flex gap-1 border-b px-2 py-1.5 text-xs">
              <span className="rounded-md px-2.5 py-1 text-muted-foreground">Design</span>
              <span className="rounded-md bg-muted px-2.5 py-1 font-medium">
                Comments <span className="text-muted-foreground">3</span>
              </span>
              <span className="rounded-md px-2.5 py-1 text-muted-foreground">History</span>
            </div>
            <div className="flex flex-col gap-0.5 p-2">
              {[
                {
                  who: people.maya,
                  design: "Pricing",
                  text: "@Andrew can we drop the annual toggle here?",
                  when: "8 min ago",
                  unread: true
                },
                {
                  who: people.priya,
                  design: "Pricing, mobile",
                  text: "The plan names wrap on small phones.",
                  when: "1 h ago",
                  unread: true
                },
                {
                  who: me,
                  design: "Checkout",
                  text: "Resolved: the coupon field moved below the total.",
                  when: "Yesterday"
                }
              ].map((comment) => (
                <div key={comment.when} className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40">
                  <Avatar person={comment.who} size={26} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px]">
                    <span className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {comment.who === me ? "You" : comment.who.name}
                      </span>{" "}
                      on {comment.design}
                    </span>
                    <span className="text-foreground/90">{comment.text}</span>
                    <span className="text-xs text-muted-foreground">{comment.when}</span>
                  </div>
                  {comment.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[oklch(0.65_0.18_250)]" />}
                </div>
              ))}
              <div className="mt-2 border-t px-2 pt-3 text-xs font-medium text-muted-foreground">
                Agents in this project
              </div>
              <div className="flex items-center gap-2.5 px-2 py-2 text-[13px]">
                <Avatar person={people.claude} size={26} />
                <div className="flex flex-col">
                  <span>Tighten the plan cards</span>
                  <span className="text-xs text-muted-foreground">Claude Code changed 4 designs, 1 h ago</span>
                </div>
              </div>
            </div>
          </div>
        }
      />
    </ExploreWindow>
  )
}
