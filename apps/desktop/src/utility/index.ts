import { type Channel, createChannel, type Handlers, nodePort } from "@parity-app/channel"
import type { MessagePortMain } from "electron"
import { codedErrors } from "../shared/coded-errors.ts"
import type { ServiceMethods, WindowMethods } from "../shared/protocol.ts"
import { serviceChecks, unknownServiceMethod } from "../shared/service-checks.ts"
import type { ConnectMessage } from "../shared/service.ts"
import { checkAccessibility, exportDesigns, startAgentServer } from "./agent.ts"
import { clearBitmaps, storeBitmap, storedBitmap, sweepBitmaps } from "./bitmap-store.ts"
import { builderReadings } from "./builders.ts"
import { undoProjectEdit } from "./edits.ts"
import { importImage } from "./images.ts"
import { addLibrary, catalogFor, importStyles } from "./libraries.ts"
import { mainProcess } from "./main-process.ts"
import { keepOnlyPictures, readPictures, storePicture } from "./pictures.ts"
import { lookupPreviews, makePreview } from "./previews.ts"
import { dismissProcess, listProcesses, restartProcess, stopProcess } from "./processes.ts"
import {
  closeProject,
  codeServedAt,
  correctComponents,
  getProject,
  onFileChange,
  openProject,
  openRoots,
  projectComponents,
  projectRootFor,
  saveDocument,
  saveDocumentCopy,
  saveTokens
} from "./projects.ts"
import { renderOffscreen } from "./render.ts"
import { startReopening } from "./reopening.ts"
import { openStorybook } from "./storybook.ts"
import { losslessWebp } from "./webp.ts"

// Dependencies such as Rollup probe process.execPath. In an installed app that is Parity.exe, so their children
// must inherit Node mode; otherwise a platform probe launches another app and overwrites agent discovery.
process.env.ELECTRON_RUN_AS_NODE = "1"

// The projects open when the service last ran open again as it starts, before the window asks for them (PAR-179).
const reopening = startReopening({
  file: process.env.PARITY_REOPEN_FILE,
  open: (root) => openProject(root).finally(rememberOpen),
  close: (root) => closeProject(root).finally(rememberOpen)
})

function rememberOpen(): void {
  reopening.remember(openRoots())
}

const handlers: Handlers<ServiceMethods> = {
  "project.open": ({ root }) => {
    const projectRoot = projectRootFor(root)
    reopening.claim(projectRoot)
    return openProject(projectRoot).finally(rememberOpen)
  },
  "project.close": ({ projectId }) => closeProject(projectId).finally(rememberOpen),
  "document.save": saveDocument,
  "document.saveCopy": saveDocumentCopy,
  "images.import": importImage,
  "project.undoEdit": ({ projectId, id }) => undoProjectEdit(getProject(projectId), id),
  "storybook.open": openStorybook,
  "designs.export": (params) => exportDesigns(editorWindow(), params),
  "frames.capture": async ({ job, height }) => {
    const { frame, png } = await renderOffscreen(job, true)
    if (frame.error || !png) return {}
    // The height kept with it, which a frame that hasn't drawn its design takes when it shows the bitmap (PAR-525): the
    // live frame's, or else the offscreen window's, measured at full size as the canvas lays it out.
    const kept = height ?? frame.canvasHeight ?? frame.height
    // Kept and shown as a lossless WebP (PAR-535); where sharp can't load, the PNG shows and nothing's kept.
    const webp = await losslessWebp(Buffer.from(png, "base64")).catch(() => undefined)
    if (!webp) return { src: `data:image/png;base64,${png}`, height: kept }
    const served = codeServedAt(job.projectId, job.guestUrl)
    if (served) void storeBitmap(served, job, webp, kept)
    return { src: `data:image/webp;base64,${webp.toString("base64")}`, height: kept }
  },
  "frames.stored": async ({ job }) => {
    const served = codeServedAt(job.projectId, job.guestUrl)
    const kept = served && (await storedBitmap(served, job))
    return kept ? { src: `data:image/webp;base64,${kept.webp}`, height: kept.height } : {}
  },
  "frames.clearStored": clearBitmaps,
  "pictures.store": ({ root, picture }) => storePicture(root, picture),
  "pictures.read": ({ roots }) => readPictures(roots),
  "pictures.keepOnly": ({ roots }) => keepOnlyPictures(roots),
  "previews.lookup": async ({ previews }) => ({ previews: await lookupPreviews(previews) }),
  "previews.make": ({ preview, priority }) => makePreview(preview, priority),
  "accessibility.check": (params) => checkAccessibility(editorWindow(), params),
  "project.components": projectComponents,
  "project.correctComponents": correctComponents,
  "library.catalog": catalogFor,
  "library.add": addLibrary,
  "library.importStyles": importStyles,
  "tokens.save": saveTokens,
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

let editor: Channel<ServiceMethods, WindowMethods> | undefined

export function editorWindow(): WindowChannel {
  if (!editor) throw new Error("The canvas window isn't open")
  return editor
}

/**
 * Answers a window over its own port, and makes it the window agents act through. Project code shares the window's
 * page, so every request's params are checked before a handler sees them (PAR-565).
 */
function connect(port: MessagePortMain): void {
  const closed = () => new Error("The canvas window closed")
  const channel = createChannel<ServiceMethods, WindowMethods>({
    handlers,
    checks: serviceChecks,
    errors: codedErrors,
    unknownMethod: unknownServiceMethod,
    disconnected: closed
  })
  port.on("close", () => {
    if (editor === channel) editor = undefined
    channel.close(closed())
  })
  channel.connect(nodePort(port, { wrapped: true }))
  editor = channel
}

process.parentPort.on("message", (event: { data: unknown; ports: MessagePortMain[] }) => {
  if ((event.data as ConnectMessage | undefined)?.type !== "connect") return
  const [port] = event.ports
  if (port) connect(port)
})
mainProcess.serve({ builders: () => builderReadings() })
mainProcess.connect(nodePort(process.parentPort, { wrapped: true }))

onFileChange(
  (change) => {
    editor?.request("project.fileChanged", change).catch(() => undefined)
  },
  (change) => {
    editor?.request("project.componentsChanged", change).catch(() => undefined)
  },
  (change) =>
    editor
      ? editor.request("project.guestMoved", change).then(
          () => true,
          () => false
        )
      : Promise.resolve(false)
)

// Kept bitmaps past their limits go when the service starts, so a session never begins over them.
void sweepBitmaps()
void startAgentServer(editorWindow).catch((error: unknown) =>
  console.error("[service] agent server failed to start", error)
)
