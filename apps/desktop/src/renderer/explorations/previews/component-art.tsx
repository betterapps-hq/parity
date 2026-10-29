import {
  Bell,
  Check,
  CircleAlert,
  Component as ComponentIcon,
  Diamond,
  EyeOff,
  FolderOpen,
  MonitorSmartphone,
  MoreHorizontal,
  Plug,
  RefreshCw,
  Search,
  Server,
  SquareDashed
} from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import type { ArtName, PreviewState, SampleComponent } from "./preview-data.ts"

/**
 * The example's light theme, as its frames draw it. The drawings below stand in for the bitmaps the offscreen renderer
 * would make: in the app each is an `<img>` of the real component, never a live render.
 */
const look = {
  "--a-bg": "oklch(1 0 0)",
  "--a-fg": "oklch(0.145 0 0)",
  "--a-primary": "oklch(0.205 0 0)",
  "--a-primary-fg": "oklch(0.985 0 0)",
  "--a-muted": "oklch(0.97 0 0)",
  "--a-muted-fg": "oklch(0.556 0 0)",
  "--a-border": "oklch(0.922 0 0)",
  "--a-destructive": "oklch(0.577 0.245 27.325)",
  "--a-chart": "oklch(0.646 0.222 41.116)",
  "--a-good": "oklch(0.6 0.15 155)",
  fontFamily: "'Geist Variable', sans-serif",
  color: "var(--a-fg)"
} as CSSProperties

function Face({ name, hue, size = 32 }: { name: string; hue: number; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `oklch(0.62 0.12 ${hue})` }}
    >
      {name
        .split(" ")
        .map((part) => part[0])
        .join("")}
    </span>
  )
}

const buttonTones: Record<string, string> = {
  default: "bg-(--a-primary) text-(--a-primary-fg)",
  destructive: "bg-(--a-destructive) text-white",
  outline: "border border-(--a-border) bg-(--a-bg) shadow-xs",
  secondary: "bg-(--a-muted) text-(--a-fg)",
  ghost: "text-(--a-fg)",
  link: "text-(--a-fg) underline underline-offset-4"
}

function Button({ variant = "default", children = "Button" }: { variant?: string; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap ${buttonTones[variant] ?? buttonTones.default}`}
    >
      {children}
    </span>
  )
}

function Badge({ variant = "default", children = "Badge" }: { variant?: string; children?: ReactNode }) {
  const tone =
    variant === "outline"
      ? "border border-(--a-border)"
      : variant === "secondary"
        ? "bg-(--a-muted)"
        : variant === "destructive"
          ? "bg-(--a-destructive) text-white"
          : "bg-(--a-primary) text-(--a-primary-fg)"
  return (
    <span className={`inline-flex h-[22px] items-center rounded-md px-2 text-xs font-medium whitespace-nowrap ${tone}`}>
      {children}
    </span>
  )
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-xl border border-(--a-border) bg-(--a-bg) shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function Line({ width, tone = "muted" }: { width: number | string; tone?: "muted" | "ink" }) {
  return (
    <span
      className="block h-2 rounded-full"
      style={{ width, background: tone === "ink" ? "var(--a-fg)" : "var(--a-border)" }}
    />
  )
}

/** The page shell the example's screens share: its sidebar and top bar, around whatever the page shows. */
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-[800px] w-[1280px] bg-(--a-bg)">
      <div className="flex w-60 shrink-0 flex-col gap-1 border-r border-(--a-border) bg-(--a-muted) p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-(--a-primary) text-xs text-(--a-primary-fg)">
            A
          </span>
          Acme
        </div>
        {["Home", "Projects", "Team", "Reports", "Billing", "Settings"].map((item) => (
          <span
            key={item}
            className={`rounded-md px-3 py-2 text-sm ${item === title ? "bg-(--a-bg) font-medium shadow-xs" : "text-(--a-muted-fg)"}`}
          >
            {item}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-4 border-b border-(--a-border) px-8">
          <span className="text-lg font-semibold">{title}</span>
          <span className="ml-auto flex h-9 w-72 items-center gap-2 rounded-md border border-(--a-border) px-3 text-sm text-(--a-muted-fg)">
            <Search className="size-4" /> Search
          </span>
          <Face name="Ana Ruiz" hue={30} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 p-8">{children}</div>
      </div>
    </div>
  )
}

const members = [
  { name: "Ana Ruiz", email: "ana@acme.dev", role: "Owner", hue: 30 },
  { name: "Jonas Berg", email: "jonas@acme.dev", role: "Admin", hue: 200 },
  { name: "Mei Tanaka", email: "mei@acme.dev", role: "Member", hue: 300 },
  { name: "Sam Okafor", email: "sam@acme.dev", role: "Member", hue: 140 }
]

function MemberRow({ member = members[0]! }: { member?: (typeof members)[number] }) {
  return (
    <div className="flex h-14 w-[560px] items-center gap-3 border-b border-(--a-border) bg-(--a-bg) px-4">
      <Face name={member.name} hue={member.hue} size={32} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{member.name}</span>
        <span className="text-xs text-(--a-muted-fg)">{member.email}</span>
      </div>
      <Badge variant={member.role === "Owner" ? "default" : "secondary"}>{member.role}</Badge>
      <MoreHorizontal className="size-4 text-(--a-muted-fg)" />
    </div>
  )
}

function StatCard({ label = "Revenue", value = "$45,231", change = "+20.1% from last month" }) {
  return (
    <Card className="w-60 gap-1 p-5">
      <span className="text-sm text-(--a-muted-fg)">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-xs text-(--a-good)">{change}</span>
    </Card>
  )
}

/** Draws a component as its bitmap would show it, at its own size. */
function Drawing({ art, variant }: { art: ArtName; variant?: string }) {
  switch (art) {
    case "button":
      return <Button variant={variant} />
    case "button-outline":
      return <Button variant="outline" />
    case "badge":
      return <Badge variant={variant} />
    case "card":
      return (
        <Card className="w-80 gap-4 py-5">
          <div className="flex flex-col gap-1 px-5">
            <span className="font-semibold">Card title</span>
            <span className="text-sm text-(--a-muted-fg)">Card description</span>
          </div>
          <div className="flex flex-col gap-2 px-5">
            <Line width="100%" />
            <Line width="72%" />
          </div>
          <div className="flex px-5">
            <Button>Action</Button>
          </div>
        </Card>
      )
    case "input":
      return (
        <span className="flex h-9 w-60 items-center rounded-md border border-(--a-border) bg-(--a-bg) px-3 text-sm text-(--a-muted-fg) shadow-xs">
          Email
        </span>
      )
    case "label":
      return <span className="text-sm font-medium whitespace-nowrap">Email address</span>
    case "tabs":
      return (
        <span className="inline-flex h-9 w-[260px] items-center rounded-lg bg-(--a-muted) p-[3px] text-sm">
          {["Account", "Password", "Team"].map((tab, index) => (
            <span
              key={tab}
              className={`flex h-full flex-1 items-center justify-center rounded-md font-medium ${index === 0 ? "bg-(--a-bg) shadow-sm" : "text-(--a-muted-fg)"}`}
            >
              {tab}
            </span>
          ))}
        </span>
      )
    case "avatar":
      return <Face name="Chloe Nash" hue={256} />
    case "table":
      return (
        <div className="w-[480px] text-sm">
          <div className="flex h-10 items-center border-b border-(--a-border) px-2 font-medium text-(--a-muted-fg)">
            <span className="w-28">Invoice</span>
            <span className="flex-1">Status</span>
            <span>Amount</span>
          </div>
          {[
            ["INV001", "Paid", "$250.00"],
            ["INV002", "Pending", "$150.00"],
            ["INV003", "Unpaid", "$350.00"]
          ].map(([id, status, amount]) => (
            <div key={id} className="flex h-10 items-center border-b border-(--a-border) px-2">
              <span className="w-28 font-medium">{id}</span>
              <span className="flex-1">{status}</span>
              <span>{amount}</span>
            </div>
          ))}
        </div>
      )
    case "empty":
      return (
        <div className="flex w-[360px] flex-col items-center gap-3 rounded-xl border border-dashed border-(--a-border) p-8 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-(--a-muted)">
            <FolderOpen className="size-5" />
          </span>
          <span className="font-medium">No projects yet</span>
          <span className="text-sm text-(--a-muted-fg)">Create a project to start working with your team.</span>
          <Button>Create project</Button>
        </div>
      )
    case "separator":
      return <span className="block h-px w-60 bg-(--a-border)" />
    case "member-row":
      return <MemberRow />
    case "stat-card":
      return <StatCard />
    case "plan-card":
      return (
        <Card className="w-[280px] gap-4 p-6">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Team</span>
            {variant === "Featured" && <Badge>Popular</Badge>}
          </div>
          <span className="text-3xl font-semibold">
            $12<span className="text-sm font-normal text-(--a-muted-fg)"> per member</span>
          </span>
          <div className="flex flex-col gap-2 text-sm">
            {["Unlimited projects", "Shared boards", "Priority support"].map((feature) => (
              <span key={feature} className="flex items-center gap-2">
                <Check className="size-4 text-(--a-good)" /> {feature}
              </span>
            ))}
          </div>
          <Button variant={variant === "Featured" ? "default" : "outline"}>Start a trial</Button>
        </Card>
      )
    case "project-card":
      return (
        <Card className="w-[300px] gap-3 p-5">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Website refresh</span>
            <Badge variant="secondary">Active</Badge>
          </div>
          <span className="text-sm text-(--a-muted-fg)">New landing page and pricing for the spring launch.</span>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {members.slice(0, 3).map((member) => (
                <Face key={member.name} name={member.name} hue={member.hue} size={24} />
              ))}
            </div>
            <span className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-(--a-muted)">
              <span className="block h-full w-2/3 bg-(--a-primary)" />
            </span>
          </div>
        </Card>
      )
    case "activity-item":
      return (
        <div className="flex w-[360px] items-start gap-3 p-2">
          <Face name="Jonas Berg" hue={200} size={28} />
          <div className="flex flex-col text-sm">
            <span>
              <span className="font-medium">Jonas</span> commented on <span className="font-medium">Pricing</span>
            </span>
            <span className="text-xs text-(--a-muted-fg)">12 minutes ago</span>
          </div>
        </div>
      )
    case "usage-meter":
      return (
        <div className="flex w-80 flex-col gap-2 p-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Storage</span>
            <span className="text-(--a-muted-fg)">7.2 of 10 GB</span>
          </div>
          <span className="h-2 overflow-hidden rounded-full bg-(--a-muted)">
            <span className="block h-full w-[72%] rounded-full bg-(--a-primary)" />
          </span>
        </div>
      )
    case "notification-item":
      return (
        <div className="flex w-[380px] items-start gap-3 rounded-lg p-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-(--a-chart)" />
          <div className="flex min-w-0 flex-1 flex-col text-sm">
            <span className="font-medium">Your invoice is ready</span>
            <span className="text-(--a-muted-fg)">INV-0042 for March is ready to download.</span>
          </div>
          <span className="text-xs text-(--a-muted-fg)">2h</span>
        </div>
      )
    case "invoice-row":
      return (
        <div className="flex h-12 w-[520px] items-center gap-4 border-b border-(--a-border) px-3 text-sm">
          <span className="w-24 font-medium">INV-0042</span>
          <span className="flex-1 text-(--a-muted-fg)">Mar 1, 2026</span>
          <Badge variant="secondary">Paid</Badge>
          <span className="w-20 text-right">$1,240.00</span>
        </div>
      )
    case "top-bar":
      return (
        <div className="flex h-14 w-[1280px] items-center gap-6 border-b border-(--a-border) bg-(--a-bg) px-6 text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <span className="grid size-7 place-items-center rounded-md bg-(--a-primary) text-xs text-(--a-primary-fg)">
              A
            </span>
            Acme
          </span>
          {["Overview", "Projects", "Team", "Reports"].map((item, index) => (
            <span key={item} className={index === 0 ? "font-medium" : "text-(--a-muted-fg)"}>
              {item}
            </span>
          ))}
          <span className="ml-auto flex h-9 w-64 items-center gap-2 rounded-md border border-(--a-border) px-3 text-(--a-muted-fg)">
            <Search className="size-4" /> Search
          </span>
          <Bell className="size-4 text-(--a-muted-fg)" />
          <Face name="Ana Ruiz" hue={30} />
        </div>
      )
    case "page-team":
      return (
        <Shell title="Team">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-semibold">Team members</span>
              <span className="text-sm text-(--a-muted-fg)">Invite people and manage what they can do.</span>
            </div>
            <Button>Invite</Button>
          </div>
          <div className="flex flex-col rounded-xl border border-(--a-border)">
            {members.map((member) => (
              <MemberRow key={member.name} member={member} />
            ))}
          </div>
        </Shell>
      )
    case "page-dashboard":
      return (
        <Shell title="Home">
          <div className="flex gap-4">
            <StatCard />
            <StatCard label="Subscriptions" value="+2,350" change="+180.1% from last month" />
            <StatCard label="Active now" value="573" change="+201 since last hour" />
          </div>
          <Card className="h-[340px] gap-4 p-6">
            <span className="font-semibold">Overview</span>
            <div className="flex flex-1 items-end gap-3">
              {[40, 62, 35, 80, 55, 92, 48, 70, 66, 84, 58, 76].map((height, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-t-md bg-(--a-primary)"
                  style={{ height: `${height}%`, opacity: 0.85 }}
                />
              ))}
            </div>
          </Card>
        </Shell>
      )
  }
}

/**
 * A bitmap's place: the component as drawn at its own size, fitted into the box, as an `<img>` with `object-fit:
 * contain` would show it. Small components are shown up to twice their size so they read; pages fill the box's width
 * from the top, like a screenshot. In the app it is an `<img>`; here it stays hidden from screen readers, since the
 * name beside it says what it is.
 */
export function BitmapStandIn({
  component,
  width,
  height,
  variant,
  dim = false
}: {
  component: SampleComponent
  width: number
  height: number
  variant?: string
  dim?: boolean
}) {
  const [naturalWidth, naturalHeight] = component.size ?? [width, height]
  const page = component.group === "pages"
  const pad = page ? 0 : Math.max(4, Math.round(Math.min(width, height) * 0.1))
  // Small components are enlarged on the card, up to twice their size, but only a little in a list.
  const most = width >= 160 ? 2 : 1.25
  const fit = Math.min(most, (width - pad * 2) / naturalWidth, (height - pad * 2) / Math.max(naturalHeight, 1))
  // A wide component fitted whole into a small box is a grey line, so a small box shows its start, readable, instead.
  const least = width < 160 ? 0.2 : 0
  const cropped = !page && fit < least
  const scale = page ? width / naturalWidth : Math.max(fit, least)
  return (
    <span
      aria-hidden
      data-preview={component.name}
      className="relative block overflow-hidden"
      style={{ width, height, background: "oklch(1 0 0)", opacity: dim ? 0.55 : 1 }}
    >
      <span
        inert
        className="pointer-events-none absolute select-none"
        style={{
          ...look,
          width: naturalWidth,
          height: Math.max(naturalHeight, 1),
          left: page ? 0 : cropped ? pad : (width - naturalWidth * scale) / 2,
          top:
            page || (cropped && naturalHeight * scale > height)
              ? pad
              : (height - Math.max(naturalHeight, 1) * scale) / 2,
          transform: `scale(${scale})`,
          transformOrigin: "0 0"
        }}
      >
        <span className="flex size-full items-center justify-center">
          {component.art && <Drawing art={component.art} variant={variant} />}
        </span>
      </span>
    </span>
  )
}

/** What a preview that can't be drawn says instead, short for a thumbnail and longer on a card. */
export const stateWords: Record<PreviewState, { short: string; long: string }> = {
  queued: { short: "Waiting", long: "Waiting its turn" },
  making: { short: "Making", long: "Making a preview" },
  ready: { short: "Ready", long: "Preview" },
  stale: { short: "Updating", long: "Updating after an edit" },
  failed: { short: "Fails", long: "Fails to draw" },
  "needs-props": { short: "Needs props", long: "Needs props to draw" },
  "needs-provider": { short: "Needs provider", long: "Needs a provider" },
  "server-only": { short: "Server only", long: "Only renders on a server" },
  "draws-nothing": { short: "No visual", long: "Draws nothing of its own" }
}

const stateIcons: Partial<Record<PreviewState, typeof CircleAlert>> = {
  failed: CircleAlert,
  "needs-props": SquareDashed,
  "needs-provider": Plug,
  "server-only": Server,
  "draws-nothing": EyeOff
}

const stateTones: Partial<Record<PreviewState, string>> = {
  failed: "text-destructive",
  "needs-props": "text-(--process-starting)",
  "needs-provider": "text-(--process-starting)"
}

/** The icon a component's kind has everywhere: a diamond for a component design, a page for a page. */
export function KindIcon({ component, className = "size-3.5" }: { component: SampleComponent; className?: string }) {
  const Icon = component.group === "designs" ? Diamond : component.group === "pages" ? MonitorSmartphone : ComponentIcon
  return (
    <Icon
      className={`${className} shrink-0`}
      style={{ color: component.group === "pages" ? "var(--canvas-screen)" : "var(--canvas-component)" }}
    />
  )
}

/**
 * A component's preview in a box of any size, in whatever state it's in. Made previews show on the project's own
 * background; the rest show on the panel's muted fill, so a picture is never mistaken for a placeholder.
 */
export function ComponentPreview({
  component,
  width,
  height,
  variant,
  state = component.state,
  className = ""
}: {
  component: SampleComponent
  width: number
  height: number
  variant?: string
  state?: PreviewState
  className?: string
}) {
  const large = width >= 160
  const frame = `relative shrink-0 overflow-hidden rounded-md ${className}`
  if (state === "ready" || state === "stale") {
    return (
      <span className={`${frame} border border-white/10`} style={{ width, height }}>
        <BitmapStandIn
          component={component}
          width={width - 2}
          height={height - 2}
          variant={variant}
          dim={state === "stale"}
        />
        {state === "stale" && (
          <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-background/90 text-muted-foreground">
            <RefreshCw className="size-2.5" />
          </span>
        )}
      </span>
    )
  }
  if (state === "making") {
    return (
      <span
        className={`${frame} grid place-items-center border border-white/10`}
        style={{
          width,
          height,
          background:
            "linear-gradient(100deg, var(--muted) 30%, color-mix(in oklch, var(--muted), var(--foreground) 10%) 50%, var(--muted) 70%) 0 0 / 200% 100%",
          animation: "process-shimmer 1.6s linear infinite"
        }}
        data-process-motion
        aria-hidden
        data-preview={component.name}
        data-preview-state="making"
      >
        {large && <span className="text-xs text-muted-foreground">Making a preview</span>}
      </span>
    )
  }
  const Icon = stateIcons[state]
  return (
    <span
      className={`${frame} flex flex-col items-center justify-center gap-1.5 bg-muted/60 ${state === "needs-props" ? "border border-dashed border-muted-foreground/40" : "border"}`}
      style={{ width, height }}
      aria-hidden
      data-preview={component.name}
      data-preview-state={state}
    >
      {Icon ? (
        <Icon className={`${large ? "size-6" : "size-3.5"} ${stateTones[state] ?? "text-muted-foreground"}`} />
      ) : (
        <KindIcon component={component} className={`${large ? "size-6" : "size-3.5"} opacity-40`} />
      )}
      {large && (
        <span className={`px-4 text-center text-xs ${stateTones[state] ?? "text-muted-foreground"}`}>
          {stateWords[state].long}
          {component.needs && state !== "failed" && (
            <span className="block font-mono text-[11px] text-muted-foreground">{component.needs.join(", ")}</span>
          )}
        </span>
      )}
    </span>
  )
}
