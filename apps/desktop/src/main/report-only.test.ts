import { describe, expect, it } from "vite-plus/test"
import { createReportOnlyGate } from "./report-only.ts"

describe("createReportOnlyGate", () => {
  it("lets only the report leave while it's sent with diagnostics off, then turns sending off again (PAR-813)", async () => {
    const gate = createReportOnlyGate()
    const sending = { enabled: false }
    const pending = Promise.withResolvers<string>()
    const sent = gate.run(sending, () => pending.promise)

    expect(sending.enabled).toBe(true)
    expect(gate.drop("an error", (item) => item)).toBeNull()

    pending.resolve("fb1")
    await expect(sent).resolves.toBe("fb1")
    expect(sending.enabled).toBe(false)
    expect(gate.drop("an error", (item) => item)).toBe("an error")
  })

  it("turns sending off again when the report fails", async () => {
    const gate = createReportOnlyGate()
    const sending = { enabled: false }

    await expect(gate.run(sending, () => Promise.reject(new Error("offline")))).rejects.toThrow("offline")
    expect(sending.enabled).toBe(false)
    expect(gate.drop("a log", (item) => item)).toBe("a log")
  })

  it("just sends while diagnostics are on, holding nothing back", async () => {
    const gate = createReportOnlyGate()
    const sending = { enabled: true }
    let during: string | null = null
    await gate.run(sending, async () => {
      during = gate.drop("a span", (item) => item)
    })

    expect(during).toBe("a span")
    expect(sending.enabled).toBe(true)
  })
})
