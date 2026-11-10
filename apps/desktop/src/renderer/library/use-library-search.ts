import {
  type ConnectorInfo,
  type Found,
  mayHaveMore,
  type Problem,
  requestFor,
  type SearchAnswer,
  type Searched
} from "@parity-app/connectors"
import { useCallback, useEffect, useRef, useState } from "react"

/** Where a search is: not run yet, waiting, answered with results, or answered with a problem. */
export type SearchStatus = "idle" | "searching" | "ready" | "problem"

/** Whether there may be more results: yes, arriving now, or none. */
export type MoreState = "can" | "loading" | "none"

export interface LibrarySearch {
  status: SearchStatus
  /** The search last run. */
  search?: Searched
  results: Found[]
  more: MoreState
  problem?: Problem
}

/** What a search answers when the window couldn't ask main at all. */
const unreachable: SearchAnswer = { problem: { code: "unavailable", message: "Parity couldn't run the search." } }

/**
 * A library's search in the browser: running one, asking for more of it, and keeping only the latest answer, so a slow
 * answer to an earlier search never replaces a later one. Main runs every search with the library's key
 * (`canvasHost.connectors`), and a failure comes back as a problem rather than an error.
 */
export function useLibrarySearch(library: ConnectorInfo, onAnswered: () => void) {
  const [state, setState] = useState<LibrarySearch>({ status: "idle", results: [], more: "none" })
  const latest = useRef(0)

  // Answers that arrive after the browser closes are dropped.
  useEffect(
    () => () => {
      latest.current = -1
    },
    []
  )

  const ask = useCallback(
    async (search: Searched, shown: Found[]) => {
      latest.current += 1
      const asked = latest.current
      const request = requestFor(library, search, shown)

      const answer = await window.canvasHost.connectors
        .search({ connector: library.id, request })
        .catch(() => unreachable)

      if (latest.current !== asked) {
        return
      }

      if ("problem" in answer) {
        setState((now) => ({ ...now, status: "problem", problem: answer.problem, more: "none" }))
      } else {
        setState((now) => ({
          ...now,
          status: "ready",
          results: [...shown, ...answer.found],
          more: mayHaveMore(answer.found.length, request) ? "can" : "none"
        }))
      }

      onAnswered()
    },
    [library, onAnswered]
  )

  /** Runs a search from its first results. */
  const run = useCallback(
    (search: Searched) => {
      setState({ status: "searching", search, results: [], more: "none" })
      void ask(search, [])
    },
    [ask]
  )

  /** Asks for more of the search shown, once, while there may be more. */
  const loadMore = useCallback(() => {
    if (state.search && state.more === "can") {
      setState((now) => ({ ...now, more: "loading" }))
      void ask(state.search, state.results)
    }
  }, [ask, state.search, state.more, state.results])

  return { ...state, run, loadMore }
}
