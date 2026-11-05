import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DialogDescription,
  DialogTitle,
  Input
} from "@buildkitgg/shadcn-baseui-kit"
/**
 * The parts sign-in is made of, shown full window on first launch and in a dialog after: the ways in, waiting for the
 * browser, and what went wrong when it didn't hand back a session.
 */
import { Ban, ChevronRight, Copy, ExternalLink, KeyRound, TriangleAlert, X } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { accent, GitHubMark, GoogleMark, MicrosoftMark, ParityMark } from "../parts.tsx"

export const providers = [
  { name: "Google", mark: <GoogleMark /> },
  { name: "GitHub", mark: <GitHubMark /> },
  { name: "Microsoft", mark: <MicrosoftMark /> }
]

/** Quiet light behind the form, in the mark's colors. */
export const glow = {
  backgroundImage: `radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, ${accent(275, 0.6, 0.2)} 22%, transparent), transparent 70%), radial-gradient(40% 30% at 80% 100%, color-mix(in oklch, ${accent(220, 0.6, 0.16)} 10%, transparent), transparent 70%)`
}

/** Provider buttons, then a work email for single sign-on or a code. Each says which way in was picked. */
export function SignInForm({ onContinue }: { onContinue?: (via: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {providers.map((provider) => (
        <Button
          key={provider.name}
          variant="outline"
          size="lg"
          className="h-10 justify-center gap-2.5"
          onClick={() => onContinue?.(provider.name)}
        >
          {provider.mark}
          Continue with {provider.name}
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
          onContinue?.("work email")
        }}
      >
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="work-email" className="text-muted-foreground">
            Work email
          </label>
          <Input id="work-email" type="email" placeholder="you@company.com" className="h-10" />
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

export function Legal() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Sign-in opens your browser, so Parity never sees your password.{" "}
      <span className="underline underline-offset-2">Terms</span> and{" "}
      <span className="underline underline-offset-2">Privacy</span>
    </p>
  )
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

/** The sign-in screen: the mark, one line on what Parity is, and the ways in. */
export function SignInPanel({ dialog, onContinue }: { dialog?: boolean; onContinue?: (via: string) => void }) {
  return (
    <div className="flex w-full flex-col gap-7">
      <div className="flex flex-col items-center gap-4 text-center">
        <ParityMark size={dialog ? 40 : 48} />
        <div className="flex flex-col gap-1.5">
          <Heading dialog={dialog} className="text-2xl leading-tight font-semibold tracking-tight">
            Sign in to Parity
          </Heading>
          <Description dialog={dialog}>Design with your real components, your team and your agents.</Description>
        </div>
      </div>
      <SignInForm onContinue={onContinue} />
      <Legal />
    </div>
  )
}

/** Where the browser was sent: a provider, AuthKit for a work email, or the organization's single sign-on. */
function opened(via: string): string {
  if (via === "work email") return "We opened your browser to sign you in."
  if (via === "single sign-on") return "We opened your organization's single sign-on in your browser."
  return `We opened ${via} in your browser to sign you in.`
}

/** The mark in a ring: turning while Parity waits, still with a badge once something went wrong. */
function MarkRing({ turning, badge }: { turning?: boolean; badge?: { icon: ReactNode; color: string } }) {
  return (
    <div className="relative grid size-24 place-items-center">
      {turning ? (
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[oklch(0.72_0.17_275)] [animation-duration:1.4s]" />
      ) : (
        <span className="absolute inset-0 rounded-full border-2 border-border" />
      )}
      <span className="absolute inset-2 rounded-full bg-[oklch(0.6_0.18_275/0.12)]" />
      <ParityMark size={44} />
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

/**
 * After a button: the browser has sign-in open, and Parity waits for it to hand back. It never gives up on its own,
 * since the person may still be in the browser; after a while it says what to do if the page never showed.
 */
export function WaitingPanel({
  via,
  slow,
  dialog,
  onCancel
}: {
  via: string
  /** Long enough that the page may not have opened, or opened somewhere else. */
  slow?: boolean
  dialog?: boolean
  onCancel?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-8">
      <MarkRing turning />
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <Heading dialog={dialog} className="text-xl font-semibold tracking-tight">
          {slow ? "Still waiting for your browser" : "Continue in your browser"}
        </Heading>
        <Description dialog={dialog}>
          {slow
            ? "If the page didn't open, or opened in a browser you don't use, open it again or copy the link."
            : `${opened(via)} When you're done there, you'll come straight back here.`}
        </Description>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant={slow ? "default" : "outline"} className="gap-1.5">
          <ExternalLink /> Open it again
        </Button>
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => toast.success("Copied the link", { id: "copied-link", duration: 2000 })}
        >
          <Copy /> Copy the link
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** Ways sign-in ends without a session: turned down in the browser, an error, or WorkOS refusing the account. */
export type Problem = "canceled" | "failed" | "refused" | "single-sign-on"

/** The account the browser signed in to, when WorkOS turns it down. */
const refusedEmail = { refused: "andrew@hey.com", "single-sign-on": "andrew@kestrel.dev" }

/**
 * What WorkOS said, as the person can pass it on. These are examples: the panel shows whatever comes back, the
 * request it answered, its code and its message.
 */
const details: Partial<Record<Problem, string>> = {
  failed: "POST /user_management/authenticate\n400 invalid_grant\nThe code has expired or was already used.",
  refused: "POST /user_management/authenticate\n403\nThis account isn't allowed to sign in to Parity."
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
            onClick={() => toast.success("Copied the details", { id: "copied-details", duration: 2000 })}
          >
            <Copy />
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Sign-in ended without a session. Nothing the person had open changes, and each case says what they can do next:
 * try again, sign in another way, or use their organization's single sign-on.
 */
export function ProblemPanel({
  problem,
  via,
  dialog,
  onRetry,
  onOther,
  onSingleSignOn
}: {
  problem: Problem
  via: string
  dialog?: boolean
  onRetry?: () => void
  onOther?: () => void
  onSingleSignOn?: () => void
}) {
  const other = (
    <Button variant="outline" onClick={onOther}>
      Choose another way
    </Button>
  )
  const content: Record<
    Problem,
    { badge: { icon: ReactNode; color: string }; title: string; text: ReactNode; actions: ReactNode }
  > = {
    canceled: {
      badge: { icon: <X />, color: "oklch(0.55 0 0)" },
      title: "Canceled in your browser",
      text: "Nothing changed, and you're not signed in. Try again, or choose another way to sign in.",
      actions: (
        <>
          <Button onClick={onRetry}>Try again</Button>
          {other}
        </>
      )
    },
    failed: {
      badge: { icon: <TriangleAlert />, color: "oklch(0.7 0.16 65)" },
      title: "Parity couldn't sign you in",
      text: "Something went wrong between your browser and Parity. Try again in a moment.",
      actions: (
        <>
          <Button onClick={onRetry}>Try again</Button>
          {other}
        </>
      )
    },
    refused: {
      badge: { icon: <Ban />, color: "oklch(0.62 0.2 25)" },
      title: "This account can't sign in",
      text: (
        <>
          <span className="text-foreground">{refusedEmail.refused}</span> isn&apos;t allowed to sign in to Parity.
          Choose another way, or copy the details if you need help.
        </>
      ),
      actions: other
    },
    "single-sign-on": {
      badge: { icon: <KeyRound />, color: accent(275, 0.55, 0.18) },
      title: "Sign in through your organization",
      text: (
        <>
          <span className="text-foreground">{refusedEmail["single-sign-on"]}</span> has to use your organization&apos;s
          single sign-on, not {via}.
        </>
      ),
      actions: (
        <>
          <Button className="gap-1.5" onClick={onSingleSignOn}>
            <KeyRound /> Continue with single sign-on
          </Button>
          {other}
        </>
      )
    }
  }
  const shown = content[problem]
  const said = details[problem]
  return (
    <div className="flex flex-col items-center gap-8">
      <MarkRing badge={shown.badge} />
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <Heading dialog={dialog} className="text-xl font-semibold tracking-tight">
          {shown.title}
        </Heading>
        <Description dialog={dialog}>{shown.text}</Description>
      </div>
      <div className="flex flex-wrap justify-center gap-2">{shown.actions}</div>
      {said && (
        <div className="w-full max-w-sm">
          <Details text={said} />
        </div>
      )}
    </div>
  )
}
