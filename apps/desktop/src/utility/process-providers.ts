import type { Address, DiscoveredServer, ServerFacts } from "@parity-app/extension-api"
import {
  discoveredServers,
  type ExtensionProviders,
  type ProcessProviderKind,
  type ProviderAsk,
  providedAddresses,
  type RegisteredProvider
} from "@parity-app/extensions"
import { addressRefusal, isLocalHost, opensAt } from "@parity-app/processes"
import { listedId } from "../shared/process-ids.ts"
import type { ProjectProcess } from "../shared/protocol.ts"
import { track } from "../shared/tracing.ts"
import type { Attributes } from "./event-attributes.ts"
import { onProcessesChanged, setAddresses, trackedProcesses } from "./processes.ts"

/*
 * The providers extensions register for processes (docs/proposals/processes.md, Providers): address providers, asked
 * where else each server is reached as its endpoint becomes known and whenever one says it changed, and discovery
 * providers, asked what's running when an extension calls `find`, from their last answer while it's good. A call that
 * runs out of time, throws or answers what Parity refuses leaves that provider out, and the rest go ahead.
 */

/** How long each kind of provider has to answer. */
const timeLimits: Record<ProcessProviderKind, number> = { addresses: 2000, discovery: 5000 }

/** A provider an extension registered, with what it last answered. */
interface Provider extends RegisteredProvider {
  projectId: string
  extension: string
  ask: ProviderAsk
  /** Its order among the project's providers, so addresses keep the order providers registered in. */
  order: number
  /** A discovery provider's last answer, until it says it changed or it's older than `maxAgeMs`. */
  answer?: { at: number; servers: DiscoveredServer[] }
}

/** A discovered server and the extension whose provider found it. */
export interface FoundServer extends DiscoveredServer {
  provider: string
}

/** What `discover` found, and how many providers it asked and how many answered from their last answer. */
export interface Discovery {
  servers: FoundServer[]
  providers: number
  cached: number
}

/** The registry, as `parity.providers` fills it and Parity's own code asks it. */
export interface ProcessProviders extends ExtensionProviders {
  /** Asks a project's discovery providers what's running, from their last answers while those are good. */
  discover(projectId: string, root: string): Promise<Discovery>
  /** A server a discovery provider last found, by the key `find` gave it, as `<extension>:<key>`. */
  found(projectId: string, key: string): FoundServer | undefined
}

/** Every open project's providers, asked as servers appear and as `find` is called. */
export function processProviders(): ProcessProviders {
  const providers = new Map<string, Provider>()
  /** What each address provider said of each server, by the server's process id, then the provider's key. */
  const addresses = new Map<string, { projectId: string; seen: string; by: Map<string, Address[]> }>()
  let order = 0

  const keyOf = (projectId: string, extension: string, kind: ProcessProviderKind) =>
    `${projectId}\n${extension}\n${kind}`

  const ofKind = (projectId: string, kind: ProcessProviderKind) =>
    [...providers.entries()].filter(([, provider]) => provider.projectId === projectId && provider.kind === kind)

  /** Sets each server's addresses from what every provider said of it, in the order they registered. */
  const apply = (projectId: string, ids: Iterable<string>) => {
    const servers = new Map(trackedProcesses(projectId).map((process) => [process.id, process]))

    for (const id of ids) {
      const server = servers.get(id)
      const known = addresses.get(id)

      if (!server || !known) {
        continue
      }

      const given = [...known.by.entries()]
        .toSorted(([a], [b]) => (providers.get(a)?.order ?? 0) - (providers.get(b)?.order ?? 0))
        .flatMap(([, each]) => each)

      setAddresses(id, given, opensAt(given, server.endpoint?.url))
    }
  }

  /** Asks one address provider about these servers, and keeps what it says of each. */
  const askAddresses = async (key: string, servers: ProjectProcess[]) => {
    const provider = providers.get(key)

    if (!provider || servers.length === 0) {
      return
    }

    const all = trackedProcesses(provider.projectId)
    const facts = servers.flatMap((server) => (server.endpoint ? [factsOf(server, all)] : []))
    const byListed = new Map(servers.map((server) => [listedId(server, all), server.id]))
    const answer = await call(provider, () => provider.ask.addresses(facts))
    const read = answer === undefined ? undefined : providedAddresses.safeParse(answer)

    if (read && !read.success) {
      failed(provider, "invalid", 0, read.error.message)
    }

    // A provider that failed or was taken away meanwhile says nothing of them.
    if (!read?.success || providers.get(key) !== provider) {
      return
    }

    const touched: string[] = []

    for (const { server, addresses: given } of read.data) {
      const id = byListed.get(server)
      const known = id === undefined ? undefined : addresses.get(id)

      if (id === undefined || !known) {
        continue
      }

      known.by.set(key, taken(provider, given))
      touched.push(id)
    }

    apply(provider.projectId, touched)
  }

  /** The servers of a project whose endpoint is known, and which of them no provider has been asked about yet. */
  const servers = (projectId: string) => {
    const listed = trackedProcesses(projectId).filter((process) => process.endpoint && live(process))
    const fresh: ProjectProcess[] = []

    for (const server of listed) {
      const seen = seenAs(server)

      if (addresses.get(server.id)?.seen !== seen) {
        addresses.set(server.id, { projectId, seen, by: new Map() })
        fresh.push(server)
      }
    }

    return { listed, fresh }
  }

  /** Asks every address provider about the servers none has been asked about, and `every` about all of them. */
  const askAll = (projectId: string, every?: string) => {
    const { listed, fresh } = servers(projectId)

    for (const [key] of ofKind(projectId, "addresses")) {
      void askAddresses(key, key === every ? listed : fresh)
    }
  }

  // A server whose endpoint is first known, or which started again, is asked about.
  onProcessesChanged((projectId) => {
    const listed = new Set(trackedProcesses(projectId).map((process) => process.id))

    for (const [id, known] of addresses) {
      if (known.projectId === projectId && !listed.has(id)) {
        addresses.delete(id)
      }
    }

    askAll(projectId)
  })

  /** Takes away a provider, and what it said of each server. */
  const remove = (key: string) => {
    const provider = providers.get(key)

    if (!provider) {
      return
    }

    providers.delete(key)
    const touched: string[] = []

    for (const [id, known] of addresses) {
      if (known.by.delete(key)) {
        touched.push(id)
      }
    }

    apply(provider.projectId, touched)
  }

  return {
    register(caller, registered, ask) {
      const key = keyOf(caller.projectId, caller.extension, registered.kind)
      remove(key)
      providers.set(key, {
        ...registered,
        projectId: caller.projectId,
        extension: caller.extension,
        ask,
        order: order++
      })

      if (registered.kind === "addresses") {
        askAll(caller.projectId, key)
      }
    },
    changed(caller, kind) {
      const key = keyOf(caller.projectId, caller.extension, kind)
      const provider = providers.get(key)

      if (!provider) {
        return
      }

      delete provider.answer

      if (provider.kind === "addresses") {
        askAll(caller.projectId, key)
      }
    },
    dispose(caller, kind) {
      remove(keyOf(caller.projectId, caller.extension, kind))
    },
    disposeAll(projectId, extension) {
      for (const [key, provider] of providers) {
        if (provider.projectId === projectId && provider.extension === extension) {
          remove(key)
        }
      }
    },
    async discover(projectId, root) {
      const asked = ofKind(projectId, "discovery")
      let cached = 0

      const answers = await Promise.all(
        asked.map(async ([, provider]) => {
          const { answer } = provider

          if (answer && Date.now() - answer.at < (provider.maxAgeMs ?? Number.POSITIVE_INFINITY)) {
            cached += 1

            return answer.servers.map((server) => ({ ...server, provider: provider.extension }))
          }

          const found = await discovered(provider, root)

          if (found) {
            provider.answer = { at: Date.now(), servers: found }
          }

          return (found ?? []).map((server) => ({ ...server, provider: provider.extension }))
        })
      )

      return { servers: answers.flat(), providers: asked.length, cached }
    },
    found(projectId, key) {
      for (const [, provider] of ofKind(projectId, "discovery")) {
        const server = provider.answer?.servers.find((each) => `${provider.extension}:${each.key}` === key)

        if (server) {
          return { ...server, provider: provider.extension }
        }
      }

      return undefined
    }
  }
}

/** Asks a discovery provider, and keeps the servers on this machine with the addresses Parity takes. */
async function discovered(provider: Provider, root: string): Promise<DiscoveredServer[] | undefined> {
  const answer = await call(provider, () => provider.ask.discover({ root }))

  if (answer === undefined) {
    return undefined
  }

  const read = discoveredServers.safeParse(answer)

  if (!read.success) {
    failed(provider, "invalid", 0, read.error.message)

    return undefined
  }

  return read.data.flatMap((server) => {
    if (!isLocalHost(new URL(server.endpoint.url).hostname)) {
      failed(provider, "refused", 0, `${server.endpoint.url} isn't on this machine`)

      return []
    }

    const kept: DiscoveredServer = { ...server, addresses: taken(provider, server.addresses ?? []) }

    return [kept]
  })
}

/** The addresses Parity takes from a provider, marked with its extension's id, telling it of those it drops. */
function taken(provider: Provider, given: Omit<Address, "provider">[]): Address[] {
  return given.flatMap((address) => {
    // Publishing comes with step 4 of docs/proposals/processes.md; until then no extension may give a public address.
    const refusal = addressRefusal(address, false)

    if (refusal) {
      failed(provider, "refused", 0, refusal)

      return []
    }

    return [{ ...address, provider: provider.extension }]
  })
}

/**
 * Calls a provider within its kind's time limit. Undefined when it throws or runs out of time, which it's told of;
 * a call that takes over half its time is noted as slow.
 */
async function call<T>(provider: Provider, ask: () => Promise<T>): Promise<T | undefined> {
  const limit = timeLimits[provider.kind]
  const began = performance.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), limit)
    timer.unref()
  })

  try {
    const answer = await Promise.race([ask(), late])
    const durationMs = Math.round(performance.now() - began)

    if (answer === "late") {
      failed(provider, "timeout", durationMs)

      return undefined
    }

    if (durationMs > limit / 2) {
      track("processes.providerSlow", { provider: provider.extension, kind: provider.kind, durationMs })
    }

    return answer
  } catch (cause) {
    failed(provider, "error", Math.round(performance.now() - began), cause instanceof Error ? cause.message : "")

    return undefined
  } finally {
    clearTimeout(timer)
  }
}

function failed(
  provider: Provider,
  reason: "error" | "timeout" | "invalid" | "refused",
  durationMs: number,
  message?: string
): void {
  const attributes: Attributes<"processes.providerFailed"> = {
    provider: provider.extension,
    kind: provider.kind,
    reason,
    durationMs
  }

  if (message) {
    attributes.message = message.slice(0, 500)
  }

  track("processes.providerFailed", attributes)
}

/** What an address provider is told of a server: its id as extensions see it, and nothing of its output. */
function factsOf(server: ProjectProcess, all: ProjectProcess[]): ServerFacts {
  const facts: ServerFacts = { id: listedId(server, all), name: server.name, endpoint: server.endpoint! }

  if (server.pid !== undefined) {
    facts.pid = server.pid
  }

  return facts
}

/** A server's run and endpoint, which change when it starts again, so it's asked about again. */
function seenAs(server: ProjectProcess): string {
  return `${server.run}\n${server.startedAt}\n${server.endpoint?.url ?? ""}`
}

function live(process: ProjectProcess): boolean {
  return process.state === "starting" || process.state === "running"
}
