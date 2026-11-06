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
  framePictures,
  type FrameResult,
  type TabSnapshot
} from "@parity-app/agent"
import { agentRegistry, entryPath, writeEntry } from "@parity-app/agent/registry"
import { registryVersion } from "@parity-app/agent/routing"
import { errorDetails } from "@parity-app/core"
import { copyScale, planExport, planPicture } from "@parity-app/editor"
import { passedLink } from "../shared/account.ts"
import type { ServiceMethods, WindowMethods } from "../shared/protocol.ts"
import { renderJob } from "../shared/render-job.ts"
import { readConsole } from "./console.ts"
import { environment } from "./environment.ts"
import { mainProcess } from "./main-process.ts"
import { renderOffscreen } from "./render.ts"
import { composePicture, cutPicture } from "./webp.ts"

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
  const copy = environment()
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
  if (request.method === "POST" && request.url === "/auth/link") return passLinkToMain(request, reply)
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
 * A sign-in link another copy of Parity got from the browser (PAR-612). Main says whether it's the sign-in this copy is
 * waiting for, and takes it if so; only it has the PKCE verifier the code needs.
 */
async function passLinkToMain(request: IncomingMessage, reply: (status: number, body: unknown) => void) {
  try {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const passed = passedLink.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")))
    if (!passed.success) return reply(400, { error: "Expected { link }" })
    reply(200, await mainProcess.request("signInLink", passed.data))
  } catch (error) {
    reply(200, { taken: false, error: error instanceof Error ? error.message : String(error) })
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
  { design, state, tree, mode, height, viewport, scale, capture, audit, colorTokens, tokens }: FrameRequest
): Promise<FrameResult> {
  const { frame, png } = await renderOffscreen(
    renderJob(
      {
        projectId: snapshot.projectId,
        guestUrl: snapshot.guestUrl,
        ...(snapshot.addedComponents ? { components: snapshot.addedComponents } : {}),
        theme: snapshot.theme
      },
      {
        tree,
        mode,
        frame: { width: mode.width, ...(height === undefined ? {} : { height }), viewport },
        scale,
        ...(audit ? { audit } : {}),
        ...(colorTokens ? { colorTokens } : {}),
        tokens,
        design: { key: design, ...(state ? { state } : {}), mode: mode.id }
      }
    ),
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
 * Exports layers and designs for the Export section (PAR-185): each design drawn offscreen once at each scale asked
 * for, in the state the canvas shows and its main mode, and each file cut from it and written to `folder`. A file
 * that can't be written is a warning, and the rest are still written.
 */
export async function exportLayers(
  window: WindowChannel,
  { projectId, folder, layers, files }: ServiceMethods["layers.export"]["params"]
): Promise<ServiceMethods["layers.export"]["result"]> {
  const host = desktopHost(window)
  const snapshot = await host.snapshot(projectId)
  const designs = [...new Set(layers.map((layer) => layer.design))]
  const scales = [...new Set(files.map((file) => file.size.scale))]
  const { frames, warnings } = await framePictures(host, snapshot, designs, scales)
  // Designs are asked for by key, `path#id`; pictures name them by id.
  const byId = layers.map((layer) => ({ ...layer, design: layer.design.slice(layer.design.lastIndexOf("#") + 1) }))
  await mkdir(folder, { recursive: true })
  const written: string[] = []
  for (const { file, frame, crop, problem } of planExport(byId, files, frames)) {
    const picture = frame === undefined ? undefined : frames[frame]?.png
    if (problem || !picture || !crop) {
      warnings.push(problem ?? `${file.name}: its design didn't draw`)
      continue
    }
    const path = join(folder, file.name)
    await writeFile(path, await cutPicture(Buffer.from(picture, "base64"), crop, file.size.format))
    written.push(path)
  }
  return { files: written, warnings }
}

/**
 * Draws layers and designs as `exportLayers` does, at 2x, and puts them together as one PNG for the clipboard
 * (PAR-190), each design where it sits on the canvas (see `planPicture`). What can't be drawn is a warning; with
 * nothing drawn, there's no PNG.
 */
export async function layersPicture(
  window: WindowChannel,
  { projectId, layers }: ServiceMethods["layers.picture"]["params"]
): Promise<ServiceMethods["layers.picture"]["result"]> {
  const host = desktopHost(window)
  const snapshot = await host.snapshot(projectId)
  const designs = [...new Set(layers.map((layer) => layer.design))]
  const { frames, warnings } = await framePictures(host, snapshot, designs, [copyScale])
  // Designs are asked for by key, `path#id`; pictures name them by id.
  const byId = layers.map((layer) => ({ ...layer, design: layer.design.slice(layer.design.lastIndexOf("#") + 1) }))
  const { width, height, pieces, problems } = planPicture(byId, frames, copyScale)
  warnings.push(...problems)
  if (pieces.length === 0) return { warnings }
  const png = await composePicture(
    pieces.map(({ frame, crop, left, top }) => ({
      picture: Buffer.from(frames[frame]!.png, "base64"),
      crop,
      left,
      top
    })),
    width,
    height
  )
  return { png: png.toString("base64"), warnings }
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
