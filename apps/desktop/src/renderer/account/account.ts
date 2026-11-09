import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import {
  type AccountPerson,
  type AccountState,
  accountState,
  type SignedInAccount,
  type SignInRequest,
  signedOut
} from "../../shared/account.ts"
import { actions } from "../chrome/actions.ts"
import { reportError } from "../report-error.ts"
import { workspace } from "../workspace.ts"
import { currentOrganization } from "./OrganizationBadge.tsx"

/**
 * Who's signed in, as main says, and where sign-in shows in the window: the whole window on first launch, a dialog
 * over Home after that, or nowhere (PAR-612). Someone can be signed in to several accounts and switch between them
 * (PAR-669). Main holds the tokens and does the signing in; this only shows it.
 */
export interface AccountView {
  /** Whether main has said who's signed in yet. */
  loaded: boolean
  state: AccountState
  place: "screen" | "dialog" | undefined
  /** The dialog that says why signing in lasts only until Parity quits. */
  untilQuit: boolean
}

let view: AccountView = { loaded: false, state: signedOut, place: undefined, untilQuit: false }
const listeners = new Set<() => void>()

function update(next: Partial<AccountView>): void {
  view = { ...view, ...next }

  for (const listener of listeners) {
    listener()
  }
}

/** Signed out, with nothing showing, as stories start. */
export function resetAccountView(): void {
  update({ loaded: true, state: signedOut, place: undefined, untilQuit: false })
}

/** The person's choice on the sign-in screen, so it shows only on first launch. */
const choiceKey = "parity.signIn"

function remember(choice: "skipped" | "signed-in"): void {
  try {
    localStorage.setItem(choiceKey, choice)
  } catch {
    // Storage that's full or off only means the screen may show again.
  }
}

/**
 * Whether this is the first launch, when the sign-in screen shows: no choice made on it yet, no project Parity knows,
 * and none it was started with, as the dev runner and the end-to-end tests start it.
 */
function firstLaunch(): boolean {
  let chosen: string | null = null

  try {
    chosen = localStorage.getItem(choiceKey)
  } catch {
    // Unreadable storage counts as no choice.
  }

  return chosen === null && !window.canvasHost.initialProject && workspace.getProjects().length === 0
}

/** Takes what main says, checked against its schema, since IPC is data from outside. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC: what main sends is checked against its schema here
export function receiveAccount(raw: unknown): void {
  const parsed = accountState.safeParse(raw)

  if (!parsed.success) {
    console.error("Parity couldn't read who's signed in", parsed.error)

    return
  }

  const state = parsed.data
  const before = view
  const was = before.state
  // Someone's signed in where nobody was, or a sign-in that was waiting signed in another account or the same again.
  const signedIn = !!state.account && (!was.account || (was.attempt?.at === "waiting" && !state.attempt))
  let place = before.place

  if (!before.loaded && !state.account && firstLaunch()) {
    place = "screen"
  }

  if (signedIn) {
    place = undefined
  }

  // WorkOS ended the session of the account you're in: say so over whatever's open, which stays as it is.
  if (state.ended && !was.ended) {
    place = "dialog"
  }

  update({ loaded: true, state, place })

  if (signedIn) {
    remember("signed-in")
  }

  if (signedIn && before.loaded && state.account) {
    joinedToast(state.account.email, was.accounts)
  }

  if (signedIn && before.loaded && state.account?.untilQuit) {
    untilQuitToast()
  }
}

/** Where an account opens: its organization, or Personal in none. */
export function workspaceOf(person: AccountPerson): string {
  return currentOrganization(person)?.name ?? "Personal"
}

/** Says which account a sign-in added, once there was already one, since your picture is all that changes. */
function joinedToast(email: string, before: readonly SignedInAccount[]): void {
  if (before.length === 0) {
    return
  }

  const had = before.find((each) => each.email === email)
  let title = `Added ${email}`

  if (had) {
    title = had.ended ? `Signed in again as ${email}` : `${email} is already signed in`
  }

  toast(title, { id: "account-joined" })
}

function untilQuitToast(): void {
  toast("You're signed in until you quit Parity", {
    id: "until-quit",
    description: "This system has no keyring to keep you signed in.",
    action: { label: "What to do", onClick: () => update({ untilQuit: true }) },
    duration: 12_000
  })
}

/** Called once by the app. It subscribes before asking, so a change while it asks isn't lost. */
export function startAccount(): void {
  let received = false
  window.canvasHost.account.subscribe((raw) => {
    received = true
    receiveAccount(raw)
  })
  void window.canvasHost.account
    .get()
    .then((raw) => {
      if (!received) {
        receiveAccount(raw)
      }
    })
    .catch((cause: unknown) => console.error("Parity couldn't ask who's signed in", cause))
}

export function useAccount(): AccountView {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    () => view
  )
}

const failed = (title: string) => (cause: unknown) => {
  console.error(title, cause)
  reportError(cause, { operation: "account", title, description: "Try again in a moment." })
}

/** What the sign-in screens, the account menu and Home do. */
export const accountActions = {
  /** Sign in from the title bar or Home: the sign-in screen in a dialog. */
  open: () => update({ place: "dialog" }),
  signIn: (request: SignInRequest) =>
    void window.canvasHost.account.signIn(request).catch(failed("Parity couldn't start signing you in")),
  reopen: () => void window.canvasHost.account.reopen().catch(failed("Parity couldn't open your browser")),
  /** Back to the ways in: the attempt, or the session that ended, is put away. */
  back: () => void window.canvasHost.account.cancel(),
  /** Closes the dialog, stopping a sign-in that's waiting. */
  close: () => {
    update({ place: undefined })
    void window.canvasHost.account.cancel()
  },
  /** "Open a folder on this computer without signing in": the folder picker, over Home, which stays if it's closed. */
  skip: () => {
    remember("skipped")
    update({ place: undefined })
    void window.canvasHost.account.cancel()
    void actions.openFolder.run("panel")
  },
  /** A project opened another way while the sign-in screen showed, as from the File menu: that's going on without. */
  leaveScreen: () => {
    if (view.place !== "screen") {
      return
    }

    remember("skipped")
    update({ place: undefined })
    void window.canvasHost.account.cancel()
  },
  /** Signing in again as an account whose session ended: straight to the browser, the way it signed in before. */
  signInAgain: (account: SignedInAccount) => {
    update({ place: "dialog" })
    accountActions.signIn({ provider: account.provider, email: account.email })
  },
  /** Signs out of any account, or forgets one whose session ended. Leaving the one you're in moves to another. */
  signOut: (email: string) => {
    const { state } = view
    const leaving = state.accounts.find((each) => each.email === email)
    const here = state.account?.email === email
    void window.canvasHost.account.signOut(email).then(
      () => {
        const now = view.state.account

        if (leaving?.ended) {
          toast(`Removed ${email}`, { id: "signed-out" })
        } else if (!now) {
          toast("You're signed out", { id: "signed-out", description: "Projects on this computer stay open." })
        } else if (here) {
          toast(`Signed out of ${email}`, {
            id: "signed-out",
            description: `You're in ${workspaceOf(now)} as ${now.email} now.`
          })
        } else {
          toast(`Signed out of ${email}`, { id: "signed-out" })
        }
      },
      (cause: unknown) => console.error("Signing out failed", cause)
    )
  },
  /** Switches to another account signed in, at once: each keeps its own session. */
  use: (email: string) =>
    void window.canvasHost.account.use(email).then(() => {
      const now = view.state.account

      if (now?.email !== email) {
        return
      }

      toast(`Switched to ${email}`, { id: "account-switched", description: `You're in ${workspaceOf(now)} now.` })
    }, failed("Parity couldn't switch accounts")),
  explainUntilQuit: (open: boolean) => update({ untilQuit: open }),
  /**
   * Moves the account you're in to another of the person's organizations. Main refreshes, and the window follows its
   * state; it settles either way, once main has.
   */
  switchOrganization: (organizationId: string): Promise<void> =>
    window.canvasHost.account.switchOrganization(organizationId).catch(failed("Parity couldn't switch organizations"))
}
