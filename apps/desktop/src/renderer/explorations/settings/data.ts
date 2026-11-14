import {
  Download,
  FlaskConical,
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
import { reactLogo, storybookLogo, tailwindLogo, tanstackLogo, viteLogo } from "./logos.ts"
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
  /** What detection found, or why it isn't running. */
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
    adds: ["Stories as screens", "Storybook server", "Open in Storybook"],
    permissions: [
      { label: "Read files", detail: ".storybook/**, src/**/*.stories.tsx" },
      { label: "Write files", detail: "src/**/*.stories.tsx" },
      { label: "Run processes", detail: "storybook dev" },
      { label: "Connect to", detail: "localhost" },
      { label: "Change designs", detail: "Writes stories back when a screen changes", grant: true }
    ],
    activation: { event: "When Storybook was found", ms: 38 },
    memoryMb: 21
  },
  {
    id: "vite",
    name: "Vite",
    icon: markOf(viteLogo, "Vite"),
    running: true,
    found: "Vite 7.2, config in vite.config.ts",
    adds: ["Build server"],
    permissions: [
      { label: "Read files", detail: "vite.config.ts, src/**" },
      { label: "Run processes", detail: "vite" },
      { label: "Connect to", detail: "localhost" }
    ],
    activation: { event: "When Vite was found", ms: 12 },
    memoryMb: 34
  },
  {
    id: "react",
    name: "React",
    icon: markOf(reactLogo, "React"),
    running: true,
    found: "React 19.2",
    adds: ["Finds components", "Draws components"],
    permissions: [{ label: "Read files", detail: "src/**" }],
    activation: { event: "When React was found", ms: 9 },
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
    activation: { event: "When Tailwind CSS was found", ms: 17 },
    memoryMb: 12
  },
  {
    id: "tanstack-router",
    name: "TanStack Router",
    icon: markOf(tanstackLogo, "TanStack"),
    running: true,
    found: "TanStack Router 1.131, routes in src/routes",
    adds: ["Routes on the canvas", "Open in browser"],
    permissions: [{ label: "Read files", detail: "src/routes/**" }],
    activation: { event: "When a page opened", ms: 21 },
    memoryMb: 9
  }
]

/** Names for a long list of installed extensions, to see how the Extensions page holds up with 40. */
const moreNames = [
  "Angular",
  "Astro",
  "Chakra UI",
  "Chromatic",
  "Electron",
  "Emotion",
  "ESLint",
  "Expo",
  "Framer Motion",
  "Heroicons",
  "i18next",
  "Jotai",
  "Lingui",
  "Lucide",
  "Mobbin",
  "MUI",
  "Nuxt",
  "Phosphor",
  "Playwright",
  "PostCSS",
  "Prettier",
  "Qwik",
  "React Native",
  "React Router",
  "Redux",
  "Remix",
  "Sass",
  "Solid",
  "styled-components",
  "SvelteKit",
  "TanStack Query",
  "Tauri",
  "Unsplash",
  "Vitest"
]

/** Which of the extra extensions run in the project, as tools a project like Kestrel also has. */
const runningMore = new Set(["ESLint", "Lucide", "Prettier", "TanStack Query", "Vitest", "Playwright", "Unsplash"])

export const manyExtensions: Extension[] = [
  ...extensions,
  ...moreNames.map((name) => {
    const extension: Extension = {
      id: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
      name,
      icon: Puzzle,
      running: runningMore.has(name),
      found: runningMore.has(name) ? `${name} in package.json` : "Not in this project",
      adds: [],
      permissions: [{ label: "Read files", detail: "src/**" }]
    }

    if (extension.running) {
      extension.activation = { event: `When ${name} was found`, ms: 8 }
      extension.memoryMb = 6
    }

    return extension
  })
]

export const pages: Page[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, group: 0 },
  { id: "canvas", label: "Canvas", icon: Frame, group: 0 },
  { id: "export", label: "Export", icon: Download, group: 0 },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, group: 0 },
  { id: "project", label: project.name, icon: projectMark(project.name), group: 1 },
  { id: "extensions", label: "Extensions", icon: Puzzle, group: 1 },
  { id: "experiments", label: "Experiments", icon: FlaskConical, group: 2 },
  { id: "diagnostics", label: "Diagnostics", icon: ShieldCheck, group: 2 },
  { id: "updates", label: "Updates", icon: RefreshCw, group: 2 }
]

const themes: Option[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
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
    id: "flag.npmExtensions",
    page: "experiments",
    label: "Install extensions from npm",
    detail: "Adds Install to the Extensions page.",
    keywords: ["feature flag", "extensions"],
    scope: "app",
    control: { kind: "switch" },
    default: false
  },
  {
    id: "flag.lenses",
    page: "experiments",
    label: "App lenses",
    detail: "Shows each layer of the app as its own view, read from the project as Storybook is.",
    keywords: ["feature flag", "routes", "views"],
    scope: "app",
    control: { kind: "switch" },
    default: false
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
    default: "3f9c2a71-6b0e-4d8a-9e15-c4a7d2b08f63"
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
  },
  {
    id: "storybook.openIn",
    page: "ext:storybook",
    label: "Open stories in",
    keywords: ["browser"],
    scope: "app",
    control: {
      kind: "select",
      options: [
        { value: "browser", label: "Your browser" },
        { value: "parity", label: "Parity" }
      ]
    },
    default: "browser"
  }
]

export function defaults(): Record<string, Value> {
  return Object.fromEntries(settings.map((setting) => [setting.id, setting.default]))
}

/** The Parity version Updates shows, as the app's package.json has it. */
export const version = "0.82.1"
