import { workosIdentity } from "@better-apps/identity-workos"
import { keysFromEnvironment, offered } from "@parity-app/connectors"
import {
  answerSearch,
  type Caller,
  type Limiter,
  listConnectors,
  type Reply,
  type SearchServiceOptions
} from "@parity-app/service"
import { WorkOS } from "@workos-inc/node"
import { env, type RateLimit } from "cloudflare:workers"

/*
 * The search routes' side of the Worker (PAR-131): it gives `@parity-app/service` Cloudflare's bindings and says who
 * sent a request. Everything that decides an answer is in the package, which is tested without a Worker.
 */

const limiter = (binding: RateLimit): Limiter => ({
  take: async (key) => (await binding.limit({ key })).success
})

const options: SearchServiceOptions = {
  connectors: offered,
  // The sources' keys by their connectors' variables, as a development copy of the app names them.
  keys: keysFromEnvironment({
    PARITY_MOBBIN_API_KEY: env.PARITY_MOBBIN_API_KEY,
    PARITY_PIXABAY_API_KEY: env.PARITY_PIXABAY_API_KEY
  }),
  fetch: (url, init) => fetch(url, init),
  cache: {
    get: (key) => env.SEARCH_CACHE.get(key),
    put: (key, value, seconds) => env.SEARCH_CACHE.put(key, value, { expirationTtl: seconds })
  },
  people: limiter(env.PEOPLE),
  addresses: limiter(env.ADDRESSES),
  sources: limiter(env.SOURCES),
  timeout: 30_000,
  // Workers' logs keep it for the owner. It names the source and the trouble, never a search or a person.
  report: (trouble) => console.error("A source turned Parity's key down", trouble)
}

/**
 * Who a WorkOS access token signs in, through Better Apps' WorkOS identity (PAR-615): it checks the token's signature
 * against WorkOS's published keys, its issuer and its expiry. That needs the client ID, which is public, and no API
 * key. The API takes bearer tokens only, so no cookie is ever unsealed and the cookie password is never used.
 */
const identity = workosIdentity({
  workos: new WorkOS({ clientId: env.WORKOS_CLIENT_ID }),
  cookiePassword: "unused: the API reads bearer tokens only"
})

/**
 * Who sent a request: the person its bearer token signs in, when it checks out, and the address Cloudflare saw. Throws
 * when WorkOS's keys can't be read, which isn't the caller's doing.
 */
async function callerOf(request: Request): Promise<Caller> {
  const authorization = request.headers.get("Authorization")
  const address = request.headers.get("CF-Connecting-IP")

  // Only the token is passed on, so a cookie sent along is never read in its place.
  const actor = authorization
    ? await identity.getActor(new Request(request.url, { headers: { Authorization: authorization } }))
    : null

  return { ...(actor && { person: actor.userId }), ...(address && { address }) }
}

function send<Body>(reply: Reply<Body>): Response {
  return Response.json(reply.body, {
    status: reply.status,
    headers: reply.retryAfter === undefined ? {} : { "Retry-After": String(reply.retryAfter) }
  })
}

/** `GET /v1/connectors`: the connectors the service searches. */
export function connectorsResponse(): Response {
  return send(listConnectors(options))
}

/** `POST /v1/connectors/{id}/search`: a signed-in person's search, or why it wasn't run. */
export async function searchResponse(request: Request, connector: string): Promise<Response> {
  let caller: Caller

  try {
    caller = await callerOf(request)
  } catch (error) {
    console.error("Parity couldn't check an access token", error)

    return send({
      status: 503,
      body: { problem: { code: "unavailable", message: "Parity couldn't check who's signed in. Try again." } }
    })
  }

  // A body that isn't JSON is a search the package refuses, naming what's wrong.
  const body: unknown = await request.json().catch(() => undefined)

  return send(await answerSearch(options, { connector, body, caller }))
}
