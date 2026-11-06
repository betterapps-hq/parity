import type { ConsoleHost } from "../shared/protocol.ts"
import { captureConsole } from "./canvas/console-capture.ts"
import { consoleLog, type FedProject, routeConsoleChange } from "./console-store.ts"
import { workspace } from "./workspace.ts"

/**
 * Feeds each open project's Console panel from the main process's log (PAR-147): what's there when it opens, then what
 * comes, each message to the project whose builder served the code that wrote it. It also starts saying which frame on
 * the canvas each message comes from.
 */
export function startConsole(host: ConsoleHost = window.canvasHost.console): void {
  captureConsole(host)
  const sessions = (): FedProject[] => workspace.getTabs().flatMap((tab) => (tab.session ? [tab.session] : []))
  const read = new Set<string>()
  const fill = () => {
    for (const session of sessions()) {
      const { guestUrl } = session.info
      const key = `${session.id}\n${guestUrl}`
      if (read.has(key)) continue
      read.add(key)
      host.read(guestUrl).then(
        (entries) => consoleLog(session.id).update(entries, guestUrl),
        // What comes next still shows.
        () => undefined
      )
    }
  }
  workspace.subscribe(fill)
  fill()
  host.subscribe((change) => routeConsoleChange(change, sessions()))
}

/** Clears a project's console, for agents and every window. */
export function clearConsole(project: FedProject): void {
  consoleLog(project.id).clear()
  void window.canvasHost.console.clear(project.info.guestUrl)
}
