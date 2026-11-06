import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DialogDescription,
  DialogTitle,
  Input
} from "@buildkitgg/shadcn-baseui-kit"
import {
  ArrowRight,
  Ban,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  Lock,
  ShieldCheck,
  TriangleAlert,
  X
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import icon from "../../../../../brand/parity-icon.svg?url"
import type {
  AccountPerson,
  SignInAttempt,
  SignInProblem,
  SignInProvider,
  SignInRequest
} from "../../shared/account.ts"
import { GitHubMark } from "../start/marks.tsx"
import { GoogleMark, MicrosoftMark } from "./marks.tsx"
import { OrganizationBadge } from "./OrganizationBadge.tsx"
import { PersonAvatar } from "./PersonAvatar.tsx"

/**
 * The parts sign-in is made of, from the Sign in stories (PAR-614): the ways in, waiting for the browser, what went
 * wrong when it didn't hand back a session, and signing in again after WorkOS ended one. Each is the page's heading in
 * the window and the dialog's title in a dialog.
 */

const providers: { provider: SignInProvider; name: string; mark: ReactNode }[] = [
  { provider: "GoogleOAuth", name: "Google", mark: <GoogleMark /> },
  { provider: "GitHubOAuth", name: "GitHub", mark: <GitHubMark /> },
  { provider: "MicrosoftOAuth", name: "Microsoft", mark: <MicrosoftMark /> }
]

/** A provider by name, or the work email for AuthKit. */
export function providerName(provider: SignInProvider): string {
  return providers.find((candidate) => candidate.provider === provider)?.name ?? "your work email"
}

/** Quiet light behind the form, in the mark's colors. */
export const glow = {
  backgroundImage:
    "radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, oklch(0.6 0.2 275) 22%, transparent), transparent 70%), radial-gradient(40% 30% at 80% 100%, color-mix(in oklch, oklch(0.6 0.16 220) 10%, transparent), transparent 70%)"
}

function Mark({ size }: { size: number }) {
  return <img src={icon} alt="" width={size} height={size} />
}

/** A heading that's the dialog's title in a dialog, and the page's heading in the window. */
function Heading({ dialog, className, children }: { dialog?: boolean; className: string; children: ReactNode }) {
  return dialog ? (
    <DialogTitle className={className}>{children}</DialogTitle>
  ) : (
    <h1 className={className}>{children}</h1>
  )
}

function Description({ dialog, children }: { dialog?: boolean; children: ReactNode }) {
  const className = "text-sm text-pretty text-muted-foreground"
  return dialog ? (
    <DialogDescription className={className}>{children}</DialogDescription>
  ) : (
    <p className={className}>{children}</p>
  )
}

/** Provider buttons, then a work email for single sign-on or a code. */
function SignInForm({ onSignIn }: { onSignIn: (request: SignInRequest) => void }) {
  const [email, setEmail] = useState("")
  return (
    <div className="flex flex-col gap-3">
      {providers.map(({ provider, name, mark }) => (
        <Button
          key={provider}
          variant="outline"
          size="lg"
          className="h-10 justify-center gap-2.5"
          onClick={() => onSignIn({ provider })}
        >
          {mark}
          Continue with {name}
        </Button>
      ))}
      <div className="my-1 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const given = email.trim()
          onSignIn(given ? { provider: "authkit", email: given } : { provider: "authkit" })
        }}
      >
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="work-email" className="text-muted-foreground">
            Work email
          </label>
          <Input
            id="work-email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="h-10"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <Button type="submit" size="lg" className="h-10">
          Continue
        </Button>
      </form>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        If your company signs in with Okta, Entra ID or Google Workspace, your email takes you there.
      </p>
    </div>
  )
}

/** Under the ways in: signing in happens in the browser, so Parity never handles a password. Kept short (your call). */
function Legal() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
      Parity never sees your password.
    </p>
  )
}

/** The sign-in screen: the mark, one line on what Parity is, and the ways in. */
export function SignInPanel({ dialog, onSignIn }: { dialog?: boolean; onSignIn: (request: SignInRequest) => void }) {
  return (
    <div className="flex w-full flex-col gap-7">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mark size={dialog ? 40 : 48} />
        <div className="flex flex-col gap-1.5">
          <Heading dialog={dialog} className="text-2xl leading-tight font-semibold tracking-tight">
            Sign in to Parity
          </Heading>
          <Description dialog={dialog}>Design with your real components, your team and your agents.</Description>
        </div>
      </div>
      <SignInForm onSignIn={onSignIn} />
      <Legal />
    </div>
  )
}

/** The mark in a ring: turning while Parity waits, still with a badge once something went wrong. */
function MarkRing({ turning, badge }: { turning?: boolean; badge?: { icon: ReactNode; color: string } }) {
  return (
    <div className="relative grid size-24 place-items-center">
      {turning ? (
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[oklch(0.72_0.17_275)] [animation-duration:1.4s] motion-reduce:animate-none" />
      ) : (
        <span className="absolute inset-0 rounded-full border-2 border-border" />
      )}
      <span className="absolute inset-2 rounded-full bg-[oklch(0.6_0.18_275/0.12)]" />
      <Mark size={44} />
      {badge && (
        <span
          className="absolute right-1 bottom-1 grid size-7 place-items-center rounded-full text-white ring-4 ring-background [&_svg]:size-3.5"
          style={{ background: badge.color }}
        >
          {badge.icon}
        </span>
      )}
    </div>
  )
}

function copy(text: string, said: string, id: string): void {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(said, { id, duration: 2000 }),
    () => toast.error("Parity couldn't copy that", { id })
  )
}

/**
 * After a button: the browser has sign-in open, and Parity waits for it to hand back. It never gives up on its own,
 * since the person may still be in the browser; after a while it says what to do if the page never showed.
 */
export function WaitingPanel({
  attempt,
  slow,
  dialog,
  onReopen,
  onCancel
}: {
  attempt: Extract<SignInAttempt, { at: "waiting" }>
  /** Long enough that the page may not have opened, or opened somewhere else. */
  slow?: boolean
  dialog?: boolean
  onReopen: () => void
  onCancel: () => void
}) {
  const opened =
    attempt.provider === "authkit"
      ? "We opened your browser to sign you in."
      : `We opened ${providerName(attempt.provider)} in your browser to sign you in.`
  const copyLink = () => copy(attempt.url, "Copied the link", "copied-link")
  return (
    <div className="flex flex-col items-center gap-8">
      <MarkRing turning />
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <Heading dialog={dialog} className="text-xl font-semibold tracking-tight">
          {slow ? "Still waiting for your browser" : "Continue in your browser"}
        </Heading>
        <Description dialog={dialog}>
          {slow
            ? "If the page didn't open, or opened in a browser you don't use, open it again."
            : `${opened} When you're done there, you'll come straight back here.`}
        </Description>
      </div>
      {/* One button at a time, and the ways round a page that didn't show as a line under it (your call). */}
      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        {slow ? (
          <div className="flex w-full flex-col gap-2">
            <Button className="w-full gap-1.5" onClick={onReopen}>
              <ExternalLink /> Open it again
            </Button>
            <Button variant="ghost" className="w-full" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <p className="text-center text-xs text-pretty text-muted-foreground">
          {slow ? (
            <>
              Or <InlineAction onClick={copyLink}>copy the link</InlineAction> and paste it into the browser you use.
            </>
          ) : (
            <>
              Page didn&apos;t open? <InlineAction onClick={onReopen}>Open it again</InlineAction> or{" "}
              <InlineAction onClick={copyLink}>copy the link</InlineAction>.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

/** A button that reads as part of a sentence. */
function InlineAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}

/** Error details, folded away until asked for, with a way to copy them. */
function Details({ text }: { text: string }) {
  return (
    <Collapsible className="flex w-full flex-col items-center gap-2">
      <CollapsibleTrigger className="group/details flex items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight className="size-3.5 transition-transform group-data-[panel-open]/details:rotate-90" />
        Details
      </CollapsibleTrigger>
      <CollapsibleContent className="w-full">
        <div className="relative rounded-lg border bg-muted/40 p-3 pr-10 text-left">
          <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{text}</pre>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Copy the details"
            className="absolute top-2 right-2"
            onClick={() => copy(text, "Copied the details", "copied-details")}
          >
            <Copy />
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

type ProblemAttempt = Extract<SignInAttempt, { at: "problem" }>

/** The problems this panel shows; choosing an organization has its own. */
type ShownProblem = Exclude<SignInProblem, "choose-organization">

const badges: Record<ShownProblem, { icon: ReactNode; color: string }> = {
  canceled: { icon: <X />, color: "oklch(0.55 0 0)" },
  failed: { icon: <TriangleAlert />, color: "oklch(0.7 0.16 65)" },
  refused: { icon: <Ban />, color: "oklch(0.62 0.2 25)" },
  "single-sign-on": { icon: <KeyRound />, color: "oklch(0.55 0.18 275)" }
}

/**
 * Sign-in ended without a session. Nothing the person had open changes, and each case says what they can do next:
 * try again, sign in another way, or use their organization's single sign-on.
 */
export function ProblemPanel({
  attempt,
  dialog,
  onSignIn,
  onOther
}: {
  attempt: ProblemAttempt & { problem: ShownProblem }
  dialog?: boolean
  onSignIn: (request: SignInRequest) => void
  /** Back to the ways in. */
  onOther: () => void
}) {
  const { provider, email, details } = attempt
  const retry = () => onSignIn(attempt.email === undefined ? { provider } : { provider, email: attempt.email })
  const other = (
    <Button variant="outline" onClick={onOther}>
      Choose another way
    </Button>
  )
  const account = email ? <span className="text-foreground">{email}</span> : "This account"
  const content: Record<ShownProblem, { title: string; text: ReactNode; actions: ReactNode }> = {
    canceled: {
      title: "Canceled in your browser",
      text: "Nothing changed, and you're not signed in. Try again, or choose another way to sign in.",
      actions: (
        <>
          <Button onClick={retry}>Try again</Button>
          {other}
        </>
      )
    },
    failed: {
      title: "Parity couldn't sign you in",
      text: "Something went wrong between your browser and Parity. Try again in a moment.",
      actions: (
        <>
          <Button onClick={retry}>Try again</Button>
          {other}
        </>
      )
    },
    refused: {
      title: "This account can't sign in",
      text: (
        <>
          {account} isn&apos;t allowed to sign in to Parity. Choose another way, or copy the details if you need help.
        </>
      ),
      actions: other
    },
    "single-sign-on": {
      title: "Sign in through your organization",
      text: (
        <>
          {account} has to use your organization&apos;s single sign-on, not {providerName(provider)}.
        </>
      ),
      actions: (
        <>
          <Button
            className="gap-1.5"
            onClick={() => onSignIn(email === undefined ? { provider: "authkit" } : { provider: "authkit", email })}
          >
            <KeyRound /> Continue with single sign-on
          </Button>
          {other}
        </>
      )
    }
  }
  const shown = content[attempt.problem]
  return (
    <div className="flex flex-col items-center gap-8">
      <MarkRing badge={badges[attempt.problem]} />
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <Heading dialog={dialog} className="text-xl font-semibold tracking-tight">
          {shown.title}
        </Heading>
        <Description dialog={dialog}>{shown.text}</Description>
      </div>
      <div className="flex flex-wrap justify-center gap-2">{shown.actions}</div>
      {details && attempt.problem !== "canceled" && (
        <div className="w-full max-w-sm">
          <Details text={details} />
        </div>
      )}
    </div>
  )
}

/**
 * Someone in more than one organization signed in, and WorkOS asks which to use. They choose here, from the
 * organizations WorkOS named, and AuthKit, in the browser, signs them in to that one. Finishing with WorkOS's pending
 * token instead needs the client secret. Invitations and Create an organization wait for Parity's service (PAR-616).
 */
export function ChooseOrganizationPanel({
  attempt,
  dialog,
  onSignIn,
  onOther
}: {
  attempt: ProblemAttempt
  dialog?: boolean
  onSignIn: (request: SignInRequest) => void
  onOther: () => void
}) {
  const { email, organizations = [] } = attempt
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mark size={dialog ? 40 : 48} />
        <div className="flex flex-col gap-1.5">
          <Heading dialog={dialog} className="text-2xl font-semibold tracking-tight">
            Choose an organization
          </Heading>
          <Description dialog={dialog}>
            {email ? <span className="text-foreground">{email}</span> : "Your account"} is in more than one
            organization. Choose the one to sign in to.
          </Description>
        </div>
      </div>
      <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
        {organizations.map((organization, index) => (
          <li key={organization.id} className={index ? "border-t" : ""}>
            <button
              type="button"
              // Through AuthKit: on WorkOS's authorize URL `organization_id` names an organization's single sign-on,
              // which a Google, GitHub or Microsoft sign-in has none of, while AuthKit signs in to that organization.
              onClick={() =>
                onSignIn({
                  provider: "authkit",
                  organizationId: organization.id,
                  ...(email !== undefined && { email })
                })
              }
              className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <OrganizationBadge organization={organization} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{organization.name}</span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="self-center text-muted-foreground" onClick={onOther}>
        Choose another way
      </Button>
    </div>
  )
}

/**
 * WorkOS ended the session on refresh, as after an organization's session limit or an admin removing the person.
 * Parity knows who it was and how they signed in, so it's one button, and nothing open is lost.
 */
export function SessionEndedPanel({
  ended,
  dialog,
  onSignIn,
  onOther
}: {
  ended: { person: AccountPerson; provider: SignInProvider }
  dialog?: boolean
  onSignIn: (request: SignInRequest) => void
  onOther: () => void
}) {
  const { person, provider } = ended
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mark size={dialog ? 40 : 48} />
        <div className="flex flex-col gap-1.5">
          <Heading dialog={dialog} className="text-2xl font-semibold tracking-tight">
            Sign in again to keep working
          </Heading>
          <Description dialog={dialog}>
            Your session ended, so you&apos;re signed out. Your open projects stay as they are, unsaved changes too.
          </Description>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
        <PersonAvatar person={person} size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{person.name ?? person.email}</span>
          {person.name && <span className="truncate text-xs text-muted-foreground">{person.email}</span>}
        </div>
        <Lock className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          className="h-10 gap-2"
          onClick={() => onSignIn(provider === "authkit" ? { provider, email: person.email } : { provider })}
        >
          {providers.find((candidate) => candidate.provider === provider)?.mark ?? <KeyRound />}
          Continue with {providerName(provider)}
        </Button>
        <Button variant="ghost" className="text-muted-foreground" onClick={onOther}>
          Use a different account
        </Button>
      </div>
      <Legal />
    </div>
  )
}
