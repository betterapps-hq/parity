import { listInWords } from "@parity-app/editor"
import type { Extension, Setting, Value } from "./definitions.ts"

/** A key binding keybindings.json has that Parity skipped, as the file has it. */
export interface Skipped {
  command: string
  keys: string
}

/** The project the window has open. */
export interface OpenProject {
  name: string
  file: string
}

/** What Settings shows and changes: the app's settings, or a story's. */
export interface SettingsData {
  /** The open project; none on the start page, which has no project page. */
  project?: OpenProject
  /** Settings something outside Settings decides, by setting id, naming what decides it. */
  locked: Record<string, string>
  extensions: Extension[]
  /** The person's value, for every project. */
  mine: (setting: Setting) => Value
  /** The project's value: its own setting's, or the one it changes for itself; nothing when it doesn't. */
  theirs: (setting: Setting) => Value | undefined
  /** Saves one of the person's settings; rejects when it couldn't be saved. */
  setMine: (setting: Setting, value: Value) => void | Promise<void>
  /** Changes the project's value, as one undo step in its window. */
  setTheirs: (setting: Setting, value: Value) => void
  /** The project stops changing one of the person's settings for itself, or its own setting goes back to its default. */
  resetTheirs: (setting: Setting) => void
  /** The person's settings the project changes for itself, in the order it began to. */
  overrides: string[]
  /** The project has changes that aren't saved. */
  unsaved: boolean
  /** The project saves each change itself. */
  savesItself: boolean
  save: () => void
  /** A command's keys now, written as the keymap writes them; `""` for none. */
  keysOf: (command: string) => string
  /** Gives a command these keys (`""` removes them); one that had them gives them up. Rejects when not saved. */
  bind: (command: string, keys: string) => Promise<void>
  /** A command whose keys another took, and that command's name. */
  lost: Record<string, string>
  skipped: Skipped[]
  version: string
  checkForUpdates?: () => void
  /** Settings updates decides can't change while it works, by setting id. */
  busy?: Record<string, boolean>
  /** Opens keybindings.json in the person's editor. */
  openKeybindings?: () => void
}

/** What every page reads and changes: the data, with where Settings is and what it's saying. */
export interface Store extends SettingsData {
  /** A setting to show marked, as one reached from search or a link is. */
  marked?: string
  /** Why a setting's last change couldn't be saved, by setting id, or a shortcut's by `key:` and its command. */
  failed: Record<string, string>
  /** Opens a page, with a setting on it marked and focused. */
  go: (page: string, setting?: string) => void
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
    return listInWords(control.options.flatMap((option) => (value.includes(option.value) ? [option.label] : [])))
  }

  return String(value)
}
