import type { MessagePortMain } from "electron"
import type { ChannelMessage, ServiceMethods, WindowMethods } from "../shared/protocol.ts"
import type { MainMessage, ServiceMessage } from "../shared/service.ts"
import { checkAccessibility, exportDesigns, startAgentServer } from "./agent.ts"
import { builderReadings } from "./builders.ts"
import { handleConsoleResult } from "./console.ts"
import { undoProjectEdit } from "./edits.ts"
import { importImage } from "./images.ts"
import { addLibrary, catalogFor, importStyles } from "./libraries.ts"
import { dismissProcess, listProcesses, restartProcess, stopProcess } from "./processes.ts"
import {
  closeProject,
  correctComponents,
  getProject,
  message,
  onFileChange,
  openProject,
  projectComponents,
  projectRootFor,
  saveDocument,
  saveDocumentCopy,
  saveTokens
} from "./projects.ts"
import { handleRenderResult, renderOffscreen } from "./render.ts"
import { openStorybook } from "./storybook.ts"

// Dependencies such as Rollup probe process.execPath. In an installed app that is Parity.exe, so their children
// must inherit Node mode; otherwise a platform probe launches another app and overwrites agent discovery.
process.env.ELECTRON_RUN_AS_NODE = "1"

type Handlers = { [M in keyof ServiceMethods]: (params: ServiceMethods[M]["params"]) => Promise<unknown> }

const handlers: Handlers = {
  "project.open": ({ root }) => openProject(projectRootFor(root)),
  "project.close": ({ projectId }) => closeProject(projectId),
  "document.save": saveDocument,
  "document.saveCopy": saveDocumentCopy,
  "images.import": importImage,
  "project.undoEdit": ({ projectId, id }) => undoProjectEdit(getProject(projectId), id),
  "storybook.open": openStorybook,
  "designs.export": (params) => exportDesigns(editorWindow(), params),
  "frames.capture": async ({ job }) => {
    const { frame, png } = await renderOffscreen(job, true)
    return frame.error ? {} : { png }
  },
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

let editor: (WindowChannel & { port: MessagePortMain }) | undefined

export function editorWindow(): WindowChannel {
  if (!editor) throw new Error("The canvas window isn't open")
  return editor
}

function connect(port: MessagePortMain): void {
  let nextId = 1
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
  const channel = {
    port,
    request(method: string, params: unknown) {
      return new Promise((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        port.postMessage({ type: "request", id, method, params } satisfies ChannelMessage)
      })
    }
  } as WindowChannel & { port: MessagePortMain }

  port.on("message", ({ data }: { data: ChannelMessage }) => {
    if (data.type === "response") {
      const request = pending.get(data.id)
      pending.delete(data.id)
      if (data.error === undefined) request?.resolve(data.result)
      else request?.reject(new Error(data.error))
      return
    }
    const handler = handlers[data.method as keyof Handlers] as ((params: unknown) => Promise<unknown>) | undefined
    const result = handler ? handler(data.params) : Promise.reject(new Error(`Unknown method ${data.method}`))
    result.then(
      (value) => port.postMessage({ type: "response", id: data.id, result: value } satisfies ChannelMessage),
      (error: unknown) =>
        port.postMessage({ type: "response", id: data.id, error: message(error) } satisfies ChannelMessage)
    )
  })
  port.on("close", () => {
    if (editor === channel) editor = undefined
    for (const request of pending.values()) request.reject(new Error("The canvas window closed"))
  })
  port.start()
  editor = channel
}

process.parentPort.on("message", (event: { data: MainMessage; ports: MessagePortMain[] }) => {
  if (event.data.type === "connect") {
    const [port] = event.ports
    if (port) connect(port)
  } else if (event.data.type === "render-result") {
    handleRenderResult(event.data)
  } else if (event.data.type === "console-result") {
    handleConsoleResult(event.data)
  } else if (event.data.type === "builders") {
    const { id } = event.data
    void builderReadings().then((builders) =>
      process.parentPort.postMessage({ type: "builders-result", id, builders } satisfies ServiceMessage)
    )
  }
})

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

void startAgentServer(editorWindow).catch((error: unknown) =>
  console.error("[service] agent server failed to start", error)
)
