import { type ReactNode, useLayoutEffect } from "react"
import type { AccountState, SignedInAccount } from "../../shared/account.ts"
import { setStoryAccount } from "../stories/host.ts"
import { accountActions, useAccount } from "./account.ts"
import { SignInScreen } from "./SignIn.tsx"

/*
 * What the sign-in stories share (PAR-612, PAR-669): who's signed in, and a way to say it as main would. The host stands
 * in for main: a button waits for a browser that never hands back, and Cancel, switching accounts and Sign out do what
 * they say.
 */

export const ada = { email: "ada@kestrel.dev", name: "Ada Lovelace" }
export const signedOut: AccountState = { account: null, accounts: [], attempt: null, ended: null }
export const url = "https://api.workos.com/user_management/authorize?client_id=client_story"

/** Says who's signed in as the story mounts, as main would, after the preview has put the last story's back. */
export function Seeded({ state, dialog, children }: { state: AccountState; dialog?: boolean; children: ReactNode }) {
  useLayoutEffect(() => {
    setStoryAccount(state)

    if (dialog) {
      accountActions.open()
    }
  }, [state, dialog])

  return children
}

/** The window below its title bar, showing the sign-in screen as the first launch does. */
export function Screen({ state }: { state: AccountState }) {
  const { state: shown } = useAccount()

  return (
    <Seeded state={state}>
      <div className="flex h-screen min-h-[600px] flex-col bg-background text-foreground">
        <SignInScreen state={shown} />
      </div>
    </Seeded>
  )
}

export const kestrel = { id: "org_01KESTREL", name: "Kestrel" }
const engines = { id: "org_01ENGINES", name: "Analytical Engines" }
const contoso = { id: "org_01CONTOSO", name: "Contoso" }

export const own: SignedInAccount = {
  ...ada,
  organizationId: kestrel.id,
  role: "admin",
  organizations: [kestrel, engines],
  provider: "GoogleOAuth"
}

export const work: SignedInAccount = {
  email: "ada.lovelace@contoso.com",
  name: "Ada Lovelace",
  organizationId: contoso.id,
  role: "member",
  organizations: [contoso],
  provider: "MicrosoftOAuth"
}

/** Signed in to `accounts`, in the first whose session is still going, as main says it. */
export function signedInTo(accounts: SignedInAccount[], untilQuit = false): AccountState {
  const here = accounts.find((each) => !each.ended)

  if (!here) {
    return { ...signedOut, accounts }
  }

  const { provider: _provider, ended: _ended, ...person } = here

  return { ...signedOut, account: { ...person, untilQuit }, accounts }
}
