import { describe, expect, it, vi } from "vite-plus/test"
import { batched } from "./batch.ts"

describe("batched", () => {
  it("answers requests made together in one batch, each with its own answer", async () => {
    const run = vi.fn<(requests: number[]) => Promise<number[]>>(async (requests) =>
      requests.map((request) => request * 2)
    )

    const double = batched(run)

    await expect(Promise.all([double(1), double(2), double(3)])).resolves.toEqual([2, 4, 6])
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith([1, 2, 3])
  })

  it("splits a long run of requests into batches of its size", async () => {
    const run = vi.fn<(requests: number[]) => Promise<number[]>>(async (requests) => requests)
    const echo = batched(run, 2)

    await expect(Promise.all([1, 2, 3, 4, 5].map(echo))).resolves.toEqual([1, 2, 3, 4, 5])
    expect(run.mock.calls).toEqual([[[1, 2]], [[3, 4]], [[5]]])
  })

  it("asks again for requests made after a batch went", async () => {
    const run = vi.fn<(requests: string[]) => Promise<string[]>>(async (requests) => requests)
    const echo = batched(run)

    await echo("a")
    await echo("b")
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("fails each request of a batch that fails, or answers too few", async () => {
    const failing = batched(async () => Promise.reject(new Error("The host stopped")))

    await expect(failing(1)).rejects.toThrow("The host stopped")

    const short = batched(async (requests: number[]) => requests.slice(1))
    const [first, second] = await Promise.allSettled([short(1), short(2)])

    expect(first).toEqual({ status: "fulfilled", value: 2 })
    expect(second).toMatchObject({ status: "rejected" })
  })
})
