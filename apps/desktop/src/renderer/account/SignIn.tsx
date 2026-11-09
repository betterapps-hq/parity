import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@buildkitgg/shadcn-baseui-kit"
import { useEffect, useState } from "react"
import type { AccountState } from "../../shared/account.ts"
import { accountActions, useAccount } from "./account.ts"
import {
  ChooseOrganizationPanel,
  glow,
  ProblemPanel,
  SessionEndedPanel,
  SignInPanel,
  WaitingPanel
} from "./SignInPanels.tsx"

/** How long Parity waits before it says what to do if the browser never showed the page. */
const slowAfter = 30_000

/** Whether the sign-in waiting at `url` has waited long enough that the page may never have shown. */
function useSlow(url: string | undefined): boolean {
  const [slow, setSlow] = useState<string>()
  useEffect(() => {
    if (!url) {
      return
    }

    const timer = setTimeout(() => setSlow(url), slowAfter)

    return () => clearTimeout(timer)
  }, [url])

  return url !== undefined && slow === url
}

/** What adding another account says about the ones you're signed in to, which stay signed in. */
function staying(state: AccountState): string {
  const signedIn = state.accounts.filter((each) => !each.ended)
  const [only] = signedIn

  return signedIn.length === 1 && only ? `You stay signed in as ${only.email}.` : "Your accounts stay signed in."
}

/**
 * Where sign-in has got: the ways in, waiting for the browser, what went wrong, or signing in again after a session
 * ended. Signed in already, the ways in add another account. Cancel goes back a step: to the ways in on the sign-in
 * screen, or out of the dialog.
 */
export function SignInFlow({ state, dialog }: { state: AccountState; dialog?: boolean }) {
  const { account, attempt, ended } = state
  const slow = useSlow(attempt?.at === "waiting" ? attempt.url : undefined)

  if (attempt?.at === "waiting") {
    return (
      <WaitingPanel
        dialog={dialog}
        attempt={attempt}
        slow={slow}
        onReopen={accountActions.reopen}
        onCancel={dialog ? accountActions.close : accountActions.back}
      />
    )
  }

  if (attempt?.at === "problem") {
    const { problem } = attempt

    if (problem === "choose-organization") {
      return (
        <ChooseOrganizationPanel
          dialog={dialog}
          attempt={attempt}
          onSignIn={accountActions.signIn}
          onOther={accountActions.back}
        />
      )
    }

    return (
      <ProblemPanel
        dialog={dialog}
        attempt={{ ...attempt, problem }}
        onSignIn={accountActions.signIn}
        onOther={accountActions.back}
      />
    )
  }

  if (ended) {
    return (
      <SessionEndedPanel
        dialog={dialog}
        ended={ended}
        stillIn={account?.email}
        onSignIn={accountActions.signIn}
        onOther={accountActions.back}
      />
    )
  }

  if (dialog && account) {
    return (
      <SignInPanel dialog title="Add another account" description={staying(state)} onSignIn={accountActions.signIn} />
    )
  }

  return <SignInPanel dialog={dialog} onSignIn={accountActions.signIn} />
}

/**
 * The sign-in screen, the first time Parity opens: centered, with nothing but the ways in, and a way to go on without
 * signing in, which opens the folder picker over Home.
 */
export function SignInScreen({ state }: { state: AccountState }) {
  const form = !state.attempt && !state.ended

  return (
    <main
      aria-label="Sign in"
      className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-10"
      style={glow}
    >
      <div className={`my-auto flex w-full flex-col items-center ${form ? "max-w-[22rem]" : "max-w-[28rem]"}`}>
        <SignInFlow state={state} />
      </div>
      {form && (
        <button
          type="button"
          onClick={accountActions.skip}
          className="mt-8 shrink-0 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open a folder on this computer without signing in
        </button>
      )}
    </main>
  )
}

/**
 * Sign in from the title bar or Home, and a session WorkOS ended: the sign-in screen in a dialog over Home, without the
 * way to skip it. Only Cancel, Escape or its close button end it, so a stray click beside it doesn't drop a sign-in.
 */
export function SignInDialog() {
  const { place, state } = useAccount()

  return (
    <Dialog open={place === "dialog"} disablePointerDismissal onOpenChange={(open) => !open && accountActions.close()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-0 overflow-y-auto p-8 sm:max-w-[28rem]">
        <SignInFlow state={state} dialog />
      </DialogContent>
    </Dialog>
  )
}

/** Why signing in lasts only until Parity quits, from the account menu or the toast after signing in. */
export function UntilQuitDialog() {
  const { untilQuit } = useAccount()

  return (
    <Dialog open={untilQuit} onOpenChange={accountActions.explainUntilQuit}>
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
          <Button onClick={() => accountActions.explainUntilQuit(false)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
