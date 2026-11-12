import type { AccessibilityFinding } from "@parity-app/agent"
import {
  checkRequest,
  connectors,
  type RecentSearch,
  remember,
  type SearchAnswer,
  searchAnswer
} from "@parity-app/connectors"
import {
  type ComponentInfo,
  type ContainerSpec,
  defaultModeSettings,
  type DesignNode,
  designStates,
  parseData
} from "@parity-app/core"
import {
  type CodeReference,
  type ImageFile,
  imagesFolder,
  mediaExtension,
  mediumOfType,
  videosFolder
} from "@parity-app/editor"
import discovered from "virtual:parity/example-project"
import { z } from "zod"
import desktop from "../../../package.json"
import { type AccountState, type SignedInAccount, type SignInAttempt, signedOut } from "../../shared/account.ts"
import type { ConnectorSearch } from "../../shared/connectors.ts"
import type {
  CanvasHost,
  ProjectEditResult,
  ProjectInfo,
  ProjectProcess,
  ServiceMethod,
  ServiceMethods,
  TelemetryState
} from "../../shared/protocol.ts"
import { receiveAccount, resetAccountView } from "../account/account.ts"
import { preloadAnswers } from "../service.ts"

/**
 * What the service's `project.open` and `project.components` answer for the example. Its guest URL is the module
 * Storybook serves or builds for it, as the project's builder would serve it.
 */
// SAFETY: Storybook's `exampleProject` plugin builds this module from the same discovery and inference that answer the
// service's `project.open` and `project.components`, so it holds a ProjectInfo and its components.
const example = discovered as { info: ProjectInfo; components: Record<string, ComponentInfo> }

/**
 * Roots the stand-in service knows: the example, one that takes forever to open, one that fails to, one with no project
 * file yet, which opens on a Home screen, and one whose project file holds no designs, as once they're all deleted.
 */
export const roots = {
  example: example.info.root,
  slow: "D:/projects/slow-builder",
  broken: "D:/projects/broken-app",
  empty: "D:/projects/blank-slate",
  designless: "D:/projects/all-deleted"
} as const

/** What the stand-in service has been asked to do, newest last, for stories that show a request's effect. */
export const requests: { method: string; params: unknown }[] = []

/** How the service answers unless a story changes it: quickly, and every save and install works. */
export const defaultService = { latency: 150, saveFails: false, installFails: false }

/** The service's answers that stories can change: how long each takes, and whether saving or installing works. */
export const service = { ...defaultService }

/** A story's own answer to a request; `usual` gets the stand-in service's. */
export type Answer<M extends ServiceMethod> = (
  params: ServiceMethods[M]["params"],
  usual: () => Promise<ServiceMethods[M]["result"]>
) => ServiceMethods[M]["result"] | Promise<ServiceMethods[M]["result"]>

/** A story's own answers, by method. */
type Answers = { [M in ServiceMethod]?: Answer<M> }

/** Answers a story gave, by method. */
const overrides: Answers = {}

/** The methods whose story answer is for the next request only. */
const onceOnly = new Set<string>()

/** Answers some requests another way until the story ends; the service answers the rest as usual. */
export function answering(answers: Answers): void {
  Object.assign(overrides, answers)

  for (const method of Object.keys(answers)) {
    onceOnly.delete(method)
  }
}

/** Answers the next request for a method another way, once: a check that fails, a project without its own modes. */
export function answerNext<M extends ServiceMethod>(method: M, answer: Answer<M>): void {
  Object.assign(overrides, { [method]: answer })
  onceOnly.add(method)
}

/** Forgets every answer a story gave. */
function clearOverrides(): void {
  for (const method of Object.keys(overrides)) {
    Reflect.deleteProperty(overrides, method)
  }

  onceOnly.clear()
}

/** The system dialogs, which answer as if the person cancelled unless a story picks something. */
const cancelled = {
  pickFolder: () => Promise.resolve(undefined),
  pickProjectFile: () => Promise.resolve(undefined),
  saveFile: () => Promise.resolve(undefined)
}

/** Answers the system dialogs, such as the folder picker, another way until the story ends. */
export function pickingWith(dialogs: Partial<Pick<CanvasHost, keyof typeof cancelled>>): void {
  Object.assign(window.canvasHost, dialogs)
}

/**
 * What the stand-in service runs besides each open project's build server, which it starts as projects open: a story
 * adds Storybooks, servers Portless routes and its proxy.
 */
export const running = { processes: new Array<ProjectProcess>() }

let accountNow: AccountState = signedOut

/** Says who's signed in, as main would, to the window's account store. */
export function setStoryAccount(next: AccountState): void {
  accountNow = next
  receiveAccount(next)
}

/** You're in `chosen` now, as main says it: who, without how they signed in. */
function inAccount(chosen: SignedInAccount | undefined): AccountState["account"] {
  if (!chosen) {
    return null
  }

  const { provider: _provider, ended: _ended, ...person } = chosen

  return { ...person, untilQuit: accountNow.account?.untilQuit ?? false }
}

/**
 * Main's side of signing in, as far as a story can play it: a button waits for a browser that never hands back, and
 * Cancel, switching accounts and Sign out do what they say. Nothing opens or leaves the story.
 */
const storyAccount: CanvasHost["account"] = {
  get: () => Promise.resolve(accountNow),
  subscribe: () => () => undefined,
  signIn: async ({ provider, email }) => {
    const attempt: Extract<SignInAttempt, { at: "waiting" }> = {
      at: "waiting",
      provider,
      url: "https://api.workos.com/user_management/authorize?client_id=client_story"
    }

    if (email !== undefined) {
      attempt.email = email
    }

    setStoryAccount({ ...accountNow, attempt, ended: null })
  },
  reopen: () => Promise.resolve(),
  cancel: async () => setStoryAccount({ ...accountNow, attempt: null, ended: null }),
  signOut: async (email) => {
    const accounts = accountNow.accounts.filter((each) => each.email !== email)
    // Leaving the account you're in moves to another whose session is still going.
    const here = accountNow.account?.email === email
    const account = here ? inAccount(accounts.find((each) => !each.ended)) : accountNow.account
    setStoryAccount({ ...accountNow, account, accounts })
  },
  switchOrganization: async (organizationId) => {
    const { account, accounts } = accountNow

    if (!account) {
      return
    }

    setStoryAccount({
      ...accountNow,
      account: { ...account, organizationId },
      accounts: accounts.map((each) => (each.email === account.email ? { ...each, organizationId } : each))
    })
  },
  use: async (email) => {
    const chosen = accountNow.accounts.find((each) => each.email === email && !each.ended)

    if (chosen) {
      setStoryAccount({ ...accountNow, account: inAccount(chosen) })
    }
  }
}

/** The stand-in Telemetry setting, at its defaults with a fixed install ID, which stories can start elsewhere. */
export const defaultTelemetry: TelemetryState = {
  level: "all",
  setting: "all",
  installId: "3f9c2a71-8d4e-4b6a-9e15-c07d2f84b913"
}

let telemetryNow: TelemetryState = defaultTelemetry

/** Starts the stand-in Telemetry setting somewhere else, as a variable overriding it. */
export function setStoryTelemetry(state: TelemetryState): void {
  telemetryNow = state
}

const storyTelemetry: CanvasHost["telemetry"] = {
  get: () => Promise.resolve(telemetryNow),
  setLevel: async (setting) => {
    const installId = setting === "off" ? crypto.randomUUID() : telemetryNow.installId
    telemetryNow = {
      ...telemetryNow,
      setting,
      installId,
      level: telemetryNow.overriddenBy ? telemetryNow.level : setting
    }

    return telemetryNow
  }
}

/** The answer where there's no server running the connectors, as in a built Storybook. */
const noServer: SearchAnswer = {
  problem: {
    code: "no-key",
    message: "This Storybook has no keys. Run it from the repository, with the keys in apps/desktop/.env.local."
  }
}

/**
 * Asks the connectors Storybook's dev server runs (`.storybook/connectors.ts`). Nothing comes back where it isn't
 * running, or where it didn't answer with JSON.
 */
async function askConnectors(path: "keys" | "search", search?: ConnectorSearch): Promise<Response | undefined> {
  try {
    const response = await fetch(`/__connectors/${path}`, {
      method: search ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: search ? JSON.stringify(search) : undefined
    })

    const sent = response.headers.get("content-type") ?? ""

    return response.ok && sent.startsWith("application/json") ? response : undefined
  } catch {
    return undefined
  }
}

/**
 * The searches the real connectors answered in stories, newest first, kept as main keeps a person's: one for each
 * description, the latest few for each connector. They last until the story ends.
 */
let recentNow: RecentSearch[] = []

/** Gives the person recent searches until the story ends, newest first. */
export function rememberingSearches(recent: RecentSearch[]): void {
  recentNow = recent
}

/** Adds a search that worked to the recent ones, with every filter it ran with, as main's hub does. */
function recall({ connector, request }: ConnectorSearch): void {
  const info = connectors.find((each) => each.info.id === connector)?.info
  const checked = info && checkRequest(info, request)

  if (checked && "request" in checked) {
    const { query, kind, filters } = checked.request
    recentNow = remember(recentNow, { connector, kind, query, filters, at: Date.now() })
  }
}

/** A story's own answer to the window's searches, in place of the connectors Storybook's dev server runs. */
type SearchStandIn = (search: ConnectorSearch) => SearchAnswer | Promise<SearchAnswer>

let searchStandIn: SearchStandIn | undefined

/**
 * Answers the window's searches another way until the story ends, as every connector having a key: results drawn for
 * the story, or one of the problems a connector answers with. A search that finds something joins the recent ones.
 */
export function answeringSearches(answer: SearchStandIn): void {
  searchStandIn = answer
}

/**
 * The connectors in stories (PAR-827): Storybook's dev server searches Mobbin and Unsplash with the keys in
 * `.env.local`, as main does for the window, so a key never reaches the page. A search that works joins the recent
 * searches, as it does in the app. Nothing here tells a source a result was used, since a story places nothing for
 * real.
 */
const storyConnectors: CanvasHost["connectors"] = {
  get: async () => {
    if (searchStandIn) {
      return connectors.map(({ info }) => ({ ...info, key: "here" as const }))
    }

    const answered = await askConnectors("keys")
    const keyed = z.array(z.string()).safeParse(await answered?.json())

    return connectors.map(({ info }) => ({
      ...info,
      key: keyed.success && keyed.data.includes(info.id) ? "here" : "none"
    }))
  },
  search: async (search) => {
    if (searchStandIn) {
      const answer = await searchStandIn(search)

      if ("found" in answer) {
        recall(search)
      }

      return answer
    }

    const answered = await askConnectors("search", search)
    const answer = searchAnswer.safeParse(await answered?.json())

    if (answer.success && "found" in answer.data) {
      recall(search)
    }

    return answer.success ? answer.data : noServer
  },
  recent: () => Promise.resolve(recentNow),
  placed: () => Promise.resolve()
}

/**
 * The example's image files and the lines of code that name them, as `images.scan` finds them: none, until a story
 * gives some. Adding and removing images changes them, as it would the project's folder. The files a story lists are
 * served from `stories/media/` at `/images/`, as a project's builder serves `public/images/`.
 */
export const media: StoryMedia = { files: [], references: [] }

interface StoryMedia {
  files: ImageFile[]
  references: CodeReference[]
}

/** Puts the service and the system dialogs back as they were before any story changed them. */
export function resetHost(): void {
  telemetryNow = defaultTelemetry
  Object.assign(service, defaultService)
  running.processes = []
  searchStandIn = undefined
  recentNow = []
  media.files = []
  media.references = []
  clearOverrides()
  Object.assign(window.canvasHost, cancelled)
  accountNow = signedOut
  resetAccountView()
}

/**
 * Stands in for the desktop host in stories: the project service answers as the real one would for the example
 * project, from what Storybook discovered of it, and system dialogs answer as if the person cancelled.
 */
export function installHost(): void {
  const host: CanvasHost = {
    appVersion: desktop.version,
    getBuildInfo: async () => ({ version: desktop.version, channel: "development" }),
    telemetry: storyTelemetry,
    // Stories never send a report.
    report: {
      prepare: () => Promise.resolve({}),
      send: () => delay(600).then(() => "00000000000000000000000000000000"),
      lastCrash: () => Promise.resolve(undefined)
    },
    updates: {
      get: () => Promise.resolve({ phase: "disabled", beta: false }),
      check: () => Promise.resolve(),
      setBeta: () => Promise.resolve(),
      act: () => Promise.resolve(),
      subscribe: () => () => undefined,
      onShow: () => () => undefined
    },
    ask: preloadAnswers(<M extends ServiceMethod>(method: M, params: ServiceMethods[M]["params"]) => {
      requests.push({ method, params })

      return delay(service.latency).then(() => {
        const usual = () => answer(method, params)
        const override: Answer<M> | undefined = overrides[method]

        if (!override) {
          return usual()
        }

        if (onceOnly.delete(method)) {
          Reflect.deleteProperty(overrides, method)
        }

        return override(params, usual)
      })
    }),
    account: storyAccount,
    connectors: storyConnectors,
    serve: () => undefined,
    onReconnect: () => undefined,
    ...cancelled,
    showItem: () => Promise.resolve(),
    copiedFiles: () => Promise.resolve([]),
    openInEditor: () => Promise.resolve({ opened: "VS Code" }),
    installCli: () =>
      Promise.resolve({ folder: "C:\\Users\\ana\\AppData\\Local\\Parity\\bin", onPath: true, newTerminal: true }),
    quit: () => Promise.resolve(),
    toggleDevTools: () => Promise.resolve(),
    setTheme: () => Promise.resolve(),
    onClosing: () => undefined,
    // A typical reading from the desktop app, for the performance stats.
    metrics: () =>
      Promise.resolve([
        { role: "this-window", name: "This window", pid: 2, cpu: 3.2, memory: 310_000_000 },
        { role: "service", name: "Project service", pid: 3, cpu: 0.6, memory: 240_000_000 },
        { role: "builder", name: "Vite for shop", pid: 5, cpu: 0.2, memory: 180_000_000 },
        { role: "app", name: "Parity", pid: 1, cpu: 0.4, memory: 120_000_000 },
        { role: "gpu", name: "GPU", pid: 4, cpu: 1.1, memory: 150_000_000 }
      ]),
    // Stories fill each project's console log themselves.
    console: {
      announce: () => undefined,
      read: () => Promise.resolve([]),
      clear: () => Promise.resolve(),
      subscribe: () => () => undefined
    }
  }

  window.canvasHost = host
}

/** A fresh copy of a project, as opening it again reads it again. */
export function projectInfo(root: string): ProjectInfo {
  const info = structuredClone(example.info)

  if (root === roots.empty || root === roots.designless) {
    const name = root.split("/").at(-1)!
    const file = `${name}.par`
    const empty = root === roots.empty

    return {
      ...info,
      id: root,
      root,
      name,
      documents: empty ? [] : [{ path: file, document: { version: 4, containers: [] } }],
      mainDocument: file,
      modes: { settings: defaultModeSettings, custom: false },
      notes: [
        ...info.notes.filter((note) => !note.startsWith("designs in")),
        empty ? "no .par project file yet" : `designs in ${file}`
      ]
    }
  }

  return info
}

/** A project's build server, as the service starts it when the project opens, a few seconds ago. */
function buildServer(info: ProjectInfo): ProjectProcess {
  const started = Date.now() - 4000

  return {
    id: `builder:${info.root}`,
    kind: "builder",
    lifetime: "server",
    name: info.builder.name,
    projectId: info.root,
    project: info.name,
    status: "running",
    startedAt: started,
    pid: 3,
    url: new URL(info.guestUrl).origin,
    startedBy: "parity",
    canStop: false,
    canRestart: false
  }
}

/**
 * Stops a server or cancels a task, which takes a moment: it's stopping, then stopped or canceled. Asked to restart, a
 * server starts and then runs, and a task runs again and then passes.
 */
function settle(id: string, action: "stop" | "restart"): void {
  const process = running.processes.find((candidate) => candidate.id === id)

  if (!process) {
    return
  }

  const task = process.lifetime === "task"

  const move = (next: ProjectProcess["status"]) => {
    const at = Date.now()
    process.status = next

    if (next === "stopped" || next === "canceled" || next === "passed") {
      process.stoppedAt = at
      process.canStop = false
      delete process.progress

      if (next === "passed") {
        process.summary = "Passed"
      }
    }

    if (next === "starting" || (task && next === "running")) {
      process.startedAt = at

      for (const key of ["stoppedAt", "error", "summary"] as const) {
        delete process[key]
      }

      process.canStop = true
    }
  }

  if (action === "stop") {
    move("stopping")
    setTimeout(() => move(task ? "canceled" : "stopped"), 900)
  } else {
    move(task ? "running" : "starting")
    setTimeout(() => move(task ? "passed" : "running"), 1600)
  }
}

/** A request to the service: a method and its params, which a switch on the method narrows. */
type ServiceRequest = { [M in ServiceMethod]: { method: M; params: ServiceMethods[M]["params"] } }[ServiceMethod]

async function answer<M extends ServiceMethod>(
  method: M,
  params: ServiceMethods[M]["params"]
): Promise<ServiceMethods[M]["result"]> {
  // SAFETY: `method` and `params` are typed by the same M, so together they're the request for that method.
  const result = await respond({ method, params } as ServiceRequest)

  // SAFETY: `respond` answers each method with that method's result.
  return result as ServiceMethods[M]["result"]
}

async function respond(request: ServiceRequest): Promise<ServiceMethods[ServiceMethod]["result"]> {
  switch (request.method) {
    case "project.open": {
      const root = request.params.root ?? roots.example

      if (root === roots.slow) {
        return new Promise(() => undefined)
      }

      if (root === roots.broken) {
        throw new Error("No renderer supports broken-app: its package.json depends on neither react nor react-dom")
      }

      const info = projectInfo(root)

      if (!running.processes.some((process) => process.id === `builder:${root}`)) {
        running.processes.push(buildServer(info))
      }

      return info
    }

    case "project.close":
      running.processes = running.processes.filter((process) => process.projectId !== request.params.projectId)

      return undefined
    case "project.components":
      return structuredClone(example.components)
    case "processes.list":
      return structuredClone(running.processes)
    case "processes.stop":
      settle(String(request.params.id), "stop")

      return undefined
    case "processes.restart":
      settle(String(request.params.id), "restart")

      return undefined
    case "processes.dismiss":
      running.processes = running.processes.filter((process) => process.id !== request.params.id)

      return undefined
    case "library.catalog":
      return [
        {
          id: "nova",
          name: "Shadcn Nova",
          description: "shadcn/ui's components on Base UI",
          package: "@buildkitgg/shadcn-baseui-nova",
          kind: "components",
          installed: true
        },
        {
          id: "lucide",
          name: "Lucide",
          description: "Clean, consistent icons",
          package: "lucide-react",
          kind: "icons",
          installed: true
        },
        {
          id: "radix",
          name: "Radix Themes",
          description: "An open-source component library for fast development",
          package: "@radix-ui/themes",
          kind: "components",
          installed: false
        },
        {
          id: "tabler",
          name: "Tabler Icons",
          description: "Over 5,000 outline and filled icons on a 24px grid.",
          package: "@tabler/icons-react",
          kind: "icons",
          installed: false
        },
        {
          id: "phosphor",
          name: "Phosphor",
          description: "A flexible icon family with six weights, picked with the weight prop.",
          package: "@phosphor-icons/react",
          kind: "icons",
          installed: false
        },
        {
          id: "hugeicons",
          name: "Hugeicons",
          description: "Thousands of free icons as data, drawn by Hugeicons' React component.",
          package: "@hugeicons/core-free-icons",
          kind: "icons",
          installed: false
        },
        {
          id: "heroicons",
          name: "Heroicons",
          description: "Hand-crafted SVG icons from the makers of Tailwind CSS, in the 24px outline style.",
          package: "@heroicons/react",
          kind: "icons",
          installed: false
        },
        {
          id: "fluent-icons",
          name: "Fluent icons",
          description: "Microsoft's Fluent System Icons, in Regular and Filled styles, some with a size in the name.",
          package: "@fluentui/react-icons",
          kind: "icons",
          installed: false
        }
      ]
    case "library.add":
      await delay(1200)

      if (service.installFails) {
        throw new Error(`pnpm add ${String(request.params.library)} failed: ERR_PNPM_FETCH_404 Not Found - 404`)
      }

      return { log: `+ ${String(request.params.library)}\nDone in 1.2s` }
    case "document.save":
    case "document.saveCopy":
      if (service.saveFails) {
        throw new Error("EPERM: operation not permitted, open 'shadcn-vite.par'")
      }

      return undefined
    case "styles.classes":
      // The stand-in project has no styling framework's compiler, so its frames draw from rules alone.
      return { supported: false, classes: [], css: "" }
    case "tokens.save": {
      if (service.saveFails) {
        throw new Error("EPERM: operation not permitted, open 'src/index.css'")
      }

      const changes = request.params.changes
      const [change] = changes

      return edited(changes.length === 1 ? "Edit a token" : `Edit ${changes.length} tokens`, [
        "@@ -7,7 +7,7 @@",
        " :root {",
        "   --radius: 0.625rem;",
        "   --background: oklch(1 0 0);",
        `-  --${change?.name}: oklch(0.205 0 0);`,
        `+  --${change?.name}: ${change?.value};`,
        "   --primary-foreground: oklch(0.985 0 0);",
        "   --secondary: oklch(0.97 0 0);"
      ])
    }

    case "library.importStyles":
      return edited("Import Shadcn Nova's styles", [
        "@@ -1,3 +1,4 @@",
        ' @import "tailwindcss";',
        '+@import "@buildkitgg/shadcn-baseui-nova/styles.css";',
        ' @import "tw-animate-css";',
        " "
      ])
    case "project.undoEdit": {
      const edit = edits.get(String(request.params.id))

      if (!edit) {
        throw new Error("That change is too old to undo, or was undone already")
      }

      edits.delete(edit.id)
      putBack.get(edit.id)?.()
      putBack.delete(edit.id)

      return {
        ...edit,
        label: `Undo ${edit.label.charAt(0).toLowerCase()}${edit.label.slice(1)}`,
        files: edit.files.map((file) => ({ path: file.path, diff: reversed(file.diff) }))
      }
    }

    case "images.import": {
      const { name, type, data } = request.params
      const folder = mediumOfType(type) === "video" ? videosFolder : imagesFolder
      const path = `${folder}/${name}.${mediaExtension(type) ?? "png"}`

      media.files = [
        ...media.files.filter((file) => file.path !== path),
        { path, bytes: Math.round(data.length * 0.75) }
      ]

      return { src: path.slice("public".length), path }
    }

    case "images.saveFrom": {
      // Story pictures are served at /images/ and /videos/, so the file saved is the one the link names.
      const name = new URL(request.params.url).pathname.split("/").at(-1) ?? "picture.jpg"
      const path = `${name.endsWith(".mp4") ? videosFolder : imagesFolder}/${name}`

      media.files = [...media.files.filter((file) => file.path !== path), { path, bytes: 120_000 }]

      return { src: path.slice("public".length), path }
    }

    case "images.scan":
      return { files: [...media.files], references: [...media.references] }
    case "images.remove": {
      const { path } = request.params
      const removed = media.files.find((file) => file.path === path)

      if (!removed) {
        throw new Error(`${path} isn't in the project's folder`)
      }

      media.files = media.files.filter((file) => file !== removed)

      const edit = edited(`Remove ${path.slice(path.lastIndexOf("/") + 1)}`, ["Binary file removed"], path)
      putBack.set(edit.id, () => {
        media.files = [...media.files, removed]
      })

      return { path, edit }
    }

    case "storybook.open":
      return { url: "http://localhost:6006/?path=/docs/components-button--docs" }
    case "layers.export":
      return {
        files: request.params.files.map((file) => `D:/exports/${file.name}`),
        warnings: []
      }
    case "layers.picture":
      // A see-through pixel, as a PNG.
      return {
        png: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        warnings: []
      }
    case "designs.export":
      return {
        files: request.params.designs.map((design) => `D:/exports/${design.split("#").at(-1)}.png`),
        warnings: []
      }
    case "code.read": {
      const { default: files } = await import("virtual:parity/example-sources")
      const text = files[String(request.params.path)]

      if (text === undefined) {
        throw new Error(`${String(request.params.path)} isn't in the project's folder`)
      }

      return { text }
    }

    case "accessibility.check":
      return { findings: findingsFor(String(request.params.design)), frames: 4, warnings: [] }
    case "frames.changes":
      // Nothing to compare in a story: every frame's change is unknown, so no board is outlined.
      return {
        changes: parseData(z.array(z.json()), JSON.parse(request.params.frames)).map(() => ({
          status: { state: "unknown" }
        }))
      }
    case "frames.stored":
      // No bitmap kept, as on a first launch: a frame that sleeps draws first, or waits on its placeholder.
      return { kept: parseData(z.array(z.json()), JSON.parse(request.params.jobs)).map(() => ({})) }
    case "pictures.store":
      return request.params.picture
    case "pictures.read":
      // No project's picture kept, as on a first launch: the start page shows placeholders.
      return {}
    case "start.check":
      // Every folder is there, and this copy has no example to offer.
      return { missing: [] }
    default:
      return undefined
  }
}

/** The edits the stand-in service made to the example's stylesheet, by id, to undo. */
const edits = new Map<string, ProjectEditResult>()

/** What undoing an edit puts back besides the file's text, by the edit's id: a removed image's file. */
const putBack = new Map<string, () => void>()

/** An edit to one of the example's files, its stylesheet unless said, as the service describes one it made. */
function edited(label: string, hunk: string[], path = "src/index.css"): ProjectEditResult {
  const edit = {
    id: `edit-${edits.size + 1}`,
    label,
    files: [{ path, diff: [`--- a/${path}`, `+++ b/${path}`, ...hunk].join("\n") }]
  }

  edits.set(edit.id, edit)

  return edit
}

/** A diff the other way round, as undoing its edit gives it. */
function reversed(diff: string): string {
  return diff
    .split("\n")
    .map((line) => {
      const hunk = /^@@ -(\S+) \+(\S+) @@$/.exec(line)

      if (hunk) {
        return `@@ -${hunk[2]} +${hunk[1]} @@`
      }

      if (line.startsWith("+") && !line.startsWith("+++")) {
        return `-${line.slice(1)}`
      }

      if (line.startsWith("-") && !line.startsWith("---")) {
        return `+${line.slice(1)}`
      }

      return line
    })
    .join("\n")
}

/**
 * Accessibility findings for a design, made up but shaped like axe-core's: a contrast failure and an unnamed control
 * on the design's first components, in each of its first two states.
 */
function findingsFor(key: string): AccessibilityFinding[] {
  const [path, id] = key.split("#")

  const container = example.info.documents
    .find((entry) => entry.path === path)
    ?.document.containers.find((candidate) => candidate.id === id)

  if (!container) {
    return []
  }

  const nodes = componentNodes(container)
  const states = designStates(container).slice(0, 2)

  return states.flatMap((state): AccessibilityFinding[] => [
    ...nodes.slice(0, 2).map((node) => ({
      state: state.id,
      mode: "desktop-light",
      rule: "color-contrast",
      impact: "serious" as const,
      help: "Elements must meet minimum color contrast ratio thresholds",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
      node: node.id,
      name: node.name,
      detail: "Element has insufficient color contrast of 3.9 (foreground #737373, background #f5f5f5)",
      contrast: {
        foreground: "#737373",
        background: "#f5f5f5",
        ratio: 3.9,
        required: 4.5,
        fontSize: 14,
        bold: false,
        fix: { token: "foreground", color: "#0a0a0a", ratio: 18.16 }
      }
    })),
    ...nodes.slice(2, 3).map((node) => ({
      state: state.id,
      mode: "desktop-dark",
      rule: "button-name",
      impact: "critical" as const,
      help: "Buttons must have discernible text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
      node: node.id,
      name: node.name,
      detail: "Element does not have inner text that is visible to screen readers"
    }))
  ])
}

function componentNodes(container: ContainerSpec): { id: string; name: string }[] {
  const found: { id: string; name: string }[] = []

  const walk = (node: DesignNode) => {
    if (node.type === "component") {
      found.push({ id: node.id, name: node.name ?? node.component })

      for (const slot of Object.values(node.slots ?? {})) {
        for (const child of slot) {
          walk(child)
        }
      }
    }

    if (node.type === "layout") {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(container.root)

  return found
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
