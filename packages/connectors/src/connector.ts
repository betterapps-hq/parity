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

/** How a connector gives more results for the same search: by leaving out ids already shown, or by page. */
export type MoreResults = "exclude" | "page"

/** The longest search any connector takes, which is Mobbin's. */
export const queryLimit = 500

/** A filter's id, as a search names it: `platform`, `color`. */
const filterId = z.string().regex(/^[a-z][a-zA-Z]*$/, "expected a filter's id, such as platform")

/** A search, as the window and agents send it. Each connector checks it against what it says it takes. */
export const searchRequest = z.strictObject({
  /** What to find, in plain words: one screen, flow, section or photo per search. */
  query: z.string().trim().min(1, "Type what to find").max(queryLimit, `Searches can be up to ${queryLimit} letters`),
  kind: findKind,
  /** How many to return, up to the connector's limit. Its own default without one. */
  limit: z.int().min(1).optional(),
  /**
   * A value for each of the connector's filters, by the filter's id, as `{ platform: "ios" }`. A filter left out takes
   * the connector's default, or means any value when it has none.
   */
  filters: z.record(filterId, z.string().min(1)).optional(),
  /** Results already shown, left out, so the same search brings new ones, for a connector that pages by `exclude`. */
  exclude: z.array(z.string().min(1)).max(100).optional(),
  /** The page of results, from 1, for a connector that pages by `page`. */
  page: z.int().min(1).optional()
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
  /** The search isn't one the connector takes: a kind, filter or limit it doesn't have, or a malformed field. */
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
 * How many more searches the source allows before it turns them away, when it says, so the window and agents can slow
 * down first. Unsplash says on every answer; Mobbin only says once it's too late, with a 429.
 */
export const allowance = z.strictObject({
  remaining: z.int().nonnegative(),
  /** How many it allows in all, in the source's window: an hour for Unsplash. */
  limit: z.int().positive().optional()
})

export type Allowance = z.infer<typeof allowance>

/**
 * A search's answer: what it found, or why it found nothing to show. A failure is data rather than a thrown error, so
 * it reaches the window and agents whole across IPC and the service's channel.
 */
export const searchAnswer = z.union([
  z.strictObject({ found: z.array(found), allowance: allowance.optional() }),
  z.strictObject({ problem })
])

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
  /** Its mark, which the window shows beside its name wherever it credits the source. */
  mark: Mark
  /** How to search it well, which the window shows before a search. */
  guide: Guide
  /** What it finds, the first being what it searches for when none is named. */
  finds: readonly [FindKind, ...FindKind[]]
  /** The filters it takes, in the order the window shows them. A search can only name these. */
  filters: readonly Filter[]
  /** How many results it returns by default, and at most. */
  limit: { default: number; max: number }
  /** How it gives more results for the same search. */
  more: MoreResults
  /** The key it needs, for a connector that needs one. */
  apiKey?: ApiKey
}

/**
 * A source's mark as it publishes it, in one color, so the window can draw it in the color of the text beside it: the
 * path's `d`, and the box it's drawn in, as an SVG `viewBox`.
 */
export interface Mark {
  box: string
  path: string
}

/** How a source's search likes things described, in the source's own guidance, for people and agents. */
export interface Guide {
  /** Searches that show how to describe something, which the window offers to run. The first is its example. */
  examples: readonly [string, ...string[]]
  /** What to know before searching, a sentence each. */
  tips: readonly string[]
}

/**
 * One way a connector narrows a search, as data, so the window can draw its control and `checkRequest` can check it
 * without code for each filter: Mobbin's platform and depth, Unsplash's orientation and color.
 */
export interface Filter {
  /** What a search names it by: `platform`. */
  id: string
  /** Its name, for people: "Platform". */
  name: string
  /** The values it takes, in the order the window lists them. */
  values: readonly [FilterValue, ...FilterValue[]]
  /** The value a search left without one gets. Without a default, leaving it out means any value. */
  default?: string
}

export interface FilterValue {
  /** What a search sends and the source takes: `ios`. */
  id: string
  /** Its name, for people: "iOS". */
  name: string
  /** A color to show beside its name, for a value that is one, as CSS: `black`, or a gradient for two. */
  swatch?: string
}

/** A connector's key: what the source calls it, where people get one, and the variable a development copy sets. */
export interface ApiKey {
  /** What the source calls it, in a sentence: "API key", "Access Key". */
  name: string
  /** The page where people get one. */
  page: string
  /**
   * The environment variable a development copy sets it with, as `PARITY_MOBBIN_API_KEY`. Main reads it and keeps it
   * from the processes it starts, and `pnpm dev` passes it on from `.env.local`.
   */
  variable: string
}

export interface Connector {
  info: ConnectorInfo
  /** Searches the source. Never throws: a failure is a problem in the answer. */
  search(request: SearchRequest, access: Access): Promise<SearchAnswer>
  /**
   * The cheapest search that tells whether a key works, which setting a key runs before keeping it. It returns one
   * result at most, with the filters' defaults.
   */
  probe: SearchRequest
  /**
   * Tells the source someone picked a result, for a source whose terms ask for it, as Unsplash's do for each photo
   * used. Never throws.
   */
  picked?(found: Found, access: Access): Promise<void>
}

/** A search checked against its connector, with its limit and each filter's default filled in. */
export type CheckedRequest = SearchRequest & { limit: number; filters: Record<string, string> }

/**
 * Checks a search against what a connector says it takes, before it's sent: a problem naming the field at fault, or
 * the search with the connector's defaults filled in.
 */
export function checkRequest(info: ConnectorInfo, request: SearchRequest): ProblemAnswer | { request: CheckedRequest } {
  const invalid = (field: string, message: string): ProblemAnswer => ({ problem: { code: "invalid", message, field } })

  if (!info.finds.includes(request.kind)) {
    return invalid("kind", `${info.name} finds ${listed(info.finds)} only.`)
  }

  if (request.limit !== undefined && request.limit > info.limit.max) {
    return invalid("limit", `${info.name} returns up to ${info.limit.max} results a search.`)
  }

  if (request.exclude?.length && info.more !== "exclude") {
    return invalid("exclude", `${info.name} gives more results by page. Ask for the next page instead.`)
  }

  if (request.page !== undefined && info.more !== "page") {
    return invalid("page", `${info.name} gives more results by leaving out what's shown. Pass exclude instead.`)
  }

  const filters: Record<string, string> = {}

  for (const [id, value] of Object.entries(request.filters ?? {})) {
    const filter = info.filters.find((each) => each.id === id)

    if (!filter) {
      const named = info.filters.map((each) => each.id)
      const takes = named.length > 0 ? `It filters by ${listed(named)}.` : "It takes no filters."

      return invalid(`filters.${id}`, `${info.name} doesn't filter by ${id}. ${takes}`)
    }

    if (!filter.values.some((each) => each.id === value)) {
      return invalid(
        `filters.${id}`,
        `${info.name}'s ${id} can be ${listed(
          filter.values.map((each) => each.id),
          "or"
        )}.`
      )
    }

    filters[id] = value
  }

  for (const filter of info.filters) {
    if (filters[filter.id] === undefined && filter.default !== undefined) {
      filters[filter.id] = filter.default
    }
  }

  return { request: { ...request, limit: request.limit ?? info.limit.default, filters } }
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
