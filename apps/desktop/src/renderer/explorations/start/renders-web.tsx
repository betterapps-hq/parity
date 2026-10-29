/**
 * Renders of web app screens: marketing pages, a dashboard, sign-in, docs and a support inbox. Each draws at its real
 * size in a project's look, so a thumbnail is a picture of the design, not a sketch of one.
 */
import {
  ArrowRight,
  Bell,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  CreditCard,
  Download,
  House,
  Inbox as InboxIcon,
  Info,
  Layers,
  LayoutDashboard,
  LibraryBig,
  ListFilter,
  LoaderCircle,
  Menu,
  Paperclip,
  Plus,
  Rocket,
  Search,
  Send,
  Settings,
  Sparkles,
  TriangleAlert,
  Users
} from "lucide-react"
import type { ReactNode } from "react"
import { GitHubMark, GoogleMark } from "../parts.tsx"
import type { Look } from "./data.ts"
import { Brand, BrandMark, curve, display, Face, PhoneStatus, PhoneTabs, plot, Sparkline } from "./render-kit.tsx"

const marketingLinks = ["Product", "Templates", "Docs", "Pricing", "Changelog"]

function SiteNav({ look }: { look: Look }) {
  return (
    <nav className="relative z-10 flex h-[72px] shrink-0 items-center gap-10 px-14">
      <Brand look={look} size={30} />
      <div className="flex gap-7 text-[15px] text-(--r-muted)">
        {marketingLinks.map((link) => (
          <span key={link}>{link}</span>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-5 text-[15px]">
        <span className="font-medium">Sign in</span>
        <span className="rounded-full bg-(--r-fg) px-4 py-2 text-[14px] font-medium text-(--r-bg)">Get started</span>
      </div>
    </nav>
  )
}

/** A soft wash of the brand behind a hero. */
function Glow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute ${className}`}
      style={{
        background:
          "radial-gradient(closest-side, color-mix(in oklch, var(--r-brand) 22%, transparent), transparent), radial-gradient(closest-side, color-mix(in oklch, var(--r-brand-2) 16%, transparent), transparent)",
        backgroundPosition: "30% 40%, 75% 60%",
        backgroundSize: "70% 80%, 60% 70%",
        backgroundRepeat: "no-repeat"
      }}
    />
  )
}

const terminalLines: [string, string][] = [
  ["Template", "SaaS dashboard"],
  ["Who it's for", "Companies and their teams"],
  ["Sign-in", "WorkOS"],
  ["Database", "Cloudflare D1"],
  ["Billing", "Stripe Billing"]
]

/** The Scaffolder at work, as the website shows it. */
function Terminal({ compact }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-[oklch(0.19_0.01_270)] text-[oklch(0.92_0_0)] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)] ring-1 ring-black/10">
      <div className="flex h-10 items-center gap-2 border-b border-white/[0.06] px-4">
        {[0, 1, 2].map((light) => (
          <span key={light} className="size-3 rounded-full bg-white/15" />
        ))}
        <span className="ml-3 text-[12px] text-white/40">acme</span>
      </div>
      <div className={`flex flex-col gap-1.5 p-5 font-mono ${compact ? "text-[12px]" : "text-[14px]"}`}>
        <span>
          <span className="text-(--r-brand-2)">$</span> pnpm dlx buildkit init saas-app acme
        </span>
        {terminalLines.slice(0, compact ? 3 : 5).map(([label, value]) => (
          <span key={label} className="flex gap-3 pl-4">
            <span className="w-[120px] shrink-0 text-white/40">{label}</span>
            {value}
          </span>
        ))}
        <span className="mt-1.5 flex items-center gap-2 text-[oklch(0.8_0.14_155)]">
          <Check className="size-4" /> Planned 214 files, no conflicts
        </span>
        {!compact && (
          <span className="flex items-center gap-2 text-[oklch(0.8_0.14_155)]">
            <Check className="size-4" /> Installed in 11s
          </span>
        )}
        <span className="flex items-center gap-2 text-[oklch(0.8_0.14_155)]">
          <Check className="size-4" /> Opened acme in Parity
        </span>
      </div>
    </div>
  )
}

const customers = [
  { name: "Northwind", className: "font-bold tracking-tight" },
  { name: "LUMEN LABS", className: "text-[15px] font-semibold tracking-[0.25em]" },
  { name: "Globex", className: "font-serif italic" },
  { name: "initech", className: "font-mono font-medium" },
  { name: "Hooli", className: "font-extrabold tracking-tighter" }
]

/** A marketing site's home page. */
export function Landing({ look }: { look: Look }) {
  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-(--r-bg)">
      <Glow className="inset-x-0 top-0 h-[640px]" />
      <SiteNav look={look} />
      <section className="relative grid grid-cols-[1.08fr_1fr] items-center gap-14 px-14 pt-16">
        <div className="flex flex-col items-start gap-6">
          <span className="flex items-center gap-2 rounded-full border border-(--r-line) bg-(--r-card) py-1 pr-3 pl-1 text-[13px] font-medium shadow-sm">
            <span className="rounded-full bg-(--r-brand) px-2 py-0.5 text-[12px] font-semibold text-(--r-brand-fg)">
              New
            </span>
            The Scaffolder is here <ArrowRight className="size-3.5 text-(--r-muted)" />
          </span>
          <h1 className={`text-[64px] leading-[1.02] font-semibold tracking-[-0.035em] ${display}`}>
            Start every app with a month of work done.
          </h1>
          <p className="max-w-[500px] text-[19px] leading-relaxed text-(--r-muted)">
            Templates on a real stack, components you own, and deploys on day one. Built for teams who ship.
          </p>
          <div className="flex gap-3 pt-1">
            <span className="flex items-center gap-2 rounded-full bg-(--r-brand) px-6 py-3 text-[16px] font-medium text-(--r-brand-fg) shadow-[0_8px_24px_-8px_var(--r-brand)]">
              Start building <ArrowRight className="size-4" />
            </span>
            <span className="rounded-full border border-(--r-line) bg-(--r-card) px-6 py-3 text-[16px] font-medium">
              Read the docs
            </span>
          </div>
          <div className="flex items-center gap-3 pt-2 text-[14px] text-(--r-muted)">
            <span className="flex">
              {[
                ["Dana Ortiz", 20],
                ["Kai Lindqvist", 160],
                ["Noor Haddad", 250],
                ["Tom Becker", 80]
              ].map(([name, hue], index) => (
                <span key={name} className={index ? "-ml-2 rounded-full ring-2 ring-(--r-bg)" : "rounded-full"}>
                  <Face name={name as string} hue={hue as number} size={28} />
                </span>
              ))}
            </span>
            Used by 2,400 teams
          </div>
        </div>
        <Terminal />
      </section>
      <section className="mt-auto flex flex-col items-center gap-5 pb-12">
        <span className="text-[13px] text-(--r-faint)">Teams building with {look.brand}</span>
        <div className="flex items-center gap-16 text-[22px] text-(--r-muted) opacity-80">
          {customers.map((customer) => (
            <span key={customer.name} className={customer.className}>
              {customer.name}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}

/** The home page on a phone. */
export function MobileLanding({ look }: { look: Look }) {
  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-(--r-bg)">
      <Glow className="inset-x-0 top-0 h-[520px]" />
      <PhoneStatus />
      <div className="relative flex h-14 items-center justify-between px-5">
        <Brand look={look} size={26} />
        <Menu className="size-6" />
      </div>
      <div className="relative flex flex-col gap-5 px-5 pt-8">
        <span className="flex w-fit items-center gap-2 rounded-full border border-(--r-line) bg-(--r-card) py-1 pr-3 pl-1 text-[12px] font-medium">
          <span className="rounded-full bg-(--r-brand) px-2 py-0.5 font-semibold text-(--r-brand-fg)">New</span>
          The Scaffolder is here
        </span>
        <h1 className={`text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] ${display}`}>
          Start every app with a month of work done.
        </h1>
        <p className="text-[17px] leading-relaxed text-(--r-muted)">
          Templates on a real stack, components you own, and deploys on day one.
        </p>
        <div className="flex flex-col gap-2.5">
          <span className="rounded-full bg-(--r-brand) py-3.5 text-center text-[16px] font-medium text-(--r-brand-fg)">
            Start building
          </span>
          <span className="rounded-full border border-(--r-line) bg-(--r-card) py-3.5 text-center text-[16px] font-medium">
            Read the docs
          </span>
        </div>
        <div className="pt-3">
          <Terminal compact />
        </div>
      </div>
    </div>
  )
}

const plans = [
  {
    name: "Starter",
    price: "$0",
    per: "Free for side projects",
    features: ["3 apps", "Preview deploys", "Community support"],
    cta: "Start for free"
  },
  {
    name: "Team",
    price: "$24",
    per: "per seat each month",
    features: ["Unlimited apps", "Staging and production", "Roles and audit log", "Priority support"],
    cta: "Start a free trial",
    popular: true
  },
  {
    name: "Business",
    price: "$49",
    per: "per seat each month",
    features: ["Everything in Team", "Single sign-on", "99.9% uptime", "A named engineer"],
    cta: "Talk to us"
  }
]

function PlanCard({ plan, compact }: { plan: (typeof plans)[number]; compact?: boolean }) {
  return (
    <div
      className={`relative flex flex-col gap-5 rounded-2xl border bg-(--r-card) ${compact ? "p-5" : "p-7"} ${
        plan.popular
          ? "border-(--r-brand) shadow-[0_24px_60px_-24px_var(--r-brand)] ring-1 ring-(--r-brand)"
          : "border-(--r-line)"
      }`}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-7 rounded-full bg-(--r-brand) px-2.5 py-1 text-[12px] font-semibold text-(--r-brand-fg)">
          Most popular
        </span>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-[16px] font-semibold">{plan.name}</span>
        <span className="flex items-baseline gap-2">
          <span className={`text-[44px] font-semibold tracking-tight ${display}`}>{plan.price}</span>
          <span className="text-[14px] text-(--r-muted)">{plan.per}</span>
        </span>
      </div>
      <span
        className={`rounded-full py-2.5 text-center text-[15px] font-medium ${
          plan.popular ? "bg-(--r-brand) text-(--r-brand-fg)" : "border border-(--r-line)"
        }`}
      >
        {plan.cta}
      </span>
      <div className="flex flex-col gap-2.5 text-[14px]">
        {plan.features.map((feature) => (
          <span key={feature} className="flex items-center gap-2.5">
            <Check className="size-4 text-(--r-brand)" strokeWidth={2.5} /> {feature}
          </span>
        ))}
      </div>
    </div>
  )
}

function BillingToggle() {
  return (
    <span className="flex items-center gap-1 rounded-full border border-(--r-line) bg-(--r-card) p-1 text-[14px]">
      <span className="rounded-full bg-(--r-fg) px-4 py-1.5 font-medium text-(--r-bg)">Monthly</span>
      <span className="flex items-center gap-2 px-4 py-1.5 text-(--r-muted)">
        Yearly <span className="text-[12px] font-semibold text-(--r-brand)">Save 20%</span>
      </span>
    </span>
  )
}

/** A marketing site's pricing page. */
export function Pricing({ look }: { look: Look }) {
  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-(--r-bg)">
      <Glow className="inset-x-0 top-20 h-[420px]" />
      <SiteNav look={look} />
      <section className="relative flex flex-col items-center gap-4 pt-12 text-center">
        <span className="text-[14px] font-semibold text-(--r-brand)">Pricing</span>
        <h1 className={`text-[52px] leading-tight font-semibold tracking-[-0.03em] ${display}`}>
          Plans that grow with your team
        </h1>
        <p className="text-[18px] text-(--r-muted)">Start free. Upgrade when your team does.</p>
        <div className="pt-2">
          <BillingToggle />
        </div>
      </section>
      <div className="relative mx-auto mt-12 grid w-[1040px] grid-cols-3 items-start gap-5">
        {plans.map((plan) => (
          <PlanCard key={plan.name} plan={plan} />
        ))}
      </div>
    </div>
  )
}

/** The pricing page on a phone. */
export function MobilePricing({ look }: { look: Look }) {
  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-(--r-bg)">
      <PhoneStatus />
      <div className="flex h-14 items-center justify-between px-5">
        <Brand look={look} size={26} />
        <Menu className="size-6" />
      </div>
      <div className="flex flex-col items-center gap-3 px-5 pt-6 text-center">
        <span className="text-[13px] font-semibold text-(--r-brand)">Pricing</span>
        <h1 className={`text-[34px] leading-tight font-semibold tracking-tight ${display}`}>
          Plans that grow with your team
        </h1>
        <div className="pt-2">
          <BillingToggle />
        </div>
      </div>
      <div className="flex flex-col gap-6 px-5 pt-8">
        <PlanCard plan={plans[1]!} compact />
        <PlanCard plan={plans[0]!} compact />
      </div>
    </div>
  )
}

const dashboardNav = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Apps", icon: Boxes },
  { label: "Deploys", icon: Rocket },
  { label: "Environments", icon: Layers },
  { label: "Members", icon: Users },
  { label: "Billing", icon: CreditCard },
  { label: "Settings", icon: Settings }
]

/** A dashboard's frame: the sidebar, the top bar and the page's own header. */
function AppShell({
  look,
  active,
  description,
  actions,
  children
}: {
  look: Look
  active: string
  description: string
  actions: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex size-full bg-(--r-bg) text-[14px]">
      <aside className="flex w-[232px] shrink-0 flex-col gap-0.5 border-r border-(--r-line) bg-(--r-card) p-3">
        <div className="flex items-center justify-between px-2 py-2">
          <Brand look={look} size={26} />
          <ChevronsUpDown className="size-4 text-(--r-faint)" />
        </div>
        <div className="mx-1 mt-2 mb-3 flex items-center gap-2 rounded-lg border border-(--r-line) px-2.5 py-1.5 text-[13px] text-(--r-faint)">
          <Search className="size-3.5" /> Search
          <span className="ml-auto rounded border border-(--r-line) px-1 text-[11px]">Ctrl K</span>
        </div>
        {dashboardNav.map(({ label, icon: Icon }) => (
          <span
            key={label}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
              label === active ? "bg-(--r-soft) font-medium text-(--r-brand)" : "text-(--r-muted)"
            }`}
          >
            <Icon className="size-4" /> {label}
          </span>
        ))}
        <div className="mt-auto flex items-center gap-2.5 rounded-xl border border-(--r-line) p-2.5">
          <Face name="Andrew Craswell" hue={250} size={30} />
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium">Andrew Craswell</span>
            <span className="text-[12px] text-(--r-muted)">Buildkit</span>
          </span>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-(--r-line) px-8 text-[13px] text-(--r-muted)">
          Buildkit <ChevronRight className="size-3.5" /> <span className="text-(--r-fg)">{active}</span>
          <span className="ml-auto flex items-center gap-4">
            <span>Feedback</span>
            <Bell className="size-4" />
            <Face name="Andrew Craswell" hue={250} size={26} />
          </span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-8 pt-7">
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-[26px] font-semibold tracking-tight">{active}</h1>
              <p className="text-(--r-muted)">{description}</p>
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-(--r-line) bg-(--r-card) shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${className}`}>
      {children}
    </div>
  )
}

function Ghost({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-(--r-line) bg-(--r-card) px-3 py-1.5 font-medium">
      {children}
    </span>
  )
}

function Primary({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg bg-(--r-brand) px-3 py-1.5 font-medium text-(--r-brand-fg)">
      {children}
    </span>
  )
}

const kpis = [
  { label: "Requests", value: "48.2M", delta: "+12.4%", values: [18, 22, 21, 27, 26, 31, 30, 36] },
  { label: "Deploys", value: "182", delta: "+23", values: [12, 18, 14, 22, 20, 25, 29, 27] },
  { label: "Error rate", value: "0.21%", delta: "-0.04%", values: [9, 8, 9, 7, 7, 6, 5, 5] },
  { label: "Spend this month", value: "$1,284", delta: "62% of budget", values: [3, 6, 9, 12, 15, 18, 20, 22] }
]

const deploys = [
  { app: "website", branch: "main", status: "Ready", when: "2m" },
  { app: "better-apps", branch: "feat/billing", status: "Building", when: "4m" },
  { app: "relay", branch: "fix/stream-retry", status: "Ready", when: "18m" },
  { app: "standup", branch: "main", status: "Failed", when: "1h" },
  { app: "spawnkit", branch: "tiles", status: "Ready", when: "2h" }
]

function DeployStatus({ status }: { status: string }) {
  if (status === "Building") return <LoaderCircle className="size-4 text-(--r-warn)" />
  if (status === "Failed") return <TriangleAlert className="size-4 text-(--r-bad)" />
  return <CircleCheck className="size-4 text-(--r-good)" />
}

const edge = [31, 34, 33, 38, 36, 44, 41, 47, 45, 52, 50, 58, 55, 61]
const origin = [12, 14, 13, 15, 17, 16, 19, 18, 21, 20, 22, 21, 24, 23]

function RequestsChart({ width, height }: { width: number; height: number }) {
  const all = [...edge, ...origin]
  const scale = (values: number[]) =>
    plot([...values, Math.min(...all), Math.max(...all)], width, height).slice(0, values.length)
  const edgePoints = scale(edge)
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="requests-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--r-brand)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--r-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((line) => (
        <line
          key={line}
          x1="0"
          x2={width}
          y1={height * line}
          y2={height * line}
          stroke="var(--r-line)"
          strokeDasharray="4 4"
        />
      ))}
      <path d={`${curve(edgePoints)} L${width},${height} L0,${height} Z`} fill="url(#requests-fill)" />
      <path d={curve(edgePoints)} fill="none" stroke="var(--r-brand)" strokeWidth="2.5" />
      <path d={curve(scale(origin))} fill="none" stroke="var(--r-faint)" strokeWidth="2" strokeDasharray="5 5" />
    </svg>
  )
}

/** A dashboard's overview: numbers, a chart, deploys and apps. */
export function Overview({ look }: { look: Look }) {
  return (
    <AppShell
      look={look}
      active="Overview"
      description="Everything running across Buildkit's apps."
      actions={
        <>
          <span className="flex items-center rounded-lg border border-(--r-line) bg-(--r-card) p-0.5 text-[13px]">
            {["24 hours", "7 days", "30 days"].map((range) => (
              <span
                key={range}
                className={`rounded-md px-3 py-1 ${range === "7 days" ? "bg-(--r-raised) font-medium" : "text-(--r-muted)"}`}
              >
                {range}
              </span>
            ))}
          </span>
          <Primary>
            <Plus className="size-4" /> New app
          </Primary>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="flex flex-col gap-2 p-4">
            <span className="text-[13px] text-(--r-muted)">{kpi.label}</span>
            <span className="flex items-end justify-between">
              <span className="text-[28px] font-semibold tracking-tight tabular-nums">{kpi.value}</span>
              <Sparkline values={kpi.values} width={84} height={30} />
            </span>
            <span className="text-[12px] font-medium text-(--r-good)">{kpi.delta}</span>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Requests</span>
            <span className="flex items-center gap-4 text-[12px] text-(--r-muted)">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-(--r-brand)" /> Edge
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-(--r-faint)" /> Origin
              </span>
            </span>
          </div>
          <RequestsChart width={590} height={176} />
          <div className="flex justify-between text-[12px] text-(--r-faint)">
            {["Oct 22", "Oct 23", "Oct 24", "Oct 25", "Oct 26", "Oct 27", "Oct 28"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col p-5">
          <span className="mb-3 font-semibold">Recent deploys</span>
          {deploys.map((deploy) => (
            <span key={deploy.app} className="flex items-center gap-3 border-t border-(--r-line) py-2.5 first-of-type:border-t-0">
              <DeployStatus status={deploy.status} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{deploy.app}</span>
                <span className="truncate font-mono text-[12px] text-(--r-muted)">{deploy.branch}</span>
              </span>
              <span className="text-[12px] text-(--r-faint)">{deploy.when}</span>
            </span>
          ))}
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_0.8fr] border-b border-(--r-line) bg-(--r-raised) px-5 py-2.5 text-[12px] font-medium text-(--r-muted)">
          <span>App</span>
          <span>Environment</span>
          <span>Status</span>
          <span>Requests</span>
          <span>Updated</span>
        </div>
        {[
          ["Buildkit website", "Production", "Healthy", "2m ago"],
          ["Relay", "Production", "Healthy", "18m ago"],
          ["Standup", "Staging", "Degraded", "1h ago"]
        ].map(([app, environment, status, updated], index) => (
          <div
            key={app}
            className="grid grid-cols-[1.4fr_1fr_1fr_1fr_0.8fr] items-center border-b border-(--r-line) px-5 py-3"
          >
            <span className="flex items-center gap-2.5 font-medium">
              <span className="grid size-7 place-items-center rounded-lg bg-(--r-soft) text-(--r-brand)">
                <Boxes className="size-3.5" />
              </span>
              {app}
            </span>
            <span className="text-(--r-muted)">{environment}</span>
            <span className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${status === "Healthy" ? "bg-(--r-good)" : "bg-(--r-warn)"}`} />
              {status}
            </span>
            <Sparkline values={kpis[index]!.values} width={90} height={22} />
            <span className="text-(--r-muted)">{updated}</span>
          </div>
        ))}
      </Card>
    </AppShell>
  )
}

const usage = [
  { label: "Build minutes", used: "1,840", of: "3,000", share: 0.61 },
  { label: "Bandwidth", used: "412 GB", of: "1 TB", share: 0.41 },
  { label: "Seats", used: "8", of: "10", share: 0.8 }
]

function Meter({ share, warn }: { share: number; warn?: boolean }) {
  return (
    <span className="h-2 overflow-hidden rounded-full bg-(--r-raised)">
      <span
        className={`block h-full rounded-full ${warn ? "bg-(--r-warn)" : "bg-(--r-brand)"}`}
        style={{ width: `${share * 100}%` }}
      />
    </span>
  )
}

const billingPlans = [
  { name: "Starter", price: "Free", note: "3 apps, 1 seat", features: ["Preview deploys", "Community support"] },
  {
    name: "Team",
    price: "$24",
    note: "per seat each month",
    features: ["Unlimited apps", "Roles and audit log"],
    current: true
  },
  { name: "Business", price: "$49", note: "per seat each month", features: ["Single sign-on", "99.9% uptime"] }
]

/** A dashboard's billing page: the plan, usage, other plans and invoices. */
export function Billing({ look }: { look: Look }) {
  return (
    <AppShell
      look={look}
      active="Billing"
      description="Your plan, usage and invoices for Buildkit."
      actions={
        <>
          <Ghost>
            <Download className="size-4" /> Invoices
          </Ghost>
          <Primary>Change plan</Primary>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between">
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2 text-[18px] font-semibold">
                Team
                <span className="rounded-full bg-(--r-soft) px-2 py-0.5 text-[12px] font-medium text-(--r-brand)">
                  Current plan
                </span>
              </span>
              <span className="text-(--r-muted)">$24 per seat each month. Renews on November 28.</span>
            </span>
            <span className="text-[30px] font-semibold tracking-tight tabular-nums">$192</span>
          </div>
          <span className="flex flex-col gap-2">
            <span className="flex justify-between text-[13px]">
              <span className="text-(--r-muted)">Seats</span>8 of 10 used
            </span>
            <Meter share={0.8} />
          </span>
          <span className="flex gap-2">
            <Ghost>Manage seats</Ghost>
            <span className="px-3 py-1.5 text-(--r-muted)">Cancel plan</span>
          </span>
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <span className="font-semibold">Payment method</span>
          <span
            className="flex h-[92px] flex-col justify-between rounded-xl p-4 text-white"
            style={{ background: "linear-gradient(135deg, oklch(0.32 0.05 260), oklch(0.2 0.03 260))" }}
          >
            <span className="text-[13px] font-semibold tracking-[0.2em] opacity-80">VISA</span>
            <span className="font-mono text-[15px] tracking-wider">ending in 4242</span>
          </span>
          <span className="flex items-center justify-between text-[13px] text-(--r-muted)">
            Expires 08/28 <span className="font-medium text-(--r-fg)">Update</span>
          </span>
        </Card>
      </div>
      <Card className="grid grid-cols-3 gap-8 p-5">
        {usage.map((meter) => (
          <span key={meter.label} className="flex flex-col gap-2">
            <span className="text-[13px] text-(--r-muted)">{meter.label}</span>
            <span className="text-[15px]">
              <span className="font-semibold">{meter.used}</span> <span className="text-(--r-muted)">of {meter.of}</span>
            </span>
            <Meter share={meter.share} warn={meter.share > 0.75} />
          </span>
        ))}
      </Card>
      <div className="grid grid-cols-3 gap-4">
        {billingPlans.map((plan) => (
          <Card
            key={plan.name}
            className={`flex flex-col gap-3 p-5 ${plan.current ? "ring-2 ring-(--r-brand)" : ""}`}
          >
            <span className="flex items-center justify-between">
              <span className="font-semibold">{plan.name}</span>
              {plan.current && <CircleCheck className="size-5 text-(--r-brand)" />}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-[24px] font-semibold tracking-tight">{plan.price}</span>
              <span className="text-[13px] text-(--r-muted)">{plan.note}</span>
            </span>
            {plan.features.map((feature) => (
              <span key={feature} className="flex items-center gap-2 text-[13px]">
                <Check className="size-3.5 text-(--r-brand)" strokeWidth={2.5} /> {feature}
              </span>
            ))}
          </Card>
        ))}
      </div>
    </AppShell>
  )
}

const phoneDashboardTabs = [
  { label: "Home", icon: House },
  { label: "Apps", icon: Boxes },
  { label: "Deploys", icon: Rocket },
  { label: "Billing", icon: CreditCard }
]

/** Billing on a phone. */
export function MobileBilling({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col overflow-hidden bg-(--r-bg) text-[15px]">
      <PhoneStatus />
      <div className="flex h-12 items-center gap-2 px-4">
        <ChevronLeft className="size-6 text-(--r-brand)" />
        <span className="text-[17px] font-semibold">Billing</span>
      </div>
      <div className="flex flex-col gap-4 px-4 pt-3">
        <Card className="flex flex-col gap-3 p-4">
          <span className="flex items-center justify-between">
            <span className="text-[17px] font-semibold">Team</span>
            <span className="rounded-full bg-(--r-soft) px-2 py-0.5 text-[12px] font-medium text-(--r-brand)">
              Current plan
            </span>
          </span>
          <span className="text-[28px] font-semibold tracking-tight">$192</span>
          <span className="text-[13px] text-(--r-muted)">8 seats at $24 each. Renews November 28.</span>
          <Meter share={0.8} />
        </Card>
        <Card className="flex flex-col gap-4 p-4">
          {usage.map((meter) => (
            <span key={meter.label} className="flex flex-col gap-1.5">
              <span className="flex justify-between text-[13px]">
                <span className="text-(--r-muted)">{meter.label}</span>
                {meter.used} of {meter.of}
              </span>
              <Meter share={meter.share} warn={meter.share > 0.75} />
            </span>
          ))}
        </Card>
        <Card className="flex flex-col gap-2 p-4 ring-2 ring-(--r-brand)">
          <span className="font-semibold">Business</span>
          <span className="text-[13px] text-(--r-muted)">Single sign-on and 99.9% uptime, $49 a seat.</span>
          <span className="mt-1 rounded-lg bg-(--r-brand) py-2.5 text-center font-medium text-(--r-brand-fg)">
            Upgrade
          </span>
        </Card>
      </div>
      <PhoneTabs tabs={phoneDashboardTabs} active="Billing" />
    </div>
  )
}

/** The overview on a phone. */
export function MobileOverview({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col overflow-hidden bg-(--r-bg) text-[15px]">
      <PhoneStatus />
      <div className="flex h-12 items-center justify-between px-4">
        <Brand look={look} size={26} />
        <Face name="Andrew Craswell" hue={250} size={30} />
      </div>
      <div className="flex flex-col gap-3 px-4 pt-3">
        <div className="grid grid-cols-2 gap-3">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="flex flex-col gap-1 p-3.5">
              <span className="text-[12px] text-(--r-muted)">{kpi.label}</span>
              <span className="text-[22px] font-semibold tracking-tight">{kpi.value}</span>
              <span className="text-[11px] font-medium text-(--r-good)">{kpi.delta}</span>
            </Card>
          ))}
        </div>
        <Card className="flex flex-col gap-2 p-4">
          <span className="font-semibold">Requests</span>
          <RequestsChart width={318} height={110} />
        </Card>
        <Card className="flex flex-col px-4 py-2">
          {deploys.slice(0, 3).map((deploy) => (
            <span key={deploy.app} className="flex items-center gap-3 py-2.5">
              <DeployStatus status={deploy.status} />
              <span className="flex-1 font-medium">{deploy.app}</span>
              <span className="text-[12px] text-(--r-faint)">{deploy.when}</span>
            </span>
          ))}
        </Card>
      </div>
      <PhoneTabs tabs={phoneDashboardTabs} active="Home" />
    </div>
  )
}

/** A sign-in page: a word from a customer beside the ways in. */
export function SignIn({ look }: { look: Look }) {
  return (
    <div className="flex size-full bg-(--r-bg)">
      <div
        className="relative flex w-[56%] flex-col justify-between overflow-hidden p-12 text-white"
        style={{ background: "linear-gradient(140deg, var(--r-brand), var(--r-brand-2))" }}
      >
        <div
          className="absolute -right-40 -bottom-48 size-[620px] rounded-full opacity-30"
          style={{ background: "radial-gradient(closest-side, white, transparent)" }}
        />
        <span className="relative flex items-center gap-2.5 text-[20px] font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-white/20">
            <look.icon className="size-5" />
          </span>
          {look.brand}
        </span>
        <div className="relative flex max-w-[560px] flex-col gap-6">
          <p className={`text-[34px] leading-snug font-medium tracking-tight ${display}`}>
            “We shipped billing in a week, not a quarter. It's the first tool our whole team opens every morning.”
          </p>
          <span className="flex items-center gap-3 text-[15px]">
            <Face name="Dana Ortiz" hue={20} size={40} />
            <span className="flex flex-col">
              <span className="font-semibold">Dana Ortiz</span>
              <span className="opacity-75">Head of Platform, Northwind</span>
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-16">
        <div className="flex w-full max-w-[360px] flex-col gap-5">
          <BrandMark look={look} size={44} />
          <div className="flex flex-col gap-1.5">
            <h1 className={`text-[28px] font-semibold tracking-tight ${display}`}>Sign in to {look.brand}</h1>
            <p className="text-[15px] text-(--r-muted)">Welcome back. Use your work email.</p>
          </div>
          {[
            { label: "Continue with Google", mark: <GoogleMark size={18} /> },
            { label: "Continue with GitHub", mark: <GitHubMark size={18} /> }
          ].map((provider) => (
            <span
              key={provider.label}
              className="flex items-center justify-center gap-2.5 rounded-lg border border-(--r-line) bg-(--r-card) py-2.5 text-[15px] font-medium"
            >
              {provider.mark} {provider.label}
            </span>
          ))}
          <span className="flex items-center gap-3 text-[13px] text-(--r-faint)">
            <span className="h-px flex-1 bg-(--r-line)" /> or <span className="h-px flex-1 bg-(--r-line)" />
          </span>
          <span className="flex flex-col gap-2 text-[14px]">
            <span className="font-medium">Work email</span>
            <span className="rounded-lg border border-(--r-line) bg-(--r-card) px-3 py-2.5 text-(--r-faint)">
              you@company.com
            </span>
          </span>
          <span className="rounded-lg bg-(--r-brand) py-2.5 text-center text-[15px] font-medium text-(--r-brand-fg)">
            Continue
          </span>
          <span className="text-center text-[13px] text-(--r-muted)">
            New here? <span className="font-medium text-(--r-fg)">Create an account</span>
          </span>
        </div>
      </div>
    </div>
  )
}

const docsNav = [
  { group: "Getting started", items: ["Introduction", "Install Parity", "Your first design", "Connect an agent"] },
  { group: "Canvas", items: ["Designs and boards", "Modes", "States", "Components"] },
  { group: "Lenses", items: ["Routes", "Database", "API"] },
  { group: "Reference", items: ["CLI", "parity.config.ts", "MCP tools"] }
]

/** A docs site's guide page: navigation, the article and what's on the page. */
export function Docs({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col bg-(--r-bg) text-[15px]">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-(--r-line) px-6">
        <span className="flex items-center gap-2.5">
          <Brand look={look} size={26} />
          <span className="rounded-md bg-(--r-soft) px-1.5 py-0.5 text-[12px] font-semibold text-(--r-brand)">Docs</span>
        </span>
        <span className="flex w-[340px] items-center gap-2 rounded-lg border border-(--r-line) bg-(--r-card) px-3 py-1.5 text-[13px] text-(--r-faint)">
          <Search className="size-3.5" /> Search the docs
          <span className="ml-auto rounded border border-(--r-line) px-1 text-[11px]">Ctrl K</span>
        </span>
        <span className="ml-auto flex items-center gap-6 text-[14px] text-(--r-muted)">
          <span className="text-(--r-fg)">Guides</span>
          <span>Reference</span>
          <span>Changelog</span>
          <GitHubMark size={18} />
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[248px] shrink-0 flex-col gap-6 border-r border-(--r-line) px-5 py-7 text-[14px]">
          {docsNav.map((section) => (
            <div key={section.group} className="flex flex-col gap-1">
              <span className="mb-1 text-[12px] font-semibold text-(--r-faint)">{section.group}</span>
              {section.items.map((item) => (
                <span
                  key={item}
                  className={`rounded-md px-2 py-1 ${
                    item === "Your first design" ? "bg-(--r-soft) font-medium text-(--r-brand)" : "text-(--r-muted)"
                  }`}
                >
                  {item}
                </span>
              ))}
            </div>
          ))}
        </aside>
        <article className="flex max-w-[780px] flex-1 flex-col gap-5 px-14 py-10 leading-relaxed">
          <span className="flex items-center gap-1.5 text-[13px] text-(--r-muted)">
            Getting started <ChevronRight className="size-3.5" /> Your first design
          </span>
          <h1 className={`text-[40px] leading-tight font-semibold tracking-tight ${display}`}>Your first design</h1>
          <p className="text-[18px] text-(--r-muted)">
            Open a React app, put a component on the canvas, and give it states. It takes about five minutes.
          </p>
          <h2 className="pt-2 text-[22px] font-semibold tracking-tight">Open your app</h2>
          <p className="text-(--r-muted)">
            Parity opens the folder that holds your package.json. It finds your components, your Tailwind theme and your
            routes, and starts your dev server.
          </p>
          <div className="rounded-xl border border-(--r-line) bg-(--r-card) p-4 font-mono text-[13px] leading-loose">
            <div>
              <span className="text-(--r-brand)">$</span> pnpm dlx parity open .
            </div>
            <div className="text-(--r-muted)">Found 48 components in src/components</div>
            <div className="text-(--r-muted)">Started Vite on http://localhost:5173</div>
          </div>
          <div className="flex gap-3 rounded-xl border border-(--r-line) border-l-(--r-brand) bg-(--r-soft) p-4 text-[14px]">
            <Info className="mt-0.5 size-4 shrink-0 text-(--r-brand)" />
            Parity never changes your code until you ask it to.
          </div>
          <h2 className="pt-2 text-[22px] font-semibold tracking-tight">Add a design</h2>
          <p className="text-(--r-muted)">
            Drag a component from the Components panel onto the canvas. It renders with your real code, so what you see
            is what ships.
          </p>
        </article>
        <aside className="flex w-[220px] shrink-0 flex-col gap-2 py-10 text-[13px] text-(--r-muted)">
          <span className="mb-1 font-semibold text-(--r-fg)">On this page</span>
          {["Open your app", "Add a design", "Give it states", "Show it on a phone", "Next steps"].map((item, index) => (
            <span key={item} className={index === 0 ? "font-medium text-(--r-brand)" : ""}>
              {item}
            </span>
          ))}
        </aside>
      </div>
    </div>
  )
}

const conversations = [
  { name: "Maria Gonzalez", hue: 30, subject: "Lamp arrived cracked", snippet: "Can I get a replacement before Friday?", when: "9:41", tag: "Copilot drafted", active: true },
  { name: "Kenji Watanabe", hue: 200, subject: "Change my plan", snippet: "We added four people and need seats", when: "9:12", tag: "Billing" },
  { name: "Ola Nordmann", hue: 140, subject: "Invoice for October", snippet: "Our finance team needs a VAT number on it", when: "8:55" },
  { name: "Priscila Santos", hue: 330, subject: "Can't sign in", snippet: "The code never arrives at my work email", when: "8:20", tag: "Copilot drafted" },
  { name: "Theo Fischer", hue: 260, subject: "Export to CSV", snippet: "Is there a way to export every order?", when: "Yesterday" },
  { name: "Amara Okeke", hue: 60, subject: "Thank you!", snippet: "Just wanted to say the new app is great", when: "Yesterday" }
]

/** A support inbox with an AI copilot drafting replies. */
export function Inbox({ look }: { look: Look }) {
  return (
    <div className="flex size-full bg-(--r-bg) text-[14px]">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-(--r-line) py-4">
        <BrandMark look={look} size={34} />
        <span className="mt-4 grid size-10 place-items-center rounded-xl bg-(--r-soft) text-(--r-brand)">
          <InboxIcon className="size-5" />
        </span>
        {[Users, LibraryBig, Settings].map((Icon, index) => (
          <span key={index} className="grid size-10 place-items-center rounded-xl text-(--r-faint)">
            <Icon className="size-5" />
          </span>
        ))}
        <span className="mt-auto">
          <Face name="Sam Okafor" hue={80} size={32} />
        </span>
      </nav>
      <section className="flex w-[320px] shrink-0 flex-col border-r border-(--r-line)">
        <div className="flex h-16 items-center gap-2 px-5">
          <span className="text-[18px] font-semibold">Inbox</span>
          <span className="text-(--r-muted)">12 open</span>
          <ListFilter className="ml-auto size-4 text-(--r-muted)" />
        </div>
        <div className="flex gap-1.5 px-4 pb-3 text-[13px]">
          {["Mine 4", "Unassigned 8", "All"].map((tab, index) => (
            <span
              key={tab}
              className={`rounded-full px-3 py-1 ${index === 0 ? "bg-(--r-raised) font-medium" : "text-(--r-muted)"}`}
            >
              {tab}
            </span>
          ))}
        </div>
        {conversations.map((conversation) => (
          <div
            key={conversation.name}
            className={`flex gap-3 border-t border-(--r-line) px-4 py-3.5 ${conversation.active ? "bg-(--r-raised)" : ""}`}
          >
            <Face name={conversation.name} hue={conversation.hue} size={36} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center justify-between">
                <span className="font-medium">{conversation.name}</span>
                <span className="text-[12px] text-(--r-faint)">{conversation.when}</span>
              </span>
              <span className="truncate text-[13px]">{conversation.subject}</span>
              <span className="truncate text-[13px] text-(--r-muted)">{conversation.snippet}</span>
              {conversation.tag && (
                <span className="mt-1 flex w-fit items-center gap-1 rounded-full bg-(--r-soft) px-2 py-0.5 text-[11px] font-medium text-(--r-brand)">
                  {conversation.tag === "Copilot drafted" && <Sparkles className="size-3" />}
                  {conversation.tag}
                </span>
              )}
            </div>
          </div>
        ))}
      </section>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-(--r-line) px-6">
          <Face name="Maria Gonzalez" hue={30} size={32} />
          <span className="font-semibold">Maria Gonzalez</span>
          <span className="rounded-md border border-(--r-line) px-2 py-0.5 text-[12px] text-(--r-muted)">Order #4821</span>
          <span className="ml-auto flex items-center gap-2">
            <Ghost>Snooze</Ghost>
            <Primary>
              <Check className="size-4" /> Resolve
            </Primary>
          </span>
        </header>
        <div className="flex flex-1 flex-col gap-5 px-8 py-6">
          <div className="flex max-w-[460px] gap-3">
            <Face name="Maria Gonzalez" hue={30} size={30} />
            <div className="flex flex-col gap-1">
              <span className="rounded-2xl rounded-tl-md bg-(--r-raised) px-4 py-3 leading-relaxed">
                Hi, my order arrived damaged. The glass on the lamp is cracked. Can I get a replacement before Friday?
                It's a gift.
              </span>
              <span className="text-[12px] text-(--r-faint)">9:41 AM</span>
            </div>
          </div>
          <span className="flex items-center gap-2 text-[12px] text-(--r-muted)">
            <Sparkles className="size-3.5 text-(--r-brand)" /> Copilot read Order #4821 and the returns policy
          </span>
          <div className="flex flex-col gap-3 rounded-2xl border border-(--r-brand)/40 bg-(--r-soft) p-4">
            <span className="flex items-center gap-2 text-[13px] font-medium text-(--r-brand)">
              <Sparkles className="size-4" /> Copilot drafted a reply
            </span>
            <p className="leading-relaxed">
              I'm so sorry the lamp arrived cracked, Maria. I've sent a replacement by express shipping, so it arrives
              Thursday, before Friday. You don't need to send the damaged one back.
            </p>
            <span className="flex gap-1.5 text-[12px]">
              {["Returns policy", "Order #4821", "Express shipping"].map((source) => (
                <span key={source} className="rounded-full border border-(--r-line) bg-(--r-card) px-2.5 py-0.5 text-(--r-muted)">
                  {source}
                </span>
              ))}
            </span>
            <span className="flex gap-2">
              <Primary>
                <Send className="size-3.5" /> Send
              </Primary>
              <Ghost>Edit</Ghost>
              <span className="px-3 py-1.5 text-(--r-muted)">Try again</span>
            </span>
          </div>
        </div>
        <div className="m-6 mt-0 flex items-center gap-3 rounded-xl border border-(--r-line) bg-(--r-card) px-4 py-3 text-(--r-faint)">
          Reply to Maria, or ask Copilot
          <span className="ml-auto flex items-center gap-3">
            <Paperclip className="size-4" />
            <Sparkles className="size-4" />
            <span className="grid size-8 place-items-center rounded-lg bg-(--r-brand) text-(--r-brand-fg)">
              <Send className="size-4" />
            </span>
          </span>
        </div>
      </main>
      <aside className="flex w-[280px] shrink-0 flex-col gap-6 border-l border-(--r-line) p-5">
        <div className="flex flex-col items-start gap-3">
          <Face name="Maria Gonzalez" hue={30} size={52} />
          <span className="flex flex-col">
            <span className="text-[16px] font-semibold">Maria Gonzalez</span>
            <span className="text-[13px] text-(--r-muted)">maria@hey.com</span>
          </span>
          <span className="flex gap-1.5 text-[12px]">
            <span className="rounded-full bg-(--r-raised) px-2 py-0.5">Pro customer</span>
            <span className="rounded-full bg-(--r-raised) px-2 py-0.5">Since 2023</span>
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-(--r-faint)">Orders</span>
          {[
            ["#4821", "Ceramic lamp", "$129"],
            ["#4610", "Linen throw", "$64"]
          ].map(([id, item, price]) => (
            <span key={id} className="flex items-center justify-between rounded-lg border border-(--r-line) px-3 py-2 text-[13px]">
              <span className="flex flex-col">
                <span className="font-medium">{item}</span>
                <span className="text-(--r-muted)">{id}</span>
              </span>
              {price}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-(--r-faint)">How they feel</span>
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-(--r-warn)/15 px-2.5 py-1 text-[12px] font-medium text-(--r-warn)">
            <ChevronDown className="size-3.5" /> Frustrated, but polite
          </span>
        </div>
      </aside>
    </div>
  )
}
