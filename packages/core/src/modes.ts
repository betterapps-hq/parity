import { type DeviceKind, deviceKinds } from "./devices.ts"
import {
  compact,
  expectArray,
  expectKnownKeys,
  expectNumber,
  expectObject,
  expectOneOf,
  expectString,
  optional
} from "./validate.ts"

/**
 * Project-wide modes, like Chromatic modes in Storybook. A variable is one axis of the environment (viewport, theme,
 * locale…); a mode is a named combination of one option per variable. Every design can show any mode, and each design
 * chooses which ones it shows. The first mode is the primary one: the main frame of every design.
 */
export interface ModeSettings {
  version: 1
  variables: ModeVariable[]
  modes: ModeSpec[]
}

export interface ModeVariable {
  id: string
  name: string
  kind: (typeof variableKinds)[number]
  options: VariableOption[]
}

/** What choosing this option does to a rendered frame. */
export interface VariableOption {
  id: string
  name: string
  /** Frame width in CSS pixels (viewport options). */
  width?: number
  /** The screen's height, for viewports taken from a device. Frames still grow with their content. */
  height?: number
  /** What the viewport is, for its icon. Otherwise judged by its width. */
  device?: DeviceKind
  /** Class added to the frame body, e.g. `dark` for shadcn themes. */
  className?: string
  /** Attributes set on the frame body, e.g. `lang` and `dir` for locales. */
  attributes?: Record<string, string>
}

export interface ModeSpec {
  id: string
  name: string
  /** Option id per variable id. A variable that isn't listed uses its first option. */
  values: Record<string, string>
}

/** A mode with its variables applied: everything needed to render a frame in it. */
export interface ResolvedMode {
  id: string
  name: string
  width: number
  /** Viewport option id, which design nodes use as their `responsive` key. */
  viewport: string
  classNames: string[]
  attributes: Record<string, string>
  /** The chosen option per variable, for labels. */
  options: { variable: ModeVariable; option: VariableOption }[]
}

const variableKinds = ["viewport", "theme", "locale", "custom"] as const
const defaultWidth = 1280

export const defaultModeSettings: ModeSettings = {
  version: 1,
  variables: [
    {
      id: "viewport",
      name: "Viewport",
      kind: "viewport",
      options: [
        { id: "desktop", name: "Desktop", width: 1280, device: "laptop" },
        { id: "tablet", name: "Tablet", width: 768, device: "tablet" },
        { id: "mobile", name: "Mobile", width: 390, device: "phone" }
      ]
    },
    {
      id: "theme",
      name: "Theme",
      kind: "theme",
      options: [
        { id: "light", name: "Light" },
        { id: "dark", name: "Dark", className: "dark" }
      ]
    },
    {
      id: "locale",
      name: "Locale",
      kind: "locale",
      options: [
        { id: "en", name: "English", attributes: { lang: "en", dir: "ltr" } },
        { id: "ar", name: "Arabic (RTL)", attributes: { lang: "ar", dir: "rtl" } }
      ]
    }
  ],
  modes: [
    { id: "desktop-light", name: "Desktop Light", values: { viewport: "desktop", theme: "light" } },
    { id: "desktop-dark", name: "Desktop Dark", values: { viewport: "desktop", theme: "dark" } },
    { id: "tablet-light", name: "Tablet Light", values: { viewport: "tablet", theme: "light" } },
    { id: "mobile-light", name: "Mobile Light", values: { viewport: "mobile", theme: "light" } }
  ]
}

export function resolveMode(settings: ModeSettings, mode: ModeSpec): ResolvedMode {
  const options = settings.variables.map((variable) => ({
    variable,
    option: variable.options.find((option) => option.id === mode.values[variable.id]) ?? variable.options[0]!
  }))
  const viewport = options.find(({ variable }) => variable.kind === "viewport")?.option
  return {
    id: mode.id,
    name: mode.name,
    width: options.find(({ option }) => option.width !== undefined)?.option.width ?? defaultWidth,
    viewport: viewport?.id ?? "default",
    classNames: options.flatMap(({ option }) => (option.className ? [option.className] : [])),
    attributes: Object.assign({}, ...options.map(({ option }) => option.attributes ?? {})) as Record<string, string>,
    options
  }
}

/**
 * A mode as Storybook globals, which decorators read: each variable's chosen option, by id, as in
 * `{ viewport: "mobile", theme: "dark", locale: "en" }`.
 */
export function modeGlobals(mode: Pick<ResolvedMode, "options">): Record<string, string> {
  return Object.fromEntries(mode.options.map(({ variable, option }) => [variable.id, option.id]))
}

/**
 * The modes a design shows: its main frame's (its own pick, else the project's primary mode), and the ones beside it
 * in project order.
 */
export function shownModes(
  settings: ModeSettings,
  view: { mode?: string; modes?: string[] } | undefined
): { main: ResolvedMode; beside: ResolvedMode[]; all: ResolvedMode[] } {
  const all = resolveModes(settings)
  const main = all.find((mode) => mode.id === view?.mode) ?? all[0]!
  const beside = new Set(view?.modes ?? [])
  return { main, beside: all.filter((mode) => mode !== main && beside.has(mode.id)), all }
}

/** The primary mode first, then the others in the order the project defines them. */
export function resolveModes(settings: ModeSettings): ResolvedMode[] {
  return settings.modes.map((mode) => resolveMode(settings, mode))
}

/** A short, unique id for a new mode or option, derived from its name. */
export function uniqueId(name: string, taken: Iterable<string>): string {
  const base =
    name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "mode"
  const used = new Set(taken)
  let id = base
  for (let index = 2; used.has(id); index++) id = `${base}-${index}`
  return id
}

export function parseModeSettings(value: unknown): ModeSettings {
  const settings = expectObject(value, "")
  expectKnownKeys(settings, ["$schema", "version", "variables", "modes"], "")
  if (settings.version !== 1) throw new TypeError("/version: expected 1")
  const variables = expectArray(settings.variables, "/variables").map((item, index) => {
    const at = `/variables/${index}`
    const variable = expectObject(item, at)
    expectKnownKeys(variable, ["id", "name", "kind", "options"], at)
    const options = expectArray(variable.options, `${at}/options`).map((entry, optionIndex) => {
      const optionAt = `${at}/options/${optionIndex}`
      const option = expectObject(entry, optionAt)
      expectKnownKeys(option, ["id", "name", "width", "height", "device", "className", "attributes"], optionAt)
      return compact({
        id: expectString(option.id, `${optionAt}/id`),
        name: expectString(option.name, `${optionAt}/name`),
        width: optional(option.width, (v) => expectNumber(v, `${optionAt}/width`)),
        height: optional(option.height, (v) => expectNumber(v, `${optionAt}/height`)),
        device: optional(option.device, (v) => expectOneOf(v, deviceKinds, `${optionAt}/device`)),
        className: optional(option.className, (v) => expectString(v, `${optionAt}/className`)),
        attributes: optional(option.attributes, (v) => {
          const attributes = expectObject(v, `${optionAt}/attributes`)
          for (const [name, attribute] of Object.entries(attributes)) {
            expectString(attribute, `${optionAt}/attributes/${name}`)
          }
          return attributes as Record<string, string>
        })
      })
    })
    if (options.length === 0) throw new TypeError(`${at}/options: expected at least one option`)
    return {
      id: expectString(variable.id, `${at}/id`),
      name: expectString(variable.name, `${at}/name`),
      kind: expectOneOf(variable.kind, variableKinds, `${at}/kind`),
      options
    }
  })
  const modes = expectArray(settings.modes, "/modes").map((item, index) => {
    const at = `/modes/${index}`
    const mode = expectObject(item, at)
    expectKnownKeys(mode, ["id", "name", "values"], at)
    const values: Record<string, string> = {}
    for (const [variableId, optionId] of Object.entries(expectObject(mode.values, `${at}/values`))) {
      const variable = variables.find((candidate) => candidate.id === variableId)
      if (!variable) throw new TypeError(`${at}/values/${variableId}: unknown variable`)
      const option = expectString(optionId, `${at}/values/${variableId}`)
      if (!variable.options.some((candidate) => candidate.id === option)) {
        throw new TypeError(`${at}/values/${variableId}: "${option}" is not an option of ${variable.name}`)
      }
      values[variableId] = option
    }
    return { id: expectString(mode.id, `${at}/id`), name: expectString(mode.name, `${at}/name`), values }
  })
  if (modes.length === 0) throw new TypeError("/modes: expected at least one mode")
  return { version: 1, variables, modes }
}
