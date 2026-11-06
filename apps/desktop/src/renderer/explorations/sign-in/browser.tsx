/**
 * The browser's half of signing in: the page a `pnpm dev` copy's loopback serves once the browser hands back, and
 * AuthKit's own pages as WorkOS's branding settings would dress them. Neither is Parity's window, so both are drawn in
 * a browser.
 */
import { ArrowLeft, ArrowRight, ChevronRight, Lock, RotateCw, X } from "lucide-react"
import { type CSSProperties, type ReactNode, useState } from "react"
import { type HandBack, handBackHtml, handBackText } from "../../../shared/hand-back-page.ts"
import { useResolvedTheme } from "../../theme.ts"
import { ParityMark } from "../parts.tsx"
import { Segmented } from "../start/page.tsx"
import { providers } from "./panels.tsx"

type Mode = "light" | "dark"

const chrome: Record<Mode, { bar: string; tab: string; field: string; text: string; muted: string; line: string }> = {
  light: { bar: "#e8e8ec", tab: "#ffffff", field: "#f1f1f4", text: "#18181b", muted: "#71717a", line: "#d4d4d8" },
  dark: { bar: "#1b1b1f", tab: "#2a2a30", field: "#1b1b1f", text: "#f4f4f5", muted: "#a1a1aa", line: "#3f3f46" }
}

/** A browser with one tab: its title, the address and the page. Closing the tab leaves an empty window. */
export function BrowserFrame({
  mode,
  title,
  url,
  children
}: {
  mode: Mode
  title: string
  url: string
  children: ReactNode
}) {
  const [closed, setClosed] = useState(false)
  const c = chrome[mode]
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: c.bar, color: c.text }}>
      <div className="flex h-10 shrink-0 items-end gap-1 px-2">
        {!closed && (
          <div className="flex h-8 w-60 items-center gap-2 rounded-t-lg px-3 text-xs" style={{ background: c.tab }}>
            <ParityMark size={14} />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <button
              type="button"
              aria-label={`Close ${title}`}
              onClick={() => setClosed(true)}
              className="grid size-5 place-items-center rounded-sm outline-none hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex h-10 shrink-0 items-center gap-3 px-3" style={{ background: c.tab, color: c.muted }}>
        <ArrowLeft className="size-4" />
        <ArrowRight className="size-4" />
        <RotateCw className="size-3.5" />
        <div
          className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-xs"
          style={{ background: c.field }}
        >
          <Lock className="size-3 shrink-0" />
          <span className="truncate" style={{ color: c.text }}>
            {closed ? "" : url}
          </span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1" style={{ borderTop: `1px solid ${c.line}` }}>
        {closed ? <div className="absolute inset-0" style={{ background: c.tab }} /> : children}
      </div>
    </div>
  )
}

/** The browser after it has handed back to a `pnpm dev` copy, showing what the loopback served. */
export function HandBackPage({ outcome }: { outcome: HandBack }) {
  const theme = useResolvedTheme()
  return (
    <div className="h-screen min-h-[560px]">
      <BrowserFrame
        mode={theme}
        title={handBackText[outcome].title}
        url={`127.0.0.1:53817/auth/callback?code=01JC…&state=b2f7…`}
      >
        <iframe
          title={handBackText[outcome].title}
          className="absolute inset-0 size-full border-0"
          srcDoc={handBackHtml(outcome, theme)}
        />
      </BrowserFrame>
    </div>
  )
}

/**
 * Parity's branding in WorkOS, per environment: the same in the sandbox and production. The colors are the app's
 * own, and the links take the mark's violet.
 */
export const branding = {
  displayName: "Parity",
  radius: 10,
  font: "Geist",
  colors: {
    light: { page: "#FFFFFF", button: "#171717", buttonText: "#FAFAFA", link: "#5432E6" },
    dark: { page: "#0A0A0A", button: "#E5E5E5", buttonText: "#171717", link: "#8A74FF" }
  }
} as const

/** The custom CSS: the sign-in screen's glow behind every AuthKit page. */
const customCss = `.ak-Background {
  background-image: radial-gradient(
    60% 50% at 50% 0%,
    light-dark(rgb(84 50 230 / 0.12), rgb(138 116 255 / 0.16)),
    transparent 70%
  );
}`

type AuthKitScreen = "sign-in" | "magic-code" | "organization-selection" | "handed-back"

/** What AuthKit draws from a color on its own: text, borders and fields, which the dashboard doesn't take. */
function derived(mode: Mode) {
  return mode === "light"
    ? { text: "#0a0a0a", muted: "#737373", border: "#e5e5e5", field: "#ffffff", glow: "rgb(84 50 230 / 0.12)" }
    : { text: "#fafafa", muted: "#a1a1a1", border: "#2a2a2a", field: "#141414", glow: "rgb(138 116 255 / 0.16)" }
}

/** One of AuthKit's pages with Parity's branding. It works: the email goes to the code, the code to the organizations. */
function AuthKitPage({ screen, mode, onNext }: { screen: AuthKitScreen; mode: Mode; onNext: () => void }) {
  const colors = branding.colors[mode]
  const d = derived(mode)
  const radius = branding.radius
  const primary: CSSProperties = {
    background: colors.button,
    color: colors.buttonText,
    borderRadius: radius,
    height: 40,
    fontWeight: 500,
    fontSize: 14
  }
  const outline: CSSProperties = {
    border: `1px solid ${d.border}`,
    borderRadius: radius,
    height: 40,
    fontSize: 14,
    fontWeight: 500,
    background: d.field
  }
  const field: CSSProperties = {
    border: `1px solid ${d.border}`,
    borderRadius: radius,
    height: 40,
    padding: "0 12px",
    background: d.field,
    color: d.text,
    fontSize: 14,
    outlineColor: colors.link
  }
  const link: CSSProperties = { color: colors.link, fontWeight: 500 }
  return (
    <div
      className="absolute inset-0 flex flex-col items-center overflow-y-auto px-6 pt-[12vh] pb-10"
      style={{
        background: `radial-gradient(60% 50% at 50% 0%, ${d.glow}, transparent 70%) ${colors.page}`,
        color: d.text,
        fontFamily: `"${branding.font} Variable", "${branding.font}", sans-serif`,
        colorScheme: mode
      }}
    >
      <div className="flex w-full max-w-[22rem] flex-col gap-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <ParityMark size={40} />
          {screen === "sign-in" && <h1 className="text-[22px] font-semibold tracking-tight">Sign in to Parity</h1>}
          {screen === "magic-code" && (
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[22px] font-semibold tracking-tight">Check your email</h1>
              <p className="text-sm" style={{ color: d.muted }}>
                Enter the code sent to andrew@kestrel.dev
              </p>
            </div>
          )}
          {screen === "organization-selection" && (
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[22px] font-semibold tracking-tight">Choose an organization</h1>
              <p className="text-sm" style={{ color: d.muted }}>
                andrew@kestrel.dev belongs to more than one
              </p>
            </div>
          )}
        </div>
        {screen === "sign-in" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              onNext()
            }}
          >
            {providers.map((provider, index) => (
              <button
                key={provider.name}
                type="button"
                className="relative flex items-center justify-center gap-2.5"
                style={outline}
              >
                {provider.mark}
                Continue with {provider.name}
                {index === 0 && (
                  <span
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px]"
                    style={{ background: d.border, color: d.muted }}
                  >
                    Last used
                  </span>
                )}
              </button>
            ))}
            <div className="my-1 flex items-center gap-3 text-xs" style={{ color: d.muted }}>
              <span className="h-px flex-1" style={{ background: d.border }} />
              OR
              <span className="h-px flex-1" style={{ background: d.border }} />
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input type="email" defaultValue="andrew@kestrel.dev" style={field} />
            </label>
            <button type="submit" style={primary}>
              Continue
            </button>
            <p className="mt-1 text-center text-sm" style={{ color: d.muted }}>
              Don&apos;t have an account? <span style={link}>Sign up</span>
            </p>
          </form>
        )}
        {screen === "magic-code" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              onNext()
            }}
          >
            <input
              aria-label="Code"
              inputMode="numeric"
              defaultValue="481 902"
              style={{ ...field, height: 48, textAlign: "center", fontSize: 22, letterSpacing: "0.3em" }}
            />
            <button type="submit" style={primary}>
              Continue
            </button>
            <p className="text-center text-sm" style={{ color: d.muted }}>
              Didn&apos;t get it? <span style={link}>Resend code</span>
            </p>
          </form>
        )}
        {screen === "organization-selection" && (
          <div
            className="flex flex-col overflow-hidden"
            style={{ border: `1px solid ${d.border}`, borderRadius: radius }}
          >
            {[
              { name: "Kestrel", hue: "#2f7fb8" },
              { name: "Lumen Labs", hue: "#8a8a2a" }
            ].map((org, index) => (
              <button
                key={org.name}
                type="button"
                onClick={onNext}
                className="flex items-center gap-3 px-4 py-3 text-left text-sm font-medium"
                style={{ background: d.field, borderTop: index ? `1px solid ${d.border}` : undefined }}
              >
                <span
                  className="grid size-8 place-items-center text-sm font-semibold text-white"
                  style={{ background: org.hue, borderRadius: radius - 4 }}
                >
                  {org.name[0]}
                </span>
                <span className="flex-1">{org.name}</span>
                <ChevronRight className="size-4" style={{ color: d.muted }} />
              </button>
            ))}
          </div>
        )}
        <p className="text-center text-xs" style={{ color: d.muted }}>
          <span style={link}>Terms of Service</span> and <span style={link}>Privacy Policy</span>
        </p>
      </div>
    </div>
  )
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 font-mono text-xs">
      <span className="size-4 rounded-sm ring-1 ring-foreground/15" style={{ background: color }} aria-hidden />
      <span>
        <span className="sr-only">{label} </span>
        {color}
      </span>
    </span>
  )
}

function Setting({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <dt className="text-xs text-muted-foreground">{name}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="pt-3 text-sm font-semibold">{title}</h3>
      <dl className="flex flex-col divide-y">{children}</dl>
    </section>
  )
}

const screens: { id: AuthKitScreen; label: string }[] = [
  { id: "sign-in", label: "Sign in" },
  { id: "magic-code", label: "Code" },
  { id: "organization-selection", label: "Organization" }
]

const nextScreen: Record<AuthKitScreen, AuthKitScreen> = {
  "sign-in": "magic-code",
  "magic-code": "organization-selection",
  "organization-selection": "handed-back",
  "handed-back": "sign-in"
}

const colorNames = [
  { key: "page", name: "Page background color" },
  { key: "button", name: "Button background color" },
  { key: "buttonText", name: "Button text color" },
  { key: "link", name: "Link color" }
] as const

/**
 * AuthKit's hosted pages, as Parity's WorkOS branding dresses them, beside the settings that do it. People see these
 * pages only on the way through: the code for a work email without single sign-on, choosing an organization, an
 * invitation. The provider buttons in Parity skip AuthKit's own sign-in page.
 */
export function AuthKitBranding() {
  const theme = useResolvedTheme()
  const [mode, setMode] = useState<Mode>(theme)
  const [screen, setScreen] = useState<AuthKitScreen>("sign-in")
  const page =
    screen === "handed-back" ? (
      <iframe
        title="Signed in to Parity"
        className="absolute inset-0 size-full border-0"
        srcDoc={handBackHtml("signed-in", mode)}
      />
    ) : (
      <AuthKitPage screen={screen} mode={mode} onNext={() => setScreen(nextScreen[screen])} />
    )
  return (
    <div className="flex h-screen min-h-[640px] bg-background text-foreground">
      <div className="min-w-0 flex-1">
        <BrowserFrame
          mode={mode}
          title={screen === "handed-back" ? "Signed in to Parity" : "Sign in to Parity"}
          url={screen === "handed-back" ? "127.0.0.1:53817/auth/callback?code=01JC…" : "parity.authkit.app"}
        >
          {page}
        </BrowserFrame>
      </div>
      <aside className="flex w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto border-l px-5 py-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Branding in WorkOS</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Set the same in the sandbox and production. Copy from environment brings one&apos;s settings to the other.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Segmented<AuthKitScreen>
            options={screens}
            value={screen === "handed-back" ? "organization-selection" : screen}
            onChange={setScreen}
          />
          <Segmented
            options={[
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" }
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
        <SettingsGroup title="Global styles">
          <Setting name="Display name">{branding.displayName}</Setting>
          <Setting name="Logo icon">
            <span className="flex items-center gap-2">
              <ParityMark size={20} /> The app icon, as a 512-pixel PNG under 100 KB
            </span>
          </Setting>
          <Setting name="Logo">The same icon: Parity has no wordmark yet</Setting>
          <Setting name="Favicon">The icon&apos;s small drawing, 32 pixels</Setting>
          <Setting name="Corner radius">{branding.radius} pixels, the app&apos;s</Setting>
          {colorNames.map((color) => (
            <Setting key={color.key} name={color.name}>
              <span className="flex gap-4">
                <Swatch color={branding.colors.light[color.key]} label="Light" />
                <Swatch color={branding.colors.dark[color.key]} label="Dark" />
              </span>
            </Setting>
          ))}
        </SettingsGroup>
        <SettingsGroup title="AuthKit styles">
          <Setting name="Preferred appearance">The system&apos;s</Setting>
          <Setting name="Font family">{branding.font}, the app&apos;s</Setting>
          <Setting name="Logo display">Logo icon</Setting>
          <Setting name="Page layout">Centered</Setting>
          <Setting name="Page title">Sign in to Parity</Setting>
          <Setting name="Last used badge">On</Setting>
          <Setting name="Legal links">Terms of Service and Privacy Policy, once Parity has them</Setting>
        </SettingsGroup>
        <SettingsGroup title="Custom CSS">
          <Setting name="The sign-in screen's glow">
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed">
              {customCss}
            </pre>
          </Setting>
        </SettingsGroup>
      </aside>
    </div>
  )
}
