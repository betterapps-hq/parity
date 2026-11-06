import { workosApi } from "./authorize.ts"
import { authenticateResponse, workosError } from "./schemas.ts"
import { type AccessToken, readAccessToken } from "./token.ts"

/** The `fetch` sign-in calls WorkOS with, passed in so main can use Electron's and tests can answer it. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>

/** Exchanging the code the browser handed back, with the pending sign-in's verifier and no client secret. */
export interface CodeRequest {
  grant_type: "authorization_code"
  client_id: string
  code: string
  code_verifier: string
}

/** A refresh, which can switch to another of the person's organizations with `organization_id`. */
export interface RefreshRequest {
  grant_type: "refresh_token"
  client_id: string
  refresh_token: string
  organization_id?: string
}

export function codeRequest(options: { clientId: string; code: string; verifier: string }): CodeRequest {
  return {
    grant_type: "authorization_code",
    client_id: options.clientId,
    code: options.code,
    code_verifier: options.verifier
  }
}

export function refreshRequest(options: {
  clientId: string
  refreshToken: string
  organizationId?: string
}): RefreshRequest {
  return {
    grant_type: "refresh_token",
    client_id: options.clientId,
    refresh_token: options.refreshToken,
    ...(options.organizationId !== undefined && { organization_id: options.organizationId })
  }
}

/** The person who's signed in, as the window shows them. */
export interface AccountUser {
  id: string
  email: string
  firstName?: string
  lastName?: string
  pictureUrl?: string
}

/** A signed-in session. Main keeps the tokens; the window gets the user, organization and role. */
export interface Session {
  user: AccountUser
  organizationId?: string
  accessToken: string
  /** Used once: each refresh hands back the one to use next. */
  refreshToken: string
  token: AccessToken
}

/**
 * What WorkOS answered:
 *
 * - `session`: signed in, or refreshed.
 * - `refused`: WorkOS turned the request down, with its error code and message. A refused refresh means the session
 *   has ended, because it expired, an admin removed the person or the refresh token was already used: sign in again.
 * - `unavailable`: no usable answer, because the network failed, WorkOS timed out, was busy or broke, or answered with
 *   something unreadable. A refresh tries again later, and the session carries on until its access token expires.
 */
export type AuthenticateResult =
  | { kind: "session"; session: Session }
  | { kind: "refused"; status: number; code?: string; message?: string; email?: string }
  | { kind: "unavailable"; status?: number; message: string }

/** Whether a status is worth trying again after: a timeout, too many requests, or WorkOS failing. */
function transient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/** Sends a code exchange or a refresh to `/user_management/authenticate` and reads the answer. Never throws. */
export async function authenticate(fetch: Fetch, body: CodeRequest | RefreshRequest): Promise<AuthenticateResult> {
  let response: Response
  let json: unknown
  try {
    response = await fetch(new URL("/user_management/authenticate", workosApi).href, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    })
    json = await response.json().catch(() => undefined)
  } catch (error) {
    return { kind: "unavailable", message: error instanceof Error ? error.message : String(error) }
  }

  if (!response.ok) {
    if (transient(response.status))
      return { kind: "unavailable", status: response.status, message: `WorkOS answered ${response.status}` }
    const details = workosError.safeParse(json).data
    const code = details?.code ?? details?.error
    const message = details?.message ?? details?.error_description
    return {
      kind: "refused",
      status: response.status,
      ...(code !== undefined && { code }),
      ...(message !== undefined && { message }),
      ...(details?.email !== undefined && { email: details.email })
    }
  }

  const parsed = authenticateResponse.safeParse(json)
  if (!parsed.success) return { kind: "unavailable", message: "WorkOS's answer didn't have a user and tokens" }
  const answer = parsed.data
  let token: AccessToken
  try {
    token = readAccessToken(answer.access_token)
  } catch (error) {
    return { kind: "unavailable", message: error instanceof Error ? error.message : String(error) }
  }
  const user = answer.user
  const organizationId = answer.organization_id ?? token.organizationId
  return {
    kind: "session",
    session: {
      user: {
        id: user.id,
        email: user.email,
        ...(user.first_name && { firstName: user.first_name }),
        ...(user.last_name && { lastName: user.last_name }),
        ...(user.profile_picture_url && { pictureUrl: user.profile_picture_url })
      },
      ...(organizationId !== undefined && { organizationId }),
      accessToken: answer.access_token,
      refreshToken: answer.refresh_token,
      token
    }
  }
}
