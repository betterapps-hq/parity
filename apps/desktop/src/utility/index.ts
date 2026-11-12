import { portFree, viteBuilder } from "@parity-app/builder-vite"
import { type Channel, type Handlers, nodePort } from "@parity-app/channel"
import { parseInput } from "@parity-app/core"
import { reactRenderer } from "@parity-app/renderer-react"
import { tailwindStyles } from "@parity-app/styles-tailwind"
import { errorCode } from "@parity-app/telemetry"
import type { MessagePortMain } from "electron"
import { z } from "zod"
import type { ServiceMethods, WindowMethods } from "../shared/protocol.ts"
import { storedJobs } from "../shared/service-checks.ts"
import type { ConnectMessage } from "../shared/service.ts"
import {
  type AgentImages,
  checkAccessibility,
  exportDesigns,
  exportLayers,
  layersPicture,
  startAgentServer
} from "./agent.ts"
import { clearBitmaps, storeBitmap, storedBitmap, sweepBitmaps } from "./bitmap-store.ts"
import { builderReadings, startBuilder } from "./builders.ts"
import { cacheUse, reportCacheUse } from "./cache-use.ts"
import { readProjectFile } from "./code.ts"
import { saveDetection, savedDetection } from "./detection-cache.ts"
import { undoProjectEdit } from "./edits.ts"
import { projectEnvSecrets } from "./env-secrets.ts"
import { environment } from "./environment.ts"
import type { Attributes } from "./event-attributes.ts"
import { frameTraces } from "./frame-traces.ts"
import { importImage, removeImage, saveImageFrom, scanImages } from "./images.ts"
import { addLibrary, catalogFor, importStyles } from "./libraries.ts"
import { mainProcess } from "./main-process.ts"
import { keepOnlyPictures, readPictures, storePicture } from "./pictures.ts"
import { componentPreviews } from "./previews.ts"
import { freePort } from "./process-manager.ts"
import { dismissProcess, listProcesses, restartProcess, stopProcess } from "./processes.ts"
import { openProjects, saveDocumentCopy } from "./projects.ts"
import { checker } from "./props.ts"
import { createRecovery } from "./recovery.ts"
import { renderOffscreen } from "./render.ts"
import { startReopening } from "./reopening.ts"
import { checkStartFolders } from "./start-folders.ts"
import { telemetry } from "./start-telemetry.ts"
import { openStorybook } from "./storybook.ts"
import { useProjectSecrets } from "./telemetry.ts"
import { losslessWebp } from "./webp.ts"
import { windowChannel, windowClosed } from "./window-channel.ts"

// Dependencies such as Rollup probe process.execPath. In an installed app that is Parity.exe, so their children
// must inherit Node mode; otherwise a platform probe launches another app and overwrites agent discovery.
process.env.ELECTRON_RUN_AS_NODE = "1"

let editor: Channel<ServiceMethods, WindowMethods> | undefined

const projects = openProjects({
  renderers: [reactRenderer],
  builders: [viteBuilder],
  styles: [tailwindStyles],
  startBuilder,
  checker,
  detections: { saved: savedDetection, save: saveDetection },
  ports: { free: freePort, isFree: portFree },
  unsupported: (reason, detail) => telemetry.track("project.unsupported", { reason, detail }),
  listeners: {
    fileChanged: (change) => {
      editor?.request("project.fileChanged", change).catch(() => undefined)
    },
    componentsChanged: (change) => {
      editor?.request("project.componentsChanged", change).catch(() => undefined)
    },
    codeChanged: (change) => {
      editor?.request("project.codeChanged", change).catch(() => undefined)
    },
    detectionChanged: (change) => {
      editor?.request("project.detectionChanged", change).catch(() => undefined)
    },
    guestMoved: (change) =>
      editor
        ? editor.request("project.guestMoved", change).then(
            () => true,
            () => false
          )
        : Promise.resolve(false)
  }
})

const previews = componentPreviews(projects)
const traces = frameTraces(projects)

// The projects open when the service last ran open again as it starts, before the window asks for them (PAR-179).
const reopening = startReopening({
  file: environment().PARITY_REOPEN_FILE,
  open: async (root) => {
    await projects.open(root, { reopen: true }).finally(rememberOpen)
  },
  close: (root) => projects.close(root).finally(rememberOpen)
})

// Projects' unsaved changes, kept in case Parity closes before they're saved (PAR-905).
const recovery = createRecovery(environment().PARITY_RECOVERY_DIR)

let secretsRead = 0

function rememberOpen(): void {
  const roots = projects.roots()
  reopening.remember(roots)
  // The open projects' `.env` values are scrubbed from telemetry in every process (PAR-672). A later open or close
  // reads them again, so only the latest read is used.
  const reading = ++secretsRead
  void projectEnvSecrets(roots).then((secrets) => {
    if (reading === secretsRead) {
      useProjectSecrets(secrets)
    }
  })
}

const handlers: Handlers<ServiceMethods> = {
  "project.open": ({ root }) => {
    const projectRoot = projects.rootFor(root)
    reopening.claim(projectRoot)

    return projects.open(projectRoot).finally(rememberOpen)
  },
  "project.close": ({ projectId }) => projects.close(projectId).finally(rememberOpen),
  "project.detectAgain": ({ projectId }) => projects.detectAgain(projectId),
  "document.save": projects.saveDocument,
  "recovery.keep": ({ projectId, copy }) => recovery.keep(projectId, copy),
  "recovery.read": ({ projectId }) => recovery.read(projectId),
  "document.saveCopy": saveDocumentCopy,
  "images.import": (params) => importImage(projects.get(params.projectId), params),
  "images.scan": ({ projectId }) => scanImages(projects.get(projectId)),
  "images.saveFrom": ({ projectId, url, name }) => saveImageFrom(projects.get(projectId), { url, name }, fetch),
  "images.remove": ({ projectId, path }) => removeImage(projects.get(projectId), path),
  "project.undoEdit": ({ projectId, id }) => undoProjectEdit(projects.get(projectId), id),
  "storybook.open": (params) => openStorybook(projects.get(params.projectId), params),
  "designs.export": (params) => exportDesigns(editorWindow(), params),
  "layers.export": (params) => exportLayers(editorWindow(), params),
  "layers.picture": (params) => layersPicture(editorWindow(), params),
  "frames.capture": async ({ job, height }) => {
    // Taken before the capture, so a file changed meanwhile leaves the bitmap stale rather than current (PAR-994).
    const trace = await traces.trace(job).catch(() => undefined)
    const { frame, png } = await renderOffscreen(job, true)

    if (frame.error || !png) {
      return {}
    }

    // The height kept with it, which a frame that hasn't drawn its design takes when it shows the bitmap (PAR-525): the
    // live frame's, or else the offscreen window's, measured at full size as the canvas lays it out.
    const kept = height ?? frame.canvasHeight ?? frame.height
    // Kept and shown as a lossless WebP (PAR-535); where sharp can't load, the PNG shows and nothing's kept.
    const webp = await losslessWebp(Buffer.from(png, "base64")).catch(() => undefined)

    if (!webp) {
      return { src: `data:image/png;base64,${png}`, height: kept }
    }

    const served = projects.codeServedAt(job.projectId, job.guestUrl)

    if (served) {
      void storeBitmap(served, job, webp, kept, trace)
    }

    return { src: `data:image/webp;base64,${webp.toString("base64")}`, height: kept }
  },
  "frames.stored": async ({ jobs }) => ({
    kept: await Promise.all(
      parseInput(storedJobs, jobs).map(async (job) => {
        const served = projects.codeServedAt(job.projectId, job.guestUrl)
        const kept = served && (await storedBitmap(served, job, (trace) => traces.holds(job, trace)))

        if (served) {
          cacheUse.frame(kept !== undefined && !kept.stale)
        }

        if (!kept) {
          return {}
        }

        const answer = { src: `data:image/webp;base64,${kept.webp}`, height: kept.height }

        return kept.stale ? { ...answer, stale: true as const } : answer
      })
    )
  }),
  "frames.clearStored": clearBitmaps,
  "pictures.store": ({ root, picture }) => storePicture(root, picture),
  "pictures.read": ({ roots }) => readPictures(roots),
  "pictures.keepOnly": ({ roots }) => keepOnlyPictures(roots),
  "start.check": ({ roots }) => checkStartFolders(roots),
  "previews.lookup": async (params) => ({ previews: await previews.lookupPreviews(params.previews) }),
  "previews.make": ({ preview, priority }) => previews.makePreview(preview, priority),
  "accessibility.check": (params) => checkAccessibility(editorWindow(), params),
  "code.read": ({ projectId, path }) => readProjectFile(projects.get(projectId).info.root, path),
  "project.components": ({ projectId }) => projects.components(projectId),
  "project.correctComponents": projects.correctComponents,
  "library.catalog": ({ projectId }) => catalogFor(projects.get(projectId)),
  "library.add": (params) => addLibrary(projects.get(params.projectId), params),
  "library.importStyles": (params) => importStyles(projects.get(params.projectId), params),
  "tokens.save": projects.saveTokens,
  "styles.classes": projects.frameClasses,
  "processes.list": listProcesses,
  "processes.stop": stopProcess,
  "processes.restart": restartProcess,
  "processes.dismiss": dismissProcess
}

/** A connected editor window. Agents act through it, since it holds the live state. */
export interface WindowChannel {
  request<M extends keyof WindowMethods>(
    method: M,
    params: WindowMethods[M]["params"]
  ): Promise<WindowMethods[M]["result"]>
}

export function editorWindow(): WindowChannel {
  if (!editor) {
    throw new Error("The canvas window isn't open")
  }

  return editor
}

/**
 * Answers a window over its own port, and makes it the window agents act through. Project code shares the window's
 * page, so every request's params are checked before a handler sees them (PAR-565).
 */
function connect(port: MessagePortMain): void {
  const channel = windowChannel(handlers, nodePort(port, { wrapped: true }))
  port.on("close", () => {
    if (editor === channel) {
      editor = undefined
    }

    channel.close(windowClosed())
  })
  editor = channel
}

/** Main's message handing the service the editor window's port. */
const connectMessage: z.ZodType<ConnectMessage> = z.object({ type: z.literal("connect") })

process.parentPort.on("message", (event: { data: unknown; ports: MessagePortMain[] }) => {
  if (!connectMessage.safeParse(event.data).success) {
    return
  }

  const [port] = event.ports

  if (port) {
    connect(port)
  }
})

mainProcess.serve({ builders: () => builderReadings() })

mainProcess.connect(nodePort(process.parentPort, { wrapped: true }))

// Kept bitmaps past their limits go when the service starts, so a session never begins over them.
void sweepBitmaps()

reportCacheUse()

const agentImages: AgentImages = {
  scanImages: (projectId) => scanImages(projects.get(projectId)),
  async removeImage(projectId, path) {
    const removed = await removeImage(projects.get(projectId), path)

    return { path: removed.path, label: removed.edit.label }
  },
  saveImage: async (projectId, image) => saveImageFrom(projects.get(projectId), image, fetch)
}

void startAgentServer(editorWindow, agentImages).catch((cause: unknown) => {
  console.error("[service] agent server failed to start", cause)
  const code = errorCode(cause)
  const failed: Attributes<"agent.serverFailed"> = { message: cause instanceof Error ? cause.message : String(cause) }

  if (code !== undefined) {
    failed.code = code
  }

  telemetry.track("agent.serverFailed", failed)
})
