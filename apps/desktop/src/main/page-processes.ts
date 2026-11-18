import { PageProcesses } from "@parity-app/frames"
import { type BrowserWindow, webFrameMain } from "electron"
import { isPageUrl } from "./page-frames.ts"

/*
 * Hears a project's route pages' process going (docs/proposals/route-frames.md, "When the page process fails",
 * PAR-1300). `render-process-gone` is only the window's own process: a route frame runs on its project's own host, in a
 * process of its own, which Electron gives no event for. So each frame that loads a page is noted with its process, and
 * while any is open, main looks twice a second for a process that ended under a frame still in the window
 * (`PageProcesses`), and tells the window its host.
 */

/** How often main looks at the processes of open route pages, in milliseconds. */
const checkEvery = 500

/** Calls `gone` with a project's page host each time the process running its route pages in `window` goes. */
export function watchPageProcesses(window: BrowserWindow, gone: (host: string) => void): void {
  const processes = new PageProcesses()
  let timer: NodeJS.Timeout | undefined

  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }

  const check = () => {
    if (window.isDestroyed()) {
      stop()

      return
    }

    const present = new Set(window.webContents.mainFrame.framesInSubtree.map((frame) => frame.frameTreeNodeId))

    for (const host of processes.check(present, running)) {
      gone(host)
    }

    if (!processes.watching) {
      stop()
    }
  }

  window.webContents.on(
    "did-frame-navigate",
    (_event, url, _code, _status, isMainFrame, frameProcessId, frameRoutingId) => {
      const frame = isMainFrame || !isPageUrl(url) ? undefined : webFrameMain.fromId(frameProcessId, frameRoutingId)

      if (!frame) {
        return
      }

      processes.seen({ node: frame.frameTreeNodeId, host: new URL(url).hostname, pid: frame.osProcessId })
      timer ??= setInterval(check, checkEvery)
    }
  )
  window.on("closed", stop)
}

/** Whether a process runs: signal 0 checks without sending anything, and one we may not signal still runs. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}
