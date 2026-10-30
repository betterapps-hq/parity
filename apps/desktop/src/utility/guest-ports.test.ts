import { describe, expect, it } from "vite-plus/test"
import { guestMove, newGuestPort, restartPort } from "./guest-ports.ts"

/** Hands out the given ports in turn, and calls free the ones not in `taken`. */
function finder(handed: number[], taken: number[] = []) {
  const queue = [...handed]
  return {
    free: () => Promise.resolve(queue.shift()!),
    isFree: (port: number) => Promise.resolve(!taken.includes(port))
  }
}

describe("newGuestPort", () => {
  it("passes over ports a guest was served on before", async () => {
    expect(await newGuestPort(new Set([5400, 5401]), finder([5400, 5401, 5402]))).toBe(5402)
  })
})

describe("restartPort", () => {
  it("takes the builder's last port back when it's free", async () => {
    expect(await restartPort(5400, new Set([5400]), finder([5500]))).toBe(5400)
  })

  it("takes a port no guest has used when the last one is taken", async () => {
    expect(await restartPort(5400, new Set([5400, 5401]), finder([5401, 5402], [5400]))).toBe(5402)
  })

  it("takes a new port when the builder never had one", async () => {
    expect(await restartPort(undefined, new Set(), finder([5402]))).toBe(5402)
  })
})

describe("guestMove", () => {
  it("tells the windows nothing when the builder kept its address", () => {
    expect(guestMove("D:/shop", "http://127.0.0.1:5400/guest.js", "http://127.0.0.1:5400/guest.js")).toBeUndefined()
  })

  it("tells the windows the project's new address when it moved", () => {
    expect(guestMove("D:/shop", "http://127.0.0.1:5400/guest.js", "http://127.0.0.1:5402/guest.js")).toEqual({
      projectId: "D:/shop",
      guestUrl: "http://127.0.0.1:5402/guest.js"
    })
  })

  it("tells the windows again when a move they couldn't load is followed by a restart on the same port", () => {
    // restartBuilder compares with where the windows draw the guest, which a failed move left at the old port.
    expect(guestMove("D:/shop", "http://127.0.0.1:5400/guest.js", "http://127.0.0.1:5402/guest.js")).toEqual({
      projectId: "D:/shop",
      guestUrl: "http://127.0.0.1:5402/guest.js"
    })
  })
})
