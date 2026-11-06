import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { type AccountState, accountState, type SignInRequest, signedOut } from "../../shared/account.ts"
import { openProjectFolder } from "../chrome/commands.ts"
import { workspace } from "../workspace.ts"

/**
 * Who's signed in, as main says, and where sign-in shows in the window: the whole window on first launch, a dialog
 * over Home after that, or nowhere (PAR-612). Main holds the tokens and does the signing in; this only shows it.
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
  for (const listener of listeners) listener()
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
export function receiveAccount(raw: unknown): void {
  const parsed = accountState.safeParse(raw)
  if (!parsed.success) {
    console.error("Parity couldn't read who's signed in", parsed.error)
    return
  }
  const state = parsed.data
  const before = view
  const signedIn = !before.state.account && !!state.account
  let place = before.place
  if (!before.loaded && !state.account && firstLaunch()) place = "screen"
  if (signedIn) place = undefined
  // WorkOS ended the session: say so over whatever's open, which stays as it is.
  if (state.ended && !before.state.ended) place = "dialog"
  update({ loaded: true, state, place })
  if (signedIn) remember("signed-in")
  if (signedIn && before.loaded && state.account?.untilQuit) untilQuitToast()
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
      if (!received) receiveAccount(raw)
    })
    .catch((error: unknown) => console.error("Parity couldn't ask who's signed in", error))
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

const failed = (title: string) => (error: unknown) => {
  console.error(title, error)
  toast.error(title, { description: "Try again in a moment." })
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
    void openProjectFolder()
  },
  /** A project opened another way while the sign-in screen showed, as from the File menu: that's going on without. */
  leaveScreen: () => {
    if (view.place !== "screen") return
    remember("skipped")
    update({ place: undefined })
    void window.canvasHost.account.cancel()
  },
  signOut: () =>
    void window.canvasHost.account.signOut().then(
      () => toast("You're signed out", { id: "signed-out", description: "Projects on this computer stay open." }),
      (error: unknown) => console.error("Signing out failed", error)
    ),
  explainUntilQuit: (open: boolean) => update({ untilQuit: open }),
  /** Moves the session to another of the person's organizations. Main refreshes, and the window follows its state. */
  switchOrganization: (organizationId: string) =>
    void window.canvasHost.account
      .switchOrganization(organizationId)
      .catch(failed("Parity couldn't switch organizations"))
}
