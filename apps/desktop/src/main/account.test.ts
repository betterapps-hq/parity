import type { Fetch } from "@parity-app/account"
import type { JsonValue } from "@parity-app/core"
import { isText } from "@parity-app/core/values/evaluate"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { describe, expect, it } from "vite-plus/test"
import type { AccountState, SignInProvider } from "../shared/account.ts"
import { type AccountOptions, createAccount } from "./account.ts"
import type { SessionStore, StoredAccounts } from "./session-store.ts"

const jwt = (claims: Record<string, JsonValue>) =>
  ["header", JSON.stringify(claims), "signature"].map((part) => Buffer.from(part).toString("base64url")).join(".")

/**
 * WorkOS's answer to a code or a refresh, handing back `refresh`, with a token that lasts five minutes from `now`, for
 * Ada's own account or another of hers.
 */
function session(refresh: string, now: number, claims: Record<string, JsonValue> = {}, email = "ada@example.com") {
  return {
    user: { id: `user_${email}`, email, email_verified: true, first_name: "Ada", last_name: "Lovelace" },
    organization_id: "org_1",
    access_token: jwt({
      sub: "user_1",
      sid: "sid_1",
      org_id: "org_1",
      role: "admin",
      iat: now / 1000,
      exp: now / 1000 + 300,
      ...claims
    }),
    refresh_token: refresh
  }
}

/** A store in memory, or one that can't keep anything, as on Linux without a keyring. */
function memoryStore(persistent = true): SessionStore & { kept?: StoredAccounts } {
  const store: SessionStore & { kept?: StoredAccounts } = {
    persistent: async () => persistent,
    read: async () => store.kept,
    async update(change) {
      if (!persistent) {
        return false
      }

      const next = change(store.kept ?? { accounts: [] })

      if (next.accounts.length === 0) {
        delete store.kept
      } else {
        store.kept = next
      }

      return true
    },
    clear() {
      delete store.kept
    }
  }

  return store
}

/** What the store keeps for the account signed in as `email`. */
const keptFor = (store: { kept?: StoredAccounts }, email = "ada@example.com") =>
  store.kept?.accounts.find((each) => each.person.email === email)

/**
 * The account with everything it talks to stood in for: WorkOS answers from a queue, the browser records what it was
 * opened at, and timers run when the test says.
 */
function setUp(options: { store?: ReturnType<typeof memoryStore> } = {}) {
  let now = 1_800_000_000_000
  const answers: { status: number; body: JsonValue }[] = []
  const requests: Record<string, JsonValue>[] = []
  const opened: string[] = []
  const states: AccountState[] = []
  const timers: { run: () => void; at: number }[] = []
  const sink = createTestSink()
  let closed = 0
  let browserOpens = true

  const fetch: Fetch = async (_url, init) => {
    requests.push(JSON.parse(isText(init.body) ? init.body : "{}"))
    const answer = answers.shift() ?? { status: 503, body: {} }

    return new Response(JSON.stringify(answer.body), { status: answer.status })
  }

  const store = options.store ?? memoryStore()

  const account = createAccount({
    clientId: "client_test",
    fetch,
    redirect: async () => ({ uri: "http://127.0.0.1:4100/auth/callback", close: () => closed++ }),
    openBrowser: async (url) => {
      opened.push(url)

      if (!browserOpens) {
        throw new Error("No browser")
      }
    },
    store,
    changed: (state) => states.push(state),
    focus: () => undefined,
    now: () => now,
    later: (run, ms) => {
      const timer = { run, at: now + ms }
      timers.push(timer)

      return () => timers.splice(timers.indexOf(timer), 1)
    },
    telemetry: createTelemetry({
      events: registeredEvents,
      context: { process: "main", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  } satisfies AccountOptions)

  return {
    account,
    store,
    states,
    opened,
    requests,
    tracked: sink.events,
    /** The events recorded with `name`, by their attributes. */
    named: (name: string) => sink.named(name).map((each) => each.attributes),
    browserFails: () => (browserOpens = false),
    closed: () => closed,
    answer: (status: number, body: JsonValue) => answers.push({ status, body }),
    /** Moves the clock to the next timer and runs it. */
    async tick() {
      const timer = timers.sort((a, b) => a.at - b.at).shift()

      if (!timer) {
        throw new Error("Nothing is scheduled")
      }

      now = Math.max(now, timer.at)
      timer.run()

      // The refresh reads the store, asks WorkOS and keeps what it says, each a step of its own.
      for (let step = 0; step < 5; step++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    },
    pending: () => timers.map((timer) => timer.at - now),
    now: () => now,
    /** The link the browser hands back for the sign-in that's waiting, with `query` added. */
    callback(query: Record<string, string>) {
      const state = new URL(opened.at(-1)!).searchParams.get("state")!

      return `http://127.0.0.1:4100/auth/callback?${new URLSearchParams({ state, ...query })}`
    }
  }
}

describe("signing in", () => {
  it("opens WorkOS with the provider, waits, and trades the code for a session", async () => {
    const test = setUp()
    await test.account.signIn({ provider: "GitHubOAuth" })
    const url = new URL(test.opened[0]!)
    expect(url.searchParams.get("provider")).toBe("GitHubOAuth")
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:4100/auth/callback")
    expect(test.account.state().attempt).toEqual({ at: "waiting", provider: "GitHubOAuth", url: test.opened[0] })

    test.answer(200, session("refresh_1", test.now()))
    expect(await test.account.takeLink(test.callback({ code: "code_1" }))).toBe("signed-in")
    expect(test.requests[0]).toMatchObject({
      grant_type: "authorization_code",
      code: "code_1",
      client_id: "client_test"
    })
    expect(test.requests[0]).not.toHaveProperty("client_secret")
    const ada = { email: "ada@example.com", name: "Ada Lovelace", organizationId: "org_1", role: "admin" }
    expect(test.account.state()).toEqual({
      account: { ...ada, untilQuit: false },
      accounts: [{ ...ada, provider: "GitHubOAuth" }],
      attempt: null,
      ended: null
    })
    expect(test.store.kept).toEqual({
      current: "ada@example.com",
      accounts: [{ refreshToken: "refresh_1", person: ada, provider: "GitHubOAuth" }]
    })
    expect(test.closed()).toBe(1)
  })

  it("fills in the work email for AuthKit", async () => {
    const test = setUp()
    await test.account.signIn({ provider: "authkit", email: "ada@example.com" })
    const url = new URL(test.opened[0]!)
    expect(url.searchParams.get("provider")).toBe("authkit")
    expect(url.searchParams.get("login_hint")).toBe("ada@example.com")
  })

  it("leaves a link that isn't its sign-in's for another copy", async () => {
    const test = setUp()
    expect(await test.account.takeLink("parity://auth/callback?code=1&state=x")).toBe("not-mine")
    await test.account.signIn({ provider: "GoogleOAuth" })
    const theirs = "http://127.0.0.1:4100/auth/callback?code=1&state=someone-else"
    expect(test.account.owns(theirs)).toBe(false)
    expect(await test.account.takeLink(theirs)).toBe("not-mine")
    expect(test.account.owns(test.callback({ code: "1" }))).toBe(true)
    expect(test.account.state().attempt?.at).toBe("waiting")
  })

  it("says the browser canceled, and what WorkOS said when it failed", async () => {
    const test = setUp()
    await test.account.signIn({ provider: "GoogleOAuth" })
    expect(await test.account.takeLink(test.callback({ error: "access_denied" }))).toBe("problem")
    expect(test.account.state().attempt).toEqual({ at: "problem", provider: "GoogleOAuth", problem: "canceled" })

    await test.account.signIn({ provider: "GoogleOAuth" })
    test.answer(400, { error: "invalid_grant", error_description: "The code has expired." })
    expect(await test.account.takeLink(test.callback({ code: "old" }))).toBe("problem")
    expect(test.account.state().attempt).toEqual({
      at: "problem",
      provider: "GoogleOAuth",
      problem: "failed",
      details: "POST /user_management/authenticate\n400 invalid_grant\nThe code has expired."
    })
  })

  it("names the account WorkOS turns down, or sends to single sign-on", async () => {
    const test = setUp()
    await test.account.signIn({ provider: "GoogleOAuth" })
    test.answer(403, { code: "sso_required", message: "Use single sign-on.", email: "ada@kestrel.dev" })
    expect(await test.account.takeLink(test.callback({ code: "1" }))).toBe("continue")
    expect(test.account.state().attempt).toMatchObject({ problem: "single-sign-on", email: "ada@kestrel.dev" })

    await test.account.signIn({ provider: "MicrosoftOAuth" })
    test.answer(403, { code: "user_not_allowed", message: "Not allowed.", email: "ada@hey.com" })
    expect(await test.account.takeLink(test.callback({ code: "2" }))).toBe("problem")
    expect(test.account.state().attempt).toMatchObject({ problem: "refused", email: "ada@hey.com" })
  })

  it("offers the organizations WorkOS names, and signs in to the one chosen through AuthKit", async () => {
    const test = setUp()
    await test.account.signIn({ provider: "GoogleOAuth" })

    const organizations = [
      { id: "org_01KESTREL", name: "Kestrel" },
      { id: "org_01ENGINES", name: "Engines" }
    ]

    test.answer(403, {
      code: "organization_selection_required",
      message: "Choose an organization.",
      user: { email: "ada@kestrel.dev" },
      organizations
    })
    // The browser's page says to continue in Parity, not that signing in failed.
    expect(await test.account.takeLink(test.callback({ code: "1" }))).toBe("continue")
    expect(test.account.state().attempt).toMatchObject({
      problem: "choose-organization",
      email: "ada@kestrel.dev",
      organizations
    })

    await test.account.signIn({ provider: "authkit", organizationId: "org_01ENGINES", email: "ada@kestrel.dev" })
    const url = new URL(test.opened.at(-1)!)
    expect(url.searchParams.get("provider")).toBe("authkit")
    expect(url.searchParams.get("organization_id")).toBe("org_01ENGINES")
  })

  it("doesn't sign in when canceled while the code was traded", async () => {
    const test = setUp()
    await test.account.signIn({ provider: "GoogleOAuth" })
    test.answer(200, session("refresh_1", test.now()))
    const taking = test.account.takeLink(test.callback({ code: "1" }))
    test.account.cancel()
    expect(await taking).toBe("problem")
    expect(test.account.state()).toEqual({ account: null, accounts: [], attempt: null, ended: null })
  })

  it("keeps the session only until quit where the system has no keyring", async () => {
    const test = setUp({ store: memoryStore(false) })
    await test.account.signIn({ provider: "GoogleOAuth" })
    test.answer(200, session("refresh_1", test.now()))
    await test.account.takeLink(test.callback({ code: "1" }))
    expect(test.account.state().account?.untilQuit).toBe(true)
    expect(test.store.kept).toBeUndefined()
  })
})

describe("switching organizations", () => {
  const organizations = [
    { id: "org_1", name: "Kestrel" },
    { id: "org_2", name: "Engines" }
  ]

  /** WorkOS's session in `organization`. */
  const sessionIn = (organization: string, refresh: string, now: number) => ({
    ...session(refresh, now, { org_id: organization }),
    organization_id: organization
  })

  /** Signed in to Kestrel after WorkOS asked which organization. */
  async function chose() {
    const test = setUp()
    await test.account.signIn({ provider: "GoogleOAuth" })
    test.answer(403, { code: "organization_selection_required", message: "Choose.", organizations })
    await test.account.takeLink(test.callback({ code: "1" }))
    await test.account.signIn({ provider: "authkit", organizationId: "org_1" })
    test.answer(200, sessionIn("org_1", "refresh_1", test.now()))
    await test.account.takeLink(test.callback({ code: "2" }))

    return test
  }

  it("remembers the organizations WorkOS named, through refreshes and in the kept session", async () => {
    const test = await chose()
    expect(test.account.state().account).toMatchObject({ organizationId: "org_1", organizations })
    expect(keptFor(test.store)?.person.organizations).toEqual(organizations)
    test.answer(200, sessionIn("org_1", "refresh_2", test.now() + 240_000))
    await test.tick()
    expect(test.account.state().account?.organizations).toEqual(organizations)
  })

  it("switches with a refresh naming the organization, in the background", async () => {
    const test = await chose()
    test.answer(200, sessionIn("org_2", "refresh_2", test.now()))
    await test.account.switchOrganization("org_2")
    expect(test.requests.at(-1)).toEqual({
      grant_type: "refresh_token",
      client_id: "client_test",
      refresh_token: "refresh_1",
      organization_id: "org_2"
    })
    expect(test.account.state().account).toMatchObject({ organizationId: "org_2", organizations })
    expect(keptFor(test.store)?.refreshToken).toBe("refresh_2")
    expect(test.opened).toHaveLength(2)
  })

  it("stays where it was when WorkOS won't switch", async () => {
    const test = await chose()
    test.answer(403, { error: "invalid_grant", error_description: "Not a member." })
    await expect(test.account.switchOrganization("org_2")).rejects.toThrow(/Not a member/)
    expect(test.account.state().account?.organizationId).toBe("org_1")
  })

  it("forgets them on signing out, and for a sign-in that doesn't choose", async () => {
    const test = await chose()
    await test.account.signOut("ada@example.com")
    await test.account.signIn({ provider: "GoogleOAuth" })
    test.answer(200, session("refresh_3", test.now()))
    await test.account.takeLink(test.callback({ code: "3" }))
    expect(test.account.state().account?.organizations).toBeUndefined()
  })
})

describe("refreshing", () => {
  async function signedIn(store = memoryStore()) {
    const test = setUp({ store })
    await test.account.signIn({ provider: "GitHubOAuth" })
    test.answer(200, session("refresh_1", test.now()))
    await test.account.takeLink(test.callback({ code: "1" }))

    return test
  }

  it("refreshes a minute before the token expires, keeping the new refresh token", async () => {
    const test = await signedIn()
    expect(test.pending()).toEqual([240_000])
    test.answer(200, session("refresh_2", test.now() + 240_000))
    await test.tick()
    expect(test.requests.at(-1)).toEqual({
      grant_type: "refresh_token",
      client_id: "client_test",
      refresh_token: "refresh_1"
    })
    expect(keptFor(test.store)?.refreshToken).toBe("refresh_2")
    expect(test.pending()).toEqual([240_000])
  })

  it("tries again later when WorkOS doesn't answer, and stays signed in", async () => {
    const test = await signedIn()
    test.answer(503, {})
    await test.tick()
    expect(test.pending()).toEqual([5_000])
    expect(test.account.state().account).not.toBeNull()
  })

  it("ends the session when WorkOS refuses the refresh, saying who it was", async () => {
    const test = await signedIn()
    test.answer(400, { error: "invalid_grant" })
    await test.tick()
    expect(test.account.state()).toMatchObject({
      account: null,
      accounts: [{ email: "ada@example.com", provider: "GitHubOAuth", ended: true }],
      ended: { person: { email: "ada@example.com" }, provider: "GitHubOAuth" }
    })
    // Who it was stays kept, to sign in to again after a restart, but not the token WorkOS refused.
    expect(test.store.kept).toEqual({ accounts: [{ person: expect.anything(), provider: "GitHubOAuth" }] })
    expect(test.pending()).toEqual([])
  })

  it("uses the token another copy of Parity refreshed to", async () => {
    const test = await signedIn()
    keptFor(test.store)!.refreshToken = "refresh_from_another_copy"
    test.answer(200, session("refresh_3", test.now() + 240_000))
    await test.tick()
    expect(test.requests.at(-1)).toMatchObject({ refresh_token: "refresh_from_another_copy" })
  })

  it("signs out when another copy did", async () => {
    const test = await signedIn()
    test.store.clear()
    await test.tick()
    expect(test.account.state().account).toBeNull()
    expect(test.account.state().ended).toBeNull()
  })

  it("signs back in from the kept session as Parity starts", async () => {
    const store = memoryStore()
    store.kept = {
      accounts: [
        {
          refreshToken: "refresh_kept",
          person: { email: "ada@example.com", name: "Ada Lovelace" },
          provider: "GoogleOAuth"
        }
      ]
    }
    const test = setUp({ store })
    test.answer(200, session("refresh_next", test.now()))
    await test.account.restore()
    expect(test.states[0]?.account).toEqual({ email: "ada@example.com", name: "Ada Lovelace", untilQuit: false })
    expect(test.requests[0]).toMatchObject({ refresh_token: "refresh_kept" })
    expect(test.account.state().account).toMatchObject({ organizationId: "org_1", role: "admin" })
    expect(keptFor(store)?.refreshToken).toBe("refresh_next")
  })
})

describe("signing out", () => {
  it("forgets both tokens and stops refreshing", async () => {
    const test = setUp()
    await test.account.signIn({ provider: "GoogleOAuth" })
    test.answer(200, session("refresh_1", test.now()))
    await test.account.takeLink(test.callback({ code: "1" }))
    await test.account.signOut("ada@example.com")
    expect(test.account.state()).toEqual({ account: null, accounts: [], attempt: null, ended: null })
    expect(test.store.kept).toBeUndefined()
    expect(test.pending()).toEqual([])
  })
})

describe("telemetry", () => {
  async function signedIn(test = setUp(), provider: SignInProvider = "GitHubOAuth", email = "ada@example.com") {
    await test.account.signIn({ provider })
    test.answer(200, session(`refresh_${email}`, test.now(), {}, email))
    await test.account.takeLink(test.callback({ code: "1" }))

    return test
  }

  it("records signing in, never with a token or an email", async () => {
    const test = await signedIn()
    await signedIn(test, "GoogleOAuth", "ada@contoso.com")
    await signedIn(test, "GoogleOAuth", "ada@contoso.com")
    expect(test.named("account.signedIn")).toEqual([
      { provider: "GitHubOAuth", again: false, kept: true, accounts: 1 },
      { provider: "GoogleOAuth", again: false, kept: true, accounts: 2 },
      { provider: "GoogleOAuth", again: true, kept: true, accounts: 2 }
    ])
    expect(JSON.stringify(test.tracked)).not.toMatch(/refresh_|@/)
  })

  it("records each sign-in that ends without a session, with WorkOS's status and code but not its message", async () => {
    const test = setUp()
    await test.account.signIn({ provider: "GoogleOAuth" })
    await test.account.takeLink(test.callback({ error: "access_denied" }))
    await test.account.signIn({ provider: "GoogleOAuth" })
    await test.account.takeLink(test.callback({ error: "server_error" }))
    await test.account.signIn({ provider: "MicrosoftOAuth" })
    test.answer(403, { code: "user_not_allowed", message: "ada@hey.com isn't allowed.", email: "ada@hey.com" })
    await test.account.takeLink(test.callback({ code: "1" }))
    test.browserFails()
    await test.account.signIn({ provider: "authkit", email: "ada@example.com" })
    expect(test.named("account.signInProblem")).toEqual([
      { provider: "GoogleOAuth", problem: "canceled" },
      { provider: "GoogleOAuth", problem: "failed", code: "server_error" },
      { provider: "MicrosoftOAuth", problem: "refused", status: 403, code: "user_not_allowed" },
      { provider: "authkit", problem: "browser" }
    ])
    expect(JSON.stringify(test.tracked)).not.toMatch(/@/)
  })

  it("records refreshes, and each that fails with why", async () => {
    const test = await signedIn()
    test.answer(503, {})
    await test.tick()
    test.answer(200, session("refresh_2", test.now()))
    await test.tick()
    expect(test.named("account.refreshFailed")).toEqual([
      { reason: "unavailable", organization: false, failures: 1, status: 503 }
    ])
    expect(test.named("account.refreshed")).toEqual([{ organization: false, retries: 1 }])
  })

  it("records a refresh another copy won, and a session WorkOS ends", async () => {
    const test = await signedIn()
    // Another copy refreshes while this one asks WorkOS: its read after the refusal finds a newer token.
    let reads = 0
    test.store.read = async () => {
      const { kept } = test.store

      if (++reads === 2) {
        keptFor(test.store)!.refreshToken = "refresh_newer"
      }

      return kept
    }

    test.answer(400, { error: "invalid_grant" })
    await test.tick()
    test.answer(400, { error: "invalid_grant" })
    await test.tick()
    expect(test.named("account.refreshFailed")).toEqual([
      { reason: "superseded", organization: false, failures: 1, status: 400, code: "invalid_grant" },
      { reason: "refused", organization: false, failures: 2, status: 400, code: "invalid_grant" }
    ])
    expect(test.named("account.sessionEnded")).toEqual([{ reason: "refused", current: true }])
  })

  it("records a session ended or signed out in another copy", async () => {
    const test = await signedIn()
    delete keptFor(test.store)!.refreshToken
    await test.tick()
    expect(test.named("account.sessionEnded")).toEqual([{ reason: "elsewhere", current: true }])

    const other = await signedIn()
    other.store.clear()
    await other.tick()
    expect(other.named("account.signedOut")).toEqual([
      { reason: "elsewhere", current: true, ended: false, accounts: 0 }
    ])
  })

  it("records signing out, and removing an account whose session ended", async () => {
    const test = await signedIn()
    await signedIn(test, "GoogleOAuth", "ada@contoso.com")
    await test.account.signOut("ada@example.com")
    test.answer(400, { error: "invalid_grant" })
    await test.tick()
    await test.account.signOut("ada@contoso.com")
    expect(test.named("account.signedOut")).toEqual([
      { reason: "person", current: false, ended: false, accounts: 1 },
      { reason: "person", current: false, ended: true, accounts: 0 }
    ])
  })

  it("records switching organizations, and a switch WorkOS turns down", async () => {
    const test = await signedIn()
    test.answer(200, session("refresh_2", test.now(), { org_id: "org_2" }))
    await test.account.switchOrganization("org_2")
    test.answer(403, { code: "organization_membership_not_found" })
    await expect(test.account.switchOrganization("org_3")).rejects.toThrow("WorkOS didn't switch")
    expect(test.named("account.refreshed")).toEqual([{ organization: true, retries: 0 }])
    expect(test.named("account.refreshFailed")).toEqual([
      { reason: "refused", organization: true, failures: 1, status: 403, code: "organization_membership_not_found" }
    ])
  })

  it("records accounts it couldn't keep, by the error's name and code", async () => {
    const store = memoryStore()
    store.update = async () => {
      throw Object.assign(new Error("EPERM: C:\\Users\\ada\\account"), { code: "EPERM" })
    }

    const test = await signedIn(setUp({ store }))
    expect(test.named("account.storeFailed")).toEqual([{ action: "write", error: "Error", code: "EPERM" }])
    expect(test.named("account.signedIn")).toEqual([
      { provider: "GitHubOAuth", again: false, kept: false, accounts: 1 }
    ])
  })
})

describe("several accounts", () => {
  const ada = "ada@example.com"
  const work = "ada@contoso.com"
  const hey = "ada@hey.com"

  /** Signs in as `email`, with an access token that lasts `seconds`. */
  async function add(test: ReturnType<typeof setUp>, email: string, provider: SignInProvider, seconds = 300) {
    await test.account.signIn({ provider })
    test.answer(200, session(`refresh_${email}`, test.now(), { exp: test.now() / 1000 + seconds }, email))
    expect(await test.account.takeLink(test.callback({ code: email }))).toBe("signed-in")
  }

  it("adds another account, asking the provider which one, and you're in it", async () => {
    const test = setUp()
    await add(test, ada, "GoogleOAuth")
    await add(test, work, "MicrosoftOAuth")
    const prompt = (url: string) => new URL(url).searchParams.get("provider_query_params[prompt]")
    expect(test.opened.map(prompt)).toEqual([null, "select_account"])
    expect(test.account.state().account?.email).toBe(work)
    expect(test.account.state().accounts.map((each) => [each.email, each.provider])).toEqual([
      [ada, "GoogleOAuth"],
      [work, "MicrosoftOAuth"]
    ])
    expect(test.store.kept?.current).toBe(work)
    expect(test.pending()).toHaveLength(2)
  })

  it("signs in to an account that's already there in its place", async () => {
    const test = setUp()
    await add(test, ada, "GoogleOAuth")
    test.answer(200, session("refresh_again", test.now()))
    await test.account.signIn({ provider: "GoogleOAuth" })
    await test.account.takeLink(test.callback({ code: "again" }))
    expect(test.account.state().accounts).toHaveLength(1)
    expect(keptFor(test.store)?.refreshToken).toBe("refresh_again")
    expect(test.pending()).toHaveLength(1)
  })

  it("switches between accounts at once, without asking WorkOS", async () => {
    const test = setUp()
    await add(test, ada, "GoogleOAuth")
    await add(test, work, "MicrosoftOAuth")
    const asked = test.requests.length
    await test.account.use(ada)
    expect(test.account.state().account?.email).toBe(ada)
    expect(test.requests).toHaveLength(asked)
    expect(test.store.kept?.current).toBe(ada)
    await expect(test.account.use("someone@example.com")).rejects.toThrow(/isn't signed in as someone@example.com/)
  })

  it("signs out of another account, and you stay in the one you're in", async () => {
    const test = setUp()
    await add(test, ada, "GoogleOAuth")
    await add(test, work, "MicrosoftOAuth")
    await test.account.signOut(ada)
    expect(test.account.state().account?.email).toBe(work)
    expect(test.account.state().accounts.map((each) => each.email)).toEqual([work])
    expect(test.store.kept).toMatchObject({ current: work, accounts: [{ person: { email: work } }] })
    expect(test.pending()).toHaveLength(1)
  })

  it("moves you to the account you used last when you sign out of the one you're in", async () => {
    const test = setUp()
    await add(test, ada, "GoogleOAuth")
    await add(test, work, "MicrosoftOAuth")
    await add(test, hey, "GitHubOAuth")
    await test.account.use(ada)
    await test.account.use(hey)
    await test.account.signOut(hey)
    expect(test.account.state().account?.email).toBe(ada)
    expect(test.store.kept?.current).toBe(ada)
  })

  it("keeps an account whose session ended listed, to sign in again as it, and you stay where you are", async () => {
    const test = setUp()
    await add(test, ada, "GoogleOAuth")
    await add(test, work, "MicrosoftOAuth", 600)
    test.answer(400, { error: "invalid_grant" })
    await test.tick()
    expect(test.account.state()).toMatchObject({
      account: { email: work },
      accounts: [{ email: ada, ended: true }, { email: work }],
      ended: null
    })
    expect(keptFor(test.store)).not.toHaveProperty("refreshToken")

    // Signing in again names the account, rather than asking which one.
    await test.account.signIn({ provider: "GoogleOAuth", email: ada })
    const url = new URL(test.opened.at(-1)!)
    expect(url.searchParams.get("login_hint")).toBe(ada)
    expect(url.searchParams.has("provider_query_params[prompt]")).toBe(false)
    test.answer(200, session("refresh_again", test.now()))
    await test.account.takeLink(test.callback({ code: "again" }))
    expect(test.account.state().account?.email).toBe(ada)
    expect(test.account.state().accounts.map((each) => [each.email, each.ended])).toEqual([
      [ada, undefined],
      [work, undefined]
    ])
  })

  it("forgets an account whose session ended when it's removed", async () => {
    const test = setUp()
    await add(test, ada, "GoogleOAuth")
    await add(test, work, "MicrosoftOAuth", 600)
    test.answer(400, { error: "invalid_grant" })
    await test.tick()
    await test.account.signOut(ada)
    expect(test.account.state().accounts.map((each) => each.email)).toEqual([work])
    expect(keptFor(test.store)).toBeUndefined()
  })

  it("moves you to another account when the one you're in ends, and says so", async () => {
    const test = setUp()
    await add(test, ada, "GoogleOAuth", 600)
    await add(test, work, "MicrosoftOAuth")
    test.answer(400, { error: "invalid_grant" })
    await test.tick()
    expect(test.account.state()).toMatchObject({
      account: { email: ada },
      ended: { person: { email: work }, provider: "MicrosoftOAuth" }
    })
    expect(test.store.kept?.current).toBe(ada)
  })

  it("restores every account as Parity starts, in the one it was last in", async () => {
    const store = memoryStore()
    store.kept = {
      current: work,
      accounts: [
        { refreshToken: "refresh_ada", person: { email: ada }, provider: "GoogleOAuth" },
        { refreshToken: "refresh_work", person: { email: work }, provider: "MicrosoftOAuth" },
        { person: { email: hey }, provider: "GitHubOAuth" }
      ]
    }
    const test = setUp({ store })
    test.answer(200, session("refresh_ada_2", test.now()))
    test.answer(200, session("refresh_work_2", test.now(), {}, work))
    await test.account.restore()
    expect(test.account.state().account?.email).toBe(work)
    expect(test.account.state().accounts.map((each) => each.ended ?? false)).toEqual([false, false, true])
    expect(test.requests.map((request) => request.refresh_token)).toEqual(["refresh_ada", "refresh_work"])
    expect(keptFor(store, work)?.refreshToken).toBe("refresh_work_2")
  })
})
