import { describe, expect, it } from "vite-plus/test"
import type { z } from "zod"
import type { Limiter } from "./search.ts"
import { answerOrganizationChoice, type SignInServiceOptions } from "./sign-in.ts"

/** WorkOS, answering with `status` and `body`, and keeping the bodies it was sent. */
function workos(status: number, body: z.core.util.JSONType) {
  const sent: RequestInit["body"][] = []

  const fetch = async (_url: string, init: RequestInit) => {
    sent.push(init.body)

    return Response.json(body, { status })
  }

  return { fetch, sent }
}

const open: Limiter = { take: async () => true }
const choice = { pendingToken: "pending_01", organizationId: "org_01ACME" }

function options(fetch: SignInServiceOptions["fetch"], more: Partial<SignInServiceOptions> = {}): SignInServiceOptions {
  return { clientId: "client_01TEST", apiKey: "sk_test", fetch, addresses: open, ...more }
}

describe("answerOrganizationChoice (PAR-1143)", () => {
  it("finishes the sign-in with the client secret, and answers with WorkOS's session as WorkOS gave it", async () => {
    const session = { user: { id: "user_01" }, access_token: "access", refresh_token: "refresh" }
    const answering = workos(200, session)

    expect(
      await answerOrganizationChoice(options(answering.fetch), { body: choice, caller: { address: "203.0.113.5" } })
    ).toEqual({
      status: 200,
      body: session
    })
    expect(answering.sent).toEqual([
      JSON.stringify({
        grant_type: "urn:workos:oauth:grant-type:organization-selection",
        client_id: "client_01TEST",
        client_secret: "sk_test",
        pending_authentication_token: "pending_01",
        organization_id: "org_01ACME",
        ip_address: "203.0.113.5"
      })
    ])
  })

  it("passes on WorkOS's refusal, such as a pending token that ran out", async () => {
    const refusal = { error: "invalid_grant", error_description: "Pending authentication token expired." }

    expect(await answerOrganizationChoice(options(workos(400, refusal).fetch), { body: choice, caller: {} })).toEqual({
      status: 400,
      body: refusal
    })
  })

  it("can't finish one before the app's owner sets the API key, and asks nothing of WorkOS", async () => {
    const answering = workos(200, {})

    expect(
      (await answerOrganizationChoice(options(answering.fetch, { apiKey: undefined }), { body: choice, caller: {} }))
        .status
    ).toBe(503)
    expect(answering.sent).toEqual([])
  })

  it("turns down a request that isn't a pending token and an organization", async () => {
    const answering = workos(200, {})

    for (const body of [undefined, {}, { pendingToken: "pending_01" }, { ...choice, client_secret: "x" }]) {
      expect((await answerOrganizationChoice(options(answering.fetch), { body, caller: {} })).status).toBe(400)
    }

    expect(answering.sent).toEqual([])
  })

  it("limits each address, and says when to ask again", async () => {
    const closed: Limiter = { take: async () => false }

    const reply = await answerOrganizationChoice(options(workos(200, {}).fetch, { addresses: closed }), {
      body: choice,
      caller: { address: "203.0.113.5" }
    })

    expect(reply).toMatchObject({ status: 429, retryAfter: 60 })
  })

  it("says WorkOS is unavailable when it can't be reached", async () => {
    const failing = () => Promise.reject(new Error("offline"))

    expect((await answerOrganizationChoice(options(failing), { body: choice, caller: {} })).status).toBe(502)
  })
})
