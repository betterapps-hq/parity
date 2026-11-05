/**
 * The projects the start page lists, from what the window remembers: the recent ones in order, and the starred ones
 * after them. Data in, data out, so it's tested without a window.
 */

/** What the window keeps about a project besides its place in the recent list. */
export interface ProjectNote {
  /** When it last opened, in milliseconds since 1970. */
  opened?: number
  starred?: boolean
}

/** A project the start page can show. */
export interface KnownProject {
  /** Its folder. */
  root: string
  /** Its folder's name, as the File menu's Open recent names it. */
  name: string
  /** When it last opened; unknown for one opened before the window kept the time. */
  opened?: number
  starred: boolean
  /** Whether it's on the recent list, which removing it from there takes it off. */
  recent: boolean
}

/** Which of them a list shows. Shared with you has none until projects can be shared. */
export type ProjectScope = "recent" | "starred" | "shared" | "all"

/** The recent projects in order, then starred ones that aren't recent, last opened first. */
export function knownProjects(recent: readonly string[], notes: Readonly<Record<string, ProjectNote>>): KnownProject[] {
  const known = (root: string, isRecent: boolean): KnownProject => ({
    root,
    name: folderName(root),
    ...(notes[root]?.opened === undefined ? {} : { opened: notes[root].opened }),
    starred: !!notes[root]?.starred,
    recent: isRecent
  })
  const starred = Object.keys(notes)
    .filter((root) => notes[root]!.starred && !recent.includes(root))
    .map((root) => known(root, false))
    .sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0))
  return [...recent.map((root) => known(root, true)), ...starred]
}

/** The projects a list shows, leaving out `skip`, as Home leaves out the one it offers to continue. */
export function inScope(projects: readonly KnownProject[], scope: ProjectScope, skip?: string): KnownProject[] {
  return projects.filter((project) => {
    if (scope === "shared") return false
    if (scope === "starred") return project.starred
    if (scope === "recent") return project.recent && project.root !== skip
    return true
  })
}

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

/**
 * When something happened, to follow a verb: "just now", "12 minutes ago", "3 hours ago", "yesterday at 6:40 PM", "on
 * Monday", "on October 3", or "on October 3, 2025" for another year.
 */
export function whenLabel(time: number, now: number): string {
  const ago = now - time
  if (ago < minute) return "just now"
  if (ago < hour) {
    const minutes = Math.floor(ago / minute)
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`
  }
  const then = new Date(time)
  const today = startOfDay(new Date(now))
  if (time >= today) {
    const hours = Math.floor(ago / hour)
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`
  }
  if (time >= today - day) return `yesterday at ${then.toLocaleTimeString("en-US", { timeStyle: "short" })}`
  if (time >= today - 6 * day) return `on ${then.toLocaleDateString("en-US", { weekday: "long" })}`
  const sameYear = then.getFullYear() === new Date(now).getFullYear()
  return `on ${then.toLocaleDateString("en-US", { month: "long", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })}`
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** A hue for a project's picture, the same each time for the same folder. */
export function projectHue(root: string): number {
  let hash = 0
  for (const character of root) hash = (hash * 31 + character.charCodeAt(0)) % 360
  return hash
}

/** The last part of a path, on Windows or anywhere else. */
export function folderName(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path
}
