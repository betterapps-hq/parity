import type { LibraryComponents, LibraryManifest } from "@parity-app/core"
import { newestEntryFor } from "@parity-app/registry"
import {
  defaultValues,
  describedTokenCategory,
  describedTokenVar,
  type PreviewKind,
  previewKind,
  resolveReferences
} from "@parity-app/tokens"
import { registryTokens } from "./libraries.ts"

/*
 * What a library's file in Parity's registry holds, read before the library is added, so the Components panel can show
 * it: its tokens drawn as the Tokens panel draws them, its components by family, and its breakpoints.
 */

/** A token as the Tokens panel previews it: its custom property, how it's drawn, and its value in each theme. */
export interface PreviewedToken {
  name: string
  kind: PreviewKind
  /** Its value in each theme it has one for, `default` first, with references to the library's other tokens resolved. */
  values: Record<string, string>
}

/** What a library's registry file holds, as the Components panel shows it before the library is added. */
export interface LibraryPreview {
  /** How many components it has. */
  components: number
  /** Its components by family, as Accordion with AccordionItem and the rest, in name order. */
  families: { name: string; count: number }[]
  breakpoints: { id: string; name: string; width: number }[]
  /** The themes its tokens have values for, `default` first. */
  themes: string[]
  tokens: PreviewedToken[]
}

/**
 * What the newest registry file for `packageName` holds, or nothing when the registry has no file for it. Malformed
 * tokens left out are added to `notes`.
 */
export async function libraryPreview(
  packageName: string,
  notes: string[] = [],
  /** The registry's folder; the one Parity ships, unless a test gives another. */
  registry?: string
): Promise<LibraryPreview | undefined> {
  const entry = await newestEntryFor(packageName, registry)

  if (!entry) {
    return undefined
  }

  const described = (await registryTokens(packageName, notes, registry))?.tokens ?? []
  const named = described.map((token) => ({ name: describedTokenVar(token), values: token.values, token }))
  const lookup = defaultValues(named)

  const tokens = named.map(({ name, values, token }) => ({
    name,
    kind: previewKind(
      { name, values, category: describedTokenCategory(token) ?? token.path.split(".")[0]! },
      token.type,
      lookup
    ),
    values: Object.fromEntries(
      Object.entries(values).map(([theme, value]) => [
        theme,
        resolveReferences(value, (reference) => lookup(reference, theme === "default" ? undefined : theme))
      ])
    )
  }))

  const list = entry.manifest.components?.list ?? {}

  return {
    components: Object.keys(list).length,
    families: familiesOf(list),
    breakpoints: breakpointsOf(entry.manifest),
    themes: [...new Set(["default", ...tokens.flatMap((token) => Object.keys(token.values))])].filter((theme) =>
      tokens.some((token) => theme in token.values)
    ),
    tokens
  }
}

function breakpointsOf(manifest: LibraryManifest): LibraryPreview["breakpoints"] {
  return (manifest.breakpoints ?? []).map(({ id, name, width }) => ({ id, name, width }))
}

/**
 * Components by family: the one its file names, when that's another component's, else its namespace (`Dialog` for
 * `Dialog.Title`), else the shortest component whose name it starts with at a word, as `Accordion` for `AccordionItem`.
 * Some files name each component its own family, which says nothing.
 */
export function familiesOf(list: LibraryComponents["list"]): LibraryPreview["families"] {
  const names = Object.keys(list)
  const roots = new Set(names.filter((name) => !name.includes(".")))
  const counts = new Map<string, number>()

  for (const name of names) {
    const named = list[name]?.group
    const family = named && named !== name ? named : familyOf(name, roots)
    counts.set(family, (counts.get(family) ?? 0) + 1)
  }

  return [...counts].sort(([a], [b]) => a.localeCompare(b, "en")).map(([name, count]) => ({ name, count }))
}

function familyOf(name: string, roots: ReadonlySet<string>): string {
  const dot = name.indexOf(".")

  if (dot !== -1) {
    return name.slice(0, dot)
  }

  const words = name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z\d]+/g) ?? [name]

  for (let length = 1; length < words.length; length++) {
    const prefix = words.slice(0, length).join("")

    if (roots.has(prefix)) {
      return prefix
    }
  }

  return name
}
