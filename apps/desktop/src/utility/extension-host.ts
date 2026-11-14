// One extension's host, for one open project, in a process of its own that the project service starts (see
// extensions.ts). Its crash or a loop in its code affects only that extension.

import { pathToFileURL } from "node:url"
import { format } from "node:util"
import { nodePort } from "@parity-app/channel"
import { serveExtensionHost } from "@parity-app/extensions"

const host = serveExtensionHost({
  // The service's requests come over Node's IPC channel, as `@parity-app/channel` messages.
  port: nodePort(
    {
      on: (event, listener) => process.on(event, listener),
      postMessage: (message) => process.send?.(message)
    },
    { closedBy: { disconnect: () => new Error("The project service went away") } }
  ),
  load: (main) => import(pathToFileURL(main).href),
  exit: () => process.exit(0)
})

// What the extension's code prints goes to its log in the bottom panel, as well as to the process's own output.
for (const [method, level] of [
  ["log", "info"],
  ["info", "info"],
  ["debug", "info"],
  ["warn", "warning"],
  ["error", "error"]
] as const) {
  const original = console[method].bind(console)

  console[method] = (...parts: unknown[]) => {
    original(...parts)
    host.log(level, format(...parts))
  }
}

// A dropped promise or a throw outside a command is the extension's bug, logged where its developer looks; the host
// keeps running.
process.on("unhandledRejection", (reason) => {
  host.log(
    "error",
    `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
    stackOf(reason)
  )
})

process.on("uncaughtException", (error) => {
  host.log("error", `Uncaught exception: ${error.message}`, error.stack)
})

// The service ended, even killed outright: nothing can reach this host any more.
process.on("disconnect", () => process.exit(0))

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a promise can be rejected with anything
function stackOf(reason: unknown): string | undefined {
  return reason instanceof Error ? reason.stack : undefined
}
