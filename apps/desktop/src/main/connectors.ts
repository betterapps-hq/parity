import type {
  Access,
  Connector,
  Fetch,
  Found,
  ProblemAnswer,
  SearchAnswer,
  SearchRequest
} from "@parity-app/connectors"
import type { ConnectorState, KeySource, SetKeyAnswer } from "../shared/connectors.ts"
import type { KeyStore } from "./connector-keys.ts"

export interface ConnectorHubOptions {
  connectors: readonly Connector[]
  keys: KeyStore
  /** Keys set in the environment, by connector id, which win over saved ones, as in a development copy. */
  environment: Readonly<Record<string, string | undefined>>
  fetch: Fetch
  /** How long a search may take before it's given up, in milliseconds. Deep searches take several seconds. */
  timeout: number
  /** Tells the windows what changed. */
  changed(states: ConnectorState[]): void
  /** Every key's value, whenever they change, to scrub from telemetry. */
  secrets(values: string[]): void
  /** How a search ended, for `connectors.searched`. */
  searched(search: Searched): void
  /** Milliseconds from a fixed point, to time searches. */
  now(): number
}

/** Who asked for a search: the person in the window, or an agent through the service. */
export type SearchedFrom = "window" | "agent"

/** A search as `connectors.searched` records it: its connector and filters and how it ended, never what it searched. */
export interface Searched {
  connector: string
  from: SearchedFrom
  kind: string
  platform?: string
  depth?: string
  found?: number
  problem?: string
  ms: number
}

export interface ConnectorHub {
  states(): Promise<ConnectorState[]>
  /** Runs a search on a connector with its key. Never throws: a failure is a problem in the answer. */
  search(connector: string, request: SearchRequest, from: SearchedFrom): Promise<SearchAnswer>
  /**
   * Checks a key with the connector's smallest search, then keeps it. A key the source turns down, or whose plan
   * doesn't include searching, isn't kept. One that couldn't be checked, as when the source didn't answer, is kept,
   * with why.
   */
  setKey(connector: string, key: string): Promise<SetKeyAnswer>
  clearKey(connector: string): Promise<void>
  /** Tells the source someone picked a result, for a connector whose terms ask for it. */
  picked(found: Found): Promise<void>
  /** Reads the keys as Parity starts, so their values are scrubbed from telemetry before anything is sent. */
  start(): Promise<void>
}

/**
 * The connectors as main runs them (PAR-829): it holds their keys, and runs every search for the window and for agents,
 * so a key never leaves main. What it talks to is passed in, so it runs in tests without Electron or the network.
 */
export function createConnectorHub(options: ConnectorHubOptions): ConnectorHub {
  const byId = new Map(options.connectors.map((connector) => [connector.info.id, connector]))

  const keyOf = async (id: string): Promise<{ key?: string; source: KeySource }> => {
    const fromEnvironment = options.environment[id]

    if (fromEnvironment) {
      return { key: fromEnvironment, source: "environment" }
    }

    const kept = (await options.keys.read())[id]

    return kept ?? { source: "none" }
  }

  const states = async () =>
    Promise.all(options.connectors.map(async ({ info }) => ({ ...info, key: (await keyOf(info.id)).source })))

  const announce = async () => {
    const kept = await options.keys.read()
    const values = [...Object.values(kept).map(({ key }) => key), ...Object.values(options.environment)]
    options.secrets(values.filter((value): value is string => !!value))
    options.changed(await states())
  }

  const unknown = (id: string): ProblemAnswer => ({
    problem: {
      code: "invalid",
      message: `Parity has no connector called ${id}. It has ${options.connectors.map(({ info }) => info.id).join(", ")}.`,
      field: "connector"
    }
  })

  const accessWith = (key: string | undefined): Access => {
    const access: Access = { fetch: options.fetch, signal: AbortSignal.timeout(options.timeout) }

    if (key) {
      access.key = key
    }

    return access
  }

  const run = async (connector: Connector, request: SearchRequest, key: string | undefined) =>
    connector.search(request, accessWith(key))

  return {
    states,
    async search(id, request, from) {
      const started = options.now()
      const connector = byId.get(id)
      const answer = connector ? await run(connector, request, (await keyOf(id)).key) : unknown(id)

      const searched: Searched = { connector: id, from, kind: request.kind, ms: options.now() - started }

      if (request.platform) {
        searched.platform = request.platform
      }

      if (request.depth) {
        searched.depth = request.depth
      }

      if ("found" in answer) {
        searched.found = answer.found.length
      } else {
        searched.problem = answer.problem.code
      }

      options.searched(searched)

      return answer
    },
    async setKey(id, key) {
      const connector = byId.get(id)

      if (!connector) {
        return unknown(id)
      }

      const probed = await run(connector, connector.probe, key)

      if ("problem" in probed && (probed.problem.code === "key-refused" || probed.problem.code === "no-access")) {
        return probed
      }

      const source = await options.keys.set(id, key)
      await announce()

      // The environment's key still wins, so the window says so rather than that the new one is used.
      const used = options.environment[id] ? "environment" : source

      return "problem" in probed ? { key: used, problem: probed.problem } : { key: used }
    },
    async clearKey(id) {
      await options.keys.clear(id)
      await announce()
    },
    async picked(found) {
      const connector = byId.get(found.connector)

      if (!connector?.picked) {
        return
      }

      const { key } = await keyOf(connector.info.id)
      await connector.picked(found, accessWith(key))
    },
    start: announce
  }
}
