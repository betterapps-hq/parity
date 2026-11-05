/** WorkOS's API, where the authorize URL and the authenticate endpoint live. */
export const workosApi = "https://api.workos.com"

/**
 * How a person signs in. Google, GitHub and Microsoft go straight to that provider, skipping AuthKit's own page.
 * `authkit` is the work email: AuthKit sends it to the company's single sign-on, or to a code by email.
 */
export type SignInProvider = "GoogleOAuth" | "GitHubOAuth" | "MicrosoftOAuth" | "authkit"

export interface SignInOptions {
  /** The WorkOS environment's client ID. It's public; the API key never ships in the app. */
  clientId: string
  /** Where WorkOS sends the browser back: `parity://auth/callback`, or a loopback address in development. */
  redirectUri: string
  provider: SignInProvider
  /** An email address the provider or AuthKit fills in, such as the work email typed into Parity. */
  loginHint?: string
}

/** What the copy that starts a sign-in keeps until the browser hands back. Only it has the verifier. */
export interface PendingSignIn {
  state: string
  /** The PKCE code verifier, which the code is exchanged with. */
  verifier: string
  redirectUri: string
}

/** Fills an array of the given length with random bytes. */
export type RandomBytes = (length: number) => Uint8Array

const secureRandom: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length))

/**
 * Starts a sign-in: a fresh `state` and PKCE verifier, and WorkOS's authorize URL to open in the browser. The caller
 * keeps `pending` to read the link the browser hands back and to exchange its code.
 */
export async function startSignIn(
  options: SignInOptions,
  random: RandomBytes = secureRandom
): Promise<{ url: string; pending: PendingSignIn }> {
  const state = base64Url(random(32))
  const verifier = codeVerifier(random(32))
  const url = authorizeUrl({ ...options, state, codeChallenge: await codeChallenge(verifier) })
  return { url, pending: { state, verifier, redirectUri: options.redirectUri } }
}

/** WorkOS's authorize URL (`/user_management/authorize`) for a PKCE sign-in with an S256 challenge. */
export function authorizeUrl(options: SignInOptions & { state: string; codeChallenge: string }): string {
  const url = new URL("/user_management/authorize", workosApi)
  const query = url.searchParams
  query.set("response_type", "code")
  query.set("client_id", options.clientId)
  query.set("redirect_uri", options.redirectUri)
  query.set("provider", options.provider)
  query.set("state", options.state)
  query.set("code_challenge", options.codeChallenge)
  query.set("code_challenge_method", "S256")
  if (options.loginHint) query.set("login_hint", options.loginHint)
  return url.href
}

/** A PKCE code verifier from random bytes: 32 bytes make the 43 characters RFC 7636 asks for at least. */
export function codeVerifier(bytes: Uint8Array): string {
  return base64Url(bytes)
}

/** The S256 code challenge for a verifier: its SHA-256, base64url-encoded without padding (RFC 7636). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}
