import {
  Download,
  Frame,
  Keyboard,
  type LucideIcon,
  Monitor,
  Moon,
  Folder,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sun
} from "lucide-react"
import { nextLogo, reactLogo, storybookLogo, tailwindLogo, tanstackLogo, viteLogo } from "./logos.ts"
import { type Mark, markOf } from "./marks.tsx"

/** Whose a setting is: the person's, for every project, or everyone's who opens this project. */
export type Scope = "app" | "project"

export interface Option {
  value: string
  label: string
  icon?: LucideIcon
}

export type Control =
  | { kind: "switch" }
  | { kind: "segmented"; options: Option[] }
  | { kind: "select"; options: Option[] }
  | { kind: "text"; mono?: boolean }
  | { kind: "number"; unit?: string }
  | { kind: "jump"; page: string; label: string }
  | { kind: "sizes" }

export type Value = string | number | boolean | string[]

export interface Setting {
  id: string
  page: string
  label: string
  /** One line on what it changes, when the label alone doesn't say. */
  detail?: string
  scope: Scope
  control: Control
  default: Value
  /** The extension that declares it, for project settings shown on the project's page. */
  extension?: string
  /** Something outside Settings decides it for now, as `PARITY_TELEMETRY` does for diagnostics. */
  lockedBy?: string
}

export type PageGroup = "app" | "system" | "project" | "extensions"

export interface Page {
  id: string
  label: string
  icon: Mark
  group: PageGroup
  /** An extension's page, listed under Extensions. */
  extension?: string
}

export interface Permission {
  label: string
  detail: string
  /** Goes through Parity's API, so it can be withdrawn while the extension keeps running. */
  grant?: boolean
}

export interface Extension {
  id: string
  name: string
  icon: Mark
  running: boolean
  /** What detection found, or why it didn't run. */
  found: string
  adds: string[]
  permissions: Permission[]
  activation?: { event: string; ms: number }
  memoryMb?: number
}

/** The project the window has open. */
export const project = { name: "Kestrel", file: "kestrel.par" }

export const extensions: Extension[] = [
  {
    id: "storybook",
    name: "Storybook",
    icon: markOf(storybookLogo, "Storybook"),
    running: true,
    found: "Storybook 9.1, config in .storybook",
    adds: ["Stories as screens", "Storybook server", "Storybook tab", "Open in Storybook"],
    permissions: [
      { label: "Read files", detail: ".storybook/**, src/**/*.stories.tsx" },
      { label: "Write files", detail: "src/**/*.stories.tsx" },
      { label: "Run processes", detail: "storybook dev" },
      { label: "Connect to", detail: "localhost" },
      { label: "Change designs", detail: "Writes stories back when a screen changes", grant: true }
    ],
    activation: { event: "When Storybook was detected", ms: 38 },
    memoryMb: 21
  },
  {
    id: "vite",
    name: "Vite",
    icon: markOf(viteLogo, "Vite"),
    running: true,
    found: "Vite 7.2, config in vite.config.ts",
    adds: ["Build server", "Production build"],
    permissions: [
      { label: "Read files", detail: "vite.config.ts, src/**" },
      { label: "Run processes", detail: "vite" },
      { label: "Connect to", detail: "localhost" }
    ],
    activation: { event: "When Vite was detected", ms: 12 },
    memoryMb: 34
  },
  {
    id: "react",
    name: "React",
    icon: markOf(reactLogo, "React"),
    running: true,
    found: "React 19.2",
    adds: ["Draws components", "Props from TypeScript"],
    permissions: [{ label: "Read files", detail: "src/**" }],
    activation: { event: "When React was detected", ms: 9 },
    memoryMb: 16
  },
  {
    id: "tailwind",
    name: "Tailwind CSS",
    icon: markOf(tailwindLogo, "Tailwind"),
    running: true,
    found: "Tailwind CSS 4.1, theme in src/styles.css",
    adds: ["Tokens from the theme", "Styles as classes"],
    permissions: [
      { label: "Read files", detail: "src/**/*.css" },
      { label: "Write files", detail: "src/styles.css" },
      { label: "Change designs", detail: "Writes classes when a style changes", grant: true }
    ],
    activation: { event: "When Tailwind CSS was detected", ms: 17 },
    memoryMb: 12
  },
  {
    id: "tanstack-router",
    name: "TanStack Router",
    icon: markOf(tanstackLogo, "TanStack"),
    running: true,
    found: "TanStack Router 1.131, routes in src/routes",
    adds: ["Pages as screens", "Route lines on the canvas"],
    permissions: [{ label: "Read files", detail: "src/routes/**" }],
    activation: { event: "When a page opened", ms: 21 },
    memoryMb: 9
  },
  {
    id: "next",
    name: "Next.js",
    icon: markOf(nextLogo, "Next"),
    running: false,
    found: "Not in this project",
    adds: ["Pages as screens", "Next.js server"],
    permissions: [
      { label: "Read files", detail: "app/**, pages/**, next.config.*" },
      { label: "Run processes", detail: "next dev" },
      { label: "Connect to", detail: "localhost" }
    ]
  }
]

export const pages: Page[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, group: "app" },
  { id: "canvas", label: "Canvas", icon: Frame, group: "app" },
  { id: "export", label: "Export", icon: Download, group: "app" },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, group: "app" },
  { id: "privacy", label: "Diagnostics", icon: ShieldCheck, group: "system" },
  { id: "updates", label: "Updates", icon: RefreshCw, group: "system" },
  { id: "project", label: project.name, icon: Folder, group: "project" },
  { id: "extensions", label: "Extensions", icon: Puzzle, group: "extensions" },
  ...extensions.map((extension): Page => ({
    id: `ext:${extension.id}`,
    label: extension.name,
    icon: extension.icon,
    group: "extensions",
    extension: extension.id
  }))
]

const themes: Option[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
]

const editors: Option[] = [
  { value: "auto", label: "Automatic" },
  { value: "vscode", label: "VS Code" },
  { value: "cursor", label: "Cursor" },
  { value: "windsurf", label: "Windsurf" },
  { value: "zed", label: "Zed" },
  { value: "system", label: "System default" }
]

export const settings: Setting[] = [
  // General
  {
    id: "theme",
    page: "general",
    label: "Theme",
    detail: "Previews show whichever theme their mode picks.",
    scope: "app",
    control: { kind: "segmented", options: themes },
    default: "dark"
  },
  {
    id: "autosave",
    page: "general",
    label: "Save automatically",
    detail: "Saves each change a moment after it's made.",
    scope: "app",
    control: { kind: "switch" },
    default: false
  },
  {
    id: "codeEditor",
    page: "general",
    label: "Code editor",
    detail: "Where View code opens a component's file. Automatic uses the first one installed.",
    scope: "app",
    control: { kind: "select", options: editors },
    default: "auto"
  },
  {
    id: "shortcuts",
    page: "general",
    label: "Keyboard shortcuts",
    scope: "app",
    control: { kind: "jump", page: "shortcuts", label: "Show shortcuts" },
    default: ""
  },
  // Canvas
  {
    id: "snapping",
    page: "canvas",
    label: "Snap to screens and components",
    detail: "Screens and components line up with the edges and centers of those around them while dragged.",
    scope: "app",
    control: { kind: "switch" },
    default: true
  },
  {
    id: "layoutGrid",
    page: "canvas",
    label: "Layout grid",
    detail: "Column grids over every preview, sized for its viewport.",
    scope: "app",
    control: { kind: "switch" },
    default: false
  },
  {
    id: "componentsView",
    page: "canvas",
    label: "Components view",
    scope: "app",
    control: {
      kind: "segmented",
      options: [
        { value: "names", label: "Names" },
        { value: "list", label: "List" },
        { value: "grid", label: "Grid" }
      ]
    },
    default: "list"
  },
  {
    id: "performanceStats",
    page: "canvas",
    label: "Performance stats",
    detail: "Frame rate, memory and CPU in the status bar.",
    scope: "app",
    control: { kind: "switch" },
    default: false
  },
  // Export
  {
    id: "exportScale",
    page: "export",
    label: "Image scale",
    detail: "How many pixels each CSS pixel becomes in exported PNGs.",
    scope: "app",
    control: {
      kind: "segmented",
      options: [
        { value: "1", label: "1x" },
        { value: "2", label: "2x" },
        { value: "3", label: "3x" }
      ]
    },
    default: "2"
  },
  {
    id: "exportSizes",
    page: "export",
    label: "Export sizes",
    detail: "What the Export section writes for each new layer.",
    scope: "app",
    control: { kind: "sizes" },
    default: ["PNG 1x", "PNG 2x"]
  },
  // Diagnostics
  {
    id: "telemetry",
    page: "privacy",
    label: "Send diagnostics",
    scope: "app",
    control: {
      kind: "select",
      options: [
        { value: "all", label: "Everything" },
        { value: "errors", label: "Errors and crashes" },
        { value: "off", label: "Nothing" }
      ]
    },
    default: "all"
  },
  {
    id: "installId",
    page: "privacy",
    label: "Install ID",
    detail: "Groups this install's reports.",
    scope: "app",
    control: { kind: "text", mono: true },
    default: "3f9c2a71-6b0e-4d8a-9e15-c4a7d2b08f63"
  },
  // Updates
  {
    id: "betaUpdates",
    page: "updates",
    label: "Get beta updates",
    detail: "Include early releases. They may be less stable.",
    scope: "app",
    control: { kind: "switch" },
    default: false
  },
  {
    id: "storybook.configDir",
    page: "ext:storybook",
    label: "Config folder",
    scope: "project",
    control: { kind: "text", mono: true },
    default: ".storybook",
    extension: "storybook"
  },
  {
    id: "storybook.port",
    page: "ext:storybook",
    label: "Port",
    detail: "Kept in the storybook script in package.json.",
    scope: "project",
    control: { kind: "number" },
    default: 6006,
    extension: "storybook"
  },
  {
    id: "storybook.openIn",
    page: "ext:storybook",
    label: "Open stories in",
    scope: "app",
    control: {
      kind: "segmented",
      options: [
        { value: "browser", label: "Your browser" },
        { value: "parity", label: "Parity" }
      ]
    },
    default: "browser",
    extension: "storybook"
  },
  {
    id: "vite.config",
    page: "ext:vite",
    label: "Config file",
    scope: "project",
    control: { kind: "text", mono: true },
    default: "vite.config.ts",
    extension: "vite"
  },
  {
    id: "vite.openOnStart",
    page: "ext:vite",
    label: "Open the build server's page when it starts",
    scope: "app",
    control: { kind: "switch" },
    default: false,
    extension: "vite"
  },
  {
    id: "tailwind.stylesheet",
    page: "ext:tailwind",
    label: "Theme stylesheet",
    scope: "project",
    control: { kind: "text", mono: true },
    default: "src/styles.css",
    extension: "tailwind"
  },
  {
    id: "tailwind.classOrder",
    page: "ext:tailwind",
    label: "Sort classes",
    detail: "Writes classes in the order Prettier's Tailwind plugin uses.",
    scope: "project",
    control: { kind: "switch" },
    default: true,
    extension: "tailwind"
  },
  {
    id: "router.routesDir",
    page: "ext:tanstack-router",
    label: "Routes folder",
    scope: "project",
    control: { kind: "text", mono: true },
    default: "src/routes",
    extension: "tanstack-router"
  },
  {
    id: "router.lines",
    page: "ext:tanstack-router",
    label: "Route lines",
    detail: "Lines between pages that link to each other.",
    scope: "app",
    control: { kind: "switch" },
    default: true,
    extension: "tanstack-router"
  }
]

/** Project settings, on the project's own page, grouped by the extension that declares each. */
export function projectSettings(): Setting[] {
  return settings.filter((setting) => setting.scope === "project" && setting.extension)
}

export function settingsOn(page: string): Setting[] {
  return settings.filter((setting) => setting.page === page)
}

export function pageOf(id: string): Page {
  return pages.find((page) => page.id === id) ?? pages[0]!
}

export function extensionOf(id: string): Extension | undefined {
  return extensions.find((extension) => extension.id === id)
}

export function defaults(): Record<string, Value> {
  return Object.fromEntries(settings.map((setting) => [setting.id, setting.default]))
}
