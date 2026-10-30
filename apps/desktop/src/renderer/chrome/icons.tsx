import { iconStyleModules, type LibraryInfo, type RenderNode } from "@parity-app/core"
import {
  type IconIndex,
  iconIndex,
  type IconEntry as SetEntry,
  iconEntries as setEntries,
  iconStyles as setStyles,
  searchIcons
} from "@parity-app/icons"
import { type CSSProperties, useEffect, useMemo, useRef } from "react"
import type { InsertItem } from "../canvas/insert.ts"
import type { LoadedGuest } from "../guest.ts"

/** One icon as the panel lists it: its name, and what inserting it adds. */
export interface IconEntry {
  /** Its name without a style or size, as in `Add` for Fluent's `AddRegular`. */
  label: string
  item: InsertItem & { kind: "component" }
}

/** The icon sets a project has, in the order its libraries are listed. */
export function iconLibraries(libraries: readonly LibraryInfo[]): LibraryInfo[] {
  return libraries.filter((library) => library.kind === "icons")
}

/** What an icon set's icons are called, as in "Lucide icons", for a set whose name doesn't already say so. */
export function iconsOf(library: LibraryInfo): string {
  return /\bicons$/i.test(library.name) ? library.name : `${library.name} icons`
}

/** The styles a set offers, such as Regular and Filled, with the one shown first. */
export function iconStyles(library: LibraryInfo): { styles: string[]; initial?: string } {
  return setStyles(library.icons)
}

/** A set's icons in one style, and a search over them by name, alias and the tags the set publishes. */
export interface IconCatalog {
  entries: IconEntry[]
  /** The icons a query finds, best first; every icon for an empty one. */
  search(query: string): IconEntry[]
}

/**
 * A set's icons in one style, from the project's own copy of the package as its manifest describes it: each once and
 * unsized, with the style's prop set for sets that take one, and from the style's own module for sets that keep each
 * style in one.
 */
export function iconCatalog(loaded: LoadedGuest, library: LibraryInfo, style: string | undefined): IconCatalog {
  const key = iconStyleModules(library.icons, library.package).find((module) => module.style === style)?.key
  const aliases = loaded.guest.iconAliases?.(library.id, key)
  const listed = setEntries(loaded.guest.iconNames?.(library.id, key) ?? [], library.icons, style, aliases)
  const prefix = key ? `${library.id}/${key}/` : `${library.id}/`
  const entries = new Map(
    listed.map((icon): [SetEntry, IconEntry] => [
      icon,
      {
        label: icon.label,
        item: {
          kind: "component",
          component: `${prefix}${icon.insert ?? icon.name}`,
          ...(icon.props ? { props: icon.props } : {})
        }
      }
    ])
  )
  let index: IconIndex | undefined
  return {
    entries: [...entries.values()],
    search(query) {
      // Indexed on the first search, so opening the panel stays quick.
      index ??= iconIndex(listed, aliases, library.icons?.tags)
      return searchIcons(index, query).map((icon) => entries.get(icon)!)
    }
  }
}

/** Draws icons the size of text in the panel, whatever size the set draws them at. */
const iconSheet = (() => {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(
    ":host { display: grid; place-items: center; width: var(--icon-size); height: var(--icon-size); font-size: var(--icon-size); color: inherit }\n" +
      "svg { width: var(--icon-size); height: var(--icon-size); display: block }"
  )
  return sheet
})()

/**
 * An icon drawn by the project's own copy of its icon set, through the guest, so the panel shows exactly what a design
 * will. It lives in a shadow root of its own, without the project's decorators, `size` pixels square.
 */
export function GuestIcon({
  loaded,
  item,
  size = 16
}: {
  loaded: LoadedGuest
  item: IconEntry["item"]
  size?: number
}) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const tree = useMemo<RenderNode[]>(
    () => [{ kind: "component", nodeId: "icon", component: item.component, props: { ...item.props }, slots: {} }],
    [item]
  )
  useEffect(() => {
    const host = hostRef.current!
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
    shadow.adoptedStyleSheets = [iconSheet]
    const target = document.createElement("span")
    shadow.replaceChildren(target)
    const handle = loaded.guest.mount(target, tree, { bare: true })
    return () => handle.unmount()
  }, [loaded, tree])
  return (
    <span
      ref={hostRef}
      aria-hidden
      className="inline-grid place-items-center"
      style={{ width: size, height: size, "--icon-size": `${size}px` } as CSSProperties}
    />
  )
}
