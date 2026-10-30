import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { findRoutedServer, local, type PortlessState, readPortless } from "./portless.ts"

let state: string

beforeEach(async () => {
  state = await mkdtemp(join(tmpdir(), "parity-portless-"))
  process.env.PORTLESS_STATE_DIR = state
})

afterEach(async () => {
  delete process.env.PORTLESS_STATE_DIR
  await rm(state, { recursive: true, force: true })
})

/** The ID of a process that has ended. */
function endedPid(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", ""])
    child.on("exit", () => resolve(child.pid!))
  })
}

describe("readPortless", () => {
  it("leaves out routes whose process has ended, as Portless does", async () => {
    await writeFile(
      join(state, "routes.json"),
      JSON.stringify([
        { hostname: "shop.localhost", port: 4100, pid: process.pid },
        { hostname: "gone.localhost", port: 4200, pid: await endedPid() },
        { hostname: "static.localhost", port: 4300, pid: 0 }
      ])
    )
    await writeFile(join(state, "proxy.port"), "443")
    await writeFile(join(state, "proxy.tls"), "1")
    const portless = await readPortless()
    expect(portless.routes.map((route) => route.hostname)).toEqual(["shop.localhost", "static.localhost"])
    expect(portless.address("shop.localhost")).toBe("https://shop.localhost")
  })
})

describe("findRoutedServer", () => {
  const portless: PortlessState = {
    routes: [
      { hostname: "shop-stories.localhost", port: 6100, pid: 1 },
      { hostname: "shop-fix-login-stories.localhost", port: 6200, pid: 2 },
      { hostname: "shop.localhost", port: 5100, pid: 3 },
      { hostname: "stories.shop.localhost", port: 6100, pid: 1 }
    ],
    address: (hostname) => `https://${hostname}`
  }
  const answering = (bases: string[]) => (base: string) => Promise.resolve(bases.includes(base))

  it("finds the only routed server that serves what's wanted, by its first name, whatever named it", async () => {
    expect(await findRoutedServer(portless, answering([local(6200)]), answering([]))).toEqual({
      url: local(6200),
      address: "https://shop-fix-login-stories.localhost"
    })
    expect(await findRoutedServer(portless, answering([local(6100)]), answering([]))).toEqual({
      url: local(6100),
      address: "https://shop-stories.localhost"
    })
    expect(await findRoutedServer(portless, answering([]), answering([]))).toBeUndefined()
  })

  it("takes this checkout's when a worktree's serves the same, and none when it can't tell", async () => {
    const both = answering([local(6100), local(6200)])
    expect(await findRoutedServer(portless, both, answering([local(6100)]))).toEqual({
      url: local(6100),
      address: "https://shop-stories.localhost"
    })
    expect(await findRoutedServer(portless, both, answering([]))).toBeUndefined()
    expect(await findRoutedServer(portless, both, both)).toBeUndefined()
  })
})
