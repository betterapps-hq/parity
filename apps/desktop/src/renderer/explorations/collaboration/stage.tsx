import { Check, ChevronDown, X } from "lucide-react"
import { Fragment, type ReactElement, type ReactNode } from "react"

/** The dark canvas the collaboration pieces sit on, as the app draws it. */
export function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative min-h-screen bg-[#0c0c0f] p-12 text-foreground ${className}`}>{children}</div>
}

/** A board on the canvas: its name above it, then the design at its own size. */
export function Board({
  name,
  children,
  className = "",
  frame
}: {
  name: string
  children: ReactNode
  className?: string
  /** The mode or state it shows, after the name. */
  frame?: string
}) {
  return (
    <div className={`relative flex w-fit flex-col gap-2 ${className}`}>
      <span className="text-xs font-medium text-white/60">
        {name}
        {frame && <span className="text-white/35"> {frame}</span>}
      </span>
      <div className="relative w-fit rounded-sm shadow-[0_20px_60px_rgb(0_0_0/0.5)]">{children}</div>
    </div>
  )
}

/**
 * Wraps one of a design's elements, by its id, so a story can mark it: outline it, number it, pin something to it.
 * Without one, the design draws as it is.
 */
export type Marker = (id: string, element: ReactElement) => ReactNode

const plain: Marker = (_, element) => element

const plans = [
  { id: "starter", name: "Starter", price: "$0", note: "For trying it out", cta: "Start free" },
  { id: "team", name: "Team", price: "$12", note: "Per member, monthly", cta: "Start a trial", featured: true },
  { id: "scale", name: "Scale", price: "$32", note: "Per member, monthly", cta: "Talk to us" }
]

/** A pricing page, in the design's own light theme: the board most stories mark up. */
export function PricingDesign({ mark = plain }: { mark?: Marker }) {
  return (
    <div className="w-[720px] bg-white font-sans text-neutral-900">
      {mark(
        "header",
        <header className="flex items-center gap-6 border-b border-neutral-200 px-8 py-4">
          {mark(
            "logo",
            <span className="flex items-center gap-2 text-sm font-semibold">
              {mark(
                "logo-mark",
                <span className="grid size-6 place-items-center rounded-md bg-neutral-900 text-[11px] text-white">
                  B
                </span>
              )}
              Buildkit
            </span>
          )}
          {mark(
            "nav",
            <nav className="flex gap-5 text-sm text-neutral-500">
              <span>Product</span>
              <span>Docs</span>
              <span className="text-neutral-900">Pricing</span>
            </nav>
          )}
          <span className="ml-auto">
            {mark("signin", <span className="block rounded-md border px-3 py-1.5 text-sm">Sign in</span>)}
          </span>
        </header>
      )}
      {mark(
        "main",
        <main className="flex flex-col items-center gap-6 px-8 pt-10 pb-8">
          {mark("h1", <h1 className="text-3xl font-semibold tracking-tight">Pricing that grows with your team</h1>)}
          {mark(
            "toggle",
            <div className="flex rounded-full bg-neutral-100 p-1 text-sm">
              {mark("monthly", <span className="block rounded-full px-4 py-1.5 text-neutral-500">Monthly</span>)}
              {mark(
                "annual",
                <span className="block rounded-full bg-white px-4 py-1.5 font-medium shadow-sm">
                  Annual <span className="text-emerald-600">-20%</span>
                </span>
              )}
            </div>
          )}
          <div className="grid w-full grid-cols-3 gap-4">
            {plans.map((plan) => (
              <Fragment key={plan.id}>
                {mark(
                  `plan-${plan.id}`,
                  <div
                    className={`flex h-full flex-col gap-3 rounded-xl border p-5 ${plan.featured ? "border-neutral-900 shadow-lg" : "border-neutral-200"}`}
                  >
                    {mark(`plan-${plan.id}-name`, <h2 className="text-base font-semibold">{plan.name}</h2>)}
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                      <span className="text-xs text-neutral-500">{plan.note}</span>
                    </div>
                    <ul className="flex flex-col gap-1.5 text-sm text-neutral-600">
                      {["Unlimited designs", plan.id === "starter" ? "One project" : "Every project"].map((feature) => (
                        <li key={feature} className="flex items-center gap-2">
                          <Check className="size-3.5 text-emerald-600" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {mark(
                      `plan-${plan.id}-cta`,
                      <span
                        className={`mt-1 block rounded-md py-2 text-center text-sm font-medium ${plan.featured ? "bg-neutral-900 text-white" : "border"}`}
                      >
                        {plan.cta}
                      </span>
                    )}
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </main>
      )}
      {mark(
        "footer",
        <footer className="flex justify-between border-t border-neutral-200 px-8 py-4 text-xs text-neutral-500">
          <span>© 2026 Buildkit</span>
          <span>Prices in US dollars</span>
        </footer>
      )}
    </div>
  )
}

/** A dialog to invite teammates, in the design's own light theme. */
export function InviteDialogDesign({ mark = plain }: { mark?: Marker }) {
  return (
    <div className="w-[440px] rounded-xl bg-white font-sans text-neutral-900 ring-1 ring-black/5">
      {mark(
        "dialog",
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              {mark("title", <h2 className="text-lg font-semibold">Invite teammates</h2>)}
              <p className="text-sm text-neutral-500">They&apos;ll join Buildkit and see its projects.</p>
            </div>
            {mark(
              "close",
              <span className="grid size-8 place-items-center rounded-md text-neutral-500">
                <X className="size-4" />
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Email addresses</span>
            {mark(
              "email",
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-2 text-sm">
                {["maya@buildkit.dev", "jonas@buildkit.dev"].map((email) => (
                  <span key={email} className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5">
                    {email}
                    <X className="size-3 text-neutral-400" />
                  </span>
                ))}
                <span className="text-neutral-400">Add another</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Role</span>
            {mark(
              "role",
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                Editor
                <ChevronDown className="size-4 text-neutral-400" />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            {mark("status", <p className="text-sm text-emerald-700">2 invites ready to send</p>)}
            <div className="flex gap-2">
              {mark("cancel", <span className="block rounded-md border px-3 py-2 text-sm">Cancel</span>)}
              {mark(
                "send",
                <span className="block rounded-md bg-neutral-900 px-3 py-2 text-sm text-white">Send invites</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
