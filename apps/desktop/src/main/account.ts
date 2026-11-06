import {
  type AuthenticateResult,
  authenticate,
  codeRequest,
  type Fetch,
  type PendingSignIn,
  readCallback,
  refreshDelay,
  refreshRequest,
  retryDelay,
  type Session,
  startSignIn
} from "@parity-app/account"
import type {
  AccountPerson,
  AccountState,
  SignInAttempt,
  SignInProblem,
  SignInProvider,
  SignInRequest
} from "../shared/account.ts"
import type { HandBack } from "../shared/hand-back-page.ts"
import type { SessionStore } from "./session-store.ts"

/**
 * Parity's client ID in WorkOS's Staging environment, which every build uses until Production has one (PAR-611). Client
 * IDs are public; the API key never ships in the app.
 */
export const workosClientId = "client_01M6Q30XB58AF2CEHTE79ACMWS"

/** Where WorkOS hands an installed app back, through the `parity://` scheme its installer registers. */
export const schemeRedirect = "parity://auth/callback"

/** Where the browser hands back to for one sign-in, and how to stop listening there. */
export interface Redirect {
  uri: string
  close(): void
}

export interface AccountOptions {
  clientId: string
  fetch: Fetch
  /** A place for the browser to hand back to: the scheme, or a fresh loopback listener in a `pnpm dev` copy. */
  redirect(): Promise<Redirect>
  openBrowser(url: string): Promise<void>
  store: SessionStore
  /** Tells the window what changed. */
  changed(state: AccountState): void
  /** Brings the window forward once the browser hands back. */
  focus(): void
  now(): number
  /** Runs `run` after `ms`, returning a way to cancel it. */
  later(run: () => void, ms: number): () => void
}

export interface Account {
  state(): AccountState
  /** Signs back in with the session kept from the last launch, if there is one, and refreshes it. */
  restore(): Promise<void>
  /** Opens the browser at WorkOS for a provider, or at AuthKit for a work email, and waits for it to hand back. */
  signIn(request: SignInRequest): Promise<void>
  /** Opens the page of the sign-in that's waiting again. */
  reopen(): Promise<void>
  /** Stops waiting, and puts away what went wrong or the session that ended. */
  cancel(): void
  /** Forgets both tokens. */
  signOut(): void
  /** Whether a link the browser handed back is for the sign-in this copy is waiting for. */
  owns(link: string): boolean
  /**
   * A link the browser handed back. `not-mine` when it's no sign-in this copy is waiting for, so it can be passed on;
   * otherwise whether it signed the person in.
   */
  takeLink(link: string): Promise<HandBack | "not-mine">
}

/** A sign-in waiting for the browser. */
interface Waiting {
  pending: PendingSignIn
  provider: SignInProvider
  email?: string
  url: string
  redirect: Redirect
}

/** The session main holds: the tokens, and who they sign in. */
interface Live {
  refreshToken: string
  person: AccountPerson
  provider: SignInProvider
  /** Whether it's kept between launches, so other copies of Parity share it through the store. */
  kept: boolean
  /** Refreshes in a row that didn't get an answer, or lost a race with another copy. */
  failures: number
}

/**
 * Signing in, as the main process does it (PAR-612): opening the browser, reading what it hands back, trading the code,
 * keeping the refresh token and refreshing before the access token expires. What it talks to is passed in, so it runs
 * in tests without Electron or the network. The window only ever sees `state()`.
 */
export function createAccount(options: AccountOptions): Account {
  let state: AccountState = { account: null, attempt: null, ended: null }
  let waiting: Waiting | undefined
  let live: Live | undefined
  let cancelRefresh: (() => void) | undefined

  const emit = (next: Partial<AccountState>) => {
    state = { ...state, ...next }
    options.changed(state)
  }

  const stopWaiting = () => {
    waiting?.redirect.close()
    waiting = undefined
  }

  const schedule = (ms: number) => {
    cancelRefresh?.()
    cancelRefresh = options.later(() => void refresh(), ms)
  }

  const forget = () => {
    cancelRefresh?.()
    cancelRefresh = undefined
    live = undefined
  }

  const keep = async (current: Live): Promise<boolean> => {
    try {
      return await options.store.save({
        refreshToken: current.refreshToken,
        person: current.person,
        provider: current.provider
      })
    } catch (error) {
      console.error("Parity couldn't keep the session", error)
      return false
    }
  }

  const signedIn = async (session: Session, provider: SignInProvider) => {
    const current: Live = {
      refreshToken: session.refreshToken,
      person: personOf(session),
      provider,
      kept: false,
      failures: 0
    }
    live = current
    schedule(refreshDelay(session.token, options.now()))
    current.kept = await keep(current)
    if (live !== current) return
    emit({ account: { ...current.person, untilQuit: !current.kept }, attempt: null, ended: null })
  }

  const ended = (current: Live) => {
    forget()
    options.store.clear()
    emit({ account: null, ended: { person: current.person, provider: current.provider } })
  }

  async function refresh(): Promise<void> {
    const current = live
    if (!current) return
    if (current.kept) {
      // Another copy of Parity shares the kept session, and each refresh replaces the token: use the newest.
      const stored = await options.store.read()
      if (live !== current) return
      if (!stored) {
        // Signed out in another copy.
        forget()
        emit({ account: null })
        return
      }
      current.refreshToken = stored.refreshToken
    }
    const used = current.refreshToken
    const result = await authenticate(options.fetch, refreshRequest({ clientId: options.clientId, refreshToken: used }))
    if (live !== current) return
    if (result.kind === "session") {
      current.refreshToken = result.session.refreshToken
      current.failures = 0
      const person = personOf(result.session)
      const changed = JSON.stringify(person) !== JSON.stringify(current.person)
      current.person = person
      schedule(refreshDelay(result.session.token, options.now()))
      if (current.kept) current.kept = await keep(current)
      if (changed && live === current) emit({ account: { ...person, untilQuit: !current.kept } })
      return
    }
    if (result.kind === "unavailable") {
      current.failures++
      schedule(retryDelay(current.failures))
      return
    }
    // Refused because another copy refreshed with the same token first: its token is the one to use.
    const newer = current.kept && (await options.store.read())?.refreshToken !== used
    if (live !== current) return
    if (newer && current.failures++ < 3) {
      schedule(0)
      return
    }
    ended(current)
  }

  const problem = (
    provider: SignInProvider,
    said: Omit<Extract<SignInAttempt, { at: "problem" }>, "at" | "provider">
  ) => emit({ attempt: { at: "problem", provider, ...said } })

  return {
    state: () => state,

    async restore() {
      const stored = await options.store.read()
      if (!stored || live) return
      live = { ...stored, kept: true, failures: 0 }
      emit({ account: { ...stored.person, untilQuit: false } })
      await refresh()
    },

    async signIn({ provider, email }) {
      stopWaiting()
      const redirect = await options.redirect()
      const { url, pending } = await startSignIn({
        clientId: options.clientId,
        redirectUri: redirect.uri,
        provider,
        ...(email !== undefined && { loginHint: email })
      })
      waiting = { pending, provider, url, redirect, ...(email !== undefined && { email }) }
      emit({ attempt: { at: "waiting", provider, url, ...(email !== undefined && { email }) }, ended: null })
      await options.openBrowser(url).catch((error: unknown) => console.error("The browser didn't open", error))
    },

    async reopen() {
      if (waiting) await options.openBrowser(waiting.url)
    },

    cancel() {
      stopWaiting()
      emit({ attempt: null, ended: null })
    },

    signOut() {
      stopWaiting()
      forget()
      options.store.clear()
      emit({ account: null, attempt: null, ended: null })
    },

    owns: (link) => waiting !== undefined && readCallback(link, waiting.pending).kind !== "refused",

    async takeLink(link) {
      const current = waiting
      if (!current) return "not-mine"
      const read = readCallback(link, current.pending)
      if (read.kind === "refused") return "not-mine"
      // This sign-in is answered, so its listener closes and no other link can answer it.
      stopWaiting()
      options.focus()
      const { provider } = current
      if (read.kind === "declined") {
        problem(provider, { problem: "canceled" })
        return "problem"
      }
      if (read.kind === "failed") {
        problem(provider, { problem: "failed", details: [read.error, read.description].filter(Boolean).join("\n") })
        return "problem"
      }
      const result = await authenticate(
        options.fetch,
        codeRequest({ clientId: options.clientId, code: read.code, verifier: current.pending.verifier })
      )
      // Canceled, or started over, while the code was traded: this one doesn't sign anyone in.
      if (waiting !== undefined || state.attempt?.at !== "waiting" || state.attempt.url !== current.url)
        return "problem"
      if (result.kind === "session") {
        await signedIn(result.session, provider)
        return "signed-in"
      }
      problem(provider, problemOf(result))
      return "problem"
    }
  }
}

/** Who a session signs in, as the window shows them. */
export function personOf(session: Session): AccountPerson {
  const { user, token } = session
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ")
  return {
    email: user.email,
    ...(name && { name }),
    ...(user.pictureUrl && { pictureUrl: user.pictureUrl }),
    ...(session.organizationId !== undefined && { organizationId: session.organizationId }),
    ...(token.role !== undefined && { role: token.role })
  }
}

/** Codes WorkOS answers with when the account's organization requires its single sign-on. */
const singleSignOnCodes = new Set(["sso_required", "organization_authentication_methods_required"])

/**
 * What went wrong trading the code: an organization that requires single sign-on, an account WorkOS turned down (403),
 * or anything else, which is an error. The details are what WorkOS said, to copy for help.
 */
export function problemOf(result: Exclude<AuthenticateResult, { kind: "session" }>): {
  problem: SignInProblem
  email?: string
  details: string
} {
  const said = result.kind === "refused" ? [result.status, result.code].filter(Boolean).join(" ") : result.status
  const details = ["POST /user_management/authenticate", said, result.message].filter(Boolean).join("\n")
  if (result.kind === "unavailable") return { problem: "failed", details }
  const email = result.email === undefined ? {} : { email: result.email }
  if (result.code !== undefined && singleSignOnCodes.has(result.code))
    return { problem: "single-sign-on", ...email, details }
  if (result.status === 403) return { problem: "refused", ...email, details }
  return { problem: "failed", details }
}
