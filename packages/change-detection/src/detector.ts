/**
 * What a project's changes are counted from, swapped by the project (PAR-1074): git's last commit, and later a `.par`
 * file's last save or the hashes of screens marked approved. The service asks each detector in turn whether it can
 * count the project, and uses the first that can; a project none can count is counted from each frame's first trace
 * (PAR-997). It runs in the service, which reads files and runs processes; this package only says what it does.
 */
export interface ChangeDetector {
  id: string
  name: string
  /** Whether it can count the project at `root`'s changes, as git can for a folder inside a repository. */
  detect(root: string): Promise<boolean>
  /**
   * The project's files that differ from the baseline, by path from `root` with forward slashes, as a trace lists them;
   * undefined when it can't say this time, and the frame's first trace stands in.
   */
  changedFiles(root: string): Promise<ReadonlySet<string> | undefined>
  /**
   * Calls `moved` each time the baseline moves, as a commit moves git's, since that changes what's changed without
   * changing a file a frame reads. Resolves, once it's watching, to what stops it.
   */
  watch(root: string, moved: () => void): Promise<() => void>
}
