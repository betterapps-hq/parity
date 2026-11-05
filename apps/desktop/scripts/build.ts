// Builds the app without a development server (PAR-8). The output is also the input to installer packaging.
import { execSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
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
  // sharp loads its prebuilt libvips at runtime, so it's shipped as a package beside the service (PAR-535).
  external: ["electron", "typescript", "sharp"],
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
shipPackage("sharp", appDir)
// One macOS build packages both Apple Silicon and Intel, from an install that has only the runner's own binaries.
if (process.platform === "darwin") shipOtherMacBinaries()
/**
 * Copies an installed package into `out/node_modules`, with the dependencies and optional dependencies installed beside
 * it, which for sharp are its prebuilt binaries for this system. pnpm keeps each package's dependencies as its siblings,
 * so they're looked for from the package's own folder up.
 */
function shipPackage(name: string, from: string, shipped = new Set<string>()): void {
  const folder = installed(name, from)
  if (!folder || shipped.has(folder)) return
  shipped.add(folder)
  cpSync(folder, join(out, "node_modules", name), { recursive: true, dereference: true })
  const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
  }
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    shipPackage(dependency, folder, shipped)
  }
}

/** Where a package is installed, as seen from a folder; nothing when it isn't, as for another system's binaries. */
function installed(name: string, from: string): string | undefined {
  for (let folder = from; ; folder = dirname(folder)) {
    const candidate = basename(folder) === "node_modules" ? join(folder, name) : join(folder, "node_modules", name)
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate)
    if (dirname(folder) === folder) return undefined
  }
}

/** Adds sharp's binaries for the Mac architecture this runner isn't, from npm, at the versions sharp asks for. */
function shipOtherMacBinaries(): void {
  const other = process.arch === "arm64" ? "x64" : "arm64"
  const sharp = JSON.parse(readFileSync(join(out, "node_modules/sharp/package.json"), "utf8")) as {
    optionalDependencies: Record<string, string>
  }
  for (const name of [`@img/sharp-darwin-${other}`, `@img/sharp-libvips-darwin-${other}`]) {
    const version = sharp.optionalDependencies[name]
    if (!version) throw new Error(`sharp doesn't list ${name}`)
    const target = join(out, "node_modules", name)
    if (existsSync(target)) continue
    const packed = mkdtempSync(join(tmpdir(), "parity-sharp-"))
    const tarball = execSync(`npm pack ${name}@${version} --silent`, { cwd: packed, encoding: "utf8" }).trim()
    mkdirSync(target, { recursive: true })
    execSync(`tar -xzf ${JSON.stringify(join(packed, tarball))} -C ${JSON.stringify(target)} --strip-components=1`)
    rmSync(packed, { recursive: true, force: true })
  }
}

const { name, version, license, description, author, homepage } = JSON.parse(
  readFileSync(join(appDir, "package.json"), "utf8")
)
writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name,
      version,
      license,
      description,
      author,
      homepage,
      type: "module",
      main: "main.mjs",
      releaseChannel: process.env.PARITY_RELEASE_CHANNEL === "beta" ? "beta" : undefined
    },
    null,
    2
  )
)
