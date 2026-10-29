import type { AccessibilityFinding } from "@parity/agent"
import { type ComponentInfo, type ContainerSpec, defaultModeSettings, type DesignNode } from "@parity/core"
import discovered from "virtual:parity/example-project"
import type { CanvasHost, ProjectInfo, ServiceMethod, ServiceMethods } from "../../shared/protocol.ts"

/** What the service's `project.open` and `project.components` answer for the example; the guest URL is set here. */
const example = discovered as { info: Omit<ProjectInfo, "guestUrl">; components: Record<string, ComponentInfo> }

/** Roots the stand-in service knows: the example, one that takes forever to open, and one that fails to. */
export const roots = {
  example: example.info.root,
  slow: "D:/projects/slow-builder",
  broken: "D:/projects/broken-app",
  empty: "D:/projects/blank-slate"
} as const

/** The guest module Storybook serves for the example, as its builder would. */
const guestUrl = new URL("/@id/__x00__virtual:parity/example-guest", location.origin).href

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

/** Puts the service and the system dialogs back as they were before any story changed them. */
export function resetHost(): void {
  Object.assign(service, defaultService)
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
      notes: [...info.notes.filter((note) => !note.startsWith("designs in")), "no .par project file yet"],
      guestUrl
    }
  }
  return { ...info, guestUrl }
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
      return projectInfo(root)
    }
    case "project.components":
      return structuredClone(example.components)
    case "library.catalog":
      return [
        {
          id: "nova",
          name: "shadcn/ui Nova",
          description: "shadcn/ui's components on Base UI",
          package: "@buildkitgg/shadcn-baseui-nova",
          installed: true
        },
        {
          id: "lucide",
          name: "Lucide",
          description: "Clean, consistent icons",
          package: "lucide-react",
          installed: true
        },
        {
          id: "radix",
          name: "Radix Themes",
          description: "An open-source component library for fast development",
          package: "@radix-ui/themes",
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
    case "tokens.save":
      if (service.saveFails) throw new Error("EPERM: operation not permitted, open 'src/index.css'")
      return { files: ["src/index.css"] }
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
