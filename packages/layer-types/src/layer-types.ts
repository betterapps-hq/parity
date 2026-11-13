/**
 * What kind of layer an element shows as (read-only viewer): the layer is the element itself, as the page or its code
 * has it, and its type decides only how it's shown, its icon and color in Layers and the header and sections of its
 * panel. The type
 * comes from the element's tag alone, never from what's inside it, so a `span` is always Text; a `role`, or `popover`,
 * says what the element is in place of its tag.
 */
export const elementTypes = [
  "layout",
  "region",
  "text",
  "link",
  "input",
  "image",
  "vector",
  "video",
  "audio",
  "embed",
  "table",
  "list",
  "divider",
  "overlay"
] as const

export type ElementType = (typeof elementTypes)[number]

/**
 * The families types are in, each with a color of its own on the canvas: Structure holds and arranges, Text reads as
 * words, Media shows a picture, a recording or another document, and Input is what a person uses.
 */
export const elementFamilies = ["structure", "text", "media", "input"] as const

export type ElementFamily = (typeof elementFamilies)[number]

/** Each family's name. */
export const elementFamilyNames: Record<ElementFamily, string> = {
  structure: "Structure",
  text: "Text",
  media: "Media",
  input: "Input"
}

/** The family each type is in. */
export const elementTypeFamilies: Record<ElementType, ElementFamily> = {
  layout: "structure",
  region: "structure",
  table: "structure",
  list: "structure",
  divider: "structure",
  overlay: "structure",
  text: "text",
  link: "text",
  image: "media",
  vector: "media",
  video: "media",
  audio: "media",
  embed: "media",
  input: "input"
}

/** Each type's name, as its panel's header and Layers say it. */
export const elementTypeNames: Record<ElementType, string> = {
  layout: "Layout",
  region: "Region",
  text: "Text",
  link: "Link",
  input: "Input",
  image: "Image",
  vector: "Vector",
  video: "Video",
  audio: "Audio",
  embed: "Embed",
  table: "Table",
  list: "List",
  divider: "Divider",
  overlay: "Overlay"
}

/** The tags each type is, each tag in one type. A tag in none is a Layout. */
export const elementTypeTags: Record<ElementType, readonly string[]> = {
  layout: ["div", "figure", "figcaption", "details", "summary", "fieldset", "legend"],
  region: ["header", "nav", "main", "aside", "footer", "section", "article", "form", "search"],
  text: [
    "span",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "label",
    "strong",
    "em",
    "b",
    "i",
    "small",
    "mark",
    "code",
    "pre",
    "blockquote",
    "abbr",
    "time",
    "kbd",
    "sub",
    "sup"
  ],
  link: ["a"],
  input: ["input", "button", "textarea", "select", "option", "optgroup", "output", "progress", "meter"],
  image: ["img", "picture"],
  vector: ["svg"],
  video: ["video"],
  audio: ["audio"],
  embed: ["iframe", "canvas", "object", "embed"],
  table: ["table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td"],
  list: ["ul", "ol", "li", "dl", "dt", "dd", "menu"],
  divider: ["hr"],
  overlay: ["dialog"]
}

/** The roles each type is, which say what an element is in place of its tag, each role in one type. */
export const elementTypeRoles: Record<ElementType, readonly string[]> = {
  layout: ["group", "presentation", "none"],
  region: ["banner", "navigation", "main", "complementary", "contentinfo", "region", "search", "form"],
  text: ["heading", "paragraph", "status", "alert"],
  link: ["link"],
  input: [
    "button",
    "checkbox",
    "radio",
    "switch",
    "textbox",
    "searchbox",
    "combobox",
    "slider",
    "spinbutton",
    "listbox",
    "option",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "tab"
  ],
  image: ["img"],
  vector: [],
  video: [],
  audio: [],
  embed: [],
  table: ["table", "grid", "row", "rowgroup", "cell", "gridcell", "columnheader", "rowheader"],
  list: ["list", "listitem", "menu", "menubar", "tablist", "tree", "treeitem"],
  divider: ["separator"],
  overlay: ["dialog", "alertdialog", "tooltip"]
}

/**
 * Each type's icon, by name, which the app draws from its icon set: a Lucide name, so the package draws nothing itself.
 */
export const elementTypeIcons = {
  layout: "rows-3",
  region: "panels-top-left",
  text: "type",
  link: "link",
  input: "text-cursor-input",
  image: "image",
  vector: "pen-tool",
  video: "film",
  audio: "audio-lines",
  embed: "square-code",
  table: "table",
  list: "list",
  divider: "separator-horizontal",
  overlay: "picture-in-picture-2"
} as const satisfies Record<ElementType, string>

/** The name of an icon a layer type has. */
export type LayerIconName = (typeof elementTypeIcons)[ElementType]

/** A section of a layer's panel: what it shows of the element. */
export const panelSections = [
  "landmark",
  "link",
  "input",
  "source",
  "playback",
  "layout",
  "typography",
  "size",
  "fill",
  "stroke",
  "appearance"
] as const

export type PanelSection = (typeof panelSections)[number]

const boxSections = ["layout", "size", "fill", "stroke", "appearance"] as const satisfies readonly PanelSection[]

/** The sections each type's panel shows, in order: what's its own first, then what every box has. */
export const elementTypeSections: Record<ElementType, readonly PanelSection[]> = {
  layout: boxSections,
  region: ["landmark", ...boxSections],
  table: boxSections,
  list: boxSections,
  overlay: boxSections,
  divider: ["size", "stroke", "appearance"],
  text: ["typography", "size", "fill", "appearance"],
  link: ["link", "typography", "size", "fill", "appearance"],
  input: ["input", "typography", "size", "fill", "stroke", "appearance"],
  image: ["source", "size", "stroke", "appearance"],
  vector: ["source", "size", "appearance"],
  video: ["source", "playback", "size", "stroke", "appearance"],
  audio: ["source", "playback", "size", "appearance"],
  embed: ["source", "size", "stroke", "appearance"]
}

const byTag = new Map(elementTypes.flatMap((type) => elementTypeTags[type].map((tag) => [tag, type] as const)))
const byRole = new Map(elementTypes.flatMap((type) => elementTypeRoles[type].map((role) => [role, type] as const)))

/**
 * The type an element shows as: its `role`'s, when it has one a type lists (the first, as a role can name several),
 * else Overlay with `popover`, else its tag's, else Layout, as a custom element or `address` is.
 */
export function elementType(tag: string, attributes: Readonly<Record<string, string>> = {}): ElementType {
  return typeAndRole(tag, attributes).type
}

/** What the app knows of an element to say what layer it is: its tag and its attributes. */
export interface ElementFacts {
  tag: string
  attributes?: Readonly<Record<string, string>>
}

/** How a layer shows: its type, the type's family, name and icon, what it is within the type, and its panel's sections. */
export interface LayerDefinition {
  type: ElementType
  family: ElementFamily
  /** The type's name, as "Input". */
  name: string
  /**
   * What it is within its type, as the panel's header adds after the name: an input's role or `type`, as "checkbox",
   * else the role or the tag, as "nav" or "button".
   */
  detail: string
  /** The type's icon, by name (see `elementTypeIcons`). */
  icon: LayerIconName
  sections: readonly PanelSection[]
}

/** How an element shows as a layer (see `elementType` for its type). */
export function describeElement(facts: ElementFacts): LayerDefinition {
  const attributes = facts.attributes ?? {}
  const tag = facts.tag.toLowerCase()
  const { type, role } = typeAndRole(tag, attributes)
  const inputType = tag === "input" ? (attributes.type ?? "text") : undefined

  return {
    type,
    family: elementTypeFamilies[type],
    name: elementTypeNames[type],
    detail: role ?? inputType ?? tag,
    icon: elementTypeIcons[type],
    sections: elementTypeSections[type]
  }
}

/** An element's type, and the role that gave it, when one did. */
interface TypedElement {
  type: ElementType
  role?: string
}

function typeAndRole(tag: string, attributes: Readonly<Record<string, string>>): TypedElement {
  for (const role of (attributes.role ?? "").split(/\s+/)) {
    const type = byRole.get(role)

    if (type) {
      return { type, role }
    }
  }

  if (attributes.popover !== undefined) {
    return { type: "overlay" }
  }

  return { type: byTag.get(tag.toLowerCase()) ?? "layout" }
}
