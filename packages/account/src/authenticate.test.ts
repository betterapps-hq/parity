import { describe, expect, it } from "vite-plus/test"
import { authenticate, codeRequest, type Fetch, refreshRequest } from "./index.ts"

const jwt = (claims: unknown) =>
  ["header", JSON.stringify(claims), "signature"].map((part) => Buffer.from(part).toString("base64url")).join(".")

const accessToken = jwt({
  sub: "user_01ANA",
  sid: "session_01",
  org_id: "org_01ACME",
  role: "member",
  permissions: [],
  iat: 1_800_000_000,
  exp: 1_800_000_300
})

const answer = {
  user: {
    object: "user",
    id: "user_01ANA",
    email: "ana@acme.test",
    email_verified: true,
    first_name: "Ana",
    last_name: null,
    profile_picture_url: "https://example.test/ana.png",
    created_at: "2026-11-05T00:00:00.000Z",
    updated_at: "2026-11-05T00:00:00.000Z"
  },
  organization_id: "org_01ACME",
  access_token: accessToken,
  refresh_token: "refresh_02",
  authentication_method: "GoogleOAuth"
}

/** A `fetch` that gives one answer and keeps what it was asked. */
function answering(status: number, body: unknown) {
  const requests: { url: string; init: RequestInit }[] = []
  const fetch: Fetch = async (url, init) => {
    requests.push({ url, init })
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status })
  }
  return { fetch, requests }
}

describe("request bodies", () => {
  it("exchanges a code with its verifier and the client ID alone", () => {
    expect(codeRequest({ clientId: "client_01TEST", code: "01CODE", verifier: "verifier" })).toEqual({
      grant_type: "authorization_code",
      client_id: "client_01TEST",
      code: "01CODE",
      code_verifier: "verifier"
    })
  })

  it("refreshes in the same organization, or switches to another", () => {
    expect(refreshRequest({ clientId: "client_01TEST", refreshToken: "refresh_01" })).toEqual({
      grant_type: "refresh_token",
      client_id: "client_01TEST",
      refresh_token: "refresh_01"
    })
    expect(
      refreshRequest({ clientId: "client_01TEST", refreshToken: "refresh_01", organizationId: "org_02BETA" })
    ).toEqual({
      grant_type: "refresh_token",
      client_id: "client_01TEST",
      refresh_token: "refresh_01",
      organization_id: "org_02BETA"
    })
  })
})

describe("authenticate", () => {
  it("posts the body as JSON to WorkOS's authenticate endpoint", async () => {
    const { fetch, requests } = answering(200, answer)
    const body = codeRequest({ clientId: "client_01TEST", code: "01CODE", verifier: "verifier" })
    await authenticate(fetch, body)
    expect(requests).toEqual([
      {
        url: "https://api.workos.com/user_management/authenticate",
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body)
        }
      }
    ])
  })

  it("reads the session: the person, their organization, the tokens and the claims", async () => {
    const { fetch } = answering(200, answer)
    const result = await authenticate(fetch, refreshRequest({ clientId: "client_01TEST", refreshToken: "refresh_01" }))
    expect(result).toEqual({
      kind: "session",
      session: {
        user: {
          id: "user_01ANA",
          email: "ana@acme.test",
          firstName: "Ana",
          pictureUrl: "https://example.test/ana.png"
        },
        organizationId: "org_01ACME",
        accessToken,
        refreshToken: "refresh_02",
        token: {
          userId: "user_01ANA",
          sessionId: "session_01",
          organizationId: "org_01ACME",
          role: "member",
          permissions: [],
          issuedAt: 1_800_000_000_000,
          expiresAt: 1_800_000_300_000
        }
      }
    })
  })

  it("passes on why WorkOS refused, in either of its error shapes", async () => {
    const refresh = refreshRequest({ clientId: "client_01TEST", refreshToken: "refresh_01" })
    const oauth = answering(400, { error: "invalid_grant", error_description: "Refresh token already exchanged." })
    expect(await authenticate(oauth.fetch, refresh)).toEqual({
      kind: "refused",
      status: 400,
      code: "invalid_grant",
      message: "Refresh token already exchanged."
    })
    const coded = answering(403, { code: "organization_selection_required", message: "Pick an organization." })
    expect(await authenticate(coded.fetch, refresh)).toEqual({
      kind: "refused",
      status: 403,
      code: "organization_selection_required",
      message: "Pick an organization."
    })
    expect(await authenticate(answering(401, "Unauthorized").fetch, refresh)).toEqual({ kind: "refused", status: 401 })
  })

  it("is unavailable when WorkOS is busy or down, or the network fails", async () => {
    const refresh = refreshRequest({ clientId: "client_01TEST", refreshToken: "refresh_01" })
    for (const status of [408, 429, 500, 503])
      expect(await authenticate(answering(status, {}).fetch, refresh)).toEqual({
        kind: "unavailable",
        status,
        message: `WorkOS answered ${status}`
      })
    const offline: Fetch = () => Promise.reject(new TypeError("fetch failed"))
    expect(await authenticate(offline, refresh)).toEqual({ kind: "unavailable", message: "fetch failed" })
  })

  it("is unavailable when the answer has no user and tokens, or its access token can't be read", async () => {
    const refresh = refreshRequest({ clientId: "client_01TEST", refreshToken: "refresh_01" })
    expect(await authenticate(answering(200, "<html>").fetch, refresh)).toEqual({
      kind: "unavailable",
      message: "WorkOS's answer didn't have a user and tokens"
    })
    expect(await authenticate(answering(200, { ...answer, access_token: "opaque" }).fetch, refresh)).toEqual({
      kind: "unavailable",
      message: "The access token isn't a JWT"
    })
  })
})
