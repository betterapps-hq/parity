import { type ChildProcess, spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { addCommand, detectPackageManager, libraryCatalog, withStylesImport } from "@parity/project"
import type { ProjectEditResult, ServiceMethods } from "../shared/protocol.ts"
import { applyProjectEdit } from "./edits.ts"
import { killTree, trackProcess } from "./processes.ts"
import { getProject, message } from "./projects.ts"

export async function catalogFor({
  projectId
}: ServiceMethods["library.catalog"]["params"]): Promise<ServiceMethods["library.catalog"]["result"]> {
  const { info } = getProject(projectId)
  return (await libraryCatalog()).map((library) => ({
    id: library.id,
    name: library.name,
    description: library.description,
    package: library.package,
    kind: library.kind ?? "components",
    installed: info.libraries.some((installed) => installed.package === library.package)
  }))
}

/**
 * Adds a library to the project: installs it with the project's own package manager, then imports its Tailwind entry
 * from the project's stylesheet. The person asked for it from the canvas, so this changes their project.
 */
export async function addLibrary({
  projectId,
  library
}: ServiceMethods["library.add"]["params"]): Promise<ServiceMethods["library.add"]["result"]> {
  const project = getProject(projectId)
  const definition = (await libraryCatalog()).find((candidate) => candidate.id === library)
  if (!definition) throw new Error(`No library "${library}"`)
  // Detected again, in case the project changed package manager since it opened.
  const packageManager = await detectPackageManager(project.info.root)
  const { command, args } = addCommand(packageManager.agent, [definition.package])
  let child: ChildProcess | undefined
  const task = trackProcess(
    {
      id: `install:${projectId}`,
      kind: "install",
      shape: "task",
      name: `Install ${definition.name}`,
      projectId,
      project: project.info.name,
      status: "running",
      detail: [command, ...args].join(" ")
    },
    { stop: () => child?.pid && killTree(child.pid) }
  )
  let log: string
  let edit: ProjectEditResult | undefined
  try {
    log = await run(command, args, project.info.root, (spawned) => (child = spawned))
    if (definition.tailwindEntry) {
      edit = await importLibraryStyles(projectId, definition.name, `${definition.package}/${definition.tailwindEntry}`)
    }
  } catch (error) {
    if (task.stopping) {
      task.set("canceled")
      throw new Error(`Installing ${definition.name} was canceled`, { cause: error })
    }
    task.set("failed", { summary: `${command} couldn't install ${definition.package}`, error: message(error) })
    throw error
  }
  task.set("passed", { summary: `Added ${definition.package}` })
  return edit ? { log, edit } : { log }
}

export async function importStyles({
  projectId,
  library
}: ServiceMethods["library.importStyles"]["params"]): Promise<ProjectEditResult | undefined> {
  const { info } = getProject(projectId)
  const installed = info.libraries.find((candidate) => candidate.id === library)
  if (!installed?.tailwindEntry) throw new Error(`${library} has no styles to import`)
  const edit = await importLibraryStyles(
    projectId,
    installed.name,
    `${installed.importName}/${installed.tailwindEntry}`
  )
  installed.stylesImported = true
  return edit
}

function stylesheetOf(projectId: string): string {
  const project = getProject(projectId)
  const stylesheet = project.info.styles?.stylesheet ?? project.stylesheets[0]
  if (!stylesheet) throw new Error("The project has no stylesheet to import the library's styles into")
  return stylesheet
}

/** Imports a library's styles into the project's stylesheet, unless it imports them already. */
async function importLibraryStyles(
  projectId: string,
  name: string,
  specifier: string
): Promise<ProjectEditResult | undefined> {
  const project = getProject(projectId)
  const stylesheet = stylesheetOf(projectId)
  const source = await readFile(join(project.info.root, stylesheet), "utf8")
  const content = withStylesImport(source, specifier)
  if (content === undefined) return undefined
  return applyProjectEdit(project, {
    label: `Import ${name}'s styles`,
    files: [{ kind: "replace", path: stylesheet, expected: source, content }]
  })
}

function run(command: string, args: string[], cwd: string, started: (child: ChildProcess) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    // Package managers are .cmd scripts on Windows, which only start through a shell. The arguments are package
    // names from the catalog, never anything typed.
    const child = spawn(command, args, { cwd, shell: process.platform === "win32", env: process.env })
    started(child)
    let log = ""
    child.stdout.on("data", (chunk: Buffer) => (log += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (log += chunk.toString()))
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0 ? resolve(log) : reject(new Error(`${command} ${args.join(" ")} failed:\n${log.slice(-2000)}`))
    )
  })
}
