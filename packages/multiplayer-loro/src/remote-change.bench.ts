/**
 * One remote change on the receiving copy, split by stage, on the small, large and very large projects, for each of the
 * edits in `remoteEdits` (PAR-1325). After the benches it prints each stage's median and p95. Run it as a one-off
 * command, with the V8 flag `loro-provider.bench.ts` explains:
 *
 *   pnpm exec vp test bench packages/multiplayer-loro/src/remote-change.bench.ts --testTimeout=600000 \
 *     --execArgv=--external-memory-accounted-in-global-limit
 */
import { projectSizes } from "@parity-app/multiplayer/testing"
import { afterAll, describe, expect, test } from "vite-plus/test"
import { remoteEdits, remoteScenario, type RemoteStages } from "./remote-change.ts"

const runOptions = { iterations: 50, time: 1000 }
const stageNames = ["importMs", "readMs", "projectDocMs", "lookupsMs", "totalMs"] as const
const rows: string[] = []

const at = (values: number[], share: number) =>
  values.toSorted((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0

describe("one remote change", () => {
  for (const [size, projectSize] of Object.entries(projectSizes)) {
    for (const kind of remoteEdits) {
      test(`${size}: ${kind}`, async ({ bench }) => {
        const scenario = remoteScenario(projectSize, kind)
        const stages: RemoteStages[] = []

        try {
          const result = await bench(`${size}: ${kind}`, () => {
            stages.push(scenario.receive(scenario.edit()))
          }).run(runOptions)

          const cells = stageNames.map((name) => {
            const values = stages.map((each) => each[name])

            return `${at(values, 0.5).toFixed(3)} / ${at(values, 0.95).toFixed(3)}`
          })

          rows.push(`| ${size} | ${kind} | ${cells.join(" | ")} |`)
          expect(result.latency.mean).toBeGreaterThan(0)
        } finally {
          scenario.dispose()
        }
      })
    }
  }

  afterAll(() => {
    const header = "| Size | Edit | Import | Read and diff | ProjectDoc | Lookups | Total |"
    const rule = "| --- | --- | --- | --- | --- | --- | --- |"
    process.stdout.write(`\nEach stage's median / p95 on the receiving copy, in ms, without the sending copy's edit:\n`)
    process.stdout.write(`${[header, rule, ...rows].join("\n")}\n\n`)
  })
})
