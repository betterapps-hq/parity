import { describe, expect, it } from "vite-plus/test"
import { followGuest, type GuestMoved, guestMove, newGuestPort, restartPort } from "./guest-ports.ts"

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
})

describe("followGuest", () => {
  const a = "http://127.0.0.1:5400/guest.js"
  const b = "http://127.0.0.1:5402/guest.js"

  /** A window that loads a moved guest or doesn't, as `answers` says in turn, and what it was told. */
  function editorWindow(...answers: boolean[]) {
    const told: GuestMoved[] = []
    return {
      told,
      tell: (moved: GuestMoved) => {
        told.push(moved)
        return Promise.resolve(answers.shift()!)
      }
    }
  }

  it("tells the window again on a restart to the same port after it couldn't load the move", async () => {
    const shown = editorWindow(false, true)
    // Restarted onto b, which the window doesn't load, so it still draws a.
    const drawn = await followGuest("D:/shop", a, b, shown.tell)
    expect(drawn).toBe(a)
    // Restarted again, back on b: the window is told again, and loads it this time.
    expect(await followGuest("D:/shop", drawn, b, shown.tell)).toBe(b)
    expect(shown.told).toEqual([
      { projectId: "D:/shop", guestUrl: b },
      { projectId: "D:/shop", guestUrl: b }
    ])
  })

  it("tells the window nothing on a restart to where it already draws the guest", async () => {
    const shown = editorWindow()
    expect(await followGuest("D:/shop", b, b, shown.tell)).toBe(b)
    expect(shown.told).toEqual([])
  })
})
