import { CodedError, describeRenderStatus, renderProblem, resolveModes } from "@parity-app/core"
import type { ChangeConflict } from "@parity-app/core"
import type { AgentMethod, AgentMethods } from "./contracts.ts"
import { isAgentMethod } from "./contracts.ts"
import type { CopyReport } from "./routing.ts"
import { type ExecRequest, execute } from "./run.ts"
import type {
  AccessibilityFinding,
  AgentChangeSet,
  AgentEvent,
  AgentHooks,
  ConsoleEntry,
  FrameRequest,
  FrameResult,
  IconNames,
  PresenceEvent,
  Screenshot,
  TabSnapshot,
  TabSummary
} from "./types.ts"
import { type AgentApi, AgentWorkspace, type MatrixOptions } from "./workspace.ts"

/**
 * The app's half of an agent call (PAR-564): which method does what, its defaults, the caller's presence on the canvas,
 * the frames a check draws and the answer's shape. What only the desktop can do comes through an `AgentHost`: the
 * editor window's live tabs, the offscreen renderer, the console and saving screenshots. The desktop app is one host,
 * and the tests' fixture tab is another.
 */
export interface AgentHost {
  /** The window's tabs. */
  tabs(): Promise<TabSummary[]>
  /** The window's tabs and when it last had focus, which the CLI routes calls by (PAR-514). */
  copy(): Promise<CopyReport<TabSummary>>
  /** Opens a project in a tab, or finds the tab that has it. */
  open(root: string): Promise<TabSummary>
  /** A tab's live state, by id, root or name, or the active tab without one. */
  snapshot(tab: string | undefined): Promise<TabSnapshot>
  /** Where a tab's edits stand. Reading it changes nothing. */
  status(request: { tab?: string; summary: boolean; limit?: number }): Promise<Answer<"status">>
  /** Shows what a caller is doing on its tab's canvas. It's only shown, so a failure is ignored. */
  presence(events: PresenceEvent[]): void
  /** Draws one of a tab's frames offscreen. */
  render(snapshot: TabSnapshot, request: FrameRequest): Promise<FrameResult>
  /** An icon set's names in one style's module, from the tab's own copy of the set. */
  iconNames(tab: string, set: string, module: string | undefined): Promise<IconNames>
  /** Applies a call's changes in a tab as one undoable step, or gives back what conflicted and applies nothing. */
  apply(tab: string, label: string, changes: AgentChangeSet): Promise<ChangeConflict[]>
  /**
   * Whether the window's browser takes each value for its CSS property (`CSS.supports`), which says whether a
   * `SetTokens` value is its token's kind (PAR-584).
   */
  supports(queries: { property: string; value: string }[]): Promise<boolean[]>
  /** What the tab's project code wrote to the console, forgotten once read when `clear` is set. */
  console(snapshot: TabSnapshot, clear: boolean): Promise<ConsoleEntry[]>
  /** Keeps a call's screenshots as PNG files, and says where each went, in order. */
  saveScreenshots(screenshots: Screenshot[]): Promise<string[]>
}

/** Who's calling, when the CLI or MCP knows: its name for people, and an id that tells same-named callers apart. */
export interface Caller {
  name: string
  id: string
}

/**
 * A type with its index signatures taken out, all the way down, so an interface the agent declares can be checked
 * against an answer's schema, whose objects stay open.
 */
type Known<T> = T extends readonly (infer Item)[]
  ? Known<Item>[]
  : T extends object
    ? { [K in keyof T as string extends K ? never : number extends K ? never : K]: Known<T[K]> }
    : T

/** What the app answers a method with, as its schema in `contracts.ts` reads it. */
export type Answer<M extends AgentMethod> = Known<AgentMethods[M]["result"]>

type Params<M extends AgentMethod> = AgentMethods[M]["params"]

/** One call: the host, and the caller's presence on a tab. */
interface Call {
  host: AgentHost
  /** Sends the caller's events to a tab's canvas. */
  presence: (tab: string) => AgentHooks["presence"]
}

const methods: { [M in AgentMethod]: (params: Params<M>, call: Call) => Promise<Answer<M>> } = {
  tabs: (_params, { host }) => host.tabs(),
  copy: (_params, { host }) => host.copy(),
  open: (params, { host }) => host.open(params.root),
  async state(params, { host, presence }) {
    const snapshot = await host.snapshot(params.tab)
    return showing(presence(snapshot.tab.id), { kind: "board", label: "Look over the board" }, async () =>
      state(snapshot)
    )
  },
  exec: (params, { host, presence }) => exec(host, presence, params.tab, params),
  async screenshot(params, call) {
    const options = { state: params.state, mode: params.mode, scale: params.scale }
    // The snippet is Parity's own, so a failure has nothing for the agent to retry by editId.
    const { editId: _editId, ...result } = await exec(call.host, call.presence, params.tab, {
      label: `Screenshot ${params.design}`,
      code: `Print(await Screenshot(${JSON.stringify(params.design)}, ${JSON.stringify(options)}))`
    })
    return result
  },
  async accessibility(params, { host, presence }) {
    const snapshot = await host.snapshot(params.tab)
    const result = await accessibility(
      host,
      snapshot,
      params.design,
      { state: params.state ?? "all", mode: params.mode ?? "shown" },
      presence(snapshot.tab.id)
    )
    return { tab: tabRef(snapshot), ...result }
  },
  async problems(params, { host, presence }) {
    const snapshot = await host.snapshot(params.tab)
    const options = { state: params.state ?? "all", mode: params.mode ?? "shown" }
    const { found, ...result } = await checkDesign(
      host,
      snapshot,
      params.design,
      `Look for problems in ${params.design}`,
      presence(snapshot.tab.id),
      (api, design) => api.Problems(design, options)
    )
    return { tab: tabRef(snapshot), ...result, problems: found }
  },
  async console(params, { host, presence }) {
    const snapshot = await host.snapshot(params.tab)
    const entries = await showing(presence(snapshot.tab.id), { kind: "console", label: "Read the console" }, () =>
      host.console(snapshot, params.clear === true)
    )
    return { tab: tabRef(snapshot), entries }
  },
  async status(params, { host }) {
    const { tab, ...status } = await host.status({
      ...(params.tab === undefined ? {} : { tab: params.tab }),
      summary: params.summary === true,
      ...(params.limit === undefined ? {} : { limit: params.limit })
    })
    return { tab: { id: tab.id, name: tab.name }, ...status }
  },
  async modes(params, { host }) {
    const snapshot = await host.snapshot(params.tab)
    const { settings: _settings, ...report } = readOnly(snapshot).GetModes(params.design)
    return { tab: tabRef(snapshot), ...report }
  },
  // Reads for a terminal, which agents do in a snippet.
  async tokens(params, { host }) {
    const snapshot = await host.snapshot(params.tab)
    const filter = {
      ...(params.category === undefined ? {} : { category: params.category }),
      ...(params.source === undefined ? {} : { source: params.source }),
      ...(params.search === undefined ? {} : { search: params.search })
    }
    return readOnly(snapshot).GetTokens(filter)
  },
  async components(params, { host }) {
    const snapshot = await host.snapshot(params.tab)
    return componentsReport(snapshot, readOnly(snapshot).Components())
  },
  async props(params, { host }) {
    const snapshot = await host.snapshot(params.tab)
    return readOnly(snapshot).Props(params.component, { all: params.all === true }) as Answer<"props">
  }
}

/**
 * Runs an agent's call through `host`. Its params are as the CLI sends them once its schema has read them; a method
 * the app doesn't have fails with `invalid_input`. Its caller gets its own cursor on the canvas.
 */
export function dispatch(method: string, params: unknown, host: AgentHost, caller?: Caller): Promise<unknown> {
  if (!isAgentMethod(method)) {
    return Promise.reject(
      new CodedError(`Unknown method ${method}. Methods: ${Object.keys(methods).join(", ")}`, {
        code: "invalid_input",
        field: "method"
      })
    )
  }
  const presence =
    (tab: string): AgentHooks["presence"] =>
    (events) =>
      host.presence(
        events.map((event) => ({ tab, ...(caller ? { agent: caller.name, agentId: caller.id } : {}), ...event }))
      )
  const run = methods[method] as (params: unknown, call: Call) => Promise<unknown>
  return run(params ?? {}, { host, presence })
}

function tabRef(snapshot: TabSnapshot): { id: string; name: string } {
  return { id: snapshot.tab.id, name: snapshot.tab.name }
}

/**
 * What `parity components` reports: the components, the exports the type checker left out and why, the components
 * failing to draw on the canvas and why, and the person's corrections in the main project file, saved or not.
 */
function componentsReport(snapshot: TabSnapshot, components: string[]): Answer<"components"> {
  const statuses = Object.entries(snapshot.renderStatus ?? {})
  const failing = statuses.flatMap(([id, status]) =>
    "error" in status ? [{ id, problem: renderProblem(status.error), reason: describeRenderStatus(status) }] : []
  )
  const main = snapshot.documents.find((entry) => entry.path === snapshot.mainDocument)?.document
  const listed = main?.detection?.include ?? []
  return {
    components,
    iconLibraries: (snapshot.iconSets ?? []).map((set) => set.id),
    // Less what the person listed by hand, which are components now.
    leftOut: (snapshot.leftOut ?? []).filter(
      (entry) => !listed.some((ref) => ref.path === entry.path && ref.export === entry.export)
    ),
    drawn: statuses.length - failing.length,
    failing,
    corrections: main?.detection ?? {}
  }
}

/**
 * Runs `run` with the caller's cursor showing it, as a snippet shows: started, doing what, then done or failed. Calls
 * that aren't snippets go through it; a snippet's run emits the same events itself.
 */
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

/** The workspace's view of a tab: the tab's state as it is, with the tab's id. */
function workspaceSnapshot(snapshot: TabSnapshot) {
  return { ...snapshot, tab: snapshot.tab.id }
}

/** Everything an agent needs to get its bearings in a tab, in one read. */
function state(snapshot: TabSnapshot): Answer<"state"> {
  const noop = { presence: () => undefined, render: () => Promise.reject(new Error("Not available")) }
  const api = new AgentWorkspace(workspaceSnapshot(snapshot), noop, "state").api()
  const semantic = snapshot.tokens.filter((token) => token.source === "semantic")
  return {
    tab: snapshot.tab,
    // Changes with every change to the tab's designs, modes or token edits; `status` says what's saved.
    revision: snapshot.revision,
    selection: api.Selection(),
    designs: api.Designs(),
    // Boards on top of each other, to move apart.
    overlaps: api.Overlaps(),
    // resolveModes makes new objects on every call, so the first one is the primary mode by position (PAR-579).
    modes: resolveModes(snapshot.modes).map((mode, index) => ({
      id: mode.id,
      name: mode.name,
      width: mode.width,
      primary: index === 0
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
    // What Parity found in the project and where: the package manager, each tool's installed version and config, and
    // a notice when the version cutoff drops any of them.
    detection: snapshot.detection
  }
}

/** Draws a tab's frames for an agent through the host's offscreen renderer. */
function renderFor(host: AgentHost, snapshot: TabSnapshot): AgentHooks["render"] {
  return (request) => host.render(snapshot, request)
}

/** Runs a snippet in a tab, applies what it changed there, and keeps its screenshots as files. */
async function exec(
  host: AgentHost,
  presence: Call["presence"],
  tab: string | undefined,
  request: ExecRequest
): Promise<Answer<"exec">> {
  const snapshot = await host.snapshot(tab)
  const tabId = snapshot.tab.id
  const label = request.label || "Agent edit"
  const result = await execute(
    {
      label,
      ...(request.code === undefined ? {} : { code: request.code }),
      ...(request.editId === undefined ? {} : { editId: request.editId }),
      ...(request.edits === undefined ? {} : { edits: request.edits })
    },
    workspaceSnapshot(snapshot),
    {
      presence: presence(tabId),
      render: renderFor(host, snapshot),
      iconNames: (set, module) => host.iconNames(tabId, set, module),
      apply: (changes) => host.apply(tabId, label, changes),
      supports: (queries) => host.supports(queries)
    }
  )
  const { changes, screenshots, ...rest } = result
  const hasChanges = changes.designs.length > 0 || !!changes.modes || changes.tokens.length > 0
  const paths = screenshots.length > 0 ? await host.saveScreenshots(screenshots) : []
  return {
    ...rest,
    applied: result.ok && hasChanges,
    screenshots: screenshots.map((shot, index) => ({
      path: paths[index] ?? "",
      png: shot.png,
      design: shot.design,
      state: shot.state,
      mode: shot.mode
    }))
  }
}

/**
 * Renders designs to PNGs, as the window's Export does: each design in every state, in its main mode and the modes
 * beside it, without showing agent activity on the canvas. Each picture comes with a file name that says which, when
 * there's more than one, and doesn't repeat another's, ignoring case.
 */
export async function exportPictures(
  host: AgentHost,
  snapshot: TabSnapshot,
  designs: string[],
  scale: number
): Promise<{ files: { name: string; png: string }[]; warnings: string[] }> {
  const options = JSON.stringify({ state: "all", mode: "shown", scale })
  const result = await execute(
    { label: "Export", code: `for (const design of ${JSON.stringify(designs)}) await Screenshot(design, ${options})` },
    workspaceSnapshot(snapshot),
    { presence: () => undefined, render: renderFor(host, snapshot) }
  )
  if (!result.ok) throw new Error(result.error ?? "The designs couldn't be rendered")
  const containers = new Map(
    snapshot.documents.flatMap(({ document }) => document.containers.map((container) => [container.id, container]))
  )
  const modes = new Map(resolveModes(snapshot.modes).map((mode) => [mode.id, mode.name]))
  const perDesign = (design: string, field: "state" | "mode") =>
    new Set(result.screenshots.filter((shot) => shot.design === design).map((shot) => shot[field])).size
  const used = new Set<string>()
  const files = result.screenshots.map((shot) => {
    const container = containers.get(shot.design)
    const state = container?.states.find((candidate) => candidate.id === shot.state)
    const parts = [container?.name ?? shot.design]
    if (perDesign(shot.design, "state") > 1) parts.push(state?.name ?? shot.state)
    if (perDesign(shot.design, "mode") > 1) parts.push(modes.get(shot.mode) ?? shot.mode)
    const base = fileName(parts.join(" ")) + (scale === 1 ? "" : `@${scale}x`)
    let name = `${base}.png`
    for (let copy = 2; used.has(name.toLowerCase()); copy++) name = `${base} ${copy}.png`
    used.add(name.toLowerCase())
    return { name, png: shot.png }
  })
  return { files, warnings: result.warnings }
}

/**
 * Each design drawn offscreen once at each scale, in the state the canvas shows and its main mode, with every layer's
 * box, for the Export section to cut layers from (PAR-185). Each picture names its design by id. A design that didn't
 * draw is a warning.
 */
export async function framePictures(
  host: AgentHost,
  snapshot: TabSnapshot,
  designs: string[],
  scales: number[]
): Promise<{ frames: (Screenshot & { scale: number })[]; warnings: string[] }> {
  const frames: (Screenshot & { scale: number })[] = []
  const warnings: string[] = []
  for (const scale of scales) {
    const result = await execute(
      {
        label: "Export",
        code: `for (const design of ${JSON.stringify(designs)}) await Screenshot(design, ${JSON.stringify({ scale })})`
      },
      workspaceSnapshot(snapshot),
      { presence: () => undefined, render: renderFor(host, snapshot) }
    )
    if (!result.ok) throw new Error(result.error ?? "The designs couldn't be rendered")
    frames.push(...result.screenshots.map((shot) => ({ ...shot, scale })))
    warnings.push(...result.warnings)
  }
  return { frames, warnings }
}

/**
 * Checks a design in the states and modes asked for, as `Accessibility()` does for agents. With `presence`, an agent's
 * cursor shows it checking each frame; without, nothing shows on the canvas, as for the window's own check.
 */
export async function accessibility(
  host: AgentHost,
  snapshot: TabSnapshot,
  design: string,
  options: MatrixOptions,
  presence: AgentHooks["presence"] = () => undefined
): Promise<{
  design: { id: string; name: string }
  findings: AccessibilityFinding[]
  frames: number
  warnings: string[]
}> {
  const { found, ...result } = await checkDesign(
    host,
    snapshot,
    design,
    `Check ${design}'s accessibility`,
    presence,
    (api, reference) => api.Accessibility(reference, options)
  )
  return { ...result, findings: found }
}

/**
 * Runs one of the agent API's checks on a design outside a snippet, counting the frames it renders. With `presence`,
 * an agent's cursor shows it working, as it would in a snippet.
 */
async function checkDesign<T>(
  host: AgentHost,
  snapshot: TabSnapshot,
  design: string,
  label: string,
  presence: AgentHooks["presence"],
  check: (api: AgentApi, design: string) => Promise<T>
): Promise<{ design: { id: string; name: string }; found: T; frames: number; warnings: string[] }> {
  let frames = 0
  const render = renderFor(host, snapshot)
  const workspace = new AgentWorkspace(
    workspaceSnapshot(snapshot),
    {
      presence,
      render: (request) => {
        frames++
        return render(request)
      }
    },
    label
  )
  const api = workspace.api()
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

/** The agent API, for calls that only read. */
function readOnly(snapshot: TabSnapshot): AgentApi {
  const noop = { presence: () => undefined, render: () => Promise.reject(new Error("Not available")) }
  return new AgentWorkspace(workspaceSnapshot(snapshot), noop, "Read").api()
}

/** A name that's safe as a file name on every system: no reserved characters, no control characters. */
export function fileName(name: string): string {
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
