import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import type { Editor } from "tldraw"
import type { ProjectInfo, TabSummary } from "../shared/protocol.ts"
import { getPreferences } from "./chrome/preferences.ts"
import { askAboutUnsaved } from "./chrome/unsaved.ts"
import { ComponentStore } from "./components-store.ts"
import { DesignStore } from "./design-store.ts"
import { type LoadedGuest, loadGuest, releaseGuest } from "./guest.ts"
import { SelectionStore } from "./selection.ts"
import { TokenStore } from "./tokens-store.ts"

/** Everything one open project needs: its info from the service, its components and styles, and its stores. */
export interface ProjectSession {
  id: string
  info: ProjectInfo
  loaded: LoadedGuest
  store: DesignStore
  selection: SelectionStore
  tokens: TokenStore
  /** Components and their props, inferred from source after the tab opens. */
  components: ComponentStore
  /** Components the type checker found after the guest loaded, which offscreen renders add to theirs. */
  added?: ProjectInfo["sources"]
  /** Design files that couldn't be read. */
  errors: { path: string; error: string }[]
  /** The tab's canvas, once mounted. */
  editor?: Editor
}

export interface Tab {
  /** The project's root once known; a placeholder while it opens. */
  id: string
  title: string
  status: "loading" | "ready" | "error"
  message?: string
  /** While loading: what opening does, in order, and which of them it's doing now. */
  progress?: { steps: string[]; current: number }
  session?: ProjectSession
}

/** One open or reopen of a tab's project, which closing the tab abandons. */
interface Attempt {
  abandoned: boolean
  /** The project the service opened for it, once it says. */
  projectId?: string
}

/** Whether a tab is still waiting for the service to say which project it opened: it has no folder yet. */
export function isPlaceholder(id: string): boolean {
  return id.startsWith("opening-")
}

const storageKey = "parity.workspace"
const recentKey = "parity.recent"
const recentLimit = 10

/** The open project tabs. Each tab is one project with its own builder, guest and canvas. */
export class Workspace {
  private tabs: readonly Tab[] = []
  private recent: readonly string[] = loadRecent()
  private activeId: string | undefined
  private nextPlaceholder = 1
  /**
   * Opens and reopens in flight, by the id of the tab they load into. Closing that tab marks its open abandoned, so
   * that open, and only that one, closes its project once the service has it.
   */
  private readonly attempts = new Map<string, Attempt>()
  /** Projects abandoned opens got, to close once nothing in flight could still be for them, with guests to let go of. */
  private readonly drops = new Map<string, string | undefined>()
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getTabs = () => this.tabs
  getActiveId = () => this.activeId
  getTab = (id: string | undefined) => this.tabs.find((tab) => tab.id === id)
  getActive = () => this.getTab(this.activeId)
  /** Projects opened before, most recent first. */
  getRecent = () => this.recent

  /** Reopens the tabs from last time, or the default project. */
  restore(): void {
    let saved: { roots?: string[]; active?: string } = {}
    try {
      saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as typeof saved
    } catch {
      // A corrupt entry just means starting fresh.
    }
    const roots = saved.roots?.filter(Boolean) ?? []
    if (roots.length === 0) void this.open(undefined)
    else {
      for (const root of roots) void this.open(root, root === saved.active)
      if (!roots.includes(saved.active ?? "")) this.activate(this.tabs[0]?.id)
    }
  }

  /** Opens a project in a new tab, or switches to its tab when it's already open. */
  async open(root: string | undefined, activate = true): Promise<Tab> {
    const existing = root ? this.getTab(root) : undefined
    if (existing) {
      if (activate) this.activate(existing.id)
      return existing
    }
    const placeholder = root ?? `opening-${this.nextPlaceholder++}`
    const opening: Tab = { id: placeholder, title: root ? basename(root) : "Opening…", status: "loading" }
    this.update([...this.tabs, opening])
    const attempt = this.startAttempt(placeholder)
    if (activate || !this.activeId) this.activate(placeholder)
    this.setProgress(placeholder, ["Starting the project's builder", "Loading its components"], 0)

    let current = placeholder
    let opened: string | undefined
    try {
      const info = await window.canvasHost.request("project.open", { root })
      opened = info.id
      attempt.projectId = info.id
      if (attempt.abandoned) {
        this.dropAbandoned(info.id)
        return opening
      }
      const duplicate = info.id !== placeholder ? this.getTab(info.id) : undefined
      if (duplicate) {
        this.endAttempt(attempt, placeholder)
        this.remove(placeholder)
        if (activate) this.activate(duplicate.id)
        return duplicate
      }
      this.replace(placeholder, { id: info.id, title: info.name, status: "loading" })
      this.moveAttempt(attempt, placeholder, info.id)
      current = info.id
      const builder = info.builder.name
      this.setProgress(info.id, [`Starting ${builder}`, `Loading components from ${builder}`], 1)
      const session = await createSession(info)
      if (attempt.abandoned) {
        this.dropAbandoned(info.id, info.guestUrl)
        return opening
      }
      this.endAttempt(attempt, info.id)
      this.replace(info.id, { id: info.id, title: info.name, status: "ready", session })
      this.remember(info.root)
      return this.getTab(info.id)!
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.endAttempt(attempt, current)
      if (attempt.abandoned) {
        if (opened) this.dropAbandoned(opened)
        return { ...opening, status: "error", message }
      }
      this.replace(current, { ...this.getTab(current)!, status: "error", message })
      return this.getTab(current)!
    }
  }

  /** Closes a tab, first asking whether to save when it has unsaved changes. Resolves false if that was cancelled. */
  async close(id: string): Promise<boolean> {
    const tab = this.getTab(id)
    if (!tab) return true
    if (tab.session?.store.hasUnsaved()) {
      const choice = await askAboutUnsaved([tab.title], "close")
      if (choice === "cancel") return false
      if (choice === "save" && !(await saveOrSay(tab.session))) return false
    }
    this.closeNow(id)
    return true
  }

  /** Whether the window can close: asks about every project with unsaved changes at once, and saves if told to. */
  async confirmQuit(): Promise<boolean> {
    const unsaved = this.tabs.filter((tab) => tab.session?.store.hasUnsaved())
    if (unsaved.length === 0) return true
    const choice = await askAboutUnsaved(
      unsaved.map((tab) => tab.title),
      "quit"
    )
    if (choice === "cancel") return false
    if (choice === "discard") return true
    const saved = await Promise.all(unsaved.map((tab) => saveOrSay(tab.session!)))
    return saved.every(Boolean)
  }

  private closeNow(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id)
    if (index === -1) return
    const tab = this.tabs[index]!
    this.update(this.tabs.filter((candidate) => candidate !== tab))
    if (this.activeId === id) this.activeId = (this.tabs[index] ?? this.tabs[index - 1])?.id
    // A tab closed while its project opens has nothing to show it in, so its open closes the project once the service
    // has it, and its builder stops with it.
    const attempt = this.attempts.get(id)
    if (attempt) {
      attempt.abandoned = true
      this.attempts.delete(id)
      this.settleDrops()
    }
    if (tab.session) {
      void window.canvasHost.request("project.close", { projectId: tab.session.id })
      releaseGuest(tab.session.info.guestUrl)
    }
    this.save()
    this.notify()
  }

  /**
   * Opens a tab's project again from scratch, in the same place, for changes discovery has to see: a library added,
   * new dependencies. Unsaved changes are saved first, so reopening can't lose them. `step` says what reopening is
   * for while the builder restarts, such as "Loading Nova".
   */
  async reload(id: string, step = "Reopening the project"): Promise<void> {
    const tab = this.getTab(id)
    // A tab already opening or reopening gets its project from that, which closing the tab can still cancel.
    if (!tab || this.attempts.has(id)) return
    if (tab.session?.store.hasUnsaved() && !(await saveOrSay(tab.session))) return
    if (this.attempts.has(id) || this.getTab(id) !== tab) return
    this.replace(id, { id, title: tab.title, status: "loading" })
    const attempt = this.startAttempt(id)
    // A tab that has opened is its project's id, so a reopen is known to be for it from the start.
    attempt.projectId = id
    this.setProgress(id, [step, "Loading its components"], 0)
    await window.canvasHost.request("project.close", { projectId: id }).catch(() => undefined)
    // Its stylesheets are made anew, without the last session's token previews; its modules come back as they were
    // when the project's code hasn't changed.
    if (tab.session) releaseGuest(tab.session.info.guestUrl)
    if (attempt.abandoned) return
    let opened: string | undefined
    try {
      const info = await window.canvasHost.request("project.open", { root: id })
      opened = info.id
      if (attempt.abandoned) return this.dropAbandoned(info.id)
      this.setProgress(id, [step, `Loading components from ${info.builder.name}`], 1)
      const session = await createSession(info)
      if (attempt.abandoned) return this.dropAbandoned(info.id, info.guestUrl)
      this.endAttempt(attempt, id)
      this.replace(id, { id, title: info.name, status: "ready", session })
    } catch (error) {
      this.endAttempt(attempt, id)
      if (attempt.abandoned) {
        if (opened) this.dropAbandoned(opened)
        return
      }
      this.replace(id, {
        id,
        title: tab.title,
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Opens every tab's project again in a restarted project service. Each tab keeps its designs, unsaved changes,
   * selection and canvas; what the service provides (the builder and its guest, tokens, inferred props) is new.
   */
  async reconnect(): Promise<void> {
    await Promise.all(
      this.tabs.map(async ({ id, session }) => {
        if (!session) return
        try {
          const info = await window.canvasHost.request("project.open", { root: id })
          const loaded = await loadGuest(info.guestUrl, info.theme)
          inferComponents(info, session.components)
          const current = this.getTab(id)
          if (!current?.session) return
          const before = current.session.info.guestUrl
          this.replace(id, {
            ...current,
            session: { ...current.session, info, loaded, tokens: tokenStore(info, loaded, current.session.store) }
          })
          current.session.tokens.dispose()
          if (before !== info.guestUrl) releaseGuest(before)
        } catch (error) {
          toast.error(`Couldn't reopen ${session.info.name}`, {
            description: error instanceof Error ? error.message : String(error)
          })
        }
      })
    )
  }

  /** Draws a project's tab with its guest from a new address, once its builder started again on another port. */
  async moveGuest(projectId: string, guestUrl: string): Promise<void> {
    const tab = this.tabs.find((candidate) => candidate.session?.id === projectId)
    if (!tab?.session || tab.session.info.guestUrl === guestUrl) return
    try {
      const loaded = await loadGuest(guestUrl, tab.session.info.theme)
      const current = this.getTab(tab.id)
      if (!current?.session) return
      // From the session as it is now, since its sources can change while the guest loads.
      const info = { ...current.session.info, guestUrl }
      const before = current.session.info.guestUrl
      this.replace(tab.id, {
        ...current,
        session: { ...current.session, info, loaded, tokens: tokenStore(info, loaded, current.session.store) }
      })
      current.session.tokens.dispose()
      releaseGuest(before)
    } catch (error) {
      toast.error(`Couldn't load ${tab.session.info.name} from its restarted builder`, {
        description: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /** Saves every open project's unsaved changes. */
  async flush(): Promise<void> {
    const results = await Promise.allSettled(
      this.tabs.flatMap((tab) => (tab.session ? [tab.session.store.flush()] : []))
    )
    const failed = results.find((result) => result.status === "rejected")
    if (failed) throw failed.reason
  }

  forgetRecent(root?: string): void {
    this.recent = root ? this.recent.filter((candidate) => candidate !== root) : []
    this.saveRecent()
  }

  activate(id: string | undefined): void {
    if (id === this.activeId) return
    this.activeId = id
    this.save()
    this.notify()
  }

  /**
   * The project's components once the type checker has read them, or after its files changed. Ones the guest doesn't
   * have yet, or has from another file, are given to it, and load the first time they're drawn. `leftOut` is what the
   * checker left out, and why.
   */
  setSources(id: string, sources: ProjectInfo["sources"], leftOut?: ProjectInfo["leftOut"]): void {
    const tab = this.getTab(id)
    if (!tab?.session) return
    const before = tab.session.info.sources
    const changed = Object.fromEntries(
      Object.entries(sources).filter(
        ([name, source]) => before[name]?.path !== source.path || before[name]?.export !== source.export
      )
    )
    tab.session.loaded.guest.addComponents?.(changed)
    const added = { ...tab.session.added, ...changed }
    for (const name of Object.keys(added)) if (!(name in sources)) delete added[name]
    const info = {
      ...tab.session.info,
      sources,
      componentCount: Object.keys(sources).length,
      ...(leftOut ? { leftOut } : {})
    }
    this.replace(id, { ...tab, session: { ...tab.session, info, added } })
  }

  setEditor(id: string, editor: Editor | undefined): void {
    const tab = this.getTab(id)
    if (!tab?.session || tab.session.editor === editor) return
    this.replace(id, { ...tab, session: { ...tab.session, editor } })
  }

  summaries(): TabSummary[] {
    return this.tabs.map((tab) => ({
      id: tab.id,
      name: tab.title,
      root: tab.session?.info.root ?? tab.id,
      active: tab.id === this.activeId,
      status: tab.status,
      ...(tab.message && tab.status === "error" ? { error: tab.message } : {}),
      designs: tab.session?.store.getEntries().length ?? 0
    }))
  }

  /** Moves a loading tab on to one of its steps. Its message says that step, for the tab's tooltip. */
  private setProgress(id: string, steps: string[], current: number): void {
    const tab = this.getTab(id)
    if (tab) this.replace(id, { ...tab, progress: { steps, current }, message: `${steps[current]}…` })
  }

  private startAttempt(id: string): Attempt {
    const attempt: Attempt = { abandoned: false }
    this.attempts.set(id, attempt)
    return attempt
  }

  /** Follows an open's tab from its placeholder to the project's id. */
  private moveAttempt(attempt: Attempt, from: string, to: string): void {
    if (this.attempts.get(from) === attempt) this.attempts.delete(from)
    this.attempts.set(to, attempt)
    this.settleDrops()
  }

  private endAttempt(attempt: Attempt, id: string): void {
    if (this.attempts.get(id) === attempt) this.attempts.delete(id)
    this.settleDrops()
  }

  /** Closes the project an abandoned open got, and lets go of its guest, once nothing else could still want it. */
  private dropAbandoned(projectId: string, guestUrl?: string): void {
    this.drops.set(projectId, guestUrl ?? this.drops.get(projectId))
    this.settleDrops()
  }

  /**
   * Closes the projects abandoned opens got. One that has a tab again, or an open in flight for it, is that tab's: the
   * service gives both opens the same project. While an open in flight hasn't heard which project it is, as a tab
   * opening the default project or a `.par` file hasn't, the close waits, since it may be the same one.
   */
  private settleDrops(): void {
    if (this.drops.size === 0) return
    const inFlight = [...this.attempts.values()]
    const undecided = inFlight.some((attempt) => attempt.projectId === undefined)
    for (const [projectId, guestUrl] of this.drops) {
      if (this.getTab(projectId) || inFlight.some((attempt) => attempt.projectId === projectId)) {
        this.drops.delete(projectId)
        continue
      }
      if (undecided) continue
      this.drops.delete(projectId)
      void window.canvasHost.request("project.close", { projectId })
      if (guestUrl) releaseGuest(guestUrl)
    }
  }

  private replace(id: string, tab: Tab): void {
    this.update(this.tabs.map((candidate) => (candidate.id === id ? tab : candidate)))
    if (this.activeId === id) this.activeId = tab.id
    this.save()
  }

  private remove(id: string): void {
    this.update(this.tabs.filter((tab) => tab.id !== id))
  }

  private update(tabs: readonly Tab[]): void {
    this.tabs = tabs
    this.notify()
  }

  private save(): void {
    const roots = this.tabs.filter((tab) => tab.session || tab.status === "loading").map((tab) => tab.id)
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ roots: roots.filter((root) => !isPlaceholder(root)), active: this.activeId })
      )
    } catch {
      // Storage can be unavailable; tabs then just don't come back next time.
    }
  }

  private remember(root: string): void {
    this.recent = [root, ...this.recent.filter((candidate) => candidate !== root)].slice(0, recentLimit)
    this.saveRecent()
  }

  private saveRecent(): void {
    try {
      localStorage.setItem(recentKey, JSON.stringify(this.recent))
    } catch {
      // Storage can be unavailable; the list then just isn't remembered.
    }
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function loadRecent(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(recentKey) ?? "[]") as unknown
    return Array.isArray(saved) ? saved.filter((root): root is string => typeof root === "string") : []
  } catch {
    return []
  }
}

/** Saves a project, or says why it couldn't. Resolves whether it saved. */
async function saveOrSay(session: ProjectSession): Promise<boolean> {
  try {
    await session.store.flush()
    return true
  } catch (error) {
    toast.error(`Couldn't save ${session.info.name}`, {
      id: saveFailureToast(session.id),
      description: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

/** The one notice a project's failed saves share, so a failure is said once however it happened. */
export function saveFailureToast(projectId: string): string {
  return `save-failed-${projectId}`
}

/**
 * Says when saving a project fails, with why and a way to try again. It says so once: saves that fail after that stay
 * quiet, with the status bar still showing it, until one succeeds.
 */
function sayWhenSavesFail(session: ProjectSession): void {
  const { store } = session
  const id = saveFailureToast(session.id)
  let said = false
  store.subscribe(() => {
    const state = store.getSaveState()
    if (state.status === "saved" || state.status === "unsaved") {
      if (said) toast.dismiss(id)
      said = false
    }
    if (state.status !== "failed" || said) return
    said = true
    toast.error(`Couldn't save ${session.info.name}`, {
      id,
      description: state.error,
      duration: Infinity,
      action: { label: "Retry", onClick: () => void saveOrSay(session) }
    })
  })
}

async function createSession(info: ProjectInfo): Promise<ProjectSession> {
  const loaded = await loadGuest(info.guestUrl, info.theme)
  const readable = info.documents.flatMap(({ path, document }) => (document ? [{ path, document }] : []))
  const store = new DesignStore(readable, info.modes.settings, info.mainDocument, {
    saveDocument: (path, document) =>
      window.canvasHost.request("document.save", { projectId: info.id, path, document }),
    autosave: () => getPreferences().autosave
  })
  const components = new ComponentStore()
  inferComponents(info, components)
  const session: ProjectSession = {
    id: info.id,
    info,
    loaded,
    store,
    components,
    selection: new SelectionStore(),
    tokens: tokenStore(info, loaded, store),
    errors: info.documents.flatMap(({ path, error }) => (error ? [{ path, error }] : []))
  }
  sayWhenSavesFail(session)
  followCorrections(session)
  return session
}

/**
 * Tells the service when the main project file's corrections to the component list change, by an edit, an undo or the
 * file changing on disk, so the list follows them before they're saved.
 */
function followCorrections(session: ProjectSession): void {
  const { store } = session
  const corrections = () => store.getDocuments().find((entry) => entry.path === store.mainPath)?.document.detection
  let sent = corrections()
  store.subscribe(() => {
    const next = corrections()
    if (next === sent) return
    sent = next
    window.canvasHost
      .request("project.correctComponents", { projectId: session.id, ...(next ? { corrections: next } : {}) })
      .catch((error: unknown) => console.warn("The component list couldn't take the correction", error))
  })
}

/** Fills in each component's props once the service has inferred them, after the tab opens. */
function inferComponents(info: ProjectInfo, components: ComponentStore): void {
  window.canvasHost
    .request("project.components", { projectId: info.id })
    .then((inferred) => components.set(inferred))
    .catch((error: unknown) => console.warn("Component props couldn't be inferred", error))
}

/** A project's tokens, edited through its design store's history and written to its stylesheet when it's saved. */
function tokenStore(info: ProjectInfo, loaded: LoadedGuest, store: DesignStore): TokenStore {
  return new TokenStore(
    loaded.tokens,
    loaded.sheet,
    (changes) => window.canvasHost.request("tokens.save", { projectId: info.id, changes }),
    store,
    info.styles?.stylesheet
  )
}

function basename(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path
}

export const workspace = new Workspace()

export function useTabs(): readonly Tab[] {
  return useSyncExternalStore(workspace.subscribe, workspace.getTabs)
}

export function useActiveTabId(): string | undefined {
  return useSyncExternalStore(workspace.subscribe, workspace.getActiveId)
}

export function useRecentProjects(): readonly string[] {
  return useSyncExternalStore(workspace.subscribe, workspace.getRecent)
}
