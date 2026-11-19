import { describe, expect, it } from "vite-plus/test"
import { decodeRelayed, relayedBatch } from "./decode.ts"

/*
 * Budgets for decoding the relay's messages (PAR-1325; docs/editor.md, "A live room"): the median of a run, several
 * times what a laptop takes, so a regression fails CI but a slow runner doesn't.
 */

const runs = 200

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!

function medianMs(message: string): number {
  const times: number[] = []

  for (let index = 0; index < runs; index += 1) {
    const began = performance.now()
    decodeRelayed(message)
    times.push(performance.now() - began)
  }

  return median(times)
}

describe("decoding the relay's messages", () => {
  it("gives back a change's bytes as they were sent", () => {
    const [bytes] = decodeRelayed(relayedBatch(300))

    expect(bytes).toHaveLength(300)
    expect(bytes![1]).toBe(31)
  })

  it("decodes presence alone within budget", () => {
    expect(medianMs(relayedBatch())).toBeLessThan(0.5)
  })

  it("decodes one edit's change within budget", () => {
    expect(medianMs(relayedBatch(300))).toBeLessThan(0.5)
  })

  it("decodes a large paste's change within budget", () => {
    expect(medianMs(relayedBatch(64 * 1024))).toBeLessThan(50)
  })
})
