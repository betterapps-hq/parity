import { useSyncExternalStore } from "react"
import { projectPart } from "../project-part.ts"
import type { ProjectSession } from "../workspace.ts"

/** The levels the console filters by; debug messages go with info. */
export type Shown = "error" | "warning" | "info"

export const allLevels: readonly Shown[] = ["error", "warning", "info"]

/**
 * What the console shows: the levels turned on, any mix of them, and the words searched for. `focus` is the design a
 * board's badge or a Layers mark opened it on, whose group opens and comes into view with the others closed; `at` tells
 * one opening from the next.
 */
export interface Filter {
  levels: readonly Shown[]
  focus?: { design: string; at: number } | undefined
  query: string
}

/** One open project's console filter, so each tab keeps its own. */
class ConsoleFilter {
  private filter: Filter = { levels: allLevels, query: "" }
  private focusCount = 0
  private readonly listeners = new Set<() => void>()

  get = (): Filter => this.filter

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  set(change: Partial<Filter>): void {
    this.filter = { ...this.filter, ...change }

    for (const listener of this.listeners) {
      listener()
    }
  }

  /** Opens a design's messages, closing the others', and shows every level; with none, opens them all. */
  focus(design: string | undefined): void {
    this.set(design ? { focus: { design, at: ++this.focusCount }, levels: allLevels } : { focus: undefined })
  }

  dispose(): void {
    this.listeners.clear()
    this.filter = { levels: allLevels, query: "" }
  }
}

/** An open project's console filter, made the first time it's asked for and dropped when its tab closes. */
export const consoleFilterOf = projectPart((_session: Pick<ProjectSession, "untilClosed">) => new ConsoleFilter())

export function useConsoleFilter(session: Pick<ProjectSession, "untilClosed">): Filter {
  const filter = consoleFilterOf(session)

  return useSyncExternalStore(filter.subscribe, filter.get)
}
