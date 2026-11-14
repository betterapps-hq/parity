import { describe, expect, it } from "vite-plus/test"
import { keepSpare } from "./spare.ts"

interface Child {
  id: number
  life: { running: boolean }
}

function children() {
  const started: Child[] = []

  const start = () => {
    const child = { id: started.length + 1, life: { running: true } }
    started.push(child)

    return child
  }

  return { started, start }
}

describe("keeping a spare child", () => {
  it("hands over the spare it started ahead, then starts the next one only when asked", () => {
    const { started, start } = children()
    const spare = keepSpare(start)

    spare.prepare()
    spare.prepare()
    expect(started).toHaveLength(1)
    expect(spare.take().id).toBe(1)
    expect(spare.take().id).toBe(2)
    expect(started).toHaveLength(2)
  })

  it("starts a fresh child in place of a spare that ended while it waited", () => {
    const { started, start } = children()
    const spare = keepSpare(start)

    spare.prepare()
    started[0]!.life.running = false
    expect(spare.take().id).toBe(2)
  })

  it("starts a new spare in place of one that ended", () => {
    const { started, start } = children()
    const spare = keepSpare(start)

    spare.prepare()
    started[0]!.life.running = false
    spare.prepare()
    expect(started).toHaveLength(2)
    expect(spare.take().id).toBe(2)
  })
})
