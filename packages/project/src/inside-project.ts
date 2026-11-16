import nodePath, { type PlatformPath } from "node:path"

/**
 * A path from a project's root, or an absolute one, as the file on disk, when it's inside the root; otherwise
 * `undefined`. It goes by the relative path rather than a prefix, so a sibling folder whose name starts with the root's,
 * as `D:\shop-old` for `D:\shop`, isn't inside it, and neither is the root itself, `..`, or another drive. On Windows
 * the comparison ignores case, as the disk does. It reads nothing, so a symlink is judged by where it sits; the project
 * service checks where one leads before it writes. `paths` is for tests of the other platform's paths.
 */
export function insideProject(root: string, path: string, paths: PlatformPath = nodePath): string | undefined {
  const target = paths.resolve(root, path)
  const relative = paths.relative(paths.resolve(root), target)
  const parent = relative === ".." || relative.startsWith(`..${paths.sep}`)

  return relative && !parent && !paths.isAbsolute(relative) ? target : undefined
}
