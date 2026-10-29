import { createServer } from "node:net"
import { describe, expect, it } from "vitest"
import { freePort, portFree } from "./index.ts"

describe("portFree", () => {
  it("tells a port something listens on from one that's free again", async () => {
    const port = await freePort()
    expect(await portFree(port)).toBe(true)
    const listener = createServer()
    await new Promise<void>((resolve) => listener.listen(port, "127.0.0.1", resolve))
    try {
      expect(await portFree(port)).toBe(false)
    } finally {
      await new Promise((resolve) => listener.close(resolve))
    }
    expect(await portFree(port)).toBe(true)
  })
})
