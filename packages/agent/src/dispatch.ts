import {
  CodedError,
  describeRenderStatus,
  designStates,
  renderProblem,
  resolveModes,
  unknownReference
} from "@parity-app/core"
import type { ChangeConflict, ImageCredit } from "@parity-app/core"
import {
  type CodeReference,
  cantRemove,
  filterImages,
  findImage,
  type FoundScreen,
  type ImageFile,
  projectImages
} from "@parity-app/editor"
import { z } from "zod"
import { type TokenFilter } from "./arguments.ts"
import { callerIdentity, presenceIdentity } from "./caller.ts"
import type { AgentMethod, AgentMethods } from "./contracts.ts"
import { isAgentMethod, readRequest, requests, rpcRequest } from "./contracts.ts"
import { activeTab, type CopyReport, matchTab } from "./routing.ts"
import { type ExecRequest, execute } from "./run.ts"
import { sheetLayout } from "./sheet.ts"
import type {
  AccessibilityFinding,
  AgentChangeSet,
  AgentEvent,
  AgentHooks,
  AgentReport,
  ComposedSheet,
  ConsoleEntry,
  ExecResult,
  FrameRequest,
  FrameResult,
  IconNames,
  PlaceableResult,
  PlacedIn,
  PresenceEvent,
  ReportSent,
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
  status(request: Params<"status">): Promise<Answer<"status">>
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
  /**
   * Keeps a call's screenshots or sheets as PNG files, and says where each went, in order. A name says what the picture
   * is, for its file's name.
   */
  saveScreenshots(pictures: { name: string; png: string }[]): Promise<string[]>
  /** Puts a contact sheet together: its overlay, with each frame's picture over it, as a base64 PNG (PAR-895). */
  composeSheet(sheet: ComposedSheet): Promise<string>
  /**
   * Sends an agent's report as a Sentry user feedback, with the window's screenshot and replay, tied to the call's trace
   * (PAR-646).
   */
  report(report: AgentReport): Promise<ReportSent>
  /**
   * Searches for screens from real apps (Mobbin's) with the key main holds, and saves each preview as a file (PAR-829).
   * A search that found nothing to show answers with why, rather than failing.
   */
  references(request: Params<"references">): Promise<Answer<"references">>
  /**
   * Fetches each picture and saves it as a file, as a search's previews are, for an agent to look at: the pictures of
   * the references on the canvas (PAR-889). Undefined for one that couldn't be fetched or saved.
   */
  pictures(pictures: { title: string; id: string; url: string }[]): Promise<(SavedPicture | undefined)[]>
  /** Searches stock pictures and videos the same way, from whichever connector is offered for them. */
  media(request: Params<"media">): Promise<Answer<"media">>
  /**
   * Saves a picture from a link into the project's images folder, as an edit the window can undo, for a result whose
   * link doesn't last or may only show results. Answers what layers set `src` to.
   */
  saveImage(projectId: string, image: { url: string; name: string }): Promise<{ src: string }>
  /** Main's own copy of a result it found lately, which placing puts in a design. Undefined for one it didn't find. */
  result(connector: string, id: string): Promise<PlaceableResult | undefined>
  /**
   * Main's own copy of a screen from a real app it found lately, from the connector named or the one that finds screens,
   * which `PlaceReference` places beside a design (PAR-840). Undefined for one it didn't find.
   */
  screen(id: string, connector: string | undefined): Promise<FoundScreen | undefined>
  /** Tells main a result went into a design, which main records, counts and tells the source of. */
  placed(placed: PlacedIn): Promise<void>
  /** The project's image files and the lines of its code that name them, read from its folder (PAR-834). */
  scanImages(projectId: string): Promise<{ files: ImageFile[]; references: CodeReference[] }>
  /** Removes an image file as an edit the window can undo. Refuses one the project's code names. */
  removeImage(projectId: string, path: string): Promise<{ path: string; label: string }>
}

/** Who's calling, when the CLI or MCP knows: its name for people, and an id that tells same-named callers apart. */
export interface Caller {
  name: string
  id: string
  /** The program it calls through, such as `claude-code`, which MCP clients name (PAR-630). */
  client?: string
  /** Its own name, when it's one of the subagents a session runs at once and says so (PAR-960). */
  subagent?: string
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

/** A picture saved as a file for an agent, with its bytes for MCP to show. */
export type SavedPicture = NonNullable<Answer<"placedReferences">["references"][number]["preview"]>

/** One call: the host, the caller's presence on a tab, and who's calling when it says. */
interface Call {
  host: AgentHost
  /** Sends the caller's events to a tab's canvas. */
  presence: (tab: string) => AgentHooks["presence"]
  caller?: Caller
}

/** How the app answers each method. */
type MethodTable = { [M in AgentMethod]: (params: Params<M>, call: Call) => Promise<Answer<M>> }

const methods: MethodTable = {
  tabs: (_params, { host }) => host.tabs(),
  copy: (_params, { host }) => host.copy(),
  open: (params, { host }) => host.open(params.root),
  async state(params, { host, presence }) {
    const snapshot = await host.snapshot(params.tab)

    return showing(presence(snapshot.tab.id), { kind: "board", label: "Look over the board" }, async () =>
      state(snapshot)
    )
  },
  exec: (params, { host, presence, caller }) => exec(host, presence, params.tab, params, caller),
  async screenshot(params, call) {
    const options = { state: params.state, mode: params.mode, scale: params.scale }

    const request = {
      label: `Screenshot ${params.design}`,
      code: `Print(await Screenshot(${JSON.stringify(params.design)}, ${JSON.stringify(options)}))`
    }

    // The snippet is Parity's own, so a failure has nothing for the agent to retry by editId.
    if (!params.sheet) {
      const { editId: _editId, ...result } = await exec(call.host, call.presence, params.tab, request)

      return result
    }

    const snapshot = await call.host.snapshot(params.tab)

    const {
      changes: _changes,
      editId: _editId,
      screenshots,
      ...result
    } = await runIn(call.host, call.presence, snapshot, request)

    return { ...result, screenshots: [], sheets: await contactSheets(call.host, snapshot, screenshots, params.scale) }
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
      host.console(snapshot, params.clear)
    )

    return { tab: tabRef(snapshot), entries }
  },
  async status(params, { host }) {
    const { tab, ...status } = await host.status(params)

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

    const filter: TokenFilter = {}

    if (params.category !== undefined) {
      filter.category = params.category
    }

    if (params.source !== undefined) {
      filter.source = params.source
    }

    if (params.search !== undefined) {
      filter.search = params.search
    }

    if (params.nearest !== undefined) {
      filter.nearest = params.nearest
    }

    return readOnly(snapshot).GetTokens(filter)
  },
  async components(params, { host }) {
    const snapshot = await host.snapshot(params.tab)

    return componentsReport(snapshot, readOnly(snapshot).Components())
  },
  async props(params, { host }) {
    const snapshot = await host.snapshot(params.tab)

    return readOnly(snapshot).Props(params.component, { all: params.all })
  },
  report: (params, { host }) => report(host, params),
  references: (params, { host }) => host.references(params),
  media: (params, { host }) => host.media(params),
  place: (params, call) => place(call.host, call.presence, params),
  async placedReferences(params, { host }) {
    const snapshot = await host.snapshot(params.tab)
    const placed = readOnly(snapshot).References(params.design)
    // A picture whose link has stopped working isn't asked for, and only the first `limit` are: each is a whole screen.
    const fresh = placed.filter((reference) => !reference.expired)
    const asked = fresh.slice(0, params.limit)
    const saved = await host.pictures(asked.map(({ app, id, picture }) => ({ title: app, id, url: picture })))
    // Paired by position, since nothing stops two files' references sharing an id.
    const previews = new Map(asked.map((reference, index) => [reference, saved[index]]))

    const references = placed.map((reference) => {
      const preview = previews.get(reference)

      return preview ? { ...reference, preview } : reference
    })

    const answer: Answer<"placedReferences"> = { tab: tabRef(snapshot), references }

    if (fresh.length > asked.length) {
      answer.withoutPictures = fresh.length - asked.length
    }

    return answer
  },
  images: async (params, { host }) => {
    const { images } = await imagesOf(host, params.tab)
    const found = filterImages(images, params)
    const shown = found.slice(0, params.limit)

    return { images: shown, total: found.length, truncated: shown.length < found.length }
  },
  async removeImage(params, { host }) {
    const { images, projectId } = await imagesOf(host, params.tab)
    const image = findImage(images, params.image)

    if (!image) {
      const names = images.flatMap((each) => (each.path ? [each.path] : []))

      throw unknownReference(
        "unknown_image",
        `No image in the project matches "${params.image}"`,
        params.image,
        names,
        "image"
      )
    }

    const why = cantRemove(images, params.image)

    if (why || !image.path) {
      const code = image.kind === "file" ? "image_in_use" : "invalid_input"

      throw new CodedError(why ?? `${params.image} has no file to remove.`, { code, field: "image" })
    }

    return host.removeImage(projectId, image.path)
  }
}

/** The tab's images, from its designs as they are, unsaved changes included, and its folder. */
async function imagesOf(host: AgentHost, tab: string | undefined) {
  const snapshot = await host.snapshot(tab)
  const { files, references } = await host.scanImages(snapshot.projectId)

  return { images: projectImages({ files, references, documents: snapshot.documents }), projectId: snapshot.projectId }
}

/** Each method's params schema. `copy` takes none, as `tabs` doesn't. */
const paramSchemas = { ...requests, copy: requests.tabs }

/**
 * Answers a `/rpc` request's body through `host` (PAR-598): checks it's a JSON object naming a method, then dispatches
 * it. A body that isn't fails with `invalid_input`, and a caller that doesn't say who it is gets no name on the canvas.
 */
export async function answerRequest(
  body: string,
  host: AgentHost,
  /** Told who's calling, when the caller says, so telemetry can tag what follows (PAR-630). */
  called?: (caller: Caller) => void
): Promise<Answer<AgentMethod>> {
  const { method, params, agent, agentId, client, subagent } = readRequest(rpcRequest, body)
  const caller = callerIdentity({ agent, agentId, client, subagent })

  if (caller) {
    called?.(caller)
  }

  return dispatch(method, params, host, caller)
}

/**
 * Runs an agent's call through `host`, once the method's schema in `contracts.ts` has read its params, with their
 * defaults. A method the app doesn't have, or params its schema refuses, fail with `invalid_input` naming the field,
 * before the host is asked anything. Its caller gets its own cursor on the canvas.
 */
export async function dispatch(
  method: string,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: an RPC body's params, which the method's schema reads here
  params: unknown,
  host: AgentHost,
  caller?: Caller
): Promise<Answer<AgentMethod>> {
  if (!isAgentMethod(method)) {
    throw new CodedError(`Unknown method ${method}. Methods: ${Object.keys(methods).join(", ")}`, {
      code: "invalid_input",
      field: "method"
    })
  }

  const request = readRequest(paramSchemas[method], params ?? {})

  const presence =
    (tab: string): AgentHooks["presence"] =>
    (events) =>
      host.presence(
        events.map((event) => (caller ? { tab, ...presenceIdentity(caller), ...event } : { tab, ...event }))
      )

  // SAFETY: `request` is what `method`'s own schema read, so it's the params `methods[method]` takes; TypeScript can't
  // tie the two to the same method through a union.
  const run = methods[method] as (params: Params<AgentMethod>, call: Call) => Promise<Answer<AgentMethod>>

  return run(request, { host, presence, caller })
}

/** The tab an answer is about, by id and name. */
type TabRef = Pick<TabSummary, "id" | "name">

function tabRef(snapshot: TabSnapshot): TabRef {
  return { id: snapshot.tab.id, name: snapshot.tab.name }
}

/**
 * What `parity components` reports: the components, the file each of the project's own is written in, the exports the type checker left out and why, the components
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
    // Where the project's own are written; a library's component is named by its package instead (PAR-167).
    files: Object.fromEntries(
      components.flatMap((id) => {
        const source = snapshot.sources?.[id]

        return source && !source.library ? [[id, source.path]] : []
      })
    ),
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
  // By file and id, since two files can hold designs with the same id.
  const references = new Map<string, number>()

  for (const { design } of api.References()) {
    if (design) {
      const where = `${design.file}#${design.id}`
      references.set(where, (references.get(where) ?? 0) + 1)
    }
  }

  return {
    tab: snapshot.tab,
    // Changes with every change to the tab's designs, modes or token edits; `status` says what's saved.
    revision: snapshot.revision,
    selection: api.Selection(),
    // Each design says how many references are for it, for the agent to look at before changing it (PAR-889).
    designs: api.Designs().map((design) => {
      const count = references.get(`${design.file}#${design.id}`)

      return count ? { ...design, references: count } : design
    }),
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

/**
 * Places a result a connector found in a design (PAR-829): the picture or video from main's own copy goes in the node
 * as one undoable edit, and only once it's applied is main told, which records it and tells the source. So a placement
 * is reported because Parity made it, not because an agent said so. An image node takes a picture, and a video node a
 * video (PAR-841), each with its description and its credit; a component takes either in a prop it declares. Only what
 * main says can be placed goes in designs: pictures and videos, not screens from real apps, which are for looking at. A
 * picture whose link stops working, and every video, is saved into the project first, and the node shows the file.
 */
async function place(host: AgentHost, presence: Call["presence"], request: Params<"place">): Promise<Answer<"place">> {
  const { connector, id, node, state } = request
  const found = await host.result(connector, id)

  if (!found) {
    return refused(`Parity hasn't found ${connector} ${id} lately. Search again, then place one of its results.`)
  }

  if (!found.placeable) {
    return refused(`${found.credit.at(-1)?.name ?? connector}'s ${found.kind} are for looking at, not for designs.`)
  }

  const snapshot = await host.snapshot(request.tab)
  const checked = placeTarget(snapshot, node, found, request.prop, state)

  if ("refusal" in checked) {
    return refused(checked.refusal)
  }

  const shown = await savedIfFleeting(host, snapshot.projectId, found)

  if ("refusal" in shown) {
    return refused(shown.refusal)
  }

  const target = shown === found ? checked : placeTarget(snapshot, node, shown, request.prop, state)

  if ("refusal" in target) {
    return refused(target.refusal)
  }

  let placedIn = target.design
  let warnings: string[] = []

  // Placing what the node already shows changes nothing, and is still reported, which main counts once.
  if (target.holds !== placedUrl(shown)) {
    const options = state ? `, ${JSON.stringify({ state })}` : ""

    const result = await execIn(host, presence, snapshot, {
      label: `Place ${found.title}`,
      code: `Update(${JSON.stringify(node)}, ${JSON.stringify(target.change)}${options})`
    })

    const changed = result.changes.designs[0]

    if (!result.applied || !changed) {
      // The run's own code, such as a conflict with an edit made since, says more than "invalid".
      const code = errorDetails.safeParse(result.details).data?.code

      return refused(result.error ?? `Nothing changed at ${node}.`, code)
    }

    placedIn = { path: changed.path, id: changed.id }
    warnings = result.warnings
  }

  await host.placed({ connector, id, project: snapshot.tab.root, file: placedIn.path, design: placedIn.id })

  const answer: Answer<"place"> = { placed: true, node, credit: found.credit }

  if (warnings.length > 0) {
    answer.warnings = warnings
  }

  return answer
}

/** What placing a result puts in a design: a video's footage, or its picture. */
function placedUrl(found: PlaceableResult): string {
  return found.video?.url ?? found.image.url
}

/**
 * A link that stops working would leave a broken picture in a saved design, so such a picture is saved into the
 * project's images folder first, and the node shows the file. A video is always saved into its videos folder, as the
 * Media tab saves one, since a stock library asks for a copy to be kept. Saving the same one again reuses its file.
 */
async function savedIfFleeting(
  host: AgentHost,
  projectId: string,
  found: PlaceableResult
): Promise<PlaceableResult | { refusal: string }> {
  if (found.image.expiresAt === undefined && !found.video) {
    return found
  }

  try {
    const { src } = await host.saveImage(projectId, { url: placedUrl(found), name: found.title })

    return found.video
      ? { ...found, video: { ...found.video, url: src } }
      : { ...found, image: { ...found.image, url: src } }
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause)

    return { refusal: `Parity couldn't save ${found.title} into the project: ${why}` }
  }
}

/** What `Update` gets to place a picture or video: an image's or a video's own fields, or a component's props. */
type PlaceChange = ImagePlace | { props: { [prop: string]: string } }

/** An image's or a video's own fields, as placing a picture or video sets them. */
interface ImagePlace {
  src: string
  alt: string
  credit?: ImageCredit
}

interface PlaceTarget {
  change: PlaceChange
  /** The picture or video the node already shows, to tell placing again from placing anew. */
  holds: unknown
  /** The design the node is in, for a placement that needed no edit. */
  design: { path: string; id: string }
}

/**
 * What placing into `path` changes, or why it can't take what was found: a picture in an image, a video in a video, or
 * either in a component's declared prop.
 */
function placeTarget(
  snapshot: TabSnapshot,
  path: string,
  found: PlaceableResult,
  prop: string | undefined,
  state: string | undefined
): PlaceTarget | { refusal: string } {
  const noop = { presence: () => undefined, render: () => Promise.reject(new Error("Not available")) }
  const workspace = new AgentWorkspace(workspaceSnapshot(snapshot), noop, "state")
  const located = workspace.locate(path)

  if (!located) {
    return { refusal: `There's no node at ${path}. Read the design with Get to find the image's path.` }
  }

  const { node, design } = located
  const [author, source] = found.credit
  const url = placedUrl(found)
  const media = found.video ? "video" : "image"

  if ((node.type === "image" || node.type === "video") && node.type !== media) {
    const what = found.video ? "a video" : "a picture"

    return {
      refusal: `${path} is ${node.type === "video" ? "a video" : "an image"}, which can't show ${what}. Place it in ${
        found.video ? "a video" : "an image"
      } or a component.`
    }
  }

  if (node.type === "image" || node.type === "video") {
    if (state) {
      const own = node.type === "video" ? "A video's footage" : "An image's picture"

      return { refusal: `${own} belongs to the whole design, not one state. Place it without a state.` }
    }

    const change: ImagePlace = { src: url, alt: found.title }

    if (author?.url) {
      change.credit = { name: author.name, url: author.url, source: source?.name }
    }

    return { change, holds: node.src, design }
  }

  if (node.type !== "component") {
    const what = found.video ? "a video" : "a picture"

    return {
      refusal: `${path} is a ${node.type}, which can't show ${what}. Place it in ${found.video ? "a video" : "an image"} or a component.`
    }
  }

  const declared = new Set(snapshot.props[node.component]?.props.map((each) => each.name) ?? [])
  const named = prop ?? "src"

  if (!declared.has(named)) {
    return { refusal: `${node.component} has no ${named} prop. Name the prop that takes the ${media} with prop.` }
  }

  const props = named === "src" && declared.has("alt") ? { src: url, alt: found.title } : { [named]: url }

  return { change: { props }, holds: node.props?.[named], design }
}

/** The code a failed run gives, when it gives one. */
const errorDetails = z.looseObject({ code: z.string() })

function refused(message: string, code = "invalid"): Answer<"place"> {
  return { placed: false, problem: { code, message } }
}

/** Runs a snippet in a tab, applies what it changed there, and keeps its screenshots as files. */
async function exec(
  host: AgentHost,
  presence: Call["presence"],
  tab: string | undefined,
  request: ExecRequest,
  caller?: Caller
): Promise<Answer<"exec">> {
  // What changed is for the editor and for placing, not the agent's answer, which names just the designs it created.
  const { changes, ...answer } = await execIn(host, presence, await host.snapshot(tab), request, caller)

  return { ...answer, createdDesigns: createdDesigns(changes) }
}

/** The designs a call created, by name: those the change set adds rather than changes. */
function createdDesigns(changes: AgentChangeSet): Record<string, string> {
  return Object.fromEntries(
    changes.designs.flatMap(({ base, after }) => (base === null && after ? [[after.name, after.id]] : []))
  )
}

async function execIn(
  host: AgentHost,
  presence: Call["presence"],
  snapshot: TabSnapshot,
  request: ExecRequest,
  caller?: Caller
): Promise<Answer<"exec"> & { changes: AgentChangeSet }> {
  const run: ExecRequest = { label: request.label || "Agent edit" }

  if (request.code !== undefined) {
    run.code = request.code
  }

  if (request.editId !== undefined) {
    run.editId = request.editId
  }

  if (request.edits !== undefined) {
    run.edits = request.edits
  }

  const { changes, screenshots, ...rest } = await runIn(host, presence, snapshot, run, caller)

  const paths =
    screenshots.length > 0
      ? await host.saveScreenshots(
          screenshots.map((shot) => ({ name: `${shot.design}-${shot.state}-${shot.mode}`, png: shot.png }))
        )
      : []

  return {
    ...rest,
    changes,
    screenshots: screenshots.map((shot, index) => ({
      path: paths[index] ?? "",
      png: shot.png,
      design: shot.design,
      state: shot.state,
      mode: shot.mode
    }))
  }
}

/** Runs a snippet in a tab and applies what it changed there, keeping its screenshots as pictures, not files. */
async function runIn(
  host: AgentHost,
  presence: Call["presence"],
  snapshot: TabSnapshot,
  run: ExecRequest,
  caller?: Caller
): Promise<ExecResult & { applied: boolean }> {
  const tabId = snapshot.tab.id
  const label = run.label || "Agent edit"

  const result = await execute(run, workspaceSnapshot(snapshot), {
    presence: presence(tabId),
    render: renderFor(host, snapshot),
    iconNames: (set, module) => host.iconNames(tabId, set, module),
    apply: (changes) => host.apply(tabId, label, changes),
    supports: (queries) => host.supports(queries),
    screen: (id, connector) => host.screen(id, connector),
    caller: caller?.name
  })

  const { changes } = result

  const hasChanges =
    changes.designs.length > 0 || !!changes.modes || changes.tokens.length > 0 || !!changes.references?.length

  return { ...result, applied: result.ok && hasChanges }
}

/**
 * Each design's screenshots as one labeled contact sheet, kept as a file (PAR-895): states in rows, modes in columns,
 * named as the canvas names them. `scale` is the pixel density the frames were drawn at.
 */
async function contactSheets(
  host: AgentHost,
  snapshot: TabSnapshot,
  screenshots: readonly Screenshot[],
  scale: number
): Promise<NonNullable<Answer<"screenshot">["sheets"]>> {
  const containers = new Map(
    snapshot.documents.flatMap(({ document }) => document.containers.map((container) => [container.id, container]))
  )

  const modes = new Map(resolveModes(snapshot.modes).map((mode) => [mode.id, mode.name]))
  const designs = [...new Set(screenshots.map((shot) => shot.design))]

  const sheets = await Promise.all(
    designs.map(async (design) => {
      const container = containers.get(design)
      const shots = screenshots.filter((shot) => shot.design === design)

      const layout = sheetLayout(
        container?.name ?? design,
        shots.map((shot) => ({
          state: {
            id: shot.state,
            name: (container && designStates(container).find((state) => state.id === shot.state)?.name) ?? shot.state
          },
          mode: { id: shot.mode, name: modes.get(shot.mode) ?? shot.mode },
          width: Math.round(shot.width * scale),
          height: Math.round(shot.height * scale)
        }))
      )

      const png = await host.composeSheet({
        width: layout.width,
        height: layout.height,
        overlay: layout.overlay,
        frames: layout.frames.map((frame) => ({ ...frame, png: shots[frame.index]!.png }))
      })

      return { design, png, layout }
    })
  )

  const paths =
    sheets.length > 0
      ? await host.saveScreenshots(sheets.map(({ design, png }) => ({ name: `${design}-sheet`, png })))
      : []

  return sheets.map(({ design, png, layout }, index) => ({
    design,
    path: paths[index] ?? "",
    png,
    width: layout.width,
    height: layout.height,
    scale: scale * layout.fit,
    frames: layout.frames.map(({ index: _index, ...frame }) => frame)
  }))
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

  if (!result.ok) {
    throw new Error(result.error ?? "The designs couldn't be rendered")
  }

  const containers = new Map(
    snapshot.documents.flatMap(({ document }) => document.containers.map((container) => [container.id, container]))
  )

  const modes = new Map(resolveModes(snapshot.modes).map((mode) => [mode.id, mode.name]))

  const perDesign = (design: string, field: "state" | "mode") =>
    new Set(result.screenshots.filter((shot) => shot.design === design).map((shot) => shot[field])).size

  const used = new Set<string>()

  const files = result.screenshots.map((shot) => {
    const container = containers.get(shot.design)
    const state = container && designStates(container).find((candidate) => candidate.id === shot.state)
    const parts = [container?.name ?? shot.design]

    if (perDesign(shot.design, "state") > 1) {
      parts.push(state?.name ?? shot.state)
    }

    if (perDesign(shot.design, "mode") > 1) {
      parts.push(modes.get(shot.mode) ?? shot.mode)
    }

    const base = fileName(parts.join(" ")) + (scale === 1 ? "" : `@${scale}x`)
    let name = `${base}.png`

    for (let copy = 2; used.has(name.toLowerCase()); copy++) {
      name = `${base} ${copy}.png`
    }

    used.add(name.toLowerCase())

    return { name, png: shot.png }
  })

  return { files, warnings: result.warnings }
}

/**
 * The name of the tab a report without a design is about, from the tabs' summaries, which list tabs still opening or
 * that failed to open: the one named, else the active one, and none when no project is open.
 */
async function reportedTab(host: AgentHost, reference: string | undefined): Promise<string | undefined> {
  const tabs = await host.tabs()

  if (reference === undefined || reference === activeTab) {
    return tabs.find((tab) => tab.active)?.name
  }

  const tab = matchTab(tabs, reference)

  if (tab) {
    return tab.name
  }

  const ids = tabs.map((candidate) => candidate.id)
  throw unknownReference("unknown_tab", `No open tab matches "${reference}"`, reference, ids, "tab")
}

/** The longest a Sentry tag's value may be. */
const tagLength = 200

/**
 * Sends a problem an agent saw (PAR-646): its message, tagged with what it's about, with the frames of the design it
 * names in the state it names (else the one it shows), drawn offscreen without the caller's cursor. Without a design,
 * it works with no project open, or one still opening or failed to open. A design or state that isn't there fails as
 * a screenshot of it would, so the tags only name real ones.
 */
async function report(host: AgentHost, params: Params<"report">): Promise<Answer<"report">> {
  // Only a design's frames need the tab ready, so a project that's opening or failed to open can still be reported.
  const snapshot = params.design === undefined ? undefined : await host.snapshot(params.tab)
  const tabName = snapshot?.tab.name ?? (await reportedTab(host, params.tab))
  const frames: AgentReport["frames"] = []
  let design: string | undefined
  let state = params.state

  if (snapshot && params.design !== undefined) {
    const options = params.state === undefined ? { mode: "shown" } : { mode: "shown", state: params.state }

    const result = await execute(
      { label: "Report", code: `await Screenshot(${JSON.stringify(params.design)}, ${JSON.stringify(options)})` },
      workspaceSnapshot(snapshot),
      { presence: () => undefined, render: renderFor(host, snapshot) }
    )

    if (!result.ok) {
      throw new CodedError(result.error ?? "The design couldn't be drawn", result.details ?? { code: "app_error" })
    }

    for (const shot of result.screenshots) {
      design = shot.design
      state ??= shot.state
      frames.push({ name: fileName(`${shot.design} ${shot.state} ${shot.mode}`) + ".png", png: shot.png })
    }
  }

  const named = {
    tab: tabName,
    design: design ?? params.design,
    state,
    node: params.node,
    test_run: params.testRun
  } satisfies Record<string, string | undefined>

  const tags: Record<string, string> = {}

  for (const [key, value] of Object.entries(named)) {
    if (value !== undefined) {
      tags[key] = value.slice(0, tagLength)
    }
  }

  const sent = await host.report({ message: params.message, tags, frames })

  return { ...sent, tags }
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

    if (!result.ok) {
      throw new Error(result.error ?? "The designs couldn't be rendered")
    }

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
