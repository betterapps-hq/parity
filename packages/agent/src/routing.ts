/**
 * Which running copy of Parity an agent's call goes to (PAR-514). Several copies can run at once, each with its own
 * projects open: the person's app, a dev session, `pnpm perf`. Agents care about the project, not the copy, so every
 * call is sent to the copy that has its project open. The CLI decides, once, with these rules, and sends that copy the
 * exact tab it chose; the app matches a tab reference with the same `matchTab`. Nothing here touches files or the
 * network, so the app's renderer can use it too.
 */

/** The registry entry's format. A copy whose entry is newer than the CLI reading it says so instead of being guessed at. */
export const registryVersion = 1

/** How to reach one running copy: what it writes to its registry entry. */
export interface CopyEntry {
  version: number
  url: string
  token: string
  /** The app's main process, which names the copy and its entry. A service the app restarts is the same copy. */
  app: number
  /** When the copy started, in milliseconds since the epoch. A project open in two copies goes to the older one. */
  startedAt: number
}

/** What a copy says about itself when asked, live, so it can't go stale the way a file would. */
export interface CopyReport<T extends RoutedTab = RoutedTab> {
  tabs: T[]
  /** When its window last had focus, in milliseconds since the epoch; missing from a copy too old to say. */
  focusedAt?: number
}

/** The part of a tab routing reads. */
export interface RoutedTab {
  id: string
  name: string
  root: string
  active: boolean
}

/** A running copy and what it said about itself. */
export interface Copy<T extends RoutedTab = RoutedTab> {
  entry: CopyEntry
  report: CopyReport<T>
}

/** The reference that names what the person is looking at: the active tab of the copy they used last. */
export const activeTab = "active"

/** Reads a registry entry's text, or nothing when it isn't one. A file from before the registry stands for its copy. */
export function readCopyEntry(text: string | undefined): CopyEntry | undefined {
  if (text === undefined) return undefined
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const fields = new Map<string, unknown>(Object.entries(value))
  const [version, url, token, app, pid, startedAt] = ["version", "url", "token", "app", "pid", "startedAt"].map((key) =>
    fields.get(key)
  )
  if (typeof url !== "string" || typeof token !== "string") return undefined
  const number = (field: unknown) => (typeof field === "number" ? field : undefined)
  return {
    version: number(version) ?? 0,
    url,
    token,
    app: number(app) ?? number(pid) ?? 0,
    startedAt: number(startedAt) ?? 0
  }
}

/**
 * A project folder as routing compares it: forward slashes, no trailing slash, and on Windows (a drive letter or a
 * share) without case, since `C:\Work` and `c:/work` are the same folder there.
 */
export function normalizeRoot(path: string): string {
  const windows = /^(?:[A-Za-z]:|[\\/]{2})/.test(path)
  let normal = windows ? path.replaceAll("\\", "/") : path
  normal = normal.replace(/(?<!^)\/{2,}/g, "/")
  if (normal.length > 1 && !/^[A-Za-z]:\/$/.test(normal)) normal = normal.replace(/\/+$/, "")
  return windows ? normal.toLowerCase() : normal
}

/** The tab a reference names: its id, then its project folder, then its name. */
export function matchTab<T extends Omit<RoutedTab, "active">>(tabs: readonly T[], reference: string): T | undefined {
  const root = normalizeRoot(reference)
  return (
    tabs.find((tab) => tab.id === reference) ??
    tabs.find((tab) => normalizeRoot(tab.root) === root) ??
    tabs.find((tab) => tab.name === reference)
  )
}

/** The open project a folder is in: the deepest one whose folder holds it, so a nested project wins over its parent. */
export function projectFor<T extends Pick<RoutedTab, "root">>(folder: string, tabs: readonly T[]): T | undefined {
  const inside = normalizeRoot(folder)
  let best: T | undefined
  for (const tab of tabs) {
    const root = normalizeRoot(tab.root)
    const holds = inside === root || inside.startsWith(root.endsWith("/") ? root : `${root}/`)
    if (holds && (!best || root.length > normalizeRoot(best.root).length)) best = tab
  }
  return best
}

/** What an agent's call asks for. */
export type Request =
  /** A call on one tab, named by `tab` or else by the folder the agent works in. */
  | { kind: "tab"; tab?: string; folder: string }
  /** Opening a project: the copy that has it open already, or else the one the person used last. */
  | { kind: "open"; root: string }

/** Where a call goes, or why it can't go anywhere. */
export type Route<T extends RoutedTab = RoutedTab> =
  | { kind: "copy"; copy: Copy<T>; tab?: T }
  | { kind: "none"; code: "not_running" | "unknown_tab"; message: string; open: T[] }

/**
 * Where an agent's call goes. A tab reference goes to the copy that has that project open; `active` to the active tab
 * of the copy the person used last. Without one, a call goes to the project the agent's folder is in when it's open,
 * and to `active` when it isn't. A project open in two copies goes to the one that has been running longest, which is
 * the person's own app more often than a copy a session started after it. `open` goes to a copy that has the project
 * already, and otherwise to the one the person used last.
 */
export function route<T extends RoutedTab>(copies: readonly Copy<T>[], request: Request): Route<T> {
  const open = openTabs(copies)
  if (copies.length === 0) {
    return { kind: "none", code: "not_running", message: "Parity isn't running. Start the app, then try again.", open }
  }
  if (request.kind === "open") {
    const holding = holdersOf(copies, request.root)
    return { kind: "copy", copy: holding[0]?.copy ?? lastUsed(copies)! }
  }
  const reference = request.tab?.trim()
  if (reference && reference !== activeTab) {
    const holding = holdersOf(copies, reference)
    if (holding[0]) return { kind: "copy", copy: holding[0].copy, tab: holding[0].tab }
    const ids = open.map((tab) => tab.id)
    return {
      kind: "none",
      code: "unknown_tab",
      message: `No open tab matches "${reference}". Tabs: ${ids.length ? ids.join(", ") : "none"}`,
      open
    }
  }
  if (!reference) {
    const project = projectFor(request.folder, open)
    if (project) {
      const holding = holdersOf(copies, project.root)
      if (holding[0]) return { kind: "copy", copy: holding[0].copy, tab: holding[0].tab }
    }
  }
  const looking = [...copies].sort(byLastUsed).find((copy) => copy.report.tabs.some((tab) => tab.active))
  const tab = looking?.report.tabs.find((candidate) => candidate.active)
  if (looking && tab) return { kind: "copy", copy: looking, tab }
  return { kind: "none", code: "unknown_tab", message: "No project is open in Parity", open }
}

/**
 * Every copy's tabs as one list, one entry per project: from the copy its calls go to, and active only for the tab
 * `active` names.
 */
export function openTabs<T extends RoutedTab>(copies: readonly Copy<T>[]): T[] {
  const looking = [...copies].sort(byLastUsed).find((copy) => copy.report.tabs.some((tab) => tab.active))
  const shown = looking?.report.tabs.find((tab) => tab.active)
  const tabs = new Map<string, T>()
  for (const copy of [...copies].sort(byAge)) {
    for (const tab of copy.report.tabs) {
      const key = normalizeRoot(tab.root)
      if (tabs.has(key)) continue
      tabs.set(key, { ...tab, active: !!shown && normalizeRoot(shown.root) === key })
    }
  }
  return [...tabs.values()]
}

/** The copies that have a project open, oldest first, with the tab they have it in. */
function holdersOf<T extends RoutedTab>(copies: readonly Copy<T>[], reference: string): { copy: Copy<T>; tab: T }[] {
  return [...copies].sort(byAge).flatMap((copy) => {
    const tab = matchTab(copy.report.tabs, reference)
    return tab ? [{ copy, tab }] : []
  })
}

function lastUsed<T extends RoutedTab>(copies: readonly Copy<T>[]): Copy<T> | undefined {
  return [...copies].sort(byLastUsed)[0]
}

/** The copy focused last first; one that can't say, or a tie, goes to the one that has been running longest. */
function byLastUsed(a: Copy, b: Copy): number {
  return (b.report.focusedAt ?? 0) - (a.report.focusedAt ?? 0) || byAge(a, b)
}

/** The copy running longest first, then by process, so the order never depends on how the registry was listed. */
function byAge(a: Copy, b: Copy): number {
  return a.entry.startedAt - b.entry.startedAt || a.entry.app - b.entry.app
}
