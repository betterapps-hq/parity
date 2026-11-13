import { readdir, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { adapters } from "@parity-app/adapters"
import { hasElementSources, inferProps } from "@parity-app/code"
import { type Adapter, type ComponentInfo, defaultModeSettings, parseCanvasDocument } from "@parity-app/core"
import {
  adapterStatus,
  detectAdapters,
  detectContext,
  detectProject,
  discoverProject,
  importEntities,
  readPackage
} from "@parity-app/project"
import { guestModuleSource, taggedModule } from "@parity-app/vite-adapter"
import type { Plugin } from "vite"
import type { ProjectInfo } from "../src/shared/protocol.ts"

/** The project stories open: the shadcn example, as the app's service finds it. */
const root = resolve(import.meta.dirname, "../../../examples/shadcn-vite")

/**
 * The designs stories open in place of the example's own: only the ones stories use. The example keeps growing as a
 * stress test for `pnpm dev` and `pnpm perf`, and opening all of it made every story slow.
 */
const designs = resolve(import.meta.dirname, "example.par")
const projectId = "virtual:parity/example-project"
const guestId = "virtual:parity/example-guest"
const rendererId = "virtual:canvas/renderer"

/** The example's source files as text by their path from its root, for the Code panel exploration to show. */
const sourcesId = "virtual:parity/example-sources"
const require = createRequire(import.meta.url)

/**
 * Serves the example project to stories without its builder. `virtual:parity/example-project` is what the service's
 * `project.open` and `project.components` would answer, found by the same discovery, reading and inference; the guest
 * module the canvas imports is the one the project's builder would serve, compiled here with the project's own styles.
 * The project's `guestUrl` points at that module: on the dev server under `storybook dev`, and at a chunk of its own
 * under `storybook build`, which has no server to ask.
 */
export function exampleProject(): Plugin {
  let found: ReturnType<typeof discover> | undefined
  const project = () => (found ??= discover())
  let building = false
  let guestChunk: string | undefined

  return {
    name: "parity:example-project",
    enforce: "pre",
    configResolved(config) {
      building = config.command === "build"
    },
    buildStart() {
      // Vite drops an app's entry exports, and the canvas reads the guest from this one's.
      if (building) {
        guestChunk = this.emitFile({ type: "chunk", id: guestId, name: "example-guest", preserveSignature: "strict" })
      }
    },
    resolveId(source, importer) {
      if (source === projectId || source === guestId || source === sourcesId) {
        return `\0${source}`
      }

      // The example's files import each other by `@/`, which its own Vite config points at its `src`.
      if (source.startsWith("@/") && importer && inExample(importer)) {
        return this.resolve(join(root, "src", source.slice(2)), importer, { skipSelf: true })
      }

      if (importer !== `\0${guestId}`) {
        return undefined
      }

      // The guest module imports the renderer's runtime, the project's files by root path, and libraries by name.
      if (source === rendererId) {
        return require.resolve("@parity-app/react-adapter/guest")
      }

      if (source.startsWith("/")) {
        return join(root, source)
      }

      return this.resolve(source, join(root, "src", "main.tsx"), { skipSelf: true })
    },
    async load(id) {
      if (id === `\0${projectId}`) {
        const { info, components } = await project()
        this.addWatchFile(designs)
        // The bundler writes the chunk's URL in, relative to the page or absolute as the build's base is; the canvas
        // wants it absolute.
        const url = guestChunk ? `import.meta.ROLLUP_FILE_URL_${guestChunk}` : JSON.stringify(`/@id/__x00__${guestId}`)

        return [
          `const project = ${JSON.stringify({ info, components })}`,
          `project.info.guestUrl = new URL(${url}, location.href).href`,
          "export default project"
        ].join("\n")
      }

      if (id.split("?")[0] === `\0${guestId}`) {
        return guestModuleSource((await project()).config)
      }

      if (id === `\0${sourcesId}`) {
        return `export default ${JSON.stringify(await sourceFiles())}`
      }

      return undefined
    },
    handleHotUpdate({ file }) {
      // Changing the designs reads the project again, as reopening it would.
      if (resolve(file) === designs) {
        found = undefined
      }
    },
    transform(code, id) {
      // The project's own builder scans the project for class names; this one scans the canvas app. Adds the example's
      // source and the designs stories open, so the classes its components and those designs use are compiled.
      const [path] = id.split("?")

      // The example's elements carry their lines, as the project's builder gives them in development (PAR-167).
      if (path && inExample(path) && hasElementSources(path)) {
        return taggedModule(root.replaceAll("\\", "/"), code, id)
      }

      if (!path || resolve(path) !== join(root, "src", "index.css")) {
        return undefined
      }

      return `${code}\n@source "./";\n@source "${relative(dirname(path), designs).replaceAll("\\", "/")}";\n`
    }
  }
}

/** The example's own source files, by their path from its root with `/` between folders. */
async function sourceFiles(): Promise<Record<string, string>> {
  const files: Record<string, string> = {}

  for (const entry of await readdir(join(root, "src"), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(tsx?|jsx?|css)$/.test(entry.name)) {
      continue
    }

    const path = join(entry.parentPath, entry.name)
    files[relative(root, path).replaceAll("\\", "/")] = await readFile(path, "utf8")
  }

  return files
}

/** Whether a module is one of the example's own files. */
function inExample(id: string): boolean {
  const path = relative(root, id.split("?")[0] ?? id)

  return !!path && !path.startsWith("..") && !isAbsolute(path)
}

async function discover(): Promise<{
  config: Awaited<ReturnType<typeof discoverProject>>
  info: Omit<ProjectInfo, "guestUrl">
  components: Record<string, ComponentInfo>
}> {
  const pkg = (await readPackage(root))?.manifest

  if (!pkg) {
    throw new Error(`There's no package.json in ${root}`)
  }

  // The adapters the app's service would choose: the example is React, built with Vite and styled with Tailwind.
  const project = detectContext(root, pkg)

  const found = async <A extends Adapter>(list: A[]) =>
    (await detectAdapters(project, list)).filter(({ detection }) => detection.found)

  const [rendererFound] = await found(adapters.renderers)

  if (!rendererFound) {
    throw new Error(`No renderer supports ${root}`)
  }

  const renderer = rendererFound.adapter
  // The builder isn't started, so it isn't asked either: stories use the example's Vite as installed.
  const builder = adapters.builders[0]!
  const builderFound = { adapter: builder, detection: { found: true, summary: `${builder.name} for the example` } }

  const [styleFound, routers, entitiesFound] = await Promise.all([
    found(adapters.styles),
    found(adapters.routers),
    found(adapters.entities)
  ])

  const config = await discoverProject(root, renderer, pkg)
  const stylesheet = config.styles[0]
  const source = stylesheet ? await readFile(join(root, stylesheet), "utf8") : ""
  const styles = stylesheet ? adapters.styles.find((adapter) => adapter.handles(source)) : undefined
  const theme = styles && stylesheet ? await styles.loadTheme(root, stylesheet).catch(() => []) : []
  const mainDocument = config.documents.find((path) => !path.includes("/")) ?? "shadcn-vite.par"
  // The example's main designs file is the only one stories open, read from Storybook's own copy.
  const documents = [await readDocument(mainDocument)]
  const main = documents[0]?.document

  const detection = await detectProject(root, pkg, [
    rendererFound,
    builderFound,
    ...styleFound,
    ...routers,
    ...entitiesFound
  ])

  const used = entitiesFound.map(({ adapter }) => adapter)
  const entities = await importEntities(root, config.components, used)

  const tools = [
    { adapter: renderer },
    { adapter: builder, version: "8" },
    ...(styles ? [{ adapter: styles }] : []),
    ...used.map((adapter) => ({ adapter }))
  ]

  const info: Omit<ProjectInfo, "guestUrl"> = {
    id: root,
    root,
    name: pkg.name ?? "shadcn-vite",
    renderer: { id: renderer.id, name: renderer.name },
    builder: { id: builder.id, name: builder.name, toolVersion: "8" },
    theme,
    routes: [],
    entities: {},
    status: adapterStatus(tools, detection, entities),
    componentCount: Object.keys(config.components).length,
    sources: config.components,
    libraries: config.libraries,
    notes: config.notes,
    detection,
    documents,
    mainDocument,
    modes: { settings: main?.modes ?? defaultModeSettings, custom: !!main?.modes }
  }

  if (styles && stylesheet) {
    info.styles = { id: styles.id, name: styles.name, stylesheet }
  }

  if (config.storybook) {
    info.storybook = config.storybook
  }

  if (config.describedTokens) {
    info.describedTokens = config.describedTokens
  }

  return { config, info, components: inferProps(root, config.components) }
}

/** Storybook's designs under the example's file name. */
async function readDocument(path: string): Promise<ProjectInfo["documents"][number]> {
  return { path, document: parseCanvasDocument(JSON.parse(await readFile(designs, "utf8"))) }
}
