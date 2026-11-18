import { projectSizes } from "@parity-app/multiplayer/testing"
import { describe, expect, it } from "vite-plus/test"
import { remoteEdits, remoteScenario, type RemoteStages } from "./remote-change.ts"

/*
 * Budgets for one remote change on the receiving copy (PAR-1325; docs/editor.md, "A live room"), so a regression fails
 * CI. Each is the median of a run of changes, after a few to warm up, so one slow change on a stalled runner doesn't
 * fail it, and each is several times what a laptop takes, so a slower runner doesn't either. The very large project
 * takes too long to open for CI; `remote-change.bench.ts` measures it.
 */

const runs = 25
const warmup = 5

/** Opening the large project twice, and its edits, take a few seconds on their own. */
const timeout = 60_000

/**
 * The most the median change may take, in milliseconds, end to end and for Loro's import. On 2026-11-18 a laptop took
 * 9 and 21 end to end, nearly all of it reading back and diffing, and under 0.4 importing.
 */
const budgets = {
  small: { totalMs: 50, importMs: 5 },
  large: { totalMs: 120, importMs: 5 }
} satisfies Partial<Record<keyof typeof projectSizes, { totalMs: number; importMs: number }>>

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!

describe("one remote change on the receiving copy", () => {
  for (const size of ["small", "large"] as const) {
    const budget = budgets[size]

    for (const kind of remoteEdits) {
      it(
        `takes a ${kind} on the ${size} project within budget`,
        () => {
          const scenario = remoteScenario(projectSizes[size], kind)

          try {
            const stages: RemoteStages[] = []

            for (let index = 0; index < warmup + runs; index += 1) {
              const timed = scenario.receive(scenario.edit())

              if (index >= warmup) {
                stages.push(timed)
              }
            }

            expect(median(stages.map((each) => each.totalMs))).toBeLessThan(budget.totalMs)
            expect(median(stages.map((each) => each.importMs))).toBeLessThan(budget.importMs)
          } finally {
            scenario.dispose()
          }
        },
        timeout
      )
    }
  }
})
