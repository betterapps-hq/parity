import { describe, expect, it } from "vite-plus/test"
import { retry } from "./retry.ts"

describe("retry", () => {
  it("stops at the first success", async () => {
    const codes = [1, 0, 1]
    const retried: number[] = []
    const status = await retry(() => codes.shift()!, { wait: 0, onRetry: (_code, attempt) => retried.push(attempt) })
    expect(status).toBe(0)
    expect(retried).toEqual([1])
    expect(codes).toEqual([1])
  })

  it("gives up after 3 tries with the last failure's code", async () => {
    const codes = [1, 2, 3, 0]
    const status = await retry(() => codes.shift()!, { wait: 0 })
    expect(status).toBe(3)
    expect(codes).toEqual([0])
  })

  it("runs a command that passes once", async () => {
    let runs = 0
    expect(await retry(() => (runs++, 0), { wait: 0 })).toBe(0)
    expect(runs).toBe(1)
  })
})
