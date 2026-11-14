import {
  companionScale,
  type ModeSettings,
  type ModeVariable,
  type ResolvedMode,
  type VariableOption
} from "@parity-app/core"
import { BookOpen, ExternalLink, type LucideIcon } from "lucide-react"

/*
 * The designs the exploration draws, with pictures of the example app and its stories, and how a preview's own values
 * sit over its mode's. Nothing here draws: the canvas and the Design tab both read it.
 */

const shots = import.meta.glob<string>("./shots/*.png", { eager: true, import: "default" })

/** A state of a design: a Storybook file's story, or a page as it is. */
export interface StateItem {
  id: string
  name: string
  /** Its pictures' name in `shots`, before the device, theme and direction. */
  picture: string
  /** A story's own size, which its preview fits; a page fills its preview's width. */
  size?: { width: number; height: number }
}

/** A part of a route's path: text, or a param drawn with the value it's given. */
export type PathPart = { text: string } | { param: string }

export interface BoardData {
  id: string
  /** A page of the app's router, or a Storybook file's stories. */
  kind: "page" | "story"
  name: string
  path?: PathPart[]
  /** Where the page landed instead of its own path. */
  lands?: string
  action: { label: string; icon: LucideIcon }
  states: StateItem[]
}

const openInBrowser = { label: "Open in browser", icon: ExternalLink }
const openInStorybook = { label: "Open in Storybook", icon: BookOpen }
const page = (name: string, picture: string): StateItem => ({ id: "page", name, picture })

export const routeBoards: BoardData[] = [
  { id: "app", kind: "page", name: "App", path: [{ text: "/" }], action: openInBrowser, states: [page("App", "app")] },
  {
    id: "dashboard",
    kind: "page",
    name: "Dashboard",
    path: [{ text: "/dashboard" }],
    lands: "/login",
    action: openInBrowser,
    states: [page("Dashboard", "login")]
  },
  {
    id: "detail",
    kind: "page",
    name: "Project detail",
    path: [{ text: "/projects/" }, { param: "projectId" }],
    action: openInBrowser,
    states: [page("Project detail", "detail")]
  },
  {
    id: "billing",
    kind: "page",
    name: "Billing",
    path: [{ text: "/settings/billing" }],
    action: openInBrowser,
    states: [page("Billing", "billing")]
  },
  {
    id: "profile",
    kind: "page",
    name: "Profile",
    path: [{ text: "/settings/profile" }],
    action: openInBrowser,
    states: [page("Profile", "profile")]
  }
]

/** What a design's states are called: a Storybook file's are its stories. */
export function stateNouns(kind: BoardData["kind"]): { one: string; many: string } {
  return kind === "story" ? { one: "story", many: "Stories" } : { one: "state", many: "States" }
}

/** A preview's key: its state's id and its mode's, as `default/desktop-light`. */
export const previewKey = (state: string, mode: string) => `${state}/${mode}`

/** The state and the mode a preview's key names. */
export interface PreviewAt {
  state: string
  mode: string
}

/** The state and the mode a preview's key names. */
export function previewOf(key: string): PreviewAt {
  const at = key.indexOf("/")

  return { state: key.slice(0, at), mode: key.slice(at + 1) }
}

/** Settings' index only redirects, so it's a group round Billing and Profile rather than a page. */
export const settingsGroup = { members: ["billing", "profile"] }

export function storyBoards(): BoardData[] {
  return [
    {
      id: "plan-card",
      kind: "story",
      name: "Plan card",
      action: openInStorybook,
      states: [
        { id: "default", name: "Default", picture: "plan-default", size: { width: 273, height: 498 } },
        { id: "popular", name: "Popular", picture: "plan-popular", size: { width: 273, height: 498 } },
        { id: "team-business", name: "Team and Business", picture: "plan-side", size: { width: 572, height: 498 } }
      ]
    },
    {
      id: "button",
      kind: "story",
      name: "Button",
      action: openInStorybook,
      states: [
        { id: "default", name: "Default", picture: "button-default", size: { width: 219, height: 98 } },
        { id: "outline", name: "Outline", picture: "button-outline", size: { width: 219, height: 98 } }
      ]
    }
  ]
}

/**
 * What a preview sets for itself over its mode: its width, its zoom, and an option of any of the mode's variables. One
 * it doesn't set is its mode's.
 */
export interface OwnValues {
  width?: number
  scale?: number
  options?: Record<string, string>
}

/** What a preview draws with: its own values over its mode's. */
export interface PreviewValues {
  width: number
  /** How large it draws, as a share of its size. */
  scale: number
  /** Drawn at the scale that fits it beside the first preview, as no zoom of its own. */
  fitted: boolean
  /** The option of each of the mode's variables, the preview's own over its mode's. */
  options: { variable: ModeVariable; option: VariableOption }[]
}

/** The width a preview has before it's given one: its mode's for a page, its own for a story, which fits its content. */
export function baseWidth(state: StateItem, mode: ResolvedMode): number {
  return state.size?.width ?? mode.width
}

/**
 * A preview's values: its own over its mode's. The first preview draws at full size and the rest fit beside it, unless
 * it's being resized, which holds the scale it started at, given as `held`, so its edge follows the pointer.
 */
export function previewValues(
  state: StateItem,
  mode: ResolvedMode,
  own: OwnValues | undefined,
  first: boolean,
  held?: number
): PreviewValues {
  const width = own?.width ?? baseWidth(state, mode)

  const options = mode.options.map(({ variable, option }) => {
    const chosen = own?.options?.[variable.id]

    return { variable, option: variable.options.find((each) => each.id === chosen) ?? option }
  })

  const fit = held ?? (first ? 1 : companionScale(width))

  return { width, scale: own?.scale ?? fit, fitted: own?.scale === undefined && !first, options }
}

/** One of a preview's values, as its header and the Design tab name it. */
export type ValueKey = "width" | "scale" | `option:${string}`

/** The values a preview sets for itself, in the order its header shows them. */
export function ownKeys(own: OwnValues | undefined): ValueKey[] {
  if (!own) {
    return []
  }

  return [
    ...(own.width === undefined ? [] : ["width" as const]),
    ...(own.scale === undefined ? [] : ["scale" as const]),
    ...Object.keys(own.options ?? {}).map((variable) => `option:${variable}` as const)
  ]
}

function valueOf(own: OwnValues | undefined, key: ValueKey): number | string | undefined {
  if (key === "width" || key === "scale") {
    return own?.[key]
  }

  return own?.options?.[key.slice("option:".length)]
}

/** The values that differ from what was last saved, which show the change mark and a reset. */
export function unsavedKeys(own: OwnValues | undefined, saved: OwnValues | undefined): ValueKey[] {
  const keys = new Set([...ownKeys(own), ...ownKeys(saved)])

  return [...keys].filter((key) => valueOf(own, key) !== valueOf(saved, key))
}

/** `own` with one value set, or taken away with `undefined`, which leaves it to the mode. */
export function withValue(own: OwnValues | undefined, key: ValueKey, value: number | string | undefined): OwnValues {
  const next: OwnValues = { ...own, options: { ...own?.options } }

  if (key === "width" || key === "scale") {
    if (value === undefined) {
      delete next[key]
    } else {
      next[key] = Number(value)
    }
  } else {
    const variable = key.slice("option:".length)

    if (value === undefined) {
      delete next.options![variable]
    } else {
      next.options![variable] = String(value)
    }
  }

  if (Object.keys(next.options!).length === 0) {
    delete next.options
  }

  return next
}

/** `own` with each of `keys` put back as `saved` has it, or every value when `keys` isn't given. */
export function resetValues(own: OwnValues | undefined, saved: OwnValues | undefined, keys?: ValueKey[]): OwnValues {
  if (!keys) {
    return structuredClone(saved ?? {})
  }

  return keys.reduce<OwnValues>((next, key) => withValue(next, key, valueOf(saved, key)), own ?? {})
}

/** A breakpoint the app's styles respond at: Tailwind CSS's own, as its adapter reads them from the theme. */
export interface Breakpoint {
  name: string
  width: number
}

export const breakpoints: Breakpoint[] = [
  { name: "sm", width: 640 },
  { name: "md", width: 768 },
  { name: "lg", width: 1024 },
  { name: "xl", width: 1280 },
  { name: "2xl", width: 1536 }
]

/** The breakpoint a width is at or past, the widest one, or none below the first. */
export function breakpointAt(width: number): Breakpoint | undefined {
  return breakpoints.findLast((each) => width >= each.width)
}

/** A width dragged to within `reach` of a breakpoint lands on it, so a preview is easy to set exactly at one. */
export function snapToBreakpoint(width: number, reach: number): number {
  const near = breakpoints.find((each) => Math.abs(each.width - width) <= reach)

  return near?.width ?? width
}

/** A size on the canvas, in pixels. */
export interface Size {
  width: number
  height: number
}

/** The device a page's picture was taken on: its file's suffix and its screen's size. */
interface Device extends Size {
  suffix: string
}

/** The picture a page's preview shows, taken nearest its width, as its breakpoints draw it. */
function pageDevice(width: number): Device {
  if (width < 640) {
    return { suffix: "-mobile", width: 390, height: 844 }
  }

  return width < 1024 ? { suffix: "-tablet", width: 768, height: 1024 } : { suffix: "", width: 1280, height: 800 }
}

const isDark = (options: PreviewValues["options"]) =>
  options.some(
    ({ variable, option }) => variable.kind === "theme" && (option.className?.split(" ").includes("dark") ?? false)
  )

const isRtl = (options: PreviewValues["options"]) => options.some(({ option }) => option.attributes?.dir === "rtl")

/** How large a preview is before its zoom: a page as wide as its width and as tall as its picture there; a story its own. */
export function previewSize(state: StateItem, values: PreviewValues): Size {
  if (state.size) {
    return { width: values.width, height: state.size.height }
  }

  const device = pageDevice(values.width)

  return { width: values.width, height: Math.round((values.width * device.height) / device.width) }
}

/** The picture of a preview: the example app or its story, in the preview's theme and, for a page, its direction. */
export function picture(state: StateItem, values: PreviewValues): string {
  const theme = isDark(values.options) ? "dark" : "light"

  const name = state.size
    ? `${state.picture}-${theme}`
    : `${state.picture}${pageDevice(values.width).suffix}-${theme}${isRtl(values.options) ? "-rtl" : ""}`

  return shots[`./shots/${name}.png`]!
}

/** Whether a preview draws dark, for the color behind its picture. */
export const drawsDark = (values: PreviewValues) => isDark(values.options)

/**
 * The example's modes with as many locales as a widely translated app has, so a preview's Locale shows how a long list
 * reads. Arabic, Hebrew, Persian and Urdu run right to left.
 */
export function withManyLocales(settings: ModeSettings): ModeSettings {
  const locales: [string, string, ("rtl" | "ltr")?][] = [
    ["en", "English"],
    ["ar", "Arabic", "rtl"],
    ["bg", "Bulgarian"],
    ["zh-CN", "Chinese (Simplified)"],
    ["zh-TW", "Chinese (Traditional)"],
    ["cs", "Czech"],
    ["da", "Danish"],
    ["nl", "Dutch"],
    ["fi", "Finnish"],
    ["fr", "French"],
    ["de", "German"],
    ["el", "Greek"],
    ["he", "Hebrew", "rtl"],
    ["hi", "Hindi"],
    ["hu", "Hungarian"],
    ["id", "Indonesian"],
    ["it", "Italian"],
    ["ja", "Japanese"],
    ["ko", "Korean"],
    ["nb", "Norwegian"],
    ["fa", "Persian", "rtl"],
    ["pl", "Polish"],
    ["pt-BR", "Portuguese (Brazil)"],
    ["es", "Spanish"],
    ["sv", "Swedish"],
    ["th", "Thai"],
    ["tr", "Turkish"],
    ["ur", "Urdu", "rtl"]
  ]

  return {
    ...settings,
    variables: settings.variables.map((variable) =>
      variable.kind === "locale"
        ? {
            ...variable,
            options: locales.map(([id, name, dir = "ltr"]) => ({ id, name, attributes: { lang: id, dir } }))
          }
        : variable
    )
  }
}
