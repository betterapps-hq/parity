import {
  type AccountPerson,
  type AccountState,
  accountState,
  type SignedInAccount,
  type SignInRequest,
  signedOut
} from "../../shared/account.ts"
import { errorMessage, reportError, track } from "../report-error.ts"
import { createStore, useStore } from "../store.ts"
import { notify } from "../toasts.tsx"
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

/**
 * Not a `windowStore`: the window starts waiting for main to say who's signed in, where stories start signed out with its
 * answer in, which the stories' host puts back with `resetAccountView`.
 */
const account = createStore<AccountView>(() => ({
  loaded: false,
  state: signedOut,
  place: undefined,
  untilQuit: false
}))

function update(next: Partial<AccountView>): void {
  account.update((view) => ({ ...view, ...next }))
}

/** Signed out, with nothing showing, as stories start. */
export function resetAccountView(): void {
  update({ loaded: true, state: signedOut, place: undefined, untilQuit: false })
}

/**
 * Whether this copy needs someone signed in before anything else (PAR-1008), which main says of every copy it runs.
 * Storybook's host doesn't, so a story shows the state it's given.
 */
const required = (): boolean => window.canvasHost.signInRequired === true

/**
 * Where the sign-in screens show for a state: over everything while this copy needs someone signed in and nobody is,
 * and otherwise wherever they were.
 */
function placeFor(state: AccountState, place: AccountView["place"]): AccountView["place"] {
  if (required() && !state.account) {
    return "screen"
  }

  return place === "screen" ? undefined : place
}

/** Takes what main says, checked against its schema, since IPC is data from outside. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC: what main sends is checked against its schema here
export function receiveAccount(raw: unknown): void {
  const parsed = accountState.safeParse(raw)

  if (!parsed.success) {
    console.error("Parity couldn't read who's signed in", parsed.error)
    // The issue's path and message, never the answer, which holds emails.
    const [issue] = parsed.error.issues
    track("account.stateFailed", {
      stage: "check",
      message: issue?.message ?? "Invalid",
      pointer: `/${(issue?.path ?? []).map(String).join("/")}`
    })

    return
  }

  const state = parsed.data
  const before = account.get()
  const was = before.state

  // Someone's signed in where nobody was, or a sign-in that was waiting signed in another account or the same again.
  // Choosing an organization finishes without waiting on the browser (PAR-1143), so that sign-in is done once the
  // question goes and an account came with it, where canceling leaves the accounts as they were.
  const chose =
    was.attempt?.at === "problem" &&
    was.attempt.problem === "choose-organization" &&
    !state.attempt &&
    (state.accounts.length !== was.accounts.length ||
      state.account?.email !== was.account?.email ||
      state.account?.organizationId !== was.account?.organizationId)

  const signedIn = !!state.account && (!was.account || (was.attempt?.at === "waiting" && !state.attempt) || chose)
  let place = before.place

  if (signedIn) {
    place = undefined
  }

  // WorkOS ended the session of the account you're in: say so over whatever's open, which stays as it is.
  if (state.ended && !was.ended) {
    place = "dialog"
  }

  update({ loaded: true, state, place: placeFor(state, place) })

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

  if (had && !had.ended) {
    notify.info("Nothing to add", { id: "account-joined", description: `${email} is already signed in.` })

    return
  }

  notify.done(had ? "Signed in again" : "Added an account", {
    id: "account-joined",
    description: `You're signed in as ${email}.`
  })
}

function untilQuitToast(): void {
  notify.info("Signed in until you quit", {
    id: "until-quit",
    description: "This system has no keyring to keep you signed in.",
    action: { label: "Details", run: () => update({ untilQuit: true }) },
    timeout: 12_000
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
    .catch((cause: unknown) => {
      console.error("Parity couldn't ask who's signed in", cause)
      track("account.stateFailed", { stage: "ask", message: errorMessage(cause) })
    })
}

/** Who's signed in now, if anyone. */
export function signedInPerson(): AccountPerson | undefined {
  return account.get().state.account ?? undefined
}

/** The signed-in person's first name, or nothing when no one is signed in or their account has no name. */
export function firstName(): string | undefined {
  return account.get().state.account?.name?.trim().split(/\s+/)[0] || undefined
}

export function useAccount(): AccountView {
  return useStore(account)
}

/**
 * Says an account step failed and where things stand, and offers to try it again. Without a description, it gives the
 * failure's reason.
 */
const failed = (title: string, description: () => string | undefined, retry: () => void) => (cause: unknown) => {
  console.error(title, cause)
  reportError(cause, { operation: "account", title, description: description(), retry })
}

/** Where the account you're in is now, as a failure says nothing changed. */
function stillIn(): string | undefined {
  const now = account.get().state.account

  return now ? `You're still in ${workspaceOf(now)} as ${now.email}.` : undefined
}

/** What the sign-in screens, the account menu and Home do. */
export const accountActions = {
  /** Sign in from the title bar or Home: the sign-in screen in a dialog. */
  open: () => update({ place: "dialog" }),
  signIn: (request: SignInRequest) =>
    void window.canvasHost.account.signIn(request).catch(
      failed(
        "Couldn't start signing in",
        () => "You're still signed out of Parity.",
        () => accountActions.signIn(request)
      )
    ),
  reopen: () =>
    void window.canvasHost.account.reopen().catch(
      failed(
        "Couldn't open your browser",
        () => "Sign-in is still waiting for you there.",
        () => accountActions.reopen()
      )
    ),
  /** Back to the ways in: the attempt, or the session that ended, is put away. */
  back: () => void window.canvasHost.account.cancel(),
  /** Closes the dialog, stopping a sign-in that's waiting. */
  close: () => {
    update({ place: placeFor(account.get().state, undefined) })
    void window.canvasHost.account.cancel()
  },
  /** Signing in again as an account whose session ended: straight to the browser, the way it signed in before. */
  signInAgain: (account: SignedInAccount) => {
    update({ place: "dialog" })
    accountActions.signIn({ provider: account.provider, email: account.email })
  },
  /** Signs out of any account, or forgets one whose session ended. Leaving the one you're in moves to another. */
  signOut: (email: string) => {
    const { state } = account.get()
    const leaving = state.accounts.find((each) => each.email === email)
    const here = state.account?.email === email
    void window.canvasHost.account.signOut(email).then(
      () => {
        const now = account.get().state.account

        if (leaving?.ended) {
          notify.done("Removed an account", { id: "signed-out", description: `Parity forgot ${email}.` })
        } else if (!now) {
          notify.done("You're signed out", { id: "signed-out", description: "Projects on this computer stay open." })
        } else if (here) {
          notify.done("Signed out of an account", {
            id: "signed-out",
            description: `You're in ${workspaceOf(now)} as ${now.email} now.`
          })
        } else {
          notify.done("Signed out of an account", { id: "signed-out", description: `${email} is signed out.` })
        }
      },
      failed(
        "Couldn't sign out",
        () => `${email} is still signed in.`,
        () => accountActions.signOut(email)
      )
    )
  },
  /** Switches to another account signed in, at once: each keeps its own session. */
  use: (email: string) =>
    void window.canvasHost.account.use(email).then(
      () => {
        const now = account.get().state.account

        if (now?.email !== email) {
          return
        }

        notify.done("Switched accounts", {
          id: "account-switched",
          description: `You're in ${workspaceOf(now)} as ${email} now.`
        })
      },
      failed("Couldn't switch accounts", stillIn, () => accountActions.use(email))
    ),
  explainUntilQuit: (open: boolean) => update({ untilQuit: open }),
  /**
   * Moves the account you're in to another of the person's organizations. Main refreshes, and the window follows its
   * state; it settles either way, once main has.
   */
  switchOrganization: (organizationId: string): Promise<void> =>
    window.canvasHost.account.switchOrganization(organizationId).catch(
      failed(
        "Couldn't switch organizations",
        () => {
          const now = account.get().state.account
          const name = now && currentOrganization(now)?.name

          return name ? `Nothing changed; you're still in ${name}.` : "You're still in the same organization."
        },
        () => void accountActions.switchOrganization(organizationId)
      )
    )
}
