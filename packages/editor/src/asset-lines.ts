/** A family of a source's items, as the Components panel lists them under a heading. */
export interface LineFamily<Item> {
  name: string
  items: readonly Item[]
  /** Its name is a folder or a route, shown over a single item too. */
  heading?: true
}

/** A source of items, whether it's open, and whether a notice shows under its heading, as one about its styles. */
export interface LineSource<Item> {
  id: string
  families: readonly LineFamily<Item>[]
  open: boolean
  notice?: boolean
}

/**
 * A line of the Components panel, which draws only the lines in view (PAR-1202): a source's heading, a notice under it,
 * a family's heading, or a row of items, one in the Names and List views and as many as fit across in Grid. `source` is
 * the source's place in the list given.
 */
export type AssetLine<Item> =
  | { type: "source"; key: string; source: number; count: number; open: boolean }
  | { type: "notice"; key: string; source: number }
  | { type: "family"; key: string; source: number; name: string }
  | {
      type: "items"
      key: string
      source: number
      items: Item[]
      /** The family's first row, and its last, which have room above and below them. */
      first: boolean
      last: boolean
    }

/**
 * The Components panel's lines for its sources: each source's heading with how many items it has, any notice under it,
 * then, while it's open, each family's heading where it has one, and its items `columns` to a row. A family's name
 * shows over several items, or over one when it's a folder or a route.
 */
export function assetLines<Item extends { key: string }>(
  sources: readonly LineSource<Item>[],
  columns = 1
): AssetLine<Item>[] {
  const lines: AssetLine<Item>[] = []
  const across = Math.max(1, Math.floor(columns))

  sources.forEach((source, place) => {
    const count = source.families.reduce((total, family) => total + family.items.length, 0)
    lines.push({ type: "source", key: `source:${source.id}`, source: place, count, open: source.open })

    if (source.notice) {
      lines.push({ type: "notice", key: `notice:${source.id}`, source: place })
    }

    if (!source.open) {
      return
    }

    source.families.forEach((family, index) => {
      const scope = `${source.id}:${index}`

      if (family.name && (family.items.length > 1 || family.heading)) {
        lines.push({ type: "family", key: `family:${scope}`, source: place, name: family.name })
      }

      for (let start = 0; start < family.items.length; start += across) {
        const items = family.items.slice(start, start + across)

        lines.push({
          type: "items",
          key: `items:${scope}:${items[0]!.key}`,
          source: place,
          items,
          first: start === 0,
          last: start + across >= family.items.length
        })
      }
    })
  })

  return lines
}
