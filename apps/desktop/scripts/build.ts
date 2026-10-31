// Builds the app without a development server (PAR-8). The output is also the input to installer packaging.
import { execSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { build, type BuildOptions } from "esbuild"

const appDir = resolve(import.meta.dirname, "..")
const out = join(appDir, "out")
const require = createRequire(join(appDir, "package.json"))
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

execSync("pnpm exec vp build", { cwd: appDir, stdio: "inherit" })

const node: BuildOptions = {
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outdir: out,
  outExtension: { ".js": ".mjs" },
  external: ["electron", "typescript"],
  // Jiti's static entry includes its config transformer instead of looking for Babel beside the original package.
  alias: { jiti: join(dirname(require.resolve("jiti/package.json")), "lib/jiti-static.mjs") },
  banner: {
    js: 'import { createRequire as __parityRequire } from "node:module"; const require = __parityRequire(import.meta.url);'
  },
  logLevel: "info"
}

await build({
  ...node,
  entryPoints: {
    main: join(appDir, "src/main/index.ts"),
    utility: join(appDir, "src/utility/index.ts"),
    "props-worker": join(appDir, "src/utility/props-worker.ts"),
    "builder-process": join(appDir, "src/utility/builder-process.ts")
  }
})
await build({
  ...node,
  entryPoints: { preload: join(appDir, "src/preload/index.ts") },
  format: "cjs",
  banner: {},
  outExtension: { ".js": ".cjs" }
})
// The project's Vite compiles the guest with the project's own React, never Parity's copy.
await build({
  entryPoints: { guest: require.resolve("@parity-app/renderer-react/guest") },
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  outdir: out,
  outExtension: { ".js": ".mjs" },
  external: ["react", "react/*", "react-dom", "react-dom/*"],
  logLevel: "info"
})

cpSync(join(appDir, "resources"), join(out, "resources"), { recursive: true })
const registry = dirname(require.resolve("@parity-app/registry/package.json"))
cpSync(join(registry, "libraries"), join(out, "libraries"), { recursive: true })
cpSync(join(registry, "in-app.json"), join(out, "in-app.json"))
// The checker reads lib.*.d.ts next to TypeScript at runtime. A real directory also works from a packaged app.
cpSync(dirname(require.resolve("typescript/package.json")), join(out, "node_modules/typescript"), { recursive: true })
const { name, version, license } = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"))
writeFileSync(
  join(out, "package.json"),
  JSON.stringify({ name, version, license, type: "module", main: "main.mjs" }, null, 2)
)
