import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { readPortless } from "./portless.ts"

let state: string

beforeEach(async () => {
  state = await mkdtemp(join(tmpdir(), "parity-portless-"))
})

afterEach(async () => {
  await rm(state, { recursive: true, force: true })
})

const read = (path: string) => readFile(path, "utf8")

describe("readPortless", () => {
  it("leaves out routes whose process has ended, as Portless does", async () => {
    await writeFile(
      join(state, "routes.json"),
      JSON.stringify([
        { hostname: "shop.localhost", port: 4100, pid: 11 },
        { hostname: "gone.localhost", port: 4200, pid: 12 },
        { hostname: "static.localhost", port: 4300, pid: 0 }
      ])
    )
    await writeFile(join(state, "proxy.port"), "443")
    await writeFile(join(state, "proxy.tls"), "1")

    const portless = await readPortless(state, read, (pid) => pid === 11)

    expect(portless.routes.map((route) => route.hostname)).toEqual(["shop.localhost", "static.localhost"])
    expect(portless.address("shop.localhost")).toBe("https://shop.localhost")
  })

  it("leaves out a route it can't read, and takes the usual proxy for a port or TLS setting it can't", async () => {
    await writeFile(
      join(state, "routes.json"),
      JSON.stringify([
        { hostname: "shop.localhost", port: "4100" },
        { port: 4200 },
        { hostname: "blog.localhost", port: 4300 }
      ])
    )
    await writeFile(join(state, "proxy.port"), "eighty")
    await writeFile(join(state, "proxy.tls"), "maybe")

    const portless = await readPortless(state, read)

    expect(portless.routes.map((route) => route.hostname)).toEqual(["blog.localhost"])
    expect(portless.address("blog.localhost")).toBe("http://blog.localhost:443")
  })

  it("has no routes when routes.json isn't a list, isn't JSON, or isn't there", async () => {
    expect((await readPortless(state, read)).routes).toEqual([])
    await writeFile(join(state, "routes.json"), '{"routes": []}')
    expect((await readPortless(state, read)).routes).toEqual([])
    await writeFile(join(state, "routes.json"), '[{"hostname": "shop.loc')
    expect((await readPortless(state, read)).routes).toEqual([])
  })

  it("counts this process's own routes as running", async () => {
    await writeFile(
      join(state, "routes.json"),
      JSON.stringify([{ hostname: "shop.localhost", port: 4100, pid: process.pid }])
    )

    expect((await readPortless(state, read)).routes).toHaveLength(1)
  })
})
