import type { Fetch } from "@parity-app/connectors"
import { z } from "zod"
import type { Caller, Limiter, Reply } from "./search.ts"

/*
 * Finishing a sign-in after the person chose an organization (PAR-1143). WorkOS answers a sign-in by someone in several
 * organizations with `organization_selection_required` and a pending token, and finishing it takes the client secret,
 * which can't ship in the app. The service holds it, so the app sends the token and the organization here and gets back
 * WorkOS's answer as WorkOS gave it, so it reads it as it reads its own code exchange.
 */

/** What the app sends: WorkOS's pending token and the organization the person chose. */
export const organizationChoice = z.strictObject({
  pendingToken: z.string().min(1).max(4096),
  organizationId: z.string().min(1).max(256)
})

export type OrganizationChoice = z.infer<typeof organizationChoice>

export interface SignInServiceOptions {
  /** Parity's client in WorkOS. */
  clientId: string
  /** WorkOS's API key, the client secret. None until the app's owner sets it, and then the service can't finish one. */
  apiKey: string | undefined
  fetch: Fetch
  /** Requests by the address they came from, since nobody is signed in yet. */
  addresses: Limiter
}

/** How long a refused caller is told to wait, in seconds: the limiter's window. */
const wait = 60

const authenticateUrl = "https://api.workos.com/user_management/authenticate"

/**
 * Finishes the sign-in with WorkOS's organization-selection grant. The answer is WorkOS's own, status and body, so the
 * app reads a session or a refusal from it; the tokens in it are the person's and are never kept or logged here.
 */
export async function answerOrganizationChoice(
  options: SignInServiceOptions,
  request: { body: unknown; caller: Caller }
): Promise<Reply<unknown>> {
  const { caller } = request

  if (options.apiKey === undefined) {
    return { status: 503, body: { error: "unavailable", message: "The service can't finish a sign-in yet." } }
  }

  if (caller.address !== undefined && !(await options.addresses.take(caller.address))) {
    return { status: 429, body: { error: "too_many_requests", message: "Too many sign-ins." }, retryAfter: wait }
  }

  const choice = organizationChoice.safeParse(request.body)

  if (!choice.success) {
    return { status: 400, body: { error: "invalid_request", message: "Send a pending token and an organization." } }
  }

  let response: Response

  try {
    response = await options.fetch(authenticateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "urn:workos:oauth:grant-type:organization-selection",
        client_id: options.clientId,
        client_secret: options.apiKey,
        pending_authentication_token: choice.data.pendingToken,
        organization_id: choice.data.organizationId,
        ...(caller.address !== undefined && { ip_address: caller.address })
      })
    })
  } catch {
    return { status: 502, body: { error: "unavailable", message: "WorkOS couldn't be reached." } }
  }

  const answer: unknown = await response.json().catch(() => undefined)

  return answer === undefined
    ? { status: 502, body: { error: "unavailable", message: "WorkOS's answer wasn't JSON." } }
    : { status: response.status, body: answer }
}
