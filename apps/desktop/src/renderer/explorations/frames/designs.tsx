import { Check, ImageIcon, Menu } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

/*
 * Designs drawn in the example project's own look, standing in for the live previews a board shows. They're in the
 * project's theme for the mode they're drawn in, not the app's.
 */

export type DesignTheme = "light" | "dark"

const palettes = {
  light: {
    background: "#ffffff",
    foreground: "#171717",
    muted: "#737373",
    border: "#e5e5e5",
    subtle: "#f5f5f5",
    primary: "#171717",
    onPrimary: "#fafafa"
  },
  dark: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    muted: "#a3a3a3",
    border: "#262626",
    subtle: "#171717",
    primary: "#fafafa",
    onPrimary: "#171717"
  }
} as const

type Palette = (typeof palettes)[DesignTheme]

/** The project's background and text color in a theme: what a frame or a preview is filled with. */
export function designSurface(theme: DesignTheme): CSSProperties {
  const palette = palettes[theme]

  return { background: palette.background, color: palette.foreground }
}

const plans = [
  { name: "Starter", price: "$0", note: "Free for up to 3 people", cta: "Start for free" },
  { name: "Pro", price: "$12", note: "Per person, monthly", cta: "Start a trial", popular: true },
  { name: "Business", price: "$32", note: "Per person, monthly", cta: "Talk to sales" }
]

function Plan({ plan, palette }: { plan: (typeof plans)[number]; palette: Palette }) {
  return (
    <div
      className="flex flex-col gap-4 rounded-xl border p-6"
      style={{ borderColor: plan.popular ? palette.foreground : palette.border }}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">{plan.name}</span>
        {plan.popular && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: palette.primary, color: palette.onPrimary }}
          >
            Popular
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
        <span className="text-sm" style={{ color: palette.muted }}>
          {plan.note}
        </span>
      </div>
      <ul className="flex flex-col gap-2 text-sm" style={{ color: palette.muted }}>
        {["Unlimited designs", "Every mode and state", "Comments and notes"].map((feature) => (
          <li key={feature} className="flex items-center gap-2">
            <Check className="size-4" style={{ color: palette.foreground }} />
            {feature}
          </li>
        ))}
      </ul>
      <span
        className="mt-2 rounded-md py-2.5 text-center text-sm font-medium"
        style={
          plan.popular
            ? { background: palette.primary, color: palette.onPrimary }
            : { border: `1px solid ${palette.border}` }
        }
      >
        {plan.cta}
      </span>
    </div>
  )
}

/** The example's Pricing screen, at a viewport's width, in a theme. */
export function PricingPage({ width, theme }: { width: number; theme: DesignTheme }) {
  const palette = palettes[theme]
  const narrow = width < 600

  return (
    <div className="flex flex-col font-sans" style={{ width, ...designSurface(theme) }}>
      <header
        className={`flex items-center gap-8 border-b ${narrow ? "px-5 py-4" : "px-12 py-5"}`}
        style={{ borderColor: palette.border }}
      >
        <span className="flex items-center gap-2 font-semibold">
          <span
            className="grid size-7 place-items-center rounded-md text-xs"
            style={{ background: palette.primary, color: palette.onPrimary }}
          >
            A
          </span>
          Acme
        </span>
        {narrow ? (
          <Menu className="ml-auto size-5" />
        ) : (
          <>
            <nav className="flex gap-6 text-sm" style={{ color: palette.muted }}>
              <span>Product</span>
              <span>Docs</span>
              <span style={{ color: palette.foreground }}>Pricing</span>
            </nav>
            <span className="ml-auto rounded-md border px-3.5 py-1.5 text-sm" style={{ borderColor: palette.border }}>
              Sign in
            </span>
          </>
        )}
      </header>
      <section className={`flex flex-col items-center gap-5 text-center ${narrow ? "px-5 pt-10" : "px-12 pt-16"}`}>
        <h1 className={`font-semibold tracking-tight ${narrow ? "text-3xl" : "text-5xl"}`}>Plans for every team</h1>
        <p className={`max-w-xl ${narrow ? "text-sm" : "text-lg"}`} style={{ color: palette.muted }}>
          Start free, and pay per person once your team grows.
        </p>
        <div className="flex rounded-full p-1 text-sm" style={{ background: palette.subtle }}>
          <span className="rounded-full px-4 py-1.5" style={{ color: palette.muted }}>
            Monthly
          </span>
          <span className="rounded-full px-4 py-1.5 font-medium" style={designSurface(theme)}>
            Yearly
          </span>
        </div>
      </section>
      <section className={`grid gap-5 ${narrow ? "grid-cols-1 px-5 py-8" : "grid-cols-3 px-12 py-12"}`}>
        {(narrow ? plans.slice(0, 2) : plans).map((plan) => (
          <Plan key={plan.name} plan={plan} palette={palette} />
        ))}
      </section>
      <footer
        className={`flex justify-between border-t text-xs ${narrow ? "px-5 py-4" : "px-12 py-5"}`}
        style={{ borderColor: palette.border, color: palette.muted }}
      >
        <span>© 2026 Acme</span>
        <span>Prices in US dollars</span>
      </footer>
    </div>
  )
}

/** The example's Plan card component, at its own size. */
export function PlanCard({ theme = "light" }: { theme?: DesignTheme }) {
  const palette = palettes[theme]

  return (
    <div className="w-[320px] p-px font-sans" style={designSurface(theme)}>
      <Plan plan={plans[1]!} palette={palette} />
    </div>
  )
}

/**
 * A sketch someone drew in a frame: a welcome step for new teams, with a heading, a few lines, two buttons and a spot
 * for an illustration. It's as wide as `width`, and fills the frame it's drawn in.
 */
export function WelcomeSketch({ width = 720, height = 440 }: { width?: number; height?: number }) {
  const palette = palettes.light

  return (
    <div className="flex gap-8 p-10 font-sans" style={{ width, height, ...designSurface("light") }}>
      <div className="flex flex-1 flex-col gap-4">
        <span className="text-xs font-medium tracking-wide uppercase" style={{ color: palette.muted }}>
          Step 1 of 3
        </span>
        <h2 className="text-3xl font-semibold tracking-tight">Welcome to Acme</h2>
        <p className="text-base" style={{ color: palette.muted }}>
          Set up your workspace, invite your team and pick a plan. It takes about two minutes.
        </p>
        <div className="mt-auto flex gap-3">
          <span
            className="rounded-md px-4 py-2.5 text-sm font-medium"
            style={{ background: palette.primary, color: palette.onPrimary }}
          >
            Get started
          </span>
          <span className="rounded-md border px-4 py-2.5 text-sm" style={{ borderColor: palette.border }}>
            Skip for now
          </span>
        </div>
      </div>
      <div
        className="grid w-[240px] shrink-0 place-items-center rounded-xl"
        style={{ background: palette.subtle, color: palette.muted }}
      >
        <ImageIcon className="size-8" strokeWidth={1.5} />
      </div>
    </div>
  )
}

/** A text layer as the project draws it, in the primary mode's theme. */
export function TextLayer({ children, caret = false }: { children: ReactNode; caret?: boolean }) {
  return (
    <span className="inline-flex items-center font-sans text-3xl font-semibold tracking-tight whitespace-nowrap">
      {children}
      {caret && <span className="ml-0.5 inline-block h-[1.1em] w-0.5 animate-pulse bg-current" aria-hidden />}
    </span>
  )
}
