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
import { reactLogo, storybookLogo, tailwindLogo, viteLogo } from "./logos.ts"
import { type Mark, markOf, projectMark } from "./marks.tsx"

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

/**
 * A built-in extension as Settings shows it: what it adds, which its adapter says, and, in an open project, what
 * detection found and whether it runs there.
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
}

/** The built-in extensions and what each adds, before detection says whether it runs in a project. */
export const builtInExtensions: Omit<Extension, "running" | "found">[] = [
  {
    id: "storybook",
    name: "Storybook",
    icon: markOf(storybookLogo, "Storybook"),
    adds: ["Stories as screens", "Storybook server", "Open in Storybook"]
  },
  { id: "vite", name: "Vite", icon: markOf(viteLogo, "Vite"), adds: ["Build server"] },
  { id: "react", name: "React", icon: markOf(reactLogo, "React"), adds: ["Finds components", "Draws components"] },
  {
    id: "tailwind",
    name: "Tailwind CSS",
    icon: markOf(tailwindLogo, "Tailwind"),
    adds: ["Tokens from the theme", "Styles as classes"]
  }
]

/** What detection found of a tool: its id and, in a sentence, what and where. */
interface Found {
  id: string
  summary: string
}

/**
 * The built-in extensions as Settings lists them: each runs in the open project when detection found its tool, and
 * says what it found. With no project open, each says what it runs in.
 */
export function extensionsFrom(found: readonly Found[] | undefined): Extension[] {
  return builtInExtensions.map((extension) => {
    const tool = found?.find((entry) => entry.id === extension.id)

    if (tool) {
      return { ...extension, running: true, found: tool.summary }
    }

    return {
      ...extension,
      running: false,
      found: found ? `No ${extension.name} in this project` : `Runs in projects that use ${extension.name}`
    }
  })
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
  },
  {
    id: "storybook.configDir",
    page: "ext:storybook",
    label: "Config folder",
    scope: "project",
    control: { kind: "text" },
    default: ".storybook"
  }
]

export function defaults(): Record<string, Value> {
  return Object.fromEntries(settings.map((setting) => [setting.id, setting.default]))
}
