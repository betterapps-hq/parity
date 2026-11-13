import { projectPart } from "../project-part.ts"
import { createStore, useStore } from "../store.ts"
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
  private readonly filter = createStore<Filter>(() => ({ levels: allLevels, query: "" }))
  private focusCount = 0

  readonly get = this.filter.get
  readonly subscribe = this.filter.subscribe

  set(change: Partial<Filter>): void {
    this.filter.update((now) => ({ ...now, ...change }))
  }

  /** Opens a design's messages, closing the others', and shows every level; with none, opens them all. */
  focus(design: string | undefined): void {
    this.set(design ? { focus: { design, at: ++this.focusCount }, levels: allLevels } : { focus: undefined })
  }

  dispose(): void {
    this.filter.dispose()
  }
}

/** An open project's console filter, made the first time it's asked for and dropped when its tab closes. */
export const consoleFilterOf = projectPart((_session: Pick<ProjectSession, "untilClosed">) => new ConsoleFilter())

export function useConsoleFilter(session: Pick<ProjectSession, "untilClosed">): Filter {
  const filter = consoleFilterOf(session)

  return useStore(filter)
}
