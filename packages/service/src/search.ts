import {
  type CheckedRequest,
  checkRequest,
  type Connector,
  type Fetch,
  found,
  type Found,
  type Problem,
  type SearchAnswer,
  searchRequest
} from "@parity-app/connectors"
import { z } from "zod"
import type { SearchedConnectors } from "./wire.ts"

/*
 * Parity's service searching for the app (PAR-131, docs/proposals/service.md): it holds the app owner's keys, runs the
 * same adapters as the app, keeps each answer for a day for everyone, and limits each person and each source. It takes
 * data and returns data, and what it talks to is passed in, so it runs in tests without a Worker or the network.
 */

/** Where answers are kept, as text under a key: Workers KV, or a stand-in in tests. */
export interface SearchCache {
  get(key: string): Promise<string | null>
  /** Keeps `value` for `seconds`. */
  put(key: string, value: string, seconds: number): Promise<void>
}

/** Counts uses of a key over a short window, and says whether this one is within the limit. */
export interface Limiter {
  take(key: string): Promise<boolean>
}

export interface SearchServiceOptions {
  connectors: readonly Connector[]
  /** The app owner's keys, by connector id. A connector that needs one and has none isn't searched. */
  keys: Readonly<Record<string, string | undefined>>
  fetch: Fetch
  cache: SearchCache
  /** Each signed-in person's searches, by their user id. */
  people: Limiter
  /** Requests that name nobody, by the address they came from. */
  addresses: Limiter
  /** Each source's searches, by connector id, kept under what the source allows its key. */
  sources: Limiter
  /** How long a search may take before it's given up, in milliseconds. */
  timeout: number
  /** A key or plan the source turned down, which only the app's owner can fix. Never what was searched. */
  report(trouble: { connector: string; code: Problem["code"] }): void
}

/** Who sent a request: the signed-in person's user id, when its token checked out, and its address. */
export interface Caller {
  person?: string
  address?: string
}

/** An answer to send: its HTTP status, its body, and how long to wait before asking again, in seconds. */
export interface Reply<Body> {
  status: number
  body: Body
  retryAfter?: number
}

/** How long an answer is kept, in seconds: the day Pixabay's terms ask for. */
export const keptFor = 24 * 60 * 60

/** How long a limiter's window lasts, in seconds, which is what a refused caller is told to wait. */
const wait = 60

/** Problems only the app's owner can fix. The app hears the source is unavailable, and the owner hears which. */
const ownersToFix: readonly Problem["code"][] = ["no-key", "key-refused", "no-access"]

const kept = z.array(found)

const refuse = (
  status: number,
  code: Problem["code"],
  message: string,
  more: Partial<Problem> = {}
): Reply<SearchAnswer> => ({
  status,
  body: { problem: { code, message, ...more } },
  ...(more.retryAfter !== undefined && { retryAfter: more.retryAfter })
})

/** Whether the service can search a connector: it needs no key, or the service has its key. */
const searchable = (options: SearchServiceOptions, connector: Connector) =>
  connector.info.auth.type === "none" || !!options.keys[connector.info.id]

/** The connectors the service searches, for the app to know which searches to send it. */
export function listConnectors(options: SearchServiceOptions): Reply<SearchedConnectors> {
  return {
    status: 200,
    body: { connectors: options.connectors.filter((each) => searchable(options, each)).map(({ info }) => info.id) }
  }
}

/**
 * The key an answer is kept under: a hash of the connector and the search as checked, with its defaults filled in, so
 * two people asking the same thing share one answer, and nothing kept says what was searched or by whom.
 */
export async function cacheKey(connector: string, request: CheckedRequest): Promise<string> {
  const filters = Object.fromEntries(Object.entries(request.filters).toSorted(([a], [b]) => a.localeCompare(b)))

  const search = JSON.stringify([
    connector,
    request.kind,
    request.query,
    request.limit,
    filters,
    request.exclude?.toSorted() ?? [],
    request.page ?? 1
  ])

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(search))

  return `search:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

/** What was kept under a key, when it's still there and still reads as results. */
async function read(cache: SearchCache, key: string): Promise<Found[] | undefined> {
  try {
    const text = await cache.get(key)
    const parsed = text === null ? undefined : kept.safeParse(JSON.parse(text))

    return parsed?.success ? parsed.data : undefined
  } catch {
    // A cache that can't be read, or holds something else, is a search to run again.
    return undefined
  }
}

/**
 * Runs a search for a signed-in person, or says why not. Never throws: every outcome is a reply with a `SearchAnswer`,
 * so the app reads the service's answers as it reads its own.
 */
export async function answerSearch(
  options: SearchServiceOptions,
  search: { connector: string; body: unknown; caller: Caller }
): Promise<Reply<SearchAnswer>> {
  const { caller } = search

  if (caller.person === undefined) {
    if (caller.address !== undefined && !(await options.addresses.take(caller.address))) {
      return refuse(429, "rate-limited", "Too many requests. Try again in a minute.", { retryAfter: wait })
    }

    return refuse(401, "signed-out", "Sign in to Parity to search.")
  }

  if (!(await options.people.take(caller.person))) {
    return refuse(429, "rate-limited", "You've run a lot of searches in the last minute. Try again in a minute.", {
      retryAfter: wait
    })
  }

  const connector = options.connectors.find(({ info }) => info.id === search.connector)

  if (!connector || !searchable(options, connector)) {
    return refuse(404, "no-key", "Parity's service doesn't search that source. Carry on without it.")
  }

  const { name, id } = connector.info
  const body = searchRequest.safeParse(search.body)

  if (!body.success) {
    const issue = body.error.issues[0]
    const field = issue?.path.join(".")

    return refuse(400, "invalid", issue?.message ?? "That isn't a search.", field ? { field } : {})
  }

  const checked = checkRequest(connector.info, body.data)

  if ("problem" in checked) {
    return { status: 400, body: checked }
  }

  const key = await cacheKey(id, checked.request)
  const before = await read(options.cache, key)

  if (before) {
    return { status: 200, body: { found: before } }
  }

  if (!(await options.sources.take(id))) {
    return refuse(
      429,
      "rate-limited",
      `Parity is searching ${name} as often as ${name} allows. Try again in a minute.`,
      {
        retryAfter: wait
      }
    )
  }

  let answer: SearchAnswer

  try {
    const access = { fetch: options.fetch, signal: AbortSignal.timeout(options.timeout) }
    const sourceKey = options.keys[id]

    answer = await connector.search(checked.request, sourceKey ? { ...access, key: sourceKey } : access)
  } catch {
    return refuse(503, "unavailable", `${name} isn't answering right now. Try again.`)
  }

  if ("problem" in answer) {
    if (ownersToFix.includes(answer.problem.code)) {
      options.report({ connector: id, code: answer.problem.code })

      return refuse(503, "unavailable", `${name} isn't available right now.`)
    }

    return { status: 200, body: answer }
  }

  // How many searches the key has left is the service's to mind, not one person's, so it isn't passed on or kept.
  const results = { found: answer.found }

  // An answer that can't be kept is still an answer.
  await options.cache.put(key, JSON.stringify(results.found), keptFor).catch(() => undefined)

  return { status: 200, body: results }
}
