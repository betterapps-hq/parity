import type { Permissions } from "@parity-app/extension-api"

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
