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
import type { EventAttributes, registeredEvents, Telemetry } from "@parity-app/telemetry"
import type {
  AccountPerson,
  AccountState,
  Organization,
  SignedInAccount,
  SignInAttempt,
  SignInProblem,
  SignInProvider,
  SignInRequest
} from "../shared/account.ts"
import type { HandBack } from "../shared/hand-back-page.ts"
import {
  type SessionStore,
  type StoredAccount,
  type StoredAccounts,
  storeProblem,
  thrownError,
  withAccount,
  withoutAccount
} from "./session-store.ts"

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
  /** Records the `account.*` events, which never carry a token or an email (PAR-807). */
  telemetry: Pick<Telemetry<typeof registeredEvents>, "track">
}

export interface Account {
  state(): AccountState
  /** Signs back in to the accounts kept from the last launch, in the one Parity was last in, and refreshes them. */
  restore(): Promise<void>
  /**
   * Opens the browser at WorkOS for a provider, or at AuthKit for a work email, and waits for it to hand back. The
   * account it signs in joins the others, or takes the place of the same account's session, and you're in it.
   */
  signIn(request: SignInRequest): Promise<void>
  /** Opens the page of the sign-in that's waiting again. */
  reopen(): Promise<void>
  /** Stops waiting, and puts away what went wrong or the session that ended. */
  cancel(): void
  /**
   * Signs out of one account, by its email, forgetting its tokens, or forgets one whose session ended. Leaving the
   * account you're in moves you to the one you used last; the others stay as they are.
   */
  signOut(email: string): Promise<void>
  /** Switches to another account, at once, since each keeps its own session. Throws for one that isn't signed in. */
  use(email: string): Promise<void>
  /**
   * Moves the account you're in to another of the person's organizations with a refresh in the background. Throws when
   * WorkOS doesn't answer or turns it down, and the session stays where it was.
   */
  switchOrganization(organizationId: string): Promise<void>
  /** Whether a link the browser handed back is for the sign-in this copy is waiting for. */
  owns(link: string): boolean
  /**
   * A link the browser handed back. `not-mine` when it's no sign-in this copy is waiting for, so it can be passed on;
   * otherwise whether it signed the person in.
   */
  takeLink(link: string): Promise<HandBack | "not-mine">
  /**
   * The access token of the account you're in, for Parity's service: refreshed first when it has run out or `renew`
   * asks, as after the service turned one down. None when you're signed out or WorkOS can't be reached. It never
   * leaves main.
   */
  accessToken(renew?: boolean): Promise<string | undefined>
}

/** A sign-in waiting for the browser. */
interface Waiting {
  pending: PendingSignIn
  provider: SignInProvider
  email?: string
  url: string
  redirect: Redirect
}

/** An account main holds: its tokens, and who they sign in. */
interface Live {
  /** None once WorkOS ended its session. */
  refreshToken: string | undefined
  /** Its access token and when it runs out, in main's memory only. None until its first refresh after a launch. */
  access?: { token: string; expiresAt: number }
  person: AccountPerson
  provider: SignInProvider
  /** Whether it's kept between launches, so other copies of Parity share it through the store. */
  kept: boolean
  /** Refreshes in a row that didn't get an answer, or lost a race with another copy. */
  failures: number
  /** Stops its next refresh. */
  stop?: () => void
}

/**
 * Signing in, as the main process does it (PAR-612): opening the browser, reading what it hands back, trading the code,
 * keeping each refresh token and refreshing before the access token expires. Someone can be signed in to several
 * accounts, such as their own and their company's, each with its own session, and switch between them at once
 * (PAR-669). What it talks to is passed in, so it runs in tests without Electron or the network. The window only ever
 * sees `state()`.
 */
export function createAccount(options: AccountOptions): Account {
  let attempt: SignInAttempt | null = null
  /** The session of the account you were in, which WorkOS ended, until you sign in again or put it away. */
  let endedHere: AccountState["ended"] = null
  let waiting: Waiting | undefined
  /** Every account, in the order they were added. */
  let lives: Live[] = []
  /** The account you're in. Never one whose session ended. */
  let current: Live | undefined
  /** Accounts' emails, the one used last first, to choose where to go when you leave the one you're in. */
  let used: string[] = []
  /**
   * The organizations WorkOS named when it asked which one, kept with the session that follows so the person can switch
   * between them. WorkOS names them only then, until Parity's service can list them (PAR-616).
   */
  let named: Organization[] | undefined

  /** Who a session signs in, with the organizations Parity knows they're in. */
  const personWith = (session: Session, organizations: Organization[] | undefined): AccountPerson => ({
    ...personOf(session),
    ...(organizations?.length && { organizations })
  })

  const accountOf = (live: Live): SignedInAccount => ({
    ...live.person,
    provider: live.provider,
    ...(live.refreshToken === undefined && { ended: true as const })
  })

  const state = (): AccountState => ({
    account: current ? { ...current.person, untilQuit: !current.kept } : null,
    accounts: lives.map(accountOf),
    attempt,
    ended: endedHere
  })

  const emit = () => options.changed(state())

  const find = (email: string) => lives.find((live) => live.person.email === email)

  /** Whether `live` is still listed, with a session WorkOS hasn't ended. */
  const going = (live: Live) => lives.includes(live) && live.refreshToken !== undefined

  const stopWaiting = () => {
    waiting?.redirect.close()
    waiting = undefined
  }

  const schedule = (live: Live, ms: number) => {
    live.stop?.()
    live.stop = options.later(() => void refresh(live), ms)
  }

  const stop = (live: Live) => {
    live.stop?.()
    delete live.stop
  }

  const stored = (live: Live): StoredAccount => ({
    ...(live.refreshToken !== undefined && { refreshToken: live.refreshToken }),
    person: live.person,
    provider: live.provider
  })

  /** Changes what's kept, and says whether it could. Where it can't, accounts last until Parity quits. */
  const update = async (change: (kept: StoredAccounts) => StoredAccounts): Promise<boolean> => {
    try {
      return await options.store.update(change)
    } catch (error) {
      console.error("Parity couldn't keep the accounts", error)
      options.telemetry.track("account.storeFailed", storeProblem("write", thrownError.parse(error)))

      return false
    }
  }

  /** Keeps `live` as it is now, in place of what's kept for `was`, its email before a refresh. */
  const keep = (live: Live, was = live.person.email) =>
    update((kept) => withAccount(was === live.person.email ? kept : withoutAccount(kept, was), stored(live)))

  /** Remembers which account you're in, to start in it next launch. */
  const keepCurrent = (kept: StoredAccounts): StoredAccounts => {
    const { current: _was, ...rest } = kept

    return current ? { ...rest, current: current.person.email } : rest
  }

  const enter = (live: Live | undefined) => {
    current = live

    if (live) {
      used = [live.person.email, ...used.filter((email) => email !== live.person.email)]
    }
  }

  /** Where to go when you leave `leaving`: the account you used last whose session is still going, or none. */
  const after = (leaving: Live) => {
    const rank = (live: Live) => {
      const at = used.indexOf(live.person.email)

      return at < 0 ? used.length : at
    }

    return lives.filter((live) => live !== leaving && going(live)).toSorted((a, b) => rank(a) - rank(b))[0]
  }

  /** Takes `live` off the list; if you were in it, you're in the account you used last now, or signed out. */
  const drop = (live: Live) => {
    stop(live)
    lives = lives.filter((each) => each !== live)
    used = used.filter((email) => email !== live.person.email)

    if (current === live) {
      enter(after(live))
    }
  }

  const signedIn = async (session: Session, provider: SignInProvider) => {
    const person = personWith(session, named)

    const live: Live = {
      refreshToken: session.refreshToken,
      access: accessOf(session),
      person,
      provider,
      kept: false,
      failures: 0
    }

    live.kept = await update((kept) => ({ ...withAccount(kept, stored(live)), current: person.email }))
    // The same account signed in again, as after its session ended, takes the old session's place in the list.
    const before = find(person.email)

    if (before) {
      stop(before)
    }

    lives = before ? lives.map((each) => (each === before ? live : each)) : [...lives, live]
    enter(live)
    schedule(live, refreshDelay(session.token, options.now()))
    attempt = null
    endedHere = null
    emit()
    options.telemetry.track("account.signedIn", { provider, again: !!before, kept: live.kept, accounts: lives.length })
  }

  /**
   * WorkOS ended `live`'s session. It stays listed, to sign in to again. If you were in it, you're in the account you
   * used last now, and Session ended says so over whatever's open.
   */
  const ended = (live: Live, reason: "refused" | "elsewhere") => {
    options.telemetry.track("account.sessionEnded", { reason, current: current === live })
    stop(live)
    live.refreshToken = undefined
    delete live.access
    live.failures = 0

    if (current === live) {
      enter(after(live))
      endedHere = { person: live.person, provider: live.provider }
    }

    void update((kept) => keepCurrent(withAccount(kept, stored(live))))
    emit()
  }

  /** Takes a refreshed session: the new token kept, the next refresh scheduled, and the window told who it is now. */
  const refreshed = async (live: Live, session: Session) => {
    const was = live.person.email
    live.refreshToken = session.refreshToken
    live.access = accessOf(session)
    live.failures = 0
    const person = personWith(session, live.person.organizations)
    const changed = JSON.stringify(person) !== JSON.stringify(live.person)
    live.person = person
    schedule(live, refreshDelay(session.token, options.now()))

    if (live.kept) {
      live.kept = await keep(live, was)
    }

    if (changed && lives.includes(live)) {
      emit()
    }
  }

  /** The newest refresh token, which another copy sharing the kept accounts may have replaced; none once it's gone. */
  const newestToken = async (live: Live): Promise<string | undefined> => {
    if (!live.kept) {
      return live.refreshToken
    }

    const kept = (await options.store.read())?.accounts.find((each) => each.person.email === live.person.email)

    if (kept?.refreshToken) {
      live.refreshToken = kept.refreshToken
    }

    return kept?.refreshToken
  }

  /** Refreshes under way, so two askers share one: a refresh token works once, and a second use ends the session. */
  const refreshing = new Map<Live, Promise<void>>()

  function refresh(live: Live): Promise<void> {
    let under = refreshing.get(live)

    if (!under) {
      under = refreshNow(live).finally(() => refreshing.delete(live))
      refreshing.set(live, under)
    }

    return under
  }

  async function refreshNow(live: Live): Promise<void> {
    if (!going(live)) {
      return
    }

    if (live.kept) {
      // Other copies of Parity share the kept accounts, and each refresh replaces the token: use the newest.
      const kept = (await options.store.read())?.accounts.find((each) => each.person.email === live.person.email)

      if (!going(live)) {
        return
      }

      if (!kept) {
        // Signed out in another copy.
        const here = current === live
        drop(live)
        emit()
        options.telemetry.track("account.signedOut", {
          reason: "elsewhere",
          current: here,
          ended: false,
          accounts: lives.length
        })

        return
      }

      if (kept.refreshToken === undefined) {
        // Its session ended in another copy.
        ended(live, "elsewhere")

        return
      }

      live.refreshToken = kept.refreshToken
    }

    const token = live.refreshToken

    if (token === undefined) {
      return
    }

    const result = await authenticate(
      options.fetch,
      refreshRequest({ clientId: options.clientId, refreshToken: token })
    )

    if (!going(live)) {
      return
    }

    if (result.kind === "session") {
      options.telemetry.track("account.refreshed", { organization: false, retries: live.failures })
      await refreshed(live, result.session)

      return
    }

    if (result.kind === "unavailable") {
      live.failures++
      options.telemetry.track("account.refreshFailed", refreshFailure(result, live.failures, false))
      schedule(live, retryDelay(live.failures))

      return
    }

    // Refused because another copy refreshed with the same token first: its token is the one to use.
    const newer =
      live.kept &&
      (await options.store.read())?.accounts.find((each) => each.person.email === live.person.email)?.refreshToken !==
        token

    if (!going(live)) {
      return
    }

    if (newer && live.failures < 3) {
      live.failures++
      options.telemetry.track("account.refreshFailed", {
        ...refreshFailure(result, live.failures, false),
        reason: "superseded"
      })
      schedule(live, 0)

      return
    }

    options.telemetry.track("account.refreshFailed", refreshFailure(result, live.failures + 1, false))
    ended(live, "refused")
  }

  const problem = (
    provider: SignInProvider,
    said: Omit<Extract<SignInAttempt, { at: "problem" }>, "at" | "provider">,
    answer: WorkosAnswer = {}
  ) => {
    attempt = { at: "problem", provider, ...said }
    emit()
    options.telemetry.track("account.signInProblem", { provider, problem: said.problem, ...answer })
  }

  return {
    state,

    async accessToken(renew = false) {
      const live = current

      if (!live) {
        return undefined
      }

      // Half a minute spare, so a token doesn't run out on its way to the service.
      const fresh = () => live.access !== undefined && live.access.expiresAt - options.now() > 30_000

      if (renew || !fresh()) {
        await refresh(live)
      }

      return current === live && fresh() ? live.access?.token : undefined
    },

    async restore() {
      const kept = await options.store.read()

      if (!kept || lives.length > 0) {
        return
      }

      lives = kept.accounts.map(({ refreshToken, person, provider }) => ({
        refreshToken,
        person,
        provider,
        kept: true,
        failures: 0
      }))
      used = kept.current ? [kept.current] : []
      enter(lives.find((live) => live.person.email === kept.current && going(live)) ?? lives.find(going))
      emit()
      await Promise.all(lives.filter(going).map(refresh))
    },

    async signIn({ provider, email, organizationId }) {
      stopWaiting()

      // The organizations WorkOS named are for signing in to one of them, not to another sign-in.
      if (organizationId === undefined) {
        named = undefined
      }

      const redirect = await options.redirect()
      // Adding another account: Google, GitHub and Microsoft ask which one, even when the browser is signed in to one
      // of yours already. Signing in again as someone names them instead.
      const another = email === undefined && lives.length > 0 && provider !== "authkit"

      const { url, pending } = await startSignIn({
        clientId: options.clientId,
        redirectUri: redirect.uri,
        provider,
        ...(email !== undefined && { loginHint: email }),
        ...(organizationId !== undefined && { organizationId }),
        ...(another && { providerQueryParams: { prompt: "select_account" } })
      })

      waiting = { pending, provider, url, redirect, ...(email !== undefined && { email }) }
      attempt = { at: "waiting", provider, url, ...(email !== undefined && { email }) }
      endedHere = null
      emit()
      await options.openBrowser(url).catch((cause: unknown) => {
        console.error("The browser didn't open", cause)
        options.telemetry.track("account.signInProblem", { provider, problem: "browser" })
      })
    },

    async reopen() {
      if (waiting) {
        await options.openBrowser(waiting.url)
      }
    },

    cancel() {
      stopWaiting()
      attempt = null
      endedHere = null
      emit()
    },

    async signOut(email) {
      const live = find(email)

      if (!live) {
        return
      }

      const here = current === live
      const wasEnded = live.refreshToken === undefined
      drop(live)

      if (here) {
        stopWaiting()
        named = undefined
        attempt = null
      }

      if (here || endedHere?.person.email === email) {
        endedHere = null
      }

      emit()
      options.telemetry.track("account.signedOut", {
        reason: "person",
        current: here,
        ended: wasEnded,
        accounts: lives.length
      })
      await update((kept) => keepCurrent(withoutAccount(kept, email)))
    },

    async use(email) {
      const live = find(email)

      if (!live || !going(live)) {
        throw new Error(`Parity isn't signed in as ${email}`)
      }

      if (current === live) {
        return
      }

      enter(live)
      emit()
      await update(keepCurrent)
    },

    async switchOrganization(organizationId) {
      const live = current

      if (!live) {
        throw new Error("Nobody is signed in")
      }

      if (live.person.organizationId === organizationId) {
        return
      }

      const token = await newestToken(live)

      if (!going(live) || token === undefined) {
        throw new Error("Signed out while switching")
      }

      const result = await authenticate(
        options.fetch,
        refreshRequest({ clientId: options.clientId, refreshToken: token, organizationId })
      )

      if (!going(live)) {
        throw new Error("Signed out while switching")
      }

      if (result.kind !== "session") {
        options.telemetry.track("account.refreshFailed", refreshFailure(result, 1, true))
        throw new Error(`WorkOS didn't switch: ${problemOf(result).details}`)
      }

      options.telemetry.track("account.refreshed", { organization: true, retries: 0 })
      await refreshed(live, result.session)
    },

    owns: (link) => waiting !== undefined && readCallback(link, waiting.pending).kind !== "refused",

    async takeLink(link) {
      const answering = waiting

      if (!answering) {
        return "not-mine"
      }

      const read = readCallback(link, answering.pending)

      if (read.kind === "refused") {
        return "not-mine"
      }

      // This sign-in is answered, so its listener closes and no other link can answer it.
      stopWaiting()
      options.focus()
      const { provider } = answering

      if (read.kind === "declined") {
        problem(provider, { problem: "canceled" })

        return "problem"
      }

      if (read.kind === "failed") {
        problem(
          provider,
          { problem: "failed", details: [read.error, read.description].filter(Boolean).join("\n") },
          { code: read.error }
        )

        return "problem"
      }

      const result = await authenticate(
        options.fetch,
        codeRequest({ clientId: options.clientId, code: read.code, verifier: answering.pending.verifier })
      )

      // Canceled, or started over, while the code was traded: this one doesn't sign anyone in.
      if (waiting !== undefined || attempt?.at !== "waiting" || attempt.url !== answering.url) {
        return "problem"
      }

      if (result.kind === "session") {
        await signedIn(result.session, provider)

        return "signed-in"
      }

      const said = problemOf(result)

      if (said.organizations) {
        named = said.organizations
      }

      problem(provider, said, workosAnswer(result))

      // Choosing an organization or using single sign-on isn't a failure, only one more step in Parity.
      return said.problem === "choose-organization" || said.problem === "single-sign-on" ? "continue" : "problem"
    }
  }
}

/** A session's access token and when it runs out. */
function accessOf(session: Session): NonNullable<Live["access"]> {
  return { token: session.accessToken, expiresAt: session.token.expiresAt }
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

/** What WorkOS answered, for telemetry: its status and code, never its message, which can name the account. */
interface WorkosAnswer {
  status?: number
  code?: string
}

function workosAnswer(result: Exclude<AuthenticateResult, { kind: "session" }>): WorkosAnswer {
  return {
    ...(result.status !== undefined && { status: result.status }),
    ...(result.kind === "refused" && result.code !== undefined && { code: result.code })
  }
}

/** A refresh that failed, as `account.refreshFailed` records it. */
function refreshFailure(
  result: Exclude<AuthenticateResult, { kind: "session" }>,
  failures: number,
  organization: boolean
): EventAttributes<typeof registeredEvents, "account.refreshFailed"> {
  return { reason: result.kind, organization, failures, ...workosAnswer(result) }
}

/** Codes WorkOS answers with when the account's organization requires its single sign-on. */
const singleSignOnCodes = new Set(["sso_required", "organization_authentication_methods_required"])

/** A sign-in that ended without a session: why, the account WorkOS named, and what it said. */
export interface SignInFailure {
  problem: SignInProblem
  email?: string
  details: string
  organizations?: { id: string; name: string }[]
}

/**
 * What went wrong trading the code: someone in several organizations who has to choose one, an organization that
 * requires single sign-on, an account WorkOS turned down (403), or anything else, which is an error. The details are
 * what WorkOS said, to copy for help.
 */
export function problemOf(result: Exclude<AuthenticateResult, { kind: "session" }>): SignInFailure {
  const said = result.kind === "refused" ? [result.status, result.code].filter(Boolean).join(" ") : result.status
  const details = ["POST /user_management/authenticate", said, result.message].filter(Boolean).join("\n")

  if (result.kind === "unavailable") {
    return { problem: "failed", details }
  }

  const email = result.email === undefined ? {} : { email: result.email }

  // Finishing it with WorkOS's pending token needs the client secret, so the person chooses in Parity and signs in
  // again with that organization named.
  if (result.code === "organization_selection_required" && result.organizations?.length) {
    return { problem: "choose-organization", ...email, details, organizations: result.organizations }
  }

  if (result.code !== undefined && singleSignOnCodes.has(result.code)) {
    return { problem: "single-sign-on", ...email, details }
  }

  if (result.status === 403) {
    return { problem: "refused", ...email, details }
  }

  return { problem: "failed", details }
}
