import { type Fetch, type SearchAnswer, searchAnswer } from "@parity-app/connectors"
import { routes, searchedConnectors } from "@parity-app/service"
import type { SearchService } from "./connectors.ts"

export interface RemoteSearchOptions {
  /** Where Parity's service is, without a path, as `https://api.tryparity.dev`. */
  address: string
  fetch: Fetch
  /**
   * The signed-in person's access token, refreshed first when `renew` is set. None when nobody is signed in, or WorkOS
   * can't be reached.
   */
  token(renew?: boolean): Promise<string | undefined>
}

/** Parity's service, as the hub searches through it, and how main learns which connectors it searches. */
export interface RemoteSearch extends SearchService {
  /** Asks the service which connectors it searches. One that can't be asked searches none until it's asked again. */
  load(): Promise<void>
}

const signedOut: SearchAnswer = { problem: { code: "signed-out", message: "Sign in to Parity to search." } }

const unavailable: SearchAnswer = {
  problem: { code: "unavailable", message: "Parity's service isn't answering right now. Try again." }
}

/**
 * Parity's own service as a `SearchService` (PAR-948): it holds the sources' keys, so an installed copy, which has
 * none, searches through it as the signed-in person. Signed out, it answers `signed-out` without asking. What it talks
 * to is passed in, so it runs in tests without Electron or the network.
 */
export function createRemoteSearch(options: RemoteSearchOptions): RemoteSearch {
  const connectors: string[] = []

  const post = (connector: string, body: string, token: string, signal: AbortSignal) =>
    options.fetch(options.address + routes.search(connector), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
      signal
    })

  return {
    connectors,

    async load() {
      try {
        const response = await options.fetch(options.address + routes.connectors, {
          signal: AbortSignal.timeout(10_000)
        })

        const listed = searchedConnectors.safeParse(await response.json())

        if (response.ok && listed.success) {
          connectors.splice(0, connectors.length, ...listed.data.connectors)
        }
      } catch {
        // Offline, or the service is down: what it searched before still stands, and it's asked again later.
      }
    },

    async search(connector, request, signal) {
      const token = await options.token()

      if (!token) {
        return signedOut
      }

      const body = JSON.stringify(request)
      let response = await post(connector, body, token, signal)

      if (response.status === 401) {
        // The token ran out on its way, or WorkOS replaced it: a fresh one gets one more try.
        const renewed = await options.token(true)

        if (!renewed) {
          return signedOut
        }

        response = await post(connector, body, renewed, signal)
      }

      // Every answer the service gives is a `SearchAnswer`, whatever its status. Anything else isn't from it.
      const answer = searchAnswer.safeParse(await response.json().catch(() => undefined))

      return answer.success ? answer.data : unavailable
    },

    // Neither source the service searches asks to be told of a placement, so there's nothing to send yet.
    placed: async () => true
  }
}
