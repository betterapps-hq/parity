// Builds the app without a development server (PAR-8). The output is also the input to installer packaging.
import { execFileSync, execSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { parseManifest } from "@parity-app/core"
import { buildRegistryIndex, registryIndexFile } from "@parity-app/registry"
import { build, type BuildOptions } from "esbuild"
import { currentCommit } from "../../../scripts/commit.ts"
import { separateSourceMaps } from "../../../scripts/sourcemaps.ts"
import { installedElectron } from "./parity-electron.ts"

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
  // Hidden: the maps are written, but the bundles don't point at them, since they're taken out before packaging.
  sourcemap: "external",
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
    "hang-watch": join(appDir, "src/main/hang-watch.ts"),
    utility: join(appDir, "src/utility/index.ts"),
    "props-worker": join(appDir, "src/utility/props-worker.ts"),
    "builder-process": join(appDir, "src/utility/builder-process.ts")
  }
})

await build({
  ...node,
  entryPoints: {
    preload: join(appDir, "src/preload/index.ts"),
    "render-preload": join(appDir, "src/preload/render.ts")
  },
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

// Parity's own bundles, preload scripts and workers included, and the windows' scripts. The project guest is left
// out: its errors are the project's, not Parity's.
separateSourceMaps({
  packageFolder: appDir,
  out,
  bundles: [...globSync("*.{mjs,cjs}", { cwd: out }).filter((bundle) => bundle !== "guest.mjs"), "renderer"],
  maps: ["*.map", "renderer/**/*.map"]
})

cpSync(join(appDir, "resources"), join(out, "resources"), { recursive: true })

const registry = dirname(require.resolve("@parity-app/registry/package.json"))

cpSync(join(registry, "libraries"), join(out, "libraries"), { recursive: true })

// Which package each library file describes, so opening a project parses only the files for its own packages, not
// the tens of megabytes of the rest (PAR-1085).
writeFileSync(
  join(out, "libraries", registryIndexFile),
  JSON.stringify(await buildRegistryIndex(join(out, "libraries")))
)

cpSync(join(registry, "in-app.json"), join(out, "in-app.json"))

// The checker reads lib.*.d.ts next to TypeScript at runtime. A real directory also works from a packaged app.
cpSync(dirname(require.resolve("typescript/package.json")), join(out, "node_modules/typescript"), { recursive: true })

shipPackage("sharp", appDir)

await shipCli()

// One macOS build packages both Apple Silicon and Intel, from an install that has only the runner's own binaries.
if (process.platform === "darwin") {
  shipOtherMacBinaries()
}

checkShippedSharp()

checkShippedCli()

/**
 * Ships the CLI that npm publishes, for Help > Install the Parity CLI (PAR-906), whose `parity` runs it with the
 * app's Electron as Node, so it's always the app's version. Its sender's Sentry is bundled into it, as main's is, rather
 * than shipping `@sentry/node`'s tree; zod and semver go beside the service's packages, where it finds them from its
 * own folder, as it finds the TypeScript the service ships.
 */
async function shipCli(): Promise<void> {
  const cli = resolve(appDir, "../../packages/cli")
  const shipped = join(out, "cli")

  execSync("pnpm exec vp pack", { cwd: cli, stdio: "inherit" })
  cpSync(join(cli, "dist"), join(shipped, "dist"), { recursive: true })
  cpSync(join(cli, "skills"), join(shipped, "skills"), { recursive: true })
  await build({
    ...node,
    entryPoints: { send: join(shipped, "dist/send.mjs") },
    outdir: join(shipped, "dist"),
    allowOverwrite: true,
    sourcemap: false,
    // The copy's imports resolve from the CLI's own packages.
    nodePaths: [join(cli, "node_modules")]
  })
  const { version, dependencies } = readManifest(cli)
  const manifest = { name: "@parity-app/cli", version, private: true }
  // The CLI reports the version in the package.json beside its dist.
  writeFileSync(
    join(shipped, "package.json"),
    `${JSON.stringify(manifest, null, 2)}
`
  )

  for (const name of Object.keys(dependencies ?? {})) {
    if (name !== "typescript" && name !== "@sentry/node") {
      shipPackage(name, cli)
    }
  }
}

/** Fails the build unless the shipped CLI runs in Parity's Electron, as the `parity` command runs it. */
function checkShippedCli(): void {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" }

  execFileSync(installedElectron(), [join(out, "cli/dist/bin.mjs"), "skill"], { stdio: "ignore", env })
  // Without an outbox folder, the sender only loads.
  execFileSync(installedElectron(), [join(out, "cli/dist/send.mjs")], { stdio: "inherit", env })
}

/**
 * Fails the build unless the sharp it ships loads in Parity's Electron and encodes a lossless WebP, from the files the
 * installer unpacks beside the service, so an installer whose bitmaps couldn't be kept is never made (PAR-535). The
 * other Mac architecture's binaries can't run here, so they're only checked to be there.
 */
function checkShippedSharp(): void {
  const sharp = join(out, "node_modules/sharp")

  const script = `require(${JSON.stringify(sharp)})({ create: { width: 2, height: 2, channels: 3, background: "#36c" } })
    .webp({ lossless: true }).toBuffer()
    .then((webp) => { if (webp.toString("latin1", 8, 12) !== "WEBP") throw new Error("not a WebP"); console.log("sharp loads in Electron") })
    .catch((error) => { console.error(error); process.exit(1) })`

  const electron = installedElectron()
  execFileSync(electron, ["-e", script], { stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } })

  if (process.platform !== "darwin") {
    return
  }

  for (const arch of ["arm64", "x64"]) {
    for (const name of [`@img/sharp-darwin-${arch}`, `@img/sharp-libvips-darwin-${arch}`]) {
      if (!existsSync(join(out, "node_modules", name, "package.json"))) {
        throw new Error(`The build ships no ${name}`)
      }
    }
  }
}

/**
 * Copies an installed package into `out/node_modules`, with the dependencies and optional dependencies installed beside
 * it, which for sharp are its prebuilt binaries for this system. pnpm keeps each package's dependencies as its siblings,
 * so they're looked for from the package's own folder up.
 */
function shipPackage(name: string, from: string, shipped = new Set<string>()): void {
  const folder = installed(name, from)

  if (!folder || shipped.has(folder)) {
    return
  }

  shipped.add(folder)
  cpSync(folder, join(out, "node_modules", name), { recursive: true, dereference: true })
  const manifest = readManifest(folder)

  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    shipPackage(dependency, folder, shipped)
  }
}

/** Where a package is installed, as seen from a folder; nothing when it isn't, as for another system's binaries. */
function installed(name: string, from: string): string | undefined {
  for (let folder = from; ; folder = dirname(folder)) {
    const candidate = basename(folder) === "node_modules" ? join(folder, name) : join(folder, "node_modules", name)

    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate)
    }

    if (dirname(folder) === folder) {
      return undefined
    }
  }
}

function readManifest(folder: string) {
  const file = join(folder, "package.json")

  return parseManifest(readFileSync(file, "utf8"), file)
}

/** Adds sharp's binaries for the Mac architecture this runner isn't, from npm, at the versions sharp asks for. */
function shipOtherMacBinaries(): void {
  const other = process.arch === "arm64" ? "x64" : "arm64"
  const sharp = readManifest(join(out, "node_modules/sharp"))

  for (const name of [`@img/sharp-darwin-${other}`, `@img/sharp-libvips-darwin-${other}`]) {
    const version = sharp.optionalDependencies?.[name]

    if (!version) {
      throw new Error(`sharp doesn't list ${name}`)
    }

    const target = join(out, "node_modules", name)

    if (existsSync(target)) {
      continue
    }

    const packed = mkdtempSync(join(tmpdir(), "parity-sharp-"))
    const tarball = execSync(`npm pack ${name}@${version} --silent`, { cwd: packed, encoding: "utf8" }).trim()
    mkdirSync(target, { recursive: true })
    execSync(`tar -xzf ${JSON.stringify(join(packed, tarball))} -C ${JSON.stringify(target)} --strip-components=1`)
    rmSync(packed, { recursive: true, force: true })
  }
}

const { name, version, license, description, author, homepage } = readManifest(appDir)

// The app starts here, so Node keeps V8's compiled code for main between launches, and for the service and builders
// through the variable they inherit (PAR-1083). Main's bundle is compiled before any of its code runs, so turning the
// cache on has to come before it's imported.
writeFileSync(
  join(out, "start.mjs"),
  `import { enableCompileCache, flushCompileCache } from "node:module"
const { directory } = enableCompileCache()
if (directory) process.env.NODE_COMPILE_CACHE = directory
await import("./main.mjs")
flushCompileCache()
`
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
      main: "start.mjs",
      // Names a CI build's Sentry release; an installed build's is its version (PAR-625).
      commit: currentCommit(appDir),
      releaseChannel: process.env.PARITY_RELEASE_CHANNEL === "beta" ? "beta" : undefined
    },
    null,
    2
  )
)
