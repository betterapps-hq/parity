/**
 * A route as React Router's route config holds it, which `react-router routes --json` prints: its id, its module's
 * file from the app's folder, its path below its parent's, whether it's its parent's index, and its children.
 */
export interface ConfigRoute {
  id: string
  /** Its module, from the app's folder (`app`), with forward slashes: `routes/home.tsx`. */
  file: string
  /** Its path below its parent's, as React Router writes it: `:projectId`, `docs/*`. Undefined for a layout or index. */
  path?: string
  index: boolean
  children: ConfigRoute[]
}

/** The project's files, as the extension reads them through Parity. */
export interface ProjectFiles {
  /** A file's text, by its path from the project's root, or undefined when it isn't there. */
  read(path: string): Promise<string | undefined>
  /** The names in a folder, by its path from the project's root, each marked when it's a folder. Empty when it isn't there. */
  list(folder: string): Promise<{ name: string; folder: boolean }[]>
}

/** The extensions a route module may have, in the order React Router looks for them. */
export const routeModuleExtensions = [".js", ".jsx", ".ts", ".tsx", ".md", ".mdx"]

/**
 * A route's id from its file, as React Router's `createRouteId` makes it: the file without its extension, with `.` and
 * `..` folded away.
 */
export function routeIdOf(file: string): string {
  return normalizePath(file.replace(/\.[a-z0-9]+$/i, ""))
}

/** A path with forward slashes, and its `.` and `..` folded away: `routes/../root.tsx` is `root.tsx`. */
export function normalizePath(path: string): string {
  const parts: string[] = []

  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (part === "..") {
      parts.pop()
    } else if (part !== "." && part !== "") {
      parts.push(part)
    }
  }

  return parts.join("/")
}

/** A relative path resolved against a folder, both with forward slashes, without a leading slash. */
export function joinFolder(folder: string, path: string): string {
  return normalizePath(folder === "" ? path : `${folder}/${path}`)
}
