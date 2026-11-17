import { readFile } from "node:fs/promises"
import { join, relative } from "node:path"
import type { LibraryRemovalPlan, LibrarySetupPlan } from "@parity-app/extension"
import { endedByItself, type Lifecycle } from "@parity-app/processes"
import {
  addCommand,
  detectPackageManager,
  type FileEdit,
  installCommand,
  libraryCatalog,
  type LibraryPreview,
  libraryPreview,
  removeCommand,
  stylesheetsFrom,
  withoutStylesImport,
  withPackageChanges,
  withStylesImport
} from "@parity-app/project"
import { registryCatalog } from "@parity-app/registry"
import { logNote } from "../shared/log.ts"
import type { CatalogLibrary, ProjectEditResult, ServiceMethods } from "../shared/protocol.ts"
import { spawnChild } from "./children.ts"
import { applyProjectEdit } from "./edits.ts"
import { trackProcess } from "./processes.ts"
import { message, type OpenProject, type ProjectProviders } from "./projects.ts"

/**
 * The component libraries the person can add, in the order the registry's catalog offers them, each with its pages,
 * logo and look: one an extension sets up with the settings it asks for, the rest from their registry files. Then
 * libraries extensions offer that the catalog doesn't name, then the icon sets the registry has files for.
 */
export async function catalogFor(
  project: OpenProject,
  providers: ProjectProviders | undefined
): Promise<CatalogLibrary[]> {
  const { info } = project
  const provided = await providedCatalog(project, providers)
  const registry = await libraryCatalog()
  const offered = await registryCatalog()
  const has = (packageName: string) => info.libraries.some((installed) => installed.package === packageName)

  const components = offered.flatMap((entry): CatalogLibrary[] => {
    const own = provided.find((library) => library.id === entry.id)
    const definition = registry.find((library) => library.id === entry.id)
    const described = { logo: entry.logo, look: entry.look, companion: entry.companion }

    if (own) {
      return [{ ...own, kind: "components", ...described, links: own.links ?? entry.links }]
    }

    if (!definition) {
      return []
    }

    return [
      {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        package: definition.package,
        version: definition.version,
        kind: "components",
        installed: has(definition.package),
        links: entry.links,
        ...described
      }
    ]
  })

  const unlisted = provided
    .filter((library) => !offered.some((entry) => entry.id === library.id))
    .map((library): CatalogLibrary => ({ ...library, kind: "components" }))

  const icons = registry
    .filter((library) => library.kind === "icons")
    .map((library): CatalogLibrary => ({
      id: library.id,
      name: library.name,
      description: library.description,
      package: library.package,
      version: library.version,
      kind: "icons",
      installed: has(library.package)
    }))

  return [...components, ...unlisted, ...icons]
}

/**
 * What a library's registry file holds, shown before it's added: the file the catalog names for it with its settings
 * filled in, as shadcn's for the style chosen, else its own package's.
 */
export async function previewFor({
  library,
  settings = {}
}: ServiceMethods["library.preview"]["params"]): Promise<LibraryPreview | undefined> {
  const entry = (await registryCatalog()).find((candidate) => candidate.id === library)

  const packageName = entry?.preview
    ? entry.preview.replaceAll(/\{(\w+)\}/g, (_, setting: string) => settings[setting] ?? "")
    : (await libraryCatalog()).find((candidate) => candidate.id === library)?.package

  return packageName ? libraryPreview(packageName) : undefined
}

/** What the project's libraries provider can set up, or nothing when it has none or it can't say. */
async function providedCatalog(project: OpenProject, providers: ProjectProviders | undefined) {
  const answer = await providers
    ?.call(providerOf(project), { kind: "libraries", method: "catalog" })
    .catch((cause: unknown) => {
      logNote(`[service] couldn't ask which libraries ${project.info.name} can set up: ${message(cause)}`)

      return undefined
    })

  return answer ?? []
}

/** An open project as its extensions' providers see it. */
function providerOf({ info, pkg }: OpenProject) {
  return { root: info.root, name: info.name, pkg }
}

/**
 * Adds a library to the project, with the registry's icon sets `companions` names in the same install. One an extension
 * sets up is set up with the settings chosen: the extension says what that changes in package.json, Parity writes
 * it, then installs with the project's own package manager, whose install runs the scripts the
 * extension added. One from the registry is installed by name. Either has its Tailwind entry imported from the
 * project's stylesheet. The person asked for it from the canvas, so this changes their project.
 */
export async function addLibrary(
  project: OpenProject,
  providers: ProjectProviders | undefined,
  { library, settings = {}, companions = [] }: ServiceMethods["library.add"]["params"]
): Promise<ServiceMethods["library.add"]["result"]> {
  // Detected again, in case the project changed package manager since it opened.
  const packageManager = await detectPackageManager(project.info.root)
  const catalog = await libraryCatalog()
  const provided = (await providedCatalog(project, providers)).find((candidate) => candidate.id === library)

  const alongside = companions.map((id) => {
    const companion = catalog.find((candidate) => candidate.id === id)

    if (!companion) {
      throw new Error(`No library "${id}" to add alongside ${library}`)
    }

    return companion.package
  })

  if (provided) {
    const plan = await providers?.call(providerOf(project), {
      kind: "libraries",
      method: "add",
      params: { library, settings }
    })

    if (!plan) {
      throw new Error(`Nothing sets up ${provided.name}`)
    }

    const setUp = await applySetup(project, provided.name, plan)
    const packages = [...(plan.packages ?? []), ...alongside]

    const { command, args } =
      packages.length > 0 ? addCommand(packageManager.agent, packages) : installCommand(packageManager.agent)

    const named = { verb: "install", name: provided.name, package: provided.package, command, args } as const

    return runPackageManager(project, named, async () => {
      const styled = plan.styles ? await importLibraryStyles(project, provided.name, plan.styles) : undefined

      return styled ?? setUp
    })
  }

  const definition = catalog.find((candidate) => candidate.id === library)

  if (!definition) {
    throw new Error(`No library "${library}"`)
  }

  const { command, args } = addCommand(packageManager.agent, [definition.package, ...alongside])

  const named = { verb: "install", name: definition.name, package: definition.package, command, args } as const

  return runPackageManager(project, named, async () =>
    definition.tailwindEntry
      ? importLibraryStyles(project, definition.name, `${definition.package}/${definition.tailwindEntry}`)
      : undefined
  )
}

/** Writes what setting a library up changes in package.json. */
async function applySetup(
  project: OpenProject,
  name: string,
  plan: LibrarySetupPlan
): Promise<ProjectEditResult | undefined> {
  const { root } = project.info
  const source = await readFile(join(root, "package.json"), "utf8")
  const content = withPackageChanges(source, plan)

  if (content === source) {
    return undefined
  }

  return applyProjectEdit(project, {
    label: `Set up ${name}`,
    files: [{ kind: "replace", path: "package.json", expected: source, content }]
  })
}

/**
 * Takes a library out of the project: one an extension set up as its extension says, one from the registry by its own
 * package. package.json's scripts and the stylesheet change first, as one change, so an install script that sets the
 * library up again doesn't run while its packages are uninstalled.
 */
export async function removeLibrary(
  project: OpenProject,
  providers: ProjectProviders | undefined,
  { library }: ServiceMethods["library.remove"]["params"]
): Promise<ServiceMethods["library.remove"]["result"]> {
  const provided = (await providedCatalog(project, providers)).find((candidate) => candidate.id === library)
  const installed = project.info.libraries.find((candidate) => candidate.id === library)
  let plan: LibraryRemovalPlan | undefined
  let name: string

  if (provided) {
    plan = await providers?.call(providerOf(project), { kind: "libraries", method: "remove", params: { library } })
    name = provided.name
  } else if (installed) {
    const styles = installed.tailwindEntry ? `${installed.importName}/${installed.tailwindEntry}` : undefined
    plan = { packages: [installed.importName], styles }
    name = installed.name
  } else {
    throw new Error(`The project has no library "${library}" to remove`)
  }

  if (!plan) {
    throw new Error(`Nothing takes out ${name}`)
  }

  const edit = await applyRemoval(project, name, plan)
  const packages = plan.packages ?? []

  if (packages.length === 0) {
    return edit ? { edit } : {}
  }

  const packageManager = await detectPackageManager(project.info.root)
  const { command, args } = removeCommand(packageManager.agent, packages)
  const named = { verb: "remove", name, package: packages.join(", "), command, args } as const

  return runPackageManager(project, named, async () => edit)
}

/**
 * Writes what taking a library out changes in package.json's scripts and the stylesheets, as one change: its import is
 * taken from the app's stylesheet or whichever stylesheet it imports holds it, as a theme file.
 */
async function applyRemoval(
  project: OpenProject,
  name: string,
  plan: LibraryRemovalPlan
): Promise<ProjectEditResult | undefined> {
  const { root } = project.info
  const files: FileEdit[] = []

  if (plan.scripts) {
    const source = await readFile(join(root, "package.json"), "utf8")
    const content = withPackageChanges(source, { scripts: plan.scripts })

    if (content !== source) {
      files.push({ kind: "replace", path: "package.json", expected: source, content })
    }
  }

  const stylesheet = project.info.styles?.stylesheet ?? project.stylesheets[0]

  if (plan.styles && stylesheet) {
    for (const { path, source } of await stylesheetsFrom(join(root, stylesheet))) {
      const content = withoutStylesImport(source, plan.styles)
      const within = relative(root, path).replaceAll("\\", "/")

      if (content !== undefined && !within.startsWith("../")) {
        files.push({ kind: "replace", path: within, expected: source, content })
      }
    }
  }

  return files.length > 0 ? applyProjectEdit(project, { label: `Remove ${name}`, files }) : undefined
}

/** How the processes list names a package manager's run, by what it does. */
const runs = {
  install: { task: "Install", failed: "couldn't install", passed: "Added", stopped: "Installing" },
  remove: { task: "Remove", failed: "couldn't remove", passed: "Removed", stopped: "Removing" }
} as const

/**
 * Runs the package manager as a task in the processes list, then `after`, which imports what it installed. Gives what
 * the package manager printed, and the change `after` made.
 */
async function runPackageManager(
  project: OpenProject,
  library: { verb: keyof typeof runs; name: string; package: string; command: string; args: string[] },
  after: () => Promise<ProjectEditResult | undefined>
): Promise<{ log: string; edit?: ProjectEditResult }> {
  const { command, args } = library
  const words = runs[library.verb]
  let life: Lifecycle | undefined

  const task = trackProcess(
    {
      id: `install:${project.info.id}`,
      owner: { kind: "parity", role: "install" },
      lifetime: "task",
      name: `${words.task} ${library.name}`,
      projectId: project.info.id,
      project: project.info.name,
      state: "running",
      detail: [command, ...args].join(" ")
    },
    { stop: () => life?.stop() }
  )

  let log: string
  let edit: ProjectEditResult | undefined

  try {
    log = await run(command, args, project.info.root, (started) => (life = started))
    edit = await after()
  } catch (error) {
    if (task.stopping) {
      task.set("canceled")
      throw new Error(`${words.stopped} ${library.name} was canceled`, { cause: error })
    }

    task.set("failed", { summary: `${command} ${words.failed} ${library.package}`, error: message(error) })
    throw error
  }

  task.set("passed", { summary: `${words.passed} ${library.package}` })

  return edit ? { log, edit } : { log }
}

export async function importStyles(
  project: OpenProject,
  { library }: ServiceMethods["library.importStyles"]["params"]
): Promise<ProjectEditResult | undefined> {
  const { info } = project
  const installed = info.libraries.find((candidate) => candidate.id === library)

  if (!installed?.tailwindEntry) {
    throw new Error(`${library} has no styles to import`)
  }

  const edit = await importLibraryStyles(project, installed.name, `${installed.importName}/${installed.tailwindEntry}`)
  installed.stylesImported = true

  return edit
}

function stylesheetOf(project: OpenProject): string {
  const stylesheet = project.info.styles?.stylesheet ?? project.stylesheets[0]

  if (!stylesheet) {
    throw new Error("The project has no stylesheet to import the library's styles into")
  }

  return stylesheet
}

/** Imports a library's styles into the project's stylesheet, unless it imports them already. */
async function importLibraryStyles(
  project: OpenProject,
  name: string,
  specifier: string
): Promise<ProjectEditResult | undefined> {
  const stylesheet = stylesheetOf(project)
  const source = await readFile(join(project.info.root, stylesheet), "utf8")
  const content = withStylesImport(source, specifier)

  if (content === undefined) {
    return undefined
  }

  return applyProjectEdit(project, {
    label: `Import ${name}'s styles`,
    files: [{ kind: "replace", path: stylesheet, expected: source, content }]
  })
}

/** Runs the package manager in the project's folder, and settles with the end of what it printed once it succeeds. */
async function run(command: string, args: string[], cwd: string, started: (life: Lifecycle) => void): Promise<string> {
  const env = { ...process.env }

  // This is the project's package manager, whose install scripts may launch an Electron app of their own.
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === "ELECTRON_RUN_AS_NODE") {
      delete env[key]
    }
  }

  // Package managers are .cmd scripts on Windows, which only start through a shell. The arguments are package names
  // from the catalog or from a libraries provider's plan, which its schema checks, never anything typed.
  const life = spawnChild(command, args, { cwd, shell: process.platform === "win32", env })
  started(life)
  const exit = await life.exited

  if (exit.code === 0) {
    return exit.output
  }

  throw new Error(
    exit.error ? endedByItself(command, exit) : `${command} ${args.join(" ")} failed:\n${exit.output.trim()}`
  )
}
