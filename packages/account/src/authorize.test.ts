import { describe, expect, it } from "vite-plus/test"
import { authorizeUrl, codeChallenge, codeVerifier, type SignInProvider, startSignIn } from "./index.ts"

// RFC 7636, Appendix B: 32 random bytes, the verifier they make, and its S256 challenge.
const rfcBytes = Uint8Array.from([
  116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91,
  88, 5, 88, 83, 132, 141, 121
])
const rfcVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const rfcChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

const options = { clientId: "client_01TEST", redirectUri: "parity://auth/callback" }

describe("PKCE", () => {
  it("makes RFC 7636's verifier and S256 challenge", async () => {
    expect(codeVerifier(rfcBytes)).toBe(rfcVerifier)
    expect(await codeChallenge(rfcVerifier)).toBe(rfcChallenge)
  })
})

describe("authorizeUrl", () => {
  it.each<SignInProvider>(["GoogleOAuth", "GitHubOAuth", "MicrosoftOAuth"])(
    "sends %s straight to its provider",
    (provider) => {
      const url = new URL(authorizeUrl({ ...options, provider, state: "state-1", codeChallenge: rfcChallenge }))
      expect(url.origin + url.pathname).toBe("https://api.workos.com/user_management/authorize")
      expect(Object.fromEntries(url.searchParams)).toEqual({
        response_type: "code",
        client_id: "client_01TEST",
        redirect_uri: "parity://auth/callback",
        provider,
        state: "state-1",
        code_challenge: rfcChallenge,
        code_challenge_method: "S256"
      })
    }
  )

  it("gives AuthKit the work email as a login hint", () => {
    const url = new URL(
      authorizeUrl({ ...options, provider: "authkit", loginHint: "ana@acme.test", state: "s", codeChallenge: "c" })
    )
    expect(url.searchParams.get("provider")).toBe("authkit")
    expect(url.searchParams.get("login_hint")).toBe("ana@acme.test")
  })
})

describe("startSignIn", () => {
  it("keeps the state and verifier it put in the URL", async () => {
    const { url, pending } = await startSignIn({ ...options, provider: "GoogleOAuth" }, () => rfcBytes)
    expect(pending).toEqual({ state: rfcVerifier, verifier: rfcVerifier, redirectUri: "parity://auth/callback" })
    const query = new URL(url).searchParams
    expect(query.get("state")).toBe(pending.state)
    expect(query.get("code_challenge")).toBe(rfcChallenge)
  })

  it("draws a new state and verifier each time", async () => {
    const first = await startSignIn({ ...options, provider: "authkit" })
    const second = await startSignIn({ ...options, provider: "authkit" })
    expect(first.pending.verifier).toMatch(/^[\w-]{43}$/)
    expect(second.pending.state).not.toBe(first.pending.state)
    expect(second.pending.verifier).not.toBe(first.pending.verifier)
  })
})
