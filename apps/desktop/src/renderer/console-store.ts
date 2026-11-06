import { useSyncExternalStore } from "react"
import type { ConsoleChange, ConsoleEntry, LoggedEntry } from "../shared/protocol.ts"

/**
 * What a project's designs wrote to the console (PAR-147), from the same log `parity console` reads: each message
 * with the design and frames that wrote it, when that's known, and where in the project's files it was written.
 */
export interface ConsoleMessage extends ConsoleEntry {
  id: string
  /** The design that wrote it, by key; none when that isn't known, as for a module that logs as it loads. */
  design?: string
  /** The frames it was written in, by state and mode, when it's a design's. */
  frames?: { state: string; mode: string }[]
  /** The project file and line it was written at, or else the first of its stack's; none when both are a library's. */
  at?: { path: string; line: number; column: number }
  /** Its stack, one call to a line, for an error. */
  stack?: string[]
}

export type Level = ConsoleMessage["level"]

/** How many messages of each level, as the status bar and the panel's filters count them. */
export interface Tally {
  errors: number
  warnings: number
  info: number
}

/** The most entries a project's log keeps, as the main process does; the oldest go first. */
const kept = 500

/** One project's messages, made from the main process's entries as it sends them, and who hears of new ones. */
class ConsoleLog {
  readonly #entries = new Map<number, LoggedEntry>()
  #messages: readonly ConsoleMessage[] = []
  readonly #listeners = new Set<() => void>()

  get = (): readonly ConsoleMessage[] => this.#messages

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /**
   * Takes in what the main process kept or counted again, by id, from the project's builder at `guestUrl`. A message
   * written in several frames of a design is one, with each frame.
   */
  update(entries: readonly LoggedEntry[], guestUrl: string): void {
    if (entries.length === 0) return
    for (const entry of entries) this.#entries.set(entry.id, entry)
    for (const id of this.#entries.keys()) {
      if (this.#entries.size <= kept) break
      this.#entries.delete(id)
    }
    this.#messages = consoleMessages([...this.#entries.values()], guestUrl)
    this.#tell()
  }

  /** Forgets every message, as Clear in the panel does; agents reading the log afterwards don't see them either. */
  clear(): void {
    this.#entries.clear()
    this.#messages = []
    this.#tell()
  }

  #tell(): void {
    for (const listener of this.#listeners) listener()
  }
}

const logs = new Map<string, ConsoleLog>()

/** A project's console log, by the project's id. */
export function consoleLog(projectId: string): ConsoleLog {
  let log = logs.get(projectId)
  if (!log) logs.set(projectId, (log = new ConsoleLog()))
  return log
}

/** An open project, as the console's feed routes messages to it: by the address its builder serves its code from. */
export interface FedProject {
  id: string
  info: { guestUrl: string }
}

/** Gives each project the change's messages from its builder, or clears its log when its builder's was cleared. */
export function routeConsoleChange(change: ConsoleChange, projects: readonly FedProject[]): void {
  for (const project of projects) {
    const from = origin(project.info.guestUrl)
    if (!from) continue
    if ("cleared" in change) {
      if (change.cleared === from) consoleLog(project.id).clear()
      continue
    }
    consoleLog(project.id).update(
      change.entries.filter((entry) => origin(entry.source) === from),
      project.info.guestUrl
    )
  }
}

function origin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ""
  }
}

export function useConsole(projectId: string): readonly ConsoleMessage[] {
  const log = consoleLog(projectId)
  return useSyncExternalStore(log.subscribe, log.get)
}

/**
 * The panel's messages from the main process's entries, oldest first: one for each message a design wrote, whatever
 * frames it was written in, with each frame and how often it came in all, and its text apart from its stack.
 */
export function consoleMessages(entries: readonly LoggedEntry[], guestUrl: string): ConsoleMessage[] {
  const messages = new Map<string, ConsoleMessage>()
  for (const entry of entries) {
    const key = JSON.stringify([entry.design ?? null, entry.level, entry.text, entry.source, entry.line])
    const frame = entry.state && entry.mode ? { state: entry.state, mode: entry.mode } : undefined
    const found = messages.get(key)
    if (!found) {
      messages.set(key, messageOf(entry, guestUrl, frame))
      continue
    }
    found.count += entry.count
    found.first = Math.min(found.first, entry.first)
    found.last = Math.max(found.last, entry.last)
    const frames = found.frames ?? []
    if (frame && !frames.some((known) => known.state === frame.state && known.mode === frame.mode)) {
      found.frames = [...frames, frame]
    }
  }
  return [...messages.values()]
}

/** One entry as the panel shows it: its text less its stack, where it was written, and the frame it came from. */
function messageOf(
  entry: LoggedEntry,
  guestUrl: string,
  frame: { state: string; mode: string } | undefined
): ConsoleMessage {
  const lines = entry.text.split("\n")
  const calls = lines.map((line) => line.trim()).filter((line) => line.startsWith("at "))
  const text = lines
    .filter((line) => !line.trim().startsWith("at "))
    .join("\n")
    .trimEnd()
  const { id, ...rest } = entry
  const at =
    projectPlace(entry.source, entry.line, 1, guestUrl) ??
    calls
      .map((call) => readCall(call))
      .flatMap((call) => {
        const place = call && projectPlace(call.url, call.line, call.column, guestUrl)
        return place ? [place] : []
      })[0]
  return {
    ...rest,
    id: String(id),
    text,
    ...(frame ? { frames: [frame] } : {}),
    ...(at ? { at } : {}),
    ...(calls.length > 0 ? { stack: calls.map((call) => shortCall(call, guestUrl)) } : {})
  }
}

/** A stack's call, as Chrome writes it: `at Card (http://…/card.tsx:10:5)`, or without the function's name. */
function readCall(call: string): { name?: string; url: string; line: number; column: number } | undefined {
  const match = /^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(call)
  if (!match?.[2]) return undefined
  return { ...(match[1] ? { name: match[1] } : {}), url: match[2], line: Number(match[3]), column: Number(match[4]) }
}

/** A call with its address short: a project file from the project's root, a library's by its file's name. */
function shortCall(call: string, guestUrl: string): string {
  const read = readCall(call)
  if (!read) return call
  const place = projectPlace(read.url, read.line, read.column, guestUrl)
  const file = place?.path ?? read.url.split("?")[0]!.split("/").at(-1)
  const where = `${file}:${read.line}:${read.column}`
  return read.name ? `at ${read.name} (${where})` : `at ${where}`
}

/**
 * Where in the project's own files an address is, as the builder at `guestUrl` serves them: its path from the root,
 * without the query Vite adds. A library's module, one Vite made, or another server's is none.
 */
export function projectPlace(
  url: string,
  line: number,
  column: number,
  guestUrl: string
): { path: string; line: number; column: number } | undefined {
  let address: URL
  let guest: URL
  try {
    address = new URL(url)
    guest = new URL(guestUrl)
  } catch {
    return undefined
  }
  if (address.origin !== guest.origin || line < 1) return undefined
  const path = decodeURIComponent(address.pathname).replace(/^\/+/, "")
  if (!path || path.startsWith("@") || path.startsWith("node_modules/") || path.includes("/node_modules/")) {
    return undefined
  }
  return { path, line, column: Math.max(1, column) }
}

/** How many errors, warnings and other messages there are, of one design's when it's given. */
export function tally(messages: readonly ConsoleMessage[], design?: string): Tally {
  const counts: Tally = { errors: 0, warnings: 0, info: 0 }
  for (const message of messages) {
    if (design !== undefined && message.design !== design) continue
    if (message.level === "error") counts.errors++
    else if (message.level === "warning") counts.warnings++
    else counts.info++
  }
  return counts
}

/** Messages grouped by the design that wrote them, in the order each design first wrote one; the project's last. */
export function byDesign(messages: readonly ConsoleMessage[]): { design?: string; messages: ConsoleMessage[] }[] {
  const groups = new Map<string | undefined, ConsoleMessage[]>()
  for (const message of messages) {
    const group = groups.get(message.design)
    if (group) group.push(message)
    else groups.set(message.design, [message])
  }
  const list = [...groups].map(([design, grouped]) => ({ design, messages: grouped }))
  return [...list.filter((group) => group.design !== undefined), ...list.filter((group) => group.design === undefined)]
}

/** One design's errors and warnings, read so a board draws again only when its own counts change. */
export function useDesignCounts(projectId: string, design: string): { errors: number; warnings: number } {
  const log = consoleLog(projectId)
  const counts = useSyncExternalStore(log.subscribe, () => {
    const { errors, warnings } = tally(log.get(), design)
    return `${errors}:${warnings}`
  })
  const [errors = 0, warnings = 0] = counts.split(":").map(Number)
  return { errors, warnings }
}
