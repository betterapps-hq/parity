import { describe, expect, it } from "vite-plus/test"
import { TabSlot } from "./tab-slot.ts"
import type { ProjectSession } from "./workspace.ts"

// SAFETY: the slot only hands the session on; these tests tell sessions apart by identity.
// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- a stand-in session, which the slot never reads
const session = (name: string) => ({ name }) as unknown as ProjectSession

describe("TabSlot", () => {
  it("starts what waited for the session once it opens, and what comes after at once", () => {
    const slot = new TabSlot("p")
    const heard: string[] = []
    const opened = session("first")

    slot.when((given) => {
      heard.push(`early ${given === opened}`)

      return () => heard.push("early stopped")
    })

    expect(heard).toEqual([])
    slot.open(opened)
    slot.when(() => {
      heard.push("late")

      return () => heard.push("late stopped")
    })

    expect(slot.session).toBe(opened)
    expect(heard).toEqual(["early true", "late"])
  })

  it("stops what started when it's stopped or the tab closes, and starts nothing after", () => {
    const slot = new TabSlot("p")
    const heard: string[] = []
    const stop = slot.when(() => () => heard.push("one stopped"))
    slot.when(() => () => heard.push("two stopped"))
    slot.open(session("s"))

    stop()
    slot.close()
    slot.when(() => {
      heard.push("after close")

      return () => undefined
    })

    expect(heard).toEqual(["one stopped", "two stopped"])
  })

  it("stops what never started without calling it", () => {
    const slot = new TabSlot("p")
    let started = false

    const stop = slot.when(() => {
      started = true

      return () => undefined
    })

    stop()
    slot.open(session("s"))
    expect(started).toBe(false)
  })
})
