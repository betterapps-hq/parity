import type { Meta, StoryObj } from "@storybook/react-vite"
import type { CSSProperties, ReactNode } from "react"
import { useState } from "react"
import { heroThread, thread, threads } from "./collaboration/collab-data.ts"
import { CommentsPanel, Thread } from "./collaboration/comments.tsx"
import { EmailDigest, Inbox, notices, NoticeToast, NotificationSettings } from "./collaboration/notifications.tsx"
import { CommentPin } from "./collaboration/pins.tsx"
import { me, people } from "./explore-data.ts"
import { ExploreWindow, type MockTab, MiniScreen } from "./parts.tsx"
import { TitleBarActions } from "./start-page-parts.tsx"

/**
 * Where notifications go once people collaborate: an inbox across projects in the title bar, comments in place on the
 * canvas, a project's own comments beside the inspector, what interrupts in the moment, the settings for all of it, and
 * the email summary. Built from the collaboration parts, shown over an open project.
 */
const meta = {
  title: "Parity/Explorations/Notifications",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const tabs: MockTab[] = [
  { id: "home", title: "Home", home: true, badge: 3 },
  { id: "website", title: "Website" },
  { id: "dashboard", title: "Dashboard" }
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

/** A pin on the canvas, its sharp corner at the point. */
function Pin({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return (
    <div className="absolute z-10 -translate-y-full" style={style}>
      {children}
    </div>
  )
}

/** An open project, simplified: layers, the canvas with two boards and their pins, the inspector and the status bar. */
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
              <Pin style={{ left: "38%", top: "34%" }}>
                <CommentPin people={[people.maya, people.claude, people.jonas]} replies={2} state="selected" />
              </Pin>
              <Pin style={{ left: "16%", top: "52%" }}>
                <CommentPin people={[people.sam]} state="unread" />
              </Pin>
              <Pin style={{ left: "75%", top: "22%" }}>
                <CommentPin people={[people.priya, me]} replies={1} state="working" />
              </Pin>
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
        <span>Dashboard</span>
        <span className="ml-auto">Saved</span>
      </div>
    </div>
  )
}

/**
 * The inbox in the title bar: a bell beside your avatar, on every tab, opens notifications from every project. For you
 * comes first; everything and agents' work each have their own view. Open one to mark it read, try Mark all read, Pause,
 * or the gear for the settings.
 */
export const TitleBarInbox: Story = {
  render: () => (
    <ExploreWindow tabs={tabs} active="dashboard" actions={<TitleBarActions />}>
      <Project />
      <Inbox className="absolute top-1 right-[156px] z-10" />
    </ExploreWindow>
  )
}

function ToastDemo() {
  const [shown, setShown] = useState(true)
  return (
    <ExploreWindow tabs={tabs} active="dashboard" actions={<TitleBarActions />}>
      <Project>
        <div className="absolute top-[30%] left-[40%] z-10">
          <Thread thread={thread("toggle")} onClose={() => undefined} />
        </div>
      </Project>
      {shown && (
        <div className="absolute right-4 bottom-12 z-10">
          <NoticeToast notice={notices.find((notice) => notice.kind === "reply")!} onDismiss={() => setShown(false)} />
        </div>
      )}
    </ExploreWindow>
  )
}

/**
 * In place on the canvas: comments are pins on the boards and a thread opens beside its pin. A mention or a reply from
 * elsewhere arrives as a toast; Reply answers it right there, without leaving what you're doing.
 */
export const OnTheCanvas: Story = { render: () => <ToastDemo /> }

/**
 * A project's own comments, as a panel beside the inspector: open, for you, or resolved, grouped by design. The inbox
 * across projects stays in the title bar.
 */
export const ProjectActivityPanel: Story = {
  render: () => (
    <ExploreWindow tabs={tabs} active="dashboard" actions={<TitleBarActions />}>
      <Project
        right={
          <div className="flex w-80 shrink-0 flex-col border-l">
            <div className="flex gap-1 border-b px-2 py-1.5 text-xs">
              <span className="rounded-md px-2.5 py-1 text-muted-foreground">Design</span>
              <span className="rounded-md bg-muted px-2.5 py-1 font-medium">Comments</span>
              <span className="rounded-md px-2.5 py-1 text-muted-foreground">History</span>
            </div>
            <div className="min-h-0 flex-1 [&>aside]:w-full [&>aside]:border-l-0">
              <CommentsPanel threads={[heroThread, ...threads]} selected="toggle" />
            </div>
          </div>
        }
      />
    </ExploreWindow>
  )
}

/**
 * What to be told about, and how: a level for comments, switches for agents, reviews, access requests and issues, then
 * desktop notifications and email. All projects is the default; a project can have its own. Opens from the inbox's
 * gear, and from Preferences.
 */
export const Settings: Story = {
  render: () => (
    <div className="grid min-h-screen place-items-center bg-[#0c0c0f] p-10">
      <div className="w-[25rem] overflow-hidden rounded-xl border bg-popover shadow-2xl">
        <div className="border-b px-4 py-2.5 text-sm font-semibold">Notifications</div>
        <NotificationSettings />
      </div>
    </div>
  )
}

/** The daily summary email, sent only on days something happened: what needs you, each a link to the thread. */
export const EmailSummary: Story = {
  render: () => (
    <div className="grid min-h-screen place-items-center bg-neutral-200 p-10">
      <EmailDigest />
    </div>
  )
}
