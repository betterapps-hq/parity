import { describe, expect, it } from "vite-plus/test"
import { serviceRestarts } from "./service-restarts.ts"

const policy = { delaysMs: [0, 1000, 5000], steadyMs: 60_000 }
const crash = { exitCode: 1, ranMs: 2000, expected: false }

/** Restarts that have used every delay on crashes soon after starting. */
function usedUp() {
  const restarts = serviceRestarts(policy)

  for (const _delay of policy.delaysMs) {
    restarts.exited(crash)
  }

  return restarts
}

describe("serviceRestarts", () => {
  it("starts a crashed service again at once, then waits longer after each crash that follows soon after", () => {
    const restarts = serviceRestarts(policy)

    expect([restarts.exited(crash), restarts.exited(crash), restarts.exited(crash)]).toEqual([0, 1000, 5000])
  })

  it("leaves a service stopped once it has crashed soon after starting every time it was allowed", () => {
    const restarts = usedUp()

    expect(restarts.exited(crash)).toBeUndefined()
    expect(restarts.exited(crash)).toBeUndefined()
  })

  it("starts over once a service has run steadily before it crashes", () => {
    const restarts = usedUp()

    expect(restarts.exited({ ...crash, ranMs: 60_000 })).toBe(0)
    expect(restarts.exited(crash)).toBe(1000)
  })

  it("doesn't start a service main ended, or one that ended cleanly", () => {
    const restarts = serviceRestarts(policy)

    expect(restarts.exited({ ...crash, expected: true })).toBeUndefined()
    expect(restarts.exited({ ...crash, exitCode: 0 })).toBeUndefined()
    expect(restarts.exited(crash)).toBe(0)
  })

  it("restarts after a crash with any other code, such as a kill's", () => {
    expect(serviceRestarts(policy).exited({ ...crash, exitCode: -1 })).toBe(0)
    expect(serviceRestarts(policy).exited({ ...crash, exitCode: 15 })).toBe(0)
  })
})
