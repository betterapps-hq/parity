import type { WebContents } from "electron"
import type { ConsoleChange, ConsoleContext, ConsoleEntry, LoggedEntry } from "../shared/protocol.ts"

/** A message as a window wrote it, before it's kept. */
export type WrittenMessage = Pick<ConsoleEntry, "level" | "text" | "source" | "line" | "where"> & ConsoleContext

/** Messages every dev build writes, which say nothing about the project. */
const chatter = [/^\[vite\]/, /Download the React DevTools/]

/** How long a window's word on where its next message comes from holds, in milliseconds. */
const contextHolds = 1000

/**
 * What the projects' own code writes to the console, in every window, so agents can read it through the CLI and MCP
 * and the editor's Console panel shows it (PAR-147): the last `limit` messages, oldest first. A message that repeats
 * the last one, in the same frame, is counted on it. Chatter such as Vite's about hot updates isn't kept.
 */
export function createConsoleLog({ limit = 500, now = Date.now }: { limit?: number; now?: () => number } = {}) {
  const entries: LoggedEntry[] = []
  const listeners = new Set<(change: ConsoleChange) => void>()
  let next = 1
  const tell = (change: ConsoleChange) => {
    for (const listener of listeners) listener(change)
  }
  return {
    write(message: WrittenMessage): LoggedEntry | undefined {
      if (chatter.some((pattern) => pattern.test(message.text))) return undefined
      const at = now()
      const previous = entries.at(-1)
      if (previous && sameMessage(previous, message)) {
        previous.count++
        previous.last = at
        tell({ entries: [previous] })
        return previous
      }
      const { design, state, mode, ...written } = message
      const entry: LoggedEntry = {
        id: next++,
        ...written,
        count: 1,
        first: at,
        last: at,
        ...(design ? { design } : {}),
        ...(state ? { state } : {}),
        ...(mode ? { mode } : {})
      }
      entries.push(entry)
      if (entries.length > limit) entries.splice(0, entries.length - limit)
      tell({ entries: [entry] })
      return entry
    },

    /** What code from `from` (a project's builder) has written, oldest first. Clearing forgets it once it's read. */
    read(from: string, clear = false): LoggedEntry[] {
      const wanted = origin(from)
      const found = entries.filter((entry) => origin(entry.source) === wanted)
      if (clear) this.clear(from)
      return found
    },

    /** Forgets what code from `from` has written, for agents and every window. */
    clear(from: string): void {
      const wanted = origin(from)
      const kept = entries.filter((entry) => origin(entry.source) !== wanted)
      entries.splice(0, entries.length, ...kept)
      tell({ cleared: wanted })
    },

    subscribe(listener: (change: ConsoleChange) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export type ConsoleLog = ReturnType<typeof createConsoleLog>

/**
 * Where each window's next message comes from, as the window says just before it writes it: the editor names the frame
 * whose event it's handling (PAR-147). The word holds for that message alone, of the level it names, and only briefly,
 * so a message the window didn't announce is never taken for one it did.
 */
export function announcedContexts(now: () => number = Date.now) {
  const announced = new Map<number, { level: ConsoleEntry["level"]; context: ConsoleContext; at: number }>()
  return {
    announce(window: number, level: ConsoleEntry["level"], context: ConsoleContext): void {
      announced.set(window, { level, context, at: now() })
    },
    take(window: number, level: ConsoleEntry["level"]): ConsoleContext | undefined {
      const found = announced.get(window)
      announced.delete(window)
      return found && found.level === level && now() - found.at < contextHolds ? found.context : undefined
    }
  }
}

/**
 * Keeps what a window's projects write in `log`, with where each was written when `contextOf` knows. Parity's own
 * messages, from `appOrigin`, aren't kept, though one still uses up what its window announced for it.
 */
export function recordConsole(
  log: ConsoleLog,
  contents: WebContents,
  where: ConsoleEntry["where"],
  appOrigin: string,
  contextOf: (level: ConsoleEntry["level"]) => ConsoleContext | undefined = () => undefined
): void {
  contents.on("console-message", (event) => {
    const { level, sourceId: source, lineNumber: line } = event
    const context = contextOf(level)
    // A frame's message on the canvas comes through the window's wrapper, so its own call is the one announced.
    if (origin(context?.source ?? source) === appOrigin) return
    // Styling markers from console.log("%c...", css) carry no meaning outside DevTools.
    const text = event.message.replaceAll("%c", "")
    log.write({ level, text, source, line, where, ...context })
  })
}

/**
 * Sends the log's changes on in batches, `wait` milliseconds after the first, so a component that logs in a loop
 * doesn't send a window a message for each. Clearing goes at once, after what's waiting.
 */
export function batchedChanges(
  send: (change: ConsoleChange) => void,
  wait = 100,
  schedule: (run: () => void, wait: number) => unknown = setTimeout
): (change: ConsoleChange) => void {
  let waiting = new Map<number, LoggedEntry>()
  let scheduled = false
  const flush = () => {
    scheduled = false
    if (waiting.size === 0) return
    const entries = [...waiting.values()].map((entry) => ({ ...entry }))
    waiting = new Map()
    send({ entries })
  }
  return (change) => {
    if ("cleared" in change) {
      flush()
      send(change)
      return
    }
    for (const entry of change.entries) waiting.set(entry.id, entry)
    if (!scheduled) {
      scheduled = true
      schedule(flush, wait)
    }
  }
}

function sameMessage(entry: ConsoleEntry, message: WrittenMessage): boolean {
  return (
    entry.text === message.text &&
    entry.level === message.level &&
    entry.source === message.source &&
    entry.line === message.line &&
    entry.where === message.where &&
    entry.design === (message.design || undefined) &&
    entry.state === (message.state || undefined) &&
    entry.mode === (message.mode || undefined)
  )
}

function origin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ""
  }
}
