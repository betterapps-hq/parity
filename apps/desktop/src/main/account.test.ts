import type { Fetch } from "@parity-app/account"
import { describe, expect, it } from "vite-plus/test"
import type { AccountState } from "../shared/account.ts"
import { type AccountOptions, createAccount } from "./account.ts"
import type { SessionStore, StoredSession } from "./session-store.ts"

const jwt = (claims: Record<string, unknown>) =>
  ["header", JSON.stringify(claims), "signature"].map((part) => Buffer.from(part).toString("base64url")).join(".")

/** WorkOS's answer to a code or a refresh, handing back `refresh`, with a token that lasts five minutes from `now`. */
function session(refresh: string, now: number, claims: Record<string, unknown> = {}) {
  return {
    user: { id: "user_1", email: "ada@example.com", email_verified: true, first_name: "Ada", last_name: "Lovelace" },
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
function memoryStore(persistent = true): SessionStore & { kept?: StoredSession } {
  const store: SessionStore & { kept?: StoredSession } = {
    persistent: async () => persistent,
    read: async () => store.kept,
    async save(next) {
      if (persistent) store.kept = next
      return persistent
    },
    clear() {
      delete store.kept
    }
  }
  return store
}

/**
 * The account with everything it talks to stood in for: WorkOS answers from a queue, the browser records what it was
 * opened at, and timers run when the test says.
 */
function setUp(options: { store?: ReturnType<typeof memoryStore> } = {}) {
  let now = 1_800_000_000_000
  const answers: { status: number; body: unknown }[] = []
  const requests: Record<string, unknown>[] = []
  const opened: string[] = []
  const states: AccountState[] = []
  const timers: { run: () => void; at: number }[] = []
  let closed = 0
  const fetch: Fetch = async (_url, init) => {
    requests.push(JSON.parse(typeof init.body === "string" ? init.body : "{}") as Record<string, unknown>)
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
    },
    store,
    changed: (state) => states.push(state),
    focus: () => undefined,
    now: () => now,
    later: (run, ms) => {
      const timer = { run, at: now + ms }
      timers.push(timer)
      return () => timers.splice(timers.indexOf(timer), 1)
    }
  } satisfies AccountOptions)
  return {
    account,
    store,
    states,
    opened,
    requests,
    closed: () => closed,
    answer: (status: number, body: unknown) => answers.push({ status, body }),
    /** Moves the clock to the next timer and runs it. */
    async tick() {
      const timer = timers.sort((a, b) => a.at - b.at).shift()
      if (!timer) throw new Error("Nothing is scheduled")
      now = Math.max(now, timer.at)
      timer.run()
      // The refresh reads the store, asks WorkOS and keeps what it says, each a step of its own.
      for (let step = 0; step < 5; step++) await new Promise((resolve) => setImmediate(resolve))
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
    expect(test.account.state()).toEqual({
      account: {
        email: "ada@example.com",
        name: "Ada Lovelace",
        organizationId: "org_1",
        role: "admin",
        untilQuit: false
      },
      attempt: null,
      ended: null
    })
    expect(test.store.kept).toMatchObject({ refreshToken: "refresh_1", provider: "GitHubOAuth" })
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
    expect(test.account.state()).toEqual({ account: null, attempt: null, ended: null })
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
    expect(test.store.kept?.person.organizations).toEqual(organizations)
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
    expect(test.store.kept?.refreshToken).toBe("refresh_2")
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
    test.account.signOut()
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
    expect(test.store.kept?.refreshToken).toBe("refresh_2")
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
      ended: { person: { email: "ada@example.com" }, provider: "GitHubOAuth" }
    })
    expect(test.store.kept).toBeUndefined()
    expect(test.pending()).toEqual([])
  })

  it("uses the token another copy of Parity refreshed to", async () => {
    const test = await signedIn()
    test.store.kept = { ...test.store.kept!, refreshToken: "refresh_from_another_copy" }
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
      refreshToken: "refresh_kept",
      person: { email: "ada@example.com", name: "Ada Lovelace" },
      provider: "GoogleOAuth"
    }
    const test = setUp({ store })
    test.answer(200, session("refresh_next", test.now()))
    await test.account.restore()
    expect(test.states[0]?.account).toEqual({ email: "ada@example.com", name: "Ada Lovelace", untilQuit: false })
    expect(test.requests[0]).toMatchObject({ refresh_token: "refresh_kept" })
    expect(test.account.state().account).toMatchObject({ organizationId: "org_1", role: "admin" })
    expect(store.kept?.refreshToken).toBe("refresh_next")
  })
})

describe("signing out", () => {
  it("forgets both tokens and stops refreshing", async () => {
    const test = setUp()
    await test.account.signIn({ provider: "GoogleOAuth" })
    test.answer(200, session("refresh_1", test.now()))
    await test.account.takeLink(test.callback({ code: "1" }))
    test.account.signOut()
    expect(test.account.state()).toEqual({ account: null, attempt: null, ended: null })
    expect(test.store.kept).toBeUndefined()
    expect(test.pending()).toEqual([])
  })
})
