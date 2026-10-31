import { randomBytes, timingSafeEqual } from "node:crypto"
import { rmSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  type AccessibilityFinding,
  type AgentEvent,
  type AgentHooks,
  type AgentSnapshot,
  AgentWorkspace,
  execute,
  type ExecRequest,
  type ExecResult
} from "@parity-app/agent"
import { describeRenderStatus, modeGlobals, renderProblem, resolveModes } from "@parity-app/core"
import type { ServiceMethods, TabSnapshot, WindowMethods } from "../shared/protocol.ts"
import { readConsole } from "./console.ts"
import { renderOffscreen } from "./render.ts"

interface WindowChannel {
  request<M extends keyof WindowMethods>(
    method: M,
    params: WindowMethods[M]["params"]
  ): Promise<WindowMethods[M]["result"]>
}

/** Where the CLI and MCP find the running app: its local address and a per-launch token. */
export const agentFile = process.env.PARITY_AGENT_FILE ?? join(homedir(), ".parity", "agent.json")
const screenshotDir = join(homedir(), ".parity", "screenshots")

/**
 * The local endpoint agents use (through `parity` or its MCP server). It listens on 127.0.0.1 only and requires the
 * token written to the agent file, which only the person's own account can read.
 */
export async function startAgentServer(window: () => WindowChannel): Promise<void> {
  const token = randomBytes(24).toString("hex")
  const server = createServer((request, response) => {
    void handle(request, response, token, window)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("The agent server has no port")
  await mkdir(join(agentFile, ".."), { recursive: true })
  await writeFile(
    agentFile,
    JSON.stringify({ url: `http://127.0.0.1:${address.port}`, token, pid: process.pid }, null, 2),
    {
      mode: 0o600
    }
  )
  process.on("exit", () => rmSync(agentFile, { force: true }))
  console.log(`[service ${process.pid}] agents connect at 127.0.0.1:${address.port} (${agentFile})`)
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
    const { method, params, agent, agentId } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      method: string
      params?: Record<string, unknown>
      agent?: unknown
      agentId?: unknown
    }
    const text = (value: unknown, max: number) =>
      typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined
    const name = text(agent, 40)
    const caller = name ? { name, id: text(agentId, 80) ?? name } : undefined
    reply(200, { result: await call(method, params ?? {}, window(), caller) })
  } catch (error) {
    reply(200, { error: error instanceof Error ? error.message : String(error) })
  }
}

/** Who's calling, when the CLI or MCP knows: its name for people, and an id that tells same-named callers apart. */
interface Caller {
  name: string
  id: string
}

/** Runs an agent's call. Its caller gets its own cursor on the canvas. */
async function call(
  method: string,
  params: Record<string, unknown>,
  window: WindowChannel,
  caller: Caller | undefined
): Promise<unknown> {
  switch (method) {
    case "tabs":
      return window.request("agent.tabs", undefined)
    case "open":
      return window.request("agent.open", { root: String(params.root) })
    case "state": {
      const snapshot = await window.request("agent.snapshot", { tab: params.tab as string | undefined })
      const presence = presenceFor(window, snapshot.tab.id, caller)
      return showing(presence, { kind: "board", label: "Look over the board" }, async () => state(snapshot))
    }
    case "exec":
      return exec(window, params.tab as string | undefined, params as unknown as ExecRequest, caller)
    case "screenshot": {
      const options = { state: params.state, mode: params.mode, scale: params.scale }
      return exec(
        window,
        params.tab as string | undefined,
        {
          label: `Screenshot ${String(params.design)}`,
          code: `Print(await Screenshot(${JSON.stringify(params.design)}, ${JSON.stringify(options)}))`
        },
        caller
      )
    }
    case "accessibility": {
      const snapshot = await window.request("agent.snapshot", { tab: params.tab as string | undefined })
      const result = await accessibility(
        snapshot,
        String(params.design),
        { state: params.state ?? "all", mode: params.mode ?? "shown" },
        presenceFor(window, snapshot.tab.id, caller)
      )
      return { tab: { id: snapshot.tab.id, name: snapshot.tab.name }, ...result }
    }
    case "problems": {
      const snapshot = await window.request("agent.snapshot", { tab: params.tab as string | undefined })
      const { found, ...result } = await checkDesign(
        snapshot,
        String(params.design),
        `Look for problems in ${String(params.design)}`,
        presenceFor(window, snapshot.tab.id, caller),
        (api, design) => api.Problems(design, { state: params.state ?? "all", mode: params.mode ?? "shown" })
      )
      return { tab: { id: snapshot.tab.id, name: snapshot.tab.name }, ...result, problems: found }
    }
    case "console": {
      const snapshot = await window.request("agent.snapshot", { tab: params.tab as string | undefined })
      const presence = presenceFor(window, snapshot.tab.id, caller)
      const entries = await showing(presence, { kind: "console", label: "Read the console" }, () =>
        readConsole(snapshot.guestUrl, params.clear === true)
      )
      return { tab: { id: snapshot.tab.id, name: snapshot.tab.name }, entries }
    }
    // Reads for a terminal, which agents do in a snippet.
    case "tokens":
    case "components":
    case "props": {
      const snapshot = await window.request("agent.snapshot", { tab: params.tab as string | undefined })
      const api = readOnly(snapshot)
      if (method === "tokens") {
        const filter = { category: params.category, source: params.source, search: params.search }
        return api.GetTokens(filter as Parameters<ReadApi["GetTokens"]>[0])
      }
      if (method === "components") return componentsReport(snapshot, api.Components())
      return api.Props(String(params.component), { all: params.all === true })
    }
    default:
      throw new Error(
        `Unknown method ${method}. Methods: tabs, open, state, exec, screenshot, accessibility, problems, console, tokens, components, props`
      )
  }
}

/**
 * What `parity components` reports: the components, the exports the type checker left out and why, the components
 * failing to draw on the canvas and why, and the person's corrections in the main project file, saved or not.
 */
function componentsReport(snapshot: TabSnapshot, components: string[]) {
  const statuses = Object.entries(snapshot.renderStatus ?? {})
  const failing = statuses.flatMap(([id, status]) =>
    "error" in status ? [{ id, problem: renderProblem(status.error), reason: describeRenderStatus(status) }] : []
  )
  const main = snapshot.documents.find((entry) => entry.path === snapshot.mainDocument)?.document
  const listed = main?.detection?.include ?? []
  return {
    components,
    iconLibraries: snapshot.iconSets.map((set) => set.id),
    // Less what the person listed by hand, which are components now.
    leftOut: (snapshot.leftOut ?? []).filter(
      (entry) => !listed.some((ref) => ref.path === entry.path && ref.export === entry.export)
    ),
    drawn: statuses.length - failing.length,
    failing,
    corrections: main?.detection ?? {}
  }
}

/** Sends a caller's events to its tab's canvas, where its cursor shows what it's doing. */
function presenceFor(window: WindowChannel, tab: string, caller: Caller | undefined): AgentHooks["presence"] {
  return (events) => {
    void window
      .request(
        "agent.presence",
        events.map((event) => ({ tab, ...(caller ? { agent: caller.name, agentId: caller.id } : {}), ...event }))
      )
      .catch(() => undefined)
  }
}

/** Runs a call that isn't a snippet, showing it on the canvas the way a snippet shows: started, doing what, done. */
async function showing<T>(
  presence: AgentHooks["presence"],
  event: AgentEvent & { label: string },
  run: () => Promise<T>
): Promise<T> {
  presence([{ kind: "start", label: event.label }, event])
  try {
    const result = await run()
    presence([{ kind: "end", label: event.label }])
    return result
  } catch (error) {
    presence([{ kind: "end", label: event.label, error: error instanceof Error ? error.message : String(error) }])
    throw error
  }
}

function toAgentSnapshot(snapshot: TabSnapshot): AgentSnapshot {
  return {
    tab: snapshot.tab.id,
    components: snapshot.components,
    iconSets: snapshot.iconSets,
    tokens: snapshot.tokens,
    theme: snapshot.theme,
    modes: snapshot.modes,
    documents: snapshot.documents,
    mainDocument: snapshot.mainDocument,
    props: snapshot.props,
    selection: snapshot.selection,
    bounds: snapshot.bounds
  }
}

/** Everything an agent needs to get its bearings in a tab, in one read. */
async function state(snapshot: TabSnapshot) {
  const noop = { presence: () => undefined, render: () => Promise.reject(new Error("Not available")) }
  const api = new AgentWorkspace(toAgentSnapshot(snapshot), noop, "state").api() as {
    Designs(): unknown
    Selection(): unknown
    Overlaps(): unknown
  }
  const semantic = snapshot.tokens.filter((token) => token.source === "semantic")
  return {
    tab: snapshot.tab,
    selection: api.Selection(),
    designs: api.Designs(),
    /** Boards on top of each other, to move apart. */
    overlaps: api.Overlaps(),
    modes: resolveModes(snapshot.modes).map((mode) => ({
      id: mode.id,
      name: mode.name,
      width: mode.width,
      primary: mode === resolveModes(snapshot.modes)[0]
    })),
    components: snapshot.components,
    tokens: {
      count: snapshot.tokens.length,
      semantic: semantic.map((token) => token.name),
      themeCategories: [
        ...new Set(snapshot.tokens.filter((token) => token.source === "theme").map((token) => token.category))
      ]
    },
    viewport: snapshot.viewport,
    /**
     * What Parity found in the project and where: the package manager, each tool's installed version and config, and
     * a notice when the version cutoff drops any of them.
     */
    detection: snapshot.detection
  }
}

/** Draws an agent's frames in the offscreen render window, with the tab's guest and theme. */
function renderFor(snapshot: TabSnapshot): AgentHooks["render"] {
  return async ({ tree, mode, height, scale, capture, audit }) => {
    const { frame, png } = await renderOffscreen(
      {
        projectId: snapshot.projectId,
        guestUrl: snapshot.guestUrl,
        ...(snapshot.addedComponents ? { components: snapshot.addedComponents } : {}),
        theme: snapshot.theme,
        tree,
        mode: {
          width: mode.width,
          height,
          classNames: mode.classNames,
          attributes: mode.attributes,
          globals: modeGlobals(mode)
        },
        scale,
        ...(audit ? { audit } : {})
      },
      capture
    )
    return { ...frame, ...(png ? { png } : {}) }
  }
}

async function exec(
  window: WindowChannel,
  tab: string | undefined,
  request: ExecRequest,
  caller: Caller | undefined
): Promise<
  Omit<ExecResult, "changes" | "screenshots"> & {
    applied: boolean
    screenshots: { path: string; png: string; design: string; state: string; mode: string }[]
  }
> {
  const snapshot = await window.request("agent.snapshot", { tab })
  const tabId = snapshot.tab.id
  const result = await execute(
    { label: request.label || "Agent edit", code: request.code, editId: request.editId, edits: request.edits },
    toAgentSnapshot(snapshot),
    {
      presence: presenceFor(window, tabId, caller),
      render: renderFor(snapshot),
      iconNames: (set, module) =>
        window.request("agent.iconNames", { tab: tabId, set, ...(module === undefined ? {} : { module }) })
    }
  )
  const { changes, screenshots, ...rest } = result
  const hasChanges = changes.documents.length > 0 || !!changes.modes || changes.tokens.length > 0
  if (result.ok && hasChanges) {
    await window.request("agent.apply", { tab: tabId, label: request.label || "Agent edit", ...changes })
  }
  await mkdir(screenshotDir, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-")
  const saved = await Promise.all(
    screenshots.map(async (shot, index) => {
      const path = join(screenshotDir, `${stamp}-${index + 1}-${shot.design}-${shot.state}-${shot.mode}.png`)
      await writeFile(path, Buffer.from(shot.png, "base64"))
      return { path, png: shot.png, design: shot.design, state: shot.state, mode: shot.mode }
    })
  )
  return { ...rest, applied: result.ok && hasChanges, screenshots: saved }
}

/**
 * Renders designs to PNGs in a folder the person picked, through the same offscreen renderer agents use, without
 * showing agent activity on the canvas. Each design is exported in every state, in its main mode and the modes beside
 * it; file names say which, when there's more than one.
 */
export async function exportDesigns(
  window: WindowChannel,
  { projectId, folder, designs, scale }: ServiceMethods["designs.export"]["params"]
): Promise<ServiceMethods["designs.export"]["result"]> {
  const snapshot = await window.request("agent.snapshot", { tab: projectId })
  const options = JSON.stringify({ state: "all", mode: "shown", scale })
  const result = await execute(
    {
      label: "Export",
      code: `for (const design of ${JSON.stringify(designs)}) await Screenshot(design, ${options})`
    },
    toAgentSnapshot(snapshot),
    {
      presence: () => undefined,
      render: renderFor(snapshot)
    }
  )
  if (!result.ok) throw new Error(result.error ?? "The designs couldn't be rendered")
  const containers = new Map(
    snapshot.documents.flatMap(({ document }) => document.containers.map((container) => [container.id, container]))
  )
  const modes = new Map(resolveModes(snapshot.modes).map((mode) => [mode.id, mode.name]))
  const perDesign = (design: string, field: "state" | "mode") =>
    new Set(result.screenshots.filter((shot) => shot.design === design).map((shot) => shot[field])).size
  await mkdir(folder, { recursive: true })
  const used = new Set<string>()
  const files: string[] = []
  for (const shot of result.screenshots) {
    const container = containers.get(shot.design)
    const state = container?.states.find((candidate) => candidate.id === shot.state)
    const parts = [container?.name ?? shot.design]
    if (perDesign(shot.design, "state") > 1) parts.push(state?.name ?? shot.state)
    if (perDesign(shot.design, "mode") > 1) parts.push(modes.get(shot.mode) ?? shot.mode)
    const base = fileName(parts.join(" ")) + (scale === 1 ? "" : `@${scale}x`)
    let name = `${base}.png`
    for (let copy = 2; used.has(name.toLowerCase()); copy++) name = `${base} ${copy}.png`
    used.add(name.toLowerCase())
    const path = join(folder, name)
    await writeFile(path, Buffer.from(shot.png, "base64"))
    files.push(path)
  }
  return { files, warnings: result.warnings }
}

/**
 * Checks a design's accessibility in every state, in the modes it shows, through the offscreen renderer, without
 * showing agent activity on the canvas.
 */
export async function checkAccessibility(
  window: WindowChannel,
  { projectId, design }: ServiceMethods["accessibility.check"]["params"]
): Promise<ServiceMethods["accessibility.check"]["result"]> {
  const snapshot = await window.request("agent.snapshot", { tab: projectId })
  return accessibility(snapshot, design, { state: "all", mode: "shown" })
}

/**
 * Checks a design in the states and modes asked for, as `Accessibility()` does for agents. With `presence`, an agent's
 * cursor shows it checking each frame.
 */
async function accessibility(
  snapshot: TabSnapshot,
  design: string,
  options: { state: unknown; mode: unknown },
  presence: AgentHooks["presence"] = () => undefined
): Promise<ServiceMethods["accessibility.check"]["result"] & { design: { id: string; name: string } }> {
  const { found, ...result } = await checkDesign(
    snapshot,
    design,
    `Check ${design}'s accessibility`,
    presence,
    (api, reference) => api.Accessibility(reference, options)
  )
  return { ...result, findings: found }
}

/** The agent API's checks, which render frames offscreen. */
interface CheckApi {
  Accessibility(design: string, options: { state: unknown; mode: unknown }): Promise<AccessibilityFinding[]>
  Problems(
    design: string,
    options: { state: unknown; mode: unknown }
  ): Promise<{ state: string; mode: string; problem: string; node?: string }[]>
  GetDesign(reference: string): { id: string; name: string }
}

/**
 * Runs one of the agent API's checks on a design outside a snippet, counting the frames it renders. With `presence`,
 * an agent's cursor shows it working, as it would in a snippet.
 */
async function checkDesign<T>(
  snapshot: TabSnapshot,
  design: string,
  label: string,
  presence: AgentHooks["presence"],
  check: (api: CheckApi, design: string) => Promise<T>
): Promise<{ design: { id: string; name: string }; found: T; frames: number; warnings: string[] }> {
  let frames = 0
  const render = renderFor(snapshot)
  const workspace = new AgentWorkspace(
    toAgentSnapshot(snapshot),
    {
      presence,
      render: (request) => {
        frames++
        return render(request)
      }
    },
    label
  )
  const api = workspace.api() as unknown as CheckApi
  workspace.emit({ kind: "start" })
  try {
    const found = await check(api, design)
    const { id, name } = api.GetDesign(design)
    workspace.emit({ kind: "end" })
    return { design: { id, name }, found, frames, warnings: workspace.result().warnings }
  } catch (error) {
    workspace.emit({ kind: "end", error: error instanceof Error ? error.message : String(error) })
    throw error
  } finally {
    workspace.flush()
  }
}

/** The agent API's reads, for calls that only look. */
interface ReadApi {
  GetTokens(filter?: { category?: string; source?: string; search?: string }): unknown[]
  Components(): string[]
  Props(component: string, options?: { all?: boolean }): unknown
}

function readOnly(snapshot: TabSnapshot): ReadApi {
  const noop = { presence: () => undefined, render: () => Promise.reject(new Error("Not available")) }
  return new AgentWorkspace(toAgentSnapshot(snapshot), noop, "Read").api() as unknown as ReadApi
}

/** A name that's safe as a file name on every system: no reserved characters, no control characters. */
function fileName(name: string): string {
  const kept = name
    .split("")
    .filter((character) => character >= " " && !'<>:"/\\|?*'.includes(character))
    .join("")
  return (
    kept
      .replaceAll(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/, "") || "design"
  )
}
