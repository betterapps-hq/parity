// Starts the canvas UI dev server, bundles the Electron main, utility and preload scripts, and runs Electron.
// The UI reloads in place through Vite. A change to the project service (the utility script and every workspace package
// it bundles) restarts only the service: Electron watches its bundle and reconnects its windows, which keep their unsaved
// work. Only a change to the main process or the preload script restarts Electron.
// Usage: pnpm dev [project-root]
import { type ChildProcess, spawn } from "node:child_process"
import { cpSync } from "node:fs"
import { join, resolve } from "node:path"
import { type BuildContext, type BuildOptions, context, type Plugin } from "esbuild"
import { createServer } from "vite"
import { parityElectron } from "./parity-electron.ts"

const appDir = resolve(import.meta.dirname, "..")
const repoDir = resolve(appDir, "../..")
// A second copy of the app, such as the one `pnpm perf` starts, bundles into its own folder: Electron restarts the
// service whenever the bundle beside it changes, and the other copy's builds would do that too.
const uiPort = process.env.PARITY_UI_PORT ?? "5310"
const outDir = uiPort === "5310" ? join(appDir, "out") : join(appDir, "out", uiPort)
// Frozen, the bundles are built once, so edits made meanwhile can't restart a copy being measured.
const frozen = process.env.PARITY_UI_FROZEN === "1"
const project = resolve(process.argv[2] ?? process.env.PARITY_PROJECT ?? join(repoDir, "examples/shadcn-vite"))
const debugPort = process.env.PARITY_DEBUG_PORT ?? "9333"
const electronPath = parityElectron((await import("electron")).default as unknown as string)

const ui = await createServer({ configFile: join(appDir, "vite.config.ts"), root: join(appDir, "src/renderer") })
await ui.listen()
const rendererUrl = ui.resolvedUrls?.local[0]
if (!rendererUrl) throw new Error("The canvas UI dev server did not report a URL")

// Workspace packages are TypeScript sources, so they are bundled; everything else loads from node_modules.
const externalizeDependencies: Plugin = {
  name: "externalize-dependencies",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.kind === "entry-point" || args.path.startsWith("@parity/")) return undefined
      return { path: args.path, external: true }
    })
  }
}

let electron: ChildProcess | undefined
let restarting = false
let pendingBuilds = 3

/** Starts Electron once every bundle is built; after that, `restart` decides whether a rebuild restarts it. */
function onBuilt(restart: boolean): Plugin {
  return {
    name: "start-electron",
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length > 0) return
        if (pendingBuilds > 0) {
          pendingBuilds--
          if (pendingBuilds === 0) startElectron()
          return
        }
        if (restart) restartElectron()
      })
    }
  }
}

const shared: BuildOptions = {
  bundle: true,
  platform: "node",
  target: "node22",
  sourcemap: true,
  outdir: outDir,
  logLevel: "warning"
}

// The app's icons go beside the bundles, where every copy of the app finds them.
cpSync(join(appDir, "resources"), join(outDir, "resources"), { recursive: true })

const builds: BuildContext[] = [
  await context({
    ...shared,
    entryPoints: { main: join(appDir, "src/main/index.ts") },
    format: "esm",
    outExtension: { ".js": ".mjs" },
    plugins: [externalizeDependencies, onBuilt(true)]
  }),
  // Electron restarts only the service when these change; see the main process.
  await context({
    ...shared,
    entryPoints: {
      utility: join(appDir, "src/utility/index.ts"),
      "props-worker": join(appDir, "src/utility/props-worker.ts")
    },
    format: "esm",
    outExtension: { ".js": ".mjs" },
    plugins: [externalizeDependencies, onBuilt(false)]
  }),
  await context({
    ...shared,
    entryPoints: { preload: join(appDir, "src/preload/index.ts") },
    format: "cjs",
    outExtension: { ".js": ".cjs" },
    plugins: [externalizeDependencies, onBuilt(true)]
  })
]

function startElectron(): void {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PARITY_RENDERER_URL: rendererUrl,
    PARITY_PROJECT: project,
    PARITY_DEBUG_PORT: debugPort,
    PARITY_DEV_RUNNER: String(process.pid)
  }
  delete env.ELECTRON_RUN_AS_NODE
  console.log(`[dev] canvas UI ${rendererUrl}`)
  console.log(`[dev] project ${project}`)
  console.log(`[dev] DevTools protocol on port ${debugPort}`)
  electron = spawn(electronPath, [uiPort === "5310" ? appDir : join(outDir, "main.mjs")], { stdio: "inherit", env })
  electron.on("exit", () => {
    if (restarting) return
    void shutdown()
  })
}

function restartElectron(): void {
  // Both builds can finish together after one change; a second restart would start a second Electron.
  if (!electron || restarting) return
  console.log("[dev] main process or preload changed, restarting Electron")
  restarting = true
  electron.once("exit", () => {
    restarting = false
    startElectron()
  })
  electron.kill()
}

async function shutdown(): Promise<void> {
  await Promise.all(builds.map((build) => build.dispose()))
  await ui.close()
  process.exit(0)
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    electron?.kill()
    void shutdown()
  })
}

// Stopping `pnpm dev` can leave this process behind on Windows, where its parent's end sends no signal. It stops
// itself and Electron once whatever started it is gone, so a stale app can't keep the ports.
setInterval(() => {
  try {
    process.kill(process.ppid, 0)
  } catch {
    electron?.kill()
    void shutdown()
  }
}, 2000).unref()

await Promise.all(builds.map((build) => (frozen ? build.rebuild() : build.watch())))
