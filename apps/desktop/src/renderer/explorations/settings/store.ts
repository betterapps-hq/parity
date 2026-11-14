import type { Extension, Setting, Value } from "./data.ts"

/** Shortcuts the person changed, by command, and which commands lost their keys to which. */
export interface Bindings {
  /** Keys set for a command, written as the keymap writes them; `""` for none. */
  changed: Record<string, string>
  /** A command whose keys another took, and that command's name. */
  lost: Record<string, string>
}

/** A key binding the file has that Parity skipped, as the proposal lists them. */
export interface Skipped {
  keys: string
  command: string
}

/** What Settings reads and changes, for every page. */
export interface Store {
  locked: Record<string, string>
  /** A setting to show marked, as one reached from search or a link is. */
  marked?: string
  extensions: Extension[]
  /** The person's value, for every project. */
  mine: (setting: Setting) => Value
  /** The project's value: its own setting's, or the one it changes for itself; nothing when it doesn't. */
  theirs: (setting: Setting) => Value | undefined
  setMine: (setting: Setting, value: Value) => void
  setTheirs: (setting: Setting, value: Value) => void
  /** The project stops changing one of the person's settings for itself. */
  resetTheirs: (setting: Setting) => void
  /** The person's settings the project changes for itself, in the order it began to. */
  overrides: string[]
  /** Why a setting couldn't be saved, by setting id. */
  failed: Record<string, string>
  /** A value in a settings file that Parity can't use, as the file has it, by setting id. */
  invalid: Record<string, string>
  bindings: Bindings
  bind: (command: string, keys: string) => void
  skipped: Skipped[]
  /** Opens a page, with a setting on it marked and focused. */
  go: (page: string, setting?: string) => void
}

/** A value, or a set of them by setting id, as Settings compares them. */
type Values = Value | Record<string, Value>

export function same(a: Values, b: Values): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** A value as a sentence says it: On, Dark, PNG 1x and PNG 2x. */
export function valueText(setting: Setting, value: Value): string {
  const control = setting.control

  if (control.kind === "switch") {
    return value === true ? "On" : "Off"
  }

  if (control.kind === "select") {
    return control.options.find((option) => option.value === value)?.label ?? String(value)
  }

  if (control.kind === "multi" && Array.isArray(value)) {
    const labels = control.options.flatMap((option) => (value.includes(option.value) ? [option.label] : []))

    return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : (labels[0] ?? "")
  }

  return String(value)
}
