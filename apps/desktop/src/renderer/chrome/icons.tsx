import type { LibraryInfo, RenderNode } from "@parity/core"
import { useEffect, useMemo, useRef } from "react"
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
  const variants = library.icons?.variants
  const styles = variants?.styles ?? []
  return { styles, ...(variants?.default?.style ? { initial: variants.default.style } : {}) }
}

/**
 * A set's icons in one style, from the project's own copy of the package as its manifest describes it. Sets that write
 * the style and size into names (Fluent's `Add24Regular`) list each icon once, unsized, in that style; sets that take
 * the style as a prop (Phosphor's `weight`) insert with it set.
 */
export function iconEntries(loaded: LoadedGuest, library: LibraryInfo, style: string | undefined): IconEntry[] {
  const names = loaded.guest.iconNames?.(library.id) ?? []
  const variants = library.icons?.variants
  const fallback = variants?.default?.style
  const pattern = variants?.pattern ? new RegExp(variants.pattern) : undefined
  const entries: IconEntry[] = []
  for (const name of names) {
    let label = name
    if (pattern) {
      const groups = pattern.exec(name)?.groups
      if (!groups) continue
      if (groups.size) continue
      if ((groups.style ?? fallback) !== (style ?? fallback)) continue
      label = groups.name ?? name
    }
    const props = variants?.prop && style && style !== fallback ? { [variants.prop]: style } : undefined
    entries.push({
      label,
      item: { kind: "component", component: `${library.id}/${name}`, ...(props ? { props } : {}) }
    })
  }
  return entries
}

/** Draws icons the size of text in the panel, whatever size the set draws them at. */
const iconSheet = (() => {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(
    ":host { display: grid; place-items: center; width: 16px; height: 16px; font-size: 16px; color: inherit }\n" +
      "svg { width: 16px; height: 16px; display: block }"
  )
  return sheet
})()

/**
 * An icon drawn by the project's own copy of its icon set, through the guest, so the panel shows exactly what a design
 * will. It lives in a shadow root of its own, without the project's decorators.
 */
export function GuestIcon({ loaded, item }: { loaded: LoadedGuest; item: IconEntry["item"] }) {
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
  return <span ref={hostRef} aria-hidden className="inline-grid size-4 place-items-center" />
}
