import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { guestModuleSource } from "@parity/builder-vite"
import {
  type CanvasDocument,
  type ComponentInfo,
  defaultModeSettings,
  libraryCanvas,
  libraryManifestExtension,
  type PackageManifest,
  parseCanvasDocument,
  parseLibraryManifest
} from "@parity/core"
import { detectProject, discoverProject } from "@parity/project"
import { inferProps } from "@parity/props"
import { reactRenderer } from "@parity/renderer-react"
import { tailwindStyles } from "@parity/styles-tailwind"
import type { Plugin } from "vite"
import type { ProjectInfo } from "../src/shared/protocol.ts"

/** The project stories open: the shadcn example, as the app's service finds it. */
const root = resolve(import.meta.dirname, "../../../examples/shadcn-vite")
const projectId = "virtual:parity/example-project"
const guestId = "virtual:parity/example-guest"
const rendererId = "virtual:canvas/renderer"
const require = createRequire(import.meta.url)

/**
 * Serves the example project to stories without its builder. `virtual:parity/example-project` is what the service's
 * `project.open` and `project.components` would answer, found by the same discovery, reading and inference; the guest
 * module the canvas imports is the one the project's builder would serve, compiled here with the project's own styles.
 */
export function exampleProject(): Plugin {
  let found: ReturnType<typeof discover> | undefined
  const project = () => (found ??= discover())
  return {
    name: "parity:example-project",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === projectId || source === guestId) return `\0${source}`
      if (importer !== `\0${guestId}`) return undefined
      // The guest module imports the renderer's runtime, the project's files by root path, and libraries by name.
      if (source === rendererId) return require.resolve("@parity/renderer-react/guest")
      if (source.startsWith("/")) return join(root, source)
      return this.resolve(source, join(root, "src", "main.tsx"), { skipSelf: true })
    },
    async load(id) {
      if (id === `\0${projectId}`) {
        const { info, components } = await project()
        for (const { path } of info.documents) this.addWatchFile(join(root, path))
        return `export default ${JSON.stringify({ info, components })}`
      }
      if (id.split("?")[0] === `\0${guestId}`) return guestModuleSource((await project()).config)
      return undefined
    },
    transform(code, id) {
      // The project's own builder scans the project for class names; this one scans the canvas app. Adds the example,
      // its designs among it, so the classes its components and designs use are compiled.
      const [path] = id.split("?")
      if (!path || resolve(path) !== join(root, "src", "index.css")) return undefined
      return `${code}\n@source "../";\n`
    }
  }
}

async function discover(): Promise<{
  config: Awaited<ReturnType<typeof discoverProject>>
  info: Omit<ProjectInfo, "guestUrl">
  components: Record<string, ComponentInfo>
}> {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PackageManifest
  const config = await discoverProject(root, reactRenderer, pkg)
  const documents = await Promise.all(
    config.documents.map(async (path) => {
      try {
        return { path, document: readDesigns(path, await readFile(join(root, path), "utf8")) }
      } catch (error) {
        return { path, error: error instanceof Error ? error.message : String(error) }
      }
    })
  )
  const stylesheet = config.styles[0]
  const theme = stylesheet ? await tailwindStyles.loadTheme(root, stylesheet).catch(() => []) : []
  const mainDocument = config.documents.find((path) => !path.includes("/")) ?? "shadcn-vite.par"
  const main = documents.find((entry) => entry.path === mainDocument)?.document
  const info: Omit<ProjectInfo, "guestUrl"> = {
    id: root,
    root,
    name: pkg.name ?? "shadcn-vite",
    renderer: { id: reactRenderer.id, name: reactRenderer.name },
    builder: { id: "vite", name: "Vite", toolVersion: "8" },
    ...(stylesheet ? { styles: { id: tailwindStyles.id, name: tailwindStyles.name, stylesheet } } : {}),
    theme,
    componentCount: Object.keys(config.components).length,
    sources: config.components,
    libraries: config.libraries,
    ...(config.storybook ? { storybook: config.storybook } : {}),
    ...(config.describedTokens ? { describedTokens: config.describedTokens } : {}),
    notes: config.notes,
    detection: await detectProject(root, pkg),
    documents,
    mainDocument,
    modes: { settings: main?.modes ?? defaultModeSettings, custom: !!main?.modes }
  }
  return { config, info, components: inferProps(root, config.components) }
}

function readDesigns(path: string, text: string): CanvasDocument {
  const value: unknown = JSON.parse(text)
  return path.endsWith(libraryManifestExtension)
    ? libraryCanvas(parseLibraryManifest(value))
    : parseCanvasDocument(value)
}
