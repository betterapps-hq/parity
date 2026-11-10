/**
 * Pictures of the sample screens references are found among. Each is drawn at its real size in its app's look and
 * scaled to fit, where the real feature shows Mobbin's screenshots. The apps are made up, so the exploration ships no
 * one else's work.
 */
import { Bell, Check, ChevronDown, Minus, Plus, ShieldCheck, Sparkles, Star, X } from "lucide-react"
import type { ComponentType, CSSProperties, ReactNode } from "react"
import type { Look } from "../start/data.ts"
import { Brand, BrandMark, desktop, display, lookVars, phone, PhoneStatus, Scaled } from "../start/render-kit.tsx"
import { Listings, MobileListings } from "../start/renders-apps.tsx"
import {
  Billing,
  Docs,
  Inbox,
  Landing,
  MobileBilling,
  MobileLanding,
  MobileOverview,
  MobilePricing,
  Overview,
  SignIn
} from "../start/renders-web.tsx"
import type { Layout, Sample } from "./data.ts"

function Nav({ look }: { look: Look }) {
  return (
    <nav className="flex h-[72px] shrink-0 items-center gap-10 px-16">
      <Brand look={look} size={28} />
      <div className="flex gap-7 text-[15px] text-(--r-muted)">
        <span>Product</span>
        <span>Customers</span>
        <span className="font-medium text-(--r-fg)">Pricing</span>
        <span>Docs</span>
      </div>
      <div className="ml-auto flex items-center gap-5 text-[15px]">
        <span>Log in</span>
        <span className="rounded-lg bg-(--r-brand) px-4 py-2 text-[14px] font-medium text-(--r-brand-fg)">
          Try it free
        </span>
      </div>
    </nav>
  )
}

function Tick({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <Check className="size-4 shrink-0 text-(--r-brand)" strokeWidth={2.5} /> {children}
    </span>
  )
}

const tiers = [
  {
    name: "Solo",
    price: "$12",
    note: "For one person getting started",
    features: ["1 workspace", "5 projects", "Email support"]
  },
  {
    name: "Studio",
    price: "$29",
    note: "For small teams that ship weekly",
    features: ["Unlimited projects", "Shared library", "Version history", "Priority support"],
    best: true
  },
  {
    name: "Company",
    price: "$79",
    note: "For teams that need control",
    features: ["Everything in Studio", "Single sign-on", "Audit log", "Invoice billing"]
  }
]

/** Three tiers, the middle one filled with the brand, under a monthly and yearly switch with yearly picked. */
function PricingTiers({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col">
      <Nav look={look} />
      <div className="flex items-end justify-between px-16 pt-12">
        <div className="flex flex-col gap-3">
          <h1 className={`text-[48px] leading-none font-semibold tracking-[-0.03em] ${display}`}>
            One price per seat. No surprises.
          </h1>
          <p className="text-[18px] text-(--r-muted)">Every plan starts with 14 days free.</p>
        </div>
        <span className="flex items-center gap-1 rounded-xl bg-(--r-raised) p-1 text-[14px]">
          <span className="px-4 py-2 text-(--r-muted)">Monthly</span>
          <span className="flex items-center gap-2 rounded-lg bg-(--r-card) px-4 py-2 font-medium shadow-sm">
            Yearly{" "}
            <span className="rounded-md bg-(--r-soft) px-1.5 py-0.5 text-[12px] text-(--r-brand)">2 months free</span>
          </span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-6 px-16 pt-12">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`flex flex-col gap-6 rounded-2xl p-8 ${
              tier.best ? "bg-(--r-brand) text-(--r-brand-fg)" : "border border-(--r-line) bg-(--r-card)"
            }`}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-[17px] font-semibold">{tier.name}</span>
              <span className={`text-[14px] ${tier.best ? "opacity-80" : "text-(--r-muted)"}`}>{tier.note}</span>
            </div>
            <span className="flex items-baseline gap-2">
              <span className={`text-[52px] leading-none font-semibold tracking-tight ${display}`}>{tier.price}</span>
              <span className={`text-[14px] ${tier.best ? "opacity-80" : "text-(--r-muted)"}`}>
                a seat, billed yearly
              </span>
            </span>
            <span
              className={`rounded-lg py-3 text-center text-[15px] font-medium ${
                tier.best ? "bg-(--r-brand-fg) text-(--r-brand)" : "bg-(--r-raised)"
              }`}
            >
              Start free
            </span>
            <div className="flex flex-col gap-3 text-[14px]">
              {tier.features.map((feature) => (
                <span key={feature} className="flex items-center gap-2.5">
                  <Check className="size-4 shrink-0" strokeWidth={2.5} /> {feature}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const compared = [
  { feature: "Projects", values: ["3", "Unlimited", "Unlimited"] },
  { feature: "Team members", values: ["1", "Up to 20", "Unlimited"] },
  { feature: "Version history", values: ["7 days", "90 days", "Forever"] },
  { feature: "Custom domains", values: [false, true, true] },
  { feature: "Roles and permissions", values: [false, true, true] },
  { feature: "Single sign-on", values: [false, false, true] },
  { feature: "Uptime agreement", values: [false, false, true] }
]

/** Plans across the top and what each includes down the side, as a table. */
function PricingCompare({ look }: { look: Look }) {
  const columns = [
    { name: "Free", price: "$0", cta: "Get started" },
    { name: "Pro", price: "$20", cta: "Start a trial", best: true },
    { name: "Scale", price: "$60", cta: "Contact sales" }
  ]

  return (
    <div className="flex size-full flex-col">
      <Nav look={look} />
      <div className="flex flex-col items-center gap-3 pt-10 text-center">
        <h1 className={`text-[44px] leading-tight font-semibold tracking-[-0.03em] ${display}`}>Compare plans</h1>
        <p className="text-[17px] text-(--r-muted)">Everything in each plan, side by side.</p>
      </div>
      <div className="mx-auto mt-10 w-[1040px] overflow-hidden rounded-2xl border border-(--r-line) bg-(--r-card)">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-(--r-line)">
          <span />
          {columns.map((column) => (
            <div
              key={column.name}
              className={`flex flex-col gap-3 border-l border-(--r-line) p-6 ${column.best ? "bg-(--r-soft)" : ""}`}
            >
              <span className="text-[15px] font-semibold">{column.name}</span>
              <span className="flex items-baseline gap-1.5">
                <span className={`text-[34px] leading-none font-semibold ${display}`}>{column.price}</span>
                <span className="text-[13px] text-(--r-muted)">a month</span>
              </span>
              <span
                className={`rounded-lg py-2 text-center text-[14px] font-medium ${
                  column.best ? "bg-(--r-brand) text-(--r-brand-fg)" : "border border-(--r-line)"
                }`}
              >
                {column.cta}
              </span>
            </div>
          ))}
        </div>
        {compared.map((row) => (
          <div
            key={row.feature}
            className="grid grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-(--r-line) text-[14px] last:border-b-0"
          >
            <span className="px-6 py-3.5">{row.feature}</span>
            {row.values.map((value, index) => (
              <span
                key={columns[index]!.name}
                className={`flex items-center border-l border-(--r-line) px-6 ${index === 1 ? "bg-(--r-soft)" : ""}`}
              >
                <Included value={value} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Included({ value }: { value: string | boolean }) {
  if (value === true) {
    return <Check className="size-4 text-(--r-brand)" strokeWidth={2.5} />
  }

  if (value === false) {
    return <Minus className="size-4 text-(--r-faint)" />
  }

  return <span>{value}</span>
}

/** A price that follows a slider for how much you use, beside what the plan includes. */
function PricingUsage({ look }: { look: Look }) {
  const stops = ["1k", "5k", "10k", "25k", "50k", "100k"]

  return (
    <div className="flex size-full flex-col">
      <Nav look={look} />
      <div className="grid flex-1 grid-cols-[1.15fr_1fr] gap-14 px-16 pt-14">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className={`text-[48px] leading-[1.05] font-semibold tracking-[-0.03em] ${display}`}>
              Pay for the contacts you have
            </h1>
            <p className="text-[18px] text-(--r-muted)">Move the slider to see your price. Change it any month.</p>
          </div>
          <div className="flex flex-col gap-5 rounded-2xl border border-(--r-line) bg-(--r-card) p-8">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] text-(--r-muted)">Contacts</span>
              <span className={`text-[32px] leading-none font-semibold ${display}`}>10,000</span>
            </div>
            <div className="relative h-2 rounded-full bg-(--r-raised)">
              <div className="absolute inset-y-0 left-0 w-[40%] rounded-full bg-(--r-brand)" />
              <div className="absolute top-1/2 left-[40%] size-6 -translate-1/2 rounded-full border-4 border-(--r-brand) bg-(--r-card) shadow-md" />
            </div>
            <div className="flex justify-between text-[13px] text-(--r-faint)">
              {stops.map((stop) => (
                <span key={stop}>{stop}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-(--r-raised) px-8 py-5 text-[15px]">
            <span>
              <span className="font-semibold">More than 100,000?</span>{" "}
              <span className="text-(--r-muted)">We&apos;ll set a price with you.</span>
            </span>
            <span className="font-medium text-(--r-brand)">Talk to sales</span>
          </div>
        </div>
        <div className="flex h-fit flex-col gap-6 rounded-2xl border border-(--r-brand) bg-(--r-card) p-9 shadow-[0_24px_60px_-28px_var(--r-brand)]">
          <span className="text-[15px] font-semibold text-(--r-brand)">Your price</span>
          <span className="flex items-baseline gap-2">
            <span className={`text-[72px] leading-none font-semibold tracking-tight ${display}`}>$89</span>
            <span className="text-[16px] text-(--r-muted)">a month</span>
          </span>
          <span className="rounded-lg bg-(--r-brand) py-3.5 text-center text-[16px] font-medium text-(--r-brand-fg)">
            Start sending
          </span>
          <div className="flex flex-col gap-3 text-[15px]">
            <Tick>Unlimited sends</Tick>
            <Tick>Automations and segments</Tick>
            <Tick>Your own sending domain</Tick>
            <Tick>Support by chat</Tick>
          </div>
        </div>
      </div>
    </div>
  )
}

const questions = [
  "Can I switch plans later?",
  "What happens when my trial ends?",
  "Do you offer refunds?",
  "Is there a discount for nonprofits?"
]

/** Two plans side by side under a yearly switch, with common questions below. */
function PricingTwo({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col">
      <Nav look={look} />
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <h1 className={`text-[46px] leading-tight font-semibold tracking-[-0.03em] ${display}`}>
          Free for you. Fair for teams.
        </h1>
        <span className="flex items-center gap-3 text-[15px]">
          <span className="text-(--r-muted)">Monthly</span>
          <span className="flex h-7 w-12 items-center justify-end rounded-full bg-(--r-brand) px-1">
            <span className="size-5 rounded-full bg-(--r-brand-fg)" />
          </span>
          <span className="font-medium">Yearly</span>
          <span className="rounded-full bg-(--r-soft) px-2.5 py-1 text-[13px] font-medium text-(--r-brand)">
            Save 25%
          </span>
        </span>
      </div>
      <div className="mx-auto mt-9 grid w-[880px] grid-cols-2 gap-6">
        <div className="flex flex-col gap-5 rounded-2xl border border-(--r-line) bg-(--r-card) p-8">
          <span className="text-[17px] font-semibold">Personal</span>
          <span className={`text-[48px] leading-none font-semibold ${display}`}>Free</span>
          <span className="rounded-lg border border-(--r-line) py-3 text-center text-[15px] font-medium">
            Create an account
          </span>
          <div className="flex flex-col gap-2.5 text-[14px]">
            <Tick>Unlimited notes</Tick>
            <Tick>Sync on two devices</Tick>
          </div>
        </div>
        <div className="flex flex-col gap-5 rounded-2xl border border-(--r-brand) bg-(--r-card) p-8 ring-1 ring-(--r-brand)">
          <span className="text-[17px] font-semibold">Team</span>
          <span className="flex items-baseline gap-2">
            <span className={`text-[48px] leading-none font-semibold ${display}`}>$9</span>
            <span className="text-[14px] text-(--r-muted)">a member each month</span>
          </span>
          <span className="rounded-lg bg-(--r-brand) py-3 text-center text-[15px] font-medium text-(--r-brand-fg)">
            Try Team free
          </span>
          <div className="flex flex-col gap-2.5 text-[14px]">
            <Tick>Shared spaces and comments</Tick>
            <Tick>Admin controls</Tick>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-9 grid w-[880px] grid-cols-2 gap-x-6 gap-y-3 text-[15px]">
        {questions.map((question) => (
          <span key={question} className="flex items-center justify-between rounded-xl bg-(--r-raised) px-5 py-3.5">
            {question} <Plus className="size-4 text-(--r-muted)" />
          </span>
        ))}
      </div>
    </div>
  )
}

function PhoneTop({ action = "Restore" }: { action?: string }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-5">
      <span className="grid size-8 place-items-center rounded-full bg-(--r-raised)">
        <X className="size-4" />
      </span>
      <span className="text-[15px] text-(--r-muted)">{action}</span>
    </div>
  )
}

function PhoneButton({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-2xl bg-(--r-brand) py-4 text-center text-[17px] font-semibold text-(--r-brand-fg)">
      {children}
    </span>
  )
}

/** A paywall with yearly and monthly options to pick between, yearly carrying the free trial. */
function PaywallPlans({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col">
      <PhoneStatus />
      <PhoneTop />
      <div className="flex flex-col items-center gap-4 px-6 pt-4 text-center">
        <BrandMark look={look} size={76} />
        <h1 className={`text-[30px] leading-tight font-semibold tracking-tight ${display}`}>
          Unlock all of {look.brand}
        </h1>
      </div>
      <div className="flex flex-col gap-3 px-8 pt-6 text-[16px]">
        <Tick>Unlimited goals and reminders</Tick>
        <Tick>Insights for every week</Tick>
        <Tick>Sync across your devices</Tick>
      </div>
      <div className="mt-auto flex flex-col gap-3 px-5 pb-10">
        <div className="flex items-center gap-3 rounded-2xl border-2 border-(--r-brand) bg-(--r-soft) p-4">
          <span className="grid size-6 place-items-center rounded-full bg-(--r-brand)">
            <Check className="size-3.5 text-(--r-brand-fg)" strokeWidth={3} />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-[16px] font-semibold">Yearly</span>
            <span className="text-[13px] text-(--r-muted)">$39.99 a year after 7 days free</span>
          </span>
          <span className="rounded-full bg-(--r-brand) px-2.5 py-1 text-[12px] font-semibold text-(--r-brand-fg)">
            Save 44%
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-(--r-line) bg-(--r-card) p-4">
          <span className="size-6 rounded-full border-2 border-(--r-line)" />
          <span className="flex flex-1 flex-col">
            <span className="text-[16px] font-semibold">Monthly</span>
            <span className="text-[13px] text-(--r-muted)">$5.99 a month</span>
          </span>
        </div>
        <PhoneButton>Start free trial</PhoneButton>
        <span className="text-center text-[12px] text-(--r-faint)">Cancel any time in Settings.</span>
      </div>
    </div>
  )
}

const trialSteps = [
  { icon: Sparkles, when: "Today", what: "Everything unlocks. Nothing to pay." },
  { icon: Bell, when: "Day 5", what: "We remind you the trial is ending." },
  { icon: Star, when: "Day 7", what: "Your year starts. Cancel before and pay nothing." }
]

/** A paywall that walks through the free trial day by day, with a reminder before it ends. */
function PaywallTimeline({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col">
      <PhoneStatus />
      <PhoneTop action="Skip" />
      <div className="px-6 pt-6">
        <h1 className={`text-[32px] leading-tight font-semibold tracking-tight ${display}`}>
          Try {look.brand} Plus free for 7 days
        </h1>
      </div>
      <div className="flex flex-col px-6 pt-8">
        {trialSteps.map(({ icon: Icon, when, what }, index) => (
          <div key={when} className="flex gap-4">
            <span className="flex flex-col items-center">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-(--r-soft) text-(--r-brand)">
                <Icon className="size-5" />
              </span>
              {index < trialSteps.length - 1 && <span className="w-0.5 flex-1 bg-(--r-soft)" />}
            </span>
            <span className="flex flex-col gap-1 pb-7">
              <span className="text-[17px] font-semibold">{when}</span>
              <span className="text-[15px] leading-snug text-(--r-muted)">{what}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-3 px-5 pb-10">
        <span className="text-center text-[14px] text-(--r-muted)">7 days free, then $39.99 a year</span>
        <PhoneButton>Start my free week</PhoneButton>
        <span className="flex items-center justify-center gap-1.5 text-[12px] text-(--r-faint)">
          <ShieldCheck className="size-3.5" /> No payment due now
        </span>
      </div>
    </div>
  )
}

const freeAndPro = [
  { feature: "Daily plan", free: true },
  { feature: "Offline access", free: false },
  { feature: "Custom themes", free: false },
  { feature: "Family sharing", free: false },
  { feature: "Export your data", free: false }
]

/** A paywall that compares Free with Pro in a table, with a one-time price beside the monthly one. */
function PaywallCompare({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col">
      <PhoneStatus />
      <PhoneTop />
      <div className="flex flex-col gap-2 px-6 pt-4">
        <h1 className={`text-[30px] leading-tight font-semibold tracking-tight ${display}`}>
          Get more from {look.brand}
        </h1>
        <span className="text-[15px] text-(--r-muted)">See what Pro adds.</span>
      </div>
      <div className="mx-5 mt-6 overflow-hidden rounded-2xl border border-(--r-line) bg-(--r-card) text-[15px]">
        <div className="grid grid-cols-[1fr_64px_64px] border-b border-(--r-line) py-3 text-center text-[13px] font-semibold">
          <span />
          <span className="text-(--r-muted)">Free</span>
          <span className="text-(--r-brand)">Pro</span>
        </div>
        {freeAndPro.map((row) => (
          <div
            key={row.feature}
            className="grid grid-cols-[1fr_64px_64px] items-center border-b border-(--r-line) py-3.5 last:border-b-0"
          >
            <span className="pl-4">{row.feature}</span>
            <span className="grid place-items-center">
              {row.free ? (
                <Check className="size-4" strokeWidth={2.5} />
              ) : (
                <Minus className="size-4 text-(--r-faint)" />
              )}
            </span>
            <span className="grid place-items-center">
              <Check className="size-4 text-(--r-brand)" strokeWidth={2.5} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-3 px-5 pb-10">
        <div className="grid grid-cols-2 gap-3 text-center">
          <span className="flex flex-col gap-0.5 rounded-2xl border border-(--r-line) bg-(--r-card) py-3">
            <span className="text-[13px] text-(--r-muted)">Monthly</span>
            <span className="text-[18px] font-semibold">$4.99</span>
          </span>
          <span className="flex flex-col gap-0.5 rounded-2xl border-2 border-(--r-brand) bg-(--r-soft) py-3">
            <span className="text-[13px] text-(--r-brand)">Lifetime</span>
            <span className="text-[18px] font-semibold">$79</span>
          </span>
        </div>
        <PhoneButton>Continue</PhoneButton>
        <span className="flex items-center justify-center gap-1 text-[12px] text-(--r-faint)">
          Terms and privacy <ChevronDown className="size-3" />
        </span>
      </div>
    </div>
  )
}

const layouts: Record<Layout, ComponentType<{ look: Look }>> = {
  "pricing-tiers": PricingTiers,
  "pricing-compare": PricingCompare,
  "pricing-usage": PricingUsage,
  "pricing-two": PricingTwo,
  "paywall-plans": PaywallPlans,
  "paywall-timeline": PaywallTimeline,
  "paywall-compare": PaywallCompare,
  "phone-pricing": MobilePricing,
  landing: Landing,
  "sign-in": SignIn,
  dashboard: Overview,
  billing: Billing,
  docs: Docs,
  inbox: Inbox,
  listings: Listings,
  "phone-landing": MobileLanding,
  "phone-dashboard": MobileOverview,
  "phone-billing": MobileBilling,
  "phone-listings": MobileListings
}

/** A screen's size at 100%, as the canvas places it: a laptop's width for the web, or a phone. */
export function sizeOf(screen: Pick<Sample, "platform">) {
  return screen.platform === "ios" ? phone : desktop
}

/** A sample screen's picture, scaled to its box's width. */
export function ScreenPicture({
  screen,
  className,
  style
}: {
  screen: Sample
  className?: string
  style?: CSSProperties
}) {
  const View = layouts[screen.layout]
  const size = sizeOf(screen)

  return (
    <Scaled width={size.width} height={size.height} className={className} style={style}>
      <div className="size-full overflow-hidden bg-(--r-bg) text-(--r-fg) antialiased" style={lookVars(screen.look)}>
        <View look={screen.look} />
      </div>
    </Scaled>
  )
}
