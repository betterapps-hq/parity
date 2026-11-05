import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, beforeEach } from "vite-plus/test"

export function toolReply(stdout: string): unknown {
  return stdout
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line))
    .find((value) => value !== null && typeof value === "object" && "id" in value && value.id === 2)
}

/**
 * How long one CLI or MCP process may take. A start on CI's Windows runners, with every test file's processes and
 * Chrome on four cores, took more than 10 seconds (PAR-533); the limit stays under the test's own 20 there.
 */
const spawnLimit = process.env.CI ? 18_000 : 10_000

/**
 * The timeout for a test that starts CLI or MCP processes: two rounds of them at `spawnLimit`, so a slow start fails
 * with the fixture's own error rather than vitest's. Alone each takes about a fifth of a second, mostly Node loading
 * the CLI's modules, but starting processes slows under load far more than work inside the test does: with three full
 * runs at once, as several sessions' `pnpm verify` make, these tests took over the default 5 seconds (PAR-495).
 */
export const processTests = { timeout: 2 * spawnLimit }

/** Node's compile cache, shared by every CLI process the tests start, which saves about a quarter of each start. */
export const compileCache = { NODE_COMPILE_CACHE: join(tmpdir(), "parity-cli-compile-cache") }

/** The one project the fixture's app has open, which calls without a tab are routed to. */
export const fixtureTab = {
  id: "project",
  name: "Project",
  root: "/fixture/project",
  active: true,
  status: "ready",
  designs: 0
}

/** A tab's state with nothing in it, as the app answers `state` for an empty project. */
export function emptyState(tab: Record<string, unknown>) {
  return {
    tab,
    revision: "r1",
    selection: {},
    designs: [],
    overlaps: [],
    modes: [],
    components: [],
    tokens: { count: 0, semantic: [], themeCategories: [] }
  }
}

/**
 * Each test file owns its endpoint and subprocesses; no Electron or running app is needed. The endpoint answers the
 * CLI's routing question (`copy`) itself, with `fixture.tabs`, and records every other request.
 */
export function transportFixture(defaultResult: unknown) {
  const fixture: {
    response: unknown
    tabs: unknown[]
    directory: string
    requests: unknown[]
    run: typeof run
    mcp: typeof mcp
  } = {
    response: { result: defaultResult },
    tabs: [fixtureTab],
    directory: "",
    requests: [],
    run,
    mcp
  }
  const requests = fixture.requests

  const server = createServer(async (request, reply) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { method?: string }
    reply.setHeader("content-type", "application/json")
    if (body.method === "copy") {
      reply.end(JSON.stringify({ result: { tabs: fixture.tabs, focusedAt: 1 } }))
      return
    }
    requests.push(body)
    reply.end(JSON.stringify(fixture.response))
  })
  let directory = ""
  let agentFile = ""
  const bin = join(import.meta.dirname, "bin.ts")

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "parity-operation-contract-"))
    fixture.directory = directory
    agentFile = join(directory, "agent.json")
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Missing test server port")
    await writeFile(agentFile, JSON.stringify({ url: `http://127.0.0.1:${address.port}`, token: "contract-test" }))
  })
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    await rm(directory, { recursive: true, force: true })
  })
  beforeEach(() => {
    requests.length = 0
    fixture.response = { result: defaultResult }
    fixture.tabs = [fixtureTab]
  })

  function run(args: string[], input = "", env: Record<string, string | undefined> = {}) {
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], {
        env: {
          ...process.env,
          ...compileCache,
          PARITY_AGENT_FILE: agentFile,
          PARITY_AGENT_NAME: "Contract Caller",
          PARITY_AGENT_ID: "cli-session",
          ...env
        },
        stdio: ["pipe", "pipe", "pipe"]
      })
      let stdout = ""
      let stderr = ""
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk
      })
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk
      })
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error("Transport did not finish"))
      }, spawnLimit)
      child.on("error", (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on("close", (code) => {
        clearTimeout(timeout)
        resolve({ code, stdout, stderr })
      })
      // A process that exits before reading its input closes the pipe; its code and output say what happened.
      child.stdin.on("error", () => undefined)
      child.stdin.end(input)
    })
  }
  function mcp(input: Record<string, unknown>, name = "execute") {
    return run(
      ["mcp"],
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "Contract Caller" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: input } }
      ]
        .map((message) => JSON.stringify(message))
        .join("\n") + "\n"
    )
  }

  return fixture
}
