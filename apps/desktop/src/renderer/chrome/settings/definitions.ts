import type { Permissions } from "@parity-app/extension"
import { codeEditors } from "@parity-app/processes"
import {
  Download,
  Frame,
  Keyboard,
  type LucideIcon,
  Monitor,
  Moon,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sun
} from "lucide-react"
import { type Mark, projectMark } from "./marks.tsx"

/**
 * Whose a setting is. `app`: the person's, the same in every project. `project`: the project's, saved in its file, so
 * everyone who opens it gets it. `either`: the person's for every project, which a project can change for itself.
 */
export type Scope = "app" | "project" | "either"

export interface Option {
  value: string
  label: string
  icon?: LucideIcon
}

export type Control =
  | { kind: "switch" }
  | { kind: "select"; options: Option[] }
  | { kind: "text" }
  | { kind: "number" }
  /** Several choices from a list, as export sizes are. */
  | { kind: "multi"; options: Option[] }
  /** A value Parity sets, shown to copy. */
  | { kind: "fixed" }

export type Value = string | number | boolean | string[]

export interface Setting {
  id: string
  page: string
  label: string
  /** One line on what it changes, when the label alone doesn't say. */
  detail?: string
  /** Other words people search for it by. */
  keywords?: string[]
  /** The group it's in on its page, where the page has more than one. */
  group?: string
  scope: Scope
  control: Control
  default: Value
}

export interface Page {
  id: string
  label: string
  icon: Mark
  group: number
}

/** Where an extension's code is in the open project: waiting to be needed, starting, running, stuck or crashed. */
export type HostState = "waiting" | "starting" | "running" | "stuck" | "crashed"

/**
 * An installed extension as Settings shows it, from its manifest: in an open project, what detection found, whether it
 * runs there, and what it adds, from what its adapter and extension tell the window.
 */
export interface Extension {
  id: string
  name: string
  icon: Mark
  /** Whether it runs in the open project. */
  running: boolean
  /** What detection found, or why it isn't running. */
  found: string
  adds: string[]
  /** Its settings, from its manifest (PAR-1090). */
  settings: Setting[]
  /** What keys its settings in settings.json and the project's file: its manifest's prefix. */
  prefix?: string
  /** What its manifest says it may read, write, reach and change. */
  permissions?: Permissions
  /** Where its code is in the open project, for one that runs in a host of its own. */
  state?: HostState
  /** Why it's stuck or crashed. */
  reason?: string
  /** How long its code took to activate, in milliseconds. */
  activatedIn?: number
  /** The memory its host held lately, in bytes. */
  memory?: number
  /** Whether its code starts as soon as its tool is detected. */
  onStartup?: boolean
  /** Its settings whose values didn't fit, one sentence each. */
  problems?: string[]
}

export const pages: Page[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, group: 0 },
  { id: "canvas", label: "Canvas", icon: Frame, group: 0 },
  { id: "export", label: "Export", icon: Download, group: 0 },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, group: 0 },
  { id: "extensions", label: "Extensions", icon: Puzzle, group: 1 },
  { id: "diagnostics", label: "Diagnostics", icon: ShieldCheck, group: 2 },
  { id: "updates", label: "Updates", icon: RefreshCw, group: 2 }
]

/** Parity's pages, with the open project's among them. */
export function pagesFor(project: { name: string } | undefined): Page[] {
  if (!project) {
    return pages
  }

  const page: Page = { id: "project", label: project.name, icon: projectMark(project.name), group: 1 }

  return [...pages.filter((entry) => entry.group < 1), page, ...pages.filter((entry) => entry.group >= 1)]
}

const themes: Option[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor }
]

/** Where View code opens a file: the first editor installed, a named one, or the system's choice. */
const editors: Option[] = [
  { value: "auto", label: "Automatic" },
  ...codeEditors.map((editor) => ({ value: editor.id, label: editor.name })),
  { value: "system", label: "System default" }
]

const sizes: Option[] = ["png", "jpg"].flatMap((format) =>
  [1, 2, 3].map((scale) => ({ value: `${format} ${scale}x`, label: `${format.toUpperCase()} ${scale}x` }))
)

export const settings: Setting[] = [
  {
    id: "theme",
    page: "general",
    label: "Theme",
    detail: "Previews show whichever theme their mode picks.",
    keywords: ["dark", "light", "appearance", "color scheme"],
    group: "Appearance",
    scope: "app",
    control: { kind: "select", options: themes },
    default: "dark"
  },
  {
    id: "autosave",
    page: "general",
    label: "Save automatically",
    detail: "Saves each change a moment after it's made.",
    keywords: ["autosave"],
    group: "Saving",
    scope: "either",
    control: { kind: "switch" },
    default: false
  },
  {
    id: "codeEditor",
    page: "general",
    label: "Code editor",
    detail: "Where View code opens a component's file. Automatic uses the first one installed.",
    keywords: ["vscode", "cursor", "ide", "view code"],
    group: "Code",
    scope: "app",
    control: { kind: "select", options: editors },
    default: "auto"
  },
  {
    id: "componentsView",
    page: "general",
    label: "Components view",
    detail: "How the Components tab lists components.",
    keywords: ["assets", "grid", "list"],
    group: "Panels",
    scope: "app",
    control: {
      kind: "select",
      options: [
        { value: "names", label: "Names" },
        { value: "list", label: "List" },
        { value: "grid", label: "Grid" }
      ]
    },
    default: "list"
  },
  {
    id: "snapping",
    page: "canvas",
    label: "Snap to screens and components",
    detail: "Screens and components line up with the edges and centers of those around them while dragged.",
    keywords: ["align", "guides", "smart guides"],
    scope: "either",
    control: { kind: "switch" },
    default: true
  },
  {
    id: "layoutGrid",
    page: "canvas",
    label: "Layout grid",
    detail: "Column grids over every preview, sized for its viewport.",
    keywords: ["columns"],
    scope: "either",
    control: { kind: "switch" },
    default: false
  },
  {
    id: "directPages",
    page: "canvas",
    label: "Draw pages directly",
    detail:
      "Pages share one copy of your app with components and sleep out of view. Page code that navigates can reload Parity.",
    keywords: ["routes", "iframe", "router"],
    scope: "app",
    control: { kind: "switch" },
    default: false
  },
  {
    id: "exportSizes",
    page: "export",
    label: "Export sizes",
    detail: "What Export images and each new layer's Export section write.",
    keywords: ["png", "jpg", "scale", "2x", "image"],
    scope: "either",
    control: { kind: "multi", options: sizes },
    default: ["png 1x", "png 2x"]
  },
  {
    id: "telemetry",
    page: "diagnostics",
    label: "Share diagnostics",
    detail: "Errors and crashes, sent to the Parity team to help fix bugs.",
    keywords: ["telemetry", "sentry", "crash reports", "privacy", "errors"],
    group: "Sharing",
    scope: "app",
    control: { kind: "switch" },
    default: true
  },
  {
    id: "installId",
    page: "diagnostics",
    label: "Install ID",
    detail: "Groups this install's reports.",
    group: "Sharing",
    scope: "app",
    control: { kind: "fixed" },
    default: ""
  },
  {
    id: "performanceStats",
    page: "diagnostics",
    label: "Performance stats",
    detail: "Frame rate, memory and CPU in the status bar.",
    keywords: ["fps", "frame rate", "status bar"],
    group: "Performance",
    scope: "app",
    control: { kind: "switch" },
    default: false
  },
  {
    id: "betaUpdates",
    page: "updates",
    label: "Get beta updates",
    detail: "Include early releases. They may be less stable.",
    keywords: ["prerelease", "channel"],
    scope: "app",
    control: { kind: "switch" },
    default: false
  }
]

/** Every setting Settings shows: Parity's own, then each extension's. */
export function allSettings(extensions: readonly Pick<Extension, "settings">[]): Setting[] {
  return [...settings, ...extensions.flatMap((extension) => extension.settings)]
}

export function defaults(): Record<string, Value> {
  return Object.fromEntries(settings.map((setting) => [setting.id, setting.default]))
}
