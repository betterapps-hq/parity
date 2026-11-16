import type {
  Candidate,
  Disposable,
  ProcessEnd,
  ProcessHandle,
  ProcessInfo,
  Processes,
  ProcessErrorCode
} from "@parity-app/extension"
import { isLocalHost, matchedLineLength, opensAt, readyPattern } from "@parity-app/processes"
import { z } from "zod"
import type { HostServiceMethods, ProcessSnapshot } from "./protocol.ts"

/*
 * `parity.processes` in an extension's host. The host keeps a copy of the project's processes, as the extension may
 * see them, and what its own printed lately, so `list`, `get` and `adopt` answer at once; the rest asks the project
 * service. A server whose ready check is `output` is matched here, in the extension's process, not in the service.
 */

/** How many lines of each of its own processes' output the host keeps. */
const keptLines = 200

/** What the host does with what the service tells it of the project's processes. */
export interface HostProcesses {
  /** What `activate` gets: the extension's id, the project's processes, and its own processes' output and checks. */
  begin(extension: string, snapshot: ProcessSnapshot): void
  changed(processes: ProcessInfo[]): void
  /** Lines one of its processes printed in a run. A new run's first lines replace the last run's. */
  lines(id: string, lines: string[], run: number): void
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
  /** Which run each process's kept output is from. */
  const outputRuns = new Map<string, number>()
  const patterns = new Map<string, RegExp>()
  const lineListeners = new Map<string, Set<(lines: string[]) => void>>()
  const endListeners = new Map<string, Set<(end: ProcessEnd) => void>>()
  const infoListeners = new Map<string, Set<(info: ProcessInfo) => void>>()
  const changeListeners = new Set<(changed: ProcessInfo[]) => void>()
  const handles = new Map<string, ProcessHandle>()
  /** Each of its processes as last heard of, by id, kept after the list lets a stopped one go. */
  const latest = new Map<string, ProcessInfo>()
  /** The processes whose output checks came back as the host started again, matched once it can say so. */
  const restored = new Set<string>()
  let markReady: (id: string, match: string) => void = () => undefined

  const projectId = (id: string) => `${extension}:${id}`

  const mine = (info: ProcessInfo) =>
    (info.owner.kind === "extension" && info.owner.extension === extension) ||
    (info.owner.kind === "adopted" && info.owner.by === extension)

  const own = (id: string) => list.find((info) => info.id === projectId(id) && mine(info))
  const live = (info: ProcessInfo | undefined) => !!info && ["starting", "running", "stopping"].includes(info.state)

  /** Keeps each of its processes in `list` as it's heard of now. */
  const remember = () => {
    for (const info of list) {
      if (mine(info)) {
        latest.set(info.id.slice(extension.length + 1), info)
      }
    }
  }

  /** Takes `info` into the copy, and tells whoever listens of what changed. */
  const take = (next: ProcessInfo[]) => {
    const before = new Map(list.map((info) => [info.id, JSON.stringify(info)]))
    list = next
    remember()
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

  /** The run each process was last said to be ready in, so a run is said ready once, and every run can be. */
  const readyRuns = new Map<string, number>()

  /** Calls `markReady` when a line matches the process's `output` check, once for each run. */
  const match = (id: string, lines: string[]) => {
    const pattern = patterns.get(id)
    const info = own(id)

    // The copy may not know of a run that started again yet; the service ignores a run that's ready already.
    if (!pattern || (info?.state === "running" && readyRuns.get(id) === info.run)) {
      return
    }

    for (const line of lines) {
      const found = pattern.exec(line.slice(0, matchedLineLength))

      if (found) {
        readyRuns.set(id, info?.run ?? 0)
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
    begin(id, snapshot) {
      extension = id
      list = snapshot.list
      remember()

      for (const [process, lines] of Object.entries(snapshot.output)) {
        output.set(process, lines.slice(-keptLines))
        outputRuns.set(process, own(process)?.run ?? 0)
      }

      // A host that started again matches its servers' next runs as the one before did.
      for (const [process, source] of Object.entries(snapshot.ready)) {
        try {
          patterns.set(
            process,
            readyPattern(source, (message) => {
              throw new Error(message)
            })
          )
          restored.add(process)
        } catch {
          // The service checked it as the spec started; a pattern this host can't build isn't matched.
        }
      }
    },
    changed: (processes) => take(processes),
    lines(id, lines, run) {
      if (outputRuns.get(id) !== run) {
        outputRuns.set(id, run)
        output.set(id, [])
      }

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

      // A run still starting may have printed its ready line while no host was there to hear it.
      for (const id of restored) {
        const info = own(id)

        if (info?.state === "starting" && outputRuns.get(id) === info.run) {
          match(id, output.get(id) ?? [])
        }
      }

      restored.clear()

      const handleFor = (id: string): ProcessHandle => {
        const known = handles.get(id)

        if (known) {
          return known
        }

        const handle: ProcessHandle = {
          id,
          get info() {
            // SAFETY: a handle is only made for a process in the copy, which `latest` keeps after the list lets it go.
            return (own(id) ?? latest.get(id)) as ProcessInfo
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

            // Lines its run printed before `start` answered; a run before it says nothing of this one.
            if (outputRuns.get(spec.id) === info.run) {
              match(spec.id, output.get(spec.id) ?? [])
            }
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

          const adopted: ProcessInfo = {
            id: projectId(as.id),
            name: as.name,
            lifetime: "server",
            state: "running",
            owner: { kind: "adopted", by: extension },
            run: 1,
            endpoint: server.endpoint,
            addresses: candidate?.addresses ?? [],
            startedAt: Date.now()
          }

          const opens = opensAt(adopted.addresses, server.endpoint.url)

          if (opens !== undefined) {
            adopted.opens = opens
          }

          merge(adopted)

          const params: HostServiceMethods["processes.adopt"]["params"] = {
            id: as.id,
            name: as.name,
            endpoint: server.endpoint,
            foundBy: candidate ? candidate.foundBy.kind : "endpoint"
          }

          if (candidate?.pid !== undefined) {
            params.pid = candidate.pid
          }

          if (candidate?.foundBy.kind === "provider") {
            params.provider = candidate.foundBy.extension
            params.key = candidate.key
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
