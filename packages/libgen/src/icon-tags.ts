import { moduleData } from "./js-data.ts"
import { packageFile, publishedSource, publishedVersions, repositoryFiles } from "./published.ts"

/**
 * Where an icon set publishes the words its icons are found by. Parity never types tags in, and has no code for any one
 * set: a source only says where the set's metadata is, and it's read at the version the icons are, from npm or from the
 * repository npm says the version came from, at that commit. One reader, {@link iconWords}, works out its shape.
 */
export type IconTagSource =
  | {
      /** The npm package that has them, such as `lucide-static`; the icon package itself when left out. */
      package?: string
      /** The file, relative to the package: JSON, or a JavaScript module whose declarations are read as data. */
      file: string
    }
  | {
      /**
       * JSON files about one icon each, in the repository npm says the icon package came from, as a path where `*`
       * stands for any one folder or file name.
       */
      files: string
    }

/** How tags are fetched; tests give their own. */
export interface TagFetchers {
  packageFile: typeof packageFile
  publishedVersions: typeof publishedVersions
  publishedSource: typeof publishedSource
  repositoryFiles: typeof repositoryFiles
}

const published: TagFetchers = { packageFile, publishedVersions, publishedSource, repositoryFiles }

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
  let data: unknown[]
  let from: string
  if ("files" in source) {
    const { repository, commit } = await fetchers.publishedSource(iconPackage.name, iconPackage.version)
    if (!repository || !commit) {
      throw new Error(
        `npm doesn't say which repository and commit ${iconPackage.name}@${iconPackage.version} came from`
      )
    }
    const files = await fetchers.repositoryFiles(repository, commit, glob(source.files))
    data = [files.flatMap(({ text }) => parsed(text))]
    from = `${repository.replace(/^https:\/\//, "")}@${commit.slice(0, 12)}/${source.files}`
  } else {
    const name = source.package ?? iconPackage.name
    const version =
      name === iconPackage.name
        ? iconPackage.version
        : closestVersion(await fetchers.publishedVersions(name), iconPackage.version)
    if (!version) throw new Error(`${name} has no version at or before ${iconPackage.version}`)
    const text = await fetchers.packageFile(name, version, source.file)
    data = source.file.endsWith(".json") ? parsed(text) : [...moduleData(text).values()]
    from = `${name}@${version}/${source.file}`
  }
  const tags = iconWords(data, icons)
  return { tags, source: from, matched: Object.keys(tags).length }
}

function parsed(text: string): unknown[] {
  try {
    return [JSON.parse(text)]
  } catch {
    return []
  }
}

/**
 * Words for each icon by label, from metadata of whatever shape a set publishes. Its table of icons is the one that
 * names most of the set's icons, wherever it sits: an object keyed by icon (`{"circle-alert": [...]}`), or a list of
 * records with a field that names each (`[{ name: "acorn", tags: [...] }]`). An icon's words are its lists of strings,
 * and the values of fields that sort icons into groups, such as a category. Fields that barely vary (the styles most
 * icons come in), words most icons have, and markers that aren't words (`*new*`) are left out. Fields that tell icons
 * apart come before ones that group many, since a set's first tags count most in search.
 */
export function iconWords(data: readonly unknown[], icons: readonly ExportedIcon[]): Record<string, string[]> {
  const least = Math.max(1, Math.min(20, Math.floor(icons.length / 2)))
  let best: Map<string, unknown> | undefined
  const consider = (entries: [unknown, unknown][]) => {
    const byKey = new Map<string, unknown>()
    for (const [key, value] of entries) {
      if (typeof key === "string" && !byKey.has(normalize(key))) byKey.set(normalize(key), value)
    }
    const matched = new Map<string, unknown>()
    for (const icon of icons) {
      const key = keysFor(icon).find((candidate) => byKey.has(candidate))
      if (key) matched.set(icon.label, byKey.get(key))
    }
    if (matched.size > (best?.size ?? 0)) best = matched
  }
  const visit = (value: unknown, depth: number) => {
    if (Array.isArray(value)) {
      const records = value.filter(isRecord)
      if (records.length < least) return
      for (const field of new Set(records.flatMap((record) => Object.keys(record)))) {
        if (records.some((record) => typeof record[field] === "string")) {
          consider(records.map((record) => [record[field], record]))
        }
      }
    } else if (isRecord(value)) {
      const entries = Object.entries(value)
      if (entries.length >= least) consider(entries)
      else if (depth < 3) for (const [, inner] of entries) visit(inner, depth + 1)
    }
  }
  for (const value of data) visit(value, 0)
  if (!best) return {}

  // Each field's words by icon: a list's strings, or a string field's value when it names a group.
  const fields = new Map<string, { group: boolean; byLabel: Map<string, string[]> }>()
  const add = (field: string, group: boolean, label: string, words: string[]) => {
    if (words.length === 0) return
    let found = fields.get(field)
    if (!found) fields.set(field, (found = { group, byLabel: new Map() }))
    found.byLabel.set(label, words)
  }
  for (const [label, value] of best) {
    if (Array.isArray(value)) add("", false, label, wordsOf(value))
    else if (isRecord(value)) {
      for (const [field, inner] of Object.entries(value)) {
        if (Array.isArray(inner)) add(field, false, label, wordsOf(inner))
        else if (typeof inner === "string")
          add(
            field,
            true,
            label,
            wordsOf([inner]).filter((word) => /\p{L}/u.test(word))
          )
      }
    }
  }
  const matched = best.size
  const kept = [...fields.values()].flatMap(({ group, byLabel }) => {
    const counts = new Map<string, number>()
    for (const word of [...byLabel.values()].flat()) counts.set(word, (counts.get(word) ?? 0) + 1)
    const distinct = counts.size
    // A field with a handful of values for thousands of icons says little about any of them. A string that differs
    // for nearly every icon is a name or a sentence, and one most icons share (Fluent's `fluent-icon`) is a constant:
    // neither is a group.
    if (distinct < Math.min(5, Math.ceil(matched / 10))) return []
    if (group && (distinct > matched / 20 || Math.max(...counts.values()) > matched / 2)) return []
    return [{ byLabel, distinct }]
  })
  kept.sort((a, b) => b.distinct - a.distinct)
  const tags: Record<string, string[]> = {}
  const common = new Map<string, number>()
  for (const icon of icons) {
    const words = [...new Set(kept.flatMap(({ byLabel }) => byLabel.get(icon.label) ?? []))]
    if (words.length === 0) continue
    tags[icon.label] = words
    for (const word of words) common.set(word, (common.get(word) ?? 0) + 1)
  }
  const tagged = Object.keys(tags).length
  if (tagged < 8) return tags
  for (const [label, words] of Object.entries(tags)) {
    const specific = words.filter((word) => common.get(word)! <= tagged / 4)
    if (specific.length > 0) tags[label] = specific
    else delete tags[label]
  }
  return tags
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * A list's words, lowercased and without the punctuation that ends them: its strings and numbers (Tabler's `911`), when
 * it has any strings at all. One that starts with a symbol is a marker (`*new*`) or a symbol (`->`), not a word.
 */
function wordsOf(list: readonly unknown[]): string[] {
  if (!list.some((item) => typeof item === "string")) return []
  return list
    .filter((item) => typeof item === "string" || typeof item === "number")
    .map((item) =>
      String(item)
        .toLowerCase()
        .replaceAll(/\s+/g, " ")
        .trim()
        .replace(/[^\p{L}\p{N}]+$/u, "")
    )
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
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
