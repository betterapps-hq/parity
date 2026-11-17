import type { IconNames, IconSet } from "@parity-app/agent"
import { activeTab, matchTab } from "@parity-app/agent/routing"
import { type ChangeConflict, CodedError, errorDetails, type LibraryInfo, unknownReference } from "@parity-app/core"
import { extensionsSnapshot } from "@parity-app/extension-host/window-snapshot"
import { applyAgentChanges, applyOperations, containerEntries } from "@parity-app/multiplayer"
import type {
  AgentChanges,
  ServeAnswer,
  TabSnapshot,
  TabSummary,
  WindowMethod,
  WindowMethods
} from "../../shared/protocol.ts"
import { canvasIdFor } from "../canvas/CanvasEditor.tsx"
import { askChangesAgain } from "../canvas/frame-changes.ts"
import { pageFilesChanged } from "../canvas/page-changes.ts"
import { announceEdit } from "../chrome/project-edits.tsx"
import { answerExtension } from "../extension-ui.ts"
import { revealView } from "../extension-views.ts"
import { extensionsOf, isEditorRequest } from "../extensions.ts"
import { editStatusOf, problemMessage, reloadFile, revisionOf } from "../project-doc.ts"
import { clearProjectExtensionSetting, setProjectExtensionSetting } from "../project-settings.ts"
import { reportIds } from "../replay.ts"
import { track } from "../report-error.ts"
import { notify } from "../toasts.tsx"
import { runWindowCommand, windowModulesFor } from "../window-modules.ts"
import { type Project, type ProjectSession, workspace } from "../workspace.ts"
import { presence } from "./presence.ts"

/**
 * Answers the project service when an agent (the CLI or MCP) works on a tab. Agents read a snapshot, compute their
 * changes in the service, and apply them here as one undoable step, so people see them land and can undo them.
 */
export function serveAgents(): void {
  // When the person last used this copy, which `--tab active` and calls without a tab are routed by (PAR-514). A window
  // that opens with focus has been used since it opened.
  if (document.hasFocus()) {
    focusedAt = Date.now()
  }

  window.addEventListener("focus", () => {
    focusedAt = Date.now()
  })
  window.canvasHost.serve((method, params) => settle(() => answer(method, params)))
}

let focusedAt: number | undefined

/** An answer as data, since only a failure's message would cross the bridge to the preload script. */
async function settle(run: () => Promise<WindowResult>): Promise<ServeAnswer> {
  try {
    return { result: await run() }
  } catch (error) {
    const failure: ServeAnswer = { error: error instanceof Error ? error.message : String(error) }
    const details = errorDetails(error)

    if (details) {
      failure.details = details
    }

    return failure
  }
}

type WindowResult = WindowMethods[WindowMethod]["result"]

type WindowParams = WindowMethods[WindowMethod]["params"]

type Handlers = {
  [M in WindowMethod]: (
    params: WindowMethods[M]["params"]
  ) => WindowMethods[M]["result"] | Promise<WindowMethods[M]["result"]>
}

/**
 * Each request the project service sends, by method. An agent's params were checked against their schema in
 * `@parity-app/agent/contracts` before the service sent them (PAR-598), and the service makes the rest itself, so
 * they're read here as typed, with no second check.
 */
const handlers: Handlers = {
  "agent.tabs": () => workspace.summaries(),
  "agent.copy": () => {
    const copy: WindowMethods["agent.copy"]["result"] = { tabs: workspace.summaries() }

    if (focusedAt !== undefined) {
      copy.focusedAt = focusedAt
    }

    return copy
  },
  "agent.open": async ({ root }) => {
    const before = workspace.getProject()
    const project = await workspace.open(root)

    // It opens in place of the window's project, which the person was asked to save first, and chose to keep.
    if (!project) {
      throw new CodedError(`${before?.title ?? "The open project"} has unsaved changes, and the person kept it open`, {
        code: "app_error"
      })
    }

    // A project already open is detected again when what detection reads changed since (PAR-820).
    await workspace.detectAgain(project.id)

    return workspace.summary(workspace.getProject() ?? project)
  },
  "agent.snapshot": ({ tab }) => snapshot(tab),
  "agent.status": ({ tab: reference, ...options }) => {
    const tab = findTab(reference)

    return { tab: summary(tab), ...editStatusOf(ready(tab), options) }
  },
  "agent.iconNames": (params) => iconNames(params),
  "agent.supports": (queries) => queries.map(({ property, value }) => CSS.supports(property, value)),
  "agent.reportIds": () => reportIds(),
  "agent.apply": (changes) => apply(changes),
  "agent.presence": (events) => {
    presence.push(events)

    return undefined
  },
  "project.componentsChanged": ({ projectId, components, sources, leftOut }) => {
    const session = sessionOf(projectId)

    if (sources && session) {
      workspace.setSources(session.id, sources, leftOut)
    }

    session?.components.set(components)

    return undefined
  },
  "project.codeChanged": ({ projectId, paths, stamp }) => {
    if (sessionOf(projectId)) {
      workspace.codeChanged(projectId, paths, stamp)
    }

    return undefined
  },
  "project.filesChanged": ({ projectId, paths }) => {
    if (sessionOf(projectId)) {
      pageFilesChanged(projectId, paths)
    }

    return undefined
  },
  "project.detectionChanged": ({ projectId }) => {
    workspace.detectionChanged(projectId)

    return undefined
  },
  "project.committed": ({ projectId }) => {
    askChangesAgain(projectId)

    return undefined
  },
  "extensions.changed": ({ projectId, extensions }) => {
    const session = sessionOf(projectId)

    if (session) {
      extensionsOf(session).changed(extensions)
    }

    return undefined
  },
  "extensions.logged": ({ projectId, extension, line }) => {
    const session = sessionOf(projectId)

    if (session) {
      extensionsOf(session).logged(extension, line)
    }

    return undefined
  },
  // What `parity extensions` adds of the tab's window modules (PAR-1284), as `extensions.json` has them.
  "extensions.facts": ({ projectId }) => {
    const modules = windowModulesFor({ id: projectId })
    const [tab] = modules ? extensionsSnapshot([modules]).tabs : []

    return tab ? { tab } : {}
  },
  "extensions.reveal": ({ projectId, extension, view }) => {
    const session = sessionOf(projectId)

    if (session) {
      revealView(session, extension, view)
    }

    return undefined
  },
  "extensions.ui": async (asked) => {
    const session = sessionOf(asked.projectId)

    // Selecting, navigating and running Parity's commands need the project's tab.
    if (isEditorRequest(asked)) {
      if (!session) {
        throw new Error(`No tab has project ${asked.projectId} open`)
      }

      // It reaches into the canvas and the panels, so it loads with the first such request.
      const { answerEditor } = await import("../extension-editor.ts")

      return answerEditor(session, asked)
    }

    const name =
      (session &&
        extensionsOf(session)
          .store.get()
          .extensions.find((extension) => extension.id === asked.extension)?.displayName) ??
      asked.extension

    return answerExtension(name, asked)
  },
  "extensions.windowCall": async ({ projectId, extension, method, args }) => {
    const session = sessionOf(projectId)
    const modules = session && windowModulesFor(session)

    if (!modules) {
      throw new Error(`No tab has project ${projectId} open with window modules`)
    }

    const result = await modules.callFromNode(extension, method, args)

    return result === undefined ? {} : { result }
  },
  "extensions.windowRun": async ({ projectId, command, target, call }) => {
    const session = sessionOf(projectId)

    return session ? runWindowCommand(session, command, target, call) : { handled: false }
  },
  "extensions.transact": ({ projectId, label, operations }) => {
    const session = sessionOf(projectId)

    if (!session) {
      throw new Error("The project isn't open in this window")
    }

    const applied = applyOperations(session.doc, label, operations)

    // The extension gets the problem as the call's error.
    if (!applied.ok) {
      throw new Error(problemMessage(applied.problem))
    }

    return undefined
  },
  "extensions.edited": ({ projectId, edit }) => {
    announceEdit(projectId, edit)

    return undefined
  },
  "extensions.setting": ({ projectId, extension, key, value }) => {
    const doc = sessionOf(projectId)?.doc

    if (!doc) {
      throw new Error(`No project ${projectId} is open in this window`)
    }

    if (value === undefined) {
      clearProjectExtensionSetting(extension, key, doc)
    } else {
      setProjectExtensionSetting(extension, key, value, doc)
    }

    return undefined
  },
  "project.guestMoved": async ({ projectId, guestUrl }) => {
    // A tab that couldn't load it says so, and the service tries again when the builder is started again.
    if (!(await workspace.moveGuest(projectId, guestUrl))) {
      throw new Error(`The guest at ${guestUrl} didn't load`)
    }

    return undefined
  },
  "project.fileChanged": ({ projectId, path, document }) => {
    const session = sessionOf(projectId)

    // Unsaved changes here win until the person says otherwise.
    if (session && !reloadFile(session, path, document)) {
      track("document.conflicted", { file: path })
      notify.warning("A file changed outside Parity", {
        description: `Reload ${path.split(/[\\/]/).at(-1)} to get its changes, or save to keep yours.`,
        timeout: 15_000,
        action: {
          label: "Reload",
          run: () => {
            reloadFile(session, path, document, true)
            track("document.loadedFromDisk", { file: path })
          }
        }
      })
    }

    return undefined
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC: the service's params cross the bridge untyped, checked against their schema before it sent them
async function answer(method: WindowMethod, params: unknown): Promise<WindowResult> {
  // SAFETY: the bridge carries each method with its own params, which the service checked against that method's
  // schema (PAR-598); the map can't see that from `method` alone.
  const handler = handlers[method] as (params: WindowParams) => WindowResult | Promise<WindowResult>

  // SAFETY: as above, these are this method's params.
  return handler(params as WindowParams)
}

/**
 * The window's project, as the one tab agents can name: by id, root or name, as the CLI matches one when it routes a
 * call, or `active`, or none.
 */
function findTab(reference: string | undefined): Project {
  const project = workspace.getProject()
  const named = reference && reference !== activeTab ? reference : undefined

  if (!project) {
    throw new CodedError("No project is open", { code: "unknown_tab", field: "tab" })
  }

  if (named && !matchTab(workspace.summaries(), named)) {
    throw unknownReference(
      "unknown_tab",
      `No open tab matches "${named}". Tabs: ${project.id}`,
      named,
      [project.id],
      "tab"
    )
  }

  return project
}

function ready(tab: Project): ProjectSession {
  if (!tab.session) {
    const broken = tab.status === "error"
    throw new CodedError(`${tab.title} is ${broken ? `broken: ${tab.message}` : "still opening"}`, {
      code: "tab_not_ready",
      retryable: !broken
    })
  }

  return tab.session
}

function summary(tab: Project): TabSummary {
  return workspace.summary(tab)
}

function snapshot(reference: string | undefined): TabSnapshot {
  const tab = findTab(reference)
  const session = ready(tab)
  const current = session.selection.get()
  const editor = session.editor
  const bounds = editor?.getViewportPageBounds()
  const boards: TabSnapshot["bounds"] = {}

  for (const entry of containerEntries(session.doc)) {
    const box = editor?.getShapePageBounds(canvasIdFor(entry.key))

    if (box) {
      boards[entry.key] = { x: box.x, y: box.y, width: box.width, height: box.height }
    }
  }

  const answer: TabSnapshot = {
    tab: summary(tab),
    revision: revisionOf(session),
    projectId: session.id,
    guestUrl: session.info.guestUrl,
    ...(session.info.builder.console && { builderConsole: session.info.builder.console }),
    // The guest keeps components whose files were deleted since it loaded; they aren't the project's any more.
    components: session.loaded.guest.components.filter((name) => name in session.info.sources),
    sources: session.info.sources,
    iconSets: session.info.libraries.filter((library) => library.kind === "icons").map(iconSet),
    tokens: session.tokens.get(),
    theme: session.info.theme,
    ...(session.info.styles?.layer && { layer: session.info.styles.layer }),
    modes: session.doc.modes(),
    documents: [...session.doc.files()].map(([path, document]) => ({ path, document })),
    // The same library and token values the canvas draws with, so agents' frames match it.
    libraryDesigns: [...session.libraryDesigns],
    tokenOverrides: [...session.tokens.previews()],
    mainDocument: session.doc.main,
    props: session.components.get(),
    selection: { design: current.design ?? current.note, node: current.node, mode: current.mode },
    viewport: {
      x: Math.round(bounds?.x ?? 0),
      y: Math.round(bounds?.y ?? 0),
      width: Math.round(bounds?.width ?? 0),
      height: Math.round(bounds?.height ?? 0),
      zoom: editor?.getZoomLevel() ?? 1
    },
    bounds: boards,
    detection: session.info.detection
  }

  if (session.added) {
    answer.addedComponents = session.added
  }

  if (session.info.leftOut) {
    answer.leftOut = session.info.leftOut
  }

  if (session.loaded.guest.renderStatus) {
    answer.renderStatus = session.loaded.guest.renderStatus.get()
  }

  return answer
}

/** An icon set as agents read it, without its tags, which can run to thousands of lines and only `iconNames` needs. */
function iconSet({ id, name, package: packageName, version, icons }: LibraryInfo): IconSet {
  const set: IconSet = { id, name, package: packageName }

  if (version) {
    set.version = version
  }

  if (!icons) {
    return set
  }

  const described = { ...icons }
  delete described.tags

  return { ...set, icons: described }
}

/** The names an icon set exports in one style's module, as the tab's guest loaded them, with the set's tags. */
function iconNames({ tab, set, module }: WindowMethods["agent.iconNames"]["params"]): IconNames {
  const session = ready(findTab(tab))
  const library = session.info.libraries.find((candidate) => candidate.kind === "icons" && candidate.id === set)

  if (!library) {
    throw new Error(`"${set}" isn't one of the project's icon sets`)
  }

  const { guest } = session.loaded

  const names: IconNames = {
    names: guest.iconNames?.(set, module) ?? [],
    aliases: guest.iconAliases?.(set, module) ?? {}
  }

  if (library.icons?.tags) {
    names.tags = library.icons.tags
  }

  return names
}

/**
 * An agent's call is one undoable step, its designs and tokens together, saved when the project is. It's merged with
 * what changed here since the agent's snapshot, or refused, changing nothing, when the two overlap.
 */
async function apply(changes: AgentChanges): Promise<ChangeConflict[]> {
  const session = ready(findTab(changes.tab))
  const tokens = session.tokens.edits(changes.tokens ?? [])

  return applyAgentChanges(session.doc, changes.label, changes.designs, changes.modes, tokens, changes.references)
    .conflicts
}

/** The window's project's session, when it's this project. */
function sessionOf(projectId: string): ProjectSession | undefined {
  const session = workspace.getProject()?.session

  return session?.id === projectId ? session : undefined
}
