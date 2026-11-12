import {
  type CanvasDocument,
  codeChangeVersions,
  finiteNumber,
  type GuestComponentSource,
  guestChanges,
  jsonText,
  parseData,
  versionedSources
} from "@parity-app/core"
import { openingDesigns } from "@parity-app/editor"
import type { TokenWrite } from "@parity-app/tokens"
import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import type { Editor } from "tldraw"
import { z } from "zod"
import type { ProjectEditResult, ProjectInfo, ServiceMethods, TabSummary } from "../shared/protocol.ts"
import { type FirstFrameWatch, watchFirstFrame } from "./canvas/first-frame.ts"
import type { Attributes } from "./chrome/event-attributes.ts"
import { getPreferences } from "./chrome/preferences.ts"
import { askToRestore } from "./chrome/restore.ts"
import { askAboutUnsaved } from "./chrome/unsaved.ts"
import { ComponentStore } from "./components-store.ts"
import { DesignStore } from "./design-store.ts"
import { type LoadedGuest, loadGuest, releaseGuest } from "./guest.ts"
import { type FirstFrame, type Opening, startOpening } from "./opening.ts"
import { keepProjectPicture } from "./project-picture.ts"
import { keepRecovery, type RecoveryKeeper } from "./recovery.ts"
import { holdRecording } from "./replay.ts"
import { errorCode, errorMessage, reportError, track } from "./report-error.ts"
import { SelectionStore } from "./selection.ts"
import { request } from "./service.ts"
import { type KnownProject, knownProjects, type ProjectNote } from "./start/projects.ts"
import { TokenStore } from "./tokens-store.ts"
import { currentTraceContext } from "./tracing.ts"

/** What can change in an open project while its tab is open, each part replaced whole. */
export interface SessionParts {
  info: ProjectInfo
  loaded: LoadedGuest
  tokens: TokenStore
  /**
   * Components the type checker found after the guest loaded, and ones whose code changed since (with a `version`),
   * which offscreen renders add to theirs.
   */
  added?: Record<string, GuestComponentSource & ProjectInfo["sources"][string]> | undefined
  /** When each component's code last changed on disk, by its builder's stamp, while the tab is open (PAR-165). */
  versions?: Record<string, number> | undefined
  /** The tab's canvas, once mounted. */
  editor?: Editor | undefined
}

/**
 * Everything one open project needs: its info from the service, its components and styles, and its stores. It's one
 * object from its tab becoming ready to the tab closing or reopening, so what's kept for it lasts as long (PAR-1004).
 * Its stores never change; the parts that can, such as its info or its guest, are read through it and change through
 * `update`, which tells whoever subscribed.
 */
export class ProjectSession {
  readonly id: string
  readonly store: DesignStore
  readonly selection: SelectionStore
  /** Components and their props, inferred from source after the tab opens. */
  readonly components: ComponentStore
  /** Keeps a copy of its unsaved changes outside the project, in case Parity closes before they're saved (PAR-905). */
  readonly recovery: RecoveryKeeper
  /**
   * Watches for the first frame its canvas draws on screen, live or from a bitmap, recorded with how long opening took
   * (PAR-711). Gone once one has. Nothing draws from it, so it changes without telling anyone.
   */
  firstFrame?: FirstFrameWatch | undefined
  private parts: SessionParts
  private readonly listeners = new Set<() => void>()
  private readonly stops: (() => void)[] = []

  constructor(
    fixed: Pick<ProjectSession, "id" | "store" | "selection" | "components" | "recovery">,
    parts: SessionParts
  ) {
    this.id = fixed.id
    this.store = fixed.store
    this.selection = fixed.selection
    this.components = fixed.components
    this.recovery = fixed.recovery
    this.parts = parts
  }

  get info(): ProjectInfo {
    return this.parts.info
  }

  get loaded(): LoadedGuest {
    return this.parts.loaded
  }

  get tokens(): TokenStore {
    return this.parts.tokens
  }

  get added(): SessionParts["added"] {
    return this.parts.added
  }

  get versions(): SessionParts["versions"] {
    return this.parts.versions
  }

  get editor(): Editor | undefined {
    return this.parts.editor
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  /** The parts as they are now, a new object each time one changes. */
  getParts = (): SessionParts => this.parts

  /** Replaces the parts given, and tells whoever subscribed. */
  update(change: Partial<SessionParts>): void {
    this.parts = { ...this.parts, ...change }

    for (const listener of this.listeners) {
      listener()
    }
  }

  /** Runs `stop` when the session ends, as its tab closes or reopens. */
  untilClosed(stop: () => void): void {
    this.stops.push(stop)
  }

  /**
   * Ends the session: stops what was kept for it and lets go of its canvas. React keeps the tabs a component last read
   * until it renders again, so the session can outlive its tab; without its editor it holds no canvas (PAR-624).
   */
  close(): void {
    for (const stop of this.stops.splice(0)) {
      stop()
    }

    this.update({ editor: undefined })
  }
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
  /** A new tab, which shows the start page until a project opens in it. */
  blank?: boolean
}

/** The Home tab's id. It's pinned first in the tab strip and can't be closed, so it's never in the list of tabs. */
export const homeTab = "home"

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
const notesKey = "parity.projects"
const recentLimit = 10

/**
 * The open tabs. Each is one project with its own builder, guest and canvas, or a new tab waiting for one. Home sits
 * before them all: it shows when `activeId` is `homeTab`, or when no tab has it.
 */
export class Workspace {
  private tabs: readonly Tab[] = []
  private recent: readonly string[] = loadRecent()
  /** When each project last opened and whether it's starred, by folder. */
  private notes: Readonly<Record<string, ProjectNote>> = loadNotes()
  /** Listed projects whose folders weren't there when last checked (PAR-188). */
  private missing: ReadonlySet<string> = new Set()
  /** The example project's folder, when this copy of Parity has it. */
  private example: string | undefined
  private projects: readonly KnownProject[] = knownProjects(this.recent, this.notes)
  private activeId: string | undefined
  private nextPlaceholder = 1
  private nextBlank = 1
  /**
   * Opens and reopens in flight, by the id of the tab they load into. Closing that tab marks its open abandoned, so
   * that open, and only that one, closes its project once the service has it.
   */
  private readonly attempts = new Map<string, Attempt>()
  /** Projects abandoned opens got, to close once nothing in flight could still be for them, with guests to let go of. */
  private readonly drops = new Map<string, string | undefined>()
  /** Guests that moved while their tab was still loading, by project, to draw from once the tab is ready. */
  private readonly moves = new Map<string, string>()
  /** The address each project's guest last moved to while one loads, so a move a later one overtook is let go. */
  private readonly latestMoves = new Map<string, string>()
  /** Projects whose detection changed while their tab was loading, to check again once it's ready (PAR-820). */
  private readonly detections = new Set<string>()
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
  /** The projects the start page lists: the recent ones, then starred ones that aren't. */
  getProjects = () => this.projects
  /** The example project's folder, once the service has found it. */
  getExample = () => this.example
  /** Whether Home is showing: it's chosen, or no tab is. */
  isHomeActive = () => this.activeId === homeTab || !this.getTab(this.activeId)

  /**
   * Reopens the tabs from last time, or the dev runner's requested project, on Home if that's where the window was. A
   * fresh install shows Home.
   */
  restore(): void {
    let saved: SavedTabs = { roots: [] }

    try {
      saved = readSavedTabs(localStorage.getItem(storageKey))
    } catch {
      // Storage can be unavailable, which means starting fresh.
    }

    const roots = saved.roots
    void this.checkFolders()

    // Set first, so the projects reopening behind it don't take its place.
    if (saved.active === homeTab) {
      this.activeId = homeTab
    }

    if (roots.length === 0) {
      if (window.canvasHost.initialProject) {
        void this.open(window.canvasHost.initialProject, true, true)
      }
    } else {
      for (const root of roots) {
        void this.open(root, root === saved.active, true)
      }

      if (saved.active !== homeTab && !roots.includes(saved.active ?? "")) {
        this.activate(this.tabs[0]?.id)
      }
    }
  }

  /** Opens a new tab at the end of the strip, showing the start page until a project opens in it. */
  newTab(): void {
    const tab: Tab = { id: `new-${this.nextBlank++}`, title: "New tab", status: "ready", blank: true }
    void this.checkFolders()
    this.update([...this.tabs, tab])
    this.activate(tab.id)
  }

  /**
   * Opens a project in a new tab, or switches to its tab when it's already open. Opened from a new tab, it opens in
   * that tab instead; one that's already open elsewhere closes the new tab it was picked from. `restored` when the
   * window opens it as it starts, rather than the person choosing it.
   */
  async open(root: string | undefined, activate = true, restored = false): Promise<Tab> {
    const active = this.getActive()
    const into = activate && active?.blank ? active.id : undefined
    const existing = root ? this.getTab(root) : undefined

    if (existing) {
      if (into) {
        this.closeNow(into)
      }

      if (activate) {
        this.activate(existing.id)
      }

      return existing
    }

    const placeholder = root ?? `opening-${this.nextPlaceholder++}`
    const opening: Tab = { id: placeholder, title: root ? basename(root) : "Opening…", status: "loading" }

    if (into) {
      this.update(this.tabs.map((tab) => (tab.id === into ? opening : tab)))
      this.activeId = placeholder
    } else {
      this.update([...this.tabs, opening])
    }

    const attempt = this.startAttempt(placeholder)

    if (activate || !this.activeId) {
      this.activate(placeholder)
    }

    this.setProgress(placeholder, ["Starting the project's builder", "Loading its components"], 0)

    let current = placeholder
    let opened: string | undefined
    const asked = startOpening(root, false)

    try {
      const info = await asked.ask(() => request("project.open", { root }))
      opened = info.id
      attempt.projectId = info.id

      if (attempt.abandoned) {
        asked.dropped()
        this.dropAbandoned(info.id)

        return opening
      }

      const duplicate = info.id !== placeholder ? this.getTab(info.id) : undefined

      if (duplicate) {
        asked.dropped()
        this.endAttempt(attempt, placeholder)
        this.remove(placeholder)

        if (activate) {
          this.activate(duplicate.id)
        }

        return duplicate
      }

      this.replace(placeholder, { id: info.id, title: info.name, status: "loading" })
      this.moveAttempt(attempt, placeholder, info.id)
      current = info.id
      const builder = info.builder.name
      this.setProgress(info.id, [`Starting ${builder}`, `Loading components from ${builder}`], 1)
      const { session, recordLoaded } = await createSession(info, asked, restored)

      if (attempt.abandoned) {
        asked.dropped()
        this.dropAbandoned(info.id, info.guestUrl)

        return opening
      }

      this.endAttempt(attempt, info.id)
      firstFrameOf(session, asked.ready(info))
      this.replace(info.id, { id: info.id, title: info.name, status: "ready", session })
      keepPictureOf(session)
      recordLoaded()
      this.settleMove(info.id)
      this.settleDetection(info.id)
      this.remember(info.root)
      void this.offerRecovery(session)

      return this.getTab(info.id)!
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.endAttempt(attempt, current)

      if (attempt.abandoned) {
        asked.dropped()

        if (opened) {
          this.dropAbandoned(opened)
        }

        return { ...opening, status: "error", message }
      }

      asked.failed(error)
      this.replace(current, { ...this.getTab(current)!, status: "error", message })

      return this.getTab(current)!
    }
  }

  /** Closes a tab, first asking whether to save when it has unsaved changes. Resolves false if that was cancelled. */
  async close(id: string): Promise<boolean> {
    const tab = this.getTab(id)

    if (!tab) {
      return true
    }

    if (tab.session?.store.hasUnsaved()) {
      const choice = await askAboutUnsaved([tab.title], "close")

      if (choice === "cancel") {
        return false
      }

      if (choice === "save" && !(await saveOrSay(tab.session))) {
        return false
      }
    }

    this.closeNow(id)

    return true
  }

  /**
   * Whether the window can close: asks about every project with unsaved changes at once, and saves if told to. Once it
   * can, each project's recovery copy is brought up to date, or removed when its changes were discarded, so a clean
   * quit leaves nothing to offer back (PAR-905).
   */
  async confirmQuit(): Promise<boolean> {
    const sessions = this.tabs.flatMap((tab) => (tab.session ? [tab.session] : []))
    const unsaved = sessions.filter((session) => session.store.hasUnsaved())

    const settle = (discarded: boolean) =>
      Promise.all(sessions.map((session) => (discarded ? session.recovery.drop() : session.recovery.settle())))

    if (unsaved.length === 0) {
      await settle(false)

      return true
    }

    const choice = await askAboutUnsaved(
      unsaved.map((session) => session.info.name),
      "quit"
    )

    if (choice === "cancel") {
      return false
    }

    if (choice === "discard") {
      await settle(true)

      return true
    }

    const saved = await Promise.all(unsaved.map((session) => saveOrSay(session)))
    await settle(false)

    return saved.every(Boolean)
  }

  /**
   * Offers back the unsaved changes kept when Parity last closed with the project open (PAR-905), then keeps its own.
   * Restoring puts them back over whatever its files hold now, unsaved, since an agent often changes a file in between.
   */
  private async offerRecovery(session: ProjectSession): Promise<void> {
    const copy = await request("recovery.read", { projectId: session.id }).catch(() => undefined)

    if (copy) {
      const choice = await askToRestore({ keptAt: new Date(copy.keptAt).toISOString() })

      // A tab closed or reopened while it was asked keeps its copy for the next open: it has no session, or a new one.
      if (this.getTab(session.id)?.session !== session) {
        return
      }

      if (choice === "restore") {
        session.store.restoreRecovery(copy)
      } else {
        await request("recovery.keep", { projectId: session.id }).catch(() => undefined)
      }
    }

    session.recovery.start()
  }

  private closeNow(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id)

    if (index === -1) {
      return
    }

    const tab = this.tabs[index]!
    this.update(this.tabs.filter((candidate) => candidate !== tab))
    // Closed after its changes were saved or discarded, so there's nothing left to recover.
    void tab.session?.recovery.drop()

    if (this.activeId === id) {
      this.activeId = (this.tabs[index] ?? this.tabs[index - 1])?.id
    }

    // A tab closed while its project opens has nothing to show it in, so its open closes the project once the service
    // has it, and its builder stops with it.
    this.moves.delete(id)
    this.latestMoves.delete(id)
    const attempt = this.attempts.get(id)

    if (attempt) {
      attempt.abandoned = true
      this.attempts.delete(id)
      this.settleDrops()
    }

    if (tab.session) {
      tab.session.close()
      void request("project.close", { projectId: tab.session.id })
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
    const before = this.getTab(id)

    // A tab already opening or reopening gets its project from that, which closing the tab can still cancel.
    if (!before || this.attempts.has(id)) {
      return
    }

    if (before.session?.store.hasUnsaved() && !(await saveOrSay(before.session))) {
      return
    }

    // The tab as it is after saving, which can have changed meanwhile, as when its guest moved. One closed and opened
    // again while saving has a session of its own, which this reload mustn't replace.
    const tab = this.getTab(id)

    if (!tab || this.attempts.has(id) || tab.session !== before.session) {
      return
    }

    this.replace(id, { id, title: tab.title, status: "loading" })
    // It opens again as a new session, so what was kept for this one stops.
    tab.session?.close()
    // The project opens again with a builder of its own, so where the last one moved to no longer matters.
    this.moves.delete(id)
    this.latestMoves.delete(id)
    const attempt = this.startAttempt(id)
    // A tab that has opened is its project's id, so a reopen is known to be for it from the start.
    attempt.projectId = id
    this.setProgress(id, [step, "Loading its components"], 0)
    await request("project.close", { projectId: id }).catch(() => undefined)

    // Its stylesheets are made anew, without the last session's token previews; its modules come back as they were
    // when the project's code hasn't changed.
    if (tab.session) {
      releaseGuest(tab.session.info.guestUrl)
    }

    if (attempt.abandoned) {
      return
    }

    let opened: string | undefined
    const asked = startOpening(id, true)

    try {
      const info = await asked.ask(() => request("project.open", { root: id }))
      opened = info.id

      if (attempt.abandoned) {
        asked.dropped()

        return this.dropAbandoned(info.id)
      }

      this.setProgress(id, [step, `Loading components from ${info.builder.name}`], 1)
      const { session, recordLoaded } = await createSession(info, asked)

      if (attempt.abandoned) {
        asked.dropped()

        return this.dropAbandoned(info.id, info.guestUrl)
      }

      this.endAttempt(attempt, id)
      firstFrameOf(session, asked.ready(info))
      this.replace(id, { id, title: info.name, status: "ready", session })
      keepPictureOf(session)
      // Its changes were saved before it reopened, so the last session's copy goes and this one keeps its own.
      void tab.session?.recovery.drop()
      session.recovery.start()
      recordLoaded()
      this.settleMove(id)
      this.settleDetection(id)
    } catch (error) {
      this.endAttempt(attempt, id)

      if (attempt.abandoned) {
        asked.dropped()

        if (opened) {
          this.dropAbandoned(opened)
        }

        return
      }

      asked.failed(error)
      this.replace(id, {
        id,
        title: tab.title,
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Opens a tab's project again when what detection reads of it changed since it opened (PAR-820), as `parity open`
   * on an open project asks: `components.json` added, a stylesheet created, a dependency added. Resolves once it's open
   * again, or at once when nothing changed.
   */
  async detectAgain(id: string): Promise<void> {
    const tab = this.getTab(id)

    if (!tab?.session || this.attempts.has(id) || !(await request("project.detectAgain", { projectId: id }))) {
      return
    }

    await this.reload(id, "Detecting the project again")
  }

  /**
   * Opens a project's tab again because what detection reads of it changed (`project.detectionChanged`). A tab still
   * loading checks again once it's ready, since what it loads may have been read before the change.
   */
  detectionChanged(projectId: string): void {
    const tab = this.tabs.find((candidate) => candidate.session?.id === projectId)

    if (tab) {
      void this.reload(tab.id, "Detecting the project again")
    } else {
      this.detections.add(projectId)
    }
  }

  /** Checks a tab that has just loaded against what detection reads now, if that changed while it loaded. */
  private settleDetection(id: string): void {
    if (this.detections.delete(id)) {
      void this.detectAgain(id)
    }
  }

  /**
   * Opens every tab's project again in a restarted project service. Each tab keeps its designs, unsaved changes,
   * selection and canvas; what the service provides (the builder and its guest, tokens, inferred props) is new.
   */
  async reconnect(): Promise<void> {
    await Promise.all(
      this.tabs.map(async ({ id, session }) => {
        if (!session) {
          return
        }

        try {
          const info = await request("project.open", { root: id })
          const loaded = await loadGuest(info.guestUrl, info.theme)
          inferComponents(info, session.components)
          const current = this.getTab(id)

          if (!current?.session) {
            return
          }

          const before = current.session.info.guestUrl
          this.drawFrom(current, current.session, info, loaded)

          if (before !== info.guestUrl) {
            releaseGuest(before)
          }
        } catch (error) {
          reportError(error, {
            operation: "project.reopen",
            title: `Couldn't reopen ${session.info.name}`,
            description: errorMessage(error)
          })
        }
      })
    )
  }

  /**
   * Draws a project's tab with its guest from a new address, once its builder started again on another port. Resolves
   * false when the guest there couldn't be loaded, so the tab still draws the old one, or when the tab is still loading
   * and draws it from there once it's ready.
   */
  async moveGuest(projectId: string, guestUrl: string): Promise<boolean> {
    const tab = this.tabs.find((candidate) => candidate.session?.id === projectId)

    if (!tab?.session) {
      const loading = this.getTab(projectId)?.status === "loading"

      if (loading) {
        this.moves.set(projectId, guestUrl)
      }

      return !loading
    }

    const before = tab.session.info.guestUrl

    if (before === guestUrl) {
      return true
    }

    this.latestMoves.set(projectId, guestUrl)

    // Whether no move came after this one, nor a reopen or close, which forget the last move; it's settled either way.
    const latest = () => {
      const last = this.latestMoves.get(projectId) === guestUrl

      if (last) {
        this.latestMoves.delete(projectId)
      }

      return last
    }

    try {
      const loaded = await loadGuest(guestUrl, tab.session.info.theme)
      const current = this.getTab(tab.id)
      const now = current?.session?.info.guestUrl

      // A tab closed or reopened meanwhile draws what it has now, and one that moved again draws from there once that
      // guest loads, so the guest loaded here is no one's.
      if (!latest() || !current?.session || now !== before) {
        if (now !== guestUrl) {
          releaseGuest(guestUrl)
        }

        return !current?.session || now === guestUrl
      }

      // From the session as it is now, since its sources can change while the guest loads.
      this.drawFrom(current, current.session, { ...current.session.info, guestUrl }, loaded)
      releaseGuest(before)

      return true
    } catch (error) {
      if (!latest()) {
        return false
      }

      reportError(error, {
        operation: "project.reload",
        title: `Couldn't load ${tab.session.info.name} from its restarted builder`,
        description: errorMessage(error)
      })

      return false
    }
  }

  /**
   * Gives a tab's session new parts. The session stays the same object, so what's kept for it stays; the tab is copied
   * so that what reads it from the list of tabs draws again.
   */
  private updateSession(tab: Tab, session: ProjectSession, change: Partial<SessionParts>): void {
    session.update(change)
    this.replace(tab.id, { ...tab })
  }

  /** Draws a tab's session from a guest loaded anew, with tokens of its own, letting go of the last guest's tokens. */
  private drawFrom(tab: Tab, session: ProjectSession, info: ProjectInfo, loaded: LoadedGuest): void {
    const { tokens } = session
    this.updateSession(tab, session, { info, loaded, tokens: tokenStore(info, loaded, session.store) })
    tokens.dispose()
  }

  /** Draws a tab that has just loaded from where its guest moved meanwhile, if it did. */
  private settleMove(id: string): void {
    const guestUrl = this.moves.get(id)

    if (!guestUrl) {
      return
    }

    this.moves.delete(id)
    void this.moveGuest(id, guestUrl)
  }

  /** Saves every open project's unsaved changes. */
  async flush(): Promise<void> {
    const results = await Promise.allSettled(
      this.tabs.flatMap((tab) => (tab.session ? [tab.session.store.flush()] : []))
    )

    const failed = results.find((result) => result.status === "rejected")

    if (failed) {
      throw failed.reason
    }
  }

  /** Takes a project off the recent list, or every project when none is given. Starred ones stay starred. */
  forgetRecent(root?: string): void {
    this.recent = root ? this.recent.filter((candidate) => candidate !== root) : []
    this.saveRecent()
  }

  /** Stars a project, so the start page keeps it under Starred, or unstars it. */
  star(root: string, starred: boolean): void {
    const { opened } = this.notes[root] ?? {}
    const note: ProjectNote = {}

    if (opened !== undefined) {
      note.opened = opened
    }

    if (starred) {
      note.starred = starred
    }

    this.notes = { ...this.notes, [root]: note }
    this.saveNotes()
  }

  activate(id: string | undefined): void {
    if (id === this.activeId) {
      return
    }

    this.activeId = id
    this.save()
    this.notify()

    // A folder may have gone, or come back, since Home last showed.
    if (this.isHomeActive()) {
      void this.checkFolders()
    }
  }

  /**
   * Asks the service which listed projects' folders aren't there any more, and where the example is, for the start
   * page (PAR-188). A service that can't say leaves things as they were.
   */
  async checkFolders(): Promise<void> {
    const roots = this.projects.map(({ root }) => root)
    const checked = await request("start.check", { roots }).catch(() => undefined)

    if (!checked) {
      return
    }

    const missing = new Set(checked.missing)

    const same =
      checked.example === this.example &&
      missing.size === this.missing.size &&
      [...missing].every((root) => this.missing.has(root))

    if (same) {
      return
    }

    this.missing = missing
    this.example = checked.example
    this.projects = knownProjects(this.recent, this.notes, this.missing)
    this.notify()
  }

  /**
   * The project's components once the type checker has read them, or after its files changed. Ones the guest doesn't
   * have yet, or has from another file, are given to it, and load the first time they're drawn. `leftOut` is what the
   * checker left out, and why.
   */
  setSources(id: string, sources: ProjectInfo["sources"], leftOut?: ProjectInfo["leftOut"]): void {
    const tab = this.getTab(id)

    if (!tab?.session) {
      return
    }

    const versions = tab.session.versions ?? {}

    const { add, drop } = guestChanges(
      versionedSources(tab.session.info.sources, versions),
      versionedSources(sources, versions)
    )

    const { guest } = tab.session.loaded
    guest.addComponents?.(add)

    // The guest takes back the ones it was given, as the offscreen renderer does once a job no longer carries them.
    if (drop.length > 0) {
      guest.removeComponents?.(drop)
    }

    const added = { ...tab.session.added, ...add }

    for (const name of drop) {
      delete added[name]
    }

    const info: ProjectInfo = { ...tab.session.info, sources, componentCount: Object.keys(sources).length }

    if (leftOut) {
      info.leftOut = leftOut
    }

    this.updateSession(tab, tab.session, { info, added })
  }

  /**
   * Component files whose code changed on disk, or that import a file that did, at `stamp` (PAR-165). Their components
   * load again from a new address, so frames and bitmaps draw the code as it is now, within a moment of a save.
   */
  codeChanged(id: string, paths: readonly string[], stamp: number): void {
    const tab = this.getTab(id)

    if (!tab?.session) {
      return
    }

    const { sources } = tab.session.info
    const before = tab.session.versions ?? {}
    const versions = codeChangeVersions(sources, paths, stamp, before)
    const { add } = guestChanges(versionedSources(sources, before), versionedSources(sources, versions))

    if (Object.keys(add).length === 0) {
      return
    }

    tab.session.loaded.guest.addComponents?.(add)
    const added = { ...tab.session.added, ...add }
    this.updateSession(tab, tab.session, { versions, added })
  }

  setEditor(id: string, editor: Editor | undefined): void {
    const tab = this.getTab(id)

    if (!tab?.session || tab.session.editor === editor) {
      return
    }

    this.updateSession(tab, tab.session, { editor })
  }

  /** The tabs with a project in them, as agents see them. */
  summaries(): TabSummary[] {
    return this.tabs
      .filter((tab) => !tab.blank)
      .map((tab) => {
        const summary: TabSummary = {
          id: tab.id,
          name: tab.title,
          root: tab.session?.info.root ?? tab.id,
          active: tab.id === this.activeId,
          status: tab.status,
          designs: tab.session?.store.getEntries().length ?? 0
        }

        if (tab.message && tab.status === "error") {
          summary.error = tab.message
        }

        return summary
      })
  }

  /** Moves a loading tab on to one of its steps. Its message says that step, for the tab's tooltip. */
  private setProgress(id: string, steps: string[], current: number): void {
    const tab = this.getTab(id)

    if (tab) {
      this.replace(id, { ...tab, progress: { steps, current }, message: `${steps[current]}…` })
    }
  }

  private startAttempt(id: string): Attempt {
    const attempt: Attempt = { abandoned: false }
    this.attempts.set(id, attempt)

    return attempt
  }

  /** Follows an open's tab from its placeholder to the project's id. */
  private moveAttempt(attempt: Attempt, from: string, to: string): void {
    if (this.attempts.get(from) === attempt) {
      this.attempts.delete(from)
    }

    this.attempts.set(to, attempt)
    this.settleDrops()
  }

  private endAttempt(attempt: Attempt, id: string): void {
    if (this.attempts.get(id) === attempt) {
      this.attempts.delete(id)
    }

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
    if (this.drops.size === 0) {
      return
    }

    const inFlight = [...this.attempts.values()]
    const undecided = inFlight.some((attempt) => attempt.projectId === undefined)

    for (const [projectId, guestUrl] of this.drops) {
      if (this.getTab(projectId) || inFlight.some((attempt) => attempt.projectId === projectId)) {
        this.drops.delete(projectId)
        continue
      }

      if (undecided) {
        continue
      }

      this.drops.delete(projectId)
      void request("project.close", { projectId })

      if (guestUrl) {
        releaseGuest(guestUrl)
      }
    }
  }

  private replace(id: string, tab: Tab): void {
    this.update(this.tabs.map((candidate) => (candidate.id === id ? tab : candidate)))

    if (this.activeId === id) {
      this.activeId = tab.id
    }

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
    this.notes = { ...this.notes, [root]: { ...this.notes[root], opened: Date.now() } }
    this.saveRecent()
  }

  /** Saves the recent list, and the notes on what's still listed. */
  private saveRecent(): void {
    try {
      localStorage.setItem(recentKey, JSON.stringify(this.recent))
    } catch {
      // Storage can be unavailable; the list then just isn't remembered.
    }

    this.saveNotes()
  }

  /** Saves the notes on projects the start page still lists, so ones it forgot don't pile up. */
  private saveNotes(): void {
    this.notes = Object.fromEntries(
      Object.entries(this.notes).filter(([root, note]) => note.starred || this.recent.includes(root))
    )

    try {
      localStorage.setItem(notesKey, JSON.stringify(this.notes))
    } catch {
      // Storage can be unavailable; the notes then just aren't remembered.
    }

    this.projects = knownProjects(this.recent, this.notes, this.missing)
    // A project's picture goes with it (PAR-607).
    void request("pictures.keepOnly", { roots: this.projects.map(({ root }) => root) }).catch(() => undefined)
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

const savedNotes = jsonText(
  z.record(z.string(), z.object({ opened: finiteNumber.optional(), starred: z.literal(true).optional() }))
)

/** What the window keeps about each project. Notes it can't read are dropped, as a corrupt recent list is. */
function loadNotes(): Record<string, ProjectNote> {
  try {
    return parseData(savedNotes, localStorage.getItem(notesKey) ?? "{}")
  } catch {
    return {}
  }
}

/** A list of project roots as saved, without any that aren't one. */
const savedRoots = z
  .array(z.string().catch(""))
  .catch([])
  .transform((roots) => roots.filter(Boolean))

const savedTabs = z.object({
  /** The projects open in tabs, in the strip's order. */
  roots: savedRoots,
  /** The root of the tab that was showing, or Home. */
  active: z.string().optional().catch(undefined)
})

type SavedTabs = z.infer<typeof savedTabs>

/** The tabs saved as `text`. A corrupt entry reads as none, and one bad value as its default. */
function readSavedTabs(text: string | null): SavedTabs {
  return jsonText(savedTabs)
    .catch({ roots: [] })
    .parse(text ?? "{}")
}

/** The recent projects saved as `text`, without any entry that isn't a project's root. */
function readRecent(text: string | null): string[] {
  return jsonText(savedRoots)
    .catch([])
    .parse(text ?? "[]")
}

function loadRecent(): string[] {
  try {
    return readRecent(localStorage.getItem(recentKey))
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
    reportError(error, {
      operation: "project.save",
      title: `Couldn't save ${session.info.name}`,
      id: saveFailureToast(session.id),
      description: errorMessage(error)
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
      if (said) {
        toast.dismiss(id)
      }

      said = false
    }

    if (state.status !== "failed" || said) {
      return
    }

    said = true
    reportError(state.error, {
      operation: "project.autosave",
      title: `Couldn't save ${session.info.name}`,
      id,
      description: state.error,
      duration: Infinity,
      action: { label: "Retry", onClick: () => void saveOrSay(session) }
    })
  })
}

/**
 * Loads an opened project's guest and components into a session. `recordLoaded` records how long that and the whole
 * open took (PAR-637), in the open's trace (PAR-711), and whether the window `restored` it as it started (PAR-694);
 * it's for once the tab has the session, so an open its tab abandoned isn't counted as ready.
 */
async function createSession(
  info: ProjectInfo,
  asked: Opening,
  restored = false
): Promise<{ session: ProjectSession; recordLoaded: () => void }> {
  const loading = performance.now()
  const loaded = await loadGuest(info.guestUrl, info.theme)

  const store = new DesignStore(
    openingDesigns(info.documents, info.mainDocument, info.sources, info.modes.settings),
    info.modes.settings,
    info.mainDocument,
    {
      saveDocument: (path, document) => saveDocument(info.id, path, document),
      autosave: () => getPreferences().autosave
    },
    info.libraries.flatMap((library) => library.designs ?? [])
  )

  const components = new ComponentStore()
  inferComponents(info, components)

  const session = new ProjectSession(
    {
      id: info.id,
      store,
      components,
      selection: new SelectionStore(),
      recovery: keepRecovery(store, (copy) =>
        request("recovery.keep", copy ? { projectId: info.id, copy } : { projectId: info.id })
      )
    },
    { info, loaded, tokens: tokenStore(info, loaded, store) }
  )

  sayWhenSavesFail(session)
  followCorrections(session)
  const now = performance.now()

  const recordLoaded = () =>
    asked.loaded({
      name: info.name,
      root: info.root,
      durationMs: Math.round(now - asked.began),
      componentsMs: Math.round(now - loading),
      components: info.componentCount,
      restored
    })

  return { session, recordLoaded }
}

/**
 * Keeps the start page's picture of the project for as long as its session lasts (PAR-607), so a code change or a
 * reconnect doesn't take it again.
 */
function keepPictureOf(session: ProjectSession): void {
  session.untilClosed(keepProjectPicture(session))
}

/**
 * Gives the session what records its canvas's first frame, which it lets go of once it has. Session Replay waits for it
 * too, so recording the canvas as it mounts doesn't hold the frame up (PAR-758).
 */
function firstFrameOf(session: ProjectSession, record: (from: FirstFrame) => void): void {
  const release = holdRecording()
  session.firstFrame = watchFirstFrame((from) => {
    session.firstFrame = undefined
    record(from)
    release()
  })
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

    if (next === sent) {
      return
    }

    sent = next
    const params: ServiceMethods["project.correctComponents"]["params"] = { projectId: session.id }

    if (next) {
      params.corrections = next
    }

    request("project.correctComponents", params).catch((cause: unknown) =>
      console.warn("The component list couldn't take the correction", cause)
    )
  })
}

/** Fills in each component's props once the service has inferred them, after the tab opens. */
function inferComponents(info: ProjectInfo, components: ComponentStore): void {
  request("project.components", { projectId: info.id })
    .then((inferred) => components.set(inferred))
    .catch((cause: unknown) => console.warn("Component props couldn't be inferred", cause))
}

/** Writes a design file, recording how long it took and how big it was. */
async function saveDocument(projectId: string, path: string, document: CanvasDocument): Promise<void> {
  const start = performance.now()
  const bytes = JSON.stringify(document).length
  const measured = () => ({ file: path, durationMs: Math.round(performance.now() - start), bytes })
  // In the trace the write was asked in, the edit's or Save's, which has moved on by the time the service answers.
  const inTrace = { span: currentTraceContext() }

  try {
    await request("document.save", { projectId, path, document })
    track("document.saved", measured(), inTrace)
  } catch (error) {
    const failed: Attributes<"document.saveFailed"> = measured()
    const code = errorCode(error)

    if (code) {
      failed.code = code
    }

    track("document.saveFailed", failed, inTrace)
    throw error
  }
}

/** Writes token changes to the project's stylesheet, recording what it changed. */
async function saveTokens(projectId: string, changes: TokenWrite[]): Promise<ProjectEditResult> {
  try {
    const edit = await request("tokens.save", { projectId, changes })
    track("tokens.saved", { changes: changes.length, files: edit.files.map((file) => file.path), outcome: "ok" })

    return edit
  } catch (error) {
    const failed: Attributes<"tokens.saved"> = { changes: changes.length, files: [], outcome: "error" }
    const code = errorCode(error)

    if (code) {
      failed.code = code
    }

    track("tokens.saved", failed)
    throw error
  }
}

/** A project's tokens, edited through its design store's history and written to its stylesheet when it's saved. */
function tokenStore(info: ProjectInfo, loaded: LoadedGuest, store: DesignStore): TokenStore {
  return new TokenStore(
    loaded.tokens,
    loaded.sheet,
    async (changes) => {
      await saveTokens(info.id, changes)
    },
    store,
    info.styles?.stylesheet,
    info.describedTokens
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

export function useKnownProjects(): readonly KnownProject[] {
  return useSyncExternalStore(workspace.subscribe, workspace.getProjects)
}

export function useHomeActive(): boolean {
  return useSyncExternalStore(workspace.subscribe, workspace.isHomeActive)
}

/** The example project's folder, when this copy of Parity has it (PAR-188). */
export function useExampleFolder(): string | undefined {
  return useSyncExternalStore(workspace.subscribe, workspace.getExample)
}
