import { packageFile, pageScripts, publishedCommit, publishedVersions, repositoryFiles } from "./published.ts"

/**
 * Where an icon set publishes the words its icons are found by, and how to read them. Parity never types tags in: each
 * set's own metadata is read when its file is generated, at the version the icons are: from npm, or from the set's
 * repository at the commit npm says the version was published from. Each reader gives words by the set's own key for
 * each icon (`circle-alert`, `IconArrowDown`), categories included; a key is matched to icons by its letters and digits
 * alone. A set that publishes none can be read from its website's own scripts, as served the day the file is generated.
 */
export type IconTagSource =
  | {
      /** The npm package that has them, such as `lucide-static`; the icon package itself when left out. */
      package?: string
      /** The file, relative to the package. */
      file: string
      read(text: string): Record<string, readonly unknown[]>
    }
  | {
      /** The repository that has them, as git fetches it. */
      repository: string
      /** The files to read, as a path where `*` stands for any one folder or file name. */
      files: string
      readFiles(files: { path: string; text: string }[]): Record<string, readonly unknown[]>
    }
  | {
      /** The web page whose own scripts have them, as its search does. */
      page: string
      readScripts(scripts: { path: string; text: string }[]): Record<string, readonly unknown[]>
    }

/** How tags are fetched; tests give their own. */
export interface TagFetchers {
  packageFile: typeof packageFile
  publishedVersions: typeof publishedVersions
  publishedCommit: typeof publishedCommit
  repositoryFiles: typeof repositoryFiles
  pageScripts: typeof pageScripts
}

const published: TagFetchers = { packageFile, publishedVersions, publishedCommit, repositoryFiles, pageScripts }

/** Tags for each icon by label, and where they came from. */
export interface IconTags {
  tags: Record<string, string[]>
  source: string
  /** How many of the set's icons have tags. */
  matched: number
}

/** One icon as the set exports it: the label the Icons panel shows, and every name it's exported under. */
export interface ExportedIcon {
  label: string
  names: string[]
}

/**
 * Reads a set's tags from its published metadata and keys them by each icon's label. A companion package's version is
 * the icon package's own when that was published, or else the newest one before it, since companions are released
 * together but not always every time.
 */
export async function readIconTags(
  source: IconTagSource,
  iconPackage: { name: string; version: string },
  icons: readonly ExportedIcon[],
  fetchers: TagFetchers = published
): Promise<IconTags> {
  let read: Record<string, readonly unknown[]>
  let from: string
  if ("repository" in source) {
    const commit = await fetchers.publishedCommit(iconPackage.name, iconPackage.version)
    if (!commit) throw new Error(`npm doesn't say which commit ${iconPackage.name}@${iconPackage.version} came from`)
    read = source.readFiles(await fetchers.repositoryFiles(source.repository, commit, glob(source.files)))
    from = `${source.repository.replace(/^https:\/\//, "")}@${commit.slice(0, 12)}/${source.files}`
  } else if ("page" in source) {
    const { served, scripts } = await fetchers.pageScripts(source.page)
    read = source.readScripts(scripts)
    from = `${source.page.replace(/^https:\/\//, "")} as served on ${served}`
  } else {
    const name = source.package ?? iconPackage.name
    const version =
      name === iconPackage.name
        ? iconPackage.version
        : closestVersion(await fetchers.publishedVersions(name), iconPackage.version)
    if (!version) throw new Error(`${name} has no version at or before ${iconPackage.version}`)
    read = source.read(await fetchers.packageFile(name, version, source.file))
    from = `${name}@${version}/${source.file}`
  }
  const byKey = new Map<string, string[]>()
  for (const [key, words] of Object.entries(read)) {
    // Tags can be numbers, as Tabler's `911` is.
    const clean = [...new Set(words.map((word) => String(word).trim().toLowerCase()).filter(Boolean))]
    if (clean.length > 0) byKey.set(normalize(key), clean)
  }
  const tags: Record<string, string[]> = {}
  for (const icon of icons) {
    const found = keysFor(icon)
      .map((key) => byKey.get(key))
      .find(Boolean)
    if (found) tags[icon.label] = found
  }
  return { tags, source: from, matched: Object.keys(tags).length }
}

/** A path where `*` is any one folder or file name, as a regular expression. */
function glob(pattern: string): RegExp {
  const parts = pattern.split("*").map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(`^${parts.join("[^/]+")}$`)
}

/** A key by its letters and digits, lowercased: `circle-alert`, `CircleAlert` and `circle_alert` are one key. */
function normalize(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "")
}

/**
 * The keys an icon may be listed under: its label and each name, with and without an `Icon` before or after, and
 * without the `Ltr` or `Rtl` that names a mirrored copy (Fluent's `TextIndentIncreaseLtr`).
 */
function keysFor(icon: ExportedIcon): string[] {
  const keys = new Set<string>()
  for (const name of [icon.label, ...icon.names]) {
    const key = normalize(name)
    for (const bare of [key, key.replace(/^icon/, ""), key.replace(/icon$/, "")]) {
      keys.add(bare)
      keys.add(bare.replace(/(?:ltr|rtl)$/, ""))
    }
  }
  keys.delete("")
  return [...keys]
}

/**
 * A `.lib.par` as JSON, indented by two spaces, with each icon's tags on a line of their own, so a set's thousands of
 * icons stay readable and its file half the size.
 */
export function manifestText(manifest: Record<string, unknown>): string {
  const icons = manifest.icons as { tags?: Record<string, string[]> } | undefined
  if (!icons?.tags) return `${JSON.stringify(manifest, null, 2)}\n`
  const marker = JSON.stringify("\u0000tags\u0000")
  const text = JSON.stringify({ ...manifest, icons: { ...icons, tags: JSON.parse(marker) as string } }, null, 2)
  const lines = Object.entries(icons.tags).map(
    ([name, tags]) => `      ${JSON.stringify(name)}: ${JSON.stringify(tags)}`
  )
  return `${text.replace(marker, `{\n${lines.join(",\n")}\n    }`)}\n`
}

/** The version itself when published, or else the newest release before it; prereleases aren't counted. */
export function closestVersion(published: readonly string[], wanted: string): string | undefined {
  if (published.includes(wanted)) return wanted
  const parts = (version: string) => version.split(".").map(Number)
  const target = parts(wanted.replace(/-.*$/, ""))
  const before = (a: number[], b: number[]) => {
    for (let index = 0; index < 3; index++) {
      if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) < (b[index] ?? 0)
    }
    return false
  }
  let best: string | undefined
  for (const version of published) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue
    const candidate = parts(version)
    if (!before(candidate, target)) continue
    if (!best || before(parts(best), candidate)) best = version
  }
  return best
}
