import { Button, Input } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ArrowLeft, ArrowRight, Building2, KeyRound, Lock, Mail, Plus } from "lucide-react"
import { type CSSProperties, type ReactNode, useState } from "react"
import { agentPalettes } from "../agent/agent-colors.ts"
import { AgentBadge, AgentPointer } from "../agent/AgentPointer.tsx"
import { me, organizations, people } from "./explore-data.ts"
import { accent, Avatar, ExploreWindow, MiniScreen, ParityMark } from "./parts.tsx"
import { AuthKitBranding, HandBackPage } from "./sign-in/browser.tsx"
import { glow, Legal, providers, SignInForm } from "./sign-in/panels.tsx"
import { SignInPrototype } from "./sign-in/prototype.tsx"

/**
 * Signing in to Parity with WorkOS. Sign-in happens in the browser, through AuthKit, so Parity never handles a
 * password: each button opens the browser with its provider chosen, and a work email lets WorkOS route people to their
 * organization's single sign-on. Signing in is optional, and nothing on this computer needs it.
 *
 * The working stories are one prototype, each starting at a different point: the sign-in screen on first launch, Home
 * signed out, the sign-in dialog from the title bar, and waiting for the browser with every way that ends. While
 * Parity waits, a panel marked Prototype plays the browser.
 */
const meta = {
  title: "Parity/Explorations/Sign in",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * The sign-in screen, the first time Parity opens: centered, with nothing but the ways in. Each button opens the
 * browser and waits. "Open a folder on this computer without signing in" opens the folder picker over Home, and Home
 * stays if the picker is closed.
 */
export const CenteredForm: Story = { render: () => <SignInPrototype place="window" /> }

const showcaseStyles = `
@keyframes showcase-a { 0%,100% { transform: translate(0,0) } 30% { transform: translate(120px,40px) } 60% { transform: translate(60px,140px) } }
@keyframes showcase-b { 0%,100% { transform: translate(0,0) } 40% { transform: translate(-140px,-30px) } 70% { transform: translate(-60px,60px) } }
@keyframes showcase-c { 0%,100% { transform: translate(0,0) } 50% { transform: translate(90px,-70px) } }
`

/** A cursor on the showcase canvas: an agent with its badge, or a teammate with their name. */
function ShowcaseCursor({
  palette,
  name,
  label,
  animation,
  style
}: {
  palette: number
  name: string
  label?: string
  animation: string
  style: CSSProperties
}) {
  const colors = agentPalettes[palette]!
  return (
    <div className="absolute motion-safe:animate-[var(--move)]" style={{ ...style, ["--move" as string]: animation }}>
      <AgentPointer palette={colors} />
      {label ? (
        <AgentBadge palette={colors} agent={name} kind="write" label={label} />
      ) : (
        <div
          className="mt-0.5 ml-4 w-max rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-md"
          style={{ background: colors.color, color: colors.ink }}
        >
          {name}
        </div>
      )}
    </div>
  )
}

/** A board on the showcase canvas, with its name above it as the canvas draws it. */
function ShowcaseBoard({ name, children, style }: { name: string; children: ReactNode; style: CSSProperties }) {
  return (
    <div className="absolute flex flex-col gap-2" style={style}>
      <span className="text-xs font-medium text-white/60">{name}</span>
      <div className="relative flex-1 overflow-hidden rounded-xl shadow-[0_20px_60px_rgb(0_0_0/0.5)] ring-1 ring-white/10">
        {children}
      </div>
    </div>
  )
}

/** The product behind the form: boards of real screens, with an agent and a teammate at work on them. */
function Showcase() {
  return (
    <ExploreWindow>
      <style>{showcaseStyles}</style>
      <div className="flex h-full">
        <div className="relative flex-1 overflow-hidden bg-[#0c0c0f]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(70% 60% at 30% 30%, color-mix(in oklch, ${accent(275, 0.55, 0.2)} 14%, transparent), transparent 70%)`
            }}
          />
          <ShowcaseBoard name="Dashboard" style={{ left: "8%", top: "12%", width: "46%", height: "44%" }}>
            <MiniScreen kind="dashboard" hue={162} dark />
          </ShowcaseBoard>
          <ShowcaseBoard name="Pricing" style={{ left: "58%", top: "18%", width: "34%", height: "36%" }}>
            <MiniScreen kind="marketing" hue={275} />
          </ShowcaseBoard>
          <ShowcaseBoard name="Assistant" style={{ left: "22%", top: "62%", width: "13%", height: "30%" }}>
            <MiniScreen kind="chat" hue={330} dark />
          </ShowcaseBoard>
          <ShowcaseBoard name="Plan card" style={{ left: "42%", top: "64%", width: "24%", height: "22%" }}>
            <MiniScreen kind="library" hue={275} />
          </ShowcaseBoard>
          <ShowcaseCursor
            palette={7}
            name="Claude Code"
            label="Tighten the plan cards"
            animation="showcase-a 14s ease-in-out infinite"
            style={{ left: "62%", top: "30%" }}
          />
          <ShowcaseCursor
            palette={0}
            name={people.maya.name}
            animation="showcase-b 17s ease-in-out infinite"
            style={{ left: "36%", top: "40%" }}
          />
          <ShowcaseCursor
            palette={4}
            name="Cursor"
            label="Add an empty state"
            animation="showcase-c 12s ease-in-out infinite"
            style={{ left: "30%", top: "70%" }}
          />
          <div className="absolute right-8 bottom-8 max-w-md text-right">
            <p className="text-lg font-semibold tracking-tight text-white">Your real components, on one canvas.</p>
            <p className="mt-1 text-sm text-white/60">Teammates and agents work on the same designs as you, live.</p>
          </div>
        </div>
        <div className="flex w-[26rem] shrink-0 flex-col justify-center gap-7 border-l bg-background px-12">
          <div className="flex flex-col gap-4">
            <ParityMark size={40} />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">Welcome to Parity</h1>
              <p className="text-sm text-muted-foreground">Sign in to open your team&apos;s projects.</p>
            </div>
          </div>
          <SignInForm />
          <Legal />
        </div>
      </div>
    </ExploreWindow>
  )
}

/** The product behind the form: a live canvas, with an agent and teammates working, beside the ways in. */
export const LiveCanvas: Story = { render: () => <Showcase /> }

type Step = "email" | "sso" | "code"

/** The email already typed when a story starts at a step: none, a company's, or a personal one. */
function startingEmail(step: Step): string {
  if (step === "email") return ""
  return step === "sso" ? "andrew@buildkit.dev" : "andrew@hey.com"
}

/** One question at a time: an email first, and WorkOS decides what comes next. */
function EmailFirst({ initial }: { initial: Step }) {
  const [step, setStep] = useState<Step>(initial)
  const [email, setEmail] = useState(startingEmail(initial))
  return (
    <ExploreWindow>
      <div className="flex h-full flex-col items-center justify-center px-6" style={glow}>
        <div className="flex w-full max-w-[24rem] flex-col gap-8">
          <ParityMark size={40} />
          {step === "email" && (
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault()
                setStep(email.endsWith("@buildkit.dev") ? "sso" : "code")
              }}
            >
              <div className="flex flex-col gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">What&apos;s your email?</h1>
                <p className="text-sm text-muted-foreground">
                  We&apos;ll sign you in, or set you up if you&apos;re new.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="h-11 text-base"
                />
                <Button type="submit" size="icon-lg" className="size-11 shrink-0" aria-label="Continue">
                  <ArrowRight />
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Or continue with</span>
                <div className="flex gap-2">
                  {providers.map((provider) => (
                    <Button key={provider.name} variant="outline" size="icon-lg" aria-label={provider.name}>
                      {provider.mark}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Try andrew@buildkit.dev for single sign-on, any other for a code.
              </p>
            </form>
          )}
          {step === "sso" && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Buildkit uses single sign-on</h1>
                <p className="text-sm text-muted-foreground">
                  {email} signs in through your company&apos;s Okta, so your access follows your company account.
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <span
                  className="grid size-10 place-items-center rounded-lg"
                  style={{ background: accent(250, 0.4, 0.1) }}
                >
                  <Building2 className="size-5" style={{ color: accent(250, 0.8, 0.12) }} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">Buildkit</span>
                  <span className="text-xs text-muted-foreground">8 members, verified domain buildkit.dev</span>
                </div>
                <Lock className="size-4 text-muted-foreground" />
              </div>
              <Button size="lg" className="h-10 gap-2">
                <KeyRound /> Continue with Okta
              </Button>
              <BackLink onClick={() => setStep("email")}>Use a different email</BackLink>
            </div>
          )}
          {step === "code" && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
                <p className="text-sm text-muted-foreground">
                  We sent a code to <span className="text-foreground">{email}</span>. It works for 10 minutes.
                </p>
              </div>
              <div className="flex gap-2">
                {["4", "8", "1", "", "", ""].map((digit, index) => (
                  <span
                    key={index}
                    className={`grid h-14 flex-1 place-items-center rounded-lg border text-2xl font-medium tabular-nums dark:bg-input/30 ${
                      index === 3 ? "border-ring ring-3 ring-ring/50" : ""
                    }`}
                  >
                    {digit}
                    {index === 3 && <span className="h-6 w-px animate-pulse bg-foreground" />}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <BackLink onClick={() => setStep("email")}>Use a different email</BackLink>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  Send a new code
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ExploreWindow>
  )
}

function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {children}
    </button>
  )
}

/** Email first, as AuthKit does it: one question, then single sign-on or a code depending on the email. */
export const EmailFirstFlow: Story = { render: () => <EmailFirst initial="email" /> }

/** The email's domain belongs to an organization with single sign-on: straight to its identity provider. */
export const EmailFirstSingleSignOn: Story = { render: () => <EmailFirst initial="sso" /> }

/** No single sign-on: a one-time code by email, no password. */
export const EmailFirstCode: Story = { render: () => <EmailFirst initial="code" /> }

/**
 * After a button: the browser has sign-in open, and Parity waits for it to hand back. Cancel goes back to the ways in.
 * The Prototype panel plays the browser: sign in, cancel there, hit an error, or use an account WorkOS turns down.
 */
export const WaitingForBrowser: Story = {
  render: () => <SignInPrototype place="window" flow={{ at: "waiting", via: "Google" }} />
}

/**
 * The browser never hands back: the page didn't open, opened in a browser the person doesn't use, or its tab was
 * closed. Parity doesn't give up on its own, since the person may still be signing in. After 30 seconds it says what
 * to try, and Open it again becomes the main button.
 */
export const BrowserNeverHandsBack: Story = {
  render: () => <SignInPrototype place="window" flow={{ at: "waiting", via: "Google", slow: true }} />
}

/** Sign-in was turned down in the browser, at Google or AuthKit: nothing changed, so try again or another way. */
export const SignInCanceled: Story = {
  render: () => <SignInPrototype place="window" flow={{ at: "problem", via: "Google", problem: "canceled" }} />
}

/**
 * Sign-in went wrong: the browser handed back an error, or trading its code failed. What WorkOS said is under Details,
 * to copy for help.
 */
export const SignInFailed: Story = {
  render: () => <SignInPrototype place="window" flow={{ at: "problem", via: "Google", problem: "failed" }} />
}

/**
 * WorkOS turned the account down. Parity can't know WorkOS's rules, so it names the account, offers another way in,
 * and keeps what WorkOS said under Details.
 */
export const AccountRefused: Story = {
  render: () => <SignInPrototype place="window" flow={{ at: "problem", via: "Google", problem: "refused" }} />
}

/**
 * WorkOS turned the account down because its organization signs in through single sign-on. WorkOS says so without
 * naming the organization or its identity provider, so neither does Parity. Continue with single sign-on opens the
 * browser at the organization's sign-in.
 */
export const SingleSignOnRequired: Story = {
  render: () => <SignInPrototype place="window" flow={{ at: "problem", via: "Google", problem: "single-sign-on" }} />
}

/** Signed in, and in more than one organization: where to work, and invitations waiting. */
export const ChooseOrganization: Story = {
  render: () => (
    <ExploreWindow>
      <div className="flex h-full flex-col items-center justify-center px-6" style={glow}>
        <div className="flex w-full max-w-[26rem] flex-col gap-6">
          <div className="flex items-center gap-3">
            <Avatar person={me} size={40} />
            <div className="flex flex-col">
              <h1 className="text-xl font-semibold tracking-tight">Welcome back, Andrew</h1>
              <p className="text-sm text-muted-foreground">Choose where to work. You can switch any time.</p>
            </div>
          </div>
          <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
            {organizations.map((org, index) => (
              <button
                key={org.id}
                type="button"
                className={`flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 ${index ? "border-t" : ""}`}
              >
                <span
                  className="grid size-9 place-items-center rounded-lg text-sm font-semibold text-white"
                  style={{ background: accent(org.hue, 0.55, 0.14) }}
                >
                  {org.name[0]}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{org.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {org.members === 1 ? "Just you" : `${org.members} members, signs in with Okta`}
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
            ))}
            <div className="flex items-center gap-3 border-t bg-muted/30 px-4 py-3">
              <span className="grid size-9 place-items-center rounded-lg border border-dashed">
                <Mail className="size-4 text-muted-foreground" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">Lumen Labs</span>
                <span className="text-xs text-muted-foreground">{people.sam.name} invited you</span>
              </span>
              <Button size="sm" variant="ghost">
                Decline
              </Button>
              <Button size="sm">Join</Button>
            </div>
          </div>
          <Button variant="ghost" className="gap-1.5 self-start text-muted-foreground">
            <Plus /> Create an organization
          </Button>
        </div>
      </div>
    </ExploreWindow>
  )
}

/**
 * The organization requires signing in again, after its session limit or a policy change. Parity knows who you are and
 * how you signed in last, so it's one button, and nothing you had open is lost.
 */
export const SessionEnded: Story = {
  render: () => (
    <ExploreWindow>
      <div className="flex h-full flex-col items-center justify-center px-6" style={glow}>
        <div className="flex w-full max-w-[22rem] flex-col gap-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <ParityMark size={48} />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">Sign in again to keep working</h1>
              <p className="text-sm text-muted-foreground">
                Buildkit asks members to sign in again from time to time. Your open projects stay as they are, unsaved
                changes too.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <Avatar person={me} size={36} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{me.name}</span>
              <span className="truncate text-xs text-muted-foreground">andrew@buildkit.dev</span>
            </div>
            <Lock className="size-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-3">
            <Button size="lg" className="h-10 gap-2">
              <KeyRound /> Continue with Okta
            </Button>
            <Button variant="ghost" className="text-muted-foreground">
              Use a different account
            </Button>
          </div>
          <Legal />
        </div>
      </div>
    </ExploreWindow>
  )
}

/**
 * Home after "Open a folder on this computer without signing in", before any project. Where your avatar goes, an
 * outline of one opens the account menu with Sign in in your name's place; agents, settings and help stay, since they
 * don't need an account. Sign in opens the sign-in screen in a dialog over Home.
 */
export const SignedOut: Story = { render: () => <SignInPrototype /> }

/**
 * Home just after Sign out. Projects on this computer stay open and listed, all under Personal, since Parity can't
 * tell which organization a folder belongs to until you sign in. There's no inbox, For you offers Sign in, and so do
 * the account menu and the organization switcher.
 */
export const AfterSigningOut: Story = { render: () => <SignInPrototype home="home" notice="signed-out" /> }

/**
 * Signed in, and in no organization yet. The account menu shows your email where Kestrel and your role would be.
 * Home's switcher has Personal alone, and its menu offers New organization but not Invite people, which needs an
 * organization to invite to. Sign out and in again to come back the same.
 */
export const NoOrganization: Story = {
  render: () => <SignInPrototype home="home" account="no-organization" profile="no-organization" />
}

/**
 * Signed in on a system with no keyring, where Electron would keep the session in plain text, so Parity keeps it only
 * until it quits. A toast says so once, after signing in, and the account menu keeps saying it: Signed in until you
 * quit Parity, which explains what to do.
 */
export const SignedInUntilQuit: Story = {
  render: () => <SignInPrototype home="home" account="no-keychain" profile="no-keychain" notice="until-quit" />
}

/**
 * The browser after it has handed back to a `pnpm dev` copy: the page that copy's loopback serves, once the code is
 * traded. It's the whole page, plain HTML with no scripts, in the system's light or dark. Installed apps hand back
 * through `parity://`, and the browser shows its own prompt instead.
 */
export const BrowserAfterHandingBack: Story = { render: () => <HandBackPage outcome="signed-in" /> }

/** The same page when the code couldn't be traded: Parity's window says why, so the page only points there. */
export const BrowserAfterAProblem: Story = { render: () => <HandBackPage outcome="problem" /> }

/**
 * AuthKit's own pages, dressed by WorkOS's branding settings, beside the settings that do it: the app's colors, font
 * and corners, the icon, and the sign-in screen's glow as custom CSS. People only pass through these: the code for a
 * work email without single sign-on, choosing an organization, an invitation. The pages work: Continue goes on to the
 * next one.
 */
export const AuthKitPages: Story = { render: () => <AuthKitBranding /> }
