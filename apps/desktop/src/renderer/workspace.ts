import {
  type CanvasDocument,
  codeChangeVersions,
  findNode,
  type GuestComponentSource,
  guestChanges,
  type LayerFailure,
  markedRoutes,
  plainReason,
  routeFiles,
  versionedSources,
  withProjectPreferences
} from "@parity-app/core"
import {
  boardComponentNode,
  boardGroups,
  type BoardParents,
  nextBoardParents,
  noBoardParents,
  openingDesigns,
  type RecoveryCopy,
  redrawnBoards,
  prunedDocument,
  sameValue
} from "@parity-app/editor"
import type { SyncDocument } from "@parity-app/extension-host/window-sync"
import { applyDocuments, changeSnapshot, containerEntries, type ProjectDoc, restoreCopy } from "@parity-app/multiplayer"
import type { LoroBackend } from "@parity-app/multiplayer-loro"
import {
  changeProjectsData,
  type ProjectNote,
  type Projects,
  type ProjectsChange,
  type SavedTabs
} from "@parity-app/settings"
import type { TokenWrite } from "@parity-app/tokens"
import { useSyncExternalStore } from "react"
import type { Editor } from "tldraw"
import type { ProjectEditResult, ProjectInfo, ServiceMethods, TabSummary } from "../shared/protocol.ts"
import { keepCodeDesigns, openCodeDesigns, withCodeDesigns } from "./canvas/code-designs.ts"
import { componentBoardsDocument, componentBoardsFile } from "./canvas/component-boards.ts"
import { type FirstFrameWatch, watchFirstFrame } from "./canvas/first-frame.ts"
import { routePages, routePagesFile, routeParams } from "./canvas/route-pages.ts"
import { storyScreensDocument, storyScreensFile } from "./canvas/story-screens.ts"
import type { Attributes } from "./chrome/event-attributes.ts"
import { getPreferences } from "./chrome/preferences.ts"
import { offerPreviewFile } from "./chrome/PreviewOffer.tsx"
import { askToRestore } from "./chrome/restore.ts"
import { askAboutUnsaved } from "./chrome/unsaved.ts"
import { ComponentStore } from "./components-store.ts"
import { designFailuresNow, onDesignFailures } from "./failures-store.ts"
import { type LoadedGuest, loadGuest, releaseGuest } from "./guest.ts"
import { type FirstFrame, type Opening, startOpening } from "./opening.ts"
import { closeDocSession, type DocSession, openDocSession, type RoomOpening } from "./project-doc.ts"
import { keepProjectPicture } from "./project-picture.ts"
import { keepRecovery, type RecoveryKeeper } from "./recovery.ts"
import { holdRecording } from "./replay.ts"
import { errorCode, reportError, track } from "./report-error.ts"
import { saved } from "./saved.ts"
import { SelectionStore } from "./selection.ts"
import { request } from "./service.ts"
import { type KnownProject, knownProjects } from "./start/projects.ts"
import { signal, type Store, createStore } from "./store.ts"
import { notify } from "./toasts.tsx"
import { TokenStore } from "./tokens-store.ts"
import { currentTraceContext, keepTrace } from "./tracing.ts"
import { startTabModules, type TabModules } from "./window-modules.ts"

/** What can change in an open project while it's open, each part replaced whole. */
export interface SessionParts {
  info: ProjectInfo
  loaded: LoadedGuest
  tokens: TokenStore
  /**
   * Components the type checker found after the guest loaded, and ones whose code changed since (with a `version`),
   * which offscreen renders add to theirs.
   */
  added?: Record<string, GuestComponentSource & ProjectInfo["sources"][string]> | undefined
  /** When each component's code last changed on disk, by its builder's stamp, while it's open (PAR-165). */
  versions?: Record<string, number> | undefined
  /** The project's canvas, once mounted. */
  editor?: Editor | undefined
}

/**
 * Everything one open project needs: its info from the service, its components and styles, and its stores. It's one
 * object from the project becoming ready to its closing or reopening, so what's kept for it lasts as long (PAR-1004).
 * Its stores never change; the parts that can, such as its info or its guest, are read through it and change through
 * `update`, which tells whoever subscribed.
 */
export class ProjectSession implements DocSession {
  readonly id: string
  readonly doc: DocSession["doc"]
  readonly saver: DocSession["saver"]
  readonly libraryDesigns: DocSession["libraryDesigns"]
  readonly epoch: string
  readonly room: DocSession["room"]
  readonly autosave: () => boolean
  readonly selection: SelectionStore
  /** Components and their props, inferred from source after the project opens. */
  readonly components: ComponentStore
  /** Keeps a copy of its unsaved changes outside the project, in case Parity closes before they're saved (PAR-905). */
  readonly recovery: RecoveryKeeper
  /**
   * Watches for the first frame its canvas draws on screen, live or from a bitmap, recorded with how long opening took
   * (PAR-711). Gone once one has. Nothing draws from it, so it changes without telling anyone.
   */
  firstFrame?: FirstFrameWatch | undefined
  private readonly parts: Store<SessionParts>
  private readonly stops: (() => void)[] = []
  private closed = false

  constructor(
    fixed: Pick<ProjectSession, "id" | "selection" | "components" | "recovery"> & { designs: DocSession },
    parts: SessionParts
  ) {
    this.id = fixed.id
    this.doc = fixed.designs.doc
    this.saver = fixed.designs.saver
    this.libraryDesigns = fixed.designs.libraryDesigns
    this.epoch = fixed.designs.epoch
    this.room = fixed.designs.room
    const { autosave } = fixed.designs
    this.autosave = () => autosave()
    this.selection = fixed.selection
    this.components = fixed.components
    this.recovery = fixed.recovery
    this.parts = createStore(() => parts)
  }

  get info(): ProjectInfo {
    return this.parts.get().info
  }

  get loaded(): LoadedGuest {
    return this.parts.get().loaded
  }

  get tokens(): TokenStore {
    return this.parts.get().tokens
  }

  get added(): SessionParts["added"] {
    return this.parts.get().added
  }

  get versions(): SessionParts["versions"] {
    return this.parts.get().versions
  }

  get editor(): Editor | undefined {
    return this.parts.get().editor
  }

  subscribe = (listener: () => void): (() => void) => this.parts.subscribe(listener)

  /** The parts as they are now, a new object each time one changes. */
  getParts = (): SessionParts => this.parts.get()

  /** Replaces the parts given, and tells whoever subscribed. */
  update(change: Partial<SessionParts>): void {
    this.parts.update((now) => ({ ...now, ...change }))
  }

  /**
   * Runs `stop` when the session ends, as its project closes or reopens, or straight away if it has: a component can
   * still draw a closed session, and what it starts then mustn't run on.
   */
  untilClosed(stop: () => void): void {
    if (this.closed) {
      stop()
    } else {
      this.stops.push(stop)
    }
  }

  /**
   * Ends the session: stops what was kept for it and lets go of its canvas. React keeps the project a component last
   * read until it renders again, so the session can outlive it; without its editor it holds no canvas (PAR-624).
   */
  close(): void {
    if (this.closed) {
      return
    }

    this.closed = true

    for (const stop of this.stops.splice(0)) {
      stop()
    }

    this.update({ editor: undefined })
    closeDocSession(this)
  }
}

/**
 * A project's designs and what's selected in them, which most edits read and change. A function that reads these takes
 * them, with a `Pick` of any other part it reads, rather than the whole session, so its tests build only that (PAR-1006).
 */
export type ProjectDesigns = DocSession & Pick<ProjectSession, "selection">

/** The project the window holds: opening, open, or one that couldn't open. */
export interface Project {
  /** The project's root once known; a placeholder while it opens. */
  id: string
  title: string
  status: "loading" | "ready" | "error"
  message?: string
  /** While loading: what opening does, in order, and which of them it's doing now. */
  progress?: { steps: string[]; current: number }
  session?: ProjectSession
}

/** An extension's page (PAR-1094), shown in its project's place: the project it's for, the extension and the page. */
export interface ExtensionPage {
  projectId: string
  extension: string
  page: string
}

/** One open, reopen or reconnect of the project, which closing it abandons. */
interface Attempt {
  abandoned: boolean
  /** The project the service opened for it, once it says. */
  projectId?: string
}

/** Whether the project is still waiting for the service to say which project it opened: it has no folder yet. */
export function isPlaceholder(id: string): boolean {
  return id.startsWith("opening-")
}

/**
 * The window's project, with its own builder, guest and canvas, or none, when the window shows Home. Opening another
 * closes it first, asking whether to save it. An extension's page shows in the project's place until it's closed.
 */
export class Workspace {
  private project: Project | undefined
  private page: (ExtensionPage & { title: string }) | undefined
  /** The recent projects, from `projects.json`, which every copy shares. */
  private recent: readonly string[] = saved().projects.recent
  /** When each project last opened and whether it's starred, by folder. */
  private notes: Readonly<Record<string, ProjectNote>> = saved().projects.notes
  /** Listed projects whose folders weren't there when last checked (PAR-188). */
  private missing: ReadonlySet<string> = new Set()
  /** The example project's folder, when this copy of Parity has it. */
  private example: string | undefined
  private projects: readonly KnownProject[] = knownProjects(this.recent, this.notes)
  /** Whether this window keeps its project for next time: it claimed one, rather than opening for one project. */
  private keepsProject = false
  private nextPlaceholder = 1
  /**
   * Opens, reopens and reconnects in flight, by the id of the project they load. Closing the project marks its open
   * abandoned, so that open, and only that one, closes the project once the service has it.
   */
  private readonly attempts = new Map<string, Attempt>()
  /** Projects abandoned opens got, to close once nothing in flight could still be for them, with guests to let go of. */
  private readonly drops = new Map<string, string | undefined>()
  /** Where the project's guest moved while it was still loading, to draw from once it's ready. */
  private readonly moves = new Map<string, string>()
  /** The address the project's guest last moved to while one loads, so a move a later one overtook is let go. */
  private readonly latestMoves = new Map<string, string>()
  /** Projects whose detection changed while they were loading, to check again once ready (PAR-820). */
  private readonly detections = new Set<string>()
  private readonly changes = signal()

  subscribe = this.changes.subscribe

  constructor() {
    // Another copy opening or starring a project changes the start page here too.
    if (typeof window !== "undefined") {
      window.canvasHost?.projects?.subscribe((projects) => this.takeProjects(projects))
    }
  }

  /** The project the window holds, or undefined while it shows Home. */
  getProject = () => this.project
  /** The extension's page shown in the project's place, if one is. */
  getPage = () => this.page
  /** Projects opened before, most recent first. */
  getRecent = () => this.recent
  /** The projects the start page lists: the recent ones, then starred ones that aren't. */
  getProjects = () => this.projects
  /** The example project's folder, once the service has found it. */
  getExample = () => this.example

  /** The project, when it has this id. */
  private held(id: string | undefined): Project | undefined {
    return id !== undefined && this.project?.id === id ? this.project : undefined
  }

  /** The project, once it's open as this one in the service. */
  private opened(projectId: string): Project | undefined {
    return this.project?.session?.id === projectId ? this.project : undefined
  }

  /**
   * Reopens the project from last time, or the dev runner's requested project. A fresh install, or a window closed on
   * Home, shows Home.
   */
  async restore(): Promise<void> {
    void this.checkFolders()
    const { initialProject } = window.canvasHost

    // A copy started for one project opens it and keeps none of its own (`docs/proposals/settings.md`).
    if (initialProject) {
      void this.open(initialProject, true)

      return
    }

    let kept: SavedTabs = { roots: [] }

    try {
      kept = await window.canvasHost.state.claimTabs()
      this.keepsProject = true
    } catch {
      // Main couldn't give any, which means starting fresh.
    }

    // A window from before PAR-1241 kept several, with the one it showed as `active`.
    const root = kept.roots.find((candidate) => candidate === kept.active) ?? kept.roots[0]

    // One opened while main answered stays.
    if (root && !this.project) {
      void this.open(root, true)
    }
  }

  /** Shows an extension's page in the project's place. A page for a project that isn't open shows nothing. */
  openPage({ title, ...page }: ExtensionPage & { title: string }): void {
    if (this.project?.session?.id !== page.projectId) {
      return
    }

    this.page = { ...page, title }
    this.notify()
  }

  /** Closes the extension's page, showing the project again. */
  closePage(): void {
    if (this.page) {
      this.page = undefined
      this.notify()
    }
  }

  /**
   * Opens a project in the window in place of the one it holds, which closes first, asking whether to save it when it
   * has unsaved changes. The project it holds already stays as it is, unless it couldn't open. Resolves undefined when
   * the person keeps the one it holds. `restored` when the window opens it as it starts, rather than the person
   * choosing it.
   */
  open(root: string | undefined, restored = false): Promise<Project | undefined> {
    const held = this.project
    const same = root !== undefined && (held?.id === root || held?.session?.info.root === root)

    if (held && same && held.status !== "error") {
      return Promise.resolve(held)
    }

    // Asked first, so the project isn't closed until its changes are saved or let go; it can be another by then.
    if (held?.session?.saver.hasUnsaved()) {
      return this.close(held.id).then((closed) => (closed ? this.open(root, restored) : undefined))
    }

    if (held) {
      this.closeNow(held.id)
    }

    return this.openNew(root, restored)
  }

  private async openNew(root: string | undefined, restored: boolean): Promise<Project> {
    const placeholder = root ?? `opening-${this.nextPlaceholder++}`
    const opening: Project = { id: placeholder, title: root ? basename(root) : "Opening…", status: "loading" }
    this.project = opening
    this.save()
    this.notify()
    const attempt = this.startAttempt(placeholder)
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

      this.replace(placeholder, { id: info.id, title: info.name, status: "loading" })
      this.moveAttempt(attempt, placeholder, info.id)
      current = info.id
      const builder = info.builder.name
      this.setProgress(info.id, [`Starting ${builder}`, `Loading components from ${builder}`], 1)
      const { session, recordLoaded } = await createSession(info, asked, () => this.reload(info.id), restored)

      if (attempt.abandoned) {
        session.close()
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
      void this.offerPreviewFile(info)

      return this.held(info.id)!
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (this.failAttempt(attempt, current, opened)) {
        asked.dropped()

        return { ...opening, status: "error", message }
      }

      asked.failed(error)
      this.replace(current, { ...this.held(current)!, status: "error", message })

      return this.held(current)!
    }
  }

  /**
   * Closes the project, first asking whether to save it when it has unsaved changes, and shows Home. Resolves false if
   * that was cancelled.
   */
  async close(id = this.project?.id): Promise<boolean> {
    const project = this.held(id)

    if (!project) {
      return true
    }

    if (project.session?.saver.hasUnsaved()) {
      const choice = await askAboutUnsaved([project.title], "close")

      if (choice === "cancel") {
        return false
      }

      if (choice === "save" && !(await saveOrSay(project.session))) {
        return false
      }
    }

    this.closeNow(project.id)
    // Home shows now, and a folder may have gone, or come back, since it last showed.
    void this.checkFolders()

    return true
  }

  /**
   * Whether the window can close: asks about the project's unsaved changes, and saves if told to. Once it can, the
   * project's recovery copy is brought up to date, or removed when its changes were discarded, so a clean quit leaves
   * nothing to offer back (PAR-905).
   */
  async confirmQuit(): Promise<boolean> {
    const session = this.project?.session

    if (!session) {
      return true
    }

    if (!session.saver.hasUnsaved()) {
      await session.recovery.settle()

      return true
    }

    const choice = await askAboutUnsaved([session.info.name], "quit")

    if (choice === "cancel") {
      return false
    }

    if (choice === "discard") {
      await session.recovery.drop()

      return true
    }

    const saved = await saveOrSay(session)
    await session.recovery.settle()

    return saved
  }

  /**
   * Offers back the unsaved changes kept when Parity last closed with the project open (PAR-905), then keeps its own.
   * Restoring puts them back over whatever its files hold now, unsaved, since an agent often changes a file in between.
   */
  private async offerRecovery(session: ProjectSession): Promise<void> {
    const copy = await request("recovery.read", { projectId: session.id }).catch(() => undefined)

    if (copy) {
      const choice = await askToRestore({ keptAt: new Date(copy.keptAt).toISOString() })

      // One closed or reopened while it was asked keeps its copy for the next open: it has no session, or a new one.
      if (this.held(session.id)?.session !== session) {
        return
      }

      if (choice === "restore") {
        restoreCopy(session.doc, copy)
      } else {
        await request("recovery.keep", { projectId: session.id }).catch(() => undefined)
      }
    }

    session.recovery.start()
  }

  private closeNow(id: string): void {
    const project = this.held(id)

    if (!project) {
      return
    }

    this.project = undefined
    // Its extensions' pages go with it.
    this.page = undefined
    // Closed after its changes were saved or discarded, so there's nothing left to recover.
    void project.session?.recovery.drop()

    // A project closed while it opens has nothing to show it in, so its open closes the project once the service has
    // it, and its builder stops with it.
    this.moves.delete(id)
    this.latestMoves.delete(id)
    const attempt = this.attempts.get(id)

    if (attempt) {
      attempt.abandoned = true
      this.attempts.delete(id)
      this.settleDrops()
    }

    if (project.session) {
      const projectId = project.session.id
      project.session.close()
      void request("project.close", { projectId })
      releaseGuest(project.session.info.guestUrl)
    }

    this.save()
    this.notify()
  }

  /**
   * Opens the project again from scratch, for changes discovery has to see: a library added, new dependencies. Unsaved
   * changes are saved first, so reopening can't lose them. `step` says what reopening is for while the builder
   * restarts, such as "Loading Nova".
   */
  async reload(id: string, step = "Reopening the project"): Promise<void> {
    const before = this.held(id)

    // A project already opening or reopening gets its project from that, which closing it can still cancel.
    if (!before || this.attempts.has(id)) {
      return
    }

    if (before.session?.saver.hasUnsaved() && !(await saveOrSay(before.session))) {
      return
    }

    // The project as it is after saving, which can have changed meanwhile, as when its guest moved. One closed and
    // opened again while saving has a session of its own, which this reload mustn't replace.
    const project = this.held(id)

    if (!project || this.attempts.has(id) || project.session !== before.session) {
      return
    }

    this.replace(id, { id, title: project.title, status: "loading" })
    // It opens again as a new session, so what was kept for this one stops.
    project.session?.close()
    // The project opens again with a builder of its own, so where the last one moved to no longer matters.
    this.moves.delete(id)
    this.latestMoves.delete(id)
    const attempt = this.startAttempt(id)
    // A project that has opened is known by its id, so a reopen is known to be for it from the start.
    attempt.projectId = id
    this.setProgress(id, [step, "Loading its components"], 0)
    await request("project.close", { projectId: id }).catch(() => undefined)

    // Its stylesheets are made anew, without the last session's token previews; its modules come back as they were
    // when the project's code hasn't changed.
    if (project.session) {
      releaseGuest(project.session.info.guestUrl)
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
      const { session, recordLoaded } = await createSession(info, asked, () => this.reload(id))

      if (attempt.abandoned) {
        session.close()
        asked.dropped()

        return this.dropAbandoned(info.id, info.guestUrl)
      }

      this.endAttempt(attempt, id)
      firstFrameOf(session, asked.ready(info))
      this.replace(id, { id, title: info.name, status: "ready", session })
      keepPictureOf(session)
      // Its changes were saved before it reopened, so the last session's copy goes and this one keeps its own.
      void project.session?.recovery.drop()
      session.recovery.start()
      recordLoaded()
      this.settleMove(id)
      this.settleDetection(id)
    } catch (error) {
      if (this.failAttempt(attempt, id, opened)) {
        asked.dropped()

        return
      }

      asked.failed(error)
      this.replace(id, {
        id,
        title: project.title,
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Opens the project again when what detection reads of it changed since it opened (PAR-820), as `parity open` on the
   * open project asks: a stylesheet created, a dependency added. Resolves once it's open again, or at once when nothing
   * changed.
   */
  async detectAgain(id: string): Promise<void> {
    const project = this.held(id)

    if (!project?.session || this.attempts.has(id) || !(await request("project.detectAgain", { projectId: id }))) {
      return
    }

    await this.reload(id, "Detecting the project again")
  }

  /**
   * Opens the project again because what detection reads of it changed (`project.detectionChanged`). One still loading
   * checks again once it's ready, since what it loads may have been read before the change.
   */
  detectionChanged(projectId: string): void {
    const project = this.opened(projectId)

    if (project) {
      void this.reload(project.id, "Detecting the project again")
    } else {
      this.detections.add(projectId)
    }
  }

  /** Checks a project that has just loaded against what detection reads now, if that changed while it loaded. */
  private settleDetection(id: string): void {
    if (this.detections.delete(id)) {
      void this.detectAgain(id)
    }
  }

  /**
   * Opens the project again in a restarted project service. It keeps its designs, unsaved changes, selection and
   * canvas; what the service provides (the builder and its guest, tokens, inferred props) is new.
   */
  async reconnect(): Promise<void> {
    const project = this.project

    // One still opening or reopening has no session yet, and gets its project from that.
    if (!project?.session) {
      return
    }

    const { id, session } = project

    // Closing the project abandons it like an open, so what the service reopens for it is closed again. A reconnect
    // still in flight from an earlier restart is overtaken by this one.
    const earlier = this.attempts.get(id)

    if (earlier) {
      earlier.abandoned = true
    }

    const attempt = this.startAttempt(id)
    attempt.projectId = id
    let opened: string | undefined

    try {
      const info = await request("project.open", { root: id })
      opened = info.id

      if (attempt.abandoned) {
        return this.dropAbandoned(info.id)
      }

      const loaded = await loadGuest(info.guestUrl, info.theme, info.styles?.layer)

      if (attempt.abandoned) {
        return this.dropAbandoned(info.id, info.guestUrl)
      }

      this.endAttempt(attempt, id)
      inferComponents(info, session.components)
      const current = this.held(id)!
      const before = session.info.guestUrl
      this.drawFrom(current, session, info, loaded)

      if (before !== info.guestUrl) {
        releaseGuest(before)
      }
    } catch (error) {
      if (this.failAttempt(attempt, id, opened)) {
        return
      }

      reportError(error, {
        operation: "project.reopen",
        title: "Couldn't reopen the project",
        description: `${session.info.name}: ${plainReason(error) ?? "It didn't answer."}`,
        retry: () => void this.reconnect()
      })
    }
  }

  /**
   * Draws the project with its guest from a new address, once its builder started again on another port. Resolves
   * false when the guest there couldn't be loaded, so the project still draws the old one, or when the project is still
   * loading and draws it from there once it's ready.
   */
  async moveGuest(projectId: string, guestUrl: string): Promise<boolean> {
    const project = this.opened(projectId)

    if (!project?.session) {
      const loading = this.held(projectId)?.status === "loading"

      if (loading) {
        this.moves.set(projectId, guestUrl)
      }

      return !loading
    }

    const before = project.session.info.guestUrl

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
      const loaded = await loadGuest(guestUrl, project.session.info.theme, project.session.info.styles?.layer)
      const current = this.held(project.id)
      const now = current?.session?.info.guestUrl

      // A project closed or reopened meanwhile draws what it has now, and one that moved again draws from there once
      // that guest loads, so the guest loaded here is no one's.
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
        title: "Couldn't reload the project",
        description: `${project.session.info.name}: ${plainReason(error) ?? "Its preview stopped responding."}`,
        retry: () => void this.moveGuest(projectId, guestUrl)
      })

      return false
    }
  }

  /**
   * Gives the project's session new parts. The session stays the same object, so what's kept for it stays; the project
   * is copied so that what reads it from the workspace draws again.
   */
  private updateSession(project: Project, session: ProjectSession, change: Partial<SessionParts>): void {
    session.update(change)
    this.replace(project.id, { ...project })
  }

  /** Draws the project's session from a guest loaded anew, with tokens of its own, letting go of the last guest's. */
  private drawFrom(project: Project, session: ProjectSession, info: ProjectInfo, loaded: LoadedGuest): void {
    const { tokens } = session
    drawImported(info, loaded)
    this.updateSession(project, session, { info, loaded, tokens: tokenStore(info, loaded, session) })
    tokens.dispose()
  }

  /** Draws a project that has just loaded from where its guest moved meanwhile, if it did. */
  private settleMove(id: string): void {
    const guestUrl = this.moves.get(id)

    if (!guestUrl) {
      return
    }

    this.moves.delete(id)
    void this.moveGuest(id, guestUrl)
  }

  /** Saves the project's unsaved changes. */
  async flush(): Promise<void> {
    await this.project?.session?.saver.flush()
  }

  /**
   * Offers to write the project's preview file from the providers its app's entry renders (PAR-104), unless it has one
   * or the offer was turned down before. Written, the file is a detection input, so the project opens again with it.
   */
  private async offerPreviewFile(info: ProjectInfo): Promise<void> {
    if (this.notes[info.root]?.previewOfferClosed) {
      return
    }

    const offer = await request("preview.offer", { projectId: info.id }).catch(() => undefined)

    if (!offer || !this.held(info.id)?.session) {
      return
    }

    offerPreviewFile(
      offer,
      async () => {
        await request("preview.write", { projectId: info.id })
      },
      () => this.changeProjects({ kind: "closedPreviewOffer", root: info.root })
    )
  }

  /** Takes a project off the recent list, or every project when none is given. Starred ones stay starred. */
  forgetRecent(root?: string): void {
    this.changeProjects(root === undefined ? { kind: "forgot" } : { kind: "forgot", root })
  }

  /** Stars a project, so the start page keeps it under Starred, or unstars it. */
  star(root: string, starred: boolean): void {
    this.changeProjects({ kind: "starred", root, starred })
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
    const project = this.held(id)

    if (!project?.session) {
      return
    }

    const { session } = project
    const versions = session.versions ?? {}

    const { add, drop } = guestChanges(
      versionedSources(session.info.sources, versions),
      versionedSources(sources, versions)
    )

    const { guest } = session.loaded
    guest.addComponents?.(add)

    // The guest takes back the ones it was given, as the offscreen renderer does once a job no longer carries them.
    if (drop.length > 0) {
      guest.removeComponents?.(drop)
    }

    const added = { ...session.added, ...add }

    for (const name of drop) {
      delete added[name]
    }

    const info: ProjectInfo = { ...session.info, sources, componentCount: Object.keys(sources).length }

    if (leftOut) {
      info.leftOut = leftOut
    }

    this.updateSession(project, session, { info, added })
  }

  /**
   * Component files whose code changed on disk, or that import a file that did, at `stamp` (PAR-165). Their components
   * load again from a new address, so frames and bitmaps draw the code as it is now, within a moment of a save.
   */
  codeChanged(id: string, paths: readonly string[], stamp: number): void {
    const project = this.held(id)

    if (!project?.session) {
      return
    }

    const { session } = project
    const { sources } = session.info
    const before = session.versions ?? {}
    const versions = codeChangeVersions(sources, paths, stamp, before)
    const { add } = guestChanges(versionedSources(sources, before), versionedSources(sources, versions))

    if (Object.keys(add).length === 0) {
      return
    }

    session.loaded.guest.addComponents?.(add)
    const added = { ...session.added, ...add }
    this.updateSession(project, session, { versions, added })
  }

  setEditor(id: string, editor: Editor | undefined): void {
    const project = this.held(id)

    if (!project?.session || project.session.editor === editor) {
      return
    }

    this.updateSession(project, project.session, { editor })
  }

  /** The project as agents see it, as the one tab they can name. */
  summary(project: Project): TabSummary {
    const summary: TabSummary = {
      id: project.id,
      name: project.title,
      root: project.session?.info.root ?? project.id,
      active: true,
      status: project.status,
      designs: project.session ? containerEntries(project.session.doc).length : 0
    }

    if (project.message && project.status === "error") {
      summary.error = project.message
    }

    return summary
  }

  /** The open project as agents see it, or nothing on Home. */
  summaries(): TabSummary[] {
    return this.project ? [this.summary(this.project)] : []
  }

  /** Moves a loading project on to one of its steps. Its message says that step. */
  private setProgress(id: string, steps: string[], current: number): void {
    const project = this.held(id)

    if (project) {
      this.replace(id, { ...project, progress: { steps, current }, message: `${steps[current]}…` })
    }
  }

  private startAttempt(id: string): Attempt {
    const attempt: Attempt = { abandoned: false }
    this.attempts.set(id, attempt)

    return attempt
  }

  /** Follows an open from its placeholder to the project's id. */
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

  /**
   * Ends an open, reopen or reconnect that failed. Says whether its project closed meanwhile, in which case the project
   * the service opened for it, if it got that far, is closed and the failure is no one's to show.
   */
  private failAttempt(attempt: Attempt, id: string, opened: string | undefined): boolean {
    this.endAttempt(attempt, id)

    if (!attempt.abandoned) {
      return false
    }

    if (opened) {
      this.dropAbandoned(opened)
    }

    return true
  }

  /** Closes the project an abandoned open got, and lets go of its guest, once nothing else could still want it. */
  private dropAbandoned(projectId: string, guestUrl?: string): void {
    this.drops.set(projectId, guestUrl ?? this.drops.get(projectId))
    this.settleDrops()
  }

  /**
   * Closes the projects abandoned opens got. One the window holds again, or has an open in flight for, is that open's:
   * the service gives both opens the same project. While an open in flight hasn't heard which project it is, as one
   * opening the default project or a `.par` file hasn't, the close waits, since it may be the same one.
   */
  private settleDrops(): void {
    if (this.drops.size === 0) {
      return
    }

    const inFlight = [...this.attempts.values()]
    const undecided = inFlight.some((attempt) => attempt.projectId === undefined)

    for (const [projectId, guestUrl] of this.drops) {
      if (this.held(projectId) || inFlight.some((attempt) => attempt.projectId === projectId)) {
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

  /** Puts `project` in place of the one with `id`, when the window holds that one. */
  private replace(id: string, project: Project): void {
    if (!this.held(id)) {
      return
    }

    this.project = project
    this.save()
    this.notify()
  }

  /** Tells main the project, which keeps it in `state.json` for the next window, once this one has claimed one. */
  private save(): void {
    if (!this.keepsProject) {
      return
    }

    const { project } = this
    const kept = project && (project.session || project.status === "loading") && !isPlaceholder(project.id)
    window.canvasHost.state.saveTabs(kept ? { roots: [project.id], active: project.id } : { roots: [] })
  }

  private remember(root: string): void {
    this.changeProjects({ kind: "opened", root })
  }

  /** Changes the recent and starred projects here at once, and in `projects.json` for every copy. */
  private changeProjects(change: ProjectsChange): void {
    this.takeProjects(changeProjectsData({ recent: [...this.recent], notes: { ...this.notes } }, change, Date.now()))
    void window.canvasHost?.projects?.change(change).catch(() => undefined)
  }

  /** Lists the projects as main or this window has them, letting go of pictures of projects no longer listed. */
  private takeProjects({ recent, notes }: Projects): void {
    this.recent = recent
    this.notes = notes
    this.projects = knownProjects(this.recent, this.notes, this.missing)
    // A project's picture goes with it (PAR-607).
    void request("pictures.keepOnly", { roots: this.projects.map(({ root }) => root) }).catch(() => undefined)
    this.notify()
  }

  private notify(): void {
    this.changes.notify()
  }
}

/** Saves a project, or says why it couldn't. Resolves whether it saved. */
async function saveOrSay(session: ProjectSession): Promise<boolean> {
  try {
    await session.saver.flush()

    return true
  } catch (error) {
    reportError(error, {
      operation: "project.save",
      title: "Couldn't save the project",
      id: saveFailureToast(session.id),
      retry: () => void saveOrSay(session)
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
  const { saver } = session
  const id = saveFailureToast(session.id)
  let said = false
  saver.subscribe(() => {
    const state = saver.state()

    if (state.status === "saved" || state.status === "unsaved") {
      if (said) {
        notify.close(id)
      }

      said = false
    }

    if (state.status !== "failed" || said) {
      return
    }

    said = true
    reportError(state.error, {
      operation: "project.autosave",
      title: "Couldn't save the project",
      id,
      retry: () => void saveOrSay(session)
    })
  })
}

/**
 * Loads an opened project's guest and components into a session. `recordLoaded` records how long that and the whole
 * open took (PAR-637), in the open's trace (PAR-711), and whether the window `restored` it as it started (PAR-694);
 * it's for once the window holds the session, so an abandoned open isn't counted as ready.
 */
async function createSession(
  info: ProjectInfo,
  asked: Opening,
  reopen: () => Promise<void>,
  restored = false
): Promise<{ session: ProjectSession; recordLoaded: () => void }> {
  const loading = performance.now()
  const loaded = await loadGuest(info.guestUrl, info.theme, info.styles?.layer)
  const drawn = drawImported(info, loaded)

  const modes = info.modes.settings
  const marks = info.documents.find(({ path }) => path === info.mainDocument)?.document.routeKinds
  const routes = markedRoutes(info.routes, marks)
  const fromCode = [...routePages({ ...info, routes }), ...componentBoardsDocument(info), ...storyScreensDocument(info)]

  // What's stale goes as the project opens: views naming modes, states or params that are gone, and what was kept for
  // designs drawn from code that no longer are. The file loses it at its next save.
  const opening = openingDesigns(info.documents, info.mainDocument, info.sources, modes, routeFiles(info.routes)).map(
    ({ path, document }) => ({
      path,
      document: prunedDocument(document, modes)
    })
  )

  const main = opening.find(({ path }) => path === info.mainDocument)

  const code = openCodeDesigns(fromCode, main?.document.codeDesigns, (path, design) => ({
    modes,
    params: path === routePagesFile ? routeParams(info, design.id) : undefined
  }))

  if (main && !sameValue(code.saved, main.document.codeDesigns)) {
    main.document = { ...main.document, codeDesigns: code.saved }

    if (!code.saved) {
      delete main.document.codeDesigns
    }
  }

  // Internal extensions' window modules start before the document opens, so the one that brings a live room can say
  // how it opens (PAR-1267).
  const modules = await startTabModules(info, { reopen })
  const joined = await joinRoom(modules)

  // The modules stop with the session; one that never opens stops them here.
  const designs: DocSession = withStop(modules, () =>
    openDocSession({
      room: joined?.room,
      files: opening,
      drawn: code.designs,
      modes,
      main: info.mainDocument,
      persistence: {
        // The app's pages and components are drawn from its code each time, so they're never saved (PAR-1076). Its
        // stories are written back to their own files, through the adapter that read them.
        saveDocument: (path, document, { exportMs, fromOthers }) => {
          if (path === storyScreensFile) {
            return request("entities.save", { projectId: info.id, document })
          }

          return generatedFiles.has(path)
            ? Promise.resolve()
            : saveDocument(info.id, path, document, { exportMs, fromOthers, saver: designs.room && designs.saver })
        },
        // The service writes files and has no way to delete one, so a file taken out of the project stays on disk.
        deleteDocument: () => Promise.resolve(),
        // The project's own autosave, when its file sets one, wins over the person's (PAR-1085).
        autosave: (): boolean => withProjectPreferences(getPreferences(), designs.doc.file(designs.doc.main)).autosave,
        keepTrace
      },
      libraryDesigns: info.libraries.flatMap((library) => library.designs ?? [])
    })
  )

  const learnDrawn = keepCodeDesigns(designs.doc, fromCode)
  const components = new ComponentStore()
  inferComponents(info, components)
  sampleBoards(info, designs.doc, components)

  const session = new ProjectSession(
    {
      id: info.id,
      designs,
      components,
      selection: new SelectionStore(),
      recovery: keepRecovery(designs, (copy) => {
        const kept = copy && ownWork(copy)

        return request("recovery.keep", kept ? { projectId: info.id, copy: kept } : { projectId: info.id })
      })
    },
    { info, loaded, tokens: tokenStore(info, loaded, designs), added: drawn }
  )

  modules.opened(session, joined?.document())
  session.untilClosed(() => modules.stop())
  sayWhenSavesFail(session)
  followCorrections(session)
  followRouteMarks(session, marks, learnDrawn)
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
 * How the project opens, as the extension that brings a live room says through `parity.sync`: on Loro, from files or on
 * another copy's snapshot. Nothing when no extension brings one, or when it failed, so the project opens as it would
 * alone. Loro loads only then.
 */
async function joinRoom(
  modules: TabModules
): Promise<{ room: RoomOpening; document: () => { sync: SyncDocument; lineage: string } | undefined } | undefined> {
  const opening = await modules.opening()

  if (!opening) {
    return undefined
  }

  const loro = await import("@parity-app/multiplayer-loro")
  let backend: LoroBackend | undefined
  const snapshot = opening.from === "snapshot" ? opening.snapshot : undefined

  return {
    room: {
      provider: {
        name: loro.loroProvider.name,
        sync: true,
        open(options) {
          backend = loro.openLoro(options, snapshot)

          return backend
        }
      },
      // Opened from files, this copy starts the room and writes them; on a snapshot, the host does.
      writesFiles: opening.from === "files"
    },
    document: () => backend && { sync: loroSync(backend), lineage: opening.lineage }
  }
}

/** What `open` gives, stopping the tab's window modules when it throws. */
function withStop<T>(modules: TabModules, open: () => T): T {
  try {
    return open()
  } catch (error) {
    modules.stop()
    throw error
  }
}

/** A Loro document as `parity.sync` reads and writes it. */
function loroSync(backend: LoroBackend): SyncDocument {
  return {
    receive(bytes) {
      backend.receive(bytes)

      return { pending: backend.pending() }
    },
    version: () => backend.versionVector(),
    changesSince: (version) => backend.updates(version),
    snapshot: () => backend.snapshot(),
    onLocalChanges: (listener) => backend.subscribeLocalUpdates(listener)
  }
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
  const { doc } = session
  const corrections = () => doc.file(doc.main)?.detection
  let sent = corrections()
  doc.subscribe(() => {
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

/**
 * Draws the app's pages again when the person's marks on its routes change, by an edit, an undo or the file changing on
 * disk (PAR-1175, PAR-1176): a page marked as an API route leaves the canvas, and an API route marked as a page joins it.
 */
function followRouteMarks(
  session: ProjectSession,
  opened: CanvasDocument["routeKinds"],
  learnDrawn: (drawn: readonly { path: string; document: CanvasDocument }[]) => void
): void {
  const { doc, info } = session
  let drawn = opened

  doc.subscribe(() => {
    const marks = doc.file(doc.main)?.routeKinds

    if (sameValue(marks, drawn)) {
      return
    }

    drawn = marks

    const pages = withCodeDesigns(
      routePages({ ...info, routes: markedRoutes(info.routes, marks) }),
      doc.file(doc.main)?.codeDesigns
    )

    learnDrawn(pages)
    applyDocuments(doc, "Draw the pages again", pages, { origin: "code" })
  })
}

/**
 * What of a recovery copy is the person's own work: the pages, component boards and stories are drawn from the
 * project's code each time it opens, so moving one leaves nothing to restore. Undefined when nothing's left.
 */
/** The design files drawn from the project's code each time it opens, which are never saved. */
const generatedFiles = new Set([routePagesFile, componentBoardsFile, storyScreensFile])

function ownWork(copy: RecoveryCopy): RecoveryCopy | undefined {
  const documents = copy.documents.filter(({ path }) => !generatedFiles.has(path))

  return documents.length > 0 || copy.modes || copy.tokens.length > 0 ? { ...copy, documents } : undefined
}

/**
 * Redraws the component boards with a sample for each prop once the service has said what each takes, and each inside
 * the parents it's found to need, as a change that's neither undone nor saved. Only a board drawn differently changes
 * (`redrawnBoards`): the rest keep what's been read inside them and their size, so nothing they show draws again.
 */
function sampleBoards(info: ProjectInfo, doc: ProjectDoc, components: ComponentStore): void {
  const parents = new Map<string, BoardParents>()

  const designs = (drawn: ReturnType<typeof componentBoardsDocument>) =>
    new Map((drawn[0]?.document.containers ?? []).map((board) => [board.id, board]))

  // What was drawn last, as the document began with.
  let before = designs(componentBoardsDocument(info))

  const draw = () => {
    const chains = Object.fromEntries([...parents].map(([component, state]) => [component, state.chain]))
    const drawn = componentBoardsDocument(info, components.get(), chains)
    const [boards] = drawn

    if (!boards) {
      return
    }

    const current = new Map(
      boards.document.containers.flatMap((board) => {
        const now = doc.design(`${boards.path}#${board.id}`)

        return now ? [[board.id, now] as const] : []
      })
    )

    const containers = redrawnBoards(boards.document.containers, before, current)
    before = designs(drawn)

    if (containers.every((board) => board === current.get(board.id))) {
      return
    }

    changeSnapshot(
      doc,
      "Draw components",
      (snapshot) => ({
        ...snapshot,
        documents: new Map(snapshot.documents).set(boards.path, { ...boards.document, containers })
      }),
      { origin: "code" }
    )
  }

  components.subscribe(draw)
  searchBoardParents(info, doc, parents, draw)
}

/**
 * Finds what each of the project's own parts needs around it to draw (`nextBoardParents`): each time a board's part
 * fails for want of a parent, its board is drawn again inside the next parents to try, until it draws or nothing's left.
 * A report about layers the board no longer has, from before it was drawn again, is left alone.
 */
function searchBoardParents(
  info: ProjectInfo,
  doc: ProjectDoc,
  parents: Map<string, BoardParents>,
  draw: () => void
): void {
  const groups = new Map(
    boardGroups(info.sources, routeFiles(info.routes)).flatMap(({ ids }) => ids.map((id) => [id, ids]))
  )

  const prefix = `${componentBoardsFile}#`

  const step = (design: string, failures: readonly LayerFailure[]) => {
    const board = design.startsWith(prefix) ? doc.design(design) : undefined
    const part = board && boardComponentNode(board)
    const group = part && groups.get(part.component)

    if (!board || !part || !group) {
      return
    }

    const state = parents.get(part.component) ?? noBoardParents
    const [first] = failures

    if (state.done || (first && !findNode(board.root, first.nodeId))) {
      return
    }

    // Nothing failing isn't enough: a parent can hide what's in it, as an inactive TabsContent does.
    const failure = first ? { component: first.component, error: first.error } : drawsPart(part.id) || "nothing"
    const next = nextBoardParents(part.component, group, state, failure === true ? undefined : failure)
    parents.set(part.component, next)

    if (next.chain.join() === state.chain.join()) {
      return
    }

    draw()

    // The canvas tells only when what fails changes, so a chain that draws as the last one did is looked at once drawn.
    // A board far from view is a picture, with nothing of it on the page, so it's left until it's drawn live.
    setTimeout(() => {
      const outer = doc.design(design)?.root
      const drawn = outer?.type === "layout" && outer.children[0] && drawsPart(outer.children[0].id)

      if (parents.get(part.component) === next && drawn) {
        step(design, designFailuresNow(info.id, design))
      }
    }, recheckAfter)
  }

  onDesignFailures(info.id, step)
}

/** How long a board's drawn again before what it draws is looked at, if the canvas hasn't said. */
const recheckAfter = 1500

/** Whether a layer is drawn on the canvas, in any frame. */
function drawsPart(nodeId: string): boolean {
  const selector = `[data-canvas-node="${CSS.escape(nodeId)}"]`

  return [...document.querySelectorAll("[data-frame]")].some(
    (frame) => (frame.shadowRoot ?? frame).querySelector(selector) !== null
  )
}

/** Fills in each component's props once the service has inferred them, after the project opens. */
function inferComponents(info: ProjectInfo, components: ComponentStore): void {
  request("project.components", { projectId: info.id })
    .then((inferred) => components.set(inferred))
    .catch((cause: unknown) => console.warn("Component props couldn't be inferred", cause))
}

/** Writes a design file, recording how long it took, how big it was, and what of it came from others in a live room. */
async function saveDocument(
  projectId: string,
  path: string,
  document: CanvasDocument,
  { exportMs, fromOthers, saver }: { exportMs: number; fromOthers: number; saver: DocSession["saver"] | undefined }
): Promise<void> {
  const start = performance.now()
  const bytes = JSON.stringify(document).length
  const measured = () => ({ file: path, durationMs: Math.round(performance.now() - start), bytes })
  // In the trace the write was asked in, the edit's or Save's, which has moved on by the time the service answers.
  const inTrace = { span: currentTraceContext() }

  try {
    await request("document.save", { projectId, path, document })
    track("document.saved", saver ? { ...measured(), exportMs, fromOthers } : { ...measured(), exportMs }, inTrace)
  } catch (error) {
    const failed: Attributes<"document.saveFailed"> = saver
      ? { ...measured(), inRoom: true, writesFiles: saver.writesFiles() }
      : measured()

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

/**
 * Gives the guest the code the project's imported screens draw that isn't one of its components, as a story's `render`
 * function, and gives it back for offscreen renders to add to theirs.
 */
function drawImported(info: ProjectInfo, loaded: LoadedGuest): Record<string, GuestComponentSource> | undefined {
  const sources = info.entities.sources

  if (!sources || Object.keys(sources).length === 0) {
    return undefined
  }

  loaded.guest.addComponents?.(sources)

  return sources
}

function tokenStore(info: ProjectInfo, loaded: LoadedGuest, designs: DocSession): TokenStore {
  return new TokenStore(
    loaded.tokens,
    loaded.sheet,
    async (changes) => {
      await saveTokens(info.id, changes)
    },
    designs,
    info.styles?.stylesheet,
    info.describedTokens
  )
}

function basename(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path
}

export const workspace = new Workspace()

/** The project the window holds, or undefined while it shows Home. */
export function useProject(): Project | undefined {
  return useSyncExternalStore(workspace.subscribe, workspace.getProject)
}

/** The extension's page shown in the project's place, if one is. */
export function usePage(): (ExtensionPage & { title: string }) | undefined {
  return useSyncExternalStore(workspace.subscribe, workspace.getPage)
}

export function useRecentProjects(): readonly string[] {
  return useSyncExternalStore(workspace.subscribe, workspace.getRecent)
}

export function useKnownProjects(): readonly KnownProject[] {
  return useSyncExternalStore(workspace.subscribe, workspace.getProjects)
}

/** The example project's folder, when this copy of Parity has it (PAR-188). */
export function useExampleFolder(): string | undefined {
  return useSyncExternalStore(workspace.subscribe, workspace.getExample)
}
