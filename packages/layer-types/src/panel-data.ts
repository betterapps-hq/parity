import { describeElement, type ElementFacts, elementTypeNames, type PanelSection } from "./layer-types.ts"

/** One value an element's attributes give, as its panel shows it: what it's called, and what it is. */
export interface PanelField {
  /** The attribute it's read from, as `href` or `aria-checked`. */
  attribute: string
  label: string
  value: string
}

/** One of an element's sections, with the fields its attributes fill. */
export interface PanelGroup {
  section: PanelSection
  title: string
  fields: PanelField[]
}

/** The sections whose fields come from an element's attributes; the others come from its styles. */
export type AttributeSection = Extract<PanelSection, "landmark" | "link" | "input" | "source" | "playback">

/** The attributes each attribute section reads, in order, with their labels. */
export const sectionAttributes = {
  landmark: [
    ["role", "Role"],
    ["aria-label", "Label"],
    ["title", "Title"]
  ],
  link: [
    ["href", "Link to"],
    ["target", "Opens in"],
    ["rel", "Rel"],
    ["download", "Download"]
  ],
  input: [
    ["type", "Type"],
    ["name", "Name"],
    ["value", "Value"],
    ["placeholder", "Placeholder"],
    ["aria-label", "Label"],
    ["checked", "Checked"],
    ["aria-checked", "Checked"],
    ["aria-pressed", "Pressed"],
    ["aria-expanded", "Expanded"],
    ["min", "Min"],
    ["max", "Max"],
    ["step", "Step"],
    ["aria-valuenow", "Value"],
    ["accept", "Accepts"],
    ["multiple", "Multiple"],
    ["required", "Required"],
    ["readonly", "Read-only"],
    ["disabled", "Disabled"],
    ["aria-disabled", "Disabled"]
  ],
  source: [
    ["src", "Source"],
    ["alt", "Alt text"],
    ["poster", "Poster"]
  ],
  playback: [
    ["autoplay", "Autoplay"],
    ["loop", "Loop"],
    ["muted", "Muted"],
    ["controls", "Controls"],
    ["playsinline", "Plays inline"]
  ]
} as const satisfies Record<AttributeSection, readonly (readonly [string, string])[]>

/** Attributes that are on or off: present means on, whatever their value. */
const switchAttributes = new Set([
  "download",
  "checked",
  "multiple",
  "required",
  "readonly",
  "disabled",
  "autoplay",
  "loop",
  "muted",
  "controls",
  "playsinline"
])

/** Every attribute a section reads, for whoever reads elements to keep. */
export const panelAttributes: readonly string[] = [
  ...new Set(Object.values(sectionAttributes).flatMap((fields) => fields.map(([attribute]) => attribute)))
]

function isAttributeSection(section: PanelSection): section is AttributeSection {
  return section in sectionAttributes
}

/**
 * What an element's panel shows from its attributes: each of its type's attribute sections (`describeElement`), in
 * order, with a field for each attribute it has. An on-or-off attribute shows Yes; a section with nothing set is left
 * out. Its input section is called by its type, as Checkbox. The style sections, as Typography, come from its styles.
 */
export function panelData(facts: ElementFacts): PanelGroup[] {
  const attributes = facts.attributes ?? {}
  const layer = describeElement(facts)

  return layer.sections.filter(isAttributeSection).flatMap((section) => {
    const seen = new Set<string>()

    const fields = sectionAttributes[section].flatMap(([attribute, label]): PanelField[] => {
      const value = attributes[attribute]

      // Two attributes can say the same thing, as `checked` and `aria-checked`: the first one set shows.
      if (value === undefined || seen.has(label)) {
        return []
      }

      seen.add(label)

      return [{ attribute, label, value: switchAttributes.has(attribute) ? "Yes" : value }]
    })

    if (fields.length === 0) {
      return []
    }

    return [{ section, title: section === "input" ? elementTypeNames[layer.type] : sectionTitles[section], fields }]
  })
}

const sectionTitles: Record<Exclude<AttributeSection, "input">, string> = {
  landmark: "Landmark",
  link: "Link",
  source: "Source",
  playback: "Playback"
}
