import { randomBytes, timingSafeEqual } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  accessibility,
  type AgentHost,
  answerRequest,
  exportPictures,
  type FrameRequest,
  type FrameResult,
  type TabSnapshot
} from "@parity-app/agent"
import { agentRegistry, entryPath, writeEntry } from "@parity-app/agent/registry"
import { registryVersion } from "@parity-app/agent/routing"
import { errorDetails } from "@parity-app/core"
import type { ServiceMethods, WindowMethods } from "../shared/protocol.ts"
import { renderJobMode } from "../shared/render-job.ts"
import { readConsole } from "./console.ts"
import { readCopyEnvironment } from "./environment.ts"
import { renderOffscreen } from "./render.ts"

interface WindowChannel {
  request<M extends keyof WindowMethods>(
    method: M,
    params: WindowMethods[M]["params"]
  ): Promise<WindowMethods[M]["result"]>
}

const screenshotDir = join(homedir(), ".parity", "screenshots")

/**
 * The local endpoint agents use (through `parity` or its MCP server). It listens on 127.0.0.1 only and requires the
 * token in this copy's agent registry entry, which only the person's own account can read.
 *
 * Every copy that runs has its own entry, and the CLI sends each call to the copy that has its project open
 * (PAR-514). The main process removes the entry when this copy quits.
 */
export async function startAgentServer(window: () => WindowChannel): Promise<void> {
  const token = randomBytes(24).toString("hex")
  const server = createServer((request, response) => {
    void handle(request, response, token, window)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("The agent server has no port")
  // The main process names the copy, so a service it restarts writes the same entry.
  const copy = readCopyEnvironment(process.env)
  const app = copy.PARITY_APP_PID ?? process.ppid
  const registry = agentRegistry(process.env, homedir())
  writeEntry(registry, {
    version: registryVersion,
    url: `http://127.0.0.1:${address.port}`,
    token,
    app,
    startedAt: copy.PARITY_APP_STARTED ?? Date.now()
  })
  console.log(`[service] agents connect at 127.0.0.1:${address.port} (${entryPath(registry, app)})`)
}

async function handle(request: IncomingMessage, response: ServerResponse, token: string, window: () => WindowChannel) {
  const reply = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" })
    response.end(JSON.stringify(body))
  }
  const given = Buffer.from(request.headers.authorization?.replace(/^Bearer /, "") ?? "")
  const expected = Buffer.from(token)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return reply(401, { error: "Wrong token" })
  if (request.method !== "POST" || request.url !== "/rpc") return reply(404, { error: "POST /rpc" })
  try {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    // Any local process with the token can send anything, so the body and its params are checked first (PAR-598).
    reply(200, { result: await answerRequest(Buffer.concat(chunks).toString("utf8"), desktopHost(window())) })
  } catch (error) {
    const details = errorDetails(error)
    reply(200, { error: error instanceof Error ? error.message : String(error), ...(details ? { details } : {}) })
  }
}

/**
 * The desktop's side of an agent call: the editor window's live tabs, the offscreen renderer, the console and the
 * screenshots folder. Which method does what is `dispatch` in `@parity-app/agent`.
 */
export function desktopHost(window: WindowChannel): AgentHost {
  return {
    tabs: () => window.request("agent.tabs", undefined),
    copy: () => window.request("agent.copy", undefined),
    open: (root) => window.request("agent.open", { root }),
    snapshot: (tab) => window.request("agent.snapshot", tab === undefined ? {} : { tab }),
    status: (request) => window.request("agent.status", request),
    presence: (events) => {
      window.request("agent.presence", events).catch(() => undefined)
    },
    render: (snapshot, request) => renderFrame(snapshot, request),
    iconNames: (tab, set, module) =>
      window.request("agent.iconNames", { tab, set, ...(module === undefined ? {} : { module }) }),
    apply: (tab, label, changes) => window.request("agent.apply", { tab, label, ...changes }),
    supports: (queries) => window.request("agent.supports", queries),
    console: (snapshot, clear) => readConsole(snapshot.guestUrl, clear),
    async saveScreenshots(screenshots) {
      await mkdir(screenshotDir, { recursive: true })
      const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-")
      return Promise.all(
        screenshots.map(async (shot, index) => {
          const path = join(screenshotDir, `${stamp}-${index + 1}-${shot.design}-${shot.state}-${shot.mode}.png`)
          await writeFile(path, Buffer.from(shot.png, "base64"))
          return path
        })
      )
    }
  }
}

/** Draws an agent's frame in the offscreen render window, with the tab's guest and theme. */
async function renderFrame(
  snapshot: TabSnapshot,
  { tree, mode, height, viewport, scale, capture, audit, colorTokens, tokens }: FrameRequest
): Promise<FrameResult> {
  const { frame, png } = await renderOffscreen(
    {
      projectId: snapshot.projectId,
      guestUrl: snapshot.guestUrl,
      ...(snapshot.addedComponents ? { components: snapshot.addedComponents } : {}),
      theme: snapshot.theme,
      tree,
      mode: renderJobMode(mode, { width: mode.width, ...(height === undefined ? {} : { height }), viewport }),
      scale,
      ...(audit ? { audit } : {}),
      ...(audit && colorTokens?.length ? { colorTokens } : {}),
      ...(tokens.length > 0 ? { previews: tokens } : {})
    },
    capture
  )
  return { ...frame, ...(png ? { png } : {}) }
}

/**
 * Renders designs to PNG files in a folder the person picked, through the same offscreen renderer agents use, without
 * showing agent activity on the canvas.
 */
export async function exportDesigns(
  window: WindowChannel,
  { projectId, folder, designs, scale }: ServiceMethods["designs.export"]["params"]
): Promise<ServiceMethods["designs.export"]["result"]> {
  const host = desktopHost(window)
  const { files, warnings } = await exportPictures(host, await host.snapshot(projectId), designs, scale)
  await mkdir(folder, { recursive: true })
  const paths: string[] = []
  for (const { name, png } of files) {
    const path = join(folder, name)
    await writeFile(path, Buffer.from(png, "base64"))
    paths.push(path)
  }
  return { files: paths, warnings }
}

/**
 * Checks a design's accessibility in every state, in the modes it shows, through the offscreen renderer, without
 * showing agent activity on the canvas.
 */
export async function checkAccessibility(
  window: WindowChannel,
  { projectId, design }: ServiceMethods["accessibility.check"]["params"]
): Promise<ServiceMethods["accessibility.check"]["result"]> {
  const host = desktopHost(window)
  return accessibility(host, await host.snapshot(projectId), design, { state: "all", mode: "shown" })
}
