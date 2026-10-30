import type { AccessibilityFinding } from "@parity/agent"
import { type ComponentInfo, type ContainerSpec, defaultModeSettings, type DesignNode } from "@parity/core"
import discovered from "virtual:parity/example-project"
import type {
  CanvasHost,
  ProjectEditResult,
  ProjectInfo,
  ProjectProcess,
  ServiceMethod,
  ServiceMethods,
  TokenChange
} from "../../shared/protocol.ts"

/**
 * What the service's `project.open` and `project.components` answer for the example. Its guest URL is the module
 * Storybook serves or builds for it, as the project's builder would serve it.
 */
const example = discovered as { info: ProjectInfo; components: Record<string, ComponentInfo> }

/** Roots the stand-in service knows: the example, one that takes forever to open, and one that fails to. */
export const roots = {
  example: example.info.root,
  slow: "D:/projects/slow-builder",
  broken: "D:/projects/broken-app",
  empty: "D:/projects/blank-slate"
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

/** Answers a story gave, by method, and whether each is for the next request only. */
const overrides = new Map<ServiceMethod, { answer: Answer<never>; once: boolean }>()

/** Answers some requests another way until the story ends; the service answers the rest as usual. */
export function answering(answers: { [M in ServiceMethod]?: Answer<M> }): void {
  for (const [method, answer] of Object.entries(answers)) {
    overrides.set(method as ServiceMethod, { answer: answer as unknown as Answer<never>, once: false })
  }
}

/** Answers the next request for a method another way, once: a check that fails, a project without its own modes. */
export function answerNext<M extends ServiceMethod>(method: M, answer: Answer<M>): void {
  overrides.set(method, { answer: answer as unknown as Answer<never>, once: true })
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
export const running: { processes: ProjectProcess[] } = { processes: [] }

/** Puts the service and the system dialogs back as they were before any story changed them. */
export function resetHost(): void {
  Object.assign(service, defaultService)
  running.processes = []
  overrides.clear()
  Object.assign(window.canvasHost, cancelled)
}

/**
 * Stands in for the desktop host in stories: the project service answers as the real one would for the example
 * project, from what Storybook discovered of it, and system dialogs answer as if the person cancelled.
 */
export function installHost(): void {
  const host: CanvasHost = {
    request: <M extends ServiceMethod>(method: M, params: ServiceMethods[M]["params"]) => {
      requests.push({ method, params })
      return delay(service.latency).then(() => {
        const usual = () => answer(method, params)
        const override = overrides.get(method)
        if (!override) return usual()
        if (override.once) overrides.delete(method)
        return (override.answer as unknown as Answer<M>)(params, usual)
      })
    },
    serve: () => undefined,
    onReconnect: () => undefined,
    ...cancelled,
    showItem: () => Promise.resolve(),
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
      ])
  }
  window.canvasHost = host
}

/** A fresh copy of a project, as opening it again reads it again. */
export function projectInfo(root: string): ProjectInfo {
  const info = structuredClone(example.info)
  if (root === roots.empty) {
    return {
      ...info,
      id: root,
      root,
      name: "blank-slate",
      documents: [],
      mainDocument: "blank-slate.par",
      modes: { settings: defaultModeSettings, custom: false },
      notes: [...info.notes.filter((note) => !note.startsWith("designs in")), "no .par project file yet"]
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
    shape: "server",
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
  if (!process) return
  const task = process.shape === "task"
  const move = (next: ProjectProcess["status"]) => {
    const at = Date.now()
    process.status = next
    if (next === "stopped" || next === "canceled" || next === "passed") {
      process.stoppedAt = at
      process.canStop = false
      delete process.progress
      if (next === "passed") process.summary = "Passed"
    }
    if (next === "starting" || (task && next === "running")) {
      process.startedAt = at
      for (const key of ["stoppedAt", "error", "summary"] as const) delete process[key]
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

async function answer<M extends ServiceMethod>(
  method: M,
  params: ServiceMethods[M]["params"]
): Promise<ServiceMethods[M]["result"]> {
  const result = await respond(method, params as never)
  return result as ServiceMethods[M]["result"]
}

async function respond(method: ServiceMethod, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "project.open": {
      const root = (params.root as string | undefined) ?? roots.example
      if (root === roots.slow) return new Promise(() => undefined)
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
      running.processes = running.processes.filter((process) => process.projectId !== params.projectId)
      return undefined
    case "project.components":
      return structuredClone(example.components)
    case "processes.list":
      return structuredClone(running.processes)
    case "processes.stop":
      settle(String(params.id), "stop")
      return undefined
    case "processes.restart":
      settle(String(params.id), "restart")
      return undefined
    case "processes.dismiss":
      running.processes = running.processes.filter((process) => process.id !== params.id)
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
        throw new Error(`pnpm add ${String(params.library)} failed: ERR_PNPM_FETCH_404 Not Found - 404`)
      }
      return { log: `+ ${String(params.library)}\nDone in 1.2s` }
    case "document.save":
    case "document.saveCopy":
      if (service.saveFails) throw new Error("EPERM: operation not permitted, open 'shadcn-vite.par'")
      return undefined
    case "tokens.save": {
      if (service.saveFails) throw new Error("EPERM: operation not permitted, open 'src/index.css'")
      const changes = params.changes as TokenChange[]
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
      const edit = edits.get(String(params.id))
      if (!edit) throw new Error("That change is too old to undo, or was undone already")
      edits.delete(edit.id)
      return {
        ...edit,
        label: `Undo ${edit.label.charAt(0).toLowerCase()}${edit.label.slice(1)}`,
        files: edit.files.map((file) => ({ path: file.path, diff: reversed(file.diff) }))
      }
    }
    case "images.import":
      return { src: `/images/${String(params.name)}`, path: `public/images/${String(params.name)}` }
    case "storybook.open":
      return { url: "http://localhost:6006/?path=/docs/components-button--docs" }
    case "designs.export":
      return {
        files: (params.designs as string[]).map((design) => `D:/exports/${design.split("#").at(-1)}.png`),
        warnings: []
      }
    case "accessibility.check":
      return { findings: findingsFor(String(params.design)), frames: 4, warnings: [] }
    default:
      return undefined
  }
}

/** The edits the stand-in service made to the example's stylesheet, by id, to undo. */
const edits = new Map<string, ProjectEditResult>()

/** An edit to the example's stylesheet, as the service describes one it made, with its diff's hunks. */
function edited(label: string, hunk: string[]): ProjectEditResult {
  const path = "src/index.css"
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
      if (hunk) return `@@ -${hunk[2]} +${hunk[1]} @@`
      if (line.startsWith("+") && !line.startsWith("+++")) return `-${line.slice(1)}`
      if (line.startsWith("-") && !line.startsWith("---")) return `+${line.slice(1)}`
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
    ?.document?.containers.find((candidate) => candidate.id === id)
  if (!container) return []
  const nodes = componentNodes(container)
  const states = container.states.slice(0, 2)
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
      contrast: { foreground: "#737373", background: "#f5f5f5", ratio: 3.9, required: 4.5, fontSize: 14, bold: false }
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
      for (const slot of Object.values(node.slots ?? {})) for (const child of slot) walk(child)
    }
    if (node.type === "layout") for (const child of node.children) walk(child)
  }
  walk(container.root)
  return found
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
