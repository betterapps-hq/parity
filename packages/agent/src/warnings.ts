/**
 * What a call found that's worth fixing but didn't stop it, by kind. An agent branches on the category; the severity
 * says how much it matters: a render that failed is an error, a name for the layers tree is a suggestion.
 */
export const warningCategories = {
  /** A frame failed to render, so what was checked or captured is missing. */
  render_failed: "error",
  /** A component node names something the project doesn't have; it renders as a placeholder. */
  unknown_component: "warning",
  /** An instance names a component design that doesn't exist. */
  unknown_component_design: "warning",
  /** A prop the component doesn't declare. */
  unknown_prop: "warning",
  /** A variant value outside the prop's options. */
  invalid_option: "warning",
  /** A colour, radius or other token style that isn't one of the project's tokens. */
  not_a_token: "warning",
  /** A length that isn't a spacing step or a length token. */
  not_a_length_token: "warning",
  /** A board this call created, changed or moved collides with another. */
  overlap: "warning",
  /** A board this call touched is clear of another, but so close that the lower one's title covers the upper. */
  title_clearance: "warning",
  /** Boards this call didn't touch overlap or crowd a title; Overlaps() lists them. */
  canvas_overlaps: "suggestion",
  /** A design changed kind and dropped what the new kind doesn't have. */
  kind_changed: "warning",
  /** A new layout that groups things has no name. */
  unnamed_layout: "suggestion"
} as const satisfies Record<string, WarningSeverity>

export type WarningSeverity = "error" | "warning" | "suggestion"
export type WarningCategory = keyof typeof warningCategories

/** One finding: what it is, what to do, and the node or frame it's about when it's about one. */
export interface Warning {
  category: WarningCategory
  message: string
  /** A node's `design/node` path, or the frame or design it's about. */
  at?: string
}

/** Findings with the same category and message, once, with every place they were found. */
export interface WarningGroup {
  category: WarningCategory
  severity: WarningSeverity
  message: string
  /** How many places it was found, which `at` lists. */
  count: number
  at: string[]
}

const severityOrder: Record<WarningSeverity, number> = { error: 0, warning: 1, suggestion: 2 }

/** Findings grouped by category and message: errors first, then warnings, then suggestions, each in found order. */
export function groupWarnings(warnings: readonly Warning[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>()
  for (const { category, message, at } of warnings) {
    const key = `${category}\n${message}`
    const group = groups.get(key) ?? { category, severity: warningCategories[category], message, count: 0, at: [] }
    groups.set(key, group)
    if (at === undefined) {
      group.count = Math.max(group.count, 1)
    } else if (!group.at.includes(at)) {
      group.at.push(at)
      group.count = group.at.length
    }
  }
  return [...groups.values()].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}

/** The most places a group's line names before it says how many more there are. */
export const placesShown = 5

/** A group as one line: the place first, or how many places and the first few, then the message. */
export function warningLine(group: WarningGroup): string {
  if (group.at.length === 0) return group.message
  if (group.at.length === 1) return `${group.at[0]}: ${group.message}`
  const shown = group.at.slice(0, placesShown).join(", ")
  const more = group.at.length > placesShown ? ` and ${group.at.length - placesShown} more` : ""
  return `${group.at.length} places (${shown}${more}): ${group.message}`
}
