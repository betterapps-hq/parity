import { describe, expect, it } from "vite-plus/test"
import { renderStatuses } from "./render-statuses.ts"

/** Lets the task's statuses settle: they're worked out once, after it. */
const settled = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe("renderStatuses", () => {
  it("gives each component drawn, once, and tells listeners once a task", async () => {
    const statuses = renderStatuses(() => false)
    let heard = 0
    statuses.subscribe(() => heard++)

    statuses.report.drawn("Card")
    statuses.report.drawn("Card")
    statuses.report.drawn("Badge")
    expect(statuses.get()).toEqual({})
    await settled()

    expect(statuses.get()).toEqual({ Card: { drawn: true }, Badge: { drawn: true } })
    expect(heard).toBe(1)
  })

  it("keeps a component failing while any of its boundaries shows an error, with the latest", async () => {
    const statuses = renderStatuses(() => false)
    statuses.report.drawn("Card")
    statuses.report.failed("Card", new Error("first"))
    statuses.report.failed("Card", new Error("second"))
    await settled()
    expect(statuses.get().Card).toEqual({ error: "second" })

    statuses.report.cleared("Card")
    await settled()
    expect(statuses.get().Card).toEqual({ error: "second" })

    statuses.report.cleared("Card")
    await settled()
    expect(statuses.get().Card).toEqual({ drawn: true })
  })

  it("doesn't count a component still loading as drawn", async () => {
    let loading = true
    const statuses = renderStatuses((name) => name === "Chart" && loading)

    statuses.report.drawn("Chart")
    await settled()
    expect(statuses.get()).toEqual({})

    loading = false
    statuses.report.drawn("Chart")
    await settled()
    expect(statuses.get()).toEqual({ Chart: { drawn: true } })
  })

  it("stops telling a listener once it stops, and ignores a component cleared that never failed", async () => {
    const statuses = renderStatuses(() => false)
    let heard = 0
    const stop = statuses.subscribe(() => heard++)
    stop()

    statuses.report.cleared("Card")
    statuses.report.drawn("Card")
    await settled()

    expect(heard).toBe(0)
    expect(statuses.get()).toEqual({ Card: { drawn: true } })
  })
})
