// Reads components with the TypeScript checker off the service's main thread: it can take seconds on a large project.
import { relative } from "node:path"
import { parentPort } from "node:worker_threads"
import type { ComponentSource } from "@parity/core"
import { findComponents } from "@parity/libgen"
import { type CheckedComponent, readTsconfig } from "@parity/project"
import { inferProps } from "@parity/props"

type Request =
  | { id: number; kind: "props"; root: string; components: Record<string, ComponentSource> }
  | { id: number; kind: "check"; root: string; files: string[] }

parentPort?.on("message", (request: Request) => {
  try {
    const result =
      request.kind === "check" ? check(request.root, request.files) : inferProps(request.root, request.components)
    parentPort?.postMessage({ id: request.id, result })
  } catch (error) {
    parentPort?.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) })
  }
})

/**
 * The components the app's files export, as TypeScript's checker sees them: what each export's type is, not how it's
 * written, so aliases such as `const Select = SelectPrimitive.Root` and components returning only `children` count.
 */
function check(root: string, files: string[]): CheckedComponent[] {
  const options = readTsconfig(root).app?.options
  const base = root.replaceAll("\\", "/")
  const report = findComponents({
    entries: files.map((file) => `${base}/${file}`),
    root,
    ...(options ? { compilerOptions: options } : {}),
    defaultExports: true
  })
  return report.components.map((component) => ({
    name: component.name,
    path: relative(root, component.entry).replaceAll("\\", "/"),
    export: component.export,
    as: component.as
  }))
}
