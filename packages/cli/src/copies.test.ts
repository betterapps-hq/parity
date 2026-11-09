import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"
import { operations } from "./operations.ts"
import { compileCache, emptyState, processTests, toolReply } from "./transport-fixture.ts"

/**
 * The CLI against two running copies of the app, each with its own project open (PAR-514): every call reaches the copy
 * that has its project, whichever copy started first.
 */
interface FakeCopy {
  app: number
  startedAt: number
  tabs: { id: string; name: string; root: string; active: boolean; status: string; designs: number }[]
  focusedAt: number
  requests: { method: string; params: Record<string, unknown> }[]
  server?: Server
}

const shop = "/work/shop"
const blog = "/work/blog"

const person: FakeCopy = {
  app: process.pid,
  startedAt: 1000,
  tabs: [{ id: shop, name: "shop", root: shop, active: true, status: "ready", designs: 0 }],
  focusedAt: 5000,
  requests: []
}

const session: FakeCopy = {
  app: process.ppid,
  startedAt: 2000,
  tabs: [{ id: blog, name: "blog", root: blog, active: true, status: "ready", designs: 0 }],
  focusedAt: 6000,
  requests: []
}

/** A copy that quit without removing its entry: no process, nothing listening. */
const gone = { version: 1, url: "http://127.0.0.1:9", token: "gone", app: 2 ** 31 - 2, startedAt: 500 }

let registry = ""
const bin = join(import.meta.dirname, "bin.ts")

beforeAll(async () => {
  registry = await mkdtemp(join(tmpdir(), "parity-copies-"))

  for (const copy of [person, session]) {
    copy.server = createServer(async (request, reply) => {
      const chunks: Buffer[] = []

      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk))
      }

      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        method: string
        params: Record<string, unknown>
      }

      reply.setHeader("content-type", "application/json")

      if (body.method === "copy") {
        reply.end(JSON.stringify({ result: { tabs: copy.tabs, focusedAt: copy.focusedAt } }))

        return
      }

      copy.requests.push({ method: body.method, params: body.params })
      const tab = { id: body.params.tab, name: "x", root: body.params.tab, active: true, status: "ready", designs: 0 }
      reply.end(JSON.stringify({ result: emptyState(tab) }))
    })
    await new Promise<void>((resolve) => copy.server!.listen(0, "127.0.0.1", resolve))
    const address = copy.server.address()

    if (!address || typeof address === "string") {
      throw new Error("No port")
    }

    const entry = {
      version: 1,
      url: `http://127.0.0.1:${address.port}`,
      token: "t",
      app: copy.app,
      startedAt: copy.startedAt
    }

    await writeFile(join(registry, `${copy.app}.json`), JSON.stringify(entry))
  }
})

afterAll(async () => {
  for (const copy of [person, session]) {
    await new Promise((resolve) => copy.server?.close(resolve))
  }

  await rm(registry, { recursive: true, force: true })
})

beforeEach(async () => {
  person.requests.length = 0
  session.requests.length = 0
  await writeFile(join(registry, `${gone.app}.json`), JSON.stringify(gone))
})

function run(args: string[], cwd = tmpdir(), input?: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args, ...(input === undefined ? ["--json"] : [])], {
      cwd,
      env: {
        ...process.env,
        ...compileCache,
        PARITY_AGENT_FILE: undefined,
        PARITY_AGENT_DIR: registry,
        HOME: registry,
        USERPROFILE: registry
      },
      stdio: ["pipe", "pipe", "pipe"]
    })

    // A process that exits before reading its input closes the pipe; its code and output say what happened.
    child.stdin.on("error", () => undefined)
    child.stdin.end(input ?? "")
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk))
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

/** The same call through the MCP server: its structured result, or its error. */
async function tool(name: string, input: Record<string, unknown>, cwd = tmpdir()) {
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "Copies" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: input } }
  ]

  const lines = messages.map((message) => JSON.stringify(message) + "\n").join("")
  const { stdout } = await run(["mcp"], cwd, lines)
  const reply = toolReply(stdout) as { result?: { structuredContent?: unknown } } | undefined

  return reply?.result?.structuredContent
}

describe("routing between copies", processTests, () => {
  it("routes MCP tools exactly as the CLI routes commands", async () => {
    await Promise.all([tool("get_app_state", { tab: "blog" }), tool("get_app_state", { tab: "active" })])
    expect(person.requests).toEqual([])
    expect(session.requests).toEqual([
      { method: "state", params: { tab: blog } },
      { method: "state", params: { tab: blog } }
    ])

    const [tabs, listed, state, unknown] = await Promise.all([
      run(["tabs"]),
      tool("get_tabs", {}),
      run(["state", "--tab", "docs"]),
      tool("get_app_state", { tab: "docs" })
    ])

    expect(listed).toEqual(JSON.parse(tabs.stdout))
    expect(unknown).toEqual(JSON.parse(state.stdout))
  })

  it("sends each call to the copy that has its project open", async () => {
    const codes = await Promise.all([run(["state", "--tab", "shop"]), run(["state", "--tab", blog])])
    expect(codes.map((result) => result.code)).toEqual([0, 0])
    expect(person.requests).toEqual([{ method: "state", params: { tab: shop } }])
    expect(session.requests).toEqual([{ method: "state", params: { tab: blog } }])
  })

  it("sends --tab active to the copy focused last, and lists every copy's projects", async () => {
    const [state, tabs] = await Promise.all([run(["state", "--tab", "active"]), run(["tabs"])])
    expect(state.code).toBe(0)
    expect(session.requests).toEqual([{ method: "state", params: { tab: blog } }])
    const listed = JSON.parse(tabs.stdout) as { tabs: { id: string; active: boolean }[] }
    expect(listed.tabs.map((tab) => [tab.id, tab.active])).toEqual([
      [shop, false],
      [blog, true]
    ])
  })

  it("sends a call without a tab to the project the folder is in", async () => {
    const folder = join(registry, "work")
    await mkdir(folder, { recursive: true })
    person.tabs = [{ id: folder, name: "work", root: folder, active: false, status: "ready", designs: 0 }]

    try {
      expect((await run(["state"], folder)).code).toBe(0)
      expect(person.requests).toEqual([{ method: "state", params: { tab: folder } }])
    } finally {
      person.tabs = [{ id: shop, name: "shop", root: shop, active: true, status: "ready", designs: 0 }]
    }
  })

  it("says what is open when no copy has the project, without calling either", async () => {
    const result = await run(["state", "--tab", "docs"])
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stdout).error).toMatchObject({
      code: "unknown_tab",
      message: `No open tab matches "docs". Tabs: ${shop}, ${blog}`
    })
    expect([...person.requests, ...session.requests]).toEqual([])
  })

  it("removes the entry of a copy that has quit", async () => {
    await run(["tabs"])
    expect(existsSync(join(registry, `${gone.app}.json`))).toBe(false)
    expect(existsSync(join(registry, `${person.app}.json`))).toBe(true)
  })
})

describe("each operation's routing", () => {
  it("follows its fields: a tab goes to its copy, a root opens in one, and the list asks them all", () => {
    const routing = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, operation.routing]))
    expect(routing).toEqual({
      tabs: "copies",
      open: "open",
      state: "tab",
      status: "tab",
      modes: "tab",
      screenshot: "tab",
      problems: "tab",
      accessibility: "tab",
      console: "tab",
      tokens: "tab",
      components: "tab",
      props: "tab",
      report: "tab-or-any"
    })
  })
})
