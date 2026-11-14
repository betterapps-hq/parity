import type {
  Candidate,
  Disposable,
  ProcessEnd,
  ProcessHandle,
  ProcessInfo,
  Processes,
  ProcessErrorCode
} from "@parity-app/extension-api"
import { isLocalHost, matchedLineLength, readyPattern } from "@parity-app/processes"
import { z } from "zod"
import type { HostServiceMethods } from "./protocol.ts"

/*
 * `parity.processes` in an extension's host. The host keeps a copy of the project's processes, as the extension may
 * see them, and what its own printed lately, so `list`, `get` and `adopt` answer at once; the rest asks the project
 * service. A server whose ready check is `output` is matched here, in the extension's process, not in the service.
 */

/** How many lines of each of its own processes' output the host keeps. */
const keptLines = 200

/** What the host does with what the service tells it of the project's processes. */
export interface HostProcesses {
  /** What `activate` gets: the extension's id, the project's processes and its own processes' output. */
  begin(extension: string, list: ProcessInfo[], output: Record<string, string[]>): void
  changed(processes: ProcessInfo[]): void
  lines(id: string, lines: string[]): void
  ended(id: string, end: ProcessEnd): void
  /** `parity.processes`, asking the service through `send`. */
  api(send: Send, log: (text: string) => void): Processes
}

type Send = <M extends keyof HostServiceMethods>(
  method: M,
  params: HostServiceMethods[M]["params"]
) => Promise<HostServiceMethods[M]["result"]>

/** The host's side of an extension's processes. */
export function hostProcesses(): HostProcesses {
  let extension = ""
  let list: ProcessInfo[] = []
  const output = new Map<string, string[]>()
  const patterns = new Map<string, RegExp>()
  const lineListeners = new Map<string, Set<(lines: string[]) => void>>()
  const endListeners = new Map<string, Set<(end: ProcessEnd) => void>>()
  const infoListeners = new Map<string, Set<(info: ProcessInfo) => void>>()
  const changeListeners = new Set<(changed: ProcessInfo[]) => void>()
  const handles = new Map<string, ProcessHandle>()
  let markReady: (id: string, match: string) => void = () => undefined

  const projectId = (id: string) => `${extension}:${id}`

  const mine = (info: ProcessInfo) =>
    (info.owner.kind === "extension" && info.owner.extension === extension) ||
    (info.owner.kind === "adopted" && info.owner.by === extension)

  const own = (id: string) => list.find((info) => info.id === projectId(id) && mine(info))
  const live = (info: ProcessInfo | undefined) => !!info && ["starting", "running", "stopping"].includes(info.state)

  /** Takes `info` into the copy, and tells whoever listens of what changed. */
  const take = (next: ProcessInfo[]) => {
    const before = new Map(list.map((info) => [info.id, JSON.stringify(info)]))
    list = next
    const changed = next.filter((info) => before.get(info.id) !== JSON.stringify(info))

    if (changed.length === 0) {
      return
    }

    for (const listener of changeListeners) {
      listener(changed)
    }

    for (const info of changed) {
      if (mine(info)) {
        for (const listener of infoListeners.get(info.id.slice(extension.length + 1)) ?? []) {
          listener(info)
        }
      }
    }
  }

  const merge = (info: ProcessInfo) => take([...list.filter((each) => each.id !== info.id), info])

  /** Calls `markReady` once a line matches the process's `output` check. */
  const match = (id: string, lines: string[]) => {
    const pattern = patterns.get(id)

    if (!pattern) {
      return
    }

    for (const line of lines) {
      const found = pattern.exec(line.slice(0, matchedLineLength))

      if (found) {
        patterns.delete(id)
        markReady(id, found[0])

        return
      }
    }
  }

  const subscribe = <T>(listeners: Map<string, Set<T>>, id: string, listener: T): Disposable => {
    const set = listeners.get(id) ?? new Set<T>()
    listeners.set(id, set)
    set.add(listener)

    return { dispose: () => set.delete(listener) }
  }

  return {
    begin(id, processes, recent) {
      extension = id
      list = processes

      for (const [process, lines] of Object.entries(recent)) {
        output.set(process, lines.slice(-keptLines))
      }
    },
    changed: (processes) => take(processes),
    lines(id, lines) {
      const kept = output.get(id) ?? []
      kept.push(...lines)
      kept.splice(0, Math.max(0, kept.length - keptLines))
      output.set(id, kept)
      match(id, lines)

      for (const listener of lineListeners.get(id) ?? []) {
        listener(lines)
      }
    },
    ended(id, end) {
      for (const listener of endListeners.get(id) ?? []) {
        listener(end)
      }
    },
    api(send, log) {
      markReady = (id, found) => void send("processes.markReady", { id, match: found }).catch(() => undefined)

      const handleFor = (id: string): ProcessHandle => {
        const known = handles.get(id)

        if (known) {
          return known
        }

        let last: ProcessInfo | undefined = own(id)

        const handle: ProcessHandle = {
          id,
          get info() {
            last = own(id) ?? last

            // SAFETY: a handle is only made for a process in the copy, so `last` was set when it was made.
            return last as ProcessInfo
          },
          ready: async () => {
            const info = await coded(send("processes.ready", { id }))
            merge(info)

            return info
          },
          ended: () => coded(send("processes.ended", { id })),
          onDidEnd: (listener) => subscribe(endListeners, id, listener),
          async stop() {
            await coded(send("processes.stop", { id }))
            const info = own(id)

            // The service's word that it stopped may come after this answer, so the copy says so now.
            if (info && live(info)) {
              merge({ ...info, state: "stopped" })
            }
          },
          restart: async () => {
            const info = await coded(send("processes.restart", { id }))
            merge(info)

            return info
          },
          output: {
            tail: (lines = keptLines) => (output.get(id) ?? []).slice(-lines),
            onLines: (listener) => subscribe(lineListeners, id, listener)
          },
          report: (progress) => void send("processes.report", { id, ...progress }).catch(() => undefined),
          summarize: (summary) => void send("processes.summarize", { id, summary }).catch(() => undefined),
          onDidChange: (listener) => subscribe(infoListeners, id, listener)
        }

        handles.set(id, handle)

        return handle
      }

      return {
        async start(spec) {
          const info = await coded(send("processes.start", spec))
          merge(info)

          if (spec.ready && "output" in spec.ready) {
            patterns.set(
              spec.id,
              readyPattern(spec.ready.output, (message) => {
                throw new Error(message)
              })
            )
            match(spec.id, output.get(spec.id) ?? [])
          }

          return handleFor(spec.id)
        },
        adopt(server, as) {
          if (!isLocalHost(new URL(server.endpoint.url).hostname)) {
            throw codedError("process_not_local", `${server.endpoint.url} isn't on this machine`)
          }

          if (live(own(as.id))) {
            throw codedError("process_id_taken", `${as.name} is already starting, running or stopping`)
          }

          const candidate = "key" in server ? (server satisfies Candidate) : undefined

          merge({
            id: projectId(as.id),
            name: as.name,
            lifetime: "server",
            state: "running",
            owner: { kind: "adopted", by: extension },
            run: 1,
            endpoint: server.endpoint,
            addresses: candidate?.addresses ?? [],
            startedAt: Date.now()
          })

          const params: HostServiceMethods["processes.adopt"]["params"] = {
            id: as.id,
            name: as.name,
            endpoint: server.endpoint,
            foundBy: candidate ? candidate.foundBy.kind : "endpoint"
          }

          if (candidate?.pid !== undefined) {
            params.pid = candidate.pid
          }

          send("processes.adopt", params).then(merge, (cause: unknown) => {
            log(`Couldn't adopt ${as.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
          })

          return handleFor(as.id)
        },
        find: (query = {}) => coded(send("processes.find", query)),
        list(filter = {}) {
          return list.filter(
            (info) => (filter.owner !== "mine" || mine(info)) && (!filter.lifetime || info.lifetime === filter.lifetime)
          )
        },
        get: (id) => (own(id) ? handleFor(id) : undefined),
        onDidChange(listener) {
          changeListeners.add(listener)

          return { dispose: () => changeListeners.delete(listener) }
        }
      }
    }
  }
}

/** An error with a process error's code, as an extension tells refusals apart. */
function codedError(code: ProcessErrorCode, message: string): Error {
  return Object.assign(new Error(message), { code })
}

/** What a refusal's details carry: its code. */
const codedDetails = z.object({ code: z.string() })

/** The service's answer, or its refusal with the code its details carry. */
async function coded<T>(answer: Promise<T>): Promise<T> {
  try {
    return await answer
  } catch (cause) {
    const details = codedDetails.safeParse(cause instanceof Error && "details" in cause ? cause.details : undefined)

    if (cause instanceof Error && details.success) {
      Object.assign(cause, { code: details.data.code })
    }

    throw cause
  }
}
