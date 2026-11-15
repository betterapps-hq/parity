import { createServer } from "node:net"
import { describe, expect, it } from "vite-plus/test"
import { choosePort, freePort, portFree } from "./ports.ts"

/** Listens on a port until the returned function closes it again. */
async function occupy(port: number): Promise<() => Promise<void>> {
  const listener = createServer()
  await new Promise<void>((resolve) => listener.listen(port, resolve))

  return () => new Promise((resolve) => listener.close(() => resolve()))
}

describe("ports", () => {
  it("tells a port something listens on from one that's free again", async () => {
    const port = await freePort()
    expect(await portFree(port)).toBe(true)
    const close = await occupy(port)

    try {
      expect(await portFree(port)).toBe(false)
    } finally {
      await close()
    }

    expect(await portFree(port)).toBe(true)
  })

  it("chooses the port asked for while it's free, and another once it's taken", async () => {
    const port = await freePort()
    expect(await choosePort(port)).toBe(port)
    const close = await occupy(port)

    try {
      expect(await choosePort(port)).not.toBe(port)
    } finally {
      await close()
    }
  })
})
