import type { WebContents } from "electron"
import type { ConsoleEntry } from "../shared/protocol.ts"

/** The most messages kept; the oldest go first. */
const limit = 500
const entries: ConsoleEntry[] = []

/** Messages every dev build writes, which say nothing about the project. */
const chatter = [/^\[vite\]/, /Download the React DevTools/]

/**
 * Keeps what the projects' own code writes to the console in a window, so agents can read it through the CLI and MCP.
 * Parity's own messages, from `appOrigin`, aren't kept, nor is chatter such as Vite's about hot updates.
 */
export function recordConsole(contents: WebContents, where: ConsoleEntry["where"], appOrigin: string): void {
  contents.on("console-message", (event) => {
    const { level, sourceId: source, lineNumber: line } = event
    // Styling markers from console.log("%c...", css) carry no meaning outside DevTools.
    const text = event.message.replaceAll("%c", "")
    if (origin(source) === appOrigin || chatter.some((pattern) => pattern.test(text))) return
    const now = Date.now()
    const previous = entries.at(-1)
    if (
      previous &&
      previous.text === text &&
      previous.level === level &&
      previous.source === source &&
      previous.line === line &&
      previous.where === where
    ) {
      previous.count++
      previous.last = now
      return
    }
    entries.push({ level, text, source, line, where, count: 1, first: now, last: now })
    if (entries.length > limit) entries.splice(0, entries.length - limit)
  })
}

/** What code from `from` (a project's builder) has written, oldest first. Clearing forgets it once it's read. */
export function readConsole(from: string, clear: boolean): ConsoleEntry[] {
  const wanted = origin(from)
  const found = entries.filter((entry) => origin(entry.source) === wanted)
  if (clear) {
    const kept = entries.filter((entry) => origin(entry.source) !== wanted)
    entries.splice(0, entries.length, ...kept)
  }
  return found
}

function origin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ""
  }
}
