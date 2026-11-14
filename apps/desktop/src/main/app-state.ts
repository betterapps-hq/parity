import { randomUUID } from "node:crypto"
import { join } from "node:path"
import {
  type AppState,
  changeProjects,
  changeProjectsData,
  changeState,
  changeStateData,
  type JsonValue,
  type Projects,
  type ProjectsChange,
  readProjects,
  readState,
  type SavedTabs,
  type StateChange,
  type StateKey
} from "@parity-app/settings"
import { type FileFormat, sharedFile, type SharedFileOptions, type SharedFileState } from "./shared-file.ts"

/** A change to the projects, with when it was made. */
interface ProjectsEdit {
  change: ProjectsChange
  at: number
}

const projectsFormat: FileFormat<Projects, ProjectsEdit> = {
  read: readProjects,
  write: (text, { change, at }) => changeProjects(text, change, at),
  apply: (projects, { change, at }) => changeProjectsData(projects, change, at)
}

const stateFormat: FileFormat<AppState, StateChange> = {
  read: readState,
  write: changeState,
  apply: changeStateData
}

export interface AppStateOptions<Window> extends Pick<
  SharedFileOptions<unknown>,
  "problem" | "settleMs" | "retryMs" | "lock"
> {
  /** Hears the projects each time they change, in this copy or another, to send the windows. */
  projectsChanged: (projects: Projects) => void
  /** A key for each window that stays the same while it's open, across reloads. */
  windowKey: (window: Window) => number
  /** How often a window's tabs are said again while the copy runs, in milliseconds. */
  heartbeatMs?: number
  now?: () => number
}

export interface AppStateFiles<Window> {
  projects(): SharedFileState<Projects>
  changeProjects(change: ProjectsChange): Promise<Projects>
  /** The values `state.json` keeps for the window, from memory. */
  values(): AppState["values"]
  set(key: StateKey, value: JsonValue): void
  /** The tabs `window` opens with: its own after a reload, or those of the newest copy that's gone. */
  claimTabs(window: Window): Promise<SavedTabs>
  /** Keeps `window`'s tabs, if it claimed an entry; a window opened for one project never does. */
  saveTabs(window: Window, tabs: SavedTabs): void
  /** Stops saying a closed window's tabs, so the next window to start can take them. */
  closed(window: Window): void
  /** Reads `projects.json` again, as when a window gains focus. */
  check(): void
  close(): void
}

/**
 * `projects.json` and `state.json` in the data folder (`docs/proposals/settings.md`). Every copy applies the projects
 * at once. The state isn't watched: each copy keeps the layout and tabs it has and reads them when it starts. Each
 * window's tabs have an entry of their own, said again every few seconds, so a crashed copy's tabs reopen.
 */
export function appStateFiles<Window>(folder: string, options: AppStateOptions<Window>): AppStateFiles<Window> {
  const { projectsChanged, windowKey, heartbeatMs = 10_000, now = Date.now, ...fileOptions } = options

  const projects = sharedFile(join(folder, "projects.json"), projectsFormat, {
    ...fileOptions,
    changed: (state) => projectsChanged(state.values)
  })

  const state = sharedFile(join(folder, "state.json"), stateFormat, {
    ...fileOptions,
    watch: false
  })

  /** Each window's entry, and the tabs it last said, by its key. */
  const entries = new Map<number, { id: string; tabs: SavedTabs }>()

  const heartbeat = setInterval(() => {
    for (const { id, tabs } of entries.values()) {
      void state.change({ kind: "tabs", id, tabs, at: now() })
    }
  }, heartbeatMs)

  heartbeat.unref()

  return {
    projects: () => projects.state(),
    changeProjects: (change) => projects.change({ change, at: now() }).then(({ values }) => values),
    values: () => state.state().values.values,
    set(key, value) {
      void state.change({ kind: "set", key, value })
    },
    async claimTabs(window) {
      const key = windowKey(window)
      const id = entries.get(key)?.id ?? randomUUID()
      const after = await state.change({ kind: "claim", id, at: now() })
      // A claim always leaves the window an entry, empty when no copy that's gone had tabs.
      const { roots, active } = after.values.windows[id] ?? { roots: [] }
      const tabs: SavedTabs = active === undefined ? { roots } : { roots, active }
      entries.set(key, { id, tabs })

      return tabs
    },
    saveTabs(window, tabs) {
      const entry = entries.get(windowKey(window))

      if (entry) {
        entry.tabs = tabs
        void state.change({ kind: "tabs", id: entry.id, tabs, at: now() })
      }
    },
    closed(window) {
      entries.delete(windowKey(window))
    },
    check: () => projects.check(),
    close() {
      clearInterval(heartbeat)
      projects.close()
      state.close()
    }
  }
}
