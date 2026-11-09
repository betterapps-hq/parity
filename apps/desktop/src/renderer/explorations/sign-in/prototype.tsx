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
/**
 * Signing in, as one working prototype: the sign-in screen on first launch, Home signed out, the sign-in dialog from the
 * title bar, waiting for the browser and every way that ends. Each story is a starting point in it. The browser can't
 * be driven from a story, so a panel marked Prototype stands in for it while Parity waits.
 */
import { type ReactNode, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useResolvedTheme } from "../../theme.ts"
import { people } from "../explore-data.ts"
import { ExploreWindow, type MockTab } from "../parts.tsx"
import { projects, type StartProject } from "../start/data.ts"
import { FirstRunPage } from "../start/first-run.tsx"
import { NewProjectDialog, type NewProjectStart } from "../start/new-project.tsx"
import {
  HomePage,
  kestrelMember,
  ProjectTab,
  type StartAccount,
  StartActionsProvider,
  StartWindow
} from "../start/page.tsx"
import { glow, type Problem, ProblemPanel, SignInPanel, WaitingPanel } from "./panels.tsx"

/** Who the browser signs in as. */
export type Profile = "member" | "no-organization" | "no-keychain"

const accounts: Record<Profile, StartAccount> = {
  member: kestrelMember,
  "no-organization": { email: "andrew@hey.com", orgs: ["personal"] },
  "no-keychain": { ...kestrelMember, untilQuit: true }
}

export type Flow =
  | { at: "form" }
  | { at: "waiting"; via: string; slow?: boolean }
  | { at: "problem"; via: string; problem: Problem }

/** How long Parity waits before it says what to do if the browser never showed the page. */
const slowAfter = 30_000

export interface SignInStart {
  /** Where sign-in shows: the whole window on first launch, a dialog over Home after that, or nowhere yet. */
  place?: "window" | "dialog"
  flow?: Flow
  /** Who's signed in as the story opens: nobody when left out. */
  account?: Profile
  /** Who the browser signs in as. */
  profile?: Profile
  /** Home before any project is opened, or with projects. */
  home?: "first-run" | "home"
  /** What Parity has just said, as a toast. */
  notice?: "signed-out" | "until-quit"
}

/** The browser, as far as a story can play it: the ways a sign-in there can end. */
function BrowserStandIn({ onEnd }: { onEnd: (problem?: Problem) => void }) {
  const ends: { label: string; problem?: Problem }[] = [
    { label: "Sign in" },
    { label: "Cancel there", problem: "canceled" },
    { label: "Hit an error", problem: "failed" },
    { label: "Use a refused account", problem: "refused" },
    { label: "Use a company account", problem: "single-sign-on" }
  ]

  return (
    <div
      data-prototype
      className="fixed bottom-4 left-4 z-[60] flex w-56 flex-col gap-2 rounded-xl border border-dashed border-muted-foreground/40 bg-background/95 p-3 shadow-lg backdrop-blur"
    >
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Prototype: in the browser
      </span>
      <div className="flex flex-col gap-1">
        {ends.map((end) => (
          <Button
            key={end.label}
            size="sm"
            variant={end.problem ? "ghost" : "secondary"}
            className="justify-start"
            onClick={() => onEnd(end.problem)}
          >
            {end.label}
          </Button>
        ))}
      </div>
      <span className="text-[11px] leading-snug text-muted-foreground">
        Or do nothing: after 30 seconds Parity says what to try.
      </span>
    </div>
  )
}

/** Said once, after signing in on a system with no keyring. */
function untilQuitToast(onWhy: () => void) {
  toast("You're signed in until you quit Parity", {
    id: "until-quit",
    description: "This system has no keyring to keep you signed in.",
    action: { label: "What to do", onClick: onWhy },
    duration: 12_000
  })
}

function signedOutToast() {
  toast("You're signed out", { id: "signed-out", description: "Projects on this computer stay open." })
}

/** Why signing in lasts only until Parity quits, from the account menu or the toast after signing in. */
function UntilQuitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Parity can&apos;t keep you signed in</DialogTitle>
          <DialogDescription>
            Parity uses your system&apos;s keyring to keep you signed in, and this system doesn&apos;t have one.
            You&apos;ll need to sign in each time Parity starts.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          To stay signed in, install GNOME Keyring or KWallet, restart Parity, and sign in again.
        </p>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SignInPrototype({
  place: startPlace,
  flow: startFlow = { at: "form" },
  account: startAccount,
  profile = "member",
  home: startHome = "first-run",
  notice
}: SignInStart) {
  const theme = useResolvedTheme()
  const [place, setPlace] = useState(startPlace)
  const [flow, setFlow] = useState<Flow>(startFlow)
  const [account, setAccount] = useState<StartAccount | null>(startAccount ? accounts[startAccount] : null)
  const [home, setHome] = useState(startHome)
  const [why, setWhy] = useState(false)
  const [tabs, setTabs] = useState<MockTab[]>([{ id: "home", title: "Home", home: true }])
  const [active, setActive] = useState("home")
  const [made, setMade] = useState<StartProject[]>([])
  const [start, setStart] = useState<NewProjectStart>()
  const [agents, setAgents] = useState([people.claude.name])
  const opened = useRef(0)

  const waiting = flow.at === "waiting" ? flow : undefined
  // Parity never stops waiting on its own; after a while it says what to try.
  useEffect(() => {
    if (!waiting || waiting.slow) {
      return
    }

    const timer = setTimeout(() => setFlow({ ...waiting, slow: true }), slowAfter)

    return () => clearTimeout(timer)
  }, [waiting])

  useEffect(() => {
    // A toast the story opens on, as Parity would have just shown it.
    if (notice === "until-quit") {
      untilQuitToast(() => setWhy(true))
    }

    if (notice === "signed-out") {
      signedOutToast()
    }
  }, [notice])

  const begin = (via: string) => setFlow({ at: "waiting", via })

  const close = () => {
    setPlace(undefined)
    setFlow({ at: "form" })
  }

  /** Cancel goes back a step: to the ways in on the sign-in screen, or out of the dialog. */
  const cancel = () => (place === "window" ? setFlow({ at: "form" }) : close())

  const end = (problem?: Problem) => {
    if (!waiting) {
      return
    }

    if (problem) {
      setFlow({ at: "problem", via: waiting.via, problem })

      return
    }

    const signedIn = accounts[profile]
    setAccount(signedIn)

    if (place === "window") {
      setHome(profile === "no-organization" ? "first-run" : "home")
    }

    close()

    if (signedIn.untilQuit) {
      untilQuitToast(() => setWhy(true))
    }
  }

  const panel = (dialog: boolean): ReactNode => {
    if (flow.at === "form") {
      return <SignInPanel dialog={dialog} onContinue={begin} />
    }

    if (flow.at === "waiting") {
      return <WaitingPanel dialog={dialog} via={flow.via} slow={flow.slow} onCancel={cancel} />
    }

    return (
      <ProblemPanel
        dialog={dialog}
        problem={flow.problem}
        via={flow.via}
        onRetry={() => begin(flow.via)}
        onOther={() => setFlow({ at: "form" })}
        onSingleSignOn={() => begin("single sign-on")}
      />
    )
  }

  const toaster = <SonnerToaster theme={theme} position="bottom-right" />
  const standIn = waiting && <BrowserStandIn onEnd={end} />

  if (place === "window") {
    return (
      <>
        <ExploreWindow>
          <div className="flex h-full flex-col items-center justify-center px-6" style={glow}>
            <div
              className={`flex w-full flex-col items-center ${flow.at === "form" ? "max-w-[22rem]" : "max-w-[28rem]"}`}
            >
              {panel(false)}
            </div>
            {flow.at === "form" && (
              <button
                type="button"
                onClick={() => {
                  // It does what it says: the folder picker, over Home, which stays if the picker is closed.
                  close()
                  setHome("first-run")
                  setStart({ tab: "existing", source: "folder" })
                }}
                className="absolute bottom-6 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open a folder on this computer without signing in
              </button>
            )}
          </div>
        </ExploreWindow>
        {standIn}
        {toaster}
      </>
    )
  }

  const everything = [...projects, ...made]

  const openProject = (id: string, known = everything) => {
    const project = known.find((candidate) => candidate.id === id)

    if (!project) {
      return
    }

    setStart(undefined)

    if (!tabs.some((tab) => tab.id === id)) {
      setTabs([...tabs, { id, title: project.name }])
    }

    setActive(id)
  }

  const closeTab = (id: string) => {
    const at = tabs.findIndex((tab) => tab.id === id)
    const rest = tabs.filter((tab) => tab.id !== id)
    setTabs(rest)

    if (id === active) {
      setActive(rest[Math.max(0, at - 1)]!.id)
    }
  }

  const shown = active === "home" || active.startsWith("new-") ? undefined : everything.find((p) => p.id === active)

  return (
    <StartActionsProvider
      value={{
        openProject,
        create: (project) => {
          if (!made.some((candidate) => candidate.id === project.id)) {
            setMade([...made, project])
          }

          setHome("home")
          openProject(project.id, [project])
        },
        newProject: (from) => setStart(from ?? { tab: "template" }),
        agents,
        connectAgent: (name) => setAgents((current) => [...current, name]),
        account,
        signIn: () => {
          setFlow({ at: "form" })
          setPlace("dialog")
        },
        signOut: () => {
          setAccount(null)
          signedOutToast()
        },
        explainUntilQuit: () => setWhy(true)
      }}
    >
      <StartWindow
        tabs={tabs}
        active={active}
        canvas={!!shown}
        inbox={home === "home"}
        onSelect={setActive}
        onClose={closeTab}
        onNew={() => {
          const id = `new-${++opened.current}`
          setTabs([...tabs, { id, title: "New tab" }])
          setActive(id)
        }}
      >
        {/* Home starts over when someone signs in or out, since what it lists depends on who. */}
        {!shown && home === "first-run" && <FirstRunPage key={account?.email ?? "nobody"} />}
        {!shown && home === "home" && <HomePage key={account?.email ?? "nobody"} />}
        {shown && <ProjectTab key={shown.id} project={shown} />}
        {start && (
          <NewProjectDialog
            key={JSON.stringify(start)}
            start={start}
            open
            onOpenChange={(open) => !open && setStart(undefined)}
          />
        )}
        <Dialog
          open={place === "dialog"}
          // Only Cancel, Escape or the close button end it: a stray click beside it shouldn't drop a sign-in.
          disablePointerDismissal
          onOpenChange={(open) => !open && close()}
        >
          <DialogContent className="gap-0 p-8 sm:max-w-[28rem]">{panel(true)}</DialogContent>
        </Dialog>
        <UntilQuitDialog open={why} onOpenChange={setWhy} />
      </StartWindow>
      {standIn}
      {toaster}
    </StartActionsProvider>
  )
}
