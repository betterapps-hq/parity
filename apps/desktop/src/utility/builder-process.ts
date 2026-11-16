import { nodePort } from "@parity-app/channel"
import { rsbuildBuilder } from "@parity-app/extension-rsbuild/builder"
import { rspackBuilder } from "@parity-app/extension-rspack/builder"
import { turbopackBuilder } from "@parity-app/extension-turbopack/builder"
import { viteBuilder } from "@parity-app/extension-vite/builder"
import { webpackBuilder } from "@parity-app/extension-webpack/builder"
import { serveBuilderProcess } from "@parity-app/processes"
import { keepCompiledCode } from "../shared/compile-cache.ts"
// One project's builder, in a process of its own that the project service starts (see builders.ts). Ending it when the
// project closes is what gives back the build tool's memory, which closing its server doesn't.

serveBuilderProcess(
  {
    // The service's requests come over Node's IPC channel, as `@parity-app/channel` messages.
    port: nodePort({
      on: (event, listener) => process.on(event, listener),
      postMessage: (message) => process.send?.(message)
    }),
    usage: () => {
      const { user, system } = process.cpuUsage()

      return { cpu: user + system, uptime: process.uptime() * 1000, memory: process.memoryUsage.rss() }
    },
    exit: () => process.exit(0)
  },
  // The entry modules of the built-in builders' extensions, as their manifests name them.
  [viteBuilder, rspackBuilder, rsbuildBuilder, turbopackBuilder, webpackBuilder]
)

keepCompiledCode()

// The service ended, even killed outright: nothing can reach this builder any more.
process.on("disconnect", () => process.exit(0))

// A project's plugin that drops a promise shouldn't take its builder down, as it didn't in the service.
process.on("unhandledRejection", (reason) => console.error("[builder]", reason))
