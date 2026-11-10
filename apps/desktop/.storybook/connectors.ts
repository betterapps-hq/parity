import type { IncomingMessage } from "node:http"
import { resolve } from "node:path"
import { connectors, keysFromEnvironment, type SearchAnswer } from "@parity-app/connectors"
import { loadEnv, type Plugin } from "vite"
import { connectorSearch } from "../src/shared/connectors.ts"

/** Where `.env.local` is, with the keys a development copy uses. */
const app = resolve(import.meta.dirname, "..")

/** How long a search may take before it's given up, in milliseconds, as in main. Deep searches take several seconds. */
const timeout = 30_000

/**
 * Runs the connectors for stories, as main does for the window (PAR-827): `storybook dev` searches Mobbin and Unsplash
 * with the keys in `.env.local`, so a story shows real results and a key never reaches the page. A built Storybook has
 * no server, so its stories find every connector without a key.
 *
 * `/__connectors/keys` lists the connectors with a key, and `/__connectors/search` runs a search. Both take JSON only,
 * which a page on another site can't send here without this server's say-so, so nothing else can spend the keys.
 */
export function storyConnectors(): Plugin {
  return {
    name: "parity:story-connectors",
    configureServer(server) {
      const keys = keysFromEnvironment({ ...loadEnv(server.config.mode, app, "PARITY_"), ...process.env })

      server.middlewares.use("/__connectors", (request, response, next) => {
        const send = (body: string[] | SearchAnswer) => {
          response.setHeader("content-type", "application/json")
          response.end(JSON.stringify(body))
        }

        if (request.method === "GET" && request.url === "/keys") {
          send(Object.keys(keys))
        } else if (request.method === "POST" && request.url === "/search" && sendsJson(request)) {
          void search(request, keys).then(send)
        } else {
          next()
        }
      })
    }
  }
}

function sendsJson(request: IncomingMessage): boolean {
  return request.headers["content-type"]?.startsWith("application/json") ?? false
}

async function search(request: IncomingMessage, keys: Record<string, string>): Promise<SearchAnswer> {
  const asked = searchIn(await bodyOf(request))

  if (!asked?.success) {
    return { problem: { code: "invalid", message: asked?.error.issues[0]?.message ?? "That isn't a search." } }
  }

  const connector = connectors.find(({ info }) => info.id === asked.data.connector)

  if (!connector) {
    return { problem: { code: "invalid", message: `Parity has no connector called ${asked.data.connector}.` } }
  }

  const key = keys[connector.info.id]

  if (connector.info.auth.type === "key" && !key) {
    return {
      problem: {
        code: "no-key",
        message: `Set ${connector.info.auth.variable} in apps/desktop/.env.local, then start Storybook again.`
      }
    }
  }

  return connector.search(asked.data.request, { fetch, key, signal: AbortSignal.timeout(timeout) })
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString("utf8")
}

/** The search a request's body asks for, checked, or nothing when the body isn't JSON. */
function searchIn(body: string) {
  try {
    return connectorSearch.safeParse(JSON.parse(body))
  } catch {
    return undefined
  }
}
