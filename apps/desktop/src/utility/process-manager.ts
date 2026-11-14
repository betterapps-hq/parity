import { connect, createServer } from "node:net"
import { isText } from "@parity-app/core/values/evaluate"
import type { Endpoint, ProcessEnd, ProcessOwner, ReadyCheck } from "@parity-app/extension-api"
import {
  type ChildEnd,
  type ChildExit,
  endedByItself,
  lastLines,
  type Lifecycle,
  matchedLineLength,
  ProcessError
} from "@parity-app/processes"
import type { ProjectProcess } from "../shared/protocol.ts"
import { track } from "../shared/tracing.ts"
import { spawnChild } from "./children.ts"
import type { Attributes } from "./event-attributes.ts"
import {
  forgetProcess,
  forgetProject,
  type ProcessEntry,
  type ProcessHandle as Tracking,
  trackProcess
} from "./processes.ts"

/*
 * The one place Parity starts, watches and stops a project's processes: Storybook and other tools' servers, an
 * extension's servers and tasks, and the servers it found running and adopted (docs/proposals/processes.md). Each id has
 * one process: a second start with the same spec shares it, and a different one is refused. It keeps each one's port
 * and what it printed, and stops everything it started for a project when the project closes, and everything when the
 * service exits. An adopted server is listed and checked, but never stopped. Each process is started, timed and stopped
 * through the service's one child lifecycle (`children.ts`), which also ends it with the service.
 */

/** The command line one run starts, once its run is resolved and its port chosen. */
export interface Launch {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  /** Starts it through `cmd.exe`, with `command` the whole command line `batchCommandLine` built. */
  shell?: boolean
  /** The port it listens on, when it's a server that does. */
  port?: number
  /** Whether that's another port than the one it asked for, which was taken. */
  portMoved?: boolean
}

/** A process to start, and how each of its runs is launched. */
export interface ManagedSpec {
  /** Unique among every open project's processes, as `extension:<extension>:<project>:<id>`. */
  id: string
  name: string
  lifetime: "server" | "task"
  owner: ProcessOwner
  projectId: string
  project: string
  /** Resolves the command line for each run, the first and each restart. A `ProcessError` it throws refuses `start`. */
  launch(): Promise<Launch>
  ready?: ReadyCheck
  /**
   * For one of Parity's own servers, whether it answers at its endpoint yet, asked until it does, as an adapter tells
   * its tool's server. It stands in for `ready`, since only Parity's own code can pass a function here.
   */
  answers?: (base: string) => Promise<boolean>
  /** For a server, how long it may take to be ready; for a task, to end. Three minutes for a server unless said. */
  timeoutMs?: number
  restart?: "never" | "onCrash"
  /** Listed only once it has run for a second, gone as soon as it passes, and reported only when it fails. */
  quiet?: boolean
  icon?: string
  role?: string
  /** What telemetry says it runs: its kind of command, and what it names. */
  runKind: "bin" | "script" | "exec" | "node" | "parity"
  command: string
  /** Says what it runs and how. A second start whose fingerprint differs is refused. */
  fingerprint: string
  /** Starts it again from the processes list, instead of launching the same spec, as an adapter's server does. */
  restartFromList?: () => Promise<void>
}

/** Who stopped a process, as `processes.stopped` says. */
export type StoppedBy = "person" | "extension" | "project" | "undetected" | "service" | "removed"

/** A process the manager runs or adopted, as its owner holds it. */
export interface ManagedProcess {
  readonly id: string
  /** How it's listed now. */
  info(): ProjectProcess
  /** The current run, once it's ready. While no run is starting or running, rejects with why the last one ended. */
  ready(): Promise<ProjectProcess>
  /** The current run's end, or the latest run's while none is starting or running. */
  ended(): Promise<ProcessEnd>
  /** Calls `listener` as each run ends. */
  onEnd(listener: (end: ProcessEnd) => void): () => void
  /** Calls `listener` whenever how it's listed changes. */
  onChange(listener: (info: ProjectProcess) => void): () => void
  /** Stops it and every process it started; lets go of an adopted one. */
  stop(by?: StoppedBy): Promise<void>
  /** Starts its next run, and settles once that run is ready. */
  restart(by?: "person" | "extension"): Promise<ProjectProcess>
  /** The latest lines it printed, at most `lines`. */
  tail(lines?: number): string[]
  /** Calls `listener` with each batch of lines it prints. */
  onLines(listener: (lines: string[]) => void): () => void
  /** For a server whose ready check is `output`: its owner saw the line, so the run is ready. */
  markReady(match: string): void
  /** For a task: what it's doing and how far it's got. */
  report(progress: { detail?: string; done?: number; total?: number }): void
  /** For a task: what it found, until its next run starts. */
  summarize(summary: string): void
}

/** What an adopted server is known by. */
export interface AdoptedServer {
  id: string
  name: string
  /** `{ kind: "adopted", by }` for an extension's, or Parity's own with `adopted: true`. */
  owner: ProcessOwner
  projectId: string
  project: string
  endpoint: Endpoint
  pid?: number
  foundBy: "port" | "provider" | "endpoint"
  provider?: string
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: Error): void
  settled: boolean
}

interface Entry {
  spec?: ManagedSpec
  adopted?: AdoptedServer & { since: number; timer: ReturnType<typeof setInterval>; misses: number }
  handle: ManagedProcess
  tracking?: Tracking
  life?: Lifecycle
  run: number
  /** Set while a run is starting or running. */
  live: boolean
  ready: Deferred<ProjectProcess>
  end: Deferred<ProcessEnd>
  /** Why the latest run failed, for `ready()` once it's over. */
  lastError?: string
  stopBy?: StoppedBy
  /** Set while it's stopped to start its next run, so no `processes.stopped` is sent. */
  restarting?: boolean
  crashes: number[]
  lines: string[]
  partial: string
  endListeners: Set<(end: ProcessEnd) => void>
  lineListeners: Set<(lines: string[]) => void>
  changeListeners: Set<(info: ProjectProcess) => void>
  /** For a task: called when its owner summarizes it, so `processes.taskFinished` can say so. */
  summarized?: () => void
  reported: boolean
  /** While its first run is being launched, so a second start shares it. */
  starting?: Promise<ManagedProcess>
}

const entries = new Map<string, Entry>()
const defaultServerTimeout = 180_000
const readyInterval = 750
const keptLines = 200
const quietDelay = 1000
const crashWindow = 60_000
const crashesAllowed = 3
const adoptedInterval = 5000
const summaryWait = 5000

/**
 * Starts a process, or gives the one already starting or running with the same id and spec. Settles once spawning has
 * been tried; `ready()` says when it's ready. Refuses with a `ProcessError` before anything runs.
 */
export async function startProcess(spec: ManagedSpec): Promise<ManagedProcess> {
  try {
    let existing = entries.get(spec.id)

    // One being stopped goes first. Starts that waited for it look again, so the first starts and the rest share it.
    while (existing && existing.live && existing.stopBy && !existing.restarting && !existing.adopted) {
      await existing.end.promise
      existing = entries.get(spec.id)
    }

    if (existing && (existing.live || existing.starting)) {
      if (existing.adopted) {
        throw new ProcessError("process_adopted", `${spec.name} is a server this extension adopted`)
      }

      if (existing.spec?.fingerprint !== spec.fingerprint) {
        throw new ProcessError("process_spec_differs", `${spec.name} is already running with another spec`)
      }

      return await (existing.starting ?? Promise.resolve(existing.handle))
    }

    const entry = newEntry(spec)
    entries.set(spec.id, entry)
    entry.starting = runOnce(entry).then(
      () => entry.handle,
      (cause: unknown) => {
        if (entries.get(spec.id) === entry && !entry.tracking) {
          entries.delete(spec.id)
        }

        throw cause
      }
    )

    try {
      return await entry.starting
    } finally {
      entry.starting = undefined
    }
  } catch (error) {
    if (error instanceof ProcessError) {
      track("processes.refused", {
        owner: ownerName(spec.owner),
        runKind: spec.runKind,
        command: spec.command,
        code: error.code
      })
    }

    throw error
  }
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: Error) => void = () => undefined

  const result: Deferred<T> = {
    promise: new Promise<T>((done, fail) => {
      resolve = done
      reject = fail
    }),
    resolve: (value) => {
      result.settled = true
      resolve(value)
    },
    reject: (error) => {
      result.settled = true
      reject(error)
    },
    settled: false
  }

  // An owner that drops one still sees the failure in the processes list.
  result.promise.catch(() => undefined)

  return result
}

function newEntry(spec: ManagedSpec | undefined, adopted?: AdoptedServer): Entry {
  const entry: Entry = {
    spec,
    run: 0,
    live: false,
    ready: deferred(),
    end: deferred(),
    crashes: [],
    lines: [],
    partial: "",
    endListeners: new Set(),
    lineListeners: new Set(),
    changeListeners: new Set(),
    reported: false,
    handle: handleOf(spec?.id ?? adopted?.id ?? "", () => entry)
  }

  return entry
}

/** What an owner holds of an entry. */
function handleOf(id: string, current: () => Entry): ManagedProcess {
  return {
    id,
    info: () => current().tracking?.info() ?? placeholder(current()),
    ready() {
      const entry = current()

      return entry.live
        ? entry.ready.promise
        : Promise.reject(new Error(entry.lastError ?? `${nameOf(entry)} isn't running`))
    },
    ended: () => current().end.promise,
    onEnd: (listener) => subscribe(current().endListeners, listener),
    onChange: (listener) => subscribe(current().changeListeners, listener),
    stop: (by = "extension") => stopEntry(current(), by),
    restart: (by = "extension") => restartEntry(current(), by),
    tail: (lines = keptLines) => current().lines.slice(-lines),
    onLines: (listener) => subscribe(current().lineListeners, listener),
    markReady(match) {
      const entry = current()

      if (entry.live && !entry.ready.settled && entry.spec?.ready && "output" in entry.spec.ready) {
        update(entry, { readyMatch: match })
        becameReady.get(entry)?.()
      }
    },
    report(progress) {
      const entry = current()
      const details: Parameters<Tracking["update"]>[0] = {}

      if (progress.detail !== undefined) {
        details.detail = progress.detail
      }

      if (progress.done !== undefined && progress.total !== undefined) {
        details.progress = { done: progress.done, total: progress.total }
      }

      entry.reported = true
      update(entry, details)
    },
    summarize(summary) {
      const entry = current()
      entry.reported = true
      update(entry, { summary })
      entry.summarized?.()
    }
  }
}

/** Each run's way to say its `output` check has been met. */
const becameReady = new WeakMap<Entry, () => void>()

function subscribe<T>(listeners: Set<T>, listener: T): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

function nameOf(entry: Entry): string {
  return entry.spec?.name ?? entry.adopted?.name ?? "It"
}

/** How a process that isn't listed, as a quiet task in its first second, would be. */
function placeholder(entry: Entry): ProjectProcess {
  const spec = entry.spec

  return {
    id: entry.handle.id,
    name: nameOf(entry),
    lifetime: spec?.lifetime ?? "server",
    state: entry.live ? "running" : "stopped",
    owner: spec?.owner ?? entry.adopted?.owner ?? { kind: "parity", role: "tool" },
    run: entry.run,
    addresses: [],
    startedAt: Date.now(),
    projectId: spec?.projectId ?? entry.adopted?.projectId ?? "",
    project: spec?.project ?? entry.adopted?.project ?? "",
    canStop: entry.live,
    canRestart: false
  }
}

function update(entry: Entry, details: Parameters<Tracking["update"]>[0]): void {
  entry.tracking?.update(details)
  changed(entry)
}

function changed(entry: Entry): void {
  if (!entry.tracking) {
    return
  }

  const info = entry.tracking.info()

  for (const listener of entry.changeListeners) {
    listener(info)
  }
}

function setState(entry: Entry, state: ProjectProcess["state"], details?: Parameters<Tracking["set"]>[1]): void {
  entry.tracking?.set(state, details)
  changed(entry)
}

function ownerName(owner: ProcessOwner): string {
  if (owner.kind === "parity") {
    return "parity"
  }

  return owner.kind === "extension" ? owner.extension : owner.by
}

/** The exit code and signal a child ended with. */
interface ExitCodes {
  exitCode?: number
  signal?: string
}

/** The exit code and signal a child ended with, as the events that carry them say. */
function exitCodes(end: ChildEnd): ExitCodes {
  const codes: ExitCodes = {}

  if (end.code !== undefined) {
    codes.exitCode = end.code
  }

  if (end.signal !== undefined) {
    codes.signal = end.signal
  }

  return codes
}

/** How Parity knew a server was ready, as `processes.started` says. */
function readyKind(check: ReadyCheck | undefined, asked: boolean): "http" | "tcp" | "output" | "none" {
  if (asked) {
    return "http"
  }

  if (!check) {
    return "none"
  }

  if ("http" in check) {
    return "http"
  }

  return "tcp" in check ? "tcp" : "output"
}

/** The attributes every `processes.*` event about a started process has. */
function common(spec: ManagedSpec) {
  return {
    lifetime: spec.lifetime,
    name: spec.name,
    owner: ownerName(spec.owner),
    role: spec.owner.kind === "parity" ? spec.owner.role : (spec.role ?? ""),
    runKind: spec.runKind,
    command: spec.command
  }
}

/** Launches one run, and settles once spawning has been tried. */
async function runOnce(entry: Entry): Promise<void> {
  const spec = entry.spec!
  const launch = await spec.launch()

  entry.run += 1
  entry.live = true
  entry.stopBy = undefined
  entry.lines = []
  entry.partial = ""
  entry.reported = false
  entry.summarized = undefined

  if (entry.ready.settled) {
    entry.ready = deferred()
  }

  if (entry.end.settled) {
    entry.end = deferred()
  }

  const life = spawnChild(launch.command, launch.args, { cwd: launch.cwd, env: launch.env, shell: launch.shell })
  entry.life = life
  const began = performance.now()

  const endpoint: Endpoint | undefined =
    launch.port === undefined
      ? undefined
      : {
          url: `http://localhost:${launch.port}`,
          port: launch.port,
          protocol: spec.ready && "tcp" in spec.ready ? "tcp" : "http"
        }

  const listing: ProcessEntry = {
    id: spec.id,
    owner: spec.owner,
    lifetime: spec.lifetime,
    name: spec.name,
    state: "starting",
    projectId: spec.projectId,
    project: spec.project,
    run: entry.run
  }

  if (life.pid !== undefined) {
    listing.pid = life.pid
  }

  if (endpoint) {
    listing.endpoint = endpoint
  }

  if (spec.icon) {
    listing.icon = spec.icon
  }

  if (spec.role) {
    listing.role = spec.role
  }

  const controls = {
    stop: () => void stopEntry(entry, "person"),
    restart: async () => {
      if (spec.restartFromList) {
        await spec.restartFromList()
      } else {
        await restartEntry(entry, "person")
      }
    }
  }

  if (spec.quiet) {
    // Listed only once it has run for a second.
    const timer = setTimeout(() => {
      if (entry.live && entries.get(spec.id) === entry) {
        entry.tracking = trackProcess({ ...listing, state: "running" }, controls)
        changed(entry)
      }
    }, quietDelay)

    timer.unref()
  } else {
    entry.tracking = trackProcess(listing, controls)
  }

  life.onOutput((text) => takeOutput(entry, text))

  void watchExit(entry, life, began)

  if (spec.lifetime === "task") {
    if (spec.timeoutMs !== undefined) {
      life.deadline(spec.timeoutMs)
    }

    setState(entry, "running")
    entry.ready.resolve(entry.handle.info())

    if (!spec.quiet) {
      track("processes.started", {
        ...common(spec),
        durationMs: elapsed(began),
        ready: "none",
        portMoved: false,
        run: entry.run
      })
    }
  } else {
    void waitUntilReady(entry, life, launch, began)
  }
}

function elapsed(since: number): number {
  return Math.round((performance.now() - since) * 10) / 10
}

/** Keeps what a process prints as lines, each at most `matchedLineLength`, the latest `keptLines` of them. */
function takeOutput(entry: Entry, text: string): void {
  const parts = (entry.partial + text).split(/\r?\n/)
  entry.partial = (parts.pop() ?? "").slice(0, matchedLineLength)
  const lines = parts.map((line) => line.slice(0, matchedLineLength))

  if (lines.length === 0) {
    return
  }

  entry.lines.push(...lines)
  entry.lines.splice(0, Math.max(0, entry.lines.length - keptLines))

  for (const listener of entry.lineListeners) {
    listener(lines)
  }
}

async function waitUntilReady(entry: Entry, life: Lifecycle, launch: Launch, began: number): Promise<void> {
  const spec = entry.spec!
  const timeout = spec.timeoutMs ?? defaultServerTimeout
  const check = spec.ready
  let timedOut = false
  let passed: () => void = () => undefined

  const late = new Promise<never>((_, reject) => {
    passed = () => {
      timedOut = true
      reject(new Error(`${spec.name} wasn't ready within ${timeout / 1000} seconds:\n${life.tail().trim()}`))
    }
  })

  late.catch(() => undefined)
  const cancel = life.deadline(timeout, passed)

  const endedFirst = life.exited.then((ended) => {
    throw new Error(ended.stopped ? `${spec.name} was stopped before it was ready` : endedByItself(spec.name, ended))
  })

  endedFirst.catch(() => undefined)

  const asks = spec.answers

  const answering = new Promise<void>((resolve) => {
    if (!check && !asks) {
      resolve()

      return
    }

    if (check && "output" in check) {
      becameReady.set(entry, resolve)

      return
    }

    void (async () => {
      while (life.running && !life.stopping) {
        const yes = asks ? asks(`http://localhost:${launch.port}`) : answers(check!, launch.port)

        if (await yes.catch(() => false)) {
          resolve()

          return
        }

        await new Promise((wait) => setTimeout(wait, readyInterval))
      }
    })()
  })

  try {
    await Promise.race([answering, endedFirst, late])
    cancel()
    setState(entry, "running")
    entry.ready.resolve(entry.handle.info())

    if (!spec.quiet) {
      track("processes.started", {
        ...common(spec),
        durationMs: elapsed(began),
        ready: readyKind(check, !!asks),
        portMoved: launch.portMoved ?? false,
        run: entry.run
      })
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const ended = await life.exited
    const codes = exitCodes(ended)

    // One stopped from the list or by its project's closing hasn't failed.
    if (timedOut || !ended.stopped) {
      const spawnFailed = !!ended.error && ended.code === undefined && ended.signal === undefined
      let failure: "timeout" | "spawn" | "exited" = spawnFailed ? "spawn" : "exited"

      if (timedOut) {
        failure = "timeout"
      }

      track("processes.failed", {
        ...common(spec),
        durationMs: elapsed(began),
        reason: failure,
        output: lastLines(life.tail()),
        ...codes
      })
      entry.lastError = reason
      setState(entry, "failed", { error: reason })
    } else {
      setState(entry, "stopped")
    }

    let how: ProcessEnd["how"] = ended.stopped ? "stopped" : "crashed"

    if (timedOut) {
      how = "timeout"
    }

    entry.ready.reject(new Error(reason))
    finishRun(entry, { run: entry.run, how, ...codes })
  }
}

/** Whether a server answers its ready check at its port. */
async function answers(check: ReadyCheck, port: number | undefined): Promise<boolean> {
  if (port === undefined) {
    return false
  }

  if ("http" in check) {
    const response = await fetch(`http://localhost:${port}${check.http}`, { signal: AbortSignal.timeout(3000) })

    return response.status < 400
  }

  return accepts(port)
}

/** Whether something accepts a connection on a port, on `127.0.0.1` or `[::1]`. */
export async function accepts(port: number): Promise<boolean> {
  const one = (host: string) =>
    new Promise<boolean>((resolve) => {
      const socket = connect({ host, port })

      const done = (ok: boolean) => {
        socket.destroy()
        resolve(ok)
      }

      socket.setTimeout(1000, () => done(false))
      socket.once("connect", () => done(true))
      socket.once("error", () => done(false))
    })

  return (await one("127.0.0.1")) || one("::1")
}

/** Settles once a run's process has ended, however it ended, and lists it as it ended. */
async function watchExit(entry: Entry, life: Lifecycle, began: number): Promise<void> {
  const spec = entry.spec!
  const exit = await life.exited
  const run = entry.run

  if (entry.life !== life) {
    return
  }

  entry.live = false

  if (spec.lifetime === "server" && !entry.ready.settled) {
    // It never was ready: `waitUntilReady` lists why, and ends the run.
    return
  }

  const uptimeMs = elapsed(began)
  const codes = exitCodes(exit)
  let end: ProcessEnd

  if (spec.lifetime === "task") {
    const { outcome, how } = taskEnd(exit)
    end = { run, how, outcome, ...codes }

    if (outcome === "failed") {
      entry.lastError = exit.timedOut ? `${spec.name} ran out of time` : endedByItself(spec.name, exit)
    }

    if (spec.quiet && !entry.tracking && outcome === "failed") {
      entry.tracking = trackProcess({ ...placeholder(entry), state: "running" }, {})
    }

    setState(entry, outcome, outcome === "failed" ? { error: entry.lastError } : {})

    if (spec.quiet && outcome === "passed") {
      forgetProcess(spec.id)
    }

    void reportTask(entry, end, began)
  } else if (exit.stopped) {
    end = { run, how: "stopped", ...codes }
    setState(entry, "stopped")

    if (!entry.restarting && entry.ready.settled && !spec.quiet) {
      track("processes.stopped", { ...common(spec), uptimeMs, by: entry.stopBy ?? "extension" })
    }
  } else {
    const now = Date.now()
    entry.crashes = entry.crashes.filter((at) => now - at < crashWindow)
    const restarting = spec.restart === "onCrash" && entry.crashes.length < crashesAllowed
    entry.crashes.push(now)
    end = { run, how: "crashed", ...codes }
    entry.lastError = endedByItself(spec.name, exit)
    setState(entry, "failed", { error: `Stopped by itself, with ${exit.how}` })
    track("processes.crashed", { ...common(spec), uptimeMs, restarting, output: lastLines(exit.output), ...codes })

    if (restarting) {
      finishRun(entry, end)
      void startAgain(entry, "crash")

      return
    }
  }

  finishRun(entry, end)
}

function finishRun(entry: Entry, end: ProcessEnd): void {
  if (!entry.ready.settled) {
    entry.ready.reject(new Error(entry.lastError ?? `${nameOf(entry)} ended before it was ready`))
  }

  entry.end.resolve(end)

  for (const listener of entry.endListeners) {
    listener(end)
  }
}

/** How a task's run ended. */
interface TaskEnd {
  outcome: "passed" | "failed" | "canceled"
  how: "stopped" | "timeout" | "exited"
}

/** How a task's run ended, from how its process did. */
function taskEnd(exit: ChildExit): TaskEnd {
  if (exit.stopped) {
    return { outcome: "canceled", how: "stopped" }
  }

  if (exit.timedOut) {
    return { outcome: "failed", how: "timeout" }
  }

  return { outcome: exit.code === 0 ? "passed" : "failed", how: "exited" }
}

/** Sends `processes.taskFinished` once its owner has summarized it, or 5 seconds after it ended. */
async function reportTask(entry: Entry, end: ProcessEnd, began: number): Promise<void> {
  const spec = entry.spec!

  if (spec.quiet && end.outcome !== "failed") {
    return
  }

  if (!entry.reported) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, summaryWait)
      timer.unref()
      entry.summarized = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  const finished: Attributes<"processes.taskFinished"> = {
    ...common(spec),
    durationMs: elapsed(began),
    outcome: end.outcome ?? "failed",
    how: "exited",
    reported: entry.reported
  }

  if (end.how === "timeout" || end.how === "stopped") {
    finished.how = end.how
  }

  if (end.exitCode !== undefined) {
    finished.exitCode = end.exitCode
  }

  track("processes.taskFinished", finished)
}

async function startAgain(entry: Entry, by: "person" | "extension" | "crash"): Promise<ProjectProcess> {
  const spec = entry.spec!
  const began = performance.now()

  try {
    await runOnce(entry)
    const info = await entry.ready.promise
    track("processes.restarted", { ...common(spec), durationMs: elapsed(began), by, outcome: "ok" })

    return info
  } catch (error) {
    track("processes.restarted", { ...common(spec), durationMs: elapsed(began), by, outcome: "error" })
    throw error
  } finally {
    entry.restarting = false
  }
}

async function restartEntry(entry: Entry, by: "person" | "extension"): Promise<ProjectProcess> {
  if (entry.adopted) {
    throw new Error(`${nameOf(entry)} wasn't started by Parity, so it can't be restarted`)
  }

  if (entry.live && entry.life) {
    entry.restarting = true
    entry.stopBy = by === "person" ? "person" : "extension"
    entry.life.stop()
    await entry.end.promise
  }

  entry.restarting = true

  return startAgain(entry, by)
}

async function stopEntry(entry: Entry, by: StoppedBy): Promise<void> {
  if (entry.adopted) {
    letGo(entry)

    return
  }

  if (!entry.live || !entry.life) {
    return
  }

  entry.stopBy = by
  entry.life.stop()
  await entry.end.promise
}

/** Takes an adopted server off the list without stopping it. */
function letGo(entry: Entry, how: ProcessEnd["how"] = "stopped"): void {
  const adopted = entry.adopted

  if (!adopted || !entry.live) {
    return
  }

  clearInterval(adopted.timer)
  entry.live = false
  setState(entry, "stopped")

  if (entries.get(adopted.id) === entry) {
    entries.delete(adopted.id)
  }

  finishRun(entry, { run: entry.run, how })
}

/**
 * Lists a server Parity uses but didn't start, as a Storybook already running on its usual port, so its port is known
 * and the status bar shows it. It's checked every 5 seconds, and taken off the list once it has gone. Stopping it, or
 * closing its project, only lets go of it.
 */
export function adoptProcess(server: AdoptedServer): ManagedProcess {
  const owner = server.owner

  try {
    if (!isLocalHost(new URL(server.endpoint.url).hostname)) {
      throw new ProcessError("process_not_local", `${server.endpoint.url} isn't on this machine`)
    }

    if (entries.get(server.id)?.live) {
      throw new ProcessError("process_id_taken", `${server.name} is already starting, running or stopping`)
    }
  } catch (error) {
    if (error instanceof ProcessError) {
      track("processes.refused", { owner: ownerName(owner), code: error.code })
    }

    throw error
  }

  const entry = newEntry(undefined, server)
  const timer = setInterval(() => void checkAdopted(entry), adoptedInterval)
  timer.unref()
  entry.adopted = { ...server, since: Date.now(), timer, misses: 0 }
  entry.run = 1
  entry.live = true
  entries.set(server.id, entry)

  const listing: ProcessEntry = {
    id: server.id,
    owner,
    lifetime: "server",
    name: server.name,
    state: "running",
    projectId: server.projectId,
    project: server.project,
    endpoint: server.endpoint,
    run: 1
  }

  if (server.pid !== undefined) {
    listing.pid = server.pid
  }

  entry.tracking = trackProcess(listing, { stop: () => letGo(entry) })
  entry.ready.resolve(entry.tracking.info())

  const adopted: Attributes<"processes.adopted"> = {
    name: server.name,
    owner: ownerName(owner),
    foundBy: server.foundBy
  }

  if (server.provider) {
    adopted.provider = server.provider
  }

  track("processes.adopted", adopted)

  return entry.handle
}

/** Whether an adopted server is still there: its process, when its id is known, else a connection to it. */
async function checkAdopted(entry: Entry): Promise<void> {
  const adopted = entry.adopted

  if (!adopted || !entry.live) {
    return
  }

  const checkedBy = adopted.pid === undefined ? "connect" : "pid"
  const there = adopted.pid === undefined ? await accepts(adopted.endpoint.port) : alive(adopted.pid)

  adopted.misses = there ? 0 : adopted.misses + 1

  if (adopted.misses < 2) {
    return
  }

  track("processes.lost", {
    name: adopted.name,
    owner: ownerName(adopted.owner),
    adoptedForMs: Date.now() - adopted.since,
    checkedBy
  })
  letGo(entry, "gone")
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch (cause) {
    // One that runs as another user can't be signalled, but is there.
    return cause instanceof Error && "code" in cause && cause.code === "EPERM"
  }
}

/** Whether a host is this machine. */
export function isLocalHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase()

  return bare === "localhost" || bare === "127.0.0.1" || bare === "::1" || bare.endsWith(".localhost")
}

/** A process the manager runs or adopted, while it's starting, running or stopping. */
export function managedProcess(id: string): ManagedProcess | undefined {
  const entry = entries.get(id)

  return entry?.live ? entry.handle : undefined
}

/** Stops a process Parity started, or lets go of one it adopted. */
export function stopManaged(id: string, by: StoppedBy = "extension"): Promise<void> {
  const entry = entries.get(id)

  return entry ? stopEntry(entry, by) : Promise.resolve()
}

/** Stops the processes whose ids start with `prefix`, as an extension's when it's removed. */
export async function stopManagedPrefixed(prefix: string, by: StoppedBy): Promise<void> {
  await Promise.all([...entries.keys()].flatMap((id) => (id.startsWith(prefix) ? [stopManaged(id, by)] : [])))
}

/** Stops everything Parity started for a project and takes the project's processes off the list, when it closes. */
export function stopProject(projectId: string): void {
  for (const [id, entry] of entries) {
    if ((entry.spec?.projectId ?? entry.adopted?.projectId) === projectId) {
      void stopEntry(entry, "project").then(() => entries.get(id) === entry && entries.delete(id))
    }
  }

  for (const [id, entry] of entries) {
    if ((entry.spec?.projectId ?? entry.adopted?.projectId) === projectId && !entry.live) {
      entries.delete(id)
    }
  }

  forgetProject(projectId)
}

/** The port it asks for when that one's free, else one the system hands out. */
export async function choosePort(wanted: number): Promise<number> {
  return (await portFree(wanted)) ? wanted : freePort()
}

/** Whether nothing listens on a port now. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once("error", () => resolve(false))
    server.listen(port, () => server.close(() => resolve(true)))
  })
}

/** A port nothing listens on now, as the system hands one out. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, () => {
      const address = server.address()
      const port = address && !isText(address) ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}
