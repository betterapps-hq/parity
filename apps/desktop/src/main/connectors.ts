import { createHash } from "node:crypto"
import {
  type Access,
  type CheckedRequest,
  checkRequest,
  type Connector,
  type Fetch,
  type Found,
  placeableKinds,
  type ProblemAnswer,
  type RecentSearch,
  type SearchAnswer,
  type SearchRequest
} from "@parity-app/connectors"
import type { ConnectorState, KeySource } from "../shared/connectors.ts"
import type { PlacementLog } from "./placements.ts"
import type { SearchHistory } from "./search-history.ts"

export interface ConnectorHubOptions {
  connectors: readonly Connector[]
  /**
   * Keys by connector id, which the app's owner arranges: a development copy sets them in the environment. People never
   * enter one.
   */
  keys: Readonly<Record<string, string>>
  fetch: Fetch
  /** A service that searches some connectors with keys of its own, used for those without a key here. */
  service?: SearchService
  /** Where the person's recent searches are kept. */
  history: SearchHistory
  /** Where placements are counted, as each source's usage. */
  placements: PlacementLog
  /** How long a search may take before it's given up, in milliseconds. Deep searches take several seconds. */
  timeout: number
  /**
   * The share of each source's rate limit this copy uses, from 0 to 1, so a loop in an agent or a window can't spend a
   * source's allowance, or the credits of the plan behind its key, on its own.
   */
  share: number
  /** The keys' values, as Parity starts, to scrub from telemetry. */
  secrets(values: string[]): void
  /** How a search ended, for `connectors.searched`. */
  searched(search: Searched): void
  /** A result placed in a design for the first time, for `connectors.placed`. */
  placed(placed: PlacedEvent): void
  /** Milliseconds from a fixed point, to time searches and keep to the budget. */
  now(): number
  /** Milliseconds since the epoch, for when a recent search was run. */
  date(): number
}

/**
 * A service that runs connectors' searches with keys it holds, so a shipped copy can search a source without a key of
 * its own, as Parity's own service is planned to. It runs the same adapters, so its answers are the same
 * shape, and the hub sends it a search just as it would run one itself.
 */
export interface SearchService {
  /** The connectors it searches, by id. */
  connectors: readonly string[]
  search(connector: string, request: CheckedRequest, signal: AbortSignal): Promise<SearchAnswer>
  /** Does what the source asks when one of its results is placed, and says whether the source took it. */
  placed(found: Found, signal: AbortSignal): Promise<boolean>
}

/** Who asked for a search: the person in the window, or an agent through the service. */
export type SearchedFrom = "window" | "agent"

/** A search as `connectors.searched` records it: its connector and filters and how it ended, never what it searched. */
export interface Searched {
  connector: string
  from: SearchedFrom
  kind: string
  /** Every filter's value it ran with, which are the connector's own, never what was typed. */
  filters?: Record<string, string>
  found?: number
  problem?: string
  ms: number
}

/** A placement as `connectors.placed` records it: its connector, kind and who placed it, never what or where. */
export interface PlacedEvent {
  connector: string
  kind: string
  from: SearchedFrom
}

/**
 * Where a result was placed, and who placed it: the project's folder, the design's file in it and the design's id,
 * which the hub turns into a key holding no path.
 */
export interface PlacedIn {
  project: string
  file: string
  design: string
  from: SearchedFrom
}

export interface ConnectorHub {
  states(): ConnectorState[]
  /** Runs a search on a connector with its key. Never throws: a failure is a problem in the answer. */
  search(connector: string, request: SearchRequest, from: SearchedFrom): Promise<SearchAnswer>
  /**
   * Searches by what's needed rather than by source, as agents do: the connector named, or the first that finds the
   * request's kind, takes every filter it names and has a key, here or with the service. When none has a key, the first
   * that would take it answers why it can't search.
   */
  find(request: SearchRequest, from: SearchedFrom, connector?: string): Promise<SearchAnswer>
  /** The person's recent searches, newest first. */
  recent(): Promise<RecentSearch[]>
  /**
   * This hub's own copy of a result it gave lately, which is what gets placed: the window or an agent names a result,
   * and its image and credit come from here. Undefined for one it didn't give, or gave too long ago.
   */
  result(connector: string, id: string): Found | undefined
  /**
   * A result went into a design. The first time it goes into that design, Parity counts it as the source's usage,
   * records it, and then does what the connector asks, as telling Unsplash. Only a result this hub gave lately, of a
   * kind that can go in designs, counts, so nothing can report uses in Parity's name. Never throws.
   */
  placed(found: Found, where: PlacedIn): Promise<void>
  /**
   * Gives the keys' values to scrub from telemetry, as Parity starts, before anything is sent, then tells sources of
   * placements they didn't take before.
   */
  start(): void
}

/** How many results the hub remembers it gave, for `result` and `placed`. */
const givenLimit = 500

const periods = { minute: 60_000, hour: 3_600_000 } as const

/** The key a placement is counted by: its project, file and design, hashed, so it holds no path. */
function designKey({ project, file, design }: PlacedIn): string {
  return createHash("sha256").update(`${project}\n${file}\n${design}`).digest("hex").slice(0, 32)
}

/**
 * The connectors as main runs them (PAR-829): it holds their keys, and runs every search for the window and for agents,
 * so a key never leaves main. What it talks to is passed in, so it runs in tests without Electron or the network.
 */
export function createConnectorHub(options: ConnectorHubOptions): ConnectorHub {
  const byId = new Map(options.connectors.map((connector) => [connector.info.id, connector]))
  const spent = new Map<string, number[]>()
  const given = new Map<string, Found>()

  const sourceOf = (connector: Connector): KeySource => {
    if (connector.info.auth.type === "none" || options.keys[connector.info.id]) {
      return "here"
    }

    return options.service?.connectors.includes(connector.info.id) ? "service" : "none"
  }

  const unknown = (id: string): ProblemAnswer => ({
    problem: {
      code: "invalid",
      message: `Parity has no connector called ${id}. It has ${options.connectors.map(({ info }) => info.id).join(", ")}.`,
      field: "connector"
    }
  })

  const accessFor = (connector: Connector): Access => {
    const access: Access = { fetch: options.fetch, signal: AbortSignal.timeout(options.timeout) }
    const key = options.keys[connector.info.id]

    if (key) {
      access.key = key
    }

    return access
  }

  /** A problem when the connector has run its budget, counting this search otherwise. */
  const overBudget = (connector: Connector): ProblemAnswer | undefined => {
    const now = options.now()
    const { requests, per } = connector.info.rateLimit
    const period = periods[per]
    const budget = Math.max(1, Math.floor(requests * options.share))
    const recent = (spent.get(connector.info.id) ?? []).filter((at) => now - at < period)

    if (recent.length >= budget) {
      spent.set(connector.info.id, recent)
      const wait = Math.max(1, Math.ceil((period - (now - (recent[0] ?? now))) / 1000))
      const when = wait < 120 ? `${wait} second${wait === 1 ? "" : "s"}` : `${Math.ceil(wait / 60)} minutes`
      const each = per === "hour" ? "an hour" : "a minute"

      return {
        problem: {
          code: "rate-limited",
          message: `Parity runs up to ${budget} ${connector.info.name} searches ${each}. Try again in ${when}.`,
          retryAfter: wait
        }
      }
    }

    spent.set(connector.info.id, [...recent, now])

    return undefined
  }

  const run = async (connector: Connector, request: CheckedRequest): Promise<SearchAnswer> => {
    const limited = overBudget(connector)

    if (limited) {
      return limited
    }

    try {
      return sourceOf(connector) === "service" && options.service
        ? await options.service.search(connector.info.id, request, AbortSignal.timeout(options.timeout))
        : await connector.search(request, accessFor(connector))
    } catch {
      return {
        problem: { code: "unavailable", message: `${connector.info.name} isn't answering right now. Try again.` }
      }
    }
  }

  /** Does what a placed result's source asks, and says whether it took it. Never throws. */
  const tell = async (connector: Connector, placedFound: Found): Promise<boolean> => {
    try {
      if (sourceOf(connector) === "service" && options.service) {
        return await options.service.placed(placedFound, AbortSignal.timeout(options.timeout))
      }

      return connector.placed ? await connector.placed(placedFound, accessFor(connector)) : true
    } catch {
      return false
    }
  }

  /** Tells sources again of placements they didn't take, as after a failed ping or a quit before one. */
  const tellUntold = async () => {
    for (const placement of await options.placements.untold()) {
      const connector = byId.get(placement.found.connector)

      if (connector && (await tell(connector, placement.found))) {
        await options.placements.told(placement)
      }
    }
  }

  const remember = (found: readonly Found[]) => {
    for (const each of found) {
      const id = `${each.connector}:${each.id}`
      given.delete(id)
      given.set(id, each)
    }

    for (const id of given.keys()) {
      if (given.size <= givenLimit) {
        break
      }

      given.delete(id)
    }
  }

  const search: ConnectorHub["search"] = async (id, request, from) => {
    const started = options.now()
    const connector = byId.get(id)
    const checked = connector ? checkRequest(connector.info, request) : unknown(id)
    const sent = connector && "request" in checked ? checked.request : undefined
    let answer: SearchAnswer = "problem" in checked ? checked : unknown(id)

    if (connector && sent) {
      answer = await run(connector, sent)
    }

    // Only a connector Parity has is named, never whatever a caller sent.
    const searched: Searched = {
      connector: connector ? id : "unknown",
      from,
      kind: request.kind,
      ms: options.now() - started
    }

    if (sent && Object.keys(sent.filters).length > 0) {
      searched.filters = sent.filters
    }

    if ("found" in answer) {
      searched.found = answer.found.length
      remember(answer.found)
    } else {
      searched.problem = answer.problem.code
    }

    options.searched(searched)

    if (from === "window" && sent && "found" in answer) {
      const { query, kind, filters } = sent

      // A recent search is a convenience: one that can't be kept doesn't fail the search.
      await options.history.add({ connector: id, kind, query, filters, at: options.date() }).catch(() => undefined)
    }

    return answer
  }

  return {
    states: () => options.connectors.map((connector) => ({ ...connector.info, key: sourceOf(connector) })),
    search,
    async find(request, from, named) {
      if (named) {
        return search(named, request, from)
      }

      const finding = options.connectors.filter(({ info }) => info.finds.includes(request.kind))
      // Ones that take every filter named, so a filter only one source has picks that source.
      const taking = finding.filter((connector) => !("problem" in checkRequest(connector.info, request)))
      const choices = taking.length > 0 ? taking : finding
      const chosen = choices.find((connector) => sourceOf(connector) !== "none") ?? choices[0]

      if (!chosen) {
        return { problem: { code: "invalid", message: `No connector in Parity finds ${request.kind}.`, field: "kind" } }
      }

      return search(chosen.info.id, request, from)
    },
    recent: () => options.history.list().catch(() => []),
    result: (connector, id) => given.get(`${connector}:${id}`),
    async placed(used, where) {
      const connector = byId.get(used.connector)
      const found = given.get(`${used.connector}:${used.id}`)

      if (!connector || !found || !placeableKinds.includes(found.kind)) {
        return
      }

      const placement = { found, design: designKey(where), from: where.from, at: options.date(), told: false }
      // A log that can't be written counts the placement as new, so a source is told rather than left out.
      const fresh = await options.placements.add(placement).catch(() => true)

      if (!fresh) {
        return
      }

      options.placed({ connector: found.connector, kind: found.kind, from: where.from })

      if (await tell(connector, found)) {
        await options.placements.told(placement).catch(() => undefined)
      }
    },
    start() {
      options.secrets(Object.values(options.keys).filter(Boolean))
      // Sources that missed a report hear of it now; one that still doesn't take it hears next time.
      void tellUntold().catch(() => undefined)
    }
  }
}
