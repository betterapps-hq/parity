import { z } from "zod"

/*
 * A connector talks to an outside service that finds things to bring into Parity: design references from Mobbin now,
 * stock photos from Unsplash next (docs/proposals/extensions.md, "Connector"). Each one says what it finds and which
 * filters it takes, and turns a search into the same results and the same problems, so the app, its window and agents
 * handle every source one way. Connectors take data and return data: `fetch` and the key come in, and nothing here
 * keeps state, touches Electron or reads the environment.
 */

/** What a connector finds: a screen of an app, a multi-step flow, a section of a website, or a photo. */
export const findKind = z.enum(["screens", "flows", "sections", "photos"])

export type FindKind = z.infer<typeof findKind>

/** The platform a screen or flow is from. */
export const platform = z.enum(["ios", "web"])

export type Platform = z.infer<typeof platform>

/**
 * How hard the source looks. Standard answers quickly; deep has the source read the search's intent and keep the strong
 * matches, so it can return fewer than asked for, and may count against an allowance (Mobbin's AI credits).
 */
export const searchDepth = z.enum(["standard", "deep"])

export type SearchDepth = z.infer<typeof searchDepth>

/** The longest search any connector takes, which is Mobbin's. */
export const queryLimit = 500

/** A search, as the window and agents send it. Each connector checks it against what it says it takes. */
export const searchRequest = z.strictObject({
  /** What to find, in plain words: one screen, flow, section or photo per search. */
  query: z.string().trim().min(1, "Type what to find").max(queryLimit, `Searches can be up to ${queryLimit} letters`),
  kind: findKind,
  /** Needed when the connector names platforms. */
  platform: platform.optional(),
  /** How many to return, up to the connector's limit. Its own default without one. */
  limit: z.int().min(1).optional(),
  /** The connector's own default without one. */
  depth: searchDepth.optional(),
  /** Results already shown, left out, so the same search brings new ones. */
  exclude: z.array(z.string().min(1)).max(100).optional()
})

export type SearchRequest = z.infer<typeof searchRequest>

/** A picture of a result, which loads from the source. */
export const foundImage = z.strictObject({
  url: z.url(),
  /** Its size in pixels, when the source knows it. */
  width: z.int().positive().optional(),
  height: z.int().positive().optional(),
  /** When `url` stops working, in milliseconds since the epoch, after which a fresh search gives a new one. */
  expiresAt: z.number().optional()
})

export type FoundImage = z.infer<typeof foundImage>

/** Who to credit, in order: the app or photographer first, then the source. */
export const credit = z.strictObject({ name: z.string().min(1), url: z.url().optional() })

export type Credit = z.infer<typeof credit>

/** One result, the same shape from every connector. */
export const found = z.strictObject({
  /** The connector's id. */
  connector: z.string().min(1),
  /** The source's own id for it, which `exclude` takes. */
  id: z.string().min(1),
  kind: findKind,
  /** What it is, for people: the app's name, or what a photo shows. */
  title: z.string(),
  platform: platform.optional(),
  image: foundImage,
  /** Its page at the source. */
  link: z.url(),
  credit: z.array(credit)
})

export type Found = z.infer<typeof found>

/**
 * Why a search found nothing to show. Each code says what the person or agent can do: set a key, change plans, wait,
 * change the search, or try again later.
 */
export const problemCode = z.enum([
  /** No key is set for a connector that needs one. */
  "no-key",
  /** The source turned the key down: it's wrong, revoked, or for another service. */
  "key-refused",
  /** The key works, but its plan doesn't include this. */
  "no-access",
  /** Too many searches for now; `retryAfter` says how long to wait. */
  "rate-limited",
  /** The search isn't one the connector takes: a kind, platform or limit it doesn't have, or a malformed field. */
  "invalid",
  /** The source didn't answer, or answered with something Parity couldn't read. Trying again may work. */
  "unavailable"
])

export type ProblemCode = z.infer<typeof problemCode>

export const problem = z.strictObject({
  code: problemCode,
  /** What happened and what to do, in a sentence or two, for people and agents. */
  message: z.string().min(1),
  /** Seconds to wait before searching again, when the source says. */
  retryAfter: z.number().nonnegative().optional(),
  /** The request field at fault, for `invalid`. */
  field: z.string().optional()
})

export type Problem = z.infer<typeof problem>

/**
 * A search's answer: what it found, or why it found nothing to show. A failure is data rather than a thrown error, so
 * it reaches the window and agents whole across IPC and the service's channel.
 */
export const searchAnswer = z.union([z.strictObject({ found: z.array(found) }), z.strictObject({ problem })])

export type SearchAnswer = z.infer<typeof searchAnswer>

/** An answer that found nothing to show, and why. */
export interface ProblemAnswer {
  problem: Problem
}

/** `fetch`, as main passes it in: Electron's `net.fetch`, or a stand-in in tests. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>

/** What a connector reaches the source with. */
export interface Access {
  fetch: Fetch
  /** The key, for a connector that needs one. */
  key?: string
  /** Stops the request, as when it takes too long. */
  signal?: AbortSignal
}

/** What a connector says about itself, which the window shows and checks a search against. */
export interface ConnectorInfo {
  /** Its id, which requests name it by: lower case, as `mobbin`. */
  id: string
  /** Its name, for people. */
  name: string
  /** The source's site. */
  site: string
  /** What it finds, the first being what it searches for when none is named. */
  finds: readonly [FindKind, ...FindKind[]]
  /** The platforms it searches, when it asks for one. */
  platforms?: readonly [Platform, ...Platform[]]
  /** The depths it takes, the first being its default. */
  depths: readonly [SearchDepth, ...SearchDepth[]]
  /** How many results it returns by default, and at most. */
  limit: { default: number; max: number }
  /** The page where people get a key, for a connector that needs one. */
  keyPage?: string
}

export interface Connector {
  info: ConnectorInfo
  /** Searches the source. Never throws: a failure is a problem in the answer. */
  search(request: SearchRequest, access: Access): Promise<SearchAnswer>
  /**
   * The cheapest search that tells whether a key works, which setting a key runs before keeping it. It returns one
   * result at most, at the standard depth.
   */
  probe: SearchRequest
  /**
   * Tells the source someone picked a result, for a source whose terms ask for it, as Unsplash's do for each photo
   * used. Never throws.
   */
  picked?(found: Found, access: Access): Promise<void>
}

/** A search checked against its connector, with its limit and depth filled in. */
export type CheckedRequest = SearchRequest & Required<Pick<SearchRequest, "limit" | "depth">>

/**
 * Checks a search against what a connector says it takes, before it's sent: a problem naming the field at fault, or
 * the search with the connector's defaults filled in.
 */
export function checkRequest(info: ConnectorInfo, request: SearchRequest): ProblemAnswer | { request: CheckedRequest } {
  const invalid = (field: string, message: string): ProblemAnswer => ({ problem: { code: "invalid", message, field } })

  if (!info.finds.includes(request.kind)) {
    return invalid("kind", `${info.name} finds ${listed(info.finds)} only.`)
  }

  if (info.platforms && !request.platform) {
    return invalid("platform", `Say which platform to search on ${info.name}: ${listed(info.platforms, "or")}.`)
  }

  if (info.platforms && request.platform && !info.platforms.includes(request.platform)) {
    return invalid("platform", `${info.name} searches ${listed(info.platforms, "and")} only.`)
  }

  if (!info.platforms && request.platform) {
    return invalid("platform", `${info.name} doesn't search by platform.`)
  }

  if (request.limit !== undefined && request.limit > info.limit.max) {
    return invalid("limit", `${info.name} returns up to ${info.limit.max} results a search.`)
  }

  if (request.depth && !info.depths.includes(request.depth)) {
    return invalid("depth", `${info.name} searches at ${listed(info.depths, "or")} depth only.`)
  }

  return {
    request: { ...request, limit: request.limit ?? info.limit.default, depth: request.depth ?? info.depths[0] }
  }
}

/** Words as a list in a sentence: "screens", "screens and flows", "screens, flows and sections". */
function listed(words: readonly string[], joiner = "and"): string {
  if (words.length < 2) {
    return words.join("")
  }

  return `${words.slice(0, -1).join(", ")} ${joiner} ${words.at(-1)}`
}

/**
 * How long a source asks to wait, from a `Retry-After` header: seconds, or an HTTP date. Undefined when it doesn't say
 * or says something Parity can't read.
 */
export function retryAfter(header: string | null, now: number): number | undefined {
  if (header === null || header.trim() === "") {
    return undefined
  }

  if (/^\d+$/.test(header.trim())) {
    return Number(header.trim())
  }

  const date = Date.parse(header)

  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000))
}
