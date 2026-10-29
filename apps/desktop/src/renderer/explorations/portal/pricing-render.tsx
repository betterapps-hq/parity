/**
 * Kestrel website's Pricing board at a given version, for comparing v12, the version you approved, with what Maya made
 * since. It draws as the start page's Pricing render does; only what each version changed differs. Each changed
 * element carries `data-mark`, so the comparison's outlines can be measured from the render itself.
 */
import { Check, Menu } from "lucide-react"
import type { Look } from "../start/data.ts"
import { Brand, desktop, display, lookVars, phone, PhoneStatus, Scaled } from "../start/render-kit.tsx"

/** v13 moved Save 20% from Team's card into the toggle; v14 made Team Most popular and took out Compare all plans. */
const savingInToggle = 13
const popularTeam = 14

const savings = "oklch(0.72 0.15 162)"

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
    cta: "Start a free trial"
  },
  {
    name: "Business",
    price: "$49",
    per: "per seat each month",
    features: ["Everything in Team", "Single sign-on", "99.9% uptime", "A named engineer"],
    cta: "Talk to us"
  }
]

function PlanCard({ plan, version, compact }: { plan: (typeof plans)[number]; version: number; compact?: boolean }) {
  const team = plan.name === "Team"
  const popular = team && version >= popularTeam
  const badge = team && version < savingInToggle
  return (
    <div
      data-mark={team ? "team-card" : undefined}
      className={`relative flex flex-col gap-5 rounded-2xl border bg-(--r-card) ${compact ? "p-5" : "p-7"} ${
        popular
          ? "border-(--r-brand) shadow-[0_24px_60px_-24px_var(--r-brand)] ring-1 ring-(--r-brand)"
          : "border-(--r-line)"
      }`}
    >
      {popular && (
        <span
          data-mark="team-badge"
          className="absolute -top-3 left-7 rounded-full bg-(--r-brand) px-2.5 py-1 text-[12px] font-semibold text-(--r-brand-fg)"
        >
          Most popular
        </span>
      )}
      {badge && (
        <span
          data-mark="team-badge"
          className="absolute -top-3 left-7 rounded-full px-2.5 py-1 text-[12px] font-semibold text-black"
          style={{ background: savings }}
        >
          Save 20%
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
        data-mark={team ? "team-button" : undefined}
        className={`rounded-full py-2.5 text-center text-[15px] font-medium ${
          popular ? "bg-(--r-brand) text-(--r-brand-fg)" : "border border-(--r-line)"
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

function BillingToggle({ version }: { version: number }) {
  return (
    <span
      data-mark="toggle"
      className="flex items-center gap-1 rounded-full border border-(--r-line) bg-(--r-card) p-1 text-[14px]"
    >
      <span className="rounded-full bg-(--r-fg) px-4 py-1.5 font-medium text-(--r-bg)">Monthly</span>
      <span className="flex items-center gap-2 px-4 py-1.5 text-(--r-muted)">
        Yearly
        {version >= savingInToggle && (
          <span data-mark="toggle-saving" className="text-[12px] font-semibold text-(--r-brand)">
            Save 20%
          </span>
        )}
      </span>
    </span>
  )
}

const links = ["Product", "Templates", "Docs", "Pricing", "Changelog"]

function Page({ look, version }: { look: Look; version: number }) {
  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-(--r-bg)">
      <div
        className="pointer-events-none absolute inset-x-0 top-20 h-[420px]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--r-brand) 22%, transparent), transparent), radial-gradient(closest-side, color-mix(in oklch, var(--r-brand-2) 16%, transparent), transparent)",
          backgroundPosition: "30% 40%, 75% 60%",
          backgroundSize: "70% 80%, 60% 70%",
          backgroundRepeat: "no-repeat"
        }}
      />
      <nav className="relative z-10 flex h-[72px] shrink-0 items-center gap-10 px-14">
        <Brand look={look} size={30} />
        <div className="flex gap-7 text-[15px] text-(--r-muted)">
          {links.map((link) => (
            <span key={link}>{link}</span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-5 text-[15px]">
          <span className="font-medium">Sign in</span>
          <span className="rounded-full bg-(--r-fg) px-4 py-2 text-[14px] font-medium text-(--r-bg)">Get started</span>
        </div>
      </nav>
      <section className="relative flex flex-col items-center gap-4 pt-12 text-center">
        <span className="text-[14px] font-semibold text-(--r-brand)">Pricing</span>
        <h1 className={`text-[52px] leading-tight font-semibold tracking-[-0.03em] ${display}`}>
          Plans that grow with your team
        </h1>
        <p className="text-[18px] text-(--r-muted)">Start free. Upgrade when your team does.</p>
        <div className="pt-2">
          <BillingToggle version={version} />
        </div>
      </section>
      <div className="relative mx-auto mt-12 grid w-[1040px] grid-cols-3 items-start gap-5">
        {plans.map((plan) => (
          <PlanCard key={plan.name} plan={plan} version={version} />
        ))}
      </div>
      {version < popularTeam && (
        <span data-mark="compare" className="relative mx-auto mt-7 text-[15px] font-medium text-(--r-brand)">
          Compare all plans →
        </span>
      )}
    </div>
  )
}

/** The pricing page on a phone, as the start page draws it: Team first, then Starter. */
function PhonePage({ look, version }: { look: Look; version: number }) {
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
          <BillingToggle version={version} />
        </div>
      </div>
      <div className="flex flex-col gap-6 px-5 pt-8">
        <PlanCard plan={plans[1]!} version={version} compact />
        <PlanCard plan={plans[0]!} version={version} compact />
      </div>
    </div>
  )
}

/** Pricing, on a phone, as it was at a version. */
export function PricingPhoneAt({ look, version }: { look: Look; version: number }) {
  return (
    <Scaled width={phone.width} height={phone.height}>
      <div className="size-full overflow-hidden bg-(--r-bg) text-(--r-fg) antialiased" style={lookVars(look)}>
        <PhonePage look={look} version={version} />
      </div>
    </Scaled>
  )
}

/** Pricing, on desktop, as it was at a version. */
export function PricingAt({ look, version }: { look: Look; version: number }) {
  return (
    <Scaled width={desktop.width} height={desktop.height}>
      <div className="size-full overflow-hidden bg-(--r-bg) text-(--r-fg) antialiased" style={lookVars(look)}>
        <Page look={look} version={version} />
      </div>
    </Scaled>
  )
}
