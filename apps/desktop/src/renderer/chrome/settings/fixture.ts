import { useEffect, useState } from "react"
import { keymap } from "../keymap.ts"
import { defaults, extensionsFrom, type Setting, settings, type Value } from "./definitions.ts"
import { isCommand } from "./shortcuts.tsx"
import type { SettingsData, Skipped } from "./store.ts"

/** What a story's Settings starts with. Every field is optional; the defaults are a first run with Kestrel open. */
export interface FixtureOptions {
  /** The open project's name; `null` for the start page. */
  project?: string | null
  /** The person's values that differ from the defaults. */
  values?: Record<string, Value>
  /** The project's values: its own settings, and the person's it changes for itself. */
  projectValues?: Record<string, Value>
  locked?: Record<string, string>
  /** Settings whose changes can't be saved, to show what Settings says when a save fails. */
  failing?: string[]
  skipped?: Skipped[]
}

/** What detection finds in Kestrel: Storybook, Vite and React, but not Tailwind. */
const kestrelTools = [
  { id: "storybook", summary: "Storybook 10.1.4 from node_modules/storybook, config .storybook/main.ts" },
  { id: "vite", summary: "Vite 7.2.1 from node_modules/vite, config vite.config.ts" },
  { id: "react", summary: "React 19.2.0 from node_modules/react" }
]

/** Settings' data for a story: values kept in state, as the app keeps them in its files. */
export function useFixtureSettings({
  project = "Kestrel",
  values = {},
  projectValues = {},
  locked = {},
  failing = [],
  skipped = []
}: FixtureOptions = {}): SettingsData {
  const [mine, setMine] = useState<Record<string, Value>>(() => ({ ...defaults(), ...values }))
  const [own, setOwn] = useState(projectValues)
  const [saved, setSaved] = useState(projectValues)
  const [bound, setBound] = useState<Record<string, string>>({})
  const [lost, setLost] = useState<Record<string, string>>({})

  const keysOf = (command: string) => bound[command] ?? (isCommand(command) ? keymap[command].keys[0] : undefined) ?? ""

  const unsaved = JSON.stringify(own) !== JSON.stringify(saved)
  const savesItself = (own.autosave ?? mine.autosave) === true

  // A project that saves itself saves Settings' changes to it as it does every other change.
  useEffect(() => {
    if (!unsaved || !savesItself) {
      return
    }

    const timer = setTimeout(() => setSaved(own), 800)

    return () => clearTimeout(timer)
  }, [own, unsaved, savesItself])

  return {
    project: project === null ? undefined : { name: project, file: `${project.toLowerCase()}.par` },
    locked,
    extensions: extensionsFrom(project === null ? undefined : kestrelTools),
    mine: (setting: Setting) => mine[setting.id]!,
    theirs: (setting: Setting) => own[setting.id],
    setMine(setting, value) {
      if (failing.includes(setting.id)) {
        return Promise.reject(new Error("Not saved"))
      }

      setMine((current) => ({ ...current, [setting.id]: value }))

      return Promise.resolve()
    },
    setTheirs: (setting, value) => setOwn((current) => ({ ...current, [setting.id]: value })),
    resetTheirs: (setting) => setOwn(({ [setting.id]: _, ...rest }) => rest),
    overrides: Object.keys(own).filter((id) =>
      settings.some((setting) => setting.id === id && setting.scope === "either")
    ),
    unsaved,
    savesItself,
    save: () => setSaved(own),
    keysOf,
    bind(command, keys) {
      const holder = keys ? Object.keys(keymap).find((other) => other !== command && keysOf(other) === keys) : undefined

      setBound((current) => {
        const next = { ...current, [command]: keys }

        if (holder) {
          next[holder] = ""
        }

        return next
      })
      setLost(({ [command]: _, ...rest }) => {
        if (holder && isCommand(command)) {
          rest[holder] = keymap[command].label
        }

        return rest
      })

      return Promise.resolve()
    },
    lost,
    skipped,
    version: "0.19.0",
    checkForUpdates: () => undefined,
    openKeybindings: () => undefined
  }
}
