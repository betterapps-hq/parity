import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  findRoutedStorybook,
  local,
  type PortlessState,
  projectDomains,
  readPortless,
  storybookEndpoint
} from "./portless.ts"

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

describe("findRoutedStorybook", () => {
  const portless: PortlessState = {
    routes: [
      { hostname: "shop-stories.localhost", port: 6100, pid: 1 },
      { hostname: "shop-fix-login-stories.localhost", port: 6200, pid: 2 },
      { hostname: "shop.localhost", port: 5100, pid: 3 }
    ],
    address: (hostname) => `https://${hostname}`
  }

  it("finds the Storybook under the project's own dev-domains name, though a worktree's serves the same stories", async () => {
    const domains = [
      { service: "app", hostname: "shop.localhost", origin: "https://shop.localhost" },
      { service: "stories", hostname: "shop-stories.localhost", origin: "https://shop-stories.localhost" }
    ]
    const storybooks = new Set([local(6100), local(6200)])
    expect(await findRoutedStorybook(portless, domains, (base) => Promise.resolve(storybooks.has(base)))).toEqual({
      url: local(6100),
      address: "https://shop-stories.localhost"
    })
  })

  it("without dev-domains, takes the only routed Storybook with the project's stories, and none of several", async () => {
    const serving = (bases: string[]) => (base: string) => Promise.resolve(bases.includes(base))
    expect(await findRoutedStorybook(portless, undefined, serving([local(6200)]))).toEqual({
      url: local(6200),
      address: "https://shop-fix-login-stories.localhost"
    })
    expect(await findRoutedStorybook(portless, undefined, serving([local(6100), local(6200)]))).toBeUndefined()
    expect(await findRoutedStorybook(portless, undefined, serving([]))).toBeUndefined()
  })
})

describe("storybookEndpoint", () => {
  it("is the stories endpoint, the package's own in a workspace", () => {
    const endpoint = (service: string) => ({ service, hostname: `${service}.localhost`, origin: "" })
    expect(storybookEndpoint([endpoint("app"), endpoint("stories")], "shop")?.service).toBe("stories")
    expect(storybookEndpoint([endpoint("admin-stories"), endpoint("web-stories")], "@shop/web")?.service).toBe(
      "web-stories"
    )
    expect(storybookEndpoint([endpoint("app")], "shop")).toBeUndefined()
  })
})

describe("projectDomains", () => {
  it("asks the project's own dev-domains for its names, in its folder", async () => {
    const root = join(state, "shop")
    const bin = join(root, "node_modules", "@buildkitgg", "dev-domains")
    await mkdir(bin, { recursive: true })
    await writeFile(join(bin, "package.json"), JSON.stringify({ bin: { "dev-domains": "cli.mjs" } }))
    // Prints one endpoint named after the folder it was asked about, as `urls --cwd` does.
    await writeFile(
      join(bin, "cli.mjs"),
      `const cwd = process.argv[process.argv.indexOf("--cwd") + 1]
const name = cwd.split(/[\\\\/]/).pop()
console.log(JSON.stringify([{ service: "stories", hostname: name + "-stories.localhost", origin: "https://" + name + "-stories.localhost", callbacks: [] }]))`
    )
    const domains = await projectDomains(root)
    expect(domains?.cli).toBe(join(bin, "cli.mjs"))
    expect(domains?.endpoints).toEqual([
      {
        service: "stories",
        hostname: "shop-stories.localhost",
        origin: "https://shop-stories.localhost",
        callbacks: []
      }
    ])
  })

  it("has none for a project without dev-domains", async () => {
    expect(await projectDomains(state)).toBeUndefined()
  })
})
