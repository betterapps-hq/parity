import { existsSync, type FSWatcher, watch } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path"
import { viteBuilder } from "@parity/builder-vite"
import { leftOutChanges } from "@parity/code"
import {
  type BuilderAdapter,
  type BuilderDetection,
  type BuilderSession,
  type ComponentInfo,
  type ComponentSource,
  type CanvasDocument,
  defaultModeSettings,
  libraryCanvas,
  libraryManifestExtension,
  type PackageManifest,
  parseCanvasDocument,
  parseLibraryManifest,
  type ProjectDetection,
  type RendererAdapter,
  setCustomProperty,
  type StylesAdapter,
  type ThemeVariable,
  withLibraryCanvas
} from "@parity/core"
import {
  appFiles,
  checkedChanges,
  detectProject,
  discoverProject,
  filesChanged,
  importersOf,
  readChangedFiles,
  readTsconfig
} from "@parity/project"
import { reactRenderer } from "@parity/renderer-react"
import { tailwindStyles } from "@parity/styles-tailwind"
import type { ProjectInfo, ServiceMethods, TokenChange, WindowMethods } from "../shared/protocol.ts"
import { saveDetection, savedDetection } from "./detection-cache.ts"
import { checkComponents, closeChecker, inferComponents } from "./props.ts"
import { stopStorybook } from "./storybook.ts"

const renderers: RendererAdapter[] = [reactRenderer]
const builders: BuilderAdapter[] = [viteBuilder]
const stylesAdapters: StylesAdapter[] = [tailwindStyles]

const require = createRequire(import.meta.url)
const allowedOrigins = (process.env.PARITY_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean)

interface OpenProject {
  info: ProjectInfo
  session: BuilderSession
  /** Stylesheets token edits may write to, relative to the root. */
  stylesheets: string[]
  /** What each project file last held, as read or written here, so the watcher only reports changes from outside. */
  known: Map<string, string>
  watcher?: FSWatcher
  /** Where each component comes from, and the props inferred from its source (re-inferred when a source changes). */
  sources: Record<string, ComponentSource>
  components: Promise<Record<string, ComponentInfo>>
  /** What reads the app's files for components when they change, and the UI kit folder whose components load eagerly. */
  renderer: RendererAdapter
  uiKit?: string
}

type FileChange = WindowMethods["project.fileChanged"]["params"]
type ComponentsChange = WindowMethods["project.componentsChanged"]["params"]
let notifyFileChange: (change: FileChange) => void = () => undefined
let notifyComponents: (change: ComponentsChange) => void = () => undefined

/** Where changes to project files made outside the canvas are reported, and props re-inferred after a source edit. */
export function onFileChange(
  listener: (change: FileChange) => void,
  components: (change: ComponentsChange) => void
): void {
  notifyFileChange = listener
  notifyComponents = components
}

/** The project's components with their props, once inferred. */
export function projectComponents({
  projectId
}: ServiceMethods["project.components"]["params"]): Promise<Record<string, ComponentInfo>> {
  return getProject(projectId).components
}

/** Every project open in a tab. Each runs its own builder, so tabs never share a module graph. */
const projects = new Map<string, OpenProject>()
const opening = new Map<string, Promise<ProjectInfo>>()

/** A project's root from a folder, or from one of its `.par` files: the nearest folder above it with a package.json. */
export function projectRootFor(root: string | undefined): string {
  const path = normalize(resolve(root ?? process.env.PARITY_PROJECT ?? process.cwd()))
  if (!path.endsWith(".par")) return path
  for (let folder = dirname(path); ; folder = dirname(folder)) {
    if (existsSync(join(folder, "package.json"))) return folder
    if (dirname(folder) === folder) return dirname(path)
  }
}

export function openProject(root: string): Promise<ProjectInfo> {
  const existing = projects.get(root)
  if (existing) return Promise.resolve(existing.info)
  let pending = opening.get(root)
  if (!pending) {
    pending = start(root).finally(() => opening.delete(root))
    opening.set(root, pending)
  }
  return pending
}

export async function closeProject(projectId: string): Promise<undefined> {
  const project = projects.get(projectId)
  projects.delete(projectId)
  closeChecker(projectId, projects.size === 0 && opening.size === 0)
  stopStorybook(projectId)
  project?.watcher?.close()
  await project?.session.close()
  return undefined
}

export function getProject(projectId: string): OpenProject {
  const project = projects.get(projectId)
  if (!project) throw new Error(`No open project at ${projectId}`)
  return project
}

async function start(root: string): Promise<ProjectInfo> {
  const pkg = (await readJson(join(root, "package.json"))) as PackageManifest
  const renderer = renderers.find((adapter) => adapter.detect(pkg))
  if (!renderer) throw new Error(`No renderer supports ${pkg.name ?? root}`)
  const found = await findBuilder(root)
  const detection = await detectProject(
    root,
    pkg,
    found.builder && { id: found.builder.id, detection: found.detection }
  )
  // An untested version may be why something below fails, so any error ends with the note naming it.
  const explain = (problem: string) => (detection.notice ? `${problem}\n\n${detection.notice}` : problem)
  if (!found.builder) throw new Error(explain(`No builder supports ${root}.\n${found.misses.join("\n")}`))
  const { builder } = found
  const config = await discoverProject(root, renderer, pkg)
  // What the type checker and props found last time, when nothing they read has changed since.
  const discovered = { ...config.components }
  const { fingerprint, saved } = await savedDetection(root, config)
  if (saved) {
    for (const id of Object.keys(config.components)) if (!(id in saved.sources)) delete config.components[id]
    Object.assign(config.components, saved.sources)
    config.notes.push("components and props as the type checker found them last time, since then nothing has changed")
  }

  // One broken project file shouldn't hide the others; its error is shown instead.
  const known = new Map<string, string>()
  const documents = await Promise.all(
    config.documents.map(async (path) => {
      try {
        const text = await readFile(join(root, path), "utf8")
        known.set(path, text)
        return { path, document: readDesigns(path, text) }
      } catch (error) {
        return { path, error: message(error) }
      }
    })
  )
  const [session, styles] = await Promise.all([
    builder
      .start({
        root,
        config,
        renderer,
        rendererGuestPath: require.resolve(renderer.guestModule),
        allowedOrigins
      })
      .catch((error: unknown) => {
        throw new Error(explain(message(error)), { cause: error })
      }),
    loadStyles(root, config.styles, detection)
  ])
  const mainDocument = pickMainDocument(config.documents, pkg.name ?? basename(root))
  const main = documents.find((entry) => entry.path === mainDocument)?.document
  const info: ProjectInfo = {
    id: root,
    root,
    name: pkg.name ?? basename(root),
    renderer: { id: renderer.id, name: renderer.name },
    builder: { id: builder.id, name: builder.name, toolVersion: session.toolVersion },
    styles: styles.info,
    theme: styles.theme,
    guestUrl: session.guestUrl,
    componentCount: Object.keys(config.components).length,
    sources: config.components,
    libraries: config.libraries,
    ...(config.storybook ? { storybook: config.storybook } : {}),
    ...(config.describedTokens ? { describedTokens: config.describedTokens } : {}),
    notes: config.notes,
    detection,
    documents,
    mainDocument,
    modes: { settings: main?.modes ?? defaultModeSettings, custom: !!main?.modes },
    ...(saved?.leftOut ? { leftOut: saved.leftOut } : {})
  }
  const project: OpenProject = {
    info,
    session,
    stylesheets: config.styles,
    known,
    sources: config.components,
    components: saved ? Promise.resolve(saved.props) : inferProps(root, config.components, config.componentFiles),
    renderer,
    ...(config.uiKit ? { uiKit: config.uiKit } : {})
  }
  project.watcher = watchProjectFiles(project)
  if (!saved) {
    void checkTypes(project, config.componentFiles).then(async (ran) => {
      if (!ran || projects.get(root) !== project) return
      const found = { sources: project.sources, props: await project.components, leftOut: project.info.leftOut ?? [] }
      await saveDetection(root, config.componentFiles, discovered, fingerprint, found)
    })
  }
  projects.set(root, project)
  console.log(`[service] ${info.name}: ${renderer.name} via ${builder.name} ${session.toolVersion} at ${info.guestUrl}`)
  for (const found of [detection.packageManager, ...detection.tools]) console.log(`[service]   ${found.summary}`)
  for (const note of config.notes) console.log(`[service]   ${note}`)
  if (styles.info) console.log(`[service]   ${styles.theme.length} theme variables from ${styles.info.name}`)
  return info
}

async function loadStyles(
  root: string,
  stylesheets: string[],
  detection: ProjectDetection
): Promise<{ info?: ProjectInfo["styles"]; theme: ThemeVariable[] }> {
  for (const stylesheet of stylesheets) {
    const source = await readFile(join(root, stylesheet), "utf8").catch(() => "")
    const adapter = stylesAdapters.find((candidate) => candidate.detect(source))
    if (!adapter) continue
    const info = { id: adapter.id, name: adapter.name, stylesheet }
    try {
      return { info, theme: await adapter.loadTheme(root, stylesheet) }
    } catch (error) {
      // An untested version is tried like any other; if it fails, the error says it's untested.
      const tool = detection.tools.find((candidate) => candidate.id === adapter.id)
      const untested = tool?.status === "dropped" ? ` (${tool.summary})` : ""
      return { info: { ...info, error: `${message(error)}${untested}` }, theme: [] }
    }
  }
  return { theme: [] }
}

/**
 * The project file new designs, components and modes go into: the `.par` at the project's root if there is one (the
 * first, if there are several), else a library's own `.lib.par`, else any `.par`, else a new one named after the
 * package.
 */
function pickMainDocument(documents: string[], name: string): string {
  const library = (path: string) => path.endsWith(libraryManifestExtension)
  const found =
    documents.find((path) => !path.includes("/") && !library(path)) ??
    documents.find(library) ??
    documents.find((path) => !library(path))
  if (found) return found
  const slug = name
    .split("/")
    .at(-1)!
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/^-|-$/g, "")
  return `${slug || "project"}.par`
}

/** A project file's designs: a `.par` is them, and a library's `.lib.par` keeps them in its `canvas`. */
function readDesigns(path: string, text: string): CanvasDocument {
  const value: unknown = JSON.parse(text)
  return path.endsWith(libraryManifestExtension)
    ? libraryCanvas(parseLibraryManifest(value))
    : parseCanvasDocument(value)
}

/**
 * Writes a project file. Existing ones can be rewritten, and new ones created under the project as long as they end in
 * `.par`.
 */
export async function saveDocument({
  projectId,
  path,
  document
}: ServiceMethods["document.save"]["params"]): Promise<undefined> {
  const project = getProject(projectId)
  const entry = project.info.documents.find((candidate) => candidate.path === path)
  if (entry && !entry.document) throw new Error(`${path} couldn't be read, so it isn't overwritten`)
  const target = resolve(project.info.root, path)
  if (!target.startsWith(project.info.root) || !path.endsWith(".par")) {
    throw new Error(`${path} is not a .par file inside the project`)
  }
  const parsed = parseCanvasDocument(document)
  // A `.lib.par` keeps its designs in `canvas`, beside what its author wrote about the library.
  const value = path.endsWith(libraryManifestExtension)
    ? withLibraryCanvas(JSON.parse(await readFile(target, "utf8")), parsed)
    : parsed
  const text = `${JSON.stringify(value, null, 2)}\n`
  project.known.set(path, text)
  await writeFile(target, text)
  if (entry) entry.document = parsed
  else project.info.documents.push({ path, document: parsed })
  return undefined
}

/** Writes a copy of the designs wherever the person chose in the save dialog. The project's own files don't change. */
export async function saveDocumentCopy({
  path,
  document
}: ServiceMethods["document.saveCopy"]["params"]): Promise<undefined> {
  if (!isAbsolute(path) || !path.endsWith(".par")) throw new Error(`${path} is not a .par file`)
  await writeFile(
    path,
    `${JSON.stringify(parseCanvasDocument(document), null, 2)}
`
  )
  return undefined
}

/**
 * Writes token values into the project's stylesheet: semantic tokens into `:root` or their theme class, theme scale
 * tokens into an `@theme` block, editing declarations in place where they already exist.
 */
export async function saveTokens({
  projectId,
  changes
}: ServiceMethods["tokens.save"]["params"]): Promise<{ files: string[] }> {
  const project = getProject(projectId)
  const stylesheet = project.info.styles?.stylesheet ?? project.stylesheets[0]
  if (!stylesheet) throw new Error("The project has no stylesheet to write tokens to")
  const path = join(project.info.root, stylesheet)
  const themeNames = new Set(project.info.theme.map((variable) => variable.name))
  let source = await readFile(path, "utf8")
  for (const change of changes) source = applyTokenChange(source, change, themeNames.has(change.name))
  await writeFile(path, source)
  // Keep the theme in step, so a reopened tab sees the new values before the builder recompiles.
  for (const change of changes) {
    const variable = project.info.theme.find((candidate) => candidate.name === change.name)
    if (variable && change.theme === "default") variable.value = change.value
  }
  return { files: [stylesheet] }
}

function applyTokenChange(source: string, change: TokenChange, isTheme: boolean): string {
  if (change.theme !== "default") {
    const selector = `.${change.theme}`
    return setCustomProperty(source, change.name, change.value, { blocks: [selector], create: selector })
  }
  if (isTheme) {
    return setCustomProperty(source, change.name, change.value, {
      blocks: ["@theme", "@theme inline", "@theme static", ":root"],
      create: "@theme"
    })
  }
  return setCustomProperty(source, change.name, change.value, { blocks: [":root", ":host"], create: ":root" })
}

/**
 * Watches the project's `.par` files, so edits made outside the canvas (by an agent, git, or a text editor) show up in
 * it. Writes from the canvas itself are recognized by their content and ignored. Its component files are read again
 * when they're added, changed, renamed or deleted, a moment after the last change.
 */
function watchProjectFiles(project: OpenProject): FSWatcher | undefined {
  const { root } = project.info
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const changed = new Set<string>()
  let rescanning: Promise<void> = Promise.resolve()
  const rescan = () => {
    const paths = [...changed]
    changed.clear()
    rescanning = rescanning
      .then(() => rescanComponents(project, paths))
      .catch((error: unknown) => {
        console.warn(`[service] couldn't read the changed components: ${message(error)}`)
      })
  }
  const reload = async (path: string) => {
    let text: string
    try {
      text = await readFile(join(root, path), "utf8")
    } catch {
      return
    }
    if (project.known.get(path) === text) return
    project.known.set(path, text)
    try {
      const document = readDesigns(path, text)
      const entry = project.info.documents.find((candidate) => candidate.path === path)
      if (entry) Object.assign(entry, { document, error: undefined })
      else project.info.documents.push({ path, document })
      console.log(`[service] ${path} changed on disk`)
      notifyFileChange({ projectId: project.info.id, path, document })
    } catch (error) {
      // Often a file caught mid-write; the next change event brings the rest.
      console.warn(`[service] ${path} changed on disk but can't be read: ${message(error)}`)
    }
  }
  try {
    return watch(root, { recursive: true }, (_event, name) => {
      const path = name?.toString().replaceAll("\\", "/")
      if (!path || path.split("/").includes("node_modules")) return
      if (project.renderer.componentExtensions.some((extension) => path.endsWith(extension))) {
        if (path.split("/").some((part) => part.startsWith("."))) return
        changed.add(path)
        clearTimeout(timers.get("components"))
        timers.set("components", setTimeout(rescan, 400))
        return
      }
      if (!path.endsWith(".par")) return
      // Only the project's own `.lib.par`, at its root, holds designs.
      if (path.endsWith(libraryManifestExtension) && path.includes("/")) return
      clearTimeout(timers.get(path))
      timers.set(
        path,
        setTimeout(() => void reload(path), 120)
      )
    })
  } catch (error) {
    console.warn(`[service] can't watch ${root} for changes: ${message(error)}`)
    return undefined
  }
}

/**
 * Runs the type checker over the app's files once props are read, so the list gains what the parse can't see, such as
 * `const Select = SelectPrimitive.Root`, and loses the UI kit's undecided exports that aren't components. The builder
 * serves the guest from `sources`, so a guest loaded later has the new ones; the canvas hears about them and adds them
 * to the guest it has. Whether the checker read them, so what it found can be saved.
 */
async function checkTypes(project: OpenProject, files: string[]): Promise<boolean> {
  const { root, id } = project.info
  if (files.length === 0) return true
  await project.components
  let checked: Awaited<ReturnType<typeof checkComponents>>
  try {
    checked = await checkComponents(root, files)
  } catch (error) {
    console.warn(`[service] the type checker couldn't read the components: ${message(error)}`)
    return false
  }
  if (projects.get(root) !== project) return false
  const { added, confirmed, removed } = checkedChanges(project.sources, checked.components)
  project.info.leftOut = checked.leftOut
  for (const name of removed) delete project.sources[name]
  Object.assign(project.sources, confirmed, added)
  project.info.componentCount = Object.keys(project.sources).length
  console.log(
    `[service]   the type checker added ${Object.keys(added).length} components and left out ${removed.length}`
  )
  if (Object.keys(added).length === 0 && removed.length === 0) {
    const components = await project.components
    if (projects.get(root) === project) {
      notifyComponents({ projectId: id, components, sources: project.sources, leftOut: checked.leftOut })
    }
    return true
  }
  const before = project.components
  project.components = Promise.all([before, inferProps(root, added)]).then(([known, more]) => {
    const all = { ...known, ...more }
    for (const name of removed) delete all[name]
    return all
  })
  const components = await project.components
  if (projects.get(root) === project) {
    notifyComponents({ projectId: id, components, sources: project.sources, leftOut: checked.leftOut })
  }
  return true
}

/**
 * Brings the component list up to date after files changed: the parse reads the changed files again, so added,
 * renamed and deleted components show at once, and props are read again. The type checker then settles the changed
 * files and the files that import them, which is all a change can affect.
 */
async function rescanComponents(project: OpenProject, paths: string[]): Promise<void> {
  const { root, id } = project.info
  const tsconfig = readTsconfig(root)
  const { files } = await appFiles(root, project.renderer, tsconfig)
  const read = await readChangedFiles(root, project.renderer, files, project.uiKit, paths)
  const update = filesChanged(project.sources, read)
  const current = () => projects.get(root) === project
  if (!current()) return
  const settle = async (next: Record<string, ComponentSource>, label: string, added: number, removed: number) => {
    // In place, since the builder serves the guest from this list.
    for (const name of Object.keys(project.sources)) if (!(name in next)) delete project.sources[name]
    Object.assign(project.sources, next)
    project.info.componentCount = Object.keys(project.sources).length
    project.components = inferProps(root, project.sources)
    const components = await project.components
    if (added > 0 || removed > 0) console.log(`[service]   ${label}: ${added} components added, ${removed} left out`)
    const leftOut = project.info.leftOut ?? []
    if (current()) notifyComponents({ projectId: id, components, sources: project.sources, leftOut })
  }
  const what = paths.length === 1 ? paths[0] : `${paths.length} files`
  await settle(update.sources, `${what} changed`, update.added.length, update.removed.length)

  const inApp = new Set(files)
  const reread = [...read.keys()].filter((path) => inApp.has(path) && read.get(path))
  if (reread.length === 0) return
  const toCheck = [...reread, ...(await importersOf(root, files, reread, tsconfig))]
  let checked: Awaited<ReturnType<typeof checkComponents>>
  try {
    checked = await checkComponents(root, toCheck)
  } catch (error) {
    console.warn(`[service] the type checker couldn't read the changed components: ${message(error)}`)
    return
  }
  if (!current()) return
  const { added, confirmed, removed } = checkedChanges(project.sources, checked.components, new Set(toCheck))
  const before = project.info.leftOut ?? []
  project.info.leftOut = leftOutChanges(before, new Set(toCheck), checked.leftOut)
  const unchanged = Object.keys(added).length === 0 && removed.length === 0 && Object.keys(confirmed).length === 0
  if (unchanged && JSON.stringify(project.info.leftOut) === JSON.stringify(before)) return
  const next = { ...project.sources, ...confirmed, ...added }
  for (const name of removed) delete next[name]
  await settle(next, "the type checker", Object.keys(added).length, removed.length)
}

/** Props inference that never fails the project: without it, panels fall back to free-form props. */
function inferProps(
  root: string,
  sources: Record<string, ComponentSource>,
  files?: string[]
): Promise<Record<string, ComponentInfo>> {
  return inferComponents(root, sources, files).catch((error: unknown) => {
    console.warn(`[service] couldn't infer component props: ${message(error)}`)
    return {}
  })
}

/** The first builder that recognises the project, with what it found; otherwise what each one looked for. */
async function findBuilder(
  root: string
): Promise<{ builder: BuilderAdapter; detection: BuilderDetection } | { builder?: undefined; misses: string[] }> {
  const misses: string[] = []
  for (const builder of builders) {
    const detection = await builder.detect(root)
    if (detection.found) return { builder, detection }
    misses.push(`${builder.name}: ${detection.summary}`)
  }
  return { misses }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    throw new Error(`Could not read ${path}: ${message(error)}`, { cause: error })
  }
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
