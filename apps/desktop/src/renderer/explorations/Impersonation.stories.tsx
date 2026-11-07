import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SonnerToaster
} from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { LifeBuoy } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useResolvedTheme } from "../theme.ts"
import { me } from "./explore-data.ts"
import type { MockTab } from "./parts.tsx"
import { HomePage, kestrelMember, StartActionsProvider, StartWindow } from "./start/page.tsx"

/**
 * Account impersonation: someone at Better Apps signs in as a customer's account, from WorkOS's dashboard, to see and
 * reproduce what they see. Parity asks before switching, shows a band above the window for the whole session, and
 * signs out when it ends: from the band, after WorkOS's 60 minutes, or when Parity quits.
 *
 * The stories are one prototype, each starting at a different point. A panel marked Prototype stands in for WorkOS's
 * dashboard and its clock.
 */
const meta = {
  title: "Parity/Explorations/Impersonation",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const support = {
  email: "sam@betterapps.io",
  reason: "Checking why Kestrel website's previews don't load (ticket 4182)"
}
const person = { name: me.name, email: kestrelMember.email, where: "Kestrel, editor" }

type Phase = "confirm" | "on" | "ended" | "own"

const tabs: MockTab[] = [
  { id: "home", title: "Home", home: true },
  { id: "website", title: "Kestrel website" }
]

/** The band above the window while impersonating. It can't be closed or hidden, and it's the same on every tab. */
function ImpersonationBand({ minutes, onEnd }: { minutes: number; onEnd: () => void }) {
  const soon = minutes <= 5
  return (
    <section
      aria-label="Support session"
      className="flex h-9 shrink-0 items-center gap-2.5 bg-amber-400 px-3 text-[13px] text-amber-950"
    >
      <LifeBuoy className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">
        <span className="font-semibold">You&apos;re signed in as {person.name}</span> ({person.email}) for support
      </span>
      <span className={`ml-auto shrink-0 tabular-nums ${soon ? "font-semibold" : ""}`}>
        {minutes > 0 ? `Ends in ${minutes} min` : "Ending"}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 border-amber-950/30 bg-amber-50 text-amber-950 hover:bg-amber-100"
        onClick={onEnd}
      >
        End support session
      </Button>
    </section>
  )
}

/** What Parity asks when WorkOS hands back an impersonated session, before anything changes. */
function StartDialog({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in as {person.name}?</DialogTitle>
          <DialogDescription>
            You&apos;ll see Parity as {person.email} does, in {person.where.split(",")[0]}, until you end the session or
            it runs out in 60 minutes. You&apos;re signed out of your own account until then.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted p-3 text-sm">
          <dt className="text-muted-foreground">Started by</dt>
          <dd>{support.email}</dd>
          <dt className="text-muted-foreground">Reason</dt>
          <dd>{support.reason}</dd>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onStart}>Sign in as {person.name.split(" ")[0]}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Stands in for WorkOS: starts a session from its dashboard, and moves the clock on. */
function PrototypePanel({
  phase,
  onImpersonate,
  onWait
}: {
  phase: Phase
  onImpersonate: () => void
  onWait: () => void
}) {
  return (
    <div className="fixed bottom-4 left-4 z-50 flex w-64 flex-col gap-2 rounded-lg border border-dashed bg-background/95 p-3 text-xs shadow-lg">
      <span className="font-semibold tracking-wide text-muted-foreground uppercase">Prototype</span>
      <Button size="sm" variant="outline" disabled={phase === "on" || phase === "confirm"} onClick={onImpersonate}>
        Impersonate from WorkOS
      </Button>
      <Button size="sm" variant="outline" disabled={phase !== "on"} onClick={onWait}>
        Skip ahead 15 minutes
      </Button>
    </div>
  )
}

function ImpersonationPrototype({ start, minutes: startMinutes = 60 }: { start: Phase; minutes?: number }) {
  const theme = useResolvedTheme()
  const [phase, setPhase] = useState<Phase>(start)
  const [minutes, setMinutes] = useState(startMinutes)
  const [active, setActive] = useState("home")

  const end = (why: "ended" | "expired") => {
    setPhase("ended")
    toast(why === "expired" ? "Your support session ran out" : "Support session ended", {
      id: "impersonation-ended",
      description: `You're signed out of ${person.name}'s account. Sign in to use your own.`
    })
  }
  const own = { email: support.email, orgs: ["personal"] as const }
  const signedOut = phase === "ended" ? null : own
  const account = phase === "on" ? kestrelMember : signedOut
  return (
    <StartActionsProvider
      value={{
        account,
        signOut: () => (phase === "on" ? end("ended") : setPhase("ended")),
        signIn: () => setPhase("own")
      }}
    >
      <div className={`flex h-screen flex-col ${phase === "on" ? "ring-2 ring-amber-400 ring-inset" : ""}`}>
        {phase === "on" && <ImpersonationBand minutes={minutes} onEnd={() => end("ended")} />}
        <div className="min-h-0 flex-1 [&>div]:h-full [&>div]:min-h-0">
          <StartWindow tabs={tabs} active={active} onSelect={setActive}>
            <HomePage />
          </StartWindow>
        </div>
      </div>
      {phase === "confirm" && (
        <StartDialog
          onStart={() => {
            setMinutes(60)
            setPhase("on")
          }}
          onCancel={() => setPhase("own")}
        />
      )}
      <PrototypePanel
        phase={phase}
        onImpersonate={() => setPhase("confirm")}
        onWait={() => {
          const left = Math.max(0, minutes - 15)
          setMinutes(left)
          if (left === 0) end("expired")
        }}
      />
      <SonnerToaster theme={theme} position="bottom-right" />
    </StartActionsProvider>
  )
}

/**
 * WorkOS has handed back a session for someone else's account. Parity names the account, who started it and why, and
 * switches only on Sign in as. Cancel keeps you in your own account.
 */
export const Starting: Story = { render: () => <ImpersonationPrototype start="confirm" /> }

/**
 * Signed in as Andrew for support. The band stays above the window on every tab and can't be dismissed; a ring around
 * the window keeps it visible in a screenshot that crops the band. Everything else works as it
 * does for Andrew, and Sign out in the account menu ends the session too.
 */
export const Impersonating: Story = { render: () => <ImpersonationPrototype start="on" minutes={47} /> }

/** Five minutes or less left: the time turns bold. At zero WorkOS refuses the refresh and Parity signs out. */
export const EndingSoon: Story = { render: () => <ImpersonationPrototype start="on" minutes={5} /> }

/** After the session ends, Parity is signed out, and a toast says so. Sign in goes back to your own account. */
export const Ended: Story = { render: () => <ImpersonationPrototype start="ended" /> }
