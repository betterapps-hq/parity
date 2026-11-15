import { answerOrganizationChoice, type Limiter } from "@parity-app/service"
import { env, type RateLimit } from "cloudflare:workers"

/*
 * The sign-in route's side of the Worker (PAR-1143): it gives `@parity-app/service` WorkOS's API key and the address
 * Cloudflare saw. Everything that decides an answer is in the package.
 */

const limiter = (binding: RateLimit): Limiter => ({
  take: async (key) => (await binding.limit({ key })).success
})

/** `POST /v1/sign-in/organization`: finishes a sign-in once the person chose an organization. */
export async function organizationChoiceResponse(request: Request): Promise<Response> {
  const address = request.headers.get("CF-Connecting-IP")
  const body: unknown = await request.json().catch(() => undefined)

  const reply = await answerOrganizationChoice(
    {
      clientId: env.WORKOS_CLIENT_ID,
      apiKey: env.WORKOS_API_KEY,
      fetch: (url, init) => fetch(url, init),
      addresses: limiter(env.ADDRESSES)
    },
    { body, caller: address ? { address } : {} }
  )

  // The answer carries the person's tokens, so nothing on the way keeps it.
  const headers = new Headers({ "Cache-Control": "no-store" })

  if (reply.retryAfter !== undefined) {
    headers.set("Retry-After", String(reply.retryAfter))
  }

  return Response.json(reply.body, { status: reply.status, headers })
}
