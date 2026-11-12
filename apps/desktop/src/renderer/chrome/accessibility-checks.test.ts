import { defaultModeSettings } from "@parity-app/core"
import { newDesign } from "@parity-app/editor"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { ServiceMethods } from "../../shared/protocol.ts"
import { DesignStore } from "../design-store.ts"
import { preloadAnswers } from "../service.ts"
import { checksOf } from "./accessibility-checks.ts"

// docs/editor.md: checking a design again while it's being checked shows the newest check's reply (PAR-979).

type CheckResult = ServiceMethods["accessibility.check"]["result"]

/** A check the window asked the service for, waiting for the test to answer it. */
interface Asked {
  design: string
  answer: (result: CheckResult) => void
  fail: (error: Error) => void
}

let asked: Asked[] = []

beforeEach(() => {
  asked = []
  vi.stubGlobal("window", {
    canvasHost: {
      ask: preloadAnswers(
        (_method, params) =>
          new Promise((answer, fail) => {
            if (params && "design" in params) {
              asked.push({ design: params.design, answer, fail })
            }
          })
      )
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Lets the window's awaits run on. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const pricing = { ...newDesign("screen", [], { x: 0, y: 0 }), id: "pricing", name: "Pricing" }
const key = "app.par#pricing"

/** An open project holding Pricing, saved nowhere, with its checks. */
function openProject() {
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 4, containers: [pricing] } }],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )

  const checks = checksOf({ id: "/projects/app", store, untilClosed: () => undefined })

  /** Checks Pricing as it is now, and gives what was checked. */
  const check = () => {
    const entry = store.getEntry(key)!
    void checks.run(entry)

    return entry.container
  }

  /** Renames Pricing, so the next check checks something else. */
  const rename = (name: string) =>
    store.updateContainer(key, `Rename to ${name}`, (container) => ({ ...container, name }))

  return { checks, check, rename }
}

const reply = (frames: number): CheckResult => ({ findings: [], frames, warnings: [] })

describe("checking a design again before the last check answers", () => {
  it("shows the second check's result when the first one's lands after it", async () => {
    const { checks, check, rename } = openProject()
    check()
    rename("Plans")
    const second = check()
    expect(asked.map(({ design }) => design)).toEqual([key, key])
    asked[1]!.answer(reply(2))
    await settle()
    asked[0]!.answer(reply(1))
    await settle()
    expect(checks.get(key)).toMatchObject({ status: "done", frames: 2, container: second })
  })

  it("keeps checking when the first check's result lands before the second's", async () => {
    const { checks, check, rename } = openProject()
    check()
    rename("Plans")
    const second = check()
    asked[0]!.answer(reply(1))
    await settle()
    expect(checks.get(key)?.status).toBe("checking")
    asked[1]!.answer(reply(2))
    await settle()
    expect(checks.get(key)).toMatchObject({ status: "done", frames: 2, container: second })
  })

  it("ignores the first check failing after the second one's result", async () => {
    const { checks, check } = openProject()
    check()
    check()
    asked[1]!.answer(reply(2))
    await settle()
    asked[0]!.fail(new Error("The offscreen window closed."))
    await settle()
    expect(checks.get(key)).toMatchObject({ status: "done", frames: 2 })
  })
})
