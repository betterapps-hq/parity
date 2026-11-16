import type { Permissions } from "@parity-app/extension"

/*
 * What an extension's manifest lets it change. Permissions keep an extension's writes through Parity to what it declared,
 * so the person sees what it may touch; they aren't a sandbox, since its code runs in Node of its own.
 */

/** Why an extension can't change designs, or nothing when its manifest has the `edits` permission. */
export function editsRefusal(displayName: string, permissions: Permissions | undefined): string | undefined {
  return permissions?.edits
    ? undefined
    : `${displayName} can't change designs. Its manifest needs "edits": true under "permissions".`
}

/**
 * Why an extension can't write `path`, or nothing when its `write` permission names it: a `.par` file never, whatever
 * the permission says, since designs change through `parity.edits` so undo, recovery and saving keep working; and
 * nothing outside the project.
 */
export function writeRefusal(
  displayName: string,
  permissions: Permissions | undefined,
  path: string
): string | undefined {
  const normal = normalPath(path)

  if (normal === undefined) {
    return `${path} is outside the project`
  }

  if (normal.toLowerCase().endsWith(".par")) {
    return `${displayName} can't write ${path}: extensions change designs with parity.edits, never .par files`
  }

  if (!(permissions?.write ?? []).some((glob) => globPattern(glob).test(normal))) {
    return `${displayName} can't write ${path}. Its manifest's "write" permission doesn't name it.`
  }

  return undefined
}

/** Where an extension's read paths are worked out: the project's folder, the home folder, and the environment. */
export interface ReadPlace {
  root: string
  home: string
  variables: Record<string, string | undefined>
  /** As Node's `process.platform` says: on Windows, paths are compared without case. */
  platform: string
}

/**
 * The absolute path an extension may read or watch for `path`, from the project's root or absolute, or nothing when
 * its `read` permission doesn't name it. A glob is from the project's root, or from the home folder (`~/.portless/**`)
 * or an environment variable's folder (`$PORTLESS_STATE_DIR/**`), which names nothing while the variable isn't set.
 */
export function readablePath(path: string, permissions: Permissions | undefined, place: ReadPlace): string | undefined {
  const target = absolute(path, place.root)
  const fold = (text: string) => (place.platform === "win32" ? text.toLowerCase() : text)

  const allowed = (permissions?.read ?? []).some((glob) => {
    const expanded = expandedGlob(glob, place)

    return expanded !== undefined && globPattern(fold(expanded)).test(fold(target))
  })

  return allowed ? target : undefined
}

/**
 * Where a path is, from where it starts: the home folder (`~/`), a variable's folder (`$NAME`), or the project's root.
 * Nothing while its variable isn't set, or for an absolute path.
 */
export function placedPath(path: string, place: ReadPlace): string | undefined {
  return expandedGlob(path, place)
}

/** A read glob from where it starts: the home folder, a variable's folder, or the project's root. */
function expandedGlob(glob: string, place: ReadPlace): string | undefined {
  if (glob.startsWith("~/")) {
    return absolute(glob.slice(2), place.home)
  }

  const variable = /^\$([A-Za-z_]\w*)(\/.*)?$/.exec(glob)

  if (variable) {
    const folder = place.variables[variable[1]!]

    return folder ? absolute((variable[2] ?? "").replace(/^\//, ""), folder) : undefined
  }

  return isAbsolute(glob) ? undefined : absolute(glob, place.root)
}

function isAbsolute(path: string): boolean {
  return /^(?:[\\/]|[a-z]:)/i.test(path)
}

/** A path made absolute from `base` when it isn't, with forward slashes and `.` and `..` worked out. */
function absolute(path: string, base: string): string {
  const joined = (isAbsolute(path) ? path : `${base}/${path}`).replaceAll("\\", "/")
  const drive = /^[a-z]:/i.exec(joined)?.[0] ?? ""
  const parts: string[] = []

  for (const part of joined.slice(drive.length).split("/")) {
    if (part === "..") {
      parts.pop()
    } else if (part !== "" && part !== ".") {
      parts.push(part)
    }
  }

  return `${drive}/${parts.join("/")}`
}

/** A path from the project's root with `.` and `..` worked out, or nothing when it's absolute or leaves the project. */
function normalPath(path: string): string | undefined {
  const slashed = path.replaceAll("\\", "/")

  if (slashed.startsWith("/") || /^[a-z]:/i.test(slashed)) {
    return undefined
  }

  const parts: string[] = []

  for (const part of slashed.split("/")) {
    if (part === "..") {
      if (parts.length === 0) {
        return undefined
      }

      parts.pop()
    } else if (part !== "" && part !== ".") {
      parts.push(part)
    }
  }

  return parts.join("/")
}

/** A glob as a pattern: `**` for any folders, `*` for any name or part of one, `?` for one character. */
function globPattern(glob: string): RegExp {
  let pattern = ""

  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]!

    if (glob.startsWith("**/", index)) {
      pattern += "(?:.*/)?"
      index += 2
    } else if (glob.startsWith("**", index)) {
      pattern += ".*"
      index += 1
    } else if (char === "*") {
      pattern += "[^/]*"
    } else if (char === "?") {
      pattern += "[^/]"
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    }
  }

  return new RegExp(`^${pattern}$`)
}
