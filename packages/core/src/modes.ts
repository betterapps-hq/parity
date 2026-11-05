import { z } from "zod"
import { deviceKinds } from "./devices.ts"
import type { ContainerSpec } from "./document.ts"
import { fileObject, finiteNumber, parseData } from "./schema.ts"

const variableKinds = ["viewport", "theme", "locale", "custom"] as const

/** What choosing this option does to a rendered frame. */
const variableOption = fileObject({
  id: z.string(),
  name: z.string(),
  /** Frame width in CSS pixels (viewport options). */
  width: finiteNumber.optional(),
  /** The screen's height, for viewports taken from a device. Frames still grow with their content. */
  height: finiteNumber.optional(),
  /** What the viewport is, for its icon. Otherwise judged by its width. */
  device: z.enum(deviceKinds).optional(),
  /** Class added to the frame body, e.g. `dark` for shadcn themes. */
  className: z.string().optional(),
  /** Attributes set on the frame body, e.g. `lang` and `dir` for locales. */
  attributes: z.record(z.string(), z.string()).optional()
})

export type VariableOption = z.infer<typeof variableOption>

const modeVariable = fileObject({
  id: z.string(),
  name: z.string(),
  kind: z.enum(variableKinds),
  options: z.array(variableOption).min(1, "expected at least one option")
})

export type ModeVariable = z.infer<typeof modeVariable>

const modeSpec = fileObject({
  id: z.string(),
  name: z.string(),
  /** Option id per variable id. A variable that isn't listed uses its first option. */
  values: z.record(z.string(), z.string())
})

export type ModeSpec = z.infer<typeof modeSpec>

/**
 * Project-wide modes, like Chromatic modes in Storybook. A variable is one axis of the environment (viewport, theme,
 * locale…); a mode is a named combination of one option per variable. Every design can show any mode, and each design
 * chooses which ones it shows. The first mode is the primary one: the main frame of every design.
 */
export const modeSettings = fileObject({
  $schema: z.string().optional(),
  version: z.literal(1),
  variables: z.array(modeVariable),
  modes: z.array(modeSpec).min(1, "expected at least one mode")
}).superRefine((settings, context) => {
  // Each mode picks options its variables have.
  for (const [index, mode] of settings.modes.entries()) {
    for (const [variableId, optionId] of Object.entries(mode.values)) {
      const path = ["modes", index, "values", variableId]
      const variable = settings.variables.find((candidate) => candidate.id === variableId)
      if (!variable) context.addIssue({ code: "custom", message: "unknown variable", path, input: variableId })
      else if (!variable.options.some((option) => option.id === optionId)) {
        const message = `"${optionId}" is not an option of ${variable.name}`
        context.addIssue({ code: "custom", message, path, input: optionId })
      }
    }
  }
})

export type ModeSettings = z.infer<typeof modeSettings>

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

/** A frame's width when no option in its mode sets one. */
export const defaultWidth = 1280

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
 * in project order. A frame shows the primary mode alone.
 */
export function shownModes(
  settings: ModeSettings,
  design: Pick<ContainerSpec, "kind" | "view">
): { main: ResolvedMode; beside: ResolvedMode[]; all: ResolvedMode[] } {
  const all = resolveModes(settings)
  if (design.kind === "frame") return { main: all[0]!, beside: [], all }
  const { view } = design
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

/** Reads a project's modes, or throws `TypeError` with the first problem as `/json/pointer: message`. */
export function parseModeSettings(value: unknown): ModeSettings {
  return parseData(modeSettings, value)
}
