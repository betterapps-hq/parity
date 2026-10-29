import { spawn } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { addCommand, detectPackageManager, libraryCatalog } from "@parity/project"
import type { ServiceMethods } from "../shared/protocol.ts"
import { getProject } from "./projects.ts"

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
  const log = await run(command, args, project.info.root)
  if (definition.tailwindEntry) {
    await importLibraryStyles(
      project.info.root,
      stylesheetOf(projectId),
      `${definition.package}/${definition.tailwindEntry}`
    )
  }
  return { log }
}

export async function importStyles({ projectId, library }: ServiceMethods["library.importStyles"]["params"]) {
  const { info } = getProject(projectId)
  const installed = info.libraries.find((candidate) => candidate.id === library)
  if (!installed?.tailwindEntry) throw new Error(`${library} has no styles to import`)
  await importLibraryStyles(info.root, stylesheetOf(projectId), `${installed.importName}/${installed.tailwindEntry}`)
  installed.stylesImported = true
  return undefined
}

function stylesheetOf(projectId: string): string {
  const project = getProject(projectId)
  const stylesheet = project.info.styles?.stylesheet ?? project.stylesheets[0]
  if (!stylesheet) throw new Error("The project has no stylesheet to import the library's styles into")
  return stylesheet
}

/**
 * Imports a library's styles right after Tailwind, so the library's own token defaults come first and the project's
 * tokens, declared later in the file, still win.
 */
async function importLibraryStyles(root: string, stylesheet: string, specifier: string): Promise<void> {
  const path = join(root, stylesheet)
  const source = await readFile(path, "utf8")
  if (source.includes(specifier)) return
  const line = `@import "${specifier}";`
  const lines = source.split("\n")
  const tailwind = lines.findIndex((text) => /^@import\s+["']tailwindcss["']/.test(text.trim()))
  lines.splice(tailwind + 1, 0, line)
  await writeFile(path, lines.join("\n"))
}

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Package managers are .cmd scripts on Windows, which only start through a shell. The arguments are package
    // names from the catalog, never anything typed.
    const child = spawn(command, args, { cwd, shell: process.platform === "win32", env: process.env })
    let log = ""
    child.stdout.on("data", (chunk: Buffer) => (log += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (log += chunk.toString()))
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0 ? resolve(log) : reject(new Error(`${command} ${args.join(" ")} failed:\n${log.slice(-2000)}`))
    )
  })
}
