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

/** Each test file owns its endpoint and subprocesses; no Electron or running app is needed. */
export function transportFixture(defaultResult: unknown) {
  const fixture: { response: unknown; directory: string; requests: unknown[]; run: typeof run; mcp: typeof mcp } = {
    response: { result: defaultResult },
    directory: "",
    requests: [],
    run,
    mcp
  }
  const requests = fixture.requests

  const server = createServer(async (request, reply) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")))
    reply.setHeader("content-type", "application/json")
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
  })

  function run(args: string[], input = "", env: Record<string, string | undefined> = {}) {
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], {
        env: {
          ...process.env,
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
      }, 10_000)
      child.on("error", (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on("close", (code) => {
        clearTimeout(timeout)
        resolve({ code, stdout, stderr })
      })
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
