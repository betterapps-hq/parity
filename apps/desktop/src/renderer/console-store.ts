import { useSyncExternalStore } from "react"
import type { ConsoleEntry } from "../shared/protocol.ts"

/**
 * What a project's designs wrote to the console (PAR-147), from the same log `parity console` reads: each message
 * with the design and frames that wrote it, when that's known, and where in the project's files it was written.
 */
export interface ConsoleMessage extends ConsoleEntry {
  id: string
  /** The design that wrote it, by key; none for the project's own code, as a module that failed to load. */
  design?: string
  /** The frames it was written in, by state and mode, when it's a design's. */
  frames?: { state: string; mode: string }[]
  /** The project file and line it was written at, from its stack; none when that's a library's. */
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

/** One project's messages, oldest first, as the main process keeps them, and who hears of new ones. */
class ConsoleLog {
  #messages: readonly ConsoleMessage[] = []
  readonly #listeners = new Set<() => void>()

  get = (): readonly ConsoleMessage[] => this.#messages

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Adds messages as they're written, a repeat of the last counted on it, as the main process counts them. */
  add(messages: readonly ConsoleMessage[]): void {
    this.#messages = [...this.#messages, ...messages]
    this.#tell()
  }

  /** Forgets every message, as Clear in the panel does; agents reading the log afterwards don't see them either. */
  clear(): void {
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

export function useConsole(projectId: string): readonly ConsoleMessage[] {
  const log = consoleLog(projectId)
  return useSyncExternalStore(log.subscribe, log.get)
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
